-- LeadMate V3.0
-- Operations hardening. Run AFTER 013_v2_8_admin_roles_permissions.sql.

-- Ensure all supported admin roles remain valid.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.app_admins'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.app_admins drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.app_admins
  add constraint app_admins_role_check
  check (role in ('superadmin','admin','billing_manager','support'));

-- Add index for frequent admin lookup.
create index if not exists app_admins_role_idx on public.app_admins(role);

-- Protect permission table for server administration.
grant select on public.app_admins to authenticated;
grant select on public.app_admin_permissions to authenticated;
grant select, insert, update, delete on public.app_admins to service_role;
grant select, insert, update, delete on public.app_admin_permissions to service_role;

do $$
begin
  if to_regclass('public.schema_version') is not null then
    insert into public.schema_version (id, version)
    values (1, '3.0')
    on conflict (id) do update
    set version = excluded.version, applied_at = now();
  end if;
end $$;
