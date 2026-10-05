# LeadMate V2.8

## 관리자 메뉴 표시 방식
- 사이드바에서 `관리자 확인 중...` 문구를 완전히 제거했습니다.
- 일반 사용자는 아무 표시도 보이지 않습니다.
- `app_admins`에 등록된 계정으로 로그인했을 때만 `관리자` 메뉴가 조용히 추가됩니다.
- 관리자 여부를 UUID로 프론트 코드에 하드코딩하지 않습니다.

## 확장 가능한 관리자 권한
사업이 커졌을 때 계정별 역할을 나눌 수 있도록 기반을 추가했습니다.

기본 역할:
- `superadmin`: 전체 권한
- `admin`: 구독/사용자 관리
- `billing_manager`: 구독/결제 관리
- `support`: 조회 전용

권한 키:
- `billing.view`
- `billing.manage`
- `users.manage`
- `system.manage`

추가로 `app_admin_permissions`에서 특정 관리자에게 권한을 개별 허용/차단할 수 있습니다.

## Supabase
이번에는 아래 SQL만 새로 실행하세요.

`supabase/migrations/013_v2_8_admin_roles_permissions.sql`

기존 superadmin 계정은 그대로 유지됩니다.
