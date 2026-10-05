"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/client";
import { useBusinessSettings } from "@/lib/useBusinessSettings";
import { PLAN_CATALOG, daysRemaining, formatWon, getPlan, type PlanCode, type SubscriptionStatus } from "@/lib/subscription";

type SubscriptionRow = {
  business_id: string;
  plan_code: PlanCode;
  pending_plan_code: PlanCode | null;
  status: SubscriptionStatus;
  trial_ends_at: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export default function BillingPage() {
  const { settings, loading: settingsLoading } = useBusinessSettings();
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [customerCount, setCustomerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState<PlanCode | null>(null);

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
      setMessage(`${getPlan(code).name} 요금제를 선택했습니다. 실제 결제 연동 전까지 요금은 청구되지 않습니다.`);
    }
    setSaving(null);
  }

  if (settingsLoading || loading || !settings) return <AppShell><p>구독 정보를 불러오는 중...</p></AppShell>;

  return <AppShell>
    <div className="page-head">
      <div>
        <p className="eyebrow">SUBSCRIPTION</p>
        <h1>요금제 및 구독</h1>
        <p>7일 무료 체험 후 개인형 또는 팀·사업장형 요금제를 선택할 수 있습니다. 현재는 실제 결제 연동 전 준비 단계입니다.</p>
      </div>
    </div>

    <section className="referral-promo panel">
      <div><strong>지인 추천으로 구독료 절약</strong><p>신규 가입자는 첫 구독 10,000원 할인, 추천한 기존 사용자는 5,000원 크레딧을 적립합니다.</p></div>
      <Link className="button ghost" href="/referrals">내 추천 현황 보기</Link>
    </section>

    <section className="billing-summary panel">
      <div>
        <span className="billing-kicker">현재 상태</span>
        <h2>{subscription?.status === "trialing" ? `7일 무료 체험 · ${trialLeft}일 남음` : subscription?.status === "active" ? "구독 중" : "구독 확인 필요"}</h2>
        <p>{settings.business_name || "내 비즈니스"} · 선택 요금제 <strong>{activePlan.name}</strong></p>
      </div>
      <div className="usage-box">
        <span>고객 사용량</span>
        <strong>{customerCount.toLocaleString("ko-KR")} / {activePlan.customerLimit.toLocaleString("ko-KR")}</strong>
        <div className="usage-track"><i style={{ width: `${Math.min(100, (customerCount / activePlan.customerLimit) * 100)}%` }} /></div>
      </div>
    </section>

    {message && <p className="notice billing-notice">{message}</p>}

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
            {selected ? "선택됨" : saving === plan.code ? "저장 중..." : "이 요금제로 준비"}
          </button>
        </article>;
      })}
    </section>

    <section className="panel billing-next">
      <div><strong>다음 단계</strong><p>V2.4에서 실제 정기결제 PG를 연결하고, 결제 성공/실패/해지 상태를 자동 반영할 예정입니다.</p></div>
      <button className="button ghost" disabled>결제 연동 준비 중</button>
    </section>
  </AppShell>;
}
