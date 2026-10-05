-- LeadMate V2.4.5
-- Fix server-side billing permissions for Supabase service_role.
-- Run AFTER 010_v2_4_toss_recurring_billing.sql.

grant usage on schema public to service_role;

grant select, insert, update, delete on table public.businesses to service_role;
grant select, insert, update, delete on table public.business_members to service_role;
grant select, insert, update, delete on table public.business_subscriptions to service_role;

grant select, insert, update, delete on table public.billing_payment_methods to service_role;
grant select, insert, update, delete on table public.billing_transactions to service_role;

grant select, insert, update, delete on table public.referrals to service_role;
grant select, insert, update, delete on table public.referral_credit_ledger to service_role;

grant select, insert, update, delete on table public.subscription_overrides to service_role;
grant select, insert, update, delete on table public.app_admins to service_role;

-- Current project uses UUID primary keys, but grant sequence access too for future-safe server tables.
grant usage, select on all sequences in schema public to service_role;

-- Make future tables created by the current schema owner available to service_role.
-- This is safe for a trusted server role and avoids the same issue on later billing tables.
alter default privileges in schema public
grant select, insert, update, delete on tables to service_role;

alter default privileges in schema public
grant usage, select on sequences to service_role;

-- Keep RLS enabled. service_role is trusted server-side and bypasses RLS when the real service_role key is used.

insert into public.schema_version (id, version)
values (1, '2.4.5')
on conflict (id) do update
set version = excluded.version, applied_at = now();
