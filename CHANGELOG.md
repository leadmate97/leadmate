# LeadMate Changelog

## V2.2.2
- 새 Supabase 프로젝트에서 `business_members` 접근 시 발생하는 `permission denied` 수정
- V2 핵심 테이블에 `authenticated` 역할의 CRUD 권한을 명시적으로 부여
- 기존 RLS 정책은 유지하여 사용자별/비즈니스별 데이터 격리 유지
- DB migration `004_v2_2_2_permissions.sql` 추가

## V2.2.1
- Vercel TypeScript build 오류 수정
- 고객 상세 저장 시 비즈니스 설정 null 안전성 보강
- Supabase DB 변경 없음

## V2.2.0
- 브라우저/웹 페이지 제목을 `LeadMate V1`에서 `LeadMate`로 변경
- 메타 설명을 범용 영업 CRM에 맞게 수정
- Supabase DB 변경 없음


## V2.1
- 사용자 정의 고객 항목 최대 8개 추가
- 영업 단계 명칭 직접 편집
- 유입경로 직접 추가/삭제
- 신규/상세 고객 화면에 사용자 정의 항목 연동
- 영업 통계 화면 추가
  - 전체 고객
  - 진행중 고객
  - 계약/완료 고객
  - 단순 전환율
  - 영업 단계별 분포
  - 유입경로별 분포
- DB migration `003_v2_1_customization.sql` 추가

## V2.0
- 범용 영업 CRM 구조
- 업종별 온보딩 및 용어/영업 단계 자동 설정
