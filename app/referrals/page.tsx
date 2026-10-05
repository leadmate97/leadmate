"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/client";
import { useBusinessSettings } from "@/lib/useBusinessSettings";
import { formatWon, getPlan, type PlanCode } from "@/lib/subscription";

type ReferralRow = {
  id: string;
  referred_business_id: string;
  referrer_discount_applied: boolean;
  created_at: string;
};

type SubscriptionRow = {
  plan_code: PlanCode;
  pending_plan_code: PlanCode | null;
};

export default function ReferralsPage() {
  const { settings, loading: settingsLoading } = useBusinessSettings();
  const [referralCode, setReferralCode] = useState("");
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [credit, setCredit] = useState(0);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (settingsLoading || !settings) return;
    (async () => {
      const supabase = createClient();
      const [{ data: business }, { data: referralRows }, { data: balanceRows }, { data: sub }] = await Promise.all([
        supabase.from("businesses").select("referral_code").eq("id", settings.business_id).single(),
        supabase.from("referrals").select("id,referred_business_id,referrer_discount_applied,created_at").eq("referrer_business_id", settings.business_id).order("created_at", { ascending: false }),
        supabase.from("referral_credit_balance").select("balance_cents").eq("business_id", settings.business_id).maybeSingle(),
        supabase.from("business_subscriptions").select("plan_code,pending_plan_code").eq("business_id", settings.business_id).maybeSingle()
      ]);
      setReferralCode(business?.referral_code || "");
      setReferrals((referralRows as ReferralRow[] | null) || []);
      setCredit(Number(balanceRows?.balance_cents || 0));
      setSubscription((sub as SubscriptionRow | null) || null);
      setLoading(false);
    })();
  }, [settings, settingsLoading]);

  const plan = useMemo(() => getPlan(subscription?.pending_plan_code || subscription?.plan_code), [subscription]);
  const appliedCredit = Math.min(credit, plan.priceMonthly);
  const expectedCharge = Math.max(plan.priceMonthly - appliedCredit, 0);
  const carryOver = Math.max(credit - plan.priceMonthly, 0);
  const confirmedReferrals = referrals.filter((r) => r.referrer_discount_applied).length;

  async function copyCode() {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  if (settingsLoading || loading || !settings) return <AppShell><p>추천 현황을 불러오는 중...</p></AppShell>;

  return <AppShell>
    <div className="page-head">
      <div>
        <p className="eyebrow">REFERRAL</p>
        <h1>지인 추천</h1>
        <p>지인에게 LeadMate를 소개하고 구독료에 사용할 수 있는 크레딧을 적립하세요.</p>
      </div>
    </div>

    <section className="panel referral-hero">
      <div>
        <span className="billing-kicker">내 추천 ID</span>
        <div className="referral-code-row">
          <strong className="referral-code">{referralCode || "생성 중"}</strong>
          <button className="button ghost" type="button" onClick={copyCode}>{copied ? "복사됨" : "ID 복사"}</button>
        </div>
        <p>신규 가입자는 이 ID를 입력하면 첫 유료 구독에서 10,000원 할인됩니다.</p>
      </div>
      <div className="referral-rule">
        <strong>추천 보상</strong>
        <span>추천받은 사용자의 첫 유료 결제 완료 시</span>
        <b>5,000원 크레딧 적립</b>
      </div>
    </section>

    <section className="referral-stats">
      <article className="panel"><span>추천 가입자</span><strong>{referrals.length}명</strong></article>
      <article className="panel"><span>보상 확정</span><strong>{confirmedReferrals}명</strong></article>
      <article className="panel"><span>사용 가능 크레딧</span><strong>{formatWon(credit)}</strong></article>
      <article className="panel"><span>다음 결제 예상</span><strong>{formatWon(expectedCharge)}</strong></article>
    </section>

    <section className="panel credit-preview">
      <div>
        <span>선택 요금제</span>
        <strong>{plan.name} · {formatWon(plan.priceMonthly)}/월</strong>
      </div>
      <div>
        <span>다음 구독료 차감 예정</span>
        <strong>- {formatWon(appliedCredit)}</strong>
      </div>
      <div>
        <span>예상 결제금액</span>
        <strong>{formatWon(expectedCharge)}</strong>
      </div>
      <div>
        <span>다음 달 이월</span>
        <strong>{formatWon(carryOver)}</strong>
      </div>
    </section>

    <section className="panel">
      <h2>추천 내역</h2>
      {referrals.length === 0
        ? <p className="muted-text">아직 추천 가입자가 없습니다. 추천 ID를 공유해보세요.</p>
        : <div className="referral-list">
            {referrals.map((r, index) => <div className="referral-item" key={r.id}>
              <div><strong>추천 #{referrals.length - index}</strong><span>{new Date(r.created_at).toLocaleDateString("ko-KR")}</span></div>
              <span className={r.referrer_discount_applied ? "credit-confirmed" : "credit-pending"}>
                {r.referrer_discount_applied ? "5,000원 적립 완료" : "첫 결제 대기"}
              </span>
            </div>)}
          </div>}
    </section>
  </AppShell>;
}
