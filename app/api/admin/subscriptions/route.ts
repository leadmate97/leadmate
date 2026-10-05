import { NextRequest, NextResponse } from "next/server";
import { createClient as createUserClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAdmin() {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다.");

  const adminClient = createAdminClient();
  const { data: adminRow } = await adminClient
    .from("app_admins")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminRow) throw new Error("관리자 권한이 없습니다.");
  return { user, role: adminRow.role, adminClient };
}

export async function GET() {
  try {
    const { adminClient } = await requireAdmin();

    const { data: subs, error } = await adminClient
      .from("business_subscriptions")
      .select("business_id,plan_code,pending_plan_code,status,trial_ends_at,current_period_end,next_billing_at,cancel_at_period_end,last_payment_at,last_payment_amount,billing_failures")
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const businessIds = (subs || []).map((s: any) => s.business_id);
    let businessMap = new Map<string, any>();
    if (businessIds.length) {
      const { data: businesses } = await adminClient
        .from("businesses")
        .select("id,name,referral_code")
        .in("id", businessIds);
      businessMap = new Map((businesses || []).map((b: any) => [b.id, b]));
    }

    const rows = (subs || []).map((s: any) => ({
      ...s,
      business: businessMap.get(s.business_id) || null
    }));

    return NextResponse.json({ rows });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "관리자 구독 조회 실패" }, { status: 403 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, adminClient } = await requireAdmin();
    const body = await request.json();
    const { businessId, action, amountCents, planKey, featureKey, reason, endsAt } = body;

    if (!businessId || !action) {
      return NextResponse.json({ error: "businessId와 action이 필요합니다." }, { status: 400 });
    }

    if (action === "clear_overrides") {
      const { error } = await adminClient
        .from("subscription_overrides")
        .update({ active: false })
        .eq("business_id", businessId)
        .eq("active", true);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (!["free","discount","plan","feature"].includes(action)) {
      return NextResponse.json({ error: "지원하지 않는 관리자 동작입니다." }, { status: 400 });
    }

    const { error } = await adminClient.from("subscription_overrides").insert({
      business_id: businessId,
      override_type: action,
      amount_cents: action === "discount" ? Number(amountCents || 0) : null,
      plan_key: action === "plan" ? planKey : null,
      feature_key: action === "feature" ? featureKey : null,
      reason: reason || "관리자 설정",
      ends_at: endsAt || null,
      created_by: user.id,
      active: true
    });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "관리자 구독 설정 실패" }, { status: 403 });
  }
}
