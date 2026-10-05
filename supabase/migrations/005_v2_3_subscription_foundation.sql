-- LeadMate V2.3 / Subscription foundation
-- 실제 PG 결제 연결 전, 14일 체험판과 요금제 선택 상태를 관리합니다.
-- 001~004가 이미 적용된 프로젝트에서는 이 파일만 추가 실행하세요.

create table if not exists public.business_subscriptions (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  plan_code text not null default 'pro' check (plan_code in ('starter','pro','team')),
  pending_plan_code text check (pending_plan_code is null or pending_plan_code in ('starter','pro','team')),
  status text not null default 'trialing' check (status in ('trialing','active','past_due','canceled')),
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_subscriptions_status_idx on public.business_subscriptions(status);

alter table public.business_subscriptions enable row level security;

drop policy if exists "subscriptions_select_member" on public.business_subscriptions;
drop policy if exists "subscriptions_update_member" on public.business_subscriptions;

create policy "subscriptions_select_member" on public.business_subscriptions
for select using (
  exists (
    select 1 from public.business_members bm
    where bm.business_id = business_subscriptions.business_id
      and bm.user_id = auth.uid()
  )
);

create policy "subscriptions_update_member" on public.business_subscriptions
for update using (
  exists (
    select 1 from public.business_members bm
    where bm.business_id = business_subscriptions.business_id
      and bm.user_id = auth.uid()
      and bm.role in ('owner','admin')
  )
) with check (
  exists (
    select 1 from public.business_members bm
    where bm.business_id = business_subscriptions.business_id
      and bm.user_id = auth.uid()
      and bm.role in ('owner','admin')
  )
);

grant select on table public.business_subscriptions to authenticated;
grant update (pending_plan_code) on table public.business_subscriptions to authenticated;

create or replace function public.create_default_business_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.business_subscriptions (business_id)
  values (new.id)
  on conflict (business_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_create_default_business_subscription on public.businesses;
create trigger trg_create_default_business_subscription
after insert on public.businesses
for each row execute function public.create_default_business_subscription();

-- V2.3 이전에 생성된 비즈니스도 체험판 상태를 생성합니다.
insert into public.business_subscriptions (business_id)
select b.id
from public.businesses b
left join public.business_subscriptions s on s.business_id = b.id
where s.business_id is null;

insert into public.schema_version (id, version)
values (1, '2.3.0')
on conflict (id) do update set version = excluded.version, applied_at = now();
