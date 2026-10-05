import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess, chargeSubscription } from "@/lib/billing/server";

export async function POST(request: NextRequest) {
  try {
    const { businessId } = await request.json();
    await requireBusinessAccess(businessId, true);
    const result = await chargeSubscription(businessId, false);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "구독 결제에 실패했습니다.", code: error?.code || null }, { status: 400 });
  }
}
