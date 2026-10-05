
-- LeadMate V2.3.4.1 cumulative referral credits, subscription offsets only
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

create or replace view public.referral_credit_balance as
select
  b.id as business_id,
  coalesce(sum(case when l.status = 'available' then l.amount_cents else 0 end), 0)::integer as balance_cents
from public.businesses b
left join public.referral_credit_ledger l on l.business_id = b.id
group by b.id;

grant select on public.referral_credit_balance to authenticated;

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
  if not found then raise exception 'referral not found'; end if;

  if r.referrer_discount_applied then
    return jsonb_build_object('ok', false, 'message', '이미 추천 보상이 지급되었습니다.');
  end if;

  insert into public.referral_credit_ledger(
    business_id, referral_id, entry_type, amount_cents, status, description
  ) values (
    r.referrer_business_id, r.id, 'earn', 5000, 'available',
    '지인 추천 구독료 할인 적립'
  );

  update public.referrals
  set referrer_discount_applied = true
  where id = r.id;

  return jsonb_build_object('ok', true, 'reward_cents', 5000);
end;
$$;

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

  select coalesce(sum(amount_cents),0)::integer
  into v_balance
  from public.referral_credit_ledger
  where business_id = p_business_id and status = 'available';

  v_apply := least(v_balance, greatest(p_invoice_cents,0));

  return jsonb_build_object(
    'invoice_cents', greatest(p_invoice_cents,0),
    'available_credit_cents', v_balance,
    'credit_to_apply_cents', v_apply,
    'amount_to_charge_cents', greatest(p_invoice_cents-v_apply,0),
    'remaining_credit_cents', greatest(v_balance-v_apply,0)
  );
end;
$$;

grant execute on function public.preview_credit_application(uuid, integer) to authenticated;
