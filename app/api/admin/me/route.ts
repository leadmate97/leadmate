import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin/server";

export async function GET() {
  try {
    const admin = await getCurrentAdmin();

    return NextResponse.json({
      isAdmin: admin.isAdmin,
      role: admin.role,
      permissions: admin.permissions,
    });
  } catch {
    return NextResponse.json({
      isAdmin: false,
      role: null,
      permissions: [],
    });
  }
}
