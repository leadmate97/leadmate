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
  const [customerCount, setCustomerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState<PlanCode | null>(null);
  const [registering, setRegistering] = useState(false);
  const [cancelSaving, setCancelSaving] = useState(false);

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
    setRegistering(true); setMessage("");
    try {
      if (!window.TossPayments) throw new Error("토스페이먼츠 SDK를 불러오지 못했습니다.");
      const response = await fetch("/api/billing/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: settings.business_id })
      });
      const setup = await response.json();
      if (!response.ok) throw new Error(setup.error || "결제수단 등록 준비 실패");

      const tossPayments = window.TossPayments(setup.clientKey);
      const payment = tossPayments.payment({ customerKey: setup.customerKey });
      await payment.requestBillingAuth({
        method: "CARD",
        successUrl: setup.successUrl,
        failUrl: setup.failUrl
      });
    } catch (error: any) {
      setMessage(error?.message || "결제수단 등록을 시작하지 못했습니다.");
      setRegistering(false);
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
    <Script src="https://js.tosspayments.com/v2/standard" strategy="afterInteractive" />

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
        {!billingStatus?.configured && <p className="billing-warning">Vercel 환경변수에 Toss Payments 키와 Supabase service-role 키 설정이 필요합니다.</p>}
      </div>
      <button className="button primary" disabled={registering || !billingStatus?.configured} onClick={registerCard}>
        {registering ? "등록창 여는 중..." : card ? "카드 변경" : "카드 등록"}
      </button>
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
