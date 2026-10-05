import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireBusinessAccess } from "@/lib/billing/server";

export async function POST(request: NextRequest) {
  try {
    const { businessId, cancel } = await request.json();
    await requireBusinessAccess(businessId, true);
    const admin = createAdminClient();
    const { error } = await admin.from("business_subscriptions").update({
      cancel_at_period_end: Boolean(cancel),
      updated_at: new Date().toISOString()
    }).eq("business_id", businessId);
    if (error) throw error;
    return NextResponse.json({ ok: true, cancelAtPeriodEnd: Boolean(cancel) });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "구독 설정 변경 실패" }, { status: 400 });
  }
}
