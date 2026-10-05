"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { formatWon } from "@/lib/subscription";
import { useAdminStatus } from "@/lib/useAdminStatus";

type Override = {
  id: string;
  override_type: "free" | "discount" | "plan" | "feature";
  amount_cents: number | null;
  reason: string | null;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
};

type Row = {
  business_id: string;
  plan_code: string;
  status: string;
  next_billing_at: string | null;
  last_payment_amount: number | null;
  billing_failures: number;
  cancel_at_period_end: boolean;
  business: { id: string; name: string; referral_code: string | null } | null;
  overrides: Override[];
};

export default function AdminSubscriptionsPage() {
  const { role, can } = useAdminStatus();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selected, setSelected] = useState("");
  const [amount, setAmount] = useState(10000);
  const [reason, setReason] = useState("관리자 설정");
  const [saving, setSaving] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/subscriptions", { cache: "no-store" });
    const result = await response.json();

    if (!response.ok) {
      setError(result.error || "관리자 구독 정보를 불러오지 못했습니다.");
      return;
    }

    const nextRows = result.rows || [];
    setRows(nextRows);

    setSelected((current) => {
      if (current && nextRows.some((row: Row) => row.business_id === current)) return current;
      return nextRows[0]?.business_id || "";
    });
  }

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter(r => r.status === "active").length,
    trialing: rows.filter(r => r.status === "trialing").length,
    pastDue: rows.filter(r => r.status === "past_due").length
  }), [rows]);

  const selectedRow = rows.find((row) => row.business_id === selected);
  const activeOverrides = selectedRow?.overrides || [];
  const freeActive = activeOverrides.some((item) => item.override_type === "free");
  const totalDiscount = activeOverrides
    .filter((item) => item.override_type === "discount")
    .reduce((sum, item) => sum + Number(item.amount_cents || 0), 0);

  function adjustAmount(delta: number) {
    setAmount((current) => Math.max(1000, current + delta));
  }

  async function apply(action: "free" | "discount" | "clear_overrides") {
    if (!selected || saving) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/admin/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: selected,
          action,
          amountCents: action === "discount" ? amount : undefined,
          reason
        })
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "설정에 실패했습니다.");
        return;
      }

      setSuccess(result.message || "설정이 적용되었습니다.");
      await load();
    } catch (e: any) {
      setError(e?.message || "관리자 설정 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return <AppShell>
    <div className="page-head">
      <div>
        <p className="eyebrow">ADMIN</p>
        <h1>구독 관리자</h1>
        <p>전체 사업장 구독, 무료 이용, 할인 특권을 관리합니다.</p>
      </div>
    </div>

    {error && <p className="notice admin-error">{error}</p>}
    {success && <p className="notice admin-success">{success}</p>}

    <section className="admin-sub-stats">
      <article className="panel"><span>전체</span><strong>{stats.total}</strong></article>
      <article className="panel"><span>구독 중</span><strong>{stats.active}</strong></article>
      <article className="panel"><span>체험 중</span><strong>{stats.trialing}</strong></article>
      <article className="panel"><span>미결제</span><strong>{stats.pastDue}</strong></article>
    </section>

    <section className="panel admin-override-panel">
      <div className="admin-privilege-head">
        <div>
          <h2>관리자 특권</h2>
          <p>할인은 1,000원 단위로 조정됩니다.</p>
        </div>

        <div className="active-privilege-summary">
          <span className={freeActive ? "privilege-chip active" : "privilege-chip"}>
            무료 이용 {freeActive ? "ON" : "OFF"}
          </span>
          <span className={totalDiscount > 0 ? "privilege-chip active" : "privilege-chip"}>
            현재 할인 {formatWon(totalDiscount)}
          </span>
        </div>
      </div>

      <div className="admin-override-grid">
        <label>사업장
          <select value={selected} onChange={(e) => { setSelected(e.target.value); setSuccess(""); setError(""); }}>
            {rows.map(row => (
              <option value={row.business_id} key={row.business_id}>
                {row.business?.name || row.business_id}
              </option>
            ))}
          </select>
        </label>

        <label>할인 금액
          <div className="money-stepper">
            <button type="button" onClick={() => adjustAmount(-1000)} disabled={saving || amount <= 1000}>−</button>
            <input
              type="number"
              min={1000}
              step={1000}
              value={amount}
              onChange={(e) => {
                const next = Number(e.target.value || 1000);
                setAmount(Math.max(1000, Math.round(next / 1000) * 1000));
              }}
            />
            <button type="button" onClick={() => adjustAmount(1000)} disabled={saving}>+</button>
          </div>
        </label>

        <label>사유
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      </div>

      <div className="admin-action-help">
        <span><strong>무료 이용 부여</strong> · 구독료를 0원 처리</span>
        <span><strong>할인 부여</strong> · 다음 자동결제 계산에 즉시 반영</span>
        <span><strong>특권 해제</strong> · 적용 중인 무료/할인을 모두 종료</span>
      </div>

      <div className="button-row">
        <button className="button primary" disabled={saving || !selected || !can("billing.manage")} onClick={() => apply("free")}>
          {saving ? "처리 중..." : "무료 이용 부여"}
        </button>
        <button className="button ghost" disabled={saving || !selected || !can("billing.manage")} onClick={() => apply("discount")}>
          {saving ? "처리 중..." : "할인 부여"}
        </button>
        <button className="button ghost danger-soft" disabled={saving || !selected || activeOverrides.length === 0 || !can("billing.manage")} onClick={() => apply("clear_overrides")}>
          {saving ? "처리 중..." : "특권 해제"}
        </button>
      </div>

      {activeOverrides.length > 0 && (
        <div className="active-overrides-list">
          <strong>현재 적용 중</strong>
          {activeOverrides.map((item) => (
            <div key={item.id} className="active-override-row">
              <span>
                {item.override_type === "free" ? "무료 이용" :
                 item.override_type === "discount" ? `할인 ${formatWon(Number(item.amount_cents || 0))}` :
                 item.override_type}
              </span>
              <small>{item.reason || "관리자 설정"}</small>
            </div>
          ))}
        </div>
      )}
    </section>

    <section className="panel">
      <h2>전체 구독 현황</h2>
      <div className="admin-sub-list">
        {rows.map(row => {
          const rowDiscount = (row.overrides || [])
            .filter(item => item.override_type === "discount")
            .reduce((sum, item) => sum + Number(item.amount_cents || 0), 0);
          const rowFree = (row.overrides || []).some(item => item.override_type === "free");

          return <article key={row.business_id} className="admin-sub-row">
            <div>
              <strong>{row.business?.name || "사업장"}</strong>
              <span>{row.business?.referral_code || "-"}</span>
            </div>
            <div><span>요금제</span><strong>{row.plan_code}</strong></div>
            <div><span>상태</span><strong>{row.status}</strong></div>
            <div><span>특권</span><strong>{rowFree ? "무료" : rowDiscount > 0 ? `-${formatWon(rowDiscount)}` : "-"}</strong></div>
            <div><span>다음 결제</span><strong>{row.next_billing_at ? new Date(row.next_billing_at).toLocaleDateString("ko-KR") : "-"}</strong></div>
            <div><span>실패</span><strong>{row.billing_failures}회</strong></div>
          </article>;
        })}
      </div>
    </section>
  </AppShell>;
}
