import AppShell from "@/components/AppShell";

export default function Page() {
  return <AppShell>
    <div className="page-head"><div><p className="eyebrow">LEADMATE</p><h1>이용약관</h1><p>시행 전 검토용 기본 문안</p></div></div>
    <section className="panel legal-document">
      <p>LeadMate는 영업 고객관리와 구독형 소프트웨어 기능을 제공합니다. 사용자는 자신의 계정과 고객정보를 적법하게 관리해야 하며, 서비스의 비정상적 이용·무단 접근·권한 오남용을 해서는 안 됩니다. 유료 구독은 선택한 요금제와 결제주기에 따라 갱신되며, 해지는 현재 이용기간 종료 시점부터 적용됩니다.</p><p>본 문서는 출시 준비용 기본 문안입니다. 실제 상용 출시 전 사업자 정보, 책임 범위, 분쟁 관할, 서비스 중단 및 데이터 처리 조항을 포함해 전문가 검토를 권장합니다.</p>
    </section>
  </AppShell>;
}
