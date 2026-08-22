/*
  Friendly inbound aliases live alongside opaque routing aliases. The opaque
  address remains the internal binding for inbound audit records; this table is
  only a stable public-to-owner lookup on the already configured subdomain.
*/

begin;

create table if not exists public.friendly_email_aliases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  local_part text not null unique,
  email_address text not null unique,
  state text not null default 'active' check (state in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  disabled_at timestamptz,
  check (local_part ~ '^[a-z0-9][a-z0-9._-]{1,38}[a-z0-9]$'),
  check (email_address = local_part || '@in.receiptit.app')
);

create index if not exists friendly_email_aliases_active_address_idx
  on public.friendly_email_aliases (email_address)
  where state = 'active';

alter table public.friendly_email_aliases enable row level security;
revoke all on public.friendly_email_aliases from anon, authenticated;

create or replace function public.ensure_friendly_email_alias()
returns table (email_address text, state text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  profile_username text;
  candidate_local text;
  reserved_names constant text[] := array[
    'admin', 'administrator', 'api', 'billing', 'contact', 'help', 'info',
    'mail', 'postmaster', 'privacy', 'receipts', 'root', 'security', 'support',
    'team', 'test', 'www'
  ];
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;

  return query
    select a.email_address, a.state
    from public.friendly_email_aliases a
    where a.user_id = current_user_id and a.state = 'active'
    limit 1;
  if found then return; end if;

  select username into profile_username from public.profiles where id = current_user_id;
  candidate_local := lower(regexp_replace(coalesce(profile_username, ''), '[^a-z0-9._-]+', '-', 'g'));
  candidate_local := regexp_replace(candidate_local, '^[._-]+|[._-]+$', '', 'g');

  if candidate_local !~ '^[a-z0-9][a-z0-9._-]{1,38}[a-z0-9]$'
    or candidate_local = any(reserved_names) then
    raise exception 'A friendly receipt address is not available for this account';
  end if;

  insert into public.friendly_email_aliases (user_id, local_part, email_address)
  values (current_user_id, candidate_local, candidate_local || '@in.receiptit.app');

  return query select candidate_local || '@in.receiptit.app', 'active'::text;
exception when unique_violation then
  raise exception 'A friendly receipt address is not available for this account';
end;
$$;

create or replace function public.provision_friendly_email_alias_for_user(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  profile_username text;
  candidate_local text;
  existing_address text;
  reserved_names constant text[] := array[
    'admin', 'administrator', 'api', 'billing', 'contact', 'help', 'info',
    'mail', 'postmaster', 'privacy', 'receipts', 'root', 'security', 'support',
    'team', 'test', 'www'
  ];
begin
  if p_user_id is null then raise exception 'User id required'; end if;
  select email_address into existing_address from public.friendly_email_aliases
    where user_id = p_user_id and state = 'active' limit 1;
  if existing_address is not null then return existing_address; end if;

  select username into profile_username from public.profiles where id = p_user_id;
  candidate_local := lower(regexp_replace(coalesce(profile_username, ''), '[^a-z0-9._-]+', '-', 'g'));
  candidate_local := regexp_replace(candidate_local, '^[._-]+|[._-]+$', '', 'g');
  if candidate_local !~ '^[a-z0-9][a-z0-9._-]{1,38}[a-z0-9]$'
    or candidate_local = any(reserved_names) then
    raise exception 'A friendly receipt address is not available for this account';
  end if;

  insert into public.friendly_email_aliases (user_id, local_part, email_address)
  values (p_user_id, candidate_local, candidate_local || '@in.receiptit.app');
  return candidate_local || '@in.receiptit.app';
exception when unique_violation then
  raise exception 'A friendly receipt address is not available for this account';
end;
$$;

revoke all on function public.ensure_friendly_email_alias() from public;
grant execute on function public.ensure_friendly_email_alias() to authenticated;
revoke all on function public.provision_friendly_email_alias_for_user(uuid) from public, anon, authenticated;
grant execute on function public.provision_friendly_email_alias_for_user(uuid) to service_role;

commit;
