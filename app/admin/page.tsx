"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { formatWon } from "@/lib/subscription";
import { useAdminStatus } from "@/lib/useAdminStatus";

type Dashboard = {
  stats: {
    businesses: number;
    active: number;
    trialing: number;
    pastDue: number;
    mrr: number;
    monthlyPaid: number;
  };
  recentFailures: any[];
};

export default function AdminDashboardPage() {
  const { role, can } = useAdminStatus();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const response = await fetch("/api/admin/dashboard", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) setError(result.error || "관리자 정보를 불러오지 못했습니다.");
      else setData(result);
    })();
  }, []);

  return <AppShell>
    <div className="page-head">
      <div>
        <p className="eyebrow">LEADMATE ADMIN</p>
        <h1>관리자 대시보드</h1>
        <p>구독 운영과 관리자 권한을 한 곳에서 관리합니다. {role && <strong>현재 권한: {role}</strong>}</p>
      </div>
    </div>

    {error && <p className="notice admin-error">{error}</p>}

    <section className="admin-v3-stats">
      <article className="panel"><span>전체 사업장</span><strong>{data?.stats.businesses ?? "-"}</strong></article>
      <article className="panel"><span>유료 구독</span><strong>{data?.stats.active ?? "-"}</strong></article>
      <article className="panel"><span>무료 체험</span><strong>{data?.stats.trialing ?? "-"}</strong></article>
      <article className="panel"><span>미결제</span><strong>{data?.stats.pastDue ?? "-"}</strong></article>
      <article className="panel"><span>예상 MRR</span><strong>{data ? formatWon(data.stats.mrr) : "-"}</strong></article>
      <article className="panel"><span>이번 달 결제</span><strong>{data ? formatWon(data.stats.monthlyPaid) : "-"}</strong></article>
    </section>

    <section className="admin-v3-actions">
      <Link className="panel admin-v3-action" href="/admin/subscriptions">
        <span className="billing-kicker">BILLING</span>
        <h2>구독 관리</h2>
        <p>사업장별 무료 이용, 할인, 결제상태를 관리합니다.</p>
      </Link>

      {can("system.manage") && (
        <Link className="panel admin-v3-action" href="/admin/users">
          <span className="billing-kicker">ACCESS</span>
          <h2>관리자 계정</h2>
          <p>관리자를 추가하거나 역할을 변경할 수 있습니다.</p>
        </Link>
      )}
    </section>

    <section className="panel">
      <h2>운영 원칙</h2>
      <p className="muted-text">
        superadmin은 전체 권한, admin은 운영 관리, billing_manager는 결제 관리,
        support는 조회 권한으로 분리할 수 있습니다.
      </p>
    </section>
  </AppShell>;
}
