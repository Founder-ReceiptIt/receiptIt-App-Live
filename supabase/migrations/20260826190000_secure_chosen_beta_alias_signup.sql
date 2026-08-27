/*
  Bind beta account creation, profile creation and a customer-chosen friendly
  inbound address into one server-only transaction. The opaque routing alias
  remains the internal inbox identity.
*/

begin;

create or replace function public.signup_authorization_is_valid(p_token_hash text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.signup_authorizations
    where token_hash = p_token_hash
      and p_token_hash ~ '^[0-9a-f]{64}$'
      and used_at is null
      and expires_at > now()
  );
$$;

create or replace function public.friendly_alias_is_available(p_local_part text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_local text := lower(trim(coalesce(p_local_part, '')));
  reserved_names constant text[] := array[
    'abuse', 'admin', 'administrator', 'api', 'billing', 'contact', 'email',
    'feedback', 'founder', 'help', 'hello', 'info', 'mail', 'no-reply',
    'noreply', 'notifications', 'postmaster', 'privacy', 'receipt', 'receiptit',
    'receipts', 'root', 'security', 'support', 'system', 'team', 'test', 'www'
  ];
begin
  if length(normalized_local) < 3
    or length(normalized_local) > 30
    or normalized_local !~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$'
    or normalized_local like '%--%'
    or normalized_local = any(reserved_names) then
    return false;
  end if;

  return not exists (
    select 1
    from public.friendly_email_aliases
    where local_part = normalized_local
  );
end;
$$;

create or replace function public.complete_beta_signup(
  p_user_id uuid,
  p_token_hash text,
  p_email text,
  p_full_name text,
  p_alias_local_part text
)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  normalized_email text := lower(trim(coalesce(p_email, '')));
  normalized_alias text := lower(trim(coalesce(p_alias_local_part, '')));
  friendly_address text;
  opaque_address text;
  authorization_consumed boolean;
begin
  if p_user_id is null
    or normalized_email = ''
    or not public.friendly_alias_is_available(normalized_alias) then
    raise exception 'signup_input_invalid';
  end if;

  update public.signup_authorizations
  set used_at = now()
  where token_hash = p_token_hash
    and p_token_hash ~ '^[0-9a-f]{64}$'
    and used_at is null
    and expires_at > now()
  returning true into authorization_consumed;

  if coalesce(authorization_consumed, false) is not true then
    raise exception 'signup_authorization_invalid';
  end if;

  insert into public.profiles (
    id,
    email,
    full_name,
    username,
    email_alias,
    plan
  ) values (
    p_user_id,
    normalized_email,
    nullif(trim(coalesce(p_full_name, '')), ''),
    normalized_alias,
    null,
    'free'
  );

  opaque_address := public.provision_email_alias_for_user(p_user_id);
  if opaque_address is null then
    raise exception 'opaque_alias_provisioning_failed';
  end if;

  friendly_address := normalized_alias || '@in.receiptit.app';
  insert into public.friendly_email_aliases (user_id, local_part, email_address)
  values (p_user_id, normalized_alias, friendly_address);

  return friendly_address;
end;
$$;

revoke all on function public.signup_authorization_is_valid(text) from public, anon, authenticated;
revoke all on function public.friendly_alias_is_available(text) from public, anon, authenticated;
revoke all on function public.complete_beta_signup(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.signup_authorization_is_valid(text) to service_role;
grant execute on function public.friendly_alias_is_available(text) to service_role;
grant execute on function public.complete_beta_signup(uuid, text, text, text, text) to service_role;

commit;
