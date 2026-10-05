
-- LeadMate V2.3.2 referral + admin foundation
create extension if not exists pgcrypto;

alter table if exists public.businesses
  add column if not exists referral_code text,
  add column if not exists referred_by_business_id uuid references public.businesses(id) on delete set null,
  add column if not exists referral_discount_cents integer not null default 0,
  add column if not exists admin_comped boolean not null default false,
  add column if not exists admin_plan_override text,
  add column if not exists admin_privileges jsonb not null default '{}'::jsonb;

update public.businesses
set referral_code = upper(substr(replace(id::text, '-', ''), 1, 8))
where referral_code is null;

create unique index if not exists businesses_referral_code_unique
on public.businesses(referral_code)
where referral_code is not null;

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_business_id uuid not null references public.businesses(id) on delete cascade,
  referred_business_id uuid not null references public.businesses(id) on delete cascade,
  referral_code text not null,
  referred_discount_cents integer not null default 10000,
  referrer_discount_cents integer not null default 5000,
  referred_discount_applied boolean not null default false,
  referrer_discount_applied boolean not null default false,
  created_at timestamptz not null default now(),
  unique (referred_business_id)
);

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin','superadmin')),
  created_at timestamptz not null default now()
);

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

alter table public.referrals enable row level security;
alter table public.app_admins enable row level security;
alter table public.subscription_overrides enable row level security;

create or replace function public.is_business_member(target_business uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.business_members bm
    where bm.business_id = target_business and bm.user_id = auth.uid()
  );
$$;

create or replace function public.is_app_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins a where a.user_id = auth.uid());
$$;

drop policy if exists referrals_select on public.referrals;
create policy referrals_select on public.referrals
for select to authenticated
using (
  public.is_business_member(referrer_business_id)
  or public.is_business_member(referred_business_id)
  or public.is_app_admin()
);

drop policy if exists referrals_insert on public.referrals;
create policy referrals_insert on public.referrals
for insert to authenticated
with check (
  public.is_business_member(referred_business_id)
  and exists (
    select 1 from public.businesses b
    where b.id = referrer_business_id
      and b.referral_code = referrals.referral_code
  )
);

drop policy if exists overrides_select on public.subscription_overrides;
create policy overrides_select on public.subscription_overrides
for select to authenticated
using (public.is_business_member(business_id) or public.is_app_admin());

drop policy if exists overrides_admin_all on public.subscription_overrides;
create policy overrides_admin_all on public.subscription_overrides
for all to authenticated
using (public.is_app_admin())
with check (public.is_app_admin());

grant select, insert on public.referrals to authenticated;
grant select on public.subscription_overrides to authenticated;
grant select on public.app_admins to authenticated;

create or replace function public.apply_referral_code(
  p_referred_business_id uuid,
  p_referral_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer public.businesses%rowtype;
begin
  if not public.is_business_member(p_referred_business_id) then
    raise exception 'not authorized';
  end if;

  if exists (
    select 1 from public.referrals
    where referred_business_id = p_referred_business_id
  ) then
    return jsonb_build_object('ok', false, 'message', '이미 추천인이 적용되어 있습니다.');
  end if;

  select * into v_referrer
  from public.businesses
  where upper(referral_code) = upper(trim(p_referral_code));

  if not found then
    return jsonb_build_object('ok', false, 'message', '유효하지 않은 지인 ID입니다.');
  end if;

  if v_referrer.id = p_referred_business_id then
    return jsonb_build_object('ok', false, 'message', '본인 추천 ID는 사용할 수 없습니다.');
  end if;

  insert into public.referrals(
    referrer_business_id, referred_business_id, referral_code,
    referred_discount_cents, referrer_discount_cents
  ) values (
    v_referrer.id, p_referred_business_id, v_referrer.referral_code, 10000, 5000
  );

  update public.businesses
  set referred_by_business_id = v_referrer.id,
      referral_discount_cents = 10000
  where id = p_referred_business_id;

  return jsonb_build_object(
    'ok', true,
    'message', '지인 추천이 적용되었습니다.',
    'new_user_discount_cents', 10000,
    'referrer_discount_cents', 5000
  );
end;
$$;

grant execute on function public.apply_referral_code(uuid, text) to authenticated;
