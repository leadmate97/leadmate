"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function BillingSuccessContent() {
  const params = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState("결제수단을 등록하는 중입니다...");

  useEffect(() => {
    const businessId = params.get("businessId");
    const authKey = params.get("authKey");
    const customerKey = params.get("customerKey");

    if (!businessId || !authKey || !customerKey) {
      setMessage("결제 인증 정보가 부족합니다.");
      return;
    }

    (async () => {
      const response = await fetch("/api/billing/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, authKey, customerKey })
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error || "결제수단 등록에 실패했습니다.");
        return;
      }
      setMessage("결제수단 등록이 완료되었습니다.");
      window.setTimeout(() => router.replace("/billing?registered=1"), 900);
    })();
  }, [params, router]);

  return <main className="billing-result"><div className="panel"><h1>LeadMate 자동결제</h1><p>{message}</p></div></main>;
}

export default function BillingSuccessPage() {
  return <Suspense fallback={<main className="billing-result"><div className="panel"><p>결제 인증 정보를 확인하는 중...</p></div></main>}>
    <BillingSuccessContent />
  </Suspense>;
}
