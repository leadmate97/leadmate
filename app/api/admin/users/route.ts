import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/server";

const ALLOWED_ROLES = ["superadmin", "admin", "billing_manager", "support"];

export async function GET() {
  try {
    const { adminClient } = await requireAdminPermission("system.manage");

    const [{ data: admins, error: adminError }, usersResult] = await Promise.all([
      adminClient.from("app_admins").select("user_id,role,created_at").order("created_at"),
      adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
    ]);

    if (adminError) throw adminError;
    if (usersResult.error) throw usersResult.error;

    const userMap = new Map(
      (usersResult.data.users || []).map((u: any) => [u.id, u])
    );

    const rows = (admins || []).map((row: any) => ({
      ...row,
      email: userMap.get(row.user_id)?.email || null
    }));

    return NextResponse.json({ rows });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "관리자 계정 조회 실패" },
      { status: 403 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, adminClient } = await requireAdminPermission("system.manage");
    const { action, email, userId, role } = await request.json();

    if (action === "add") {
      if (!email || !ALLOWED_ROLES.includes(role)) {
        return NextResponse.json({ error: "이메일과 역할을 확인해주세요." }, { status: 400 });
      }

      const result = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (result.error) throw result.error;

      const target = (result.data.users || []).find(
        (u: any) => (u.email || "").toLowerCase() === String(email).toLowerCase()
      );

      if (!target) {
        return NextResponse.json(
          { error: "LeadMate에 가입된 이메일 계정을 찾을 수 없습니다." },
          { status: 404 }
        );
      }

      const { error } = await adminClient.from("app_admins").upsert({
        user_id: target.id,
        role
      }, { onConflict: "user_id" });

      if (error) throw error;
      return NextResponse.json({ ok: true, message: `${target.email}에 ${role} 권한을 부여했습니다.` });
    }

    if (action === "role") {
      if (!userId || !ALLOWED_ROLES.includes(role)) {
        return NextResponse.json({ error: "관리자와 역할을 확인해주세요." }, { status: 400 });
      }

      const { error } = await adminClient
        .from("app_admins")
        .update({ role })
        .eq("user_id", userId);

      if (error) throw error;
      return NextResponse.json({ ok: true, message: "관리자 역할을 변경했습니다." });
    }

    if (action === "remove") {
      if (!userId) return NextResponse.json({ error: "관리자를 선택해주세요." }, { status: 400 });
      if (userId === user.id) {
        return NextResponse.json({ error: "현재 로그인한 본인의 관리자 권한은 이 화면에서 제거할 수 없습니다." }, { status: 400 });
      }

      const { error } = await adminClient.from("app_admins").delete().eq("user_id", userId);
      if (error) throw error;
      return NextResponse.json({ ok: true, message: "관리자 권한을 제거했습니다." });
    }

    return NextResponse.json({ error: "지원하지 않는 동작입니다." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "관리자 계정 설정 실패" },
      { status: 403 }
    );
  }
}
