# LeadMate V3.0

V2.9의 미결제/체험종료 이용 제한과 V3.0의 운영 관리자 기능을 한 번에 포함한 출시 준비 버전입니다.

## V2.9 기능 포함: 구독 접근 제한
- 7일 무료체험 중: 정상 사용
- 정상 유료 구독: 정상 사용
- 관리자 무료 이용 특권: 정상 사용
- 관리자 계정: 정상 사용
- 체험 종료/구독 없음/미결제: 홈·고객·통계 접근 제한
- 제한 중에도 구독/설정은 접근 가능
- 구독 관리 화면으로 이동 안내

## V3.0 관리자 운영
`/admin`
- 전체 사업장
- 유료 구독
- 무료 체험
- 미결제
- 예상 MRR
- 이번 달 결제금액

`/admin/subscriptions`
- 기존 무료 이용/할인/특권 관리

`/admin/users`
- superadmin 전용
- 가입 이메일로 관리자 추가
- 역할 변경
- 관리자 권한 제거

관리자 역할:
- superadmin: 전체
- admin: 운영 관리
- billing_manager: 결제/구독
- support: 조회

## 출시 준비
- 결제 3일 전 구독 화면 안내
- 이용약관 `/terms`
- 개인정보처리방침 `/privacy`
- 환불·해지 정책 `/refund`

법률 문서는 출시 준비용 기본 문안이므로 실제 상용화 전 사업자 정보와 법률 검토가 필요합니다.

## Supabase
V2.8의 `013_v2_8_admin_roles_permissions.sql`까지 실행되어 있다면
이번에는 아래 SQL만 실행합니다.

`supabase/migrations/014_v3_0_operations_hardening.sql`

## 적용
ZIP을 기존 Git 폴더에 덮어쓴 뒤 build → commit → push 합니다.
