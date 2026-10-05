# LeadMate V2.4.4

V2.4.3 화면에서 `비즈니스 접근 권한이 없습니다.`가 표시되면서 카드 등록창이 열리지 않는 문제를 좁히고 수정한 패치입니다.

## 수정 핵심
- 결제 API의 business 접근권한 확인을 service-role 조회가 아니라 **현재 로그인 Supabase 세션**으로 변경
- service-role은 실제 서버 결제 데이터 조회/저장에만 사용
- `/billing`에 비즈니스 접근 진단 추가
  - 로그인 세션
  - business_members 멤버십
  - 현재 역할(owner/admin/member)
  - Supabase 서버키 연결
  - business_subscriptions 레코드
- generic `비즈니스 접근 권한이 없습니다.` 대신 구체적인 오류코드와 원인을 표시

## Supabase
추가 SQL 없음.

## 정상 기대값
로그인 세션 ✓
비즈니스 멤버십 ✓
Supabase 서버 연결 ✓
구독 레코드 ✓
현재 역할 owner

이 상태에서 카드 등록을 누르면 Toss 자동결제 인증창 단계로 넘어가야 합니다.
