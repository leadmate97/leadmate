import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireBusinessAccess, tossRequest } from "@/lib/billing/server";

export async function POST(request: NextRequest) {
  try {
    const { businessId, authKey, customerKey } = await request.json();
    if (!businessId || !authKey || !customerKey) {
      return NextResponse.json({ error: "필수 결제 인증 정보가 없습니다." }, { status: 400 });
    }

    await requireBusinessAccess(businessId, true);
    const admin = createAdminClient();

    const { data: sub } = await admin
      .from("business_subscriptions")
      .select("provider_customer_id,trial_ends_at,next_billing_at")
      .eq("business_id", businessId)
      .single();

    if (!sub || sub.provider_customer_id !== customerKey) {
      return NextResponse.json({ error: "customerKey가 일치하지 않습니다." }, { status: 400 });
    }

    const billing = await tossRequest("/v1/billing/authorizations/issue", {
      method: "POST",
      body: JSON.stringify({ authKey, customerKey })
    });

    const maskedNumber = billing?.card?.number || billing?.cardNumber || null;
    const issuerCode = billing?.card?.issuerCode || billing?.cardCompany || null;

    const { error: methodError } = await admin.from("billing_payment_methods").upsert({
      business_id: businessId,
      provider: "toss",
      provider_customer_key: customerKey,
      provider_billing_key: billing.billingKey,
      method: billing.method || "카드",
      card_issuer_code: issuerCode,
      card_number_masked: maskedNumber,
      authenticated_at: billing.authenticatedAt || new Date().toISOString(),
      active: true,
      updated_at: new Date().toISOString()
    }, { onConflict: "business_id" });
    if (methodError) throw methodError;

    const nextBillingAt = sub.next_billing_at || sub.trial_ends_at;
    await admin.from("business_subscriptions").update({
      provider: "toss",
      next_billing_at: nextBillingAt,
      updated_at: new Date().toISOString()
    }).eq("business_id", businessId);

    return NextResponse.json({
      ok: true,
      method: billing.method || "카드",
      cardNumberMasked: maskedNumber,
      cardIssuerCode: issuerCode
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error?.message || "빌링키 발급에 실패했습니다.",
      code: error?.code || null
    }, { status: 400 });
  }
}
