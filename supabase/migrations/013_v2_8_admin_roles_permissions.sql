-- LeadMate V2.8
-- Scalable admin roles and granular permissions.
-- Existing superadmin/admin accounts remain valid.

-- Expand role check constraint safely.
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

create table if not exists public.app_admin_permissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  permission_key text not null check (
    permission_key in ('billing.view','billing.manage','users.manage','system.manage')
  ),
  allowed boolean not null default true,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, permission_key)
);

alter table public.app_admin_permissions enable row level security;

drop policy if exists app_admin_permissions_self_or_admin on public.app_admin_permissions;
create policy app_admin_permissions_self_or_admin
on public.app_admin_permissions
for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.app_admins a
    where a.user_id = auth.uid()
      and a.role in ('superadmin','admin')
  )
);

grant select on public.app_admin_permissions to authenticated;
grant select, insert, update, delete on public.app_admin_permissions to service_role;

do $$
begin
  if to_regclass('public.schema_version') is not null then
    insert into public.schema_version (id, version)
    values (1, '2.8')
    on conflict (id) do update
    set version = excluded.version, applied_at = now();
  end if;
end $$;
