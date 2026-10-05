"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useBusinessSettings } from "@/lib/useBusinessSettings";
import { formatWon } from "@/lib/subscription";

type Tx = {
  id: string;
  order_id: string;
  amount_cents: number;
  discount_cents: number;
  credit_applied_cents: number;
  status: string;
  scheduled_for: string;
  paid_at: string | null;
  error_code: string | null;
  error_message: string | null;
};

const STATUS: Record<string,string> = {
  processing: "처리 중",
  paid: "결제 완료",
  credit_only: "크레딧 결제",
  failed: "결제 실패",
  canceled: "취소"
};

export default function BillingHistoryPage() {
  const { settings, loading } = useBusinessSettings();
  const [rows, setRows] = useState<Tx[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loading || !settings) return;
    (async () => {
      const response = await fetch(`/api/billing/history?businessId=${encodeURIComponent(settings.business_id)}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) setError(result.error || "결제내역을 불러오지 못했습니다.");
      else setRows(result.transactions || []);
    })();
  }, [loading, settings]);

  if (loading || !settings) return <AppShell><p>불러오는 중...</p></AppShell>;

  return <AppShell>
    <div className="page-head">
      <div><p className="eyebrow">BILLING HISTORY</p><h1>결제내역</h1><p>최근 자동결제 및 추천 크레딧 적용 내역입니다.</p></div>
    </div>

    {error && <p className="notice">{error}</p>}

    <section className="panel">
      {rows.length === 0 ? <p className="muted-text">아직 결제내역이 없습니다.</p> :
      <div className="billing-history-list">
        {rows.map((row) => <article key={row.id} className="billing-history-item">
          <div>
            <strong>{STATUS[row.status] || row.status}</strong>
            <span>{new Date(row.paid_at || row.scheduled_for).toLocaleString("ko-KR")}</span>
            <small>{row.order_id}</small>
          </div>
          <div className="billing-history-money">
            <strong>{formatWon(row.amount_cents)}</strong>
            {row.discount_cents > 0 && <span>추천 할인 -{formatWon(row.discount_cents)}</span>}
            {row.credit_applied_cents > 0 && <span>크레딧 -{formatWon(row.credit_applied_cents)}</span>}
          </div>
          {row.status === "failed" && <div className="billing-history-error">
            {row.error_code && <code>{row.error_code}</code>}
            <span>{row.error_message || "결제 실패"}</span>
          </div>}
        </article>)}
      </div>}
    </section>
  </AppShell>;
}
