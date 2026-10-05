import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireBusinessAccess } from "@/lib/billing/server";

export async function GET(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId");
    if (!businessId) return NextResponse.json({ error: "businessId가 필요합니다." }, { status: 400 });

    await requireBusinessAccess(businessId, false);
    const admin = createAdminClient();

    const [{ data: method }, { data: subscription }] = await Promise.all([
      admin.from("billing_payment_methods")
        .select("method,card_issuer_code,card_number_masked,authenticated_at,active")
        .eq("business_id", businessId)
        .maybeSingle(),
      admin.from("business_subscriptions")
        .select("status,next_billing_at,current_period_end,cancel_at_period_end,last_payment_at,last_payment_amount,billing_failures")
        .eq("business_id", businessId)
        .single()
    ]);

    return NextResponse.json({
      configured: Boolean(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY && process.env.TOSS_SECRET_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY),
      paymentMethod: method?.active ? method : null,
      subscription
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "결제 상태 조회 실패" }, { status: 400 });
  }
}
