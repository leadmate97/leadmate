import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/server";


export async function GET() {
  try {
    const { adminClient } = await requireAdminPermission("billing.view");

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

    let overrideMap = new Map<string, any[]>();
    if (businessIds.length) {
      const { data: overrides } = await adminClient
        .from("subscription_overrides")
        .select("id,business_id,override_type,amount_cents,reason,starts_at,ends_at,active")
        .in("business_id", businessIds)
        .eq("active", true);

      for (const override of overrides || []) {
        const list = overrideMap.get(override.business_id) || [];
        list.push(override);
        overrideMap.set(override.business_id, list);
      }
    }

    const rows = (subs || []).map((s: any) => ({
      ...s,
      business: businessMap.get(s.business_id) || null,
      overrides: overrideMap.get(s.business_id) || []
    }));

    return NextResponse.json({ rows });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "관리자 구독 조회 실패" }, { status: 403 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, adminClient } = await requireAdminPermission("billing.manage");
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
      return NextResponse.json({ ok: true, message: "관리자 특권을 해제했습니다." });
    }

    if (!["free","discount","plan","feature"].includes(action)) {
      return NextResponse.json({ error: "지원하지 않는 관리자 동작입니다." }, { status: 400 });
    }

    if (action === "discount") {
      const amount = Number(amountCents || 0);
      if (!Number.isFinite(amount) || amount < 1000 || amount % 1000 !== 0) {
        return NextResponse.json(
          { error: "할인 금액은 1,000원 이상, 1,000원 단위로 입력해주세요." },
          { status: 400 }
        );
      }
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
    return NextResponse.json({
      ok: true,
      message: action === "free"
        ? "무료 이용 특권을 부여했습니다."
        : action === "discount"
          ? `${Number(amountCents).toLocaleString("ko-KR")}원 할인을 부여했습니다.`
          : "관리자 특권을 적용했습니다."
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "관리자 구독 설정 실패" }, { status: 403 });
  }
}
