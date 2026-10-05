-- LeadMate V2.2.2 / DB permissions fix
-- 새 Supabase 프로젝트에서 V2 테이블 접근 권한이 누락되어
-- "permission denied for table business_members"가 발생하는 문제를 수정합니다.
-- RLS 정책은 그대로 유지되므로, 사용자는 정책이 허용한 행만 접근할 수 있습니다.

grant usage on schema public to authenticated;

grant select, insert, update, delete on table public.businesses to authenticated;
grant select, insert, update, delete on table public.business_members to authenticated;
grant select, insert, update, delete on table public.business_settings to authenticated;
grant select, insert, update, delete on table public.pipeline_stages to authenticated;

-- 앱의 기존 핵심 테이블도 새 프로젝트에서 명시적으로 권한을 보장합니다.
grant select, insert, update, delete on table public.users to authenticated;
grant select, insert, update, delete on table public.customers to authenticated;
grant select, insert, update, delete on table public.activities to authenticated;
grant select, insert, update, delete on table public.appointments to authenticated;
grant select on table public.schema_version to authenticated;

insert into public.schema_version (id, version)
values (1, '2.2.2')
on conflict (id) do update set version = excluded.version, applied_at = now();
