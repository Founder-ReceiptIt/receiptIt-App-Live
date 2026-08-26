/*
  Account-level currency preferences and historical FX cache.

  Receipt amounts/currencies remain immutable source evidence. These profile
  fields control only account-level presentation and aggregation.
*/

begin;

alter table public.profiles
  add column if not exists preferred_currency text not null default 'GBP',
  add column if not exists monthly_budget_amount numeric(14, 2) default 2500,
  add column if not exists monthly_budget_currency text not null default 'GBP',
  add column if not exists currency_setup_completed boolean not null default true,
  add column if not exists legacy_budget_migration_completed boolean not null default false;

alter table public.profiles
  drop constraint if exists profiles_preferred_currency_iso_4217,
  add constraint profiles_preferred_currency_iso_4217
    check (preferred_currency ~ '^[A-Z]{3}$'),
  drop constraint if exists profiles_monthly_budget_currency_iso_4217,
  add constraint profiles_monthly_budget_currency_iso_4217
    check (monthly_budget_currency ~ '^[A-Z]{3}$'),
  drop constraint if exists profiles_monthly_budget_positive,
  add constraint profiles_monthly_budget_positive
    check (monthly_budget_amount is null or monthly_budget_amount > 0),
  drop constraint if exists profiles_budget_matches_preferred_currency,
  add constraint profiles_budget_matches_preferred_currency
    check (monthly_budget_currency = preferred_currency);

-- Existing accounts retain the current GBP/£2,500 beta experience. New
-- accounts must explicitly confirm their suggested currency and budget.
alter table public.profiles
  alter column currency_setup_completed set default false,
  alter column legacy_budget_migration_completed set default true;

grant update (
  preferred_currency,
  monthly_budget_amount,
  monthly_budget_currency,
  currency_setup_completed,
  legacy_budget_migration_completed
) on table public.profiles to authenticated;

create table if not exists public.fx_rate_cache (
  source_currency text not null check (source_currency ~ '^[A-Z]{3}$'),
  target_currency text not null check (target_currency ~ '^[A-Z]{3}$'),
  requested_date date not null,
  rate_date date not null,
  rate numeric(24, 12) not null check (rate > 0),
  provider text not null default 'frankfurter',
  approximate boolean not null default false,
  fetched_at timestamptz not null default now(),
  primary key (source_currency, target_currency, requested_date)
);

alter table public.fx_rate_cache enable row level security;
revoke all on table public.fx_rate_cache from anon, authenticated;

comment on column public.profiles.preferred_currency is
  'ISO 4217 currency used for account-level presentation and aggregates only.';
comment on column public.profiles.monthly_budget_amount is
  'User-confirmed budget amount denominated in monthly_budget_currency.';
comment on table public.fx_rate_cache is
  'Server-only cache of Frankfurter historical reference rates.';

commit;
