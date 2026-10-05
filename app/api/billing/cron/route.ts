import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chargeSubscription } from "@/lib/billing/server";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: dueSubs, error } = await admin
    .from("business_subscriptions")
    .select("business_id,status,next_billing_at,trial_ends_at")
    .in("status", ["trialing", "active", "past_due"])
    .lte("next_billing_at", now)
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: any[] = [];
  for (const sub of dueSubs || []) {
    try {
      results.push({ businessId: sub.business_id, ...(await chargeSubscription(sub.business_id, false)) });
    } catch (error: any) {
      results.push({ businessId: sub.business_id, ok: false, error: error?.message || "billing failed" });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
