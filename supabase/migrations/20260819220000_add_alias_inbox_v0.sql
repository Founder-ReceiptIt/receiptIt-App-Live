/*
  ReceiptIt Alias Inbox v0

  Inbound aliases are deliberately separate from the early prototype's
  user-chosen `profiles.email_alias` field.  They are opaque, server-created
  addresses for receiving mail and never expose a profile or auth identifier.
*/

begin;

create table if not exists public.email_aliases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_part text not null unique,
  email_address text not null unique,
  state text not null default 'active'
    check (state in ('active', 'disabled', 'rotated')),
  created_at timestamptz not null default now(),
  disabled_at timestamptz,
  last_received_at timestamptz,
  check (local_part ~ '^ri-[a-f0-9]{40}$'),
  check (email_address = lower(email_address)),
  check (position('@' in email_address) > 3)
);

create unique index if not exists email_aliases_one_active_per_user
  on public.email_aliases (user_id)
  where state = 'active';

create index if not exists email_aliases_active_address_idx
  on public.email_aliases (email_address)
  where state = 'active';

create table if not exists public.inbound_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  alias_id uuid not null references public.email_aliases(id) on delete restrict,
  provider text not null default 'resend' check (provider in ('resend')),
  provider_event_id text not null,
  provider_message_id text,
  recipient_address text not null,
  sender_address text,
  reply_to_address text,
  sender_domain text,
  subject text,
  authentication_results jsonb not null default '{}'::jsonb,
  classification text not null default 'uncertain'
    check (classification in (
      'purchase_transactional', 'delivery_or_fulfilment', 'return_or_refund',
      'warranty_or_service', 'marketing', 'uncertain'
    )),
  status text not null default 'received'
    check (status in ('received', 'processing', 'processed', 'ignored', 'rejected', 'failed', 'duplicate')),
  error_reason text,
  body_sha256 text,
  attachment_count integer not null default 0 check (attachment_count between 0 and 5),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create unique index if not exists inbound_messages_provider_message_unique
  on public.inbound_messages (provider, provider_message_id)
  where provider_message_id is not null;

create index if not exists inbound_messages_user_received_idx
  on public.inbound_messages (user_id, received_at desc);

create table if not exists public.inbound_attachments (
  id uuid primary key default gen_random_uuid(),
  inbound_message_id uuid not null references public.inbound_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_attachment_id text,
  safe_filename text not null,
  content_type text not null,
  byte_size integer not null check (byte_size >= 0 and byte_size <= 6291456),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  storage_path text not null,
  receipt_id uuid references public.receipts(id) on delete set null,
  status text not null default 'stored'
    check (status in ('stored', 'queued', 'duplicate', 'rejected', 'failed')),
  error_reason text,
  created_at timestamptz not null default now(),
  unique (inbound_message_id, provider_attachment_id),
  unique (inbound_message_id, storage_path),
  check (storage_path like user_id::text || '/%')
);

create index if not exists inbound_attachments_user_idx
  on public.inbound_attachments (user_id, created_at desc);

create table if not exists public.inbound_webhook_rejections (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'resend' check (provider in ('resend')),
  provider_event_id text,
  recipient_hash text,
  reason text not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

alter table public.email_aliases enable row level security;
alter table public.inbound_messages enable row level security;
alter table public.inbound_attachments enable row level security;
alter table public.inbound_webhook_rejections enable row level security;

create policy "receiptit_email_aliases_select_own"
  on public.email_aliases for select to authenticated
  using (auth.uid() = user_id);

create policy "receiptit_inbound_messages_select_own"
  on public.inbound_messages for select to authenticated
  using (auth.uid() = user_id);

create policy "receiptit_inbound_attachments_select_own"
  on public.inbound_attachments for select to authenticated
  using (auth.uid() = user_id);

revoke all on public.email_aliases from anon, authenticated;
revoke all on public.inbound_messages from anon, authenticated;
revoke all on public.inbound_attachments from anon, authenticated;
revoke all on public.inbound_webhook_rejections from anon, authenticated;
grant select on public.email_aliases, public.inbound_messages, public.inbound_attachments to authenticated;

/* Returns an active opaque address for an authenticated customer. */
create or replace function public.ensure_active_email_alias()
returns table (email_address text, state text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  candidate_local text;
  candidate_address text;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  return query
    select a.email_address, a.state
    from public.email_aliases a
    where a.user_id = current_user_id and a.state = 'active'
    limit 1;

  if found then return; end if;

  loop
    candidate_local := 'ri-' || encode(gen_random_bytes(20), 'hex');
    candidate_address := candidate_local || '@in.receiptit.app';
    begin
      insert into public.email_aliases (user_id, local_part, email_address)
      values (current_user_id, candidate_local, candidate_address);
      update public.profiles
        set email_alias = candidate_address
        where id = current_user_id;
      return query select candidate_address, 'active'::text;
      return;
    exception when unique_violation then
      -- Collision is cryptographically implausible, but retry without exposing
      -- alias availability to the caller.
      null;
    end;
  end loop;
end;
$$;

/* Server-only helper for account creation. */
create or replace function public.provision_email_alias_for_user(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  existing_address text;
  candidate_local text;
  candidate_address text;
begin
  if p_user_id is null then raise exception 'User id required'; end if;
  select email_address into existing_address
    from public.email_aliases
    where user_id = p_user_id and state = 'active'
    limit 1;
  if existing_address is not null then return existing_address; end if;

  loop
    candidate_local := 'ri-' || encode(gen_random_bytes(20), 'hex');
    candidate_address := candidate_local || '@in.receiptit.app';
    begin
      insert into public.email_aliases (user_id, local_part, email_address)
      values (p_user_id, candidate_local, candidate_address);
      update public.profiles set email_alias = candidate_address where id = p_user_id;
      return candidate_address;
    exception when unique_violation then null;
    end;
  end loop;
end;
$$;

revoke all on function public.ensure_active_email_alias() from public;
grant execute on function public.ensure_active_email_alias() to authenticated;
revoke all on function public.provision_email_alias_for_user(uuid) from public, anon, authenticated;
grant execute on function public.provision_email_alias_for_user(uuid) to service_role;

comment on table public.inbound_messages is
  'Metadata-only inbound-email audit record. Full raw email bodies are deliberately not retained.';
comment on table public.inbound_attachments is
  'Private received attachment metadata. Originals remain in the receipts Storage bucket.';

commit;
