# LeadMate V2.4.5.1

## 수정 원인
`subscription_overrides` 테이블이 현재 Supabase 프로젝트에 없어서
기존 V2.4.5 권한 SQL이 중간에 실패했습니다.

## 적용
기존 `011_v2_4_5_service_role_permissions.sql`은 다시 실행하지 말고
아래 파일만 실행하세요.

`supabase/migrations/011_v2_4_5_1_service_role_permissions_safe.sql`

이 SQL은 각 테이블이 실제로 존재하는지 확인한 뒤
존재하는 테이블에만 service_role 권한을 부여합니다.

따라서 현재 프로젝트에 없는 테이블 때문에 전체 migration이 실패하지 않습니다.

## 기대 결과
실행 후 `/billing` 새로고침 시:

- 로그인 세션 ✓
- 비즈니스 멤버십 ✓
- Supabase 서버 연결 ✓
- 구독 레코드 ✓

가 되어야 합니다.
