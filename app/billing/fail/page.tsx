"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function FailContent() {
  const params = useSearchParams();
  return <main className="billing-result"><div className="panel">
    <h1>결제수단 등록을 완료하지 못했습니다.</h1>
    <p>{params.get("message") || "카드 등록이 취소되었거나 실패했습니다."}</p>
    <Link className="button primary" href="/billing">요금제로 돌아가기</Link>
  </div></main>;
}
export default function BillingFailPage() {
  return <Suspense fallback={<main className="billing-result"><div className="panel"><p>확인 중...</p></div></main>}><FailContent /></Suspense>;
}
