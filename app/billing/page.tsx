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
  next_billing_at?: string | null;
  cancel_at_period_end: boolean;
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

type AccessState = {
  accessAllowed: boolean;
  freeOverride: boolean;
  status: string;
  nextBillingAt: string | null;
  billingFailures: number;
};

type AdminRow = {
  business_id: string;
  plan_code: string;
  status: string;
  next_billing_at: string | null;
  last_payment_amount: number | null;
  billing_failures: number;
  business: { id: string; name: string; referral_code: string | null } | null;
};

export default function BillingPage() {
  const { settings, loading: settingsLoading } = useBusinessSettings();

  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [accessState, setAccessState] = useState<AccessState | null>(null);
  const [customerCount, setCustomerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState<PlanCode | null>(null);
  const [registering, setRegistering] = useState(false);
  const [cancelSaving, setCancelSaving] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);

  // 관리자 전용 상태
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [adminRows, setAdminRows] = useState<AdminRow[]>([]);
  const [adminSelected, setAdminSelected] = useState("");
  const [adminDiscount, setAdminDiscount] = useState("10000");
  const [adminReason, setAdminReason] = useState("관리자 설정");
  const [adminMessage, setAdminMessage] = useState("");
  const [adminSaving, setAdminSaving] = useState(false);

  async function loadBillingStatus(businessId: string) {
    const response = await fetch(`/api/billing/status?businessId=${encodeURIComponent(businessId)}`, { cache: "no-store" });
    const result = await response.json();
    if (response.ok) setBillingStatus(result);
  }

  async function loadAdminRows() {
    const response = await fetch("/api/admin/subscriptions", { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json();
    const rows = result.rows || [];
    setAdminRows(rows);
    if (!adminSelected && rows[0]) setAdminSelected(rows[0].business_id);
  }

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/admin/me", { cache: "no-store" });
        const result = await response.json();
        setIsAdmin(Boolean(result.isAdmin));
        setAdminRole(result.role || null);
        if (result.isAdmin) await loadAdminRows();
      } catch {
        setIsAdmin(false);
      }
    })();
  }, []);

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

      setLoading(false);
    })();
  }, [settings, settingsLoading]);

  const activePlan = useMemo(
    () => getPlan(subscription?.pending_plan_code || subscription?.plan_code),
    [subscription]
  );

  const trialLeft = daysRemaining(subscription?.trial_ends_at);

  async function choosePlan(code: PlanCode) {
    if (!settings || !subscription) return;
    setSaving(code);
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase
      .from("business_subscriptions")
      .update({ pending_plan_code: code })
      .eq("business_id", settings.business_id);

    if (error) {
      setMessage(error.message);
    } else {
      setSubscription({ ...subscription, pending_plan_code: code });
      setMessage(`${getPlan(code).name} 요금제를 선택했습니다. 다음 결제부터 적용됩니다.`);
    }
    setSaving(null);
  }

  async function registerCard() {
    if (!settings) return;

    setRegistering(true);
    setMessage("");

    try {
      if (!sdkLoaded || !window.TossPayments) {
        throw new Error("결제 모듈을 불러오는 중입니다. 잠시 후 다시 시도해주세요.");
      }

      const response = await fetch("/api/billing/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: settings.business_id })
      });

      const setup = await response.json();
      if (!response.ok) throw new Error(setup.error || "카드 등록 준비에 실패했습니다.");

      const tossPayments = window.TossPayments(setup.clientKey);
      const payment = tossPayments.payment({ customerKey: setup.customerKey });

      await payment.requestBillingAuth({
        method: "CARD",
        successUrl: setup.successUrl,
        failUrl: setup.failUrl
      });
    } catch (error: any) {
      setMessage(error?.message || "카드 등록을 시작하지 못했습니다.");
      setRegistering(false);
    }
  }

  async function toggleCancel() {
    if (!settings || !subscription) return;
    setCancelSaving(true);
    setMessage("");

    const nextValue = !subscription.cancel_at_period_end;

    const response = await fetch("/api/billing/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId: settings.business_id, cancel: nextValue })
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(result.error || "구독 설정 변경에 실패했습니다.");
    } else {
      setSubscription({ ...subscription, cancel_at_period_end: nextValue });
      setMessage(nextValue ? "현재 이용기간 종료 후 자동결제를 해지합니다." : "자동결제를 다시 유지합니다.");
    }

    setCancelSaving(false);
  }

  async function applyAdminOverride(action: "free" | "discount" | "clear_overrides") {
    if (!adminSelected) return;

    setAdminSaving(true);
    setAdminMessage("");

    const response = await fetch("/api/admin/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId: adminSelected,
        action,
        amountCents: action === "discount" ? Number(adminDiscount) : undefined,
        reason: adminReason
      })
    });

    const result = await response.json();

    if (!response.ok) {
      setAdminMessage(result.error || "관리자 설정에 실패했습니다.");
    } else {
      setAdminMessage(
        action === "free"
          ? "무료 이용 특권을 부여했습니다."
          : action === "discount"
            ? "할인을 부여했습니다."
            : "관리자 특권을 해제했습니다."
      );
      await loadAdminRows();
    }

    setAdminSaving(false);
  }

  if (settingsLoading || loading || !settings) {
    return <AppShell><p>구독 정보를 불러오는 중...</p></AppShell>;
  }

  const card = billingStatus?.paymentMethod;
  const nextBillingAt = billingStatus?.subscription?.next_billing_at || subscription?.trial_ends_at;
  const billingFailures = accessState?.billingFailures || 0;

  const adminStats = {
    total: adminRows.length,
    active: adminRows.filter((row) => row.status === "active").length,
    trialing: adminRows.filter((row) => row.status === "trialing").length,
    pastDue: adminRows.filter((row) => row.status === "past_due").length
  };

  return <AppShell>
    <Script
      src="https://js.tosspayments.com/v2/standard"
      strategy="afterInteractive"
      onLoad={() => setSdkLoaded(Boolean(window.TossPayments))}
      onError={() => setSdkLoaded(false)}
    />

    <div className="page-head">
      <div>
        <p className="eyebrow">SUBSCRIPTION</p>
        <h1>요금제 및 구독</h1>
        <p>7일 무료 체험 후 등록된 카드로 매월 자동결제됩니다. 추천 크레딧은 결제 전에 자동 차감됩니다.</p>
      </div>
    </div>

    <section className="referral-promo panel">
      <div>
        <strong>지인 추천으로 구독료 절약</strong>
        <p>신규 가입자는 첫 구독 10,000원 할인, 추천한 기존 사용자는 5,000원 크레딧을 적립합니다.</p>
      </div>
      <Link className="button ghost" href="/referrals">내 추천 현황 보기</Link>
    </section>

    <section className="billing-summary panel">
      <div>
        <span className="billing-kicker">현재 상태</span>
        <h2>
          {subscription?.status === "trialing"
            ? `7일 무료 체험 · ${trialLeft}일 남음`
            : subscription?.status === "active"
              ? "구독 중"
              : subscription?.status === "past_due"
                ? "결제 확인 필요"
                : "구독 종료"}
        </h2>
        <p>{settings.business_name || "내 비즈니스"} · 선택 요금제 <strong>{activePlan.name}</strong></p>
        {nextBillingAt && <p className="muted-text">다음 결제 예정일 {new Date(nextBillingAt).toLocaleDateString("ko-KR")}</p>}
      </div>

      <div className="usage-box">
        <span>고객 사용량</span>
        <strong>{customerCount.toLocaleString("ko-KR")} / {activePlan.customerLimit.toLocaleString("ko-KR")}</strong>
        <div className="usage-track">
          <i style={{ width: `${Math.min(100, (customerCount / activePlan.customerLimit) * 100)}%` }} />
        </div>
      </div>
    </section>

    {message && <p className="notice billing-notice">{message}</p>}

    <section className="panel payment-method-panel">
      <div>
        <span className="billing-kicker">자동결제 수단</span>
        {card ? <>
          <h2>카드 등록 완료</h2>
          <p>{card.card_number_masked || "등록된 카드"} {card.card_issuer_code ? `· ${card.card_issuer_code}` : ""}</p>
        </> : <>
          <h2>결제수단을 등록해주세요</h2>
          <p>무료 체험 종료 후 선택한 요금제로 자동결제됩니다.</p>
        </>}
      </div>

      <button className="button primary" disabled={registering} onClick={registerCard}>
        {registering ? "등록창 여는 중..." : card ? "카드 변경" : "카드 등록"}
      </button>
    </section>

    {billingFailures > 0 && (
      <section className="panel billing-failure-warning">
        <div>
          <strong>자동결제 확인이 필요합니다.</strong>
          <p>최근 결제 실패가 있습니다. 카드 정보 또는 한도를 확인해주세요.</p>
        </div>
        <Link className="button ghost" href="/billing/history">결제내역 확인</Link>
      </section>
    )}

    <section className="panel billing-links">
      <div>
        <strong>결제 관리</strong>
        <p>최근 결제내역과 추천 할인·크레딧 적용 결과를 확인할 수 있습니다.</p>
      </div>
      <Link className="button ghost" href="/billing/history">결제내역 보기</Link>
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

          <button
            className={selected ? "button ghost full" : "button primary full"}
            disabled={selected || saving !== null}
            onClick={() => choosePlan(plan.code)}
          >
            {selected ? "선택됨" : saving === plan.code ? "저장 중..." : "이 요금제 선택"}
          </button>
        </article>;
      })}
    </section>

    <section className="panel billing-next">
      <div>
        <strong>{subscription?.cancel_at_period_end ? "자동결제 해지 예정" : "자동결제 관리"}</strong>
        <p>
          {subscription?.cancel_at_period_end
            ? "현재 이용기간이 끝나면 다음 결제가 진행되지 않습니다."
            : "해지하더라도 현재 결제기간 종료일까지 이용할 수 있습니다."}
        </p>
      </div>

      <button className="button ghost" disabled={cancelSaving} onClick={toggleCancel}>
        {cancelSaving ? "처리 중..." : subscription?.cancel_at_period_end ? "자동결제 유지" : "기간 종료 후 해지"}
      </button>
    </section>

    {/* 관리자 계정에서만 보이는 영역 */}
    {isAdmin && (
      <section className="admin-console panel">
        <div className="admin-console-head">
          <div>
            <span className="billing-kicker">LEADMATE ADMIN</span>
            <h2>구독 관리자</h2>
            <p>이 영역은 관리자 계정에서만 표시됩니다. 현재 권한: <strong>{adminRole}</strong></p>
          </div>
          <span className="admin-only-badge">관리자 전용</span>
        </div>

        <div className="admin-sub-stats embedded">
          <article><span>전체</span><strong>{adminStats.total}</strong></article>
          <article><span>구독 중</span><strong>{adminStats.active}</strong></article>
          <article><span>체험 중</span><strong>{adminStats.trialing}</strong></article>
          <article><span>미결제</span><strong>{adminStats.pastDue}</strong></article>
        </div>

        <div className="admin-override-grid">
          <label>사업장
            <select value={adminSelected} onChange={(e) => setAdminSelected(e.target.value)}>
              {adminRows.map((row) => (
                <option key={row.business_id} value={row.business_id}>
                  {row.business?.name || row.business_id}
                </option>
              ))}
            </select>
          </label>

          <label>할인 금액
            <input type="number" value={adminDiscount} onChange={(e) => setAdminDiscount(e.target.value)} />
          </label>

          <label>사유
            <input value={adminReason} onChange={(e) => setAdminReason(e.target.value)} />
          </label>
        </div>

        {adminMessage && <p className="notice">{adminMessage}</p>}

        <div className="button-row">
          <button className="button primary" disabled={adminSaving} onClick={() => applyAdminOverride("free")}>무료 이용 부여</button>
          <button className="button ghost" disabled={adminSaving} onClick={() => applyAdminOverride("discount")}>할인 부여</button>
          <button className="button ghost" disabled={adminSaving} onClick={() => applyAdminOverride("clear_overrides")}>특권 해제</button>
        </div>

        <div className="admin-sub-list compact-list">
          {adminRows.slice(0, 10).map((row) => (
            <article key={row.business_id} className="admin-sub-row">
              <div>
                <strong>{row.business?.name || "사업장"}</strong>
                <span>{row.business?.referral_code || "-"}</span>
              </div>
              <div><span>요금제</span><strong>{row.plan_code}</strong></div>
              <div><span>상태</span><strong>{row.status}</strong></div>
              <div><span>다음 결제</span><strong>{row.next_billing_at ? new Date(row.next_billing_at).toLocaleDateString("ko-KR") : "-"}</strong></div>
              <div><span>최근 결제</span><strong>{formatWon(Number(row.last_payment_amount || 0))}</strong></div>
              <div><span>실패</span><strong>{row.billing_failures}회</strong></div>
            </article>
          ))}
        </div>

        <div className="admin-console-footer">
          <Link className="button ghost" href="/admin/subscriptions">관리자 전체 화면 열기</Link>
        </div>
      </section>
    )}
  </AppShell>;
}
