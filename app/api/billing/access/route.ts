import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireBusinessAccess } from "@/lib/billing/server";

export async function GET(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId");
    if (!businessId) return NextResponse.json({ error: "businessId가 필요합니다." }, { status: 400 });

    await requireBusinessAccess(businessId, false);
    const admin = createAdminClient();

    const [{ data: sub }, { data: overrides }] = await Promise.all([
      admin.from("business_subscriptions")
        .select("status,trial_ends_at,current_period_end,next_billing_at,cancel_at_period_end,billing_failures")
        .eq("business_id", businessId)
        .single(),
      admin.from("subscription_overrides")
        .select("override_type,amount_cents,plan_key,feature_key,starts_at,ends_at,reason")
        .eq("business_id", businessId)
        .eq("active", true)
    ]);

    const now = Date.now();
    const freeOverride = (overrides || []).some((o: any) =>
      o.override_type === "free" &&
      new Date(o.starts_at).getTime() <= now &&
      (!o.ends_at || new Date(o.ends_at).getTime() > now)
    );

    const trialActive = sub?.status === "trialing" && sub?.trial_ends_at && new Date(sub.trial_ends_at).getTime() > now;
    const accessAllowed = Boolean(freeOverride || sub?.status === "active" || trialActive);

    return NextResponse.json({
      accessAllowed,
      freeOverride,
      status: sub?.status || "unknown",
      trialEndsAt: sub?.trial_ends_at || null,
      currentPeriodEnd: sub?.current_period_end || null,
      nextBillingAt: sub?.next_billing_at || null,
      cancelAtPeriodEnd: Boolean(sub?.cancel_at_period_end),
      billingFailures: Number(sub?.billing_failures || 0),
      overrides: overrides || []
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "구독 접근상태 조회 실패" }, { status: 400 });
  }
}
