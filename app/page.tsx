"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import StatusBadge from "@/components/StatusBadge";
import { createClient } from "@/lib/supabase/client";
import { getPreset } from "@/lib/business";
import { useBusinessSettings } from "@/lib/useBusinessSettings";
import type { Customer } from "@/lib/types";
import { daysRemaining } from "@/lib/subscription";

function isToday(value: string | null) {
  if (!value) return false;
  const d = new Date(value);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

export default function DashboardPage() {
  const { settings, loading: settingsLoading } = useBusinessSettings();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);

  useEffect(() => {
    if (settingsLoading || !settings) return;
    (async () => {
      const supabase = createClient();
      const [{ data }, { data: subscription }] = await Promise.all([
        supabase.from("customers").select("*").order("created_at", { ascending: false }),
        supabase.from("business_subscriptions").select("status,trial_ends_at").eq("business_id", settings.business_id).maybeSingle()
      ]);
      setCustomers((data as Customer[]) ?? []);
      setTrialEndsAt(subscription?.trial_ends_at ?? null);
      setSubscriptionStatus(subscription?.status ?? null);
      setLoading(false);
    })();
  }, [settings, settingsLoading]);

  const stats = useMemo(() => {
    const now = Date.now();
    return {
      fresh: customers.filter((c) => c.status === "NEW").length,
      callbacks: customers.filter((c) => c.next_contact_at && isToday(c.next_contact_at)).length,
      scheduled: customers.filter((c) => ["VISIT_BOOKED", "VISITED"].includes(c.status) && c.next_contact_at && isToday(c.next_contact_at)).length,
      stale: customers.filter((c) => now - new Date(c.updated_at).getTime() >= 3 * 86400000 && !["CONTRACTED", "REJECTED"].includes(c.status)).length
    };
  }, [customers]);

  const todayList = customers
    .filter((c) => c.next_contact_at && isToday(c.next_contact_at))
    .sort((a, b) => new Date(a.next_contact_at!).getTime() - new Date(b.next_contact_at!).getTime())
    .slice(0, 10);

  if (settingsLoading || !settings) return <AppShell><p>내 비즈니스 설정을 불러오는 중...</p></AppShell>;
  const preset = getPreset(settings.industry);

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <p className="eyebrow">TODAY</p>
          <h1>오늘의 영업</h1>
          <p>{settings.business_name ? `${settings.business_name} · ` : ""}놓치면 안 되는 리드와 다음 행동을 확인하세요.</p>
        </div>
        <Link href="/customers/new" className="button primary">+ 고객 추가</Link>
      </div>

      {subscriptionStatus === "trialing" && <Link href="/billing" className="trial-banner"><span>7일 무료 체험 중</span><strong>{daysRemaining(trialEndsAt)}일 남음</strong><em>요금제 보기 →</em></Link>}

      <section className="stat-grid">
        <div className="stat-card"><span>{preset.dashboard.newLabel}</span><strong>{stats.fresh}</strong></div>
        <div className="stat-card"><span>{preset.dashboard.actionLabel}</span><strong>{stats.callbacks}</strong></div>
        <div className="stat-card"><span>{preset.dashboard.scheduleLabel}</span><strong>{stats.scheduled}</strong></div>
        <div className="stat-card"><span>{preset.dashboard.staleLabel}</span><strong>{stats.stale}</strong></div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>오늘 후속 연락</h2><Link href="/customers">전체 고객 보기</Link></div>
        {loading ? <p>불러오는 중...</p> : todayList.length === 0 ? <div className="empty">오늘 예정된 후속 연락이 없습니다.</div> : (
          <div className="list-table">
            {todayList.map((c) => (
              <Link href={`/customers/${c.id}`} key={c.id} className="customer-row">
                <div className="time">{new Date(c.next_contact_at!).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</div>
                <div className="grow"><strong>{c.name}</strong><span>{c.project_name || `${settings.product_label} 미지정`}</span></div>
                <StatusBadge status={c.status} label={settings.pipeline_labels[c.status as keyof typeof settings.pipeline_labels]} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
