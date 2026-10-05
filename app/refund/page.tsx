import AppShell from "@/components/AppShell";

export default function Page() {
  return <AppShell>
    <div className="page-head"><div><p className="eyebrow">LEADMATE</p><h1>환불·해지 정책</h1><p>시행 전 검토용 기본 문안</p></div></div>
    <section className="panel legal-document">
      <p>무료 체험기간 중에는 구독료가 청구되지 않습니다. 유료 구독은 등록된 결제수단으로 월 단위 자동결제되며, 사용자는 구독 관리 화면에서 다음 갱신 전 해지를 신청할 수 있습니다. 해지하더라도 이미 결제된 이용기간 종료일까지 서비스 이용이 가능합니다.</p><p>관리자 할인 및 추천 크레딧은 현금으로 환급되지 않고 LeadMate 구독료 차감에만 사용됩니다. 실제 상용 출시 전 전자상거래 관련 법령과 결제대행사 정책에 맞춰 청약철회·환불 기준을 최종 확정해야 합니다.</p>
    </section>
  </AppShell>;
}
