"use client";

import { useEffect, useState } from "react";

export function useAdminStatus() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/admin/me", { cache: "no-store" });
        const result = await response.json();
        setIsAdmin(Boolean(result.isAdmin));
        setRole(result.role || null);
      } catch {
        setIsAdmin(false);
        setRole(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { isAdmin, role, loading };
}
