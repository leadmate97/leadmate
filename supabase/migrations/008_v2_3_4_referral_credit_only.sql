
-- LeadMate V2.3.4
-- Cumulative referral credits for subscription fee offsets only
-- Run AFTER 007_v2_3_2_referral_admin.sql
-- NOTE: Cashback/payout functionality is intentionally excluded.

create table if not exists public.referral_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  referral_id uuid references public.referrals(id) on delete set null,
  entry_type text not null check (entry_type in ('earn','invoice_offset','adjustment','reversal')),
  amount_cents integer not null,
  status text not null default 'available'
    check (status in ('pending','available','used','cancelled')),
  description text,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists referral_credit_ledger_business_idx
on public.referral_credit_ledger(business_id, created_at desc);

alter table public.referral_credit_ledger enable row level security;

drop policy if exists referral_ledger_select on public.referral_credit_ledger;
create policy referral_ledger_select on public.referral_credit_ledger
for select to authenticated
using (public.is_business_member(business_id) or public.is_app_admin());

grant select on public.referral_credit_ledger to authenticated;

-- Available referral balance
create or replace view public.referral_credit_balance as
select
  b.id as business_id,
  coalesce(sum(
    case when l.status = 'available' then l.amount_cents else 0 end
  ), 0)::integer as balance_cents
from public.businesses b
left join public.referral_credit_ledger l on l.business_id = b.id
group by b.id;

grant select on public.referral_credit_balance to authenticated;

-- Grant 5,000 KRW to the referrer once the referred user completes first paid subscription.
-- Intended to be called from a trusted server/webhook after verified payment success.
create or replace function public.grant_referrer_reward(p_referral_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.referrals%rowtype;
begin
  select * into r
  from public.referrals
  where id = p_referral_id;

  if not found then
    raise exception 'referral not found';
  end if;

  if r.referrer_discount_applied then
    return jsonb_build_object('ok', false, 'message', '이미 추천 보상이 지급되었습니다.');
  end if;

  insert into public.referral_credit_ledger(
    business_id,
    referral_id,
    entry_type,
    amount_cents,
    status,
    description
  )
  values (
    r.referrer_business_id,
    r.id,
    'earn',
    5000,
    'available',
    '지인 추천 구독료 할인 적립'
  );

  update public.referrals
  set referrer_discount_applied = true
  where id = r.id;

  return jsonb_build_object('ok', true, 'reward_cents', 5000);
end;
$$;

-- Do not grant execute to authenticated users.
-- Trigger this only from trusted payment confirmation logic.

-- Preview how accumulated credit reduces a subscription invoice.
-- Example: 4 referrals = 20,000 credit, personal plan 39,000 -> charge 19,000.
-- Example: 8 referrals = 40,000 credit, personal plan 39,000 -> charge 0, carry 1,000 forward.
create or replace function public.preview_credit_application(
  p_business_id uuid,
  p_invoice_cents integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_apply integer;
begin
  if not public.is_business_member(p_business_id) and not public.is_app_admin() then
    raise exception 'not authorized';
  end if;

  select coalesce(sum(amount_cents), 0)::integer
  into v_balance
  from public.referral_credit_ledger
  where business_id = p_business_id
    and status = 'available';

  v_apply := least(v_balance, greatest(p_invoice_cents, 0));

  return jsonb_build_object(
    'invoice_cents', greatest(p_invoice_cents, 0),
    'available_credit_cents', v_balance,
    'credit_to_apply_cents', v_apply,
    'amount_to_charge_cents', greatest(p_invoice_cents - v_apply, 0),
    'remaining_credit_cents', greatest(v_balance - v_apply, 0)
  );
end;
$$;

grant execute on function public.preview_credit_application(uuid, integer) to authenticated;

-- Admin-only helper to record an invoice credit usage.
create or replace function public.record_credit_usage(
  p_business_id uuid,
  p_amount_cents integer,
  p_description text default '구독료 차감'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer := p_amount_cents;
  r record;
  v_use integer;
begin
  if not public.is_app_admin() then
    raise exception 'admin only';
  end if;

  if p_amount_cents <= 0 then
    return jsonb_build_object('ok', false, 'message', '차감 금액은 0보다 커야 합니다.');
  end if;

  for r in
    select id, amount_cents
    from public.referral_credit_ledger
    where business_id = p_business_id
      and status = 'available'
      and amount_cents > 0
    order by created_at asc
  loop
    exit when v_remaining <= 0;
    v_use := least(r.amount_cents, v_remaining);

    update public.referral_credit_ledger
    set amount_cents = amount_cents - v_use,
        status = case when amount_cents - v_use = 0 then 'used' else status end
    where id = r.id;

    insert into public.referral_credit_ledger(
      business_id, entry_type, amount_cents, status, description
    )
    values (
      p_business_id, 'invoice_offset', -v_use, 'used', p_description
    );

    v_remaining := v_remaining - v_use;
  end loop;

  return jsonb_build_object(
    'ok', v_remaining = 0,
    'unused_requested_cents', greatest(v_remaining, 0)
  );
end;
$$;
