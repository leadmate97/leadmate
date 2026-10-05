"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/client";
import { useBusinessSettings } from "@/lib/useBusinessSettings";
import { PLAN_CATALOG, daysRemaining, formatWon, getPlan, type PlanCode, type SubscriptionStatus } from "@/lib/subscription";

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => {
      payment: (params: { customerKey: string }) => {
        requestBillingAuth: (params: {
          method: "CARD";
          successUrl: string;
          failUrl: string;
        }) => Promise<void> | void;
      };
    };
  }
}

type SubscriptionRow = {
  business_id: string;
  plan_code: PlanCode;
  pending_plan_code: PlanCode | null;
  status: SubscriptionStatus;
  trial_ends_at: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};


type AccessState = {
  accessAllowed: boolean;
  freeOverride: boolean;
  status: string;
  nextBillingAt: string | null;
  billingFailures: number;
};

type BillingDiagnostics = {
  configured: boolean;
  checks: {
    tossClientKey: boolean;
    tossSecretKey: boolean;
    supabaseServiceRoleKey: boolean;
    cronSecret: boolean;
    tossPairMatches: boolean;
  };
  keyTypes: {
    tossClient: string;
    tossSecret: string;
    supabaseServiceRole: string;
    cronSecret: string;
  };
  environment: string;
  warnings: string[];
};


type AccessDiagnostics = {
  ok: boolean;
  authUser: boolean;
  userMembership: boolean;
  userRole: string | null;
  serviceRoleConnection: boolean;
  subscriptionFound: boolean;
  code: string | null;
  error: string | null;
};

type CardRegisterStep = {
  at: string;
  stage: string;
  ok: boolean;
  detail?: string;
};

type BillingStatus = {
  configured: boolean;
  paymentMethod: null | {
    method: string | null;
    card_issuer_code: string | null;
    card_number_masked: string | null;
    authenticated_at: string | null;
    active: boolean;
  };
  subscription: null | {
    status: SubscriptionStatus;
    next_billing_at: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    last_payment_at: string | null;
    last_payment_amount: number | null;
    billing_failures: number;
  };
};

export default function BillingPage() {
  const { settings, loading: settingsLoading } = useBusinessSettings();
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [accessState, setAccessState] = useState<AccessState | null>(null);
  const [charging, setCharging] = useState(false);
  const [diagnostics, setDiagnostics] = useState<BillingDiagnostics | null>(null);
  const [accessDiagnostics, setAccessDiagnostics] = useState<AccessDiagnostics | null>(null);
  const [customerCount, setCustomerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState<PlanCode | null>(null);
  const [registering, setRegistering] = useState(false);
  const [cancelSaving, setCancelSaving] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [sdkLoadError, setSdkLoadError] = useState(false);
  const [cardRegisterSteps, setCardRegisterSteps] = useState<CardRegisterStep[]>([]);
  const [lastCardError, setLastCardError] = useState<{ code?: string; name?: string; message: string } | null>(null);

  function addCardStep(stage: string, ok: boolean, detail?: string) {
    setCardRegisterSteps((prev) => [
      ...prev.slice(-7),
      { at: new Date().toLocaleTimeString("ko-KR"), stage, ok, detail }
    ]);
  }

  async function loadBillingStatus(businessId: string) {
    const response = await fetch(`/api/billing/status?businessId=${encodeURIComponent(businessId)}`, { cache: "no-store" });
    const result = await response.json();
    if (response.ok) setBillingStatus(result);
  }

  useEffect(() => {
    if (settingsLoading || !settings) return;
    (async () => {
      const supabase = createClient();
      const [{ data: sub }, { count }] = await Promise.all([
        supabase.from("business_subscriptions").select("*").eq("business_id", settings.business_id).maybeSingle(),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", settings.business_id)
      ]);
      setSubscription((sub as SubscriptionRow | null) ?? null);
      setCustomerCount(count ?? 0);
      await loadBillingStatus(settings.business_id);
      try {
        const accessResponse = await fetch(`/api/billing/access?businessId=${encodeURIComponent(settings.business_id)}`, { cache: "no-store" });
        const accessResult = await accessResponse.json();
        if (accessResponse.ok) setAccessState(accessResult);
      } catch {}
      try {
        const [diagResponse, accessResponse] = await Promise.all([
          fetch("/api/billing/diagnostics", { cache: "no-store" }),
          fetch(`/api/billing/access-diagnostics?businessId=${encodeURIComponent(settings.business_id)}`, { cache: "no-store" })
        ]);
        const diagResult = await diagResponse.json();
        const accessResult = await accessResponse.json();
        if (diagResponse.ok) setDiagnostics(diagResult);
        setAccessDiagnostics(accessResult);
      } catch {}
      setLoading(false);
    })();
  }, [settings, settingsLoading]);

  const activePlan = useMemo(() => getPlan(subscription?.pending_plan_code || subscription?.plan_code), [subscription]);
  const trialLeft = daysRemaining(subscription?.trial_ends_at);

  async function choosePlan(code: PlanCode) {
    if (!settings || !subscription) return;
    setSaving(code); setMessage("");
    const supabase = createClient();
    const { error } = await supabase.from("business_subscriptions").update({ pending_plan_code: code }).eq("business_id", settings.business_id);
    if (error) setMessage(error.message);
    else {
      setSubscription({ ...subscription, pending_plan_code: code });
      setMessage(`${getPlan(code).name} 요금제를 선택했습니다. 다음 결제부터 적용됩니다.`);
    }
    setSaving(null);
  }

  async function registerCard() {
    if (!settings) return;

    setRegistering(true);
    setMessage("");
    setLastCardError(null);
    setCardRegisterSteps([]);

    try {
      addCardStep("버튼 클릭", true, "카드 등록 요청을 시작했습니다.");

      if (!sdkLoaded || !window.TossPayments) {
        addCardStep("Toss SDK", false, sdkLoadError ? "SDK 스크립트 로딩 실패" : "SDK가 아직 준비되지 않음");
        throw Object.assign(new Error("토스페이먼츠 SDK가 아직 준비되지 않았습니다. 페이지를 새로고침한 뒤 다시 시도해주세요."), { code: "SDK_NOT_READY" });
      }
      addCardStep("Toss SDK", true, "window.TossPayments 확인 완료");

      addCardStep("서버 준비 API", true, "customerKey 요청 중");
      const response = await fetch("/api/billing/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: settings.business_id })
      });

      let setup: any = {};
      try {
        setup = await response.json();
      } catch {
        throw Object.assign(new Error(`서버 응답을 JSON으로 읽지 못했습니다. HTTP ${response.status}`), { code: "SETUP_BAD_RESPONSE" });
      }

      if (!response.ok) {
        addCardStep("서버 준비 API", false, `${response.status} · ${setup.error || "오류"}`);
        throw Object.assign(new Error(setup.error || "결제수단 등록 준비 실패"), { code: setup.code || `HTTP_${response.status}` });
      }

      if (!setup.clientKey || !setup.customerKey || !setup.successUrl || !setup.failUrl) {
        addCardStep("서버 준비 API", false, "필수 응답값 누락");
        throw Object.assign(new Error("결제수단 등록에 필요한 서버 응답값이 누락되었습니다."), { code: "SETUP_MISSING_FIELDS" });
      }

      addCardStep("서버 준비 API", true, "clientKey/customerKey/redirect URL 확인 완료");

      let tossPayments: ReturnType<NonNullable<typeof window.TossPayments>>;
      try {
        tossPayments = window.TossPayments(setup.clientKey);
        addCardStep("Toss 초기화", true, "TossPayments(clientKey) 성공");
      } catch (e: any) {
        addCardStep("Toss 초기화", false, e?.message || "초기화 실패");
        throw Object.assign(new Error(e?.message || "토스페이먼츠 초기화에 실패했습니다."), { code: e?.code || "TOSS_INIT_FAILED" });
      }

      let payment: ReturnType<typeof tossPayments.payment>;
      try {
        payment = tossPayments.payment({ customerKey: setup.customerKey });
        addCardStep("Billing 인스턴스", true, "payment(customerKey) 생성 완료");
      } catch (e: any) {
        addCardStep("Billing 인스턴스", false, e?.message || "payment 생성 실패");
        throw Object.assign(new Error(e?.message || "자동결제 인스턴스를 만들지 못했습니다."), { code: e?.code || "PAYMENT_INIT_FAILED" });
      }

      addCardStep("카드 등록창 요청", true, "requestBillingAuth 호출");
      await payment.requestBillingAuth({
        method: "CARD",
        successUrl: setup.successUrl,
        failUrl: setup.failUrl
      });

      // 일반적으로 성공하면 successUrl로 이동하므로 여기까지 남아 있으면 호출은 반환된 상태입니다.
      addCardStep("카드 등록창 요청", true, "SDK 호출이 반환되었습니다.");
    } catch (error: any) {
      const info = {
        code: error?.code || error?.errorCode || undefined,
        name: error?.name || undefined,
        message: error?.message || "결제수단 등록을 시작하지 못했습니다."
      };
      setLastCardError(info);
      setMessage(`${info.code ? `[${info.code}] ` : ""}${info.message}`);
      addCardStep("최종 결과", false, `${info.code ? `${info.code} · ` : ""}${info.message}`);
      setRegistering(false);
    }
  }

  async function testCharge() {
    if (!settings) return;
    setCharging(true); setMessage("");
    try {
      const response = await fetch("/api/billing/charge-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: settings.business_id })
      });
      const result = await response.json();
      if (!response.ok) setMessage(`${result.code ? `[${result.code}] ` : ""}${result.error || "결제 테스트 실패"}`);
      else if (result.skipped) setMessage(`결제 테스트: ${result.reason}`);
      else {
        setMessage(`결제 테스트 완료 · 실제 청구 ${formatWon(result.amountCharged || 0)} · 크레딧 ${formatWon(result.creditApplied || 0)} 적용`);
        await loadBillingStatus(settings.business_id);
      }
    } finally {
      setCharging(false);
    }
  }

  async function toggleCancel() {
    if (!settings || !subscription) return;
    setCancelSaving(true); setMessage("");
    const nextValue = !subscription.cancel_at_period_end;
    const response = await fetch("/api/billing/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId: settings.business_id, cancel: nextValue })
    });
    const result = await response.json();
    if (!response.ok) setMessage(result.error || "구독 설정 변경에 실패했습니다.");
    else {
      setSubscription({ ...subscription, cancel_at_period_end: nextValue });
      setMessage(nextValue ? "현재 이용기간 종료 후 자동결제를 해지합니다." : "자동결제를 다시 유지합니다.");
    }
    setCancelSaving(false);
  }

  if (settingsLoading || loading || !settings) return <AppShell><p>구독 정보를 불러오는 중...</p></AppShell>;

  const card = billingStatus?.paymentMethod;
  const nextBillingAt = billingStatus?.subscription?.next_billing_at || subscription?.trial_ends_at;

  return <AppShell>
    <Script
      src="https://js.tosspayments.com/v2/standard"
      strategy="afterInteractive"
      onLoad={() => {
        setSdkLoaded(Boolean(window.TossPayments));
        setSdkLoadError(false);
      }}
      onError={() => {
        setSdkLoaded(false);
        setSdkLoadError(true);
      }}
    />

    <div className="page-head">
      <div>
        <p className="eyebrow">SUBSCRIPTION</p>
        <h1>요금제 및 구독</h1>
        <p>7일 무료 체험 후 등록된 카드로 매월 자동결제됩니다. 추천 크레딧은 결제 전에 자동 차감됩니다.</p>
      </div>
    </div>

    <section className="referral-promo panel">
      <div><strong>지인 추천으로 구독료 절약</strong><p>신규 가입자는 첫 구독 10,000원 할인, 추천한 기존 사용자는 5,000원 크레딧을 적립합니다.</p></div>
      <Link className="button ghost" href="/referrals">내 추천 현황 보기</Link>
    </section>

    <section className="billing-summary panel">
      <div>
        <span className="billing-kicker">현재 상태</span>
        <h2>{subscription?.status === "trialing" ? `7일 무료 체험 · ${trialLeft}일 남음` : subscription?.status === "active" ? "구독 중" : subscription?.status === "past_due" ? "결제 확인 필요" : "구독 종료"}</h2>
        <p>{settings.business_name || "내 비즈니스"} · 선택 요금제 <strong>{activePlan.name}</strong></p>
        {nextBillingAt && <p className="muted-text">다음 결제 예정일 {new Date(nextBillingAt).toLocaleDateString("ko-KR")}</p>}
      </div>
      <div className="usage-box">
        <span>고객 사용량</span>
        <strong>{customerCount.toLocaleString("ko-KR")} / {activePlan.customerLimit.toLocaleString("ko-KR")}</strong>
        <div className="usage-track"><i style={{ width: `${Math.min(100, (customerCount / activePlan.customerLimit) * 100)}%` }} /></div>
      </div>
    </section>

    {message && <p className="notice billing-notice">{message}</p>}

    <section className="panel payment-method-panel">
      <div>
        <span className="billing-kicker">자동결제 수단</span>
        {card ? <>
          <h2>{card.method || "카드"} 등록 완료</h2>
          <p>{card.card_number_masked || "등록된 카드"} {card.card_issuer_code ? `· ${card.card_issuer_code}` : ""}</p>
        </> : <>
          <h2>결제수단을 등록해주세요</h2>
          <p>무료 체험 종료 후 선택한 요금제로 자동결제됩니다.</p>
        </>}
        {!billingStatus?.configured && <p className="billing-warning">결제 환경변수 확인이 필요합니다.</p>}
        {diagnostics && <div className="billing-diagnostics">
          <div className="diag-title">
            <strong>결제 환경 진단</strong>
            <span>{diagnostics.environment}</span>
          </div>
          <div className="diag-grid">
            <span className={diagnostics.checks.tossClientKey ? "diag-ok" : "diag-bad"}>Toss Client Key {diagnostics.checks.tossClientKey ? "✓" : "✕"}</span>
            <span className={diagnostics.checks.tossSecretKey ? "diag-ok" : "diag-bad"}>Toss Secret Key {diagnostics.checks.tossSecretKey ? "✓" : "✕"}</span>
            <span className={diagnostics.checks.supabaseServiceRoleKey ? "diag-ok" : "diag-bad"}>Supabase Server Key {diagnostics.checks.supabaseServiceRoleKey ? "✓" : "✕"}</span>
            <span className={diagnostics.checks.cronSecret ? "diag-ok" : "diag-bad"}>Cron Secret {diagnostics.checks.cronSecret ? "✓" : "✕"}</span>
            <span className={diagnostics.checks.tossPairMatches ? "diag-ok" : "diag-bad"}>Toss Key Pair {diagnostics.checks.tossPairMatches ? "✓" : "✕"}</span>
          </div>
          {diagnostics.warnings.length > 0 && <div className="diag-warnings">
            {diagnostics.warnings.map((warning) => <p key={warning}>• {warning}</p>)}
          </div>}
        </div>}
      </div>
      <button className="button primary" disabled={registering || !billingStatus?.configured || sdkLoadError} onClick={registerCard}>
        {registering ? "등록창 여는 중..." : card ? "카드 변경" : "카드 등록"}
      </button>
    </section>

    <section className="panel access-diagnostics">
      <div className="card-flow-head">
        <div>
          <span className="billing-kicker">비즈니스 접근 진단</span>
          <h2>로그인·멤버십·서버키 확인</h2>
        </div>
        <span className={accessDiagnostics?.ok ? "diag-ok compact" : "diag-bad compact"}>
          {accessDiagnostics?.ok ? "접근 정상 ✓" : "확인 필요 ✕"}
        </span>
      </div>

      <div className="diag-grid access-grid">
        <span className={accessDiagnostics?.authUser ? "diag-ok" : "diag-bad"}>로그인 세션 {accessDiagnostics?.authUser ? "✓" : "✕"}</span>
        <span className={accessDiagnostics?.userMembership ? "diag-ok" : "diag-bad"}>비즈니스 멤버십 {accessDiagnostics?.userMembership ? "✓" : "✕"}</span>
        <span className={accessDiagnostics?.serviceRoleConnection ? "diag-ok" : "diag-bad"}>Supabase 서버 연결 {accessDiagnostics?.serviceRoleConnection ? "✓" : "✕"}</span>
        <span className={accessDiagnostics?.subscriptionFound ? "diag-ok" : "diag-bad"}>구독 레코드 {accessDiagnostics?.subscriptionFound ? "✓" : "✕"}</span>
      </div>

      {accessDiagnostics?.userRole && <p className="muted-text access-role">현재 역할: <strong>{accessDiagnostics.userRole}</strong></p>}
      {accessDiagnostics?.error && <div className="card-error-box">
        <strong>접근 진단 오류</strong>
        <code>{accessDiagnostics.code || "NO_CODE"}</code>
        <p>{accessDiagnostics.error}</p>
      </div>}
    </section>

    <section className="panel card-flow-diagnostics">
      <div className="card-flow-head">
        <div>
          <span className="billing-kicker">카드 등록 진단</span>
          <h2>등록창 실행 상태</h2>
        </div>
        <span className={sdkLoaded ? "diag-ok compact" : sdkLoadError ? "diag-bad compact" : "diag-wait compact"}>
          Toss SDK {sdkLoaded ? "준비됨 ✓" : sdkLoadError ? "로딩 실패 ✕" : "로딩 중…"}
        </span>
      </div>

      {cardRegisterSteps.length === 0 ? (
        <p className="muted-text">카드 등록 버튼을 누르면 단계별 실행 상태가 여기에 표시됩니다.</p>
      ) : (
        <div className="card-step-list">
          {cardRegisterSteps.map((step, index) => (
            <div className="card-step" key={`${step.at}-${index}`}>
              <span className={step.ok ? "step-dot ok" : "step-dot bad"}>{step.ok ? "✓" : "✕"}</span>
              <div>
                <strong>{step.stage}</strong>
                <span>{step.at}{step.detail ? ` · ${step.detail}` : ""}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {lastCardError && (
        <div className="card-error-box">
          <strong>마지막 오류</strong>
          <code>{lastCardError.code || "NO_CODE"}</code>
          <p>{lastCardError.message}</p>
          {lastCardError.name && <span>{lastCardError.name}</span>}
        </div>
      )}
    </section>

    {accessState && !accessState.accessAllowed && (
      <section className="panel subscription-lock-warning">
        <div><span className="billing-kicker">이용 제한 예정</span><h2>구독 상태를 확인해주세요</h2><p>체험기간 종료 또는 미결제로 인해 일부 기능 제한 대상입니다. 결제수단과 구독상태를 확인해주세요.</p></div>
      </section>
    )}

    {accessState && accessState.billingFailures > 0 && (
      <section className="panel billing-failure-warning">
        <div><strong>최근 자동결제 실패 {accessState.billingFailures}회</strong><p>카드 정보 또는 한도를 확인한 뒤 다시 결제해주세요.</p></div>
        <button className="button primary" disabled={charging} onClick={testCharge}>{charging ? "결제 확인 중..." : "결제 다시 시도"}</button>
      </section>
    )}

    <section className="panel billing-links">
      <div><strong>결제 관리</strong><p>결제내역과 추천 할인·크레딧 적용 결과를 확인할 수 있습니다.</p></div>
      <div className="button-row">
        <Link className="button ghost" href="/billing/history">결제내역 보기</Link>
        <button className="button ghost" disabled={charging} onClick={testCharge}>{charging ? "테스트 중..." : "결제일 확인"}</button>
      </div>
    </section>

    <section className="pricing-grid">
      {PLAN_CATALOG.map((plan) => {
        const selected = activePlan.code === plan.code;
        return <article key={plan.code} className={plan.recommended ? "price-card recommended" : "price-card"}>
          {plan.recommended && <span className="recommend-badge">추천</span>}
          <h2>{plan.name}</h2>
          <div className="price"><strong>{formatWon(plan.priceMonthly)}</strong><span>/월</span></div>
          <p className="plan-limit">고객 {plan.customerLimit.toLocaleString("ko-KR")}명 · 사용자 {plan.memberLimit}명</p>
          <ul>{plan.features.map((feature) => <li key={feature}>✓ {feature}</li>)}</ul>
          <button className={selected ? "button ghost full" : "button primary full"} disabled={selected || saving !== null} onClick={() => choosePlan(plan.code)}>
            {selected ? "선택됨" : saving === plan.code ? "저장 중..." : "이 요금제 선택"}
          </button>
        </article>;
      })}
    </section>

    <section className="panel billing-next">
      <div>
        <strong>{subscription?.cancel_at_period_end ? "자동결제 해지 예정" : "자동결제 관리"}</strong>
        <p>{subscription?.cancel_at_period_end ? "현재 이용기간이 끝나면 다음 결제가 진행되지 않습니다." : "해지하더라도 현재 결제기간 종료일까지 이용할 수 있습니다."}</p>
      </div>
      <button className="button ghost" disabled={cancelSaving} onClick={toggleCancel}>
        {cancelSaving ? "처리 중..." : subscription?.cancel_at_period_end ? "자동결제 유지" : "기간 종료 후 해지"}
      </button>
    </section>
  </AppShell>;
}
