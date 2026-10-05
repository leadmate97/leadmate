-- LeadMate V2.4 / Toss Payments recurring billing
-- Run AFTER 009_v2_3_5_referral_ui_admin.sql.

alter table public.business_subscriptions
  add column if not exists next_billing_at timestamptz,
  add column if not exists last_payment_at timestamptz,
  add column if not exists last_payment_amount integer,
  add column if not exists billing_failures integer not null default 0;

update public.business_subscriptions
set next_billing_at = coalesce(next_billing_at, current_period_end, trial_ends_at)
where next_billing_at is null;

create table if not exists public.billing_payment_methods (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  provider text not null default 'toss',
  provider_customer_key text not null,
  provider_billing_key text not null,
  method text,
  card_issuer_code text,
  card_number_masked text,
  authenticated_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- billingKey는 민감정보이므로 authenticated/anon에 테이블 권한을 주지 않습니다.
alter table public.billing_payment_methods enable row level security;
revoke all on table public.billing_payment_methods from anon, authenticated;

create table if not exists public.billing_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id text not null unique,
  payment_key text,
  amount_cents integer not null default 0,
  discount_cents integer not null default 0,
  credit_applied_cents integer not null default 0,
  status text not null check (status in ('processing','paid','credit_only','failed','canceled')),
  scheduled_for timestamptz not null,
  paid_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
);

create unique index if not exists billing_transactions_business_cycle_unique
on public.billing_transactions(business_id, scheduled_for);

alter table public.billing_transactions enable row level security;

drop policy if exists billing_transactions_select_member on public.billing_transactions;
create policy billing_transactions_select_member
on public.billing_transactions
for select to authenticated
using (public.is_business_member(business_id) or public.is_app_admin());

grant select on public.billing_transactions to authenticated;

-- 추천 크레딧은 earn(+), invoice_offset(-), adjustment(+/-)의 누적으로 계산합니다.
create or replace view public.referral_credit_balance
with (security_invoker = true)
as
select
  b.id as business_id,
  coalesce(sum(
    case when l.status <> 'cancelled' then l.amount_cents else 0 end
  ),0)::integer as balance_cents
from public.businesses b
left join public.referral_credit_ledger l on l.business_id = b.id
group by b.id;

grant select on public.referral_credit_balance to authenticated;

-- 추천 보상 서버 함수는 브라우저에서 직접 호출하지 못하도록 제한합니다.
do $$
begin
  if to_regprocedure('public.grant_referrer_reward(uuid)') is not null then
    revoke all on function public.grant_referrer_reward(uuid) from public, anon, authenticated;
    grant execute on function public.grant_referrer_reward(uuid) to service_role;
  end if;
end $$;

insert into public.schema_version (id, version)
values (1, '2.4.0')
on conflict (id) do update set version = excluded.version, applied_at = now();
