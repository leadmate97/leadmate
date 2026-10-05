import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireBusinessAccess } from "@/lib/billing/server";

export async function POST(request: NextRequest) {
  try {
    const { businessId } = await request.json();
    if (!businessId) return NextResponse.json({ error: "businessId가 필요합니다.", code: "BUSINESS_ID_REQUIRED" }, { status: 400 });

    await requireBusinessAccess(businessId, true);
    const admin = createAdminClient();

    const { data: sub, error } = await admin
      .from("business_subscriptions")
      .select("provider_customer_id")
      .eq("business_id", businessId)
      .single();
    if (error) throw error;

    let customerKey = sub?.provider_customer_id;
    if (!customerKey) {
      customerKey = `LM_${crypto.randomUUID()}`;
      const { error: updateError } = await admin.from("business_subscriptions").update({
        provider: "toss",
        provider_customer_id: customerKey,
        updated_at: new Date().toISOString()
      }).eq("business_id", businessId);
      if (updateError) throw updateError;
    }

    const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
    if (!clientKey) throw new Error("NEXT_PUBLIC_TOSS_CLIENT_KEY가 설정되지 않았습니다.");

    const origin = request.nextUrl.origin;
    return NextResponse.json({
      ok: true,
      stage: "ready",
      customerKey,
      clientKey,
      successUrl: `${origin}/billing/success?businessId=${encodeURIComponent(businessId)}`,
      failUrl: `${origin}/billing/fail`
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "결제수단 등록 준비에 실패했습니다.", code: error?.code || "BILLING_SETUP_FAILED" }, { status: 400 });
  }
}
