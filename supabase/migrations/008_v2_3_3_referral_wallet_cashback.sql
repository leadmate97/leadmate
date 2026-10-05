
-- LeadMate V2.3.3
-- Cumulative referral credits + subscription offset + cashback foundation
-- Run AFTER 007_v2_3_2_referral_admin.sql

create table if not exists public.referral_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  referral_id uuid references public.referrals(id) on delete set null,
  entry_type text not null check (entry_type in ('earn','invoice_offset','cashback','adjustment','reversal')),
  amount_cents integer not null,
  status text not null default 'available' check (status in ('pending','available','used','paid','cancelled')),
  description text,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists referral_credit_ledger_business_idx
on public.referral_credit_ledger(business_id, created_at desc);

create table if not exists public.cashback_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  requested_cents integer not null check (requested_cents > 0),
  approved_cents integer,
  status text not null default 'requested'
    check (status in ('requested','approved','paid','rejected','cancelled')),
  payout_method text,
  payout_reference text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references auth.users(id) on delete set null,
  memo text
);

alter table public.referral_credit_ledger enable row level security;
alter table public.cashback_requests enable row level security;

drop policy if exists referral_ledger_select on public.referral_credit_ledger;
create policy referral_ledger_select on public.referral_credit_ledger
for select to authenticated
using (public.is_business_member(business_id) or public.is_app_admin());

drop policy if exists cashback_select on public.cashback_requests;
create policy cashback_select on public.cashback_requests
for select to authenticated
using (public.is_business_member(business_id) or public.is_app_admin());

drop policy if exists cashback_insert on public.cashback_requests;
create policy cashback_insert on public.cashback_requests
for insert to authenticated
with check (public.is_business_member(business_id));

drop policy if exists cashback_admin_update on public.cashback_requests;
create policy cashback_admin_update on public.cashback_requests
for update to authenticated
using (public.is_app_admin())
with check (public.is_app_admin());

grant select on public.referral_credit_ledger to authenticated;
grant select, insert on public.cashback_requests to authenticated;
grant update on public.cashback_requests to authenticated;

-- Available referral balance view
create or replace view public.referral_credit_balance as
select
  b.id as business_id,
  coalesce(sum(
    case
      when l.status in ('available','pending') then l.amount_cents
      when l.status in ('used','paid') then 0
      else 0
    end
  ),0)::integer as balance_cents
from public.businesses b
left join public.referral_credit_ledger l on l.business_id = b.id
group by b.id;

grant select on public.referral_credit_balance to authenticated;

-- Grant 5,000 KRW reward to referrer when a referred user's first paid subscription is confirmed.
-- This function is intended to be called by a trusted server/webhook after payment success.
create or replace function public.grant_referrer_reward(p_referral_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.referrals%rowtype;
begin
  select * into r from public.referrals where id = p_referral_id;
  if not found then
    raise exception 'referral not found';
  end if;

  if r.referrer_discount_applied then
    return jsonb_build_object('ok', false, 'message', '이미 추천 보상이 지급되었습니다.');
  end if;

  insert into public.referral_credit_ledger(
    business_id, referral_id, entry_type, amount_cents, status, description
  )
  values (
    r.referrer_business_id, r.id, 'earn', 5000, 'available',
    '지인 추천 보상'
  );

  update public.referrals
  set referrer_discount_applied = true
  where id = r.id;

  return jsonb_build_object('ok', true, 'reward_cents', 5000);
end;
$$;

-- Do not grant execute to authenticated users.
-- Call only from a trusted server/service role after verified payment success.

-- Helper to calculate how credits should be used for an invoice.
-- Example: 4 referrals = 20,000 credits, personal invoice 39,000 -> charge 19,000.
-- Example: 8 referrals = 40,000 credits, personal invoice 39,000 -> charge 0, remaining 1,000 credit.
create or replace function public.preview_credit_application(
  p_business_id uuid,
  p_invoice_cents integer
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bal as (
    select coalesce(sum(amount_cents),0)::integer as balance
    from public.referral_credit_ledger
    where business_id = p_business_id
      and status = 'available'
  )
  select jsonb_build_object(
    'invoice_cents', greatest(p_invoice_cents,0),
    'available_credit_cents', balance,
    'credit_to_apply_cents', least(balance, greatest(p_invoice_cents,0)),
    'amount_to_charge_cents', greatest(greatest(p_invoice_cents,0) - balance, 0),
    'remaining_credit_cents', greatest(balance - greatest(p_invoice_cents,0), 0)
  )
  from bal;
$$;

grant execute on function public.preview_credit_application(uuid, integer) to authenticated;

-- Cashback request guard:
-- Only credits remaining AFTER current subscription liability should be cashable.
-- Actual payout is manual/admin-approved until PG/bank payout integration is added.
create or replace function public.request_cashback(
  p_business_id uuid,
  p_requested_cents integer,
  p_current_subscription_cents integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_cashable integer;
begin
  if not public.is_business_member(p_business_id) then
    raise exception 'not authorized';
  end if;

  select coalesce(sum(amount_cents),0)::integer into v_balance
  from public.referral_credit_ledger
  where business_id = p_business_id
    and status = 'available';

  v_cashable := greatest(v_balance - greatest(p_current_subscription_cents,0), 0);

  if p_requested_cents <= 0 or p_requested_cents > v_cashable then
    return jsonb_build_object(
      'ok', false,
      'message', '현재 페이백 가능한 금액을 초과했습니다.',
      'cashable_cents', v_cashable
    );
  end if;

  insert into public.cashback_requests(
    business_id, requested_cents, status
  )
  values (
    p_business_id, p_requested_cents, 'requested'
  );

  return jsonb_build_object(
    'ok', true,
    'requested_cents', p_requested_cents,
    'cashable_cents', v_cashable
  );
end;
$$;

grant execute on function public.request_cashback(uuid, integer, integer) to authenticated;
