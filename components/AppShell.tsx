"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { APP_VERSION } from "@/lib/version";
import { useAdminStatus } from "@/lib/useAdminStatus";
import { useAccessStatus } from "@/lib/useAccessStatus";

const baseNavItems = [
  { href: "/", label: "홈" },
  { href: "/customers", label: "고객" },
  { href: "/analytics", label: "통계" },
  { href: "/billing", label: "구독" },
  { href: "/settings", label: "설정" },
];

function SubscriptionLocked({ reason }: { reason?: string }) {
  return (
    <section className="subscription-gate">
      <div className="subscription-gate-card">
        <span className="eyebrow">SUBSCRIPTION</span>
        <h1>{reason === "PAST_DUE" ? "결제를 확인해주세요" : "구독이 필요합니다"}</h1>
        <p>
          {reason === "PAST_DUE"
            ? "등록된 카드의 결제가 정상 처리되지 않았습니다. 결제수단을 확인하면 LeadMate를 계속 사용할 수 있습니다."
            : "무료 체험이 종료되었습니다. 요금제를 선택하고 결제수단을 확인해주세요."}
        </p>
        <Link className="button primary" href="/billing">구독 관리로 이동</Link>
      </div>
    </section>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin } = useAdminStatus();
  const access = useAccessStatus();

  const navItems = [
    ...baseNavItems,
    ...(isAdmin ? [{ href: "/admin", label: "관리자" }] : []),
  ];

  const unrestricted =
    pathname.startsWith("/billing") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/refund");

  const locked =
    access !== null &&
    access.authenticated &&
    !access.isAdmin &&
    !access.accessAllowed &&
    !unrestricted;

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
          </nav>
        </div>

        <div className="sidebar-bottom">
          <div className="legal-mini-links">
            <Link href="/terms">이용약관</Link>
            <Link href="/privacy">개인정보</Link>
            <Link href="/refund">환불정책</Link>
          </div>
          <button className="button ghost full" onClick={logout}>로그아웃</button>
        </div>
      </aside>

      <main className="main-content">
        {locked ? <SubscriptionLocked reason={access?.reason} /> : children}
      </main>
    </div>
  );
}
