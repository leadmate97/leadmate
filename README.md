# LeadMate V2.4.6

## 이번 버전
자동결제 등록 이후 운영에 필요한 기능을 추가했습니다.

### 사용자
- 결제내역 페이지 `/billing/history`
- 결제 성공/실패 상태 표시
- 추천 첫 결제 할인 및 크레딧 적용액 표시
- 다음 결제 예정일 확인
- 결제 실패 횟수 경고
- 결제 다시 시도 버튼
- 체험 종료/미결제 시 이용 제한 상태 표시 기반

### 관리자
- `/admin/subscriptions`
- 전체 사업장 구독 상태 확인
- 활성/체험/미결제 통계
- 무료 이용 특권 부여
- 할인 부여
- 관리자 특권 해제

### Supabase
이번에 새로 실행할 SQL:
`supabase/migrations/012_v2_4_6_billing_admin_access.sql`

기존 SQL은 다시 실행하지 마세요.

### 관리자 계정 등록
본인의 Supabase Auth user UUID를 확인한 뒤 한 번만 실행:

```sql
insert into public.app_admins(user_id, role)
values ('본인-auth-user-uuid', 'superadmin')
on conflict (user_id) do update set role = excluded.role;
```

### 중요
V2.4.6은 "접근 제한 상태"를 계산하고 UI에 경고하는 단계입니다.
실제 CRM 페이지 전체를 강제로 잠그는 전역 가드는 다음 마이너 버전에서 적용하는 것이 안전합니다.
테스트 중 관리자가 본인 계정을 실수로 잠그는 것을 방지하기 위해 이번 버전에서는 경고/상태 중심으로 구현했습니다.
