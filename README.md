# LeadMate V2.5

## 수정
Vercel build 오류를 수정했습니다.

오류:
`Cannot find name 'baseNavItems'`

### 변경 내용
- `components/AppShell.tsx`에 `baseNavItems`를 명시적으로 선언
- 관리자 계정이면 `관리자` 메뉴가 설정 아래에 추가
- 일반 계정에는 관리자 메뉴 숨김
- 기존 V2.4.8의 통합 구독 화면 유지
- 버전 표기를 앞으로 소수점 첫째 자리까지만 사용
- CSS autoprefixer 경고 일부 정리

## Supabase
추가 SQL 없음.
