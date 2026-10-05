"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";

type AdminRow = {
  user_id: string;
  email: string | null;
  role: string;
  created_at: string;
};

const ROLES = ["superadmin", "admin", "billing_manager", "support"];

export default function AdminUsersPage() {
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("admin");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) setError(result.error || "관리자 계정을 불러오지 못했습니다.");
    else setRows(result.rows || []);
  }

  useEffect(() => { load(); }, []);

  async function request(body: any) {
    setSaving(true);
    setMessage("");
    setError("");

    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const result = await response.json();

    if (!response.ok) setError(result.error || "관리자 설정에 실패했습니다.");
    else {
      setMessage(result.message || "완료했습니다.");
      await load();
    }

    setSaving(false);
  }

  return <AppShell>
    <div className="page-head">
      <div>
        <p className="eyebrow">ADMIN ACCESS</p>
        <h1>관리자 계정</h1>
        <p>LeadMate에 이미 가입한 이메일을 기준으로 관리자 권한을 부여합니다.</p>
      </div>
    </div>

    {message && <p className="notice admin-success">{message}</p>}
    {error && <p className="notice admin-error">{error}</p>}

    <section className="panel admin-add-user">
      <h2>관리자 추가</h2>
      <div className="admin-add-grid">
        <label>가입 이메일
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" />
        </label>
        <label>역할
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
      </div>
      <button className="button primary" disabled={saving || !email} onClick={() => request({ action: "add", email, role })}>
        관리자 추가
      </button>
    </section>

    <section className="panel">
      <h2>등록된 관리자</h2>
      <div className="admin-user-list">
        {rows.map((row) => (
          <article className="admin-user-row" key={row.user_id}>
            <div>
              <strong>{row.email || row.user_id}</strong>
              <span>{row.user_id}</span>
            </div>
            <select
              value={row.role}
              disabled={saving}
              onChange={(e) => request({ action: "role", userId: row.user_id, role: e.target.value })}
            >
              {ROLES.map((item) => <option key={item}>{item}</option>)}
            </select>
            <button className="button ghost danger-soft" disabled={saving} onClick={() => request({ action: "remove", userId: row.user_id })}>
              권한 제거
            </button>
          </article>
        ))}
      </div>
    </section>
  </AppShell>;
}
