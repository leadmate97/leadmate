import { NextResponse } from "next/server";
import { createClient as createUserClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAdmin } from "@/lib/admin/server";

export async function GET() {
  try {
    const userClient = await createUserClient();
    const { data: { user } } = await userClient.auth.getUser();

    if (!user) {
      return NextResponse.json({
        authenticated: false,
        accessAllowed: false,
        reason: "AUTH_REQUIRED"
      });
    }

    const adminInfo = await getCurrentAdmin();
    if (adminInfo.isAdmin) {
      return NextResponse.json({
        authenticated: true,
        isAdmin: true,
        accessAllowed: true,
        reason: "ADMIN"
      });
    }

    const { data: member, error: memberError } = await userClient
      .from("business_members")
      .select("business_id,role")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (memberError) {
      return NextResponse.json({
        authenticated: true,
        isAdmin: false,
        accessAllowed: false,
        reason: "MEMBERSHIP_ERROR",
        error: memberError.message
      });
    }

    if (!member?.business_id) {
      return NextResponse.json({
        authenticated: true,
        isAdmin: false,
        accessAllowed: false,
        reason: "NO_BUSINESS"
      });
    }

    const admin = createAdminClient();

    const [{ data: sub }, { data: overrides }] = await Promise.all([
      admin
        .from("business_subscriptions")
        .select("status,trial_ends_at,current_period_end,next_billing_at,billing_failures")
        .eq("business_id", member.business_id)
        .maybeSingle(),
      admin
        .from("subscription_overrides")
        .select("override_type,starts_at,ends_at,active")
        .eq("business_id", member.business_id)
        .eq("active", true)
    ]);

    const now = Date.now();

    const freeOverride = (overrides || []).some((o: any) => {
      if (o.override_type !== "free") return false;
      const started = !o.starts_at || new Date(o.starts_at).getTime() <= now;
      const notEnded = !o.ends_at || new Date(o.ends_at).getTime() > now;
      return started && notEnded;
    });

    const trialActive =
      sub?.status === "trialing" &&
      !!sub?.trial_ends_at &&
      new Date(sub.trial_ends_at).getTime() > now;

    const activePaid = sub?.status === "active";
    const accessAllowed = Boolean(freeOverride || trialActive || activePaid);

    return NextResponse.json({
      authenticated: true,
      isAdmin: false,
      businessId: member.business_id,
      role: member.role,
      accessAllowed,
      freeOverride,
      subscriptionStatus: sub?.status || "unknown",
      trialEndsAt: sub?.trial_ends_at || null,
      currentPeriodEnd: sub?.current_period_end || null,
      nextBillingAt: sub?.next_billing_at || null,
      billingFailures: Number(sub?.billing_failures || 0),
      reason: accessAllowed
        ? freeOverride
          ? "FREE_OVERRIDE"
          : trialActive
            ? "TRIAL"
            : "ACTIVE"
        : sub?.status === "past_due"
          ? "PAST_DUE"
          : "SUBSCRIPTION_REQUIRED"
    });
  } catch (error: any) {
    return NextResponse.json({
      authenticated: true,
      accessAllowed: false,
      reason: "ACCESS_CHECK_FAILED",
      error: error?.message || "이용 권한 확인에 실패했습니다."
    }, { status: 500 });
  }
}
