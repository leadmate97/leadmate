import { createClient as createUserClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlan, type PlanCode } from "@/lib/subscription";

export type BusinessAccess = {
  userId: string;
  email: string | null;
  role: string;
};

export async function requireBusinessAccess(businessId: string, ownerOnly = true): Promise<BusinessAccess> {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다.");

  const admin = createAdminClient();
  const { data: member, error } = await admin
    .from("business_members")
    .select("role")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !member) throw new Error("비즈니스 접근 권한이 없습니다.");
  if (ownerOnly && !["owner", "admin"].includes(member.role)) {
    throw new Error("구독 관리 권한이 없습니다.");
  }

  return { userId: user.id, email: user.email ?? null, role: member.role };
}

export function tossAuthHeader() {
  const secret = process.env.TOSS_SECRET_KEY;
  if (!secret) throw new Error("TOSS_SECRET_KEY가 설정되지 않았습니다.");
  return `Basic ${Buffer.from(`${secret}:`).toString("base64")}`;
}

export async function tossRequest(path: string, init: RequestInit) {
  const response = await fetch(`https://api.tosspayments.com${path}`, {
    ...init,
    headers: {
      Authorization: tossAuthHeader(),
      "Content-Type": "application/json",
      ...(init.headers || {})
    },
    cache: "no-store",
    signal: AbortSignal.timeout(65000)
  });

  const text = await response.text();
  let payload: any = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { message: text }; }

  if (!response.ok) {
    const err = new Error(payload?.message || `Toss Payments 오류 (${response.status})`) as Error & { code?: string; status?: number };
    err.code = payload?.code;
    err.status = response.status;
    throw err;
  }
  return payload;
}

function addOneMonth(value: string | Date) {
  const date = new Date(value);
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + 1);
  return result;
}

function makeOrderId(businessId: string) {
  return `LM-${Date.now()}-${businessId.replace(/-/g, "").slice(0, 10)}`;
}

export async function calculateInvoice(businessId: string, planCode: PlanCode) {
  const admin = createAdminClient();
  const plan = getPlan(planCode);

  const [{ data: referral }, { data: ledger }] = await Promise.all([
    admin.from("referrals")
      .select("id,referred_discount_applied")
      .eq("referred_business_id", businessId)
      .maybeSingle(),
    admin.from("referral_credit_ledger")
      .select("amount_cents,status")
      .eq("business_id", businessId)
      .neq("status", "cancelled")
  ]);

  const firstDiscount = referral && !referral.referred_discount_applied ? 10000 : 0;
  const creditBalance = (ledger || []).reduce((sum: number, row: any) => sum + Number(row.amount_cents || 0), 0);
  const afterReferral = Math.max(plan.priceMonthly - firstDiscount, 0);
  const creditToApply = Math.min(Math.max(creditBalance, 0), afterReferral);
  const amountToCharge = Math.max(afterReferral - creditToApply, 0);

  return {
    plan,
    referralId: referral?.id ?? null,
    firstDiscount,
    creditBalance: Math.max(creditBalance, 0),
    creditToApply,
    amountToCharge
  };
}

async function consumeCredit(businessId: string, amount: number, orderId: string) {
  if (amount <= 0) return;
  const admin = createAdminClient();
  const { error } = await admin.from("referral_credit_ledger").insert({
    business_id: businessId,
    entry_type: "invoice_offset",
    amount_cents: -amount,
    status: "used",
    description: `구독료 차감 · ${orderId}`
  });
  if (error) throw error;
}

async function finalizeReferralReward(businessId: string, referralId: string | null) {
  if (!referralId) return;
  const admin = createAdminClient();

  const { data: referral } = await admin
    .from("referrals")
    .select("id,referrer_business_id,referred_discount_applied,referrer_discount_applied")
    .eq("id", referralId)
    .maybeSingle();

  if (!referral) return;

  if (!referral.referred_discount_applied) {
    await admin.from("referrals").update({ referred_discount_applied: true }).eq("id", referralId);
    await admin.from("businesses").update({ referral_discount_cents: 0 }).eq("id", businessId);
  }

  if (!referral.referrer_discount_applied) {
    const { error } = await admin.from("referral_credit_ledger").insert({
      business_id: referral.referrer_business_id,
      referral_id: referralId,
      entry_type: "earn",
      amount_cents: 5000,
      status: "available",
      description: "지인 추천 구독 크레딧"
    });
    if (!error) {
      await admin.from("referrals").update({ referrer_discount_applied: true }).eq("id", referralId);
    }
  }
}

export async function chargeSubscription(businessId: string, force = false) {
  const admin = createAdminClient();

  const { data: subscription, error: subError } = await admin
    .from("business_subscriptions")
    .select("*")
    .eq("business_id", businessId)
    .single();

  if (subError || !subscription) throw new Error("구독 정보를 찾을 수 없습니다.");
  if (subscription.status === "canceled") return { ok: false, skipped: true, reason: "canceled" };

  const dueAt = subscription.next_billing_at || subscription.current_period_end || subscription.trial_ends_at;
  if (!force && dueAt && new Date(dueAt).getTime() > Date.now()) {
    return { ok: false, skipped: true, reason: "not_due" };
  }

  if (subscription.cancel_at_period_end) {
    await admin.from("business_subscriptions").update({
      status: "canceled",
      updated_at: new Date().toISOString()
    }).eq("business_id", businessId);
    return { ok: false, skipped: true, reason: "canceled_at_period_end" };
  }

  const effectivePlanCode = (subscription.pending_plan_code || subscription.plan_code || "personal") as PlanCode;
  const invoice = await calculateInvoice(businessId, effectivePlanCode);
  const orderId = makeOrderId(businessId);
  const scheduledFor = dueAt || new Date().toISOString();

  const { data: existing } = await admin
    .from("billing_transactions")
    .select("id,status")
    .eq("business_id", businessId)
    .eq("scheduled_for", scheduledFor)
    .maybeSingle();

  if (existing && ["paid", "credit_only", "processing"].includes(existing.status)) {
    return { ok: false, skipped: true, reason: "already_processed" };
  }

  let transactionId = existing?.id;
  if (!transactionId) {
    const { data: created, error } = await admin.from("billing_transactions").insert({
      business_id: businessId,
      order_id: orderId,
      amount_cents: invoice.amountToCharge,
      discount_cents: invoice.firstDiscount,
      credit_applied_cents: invoice.creditToApply,
      status: "processing",
      scheduled_for: scheduledFor
    }).select("id").single();
    if (error) throw error;
    transactionId = created.id;
  } else {
    await admin.from("billing_transactions").update({
      order_id: orderId,
      amount_cents: invoice.amountToCharge,
      discount_cents: invoice.firstDiscount,
      credit_applied_cents: invoice.creditToApply,
      status: "processing",
      error_code: null,
      error_message: null
    }).eq("id", transactionId);
  }

  let payment: any = null;
  try {
    if (invoice.amountToCharge > 0) {
      const { data: method } = await admin
        .from("billing_payment_methods")
        .select("*")
        .eq("business_id", businessId)
        .eq("active", true)
        .maybeSingle();

      if (!method?.provider_billing_key || !method?.provider_customer_key) {
        throw new Error("등록된 자동결제 카드가 없습니다.");
      }

      payment = await tossRequest(`/v1/billing/${encodeURIComponent(method.provider_billing_key)}`, {
        method: "POST",
        headers: { "Idempotency-Key": orderId },
        body: JSON.stringify({
          customerKey: method.provider_customer_key,
          amount: invoice.amountToCharge,
          orderId,
          orderName: `LeadMate ${invoice.plan.name} 월 구독`
        })
      });
    }

    if (invoice.creditToApply > 0) {
      await consumeCredit(businessId, invoice.creditToApply, orderId);
    }
    await finalizeReferralReward(businessId, invoice.referralId);

    const periodStart = new Date();
    const periodEnd = addOneMonth(periodStart);

    await admin.from("business_subscriptions").update({
      plan_code: effectivePlanCode,
      pending_plan_code: null,
      status: "active",
      current_period_start: periodStart.toISOString(),
      current_period_end: periodEnd.toISOString(),
      next_billing_at: periodEnd.toISOString(),
      last_payment_at: periodStart.toISOString(),
      last_payment_amount: invoice.amountToCharge,
      billing_failures: 0,
      updated_at: periodStart.toISOString()
    }).eq("business_id", businessId);

    await admin.from("billing_transactions").update({
      status: invoice.amountToCharge === 0 ? "credit_only" : "paid",
      payment_key: payment?.paymentKey ?? null,
      paid_at: new Date().toISOString()
    }).eq("id", transactionId);

    return {
      ok: true,
      orderId,
      amountCharged: invoice.amountToCharge,
      discount: invoice.firstDiscount,
      creditApplied: invoice.creditToApply,
      paymentKey: payment?.paymentKey ?? null
    };
  } catch (error: any) {
    const failures = Number(subscription.billing_failures || 0) + 1;
    await admin.from("business_subscriptions").update({
      status: "past_due",
      billing_failures: failures,
      updated_at: new Date().toISOString()
    }).eq("business_id", businessId);

    await admin.from("billing_transactions").update({
      status: "failed",
      error_code: error?.code || "BILLING_FAILED",
      error_message: error?.message || "결제에 실패했습니다."
    }).eq("id", transactionId);

    throw error;
  }
}
