import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireBusinessAccess } from "@/lib/billing/server";

export async function GET(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId");
    if (!businessId) return NextResponse.json({ error: "businessId가 필요합니다." }, { status: 400 });

    await requireBusinessAccess(businessId, false);
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("billing_transactions")
      .select("id,order_id,amount_cents,discount_cents,credit_applied_cents,status,scheduled_for,paid_at,error_code,error_message,created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw error;
    return NextResponse.json({ transactions: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "결제내역 조회 실패" }, { status: 400 });
  }
}
