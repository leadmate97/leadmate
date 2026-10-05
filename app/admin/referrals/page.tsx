"use client";

import { FormEvent, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/client";

type Biz = { id: string; name: string; referral_code: string | null };

export default function AdminReferralsPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [businesses, setBusinesses] = useState<Biz[]>([]);
  const [businessId, setBusinessId] = useState("");
  const [amount, setAmount] = useState("5000");
  const [reason, setReason] = useState("관리자 수동 조정");
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsAdmin(false); return; }
      const { data: admin } = await supabase.from("app_admins").select("user_id").eq("user_id", user.id).maybeSingle();
      const ok = Boolean(admin);
      setIsAdmin(ok);
      if (!ok) return;
      const { data } = await supabase.from("businesses").select("id,name,referral_code").order("name");
      const rows = (data as Biz[] | null) || [];
      setBusinesses(rows);
      if (rows[0]) setBusinessId(rows[0].id);
    })();
  }, []);

  async function adjust(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    const value = Number(amount);
    if (!businessId || !Number.isFinite(value) || value === 0) { setMessage("사업장과 조정 금액을 확인해주세요."); return; }
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_adjust_referral_credit", {
      p_business_id: businessId,
      p_amount_cents: value,
      p_reason: reason
    });
    if (error) setMessage(error.message);
    else setMessage(data?.ok ? "크레딧을 조정했습니다." : data?.message || "조정하지 못했습니다.");
  }

  if (isAdmin === null) return <AppShell><p>관리자 권한 확인 중...</p></AppShell>;
  if (!isAdmin) return <AppShell><section className="panel"><h1>접근 권한 없음</h1><p>LeadMate 관리자 계정만 접근할 수 있습니다.</p></section></AppShell>;

  return <AppShell>
    <div className="page-head"><div><p className="eyebrow">ADMIN</p><h1>추천 크레딧 관리</h1><p>특정 사업장의 추천 크레딧을 운영자가 수동 조정할 수 있습니다.</p></div></div>
    <section className="panel form-panel">
      <form className="form-stack" onSubmit={adjust}>
        <label>사업장<select value={businessId} onChange={(e)=>setBusinessId(e.target.value)}>{businesses.map((b)=><option key={b.id} value={b.id}>{b.name} · {b.referral_code || "-"}</option>)}</select></label>
        <label>조정 금액(원)<input type="number" value={amount} onChange={(e)=>setAmount(e.target.value)} placeholder="예: 5000 또는 -5000" /></label>
        <label>사유<input value={reason} onChange={(e)=>setReason(e.target.value)} /></label>
        {message && <p className="notice">{message}</p>}
        <button className="button primary">크레딧 조정</button>
      </form>
    </section>
  </AppShell>;
}
