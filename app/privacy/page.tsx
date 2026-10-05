import AppShell from "@/components/AppShell";

export default function Page() {
  return <AppShell>
    <div className="page-head"><div><p className="eyebrow">LEADMATE</p><h1>개인정보처리방침</h1><p>시행 전 검토용 기본 문안</p></div></div>
    <section className="panel legal-document">
      <p>LeadMate는 회원가입, 로그인, 고객관리, 구독 결제 및 서비스 운영에 필요한 정보를 처리합니다. 인증정보는 Supabase Auth를 통해 관리하며, 결제카드 인증 및 결제 처리는 결제대행사를 통해 이루어집니다. LeadMate는 카드 원문 번호나 비밀번호를 직접 저장하지 않는 구조를 사용합니다.</p><p>사용자가 입력한 고객정보는 해당 사업장의 영업관리 목적으로 저장됩니다. 실제 상용 출시 전 수집항목, 보유기간, 제3자 제공·처리위탁, 파기방법, 개인정보 보호책임자 정보를 사업자 기준으로 확정해야 합니다.</p>
    </section>
  </AppShell>;
}
