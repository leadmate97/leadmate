import { createClient as createUserClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminPermission =
  | "billing.view"
  | "billing.manage"
  | "users.manage"
  | "system.manage";

const ROLE_PERMISSIONS: Record<string, AdminPermission[]> = {
  superadmin: ["billing.view", "billing.manage", "users.manage", "system.manage"],
  admin: ["billing.view", "billing.manage", "users.manage"],
  billing_manager: ["billing.view", "billing.manage"],
  support: ["billing.view"],
};

export async function getCurrentAdmin() {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();

  if (!user) {
    return {
      user: null,
      isAdmin: false,
      role: null,
      permissions: [] as AdminPermission[],
      adminClient: null,
    };
  }

  const adminClient = createAdminClient();

  const { data: adminRow } = await adminClient
    .from("app_admins")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminRow) {
    return {
      user,
      isAdmin: false,
      role: null,
      permissions: [] as AdminPermission[],
      adminClient,
    };
  }

  const basePermissions = ROLE_PERMISSIONS[adminRow.role] || [];

  let customPermissions: AdminPermission[] = [];
  try {
    const { data: permissionRows } = await adminClient
      .from("app_admin_permissions")
      .select("permission_key,allowed")
      .eq("user_id", user.id);

    if (permissionRows) {
      const permissionMap = new Map<AdminPermission, boolean>();

      for (const permission of basePermissions) {
        permissionMap.set(permission, true);
      }

      for (const row of permissionRows) {
        permissionMap.set(row.permission_key as AdminPermission, Boolean(row.allowed));
      }

      customPermissions = Array.from(permissionMap.entries())
        .filter(([, allowed]) => allowed)
        .map(([permission]) => permission);
    } else {
      customPermissions = basePermissions;
    }
  } catch {
    customPermissions = basePermissions;
  }

  return {
    user,
    isAdmin: true,
    role: adminRow.role,
    permissions: customPermissions,
    adminClient,
  };
}

export async function requireAdminPermission(permission: AdminPermission) {
  const admin = await getCurrentAdmin();

  if (!admin.user) {
    throw new Error("로그인이 필요합니다.");
  }

  if (!admin.isAdmin) {
    throw new Error("관리자 권한이 없습니다.");
  }

  if (!admin.permissions.includes(permission)) {
    throw new Error("이 관리자 기능을 사용할 권한이 없습니다.");
  }

  return admin;
}
