/*
  Beta access keys must protect the account-creation endpoint itself, not only
  a browser gate that can be bypassed with local storage.  The Edge verifier
  issues a short-lived opaque authorization and this function consumes it once
  before a new auth user can be created.
*/

begin;

create table if not exists public.signup_authorizations (
  token_hash text primary key,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint signup_authorizations_token_hash_length check (length(token_hash) = 64)
);

alter table public.signup_authorizations enable row level security;
revoke all on table public.signup_authorizations from public, anon, authenticated;

create or replace function public.consume_signup_authorization(p_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  consumed boolean;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  update public.signup_authorizations
  set used_at = now()
  where token_hash = p_token_hash
    and used_at is null
    and expires_at > now()
  returning true into consumed;

  return coalesce(consumed, false);
end;
$$;

revoke all on function public.consume_signup_authorization(text) from public, anon, authenticated;
grant execute on function public.consume_signup_authorization(text) to service_role;

commit;
