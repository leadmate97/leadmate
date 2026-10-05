-- LeadMate V2.4.5.1
-- Safe service_role grants that skip tables which do not exist.
-- Run instead of 011_v2_4_5_service_role_permissions.sql.

grant usage on schema public to service_role;

do $$
declare
  t text;
  tables_to_grant text[] := array[
    'businesses',
    'business_members',
    'business_subscriptions',
    'billing_payment_methods',
    'billing_transactions',
    'referrals',
    'referral_credit_ledger',
    'subscription_overrides',
    'app_admins'
  ];
begin
  foreach t in array tables_to_grant loop
    if to_regclass('public.' || t) is not null then
      execute format(
        'grant select, insert, update, delete on table public.%I to service_role',
        t
      );
    end if;
  end loop;
end $$;

grant usage, select on all sequences in schema public to service_role;

alter default privileges in schema public
grant select, insert, update, delete on tables to service_role;

alter default privileges in schema public
grant usage, select on sequences to service_role;

-- Update schema version only if the table exists.
do $$
begin
  if to_regclass('public.schema_version') is not null then
    insert into public.schema_version (id, version)
    values (1, '2.4.5.1')
    on conflict (id) do update
    set version = excluded.version,
        applied_at = now();
  end if;
end $$;
