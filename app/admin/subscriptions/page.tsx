"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { formatWon } from "@/lib/subscription";

type Row = {
  business_id: string;
  plan_code: string;
  status: string;
  next_billing_at: string | null;
  last_payment_amount: number | null;
  billing_failures: number;
  cancel_at_period_end: boolean;
  business: { id: string; name: string; referral_code: string | null } | null;
};

export default function AdminSubscriptionsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [amount, setAmount] = useState("10000");
  const [reason, setReason] = useState("관리자 설정");
  const [saving, setSaving] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/subscriptions", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) setError(result.error || "관리자 구독 정보를 불러오지 못했습니다.");
    else {
      setRows(result.rows || []);
      if (!selected && result.rows?.[0]) setSelected(result.rows[0].business_id);
    }
  }

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter(r => r.status === "active").length,
    trialing: rows.filter(r => r.status === "trialing").length,
    pastDue: rows.filter(r => r.status === "past_due").length
  }), [rows]);

  async function apply(action: "free" | "discount" | "clear_overrides") {
    if (!selected) return;
    setSaving(true); setError("");
    const response = await fetch("/api/admin/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId: selected,
        action,
        amountCents: action === "discount" ? Number(amount) : undefined,
        reason
      })
    });
    const result = await response.json();
    if (!response.ok) setError(result.error || "설정 실패");
    else await load();
    setSaving(false);
  }

  return <AppShell>
    <div className="page-head"><div><p className="eyebrow">ADMIN</p><h1>구독 관리자</h1><p>전체 사업장 구독상태와 관리자 특권을 관리합니다.</p></div></div>

    {error && <p className="notice">{error}</p>}

    <section className="admin-sub-stats">
      <article className="panel"><span>전체</span><strong>{stats.total}</strong></article>
      <article className="panel"><span>구독 중</span><strong>{stats.active}</strong></article>
      <article className="panel"><span>체험 중</span><strong>{stats.trialing}</strong></article>
      <article className="panel"><span>미결제</span><strong>{stats.pastDue}</strong></article>
    </section>

    <section className="panel admin-override-panel">
      <h2>관리자 특권</h2>
      <div className="admin-override-grid">
        <label>사업장
          <select value={selected} onChange={(e)=>setSelected(e.target.value)}>
            {rows.map(row => <option value={row.business_id} key={row.business_id}>{row.business?.name || row.business_id}</option>)}
          </select>
        </label>
        <label>할인 금액
          <input type="number" value={amount} onChange={(e)=>setAmount(e.target.value)} />
        </label>
        <label>사유
          <input value={reason} onChange={(e)=>setReason(e.target.value)} />
        </label>
      </div>
      <div className="button-row">
        <button className="button primary" disabled={saving} onClick={()=>apply("free")}>무료 이용 부여</button>
        <button className="button ghost" disabled={saving} onClick={()=>apply("discount")}>할인 부여</button>
        <button className="button ghost" disabled={saving} onClick={()=>apply("clear_overrides")}>특권 해제</button>
      </div>
    </section>

    <section className="panel">
      <h2>전체 구독 현황</h2>
      <div className="admin-sub-list">
        {rows.map(row => <article key={row.business_id} className="admin-sub-row">
          <div><strong>{row.business?.name || "사업장"}</strong><span>{row.business?.referral_code || "-"}</span></div>
          <div><span>요금제</span><strong>{row.plan_code}</strong></div>
          <div><span>상태</span><strong>{row.status}</strong></div>
          <div><span>다음 결제</span><strong>{row.next_billing_at ? new Date(row.next_billing_at).toLocaleDateString("ko-KR") : "-"}</strong></div>
          <div><span>최근 결제</span><strong>{formatWon(Number(row.last_payment_amount || 0))}</strong></div>
          <div><span>실패</span><strong>{row.billing_failures}회</strong></div>
        </article>)}
      </div>
    </section>
  </AppShell>;
}
