import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/server";

const PLAN_PRICE: Record<string, number> = {
  personal: 39000,
  team: 159000
};

export async function GET() {
  try {
    const { adminClient } = await requireAdminPermission("billing.view");

    const [{ data: subs }, { data: txs }, { data: businesses }] = await Promise.all([
      adminClient
        .from("business_subscriptions")
        .select("business_id,plan_code,status,trial_ends_at,next_billing_at,billing_failures,last_payment_amount"),
      adminClient
        .from("billing_transactions")
        .select("amount_cents,status,paid_at,created_at")
        .order("created_at", { ascending: false })
        .limit(100),
      adminClient.from("businesses").select("id,name")
    ]);

    const subscriptions = subs || [];
    const active = subscriptions.filter((s: any) => s.status === "active");
    const trialing = subscriptions.filter((s: any) => s.status === "trialing");
    const pastDue = subscriptions.filter((s: any) => s.status === "past_due");

    const mrr = active.reduce(
      (sum: number, sub: any) => sum + (PLAN_PRICE[sub.plan_code] || 0),
      0
    );

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const monthlyPaid = (txs || [])
      .filter((tx: any) =>
        ["paid", "credit_only"].includes(tx.status) &&
        new Date(tx.paid_at || tx.created_at) >= monthStart
      )
      .reduce((sum: number, tx: any) => sum + Number(tx.amount_cents || 0), 0);

    const recentFailures = (txs || [])
      .filter((tx: any) => tx.status === "failed")
      .slice(0, 10);

    return NextResponse.json({
      stats: {
        businesses: businesses?.length || 0,
        active: active.length,
        trialing: trialing.length,
        pastDue: pastDue.length,
        mrr,
        monthlyPaid
      },
      recentFailures
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "관리자 대시보드 조회 실패" },
      { status: 403 }
    );
  }
}
