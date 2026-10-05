"use client";

import { useEffect, useState } from "react";

export type AdminPermission =
  | "billing.view"
  | "billing.manage"
  | "users.manage"
  | "system.manage";

export function useAdminStatus() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<AdminPermission[]>([]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const response = await fetch("/api/admin/me", { cache: "no-store" });
        const result = await response.json();

        if (!mounted) return;

        setIsAdmin(Boolean(result.isAdmin));
        setRole(result.role || null);
        setPermissions(Array.isArray(result.permissions) ? result.permissions : []);
      } catch {
        if (!mounted) return;
        setIsAdmin(false);
        setRole(null);
        setPermissions([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  function can(permission: AdminPermission) {
    return isAdmin && permissions.includes(permission);
  }

  return { isAdmin, role, permissions, can };
}
