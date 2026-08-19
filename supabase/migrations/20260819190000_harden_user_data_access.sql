/*
  ReceiptIt beta security hardening.

  The original prototype granted broad table privileges and relied on a mix of
  legacy RLS policies.  This migration makes the browser a read-only consumer
  of processor-created child data, prevents profile privilege escalation, and
  closes public access to operational logs and alpha codes.
*/

begin;

-- Operational logs and payments contain sensitive purchase information.
alter table public.processing_logs enable row level security;
alter table public.receipt_payments enable row level security;

-- Remove legacy/broad policies before installing one deliberate policy per
-- browser operation. Service-role processing remains unaffected by RLS.
drop policy if exists "Users can manage own profile" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

drop policy if exists "Enable select for users based on user_id" on public.receipts;
drop policy if exists "Enable insert for authenticated users" on public.receipts;
drop policy if exists "Enable delete for users based on user_id" on public.receipts;
drop policy if exists "Users can only see their own receipts" on public.receipts;
drop policy if exists "Users can see own receipts" on public.receipts;
drop policy if exists "Users can view own receipts" on public.receipts;
drop policy if exists "Users can insert own receipts" on public.receipts;
drop policy if exists "Users can update own receipts" on public.receipts;

drop policy if exists "Users can manage their own receipt items" on public.receipt_items;
drop policy if exists "Users can view their own receipt items" on public.receipt_items;

drop policy if exists "Users can view own receipt payments" on public.receipt_payments;
drop policy if exists "Users can manage own receipt payments" on public.receipt_payments;

drop policy if exists "Users can view own processing logs" on public.processing_logs;
drop policy if exists "Users can manage own processing logs" on public.processing_logs;

drop policy if exists "Users can insert bug reports" on public.bug_reports;
drop policy if exists "Users can view their own bug reports" on public.bug_reports;

drop policy if exists "Allow public read access to codes" on public.access_codes;
drop policy if exists "Anyone can read access codes" on public.access_codes;
drop policy if exists "Authenticated users can update codes they use" on public.access_codes;

create policy "receiptit_profiles_select_own"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

create policy "receiptit_profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

create policy "receiptit_profiles_update_own"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "receiptit_receipts_select_own"
  on public.receipts for select to authenticated
  using (auth.uid() = user_id);

create policy "receiptit_receipts_insert_own_processing"
  on public.receipts for insert to authenticated
  with check (
    auth.uid() = user_id
    and status = 'processing'
    and storage_path like auth.uid()::text || '/%'
    and image_url = storage_path
    and merchant = 'Analyzing...'
    and coalesce(amount, 0) = 0
    and coalesce(vat_amount, 0) = 0
  );

create policy "receiptit_receipts_update_own"
  on public.receipts for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "receiptit_receipts_delete_own"
  on public.receipts for delete to authenticated
  using (auth.uid() = user_id);

create policy "receiptit_receipt_items_select_own"
  on public.receipt_items for select to authenticated
  using (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_items.receipt_id
        and r.user_id = auth.uid()
    )
  );

create policy "receiptit_receipt_payments_select_own"
  on public.receipt_payments for select to authenticated
  using (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_payments.receipt_id
        and r.user_id = auth.uid()
    )
  );

create policy "receiptit_bug_reports_select_own"
  on public.bug_reports for select to authenticated
  using (auth.uid() = user_id);

create policy "receiptit_bug_reports_insert_own_receipt"
  on public.bug_reports for insert to authenticated
  with check (
    auth.uid() = user_id
    and receipt_id is not null
    and exists (
      select 1 from public.receipts r
      where r.id = bug_reports.receipt_id
        and r.user_id = auth.uid()
    )
  );

-- The browser only needs reads of its own profile and receipt records.  All
-- receipt child writes and operational writes are processor/service-role work.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant insert (id, email, full_name, email_alias, username) on table public.profiles to authenticated;
grant update (email, full_name, email_alias, username) on table public.profiles to authenticated;

revoke all on table public.receipts from anon, authenticated;
grant select, insert, update, delete on table public.receipts to authenticated;

revoke all on table public.receipt_items from anon, authenticated;
grant select on table public.receipt_items to authenticated;

revoke all on table public.receipt_payments from anon, authenticated;
grant select on table public.receipt_payments to authenticated;

revoke all on table public.processing_logs from anon, authenticated;

revoke all on table public.bug_reports from anon, authenticated;
grant select, insert on table public.bug_reports to authenticated;

revoke all on table public.access_codes from anon, authenticated;

-- Server-only, hashed abuse counters. These deliberately never store a raw IP
-- address, email address, or access code.
create table if not exists public.security_rate_limits (
  scope text not null,
  subject_hash text not null,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (scope, subject_hash)
);

alter table public.security_rate_limits enable row level security;
revoke all on table public.security_rate_limits from anon, authenticated;

create or replace function public.consume_security_rate_limit(
  p_scope text,
  p_subject_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_attempts integer;
begin
  if p_scope is null or length(p_scope) = 0
     or p_subject_hash is null or length(p_subject_hash) < 16
     or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Invalid rate-limit input';
  end if;

  insert into public.security_rate_limits as limits (
    scope, subject_hash, window_started_at, attempts, updated_at
  ) values (
    p_scope, p_subject_hash, now(), 1, now()
  )
  on conflict (scope, subject_hash) do update
  set
    window_started_at = case
      when limits.window_started_at < now() - make_interval(secs => p_window_seconds)
        then now()
      else limits.window_started_at
    end,
    attempts = case
      when limits.window_started_at < now() - make_interval(secs => p_window_seconds)
        then 1
      else limits.attempts + 1
    end,
    updated_at = now()
  returning attempts into current_attempts;

  return current_attempts <= p_limit;
end;
$$;

revoke all on function public.consume_security_rate_limit(text, text, integer, integer) from public;
revoke all on function public.consume_security_rate_limit(text, text, integer, integer) from anon, authenticated;
grant execute on function public.consume_security_rate_limit(text, text, integer, integer) to service_role;

-- An authenticated browser may only retry a receipt, confirm currency, or
-- move its own receipt between folders. It cannot alter extracted evidence,
-- ownership, or force a record to Ready/parsed.
create or replace function public.enforce_receiptit_client_receipt_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'authenticated' then
    if (to_jsonb(new) - array['status', 'error_reason', 'user_confirmed_currency', 'processing_attempt_started_at', 'folder'])
       is distinct from
       (to_jsonb(old) - array['status', 'error_reason', 'user_confirmed_currency', 'processing_attempt_started_at', 'folder']) then
      raise exception 'Receipt evidence fields are processor managed';
    end if;

    if new.status is distinct from old.status then
      if not (
        new.status = 'processing'
        and new.error_reason is null
        and new.processing_attempt_started_at is not null
        and old.status in ('failed', 'needs_input', 'needs_review', 'rejected')
      ) then
        raise exception 'Unsupported receipt status transition';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists receiptit_enforce_client_receipt_update on public.receipts;
create trigger receiptit_enforce_client_receipt_update
  before update on public.receipts
  for each row execute function public.enforce_receiptit_client_receipt_update();

commit;
