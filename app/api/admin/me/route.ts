import { NextResponse } from "next/server";
import { createClient as createUserClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const userClient = await createUserClient();
    const { data: { user } } = await userClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ isAdmin: false, role: null });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("app_admins")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ isAdmin: false, role: null });
    }

    return NextResponse.json({
      isAdmin: Boolean(data),
      role: data?.role || null
    });
  } catch {
    return NextResponse.json({ isAdmin: false, role: null });
  }
}
