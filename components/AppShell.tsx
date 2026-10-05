"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { APP_VERSION } from "@/lib/version";
import { useAdminStatus } from "@/lib/useAdminStatus";

const baseNavItems = [
  { href: "/", label: "홈" },
  { href: "/customers", label: "고객" },
  { href: "/analytics", label: "통계" },
  { href: "/billing", label: "구독" },
  { href: "/settings", label: "설정" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin, loading: adminLoading } = useAdminStatus();

  const navItems = [
    ...baseNavItems,
    ...(isAdmin ? [{ href: "/admin/subscriptions", label: "관리자" }] : []),
  ];

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand-row">
            <img className="brand-logo" src="/leadmate-icon.png" alt="LeadMate" />
            <div>
              <strong>LeadMate</strong>
              <div className="version">{APP_VERSION}</div>
            </div>
          </div>

          <nav className="nav-list">
            {navItems.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? "nav-item active" : "nav-item"}
                >
                  {item.label}
                </Link>
              );
            })}

            {adminLoading && (
              <span className="nav-admin-loading" aria-hidden="true">
                관리자 확인 중…
              </span>
            )}
          </nav>
        </div>

        <button className="button ghost full" onClick={logout}>
          로그아웃
        </button>
      </aside>

      <main className="main-content">{children}</main>
    </div>
  );
}
