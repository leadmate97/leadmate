-- LeadMate V2.4.6
-- Billing history / admin subscription control / access gating foundation
-- Run AFTER 011_v2_4_5_1_service_role_permissions_safe.sql

create table if not exists public.subscription_overrides (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  override_type text not null check (override_type in ('free','discount','plan','feature')),
  amount_cents integer,
  plan_key text,
  feature_key text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  reason text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin','superadmin')),
  created_at timestamptz not null default now()
);

alter table public.subscription_overrides enable row level security;
alter table public.app_admins enable row level security;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_admins a
    where a.user_id = auth.uid()
  );
$$;

drop policy if exists subscription_overrides_select on public.subscription_overrides;
create policy subscription_overrides_select
on public.subscription_overrides
for select to authenticated
using (public.is_business_member(business_id) or public.is_app_admin());

drop policy if exists subscription_overrides_admin_all on public.subscription_overrides;
create policy subscription_overrides_admin_all
on public.subscription_overrides
for all to authenticated
using (public.is_app_admin())
with check (public.is_app_admin());

drop policy if exists app_admins_select on public.app_admins;
create policy app_admins_select
on public.app_admins
for select to authenticated
using (user_id = auth.uid() or public.is_app_admin());

grant select on public.subscription_overrides to authenticated;
grant select on public.app_admins to authenticated;

-- billing transactions should already exist from V2.4.
-- Safe grants only if table exists.
do $$
begin
  if to_regclass('public.billing_transactions') is not null then
    grant select on table public.billing_transactions to authenticated;
    grant select, insert, update, delete on table public.billing_transactions to service_role;
  end if;

  if to_regclass('public.subscription_overrides') is not null then
    grant select, insert, update, delete on table public.subscription_overrides to service_role;
  end if;

  if to_regclass('public.app_admins') is not null then
    grant select, insert, update, delete on table public.app_admins to service_role;
  end if;
end $$;

-- effective access view: free/admin override keeps access open
create or replace view public.business_access_effective
with (security_invoker = true)
as
select
  b.id as business_id,
  bs.status as subscription_status,
  bs.trial_ends_at,
  bs.current_period_end,
  bs.cancel_at_period_end,
  exists (
    select 1
    from public.subscription_overrides so
    where so.business_id = b.id
      and so.active = true
      and so.override_type = 'free'
      and so.starts_at <= now()
      and (so.ends_at is null or so.ends_at > now())
  ) as has_free_override,
  case
    when exists (
      select 1
      from public.subscription_overrides so
      where so.business_id = b.id
        and so.active = true
        and so.override_type = 'free'
        and so.starts_at <= now()
        and (so.ends_at is null or so.ends_at > now())
    ) then true
    when bs.status = 'active' then true
    when bs.status = 'trialing' and bs.trial_ends_at > now() then true
    else false
  end as access_allowed
from public.businesses b
left join public.business_subscriptions bs on bs.business_id = b.id;

grant select on public.business_access_effective to authenticated;

do $$
begin
  if to_regclass('public.schema_version') is not null then
    insert into public.schema_version (id, version)
    values (1, '2.4.6')
    on conflict (id) do update
    set version = excluded.version, applied_at = now();
  end if;
end $$;
