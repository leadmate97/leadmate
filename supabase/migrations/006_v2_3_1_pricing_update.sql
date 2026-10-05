-- LeadMate V2.3.1 / 구독 정책 업데이트
-- 무료 체험 7일, 개인형 39,000원, 팀·사업장형 159,000원 기준
-- 001~005가 이미 적용된 프로젝트에서는 이 파일만 추가 실행하세요.

-- 기존 plan_code 데이터를 새 요금제 체계로 정리합니다.
alter table public.business_subscriptions drop constraint if exists business_subscriptions_plan_code_check;
alter table public.business_subscriptions drop constraint if exists business_subscriptions_pending_plan_code_check;

update public.business_subscriptions
set plan_code = case
  when plan_code in ('starter','pro') then 'personal'
  when plan_code = 'team' then 'team'
  else 'personal'
end;

update public.business_subscriptions
set pending_plan_code = case
  when pending_plan_code in ('starter','pro') then 'personal'
  when pending_plan_code = 'team' then 'team'
  else null
end
where pending_plan_code is not null;

alter table public.business_subscriptions alter column plan_code set default 'personal';
alter table public.business_subscriptions
  add constraint business_subscriptions_plan_code_check
  check (plan_code in ('personal','team'));
alter table public.business_subscriptions
  add constraint business_subscriptions_pending_plan_code_check
  check (pending_plan_code is null or pending_plan_code in ('personal','team'));

-- 앞으로 생성되는 무료 체험은 7일로 설정합니다.
alter table public.business_subscriptions
  alter column trial_ends_at set default (now() + interval '7 days');

-- 아직 체험 중인 기존 구독은 체험 시작일 기준 7일로 조정합니다.
update public.business_subscriptions
set trial_ends_at = trial_started_at + interval '7 days',
    updated_at = now()
where status = 'trialing';

-- 추천 할인 적용 준비 필드. 할인 금액은 서버/결제 webhook에서만 확정 적용할 예정입니다.
alter table public.business_subscriptions
  add column if not exists referral_code text,
  add column if not exists referral_discount_amount integer not null default 0
    check (referral_discount_amount >= 0);

insert into public.schema_version (id, version)
values (1, '2.3.1')
on conflict (id) do update set version = excluded.version, applied_at = now();
