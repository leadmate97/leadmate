"use client";

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

type ReferralRow = {
  id: string;
  referred_business_id: string;
  referrer_discount_applied: boolean;
  created_at: string;
};

type Tx = {
  id: string;
  order_id: string;
  amount_cents: number;
  discount_cents: number;
  credit_applied_cents: number;
  status: string;
  scheduled_for: string;
  paid_at: string | null;
  error_code: string | null;
  error_message: string | null;
};

const TX_STATUS: Record<string,string> = {
  processing: "처리 중",
  paid: "결제 완료",
  credit_only: "크레딧 결제",
  failed: "결제 실패",
  canceled: "취소"
};

export default function BillingPage() {
  const { settings, loading: settingsLoading } = useBusinessSettings();

  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [customerCount, setCustomerCount] = useState(0);
  const [referralCode, setReferralCode] = useState("");
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [credit, setCredit] = useState(0);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState<PlanCode | null>(null);
  const [registering, setRegistering] = useState(false);
  const [cancelSaving, setCancelSaving] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (settingsLoading || !settings) return;

    (async () => {
      const supabase = createClient();

      const [
        { data: sub },
        { count },
        { data: business },
        { data: referralRows },
        { data: balanceRow },
        historyResponse,
        statusResponse
      ] = await Promise.all([
        supabase.from("business_subscriptions").select("*").eq("business_id", settings.business_id).maybeSingle(),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", settings.business_id),
        supabase.from("businesses").select("referral_code").eq("id", settings.business_id).single(),
        supabase.from("referrals")
          .select("id,referred_business_id,referrer_discount_applied,created_at")
          .eq("referrer_business_id", settings.business_id)
          .order("created_at", { ascending: false }),
        supabase.from("referral_credit_balance").select("balance_cents").eq("business_id", settings.business_id).maybeSingle(),
        fetch(`/api/billing/history?businessId=${encodeURIComponent(settings.business_id)}`, { cache: "no-store" }),
        fetch(`/api/billing/status?businessId=${encodeURIComponent(settings.business_id)}`, { cache: "no-store" })
      ]);

      setSubscription((sub as SubscriptionRow | null) ?? null);
      setCustomerCount(count ?? 0);
      setReferralCode(business?.referral_code || "");
      setReferrals((referralRows as ReferralRow[] | null) || []);
      setCredit(Number(balanceRow?.balance_cents || 0));

      try {
        const history = await historyResponse.json();
        if (historyResponse.ok) setTransactions(history.transactions || []);
      } catch {}

      try {
        const status = await statusResponse.json();
        if (statusResponse.ok) setBillingStatus(status);
      } catch {}

      setLoading(false);
    })();
  }, [settings, settingsLoading]);

  const activePlan = useMemo(
    () => getPlan(subscription?.pending_plan_code || subscription?.plan_code),
    [subscription]
  );

  const trialLeft = daysRemaining(subscription?.trial_ends_at);
  const card = billingStatus?.paymentMethod;
  const nextBillingAt = billingStatus?.subscription?.next_billing_at || subscription?.trial_ends_at;
  const billingDaysLeft = nextBillingAt
    ? Math.ceil((new Date(nextBillingAt).getTime() - Date.now()) / 86400000)
    : null;
  const appliedCredit = Math.min(credit, activePlan.priceMonthly);
  const expectedCharge = Math.max(activePlan.priceMonthly - appliedCredit, 0);
  const carryOver = Math.max(credit - activePlan.priceMonthly, 0);
  const confirmedReferrals = referrals.filter((r) => r.referrer_discount_applied).length;

  async function copyReferralCode() {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {}
  }

  async function choosePlan(code: PlanCode) {
    if (!settings || !subscription) return;
    setSaving(code);
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase
      .from("business_subscriptions")
      .update({ pending_plan_code: code })
      .eq("business_id", settings.business_id);

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

    if (!response.ok) setMessage(result.error || "구독 설정 변경에 실패했습니다.");
    else {
      setSubscription({ ...subscription, cancel_at_period_end: nextValue });
      setMessage(nextValue ? "현재 이용기간 종료 후 자동결제를 해지합니다." : "자동결제를 다시 유지합니다.");
    }

    setCancelSaving(false);
  }

  if (settingsLoading || loading || !settings) {
    return <AppShell><p>구독 정보를 불러오는 중...</p></AppShell>;
  }

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
        <h1>구독 관리</h1>
        <p>요금제, 결제내역, 지인추천 혜택을 한 곳에서 관리합니다.</p>
      </div>
    </div>

    {message && <p className="notice billing-notice">{message}</p>}

    {billingDaysLeft !== null && billingDaysLeft >= 0 && billingDaysLeft <= 3 && (
      <section className="panel billing-upcoming">
        <div>
          <span className="billing-kicker">결제 예정 안내</span>
          <strong>{billingDaysLeft === 0 ? "오늘" : `${billingDaysLeft}일 후`} 자동결제 예정</strong>
          <p>등록된 카드와 추천 크레딧을 기준으로 결제가 처리됩니다.</p>
        </div>
      </section>
    )}

    <section className="subscription-overview-grid">
      <article className="panel subscription-summary-card">
        <span className="billing-kicker">현재 구독</span>
        <h2>
          {subscription?.status === "trialing"
            ? `7일 무료 체험 · ${trialLeft}일 남음`
            : subscription?.status === "active"
              ? "구독 중"
              : subscription?.status === "past_due"
                ? "결제 확인 필요"
                : "구독 종료"}
        </h2>
        <p>{settings.business_name || "내 비즈니스"} · <strong>{activePlan.name}</strong></p>
        {nextBillingAt && <p className="muted-text">다음 결제 예정일 {new Date(nextBillingAt).toLocaleDateString("ko-KR")}</p>}
        <div className="mini-usage">
          <span>고객 사용량</span>
          <strong>{customerCount.toLocaleString("ko-KR")} / {activePlan.customerLimit.toLocaleString("ko-KR")}</strong>
          <div className="usage-track">
            <i style={{ width: `${Math.min(100, (customerCount / activePlan.customerLimit) * 100)}%` }} />
          </div>
        </div>
      </article>

      <article className="panel subscription-summary-card">
        <span className="billing-kicker">자동결제</span>
        <h2>{card ? "카드 등록 완료" : "결제수단 미등록"}</h2>
        <p>{card ? `${card.card_number_masked || "등록된 카드"} ${card.card_issuer_code ? `· ${card.card_issuer_code}` : ""}` : "무료 체험 종료 전 카드를 등록해주세요."}</p>
        <button className="button primary" disabled={registering} onClick={registerCard}>
          {registering ? "등록창 여는 중..." : card ? "카드 변경" : "카드 등록"}
        </button>
      </article>

      <article className="panel subscription-summary-card">
        <span className="billing-kicker">추천 크레딧</span>
        <h2>{formatWon(credit)}</h2>
        <p>다음 결제 예상 {formatWon(expectedCharge)} · 이월 {formatWon(carryOver)}</p>
        <div className="referral-mini-id">
          <span>내 추천 ID</span>
          <strong>{referralCode || "-"}</strong>
          <button className="button ghost tiny" onClick={copyReferralCode}>{copied ? "복사됨" : "복사"}</button>
        </div>
      </article>
    </section>

    <section className="panel unified-section">
      <div className="section-head">
        <div><span className="billing-kicker">PLAN</span><h2>요금제</h2></div>
      </div>

      <div className="pricing-grid">
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
      </div>
    </section>

    <section className="panel unified-section">
      <div className="section-head">
        <div><span className="billing-kicker">REFERRAL</span><h2>지인추천</h2></div>
        <div className="referral-summary-inline">
          <span>추천 가입 {referrals.length}명</span>
          <span>보상 확정 {confirmedReferrals}명</span>
          <strong>사용 가능 {formatWon(credit)}</strong>
        </div>
      </div>

      <div className="referral-combined-grid">
        <div className="referral-main-card">
          <span>내 추천 ID</span>
          <strong>{referralCode || "-"}</strong>
          <button className="button ghost" onClick={copyReferralCode}>{copied ? "복사됨" : "추천 ID 복사"}</button>
        </div>

        <div className="referral-benefit-card">
          <strong>추천 혜택</strong>
          <p>신규 가입자는 첫 유료 구독 10,000원 할인</p>
          <p>추천한 기존 사용자는 첫 결제 완료 시 5,000원 크레딧 적립</p>
          <p>크레딧은 구독료에서 자동 차감되고 남는 금액은 다음 달로 이월됩니다.</p>
        </div>
      </div>
    </section>

    <section className="panel unified-section">
      <div className="section-head">
        <div><span className="billing-kicker">HISTORY</span><h2>결제내역</h2></div>
        <span className="muted-text">최근 {Math.min(transactions.length, 5)}건</span>
      </div>

      {transactions.length === 0 ? (
        <p className="muted-text">아직 결제내역이 없습니다.</p>
      ) : (
        <div className="billing-history-list">
          {transactions.slice(0, 5).map((row) => (
            <article key={row.id} className="billing-history-item">
              <div>
                <strong>{TX_STATUS[row.status] || row.status}</strong>
                <span>{new Date(row.paid_at || row.scheduled_for).toLocaleString("ko-KR")}</span>
                <small>{row.order_id}</small>
              </div>
              <div className="billing-history-money">
                <strong>{formatWon(row.amount_cents)}</strong>
                {row.discount_cents > 0 && <span>추천 할인 -{formatWon(row.discount_cents)}</span>}
                {row.credit_applied_cents > 0 && <span>크레딧 -{formatWon(row.credit_applied_cents)}</span>}
              </div>
              {row.status === "failed" && (
                <div className="billing-history-error">
                  {row.error_code && <code>{row.error_code}</code>}
                  <span>{row.error_message || "결제 실패"}</span>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
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
  </AppShell>;
}
