/*
  Targeted receipt reassessment.

  A retry keeps the same receipt and private evidence, records the trusted
  baseline, and lets the existing processors take a second look. The merge
  guards stop a weaker pass from erasing known facts or child detail.
*/

begin;

create table if not exists public.receipt_reassessments (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  trigger_reason text not null default 'user_retry',
  unresolved_fields text[] not null default '{}',
  prior_status text not null,
  prior_error_reason text,
  prior_confidence numeric,
  receipt_snapshot jsonb not null,
  items_snapshot jsonb not null default '[]'::jsonb,
  payments_snapshot jsonb not null default '[]'::jsonb,
  outcome_status text,
  requested_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create unique index if not exists receipt_reassessments_one_pending_per_receipt
  on public.receipt_reassessments(receipt_id)
  where completed_at is null;

create index if not exists receipt_reassessments_owner_recent
  on public.receipt_reassessments(user_id, requested_at desc);

alter table public.receipt_reassessments enable row level security;

drop policy if exists receipt_reassessments_select_own on public.receipt_reassessments;
create policy receipt_reassessments_select_own
  on public.receipt_reassessments for select to authenticated
  using (auth.uid() = user_id);

revoke all on table public.receipt_reassessments from public, anon, authenticated;
grant select on table public.receipt_reassessments to authenticated;

create or replace function public.request_receipt_reassessment(p_receipt_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  current_receipt public.receipts%rowtype;
  assessment_id uuid;
  missing_fields text[] := '{}';
  saved_items jsonb := '[]'::jsonb;
  saved_payments jsonb := '[]'::jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  select * into current_receipt
  from public.receipts
  where id = p_receipt_id and user_id = caller_id
  for update;

  if not found then
    raise exception 'Receipt not found';
  end if;

  if current_receipt.status not in ('failed', 'error', 'needs_input', 'needs_review', 'rejected') then
    raise exception 'Receipt is not available for reassessment';
  end if;

  if coalesce(current_receipt.processing_attempts, 1) >= 5 then
    raise exception 'Retry limit reached. Please report this receipt for help.';
  end if;

  if current_receipt.amount is null then missing_fields := array_append(missing_fields, 'amount'); end if;
  if current_receipt.merchant is null
     or btrim(current_receipt.merchant) = ''
     or lower(btrim(current_receipt.merchant)) = 'analyzing...' then
    missing_fields := array_append(missing_fields, 'merchant');
  end if;
  if current_receipt.currency is null or btrim(current_receipt.currency) = '' then
    missing_fields := array_append(missing_fields, 'currency');
  end if;
  if current_receipt.transaction_date is null then missing_fields := array_append(missing_fields, 'purchase_date'); end if;
  if not exists (select 1 from public.receipt_items where receipt_id = current_receipt.id) then
    missing_fields := array_append(missing_fields, 'items');
  end if;

  select coalesce(jsonb_agg(to_jsonb(item) - array['id', 'receipt_id', 'created_at']), '[]'::jsonb)
    into saved_items
  from public.receipt_items item
  where item.receipt_id = current_receipt.id;

  select coalesce(jsonb_agg(to_jsonb(payment) - array['id', 'receipt_id', 'created_at']), '[]'::jsonb)
    into saved_payments
  from public.receipt_payments payment
  where payment.receipt_id = current_receipt.id;

  insert into public.receipt_reassessments (
    receipt_id,
    user_id,
    trigger_reason,
    unresolved_fields,
    prior_status,
    prior_error_reason,
    prior_confidence,
    receipt_snapshot,
    items_snapshot,
    payments_snapshot
  ) values (
    current_receipt.id,
    caller_id,
    case when current_receipt.status = 'needs_review' then 'ai_review_assist' else 'user_retry' end,
    missing_fields,
    current_receipt.status,
    current_receipt.error_reason,
    current_receipt.confidence_score,
    to_jsonb(current_receipt),
    saved_items,
    saved_payments
  )
  on conflict (receipt_id) where completed_at is null do update
  set trigger_reason = excluded.trigger_reason,
      unresolved_fields = excluded.unresolved_fields,
      prior_status = excluded.prior_status,
      prior_error_reason = excluded.prior_error_reason,
      prior_confidence = excluded.prior_confidence,
      receipt_snapshot = excluded.receipt_snapshot,
      items_snapshot = excluded.items_snapshot,
      payments_snapshot = excluded.payments_snapshot,
      requested_at = timezone('utc', now())
  returning id into assessment_id;

  perform set_config('receiptit.reassessment_rpc', 'on', true);

  update public.receipts
  set status = 'processing',
      error_reason = 'review_assist_requested',
      processing_attempt_started_at = timezone('utc', now()),
      processing_attempts = coalesce(processing_attempts, 1) + 1
  where id = current_receipt.id and user_id = caller_id;

  return assessment_id;
end;
$$;

revoke all on function public.request_receipt_reassessment(uuid) from public, anon;
grant execute on function public.request_receipt_reassessment(uuid) to authenticated;

create or replace function public.preserve_receipt_reassessment_baseline()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  assessment public.receipt_reassessments%rowtype;
  baseline jsonb;
  baseline_confidence numeric;
  next_confidence numeric;
begin
  select * into assessment
  from public.receipt_reassessments
  where receipt_id = new.id and completed_at is null
  order by requested_at desc
  limit 1;

  if not found then return new; end if;

  baseline := assessment.receipt_snapshot;
  baseline_confidence := coalesce(assessment.prior_confidence, -1);
  next_confidence := coalesce(new.confidence_score, -1);

  new.merchant := coalesce(nullif(btrim(new.merchant), ''), nullif(baseline->>'merchant', ''));
  new.amount := coalesce(new.amount, nullif(baseline->>'amount', '')::numeric);
  new.amount_gbp := coalesce(new.amount_gbp, nullif(baseline->>'amount_gbp', '')::numeric);
  new.subtotal := coalesce(nullif(btrim(new.subtotal), ''), nullif(baseline->>'subtotal', ''));
  new.vat_amount := coalesce(new.vat_amount, nullif(baseline->>'vat_amount', '')::numeric);
  new.discount_amount := coalesce(new.discount_amount, nullif(baseline->>'discount_amount', '')::numeric);
  new.currency := coalesce(nullif(btrim(new.currency), ''), nullif(baseline->>'currency', ''));
  new.transaction_date := coalesce(new.transaction_date, nullif(baseline->>'transaction_date', '')::date);
  new.category := coalesce(nullif(btrim(new.category), ''), nullif(baseline->>'category', ''));
  new.card_last_4 := coalesce(nullif(btrim(new.card_last_4), ''), nullif(baseline->>'card_last_4', ''));
  new.reference_number := coalesce(nullif(btrim(new.reference_number), ''), nullif(baseline->>'reference_number', ''));
  new.order_number := coalesce(nullif(btrim(new.order_number), ''), nullif(baseline->>'order_number', ''));
  new.invoice_number := coalesce(nullif(btrim(new.invoice_number), ''), nullif(baseline->>'invoice_number', ''));
  new.document_type := coalesce(nullif(btrim(new.document_type), ''), nullif(baseline->>'document_type', ''));

  if next_confidence < baseline_confidence then
    new.merchant := coalesce(nullif(baseline->>'merchant', ''), new.merchant);
    new.amount := coalesce(nullif(baseline->>'amount', '')::numeric, new.amount);
    new.amount_gbp := coalesce(nullif(baseline->>'amount_gbp', '')::numeric, new.amount_gbp);
    new.subtotal := coalesce(nullif(baseline->>'subtotal', ''), new.subtotal);
    new.vat_amount := coalesce(nullif(baseline->>'vat_amount', '')::numeric, new.vat_amount);
    new.discount_amount := coalesce(nullif(baseline->>'discount_amount', '')::numeric, new.discount_amount);
    new.currency := coalesce(nullif(baseline->>'currency', ''), new.currency);
    new.transaction_date := coalesce(nullif(baseline->>'transaction_date', '')::date, new.transaction_date);
    new.category := coalesce(nullif(baseline->>'category', ''), new.category);
    new.card_last_4 := coalesce(nullif(baseline->>'card_last_4', ''), new.card_last_4);
    new.reference_number := coalesce(nullif(baseline->>'reference_number', ''), new.reference_number);
    new.order_number := coalesce(nullif(baseline->>'order_number', ''), new.order_number);
    new.invoice_number := coalesce(nullif(baseline->>'invoice_number', ''), new.invoice_number);
    new.document_type := coalesce(nullif(baseline->>'document_type', ''), new.document_type);
  end if;

  return new;
end;
$$;

drop trigger if exists receiptit_preserve_reassessment_baseline on public.receipts;
create trigger receiptit_preserve_reassessment_baseline
  before update on public.receipts
  for each row execute function public.preserve_receipt_reassessment_baseline();

create or replace function public.finish_receipt_reassessment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assessment public.receipt_reassessments%rowtype;
  prior_rank integer;
  next_rank integer;
  lower_confidence boolean;
begin
  if pg_trigger_depth() > 1 or new.status not in ('parsed', 'completed', 'needs_review', 'needs_input', 'rejected', 'failed', 'error') then
    return new;
  end if;

  select * into assessment
  from public.receipt_reassessments
  where receipt_id = new.id and completed_at is null
  order by requested_at desc
  limit 1
  for update;

  if not found then return new; end if;

  prior_rank := case assessment.prior_status
    when 'parsed' then 4 when 'completed' then 4 when 'needs_review' then 3
    when 'needs_input' then 2 when 'rejected' then 1 when 'failed' then 1 when 'error' then 1 else 0 end;
  next_rank := case new.status
    when 'parsed' then 4 when 'completed' then 4 when 'needs_review' then 3
    when 'needs_input' then 2 when 'rejected' then 1 when 'failed' then 1 when 'error' then 1 else 0 end;

  lower_confidence := coalesce(new.confidence_score, -1) < coalesce(assessment.prior_confidence, -1);

  if jsonb_array_length(assessment.items_snapshot) > 0
     and (lower_confidence or not exists (select 1 from public.receipt_items where receipt_id = new.id)) then
    if lower_confidence then
      delete from public.receipt_items where receipt_id = new.id;
    end if;
    insert into public.receipt_items (
      receipt_id, line_index, description, quantity, unit_price, line_total,
      vat_rate, vat_amount, item_type, quantity_unit, raw_description,
      display_name, brand_name
    )
    select new.id, item.line_index, item.description, item.quantity, item.unit_price,
      item.line_total, item.vat_rate, item.vat_amount, item.item_type,
      item.quantity_unit, item.raw_description, item.display_name, item.brand_name
    from jsonb_to_recordset(assessment.items_snapshot) as item(
      line_index integer, description text, quantity numeric, unit_price numeric,
      line_total numeric, vat_rate numeric, vat_amount numeric, item_type text,
      quantity_unit text, raw_description text, display_name text, brand_name text
    );
  end if;

  if jsonb_array_length(assessment.payments_snapshot) > 0
     and (lower_confidence or not exists (select 1 from public.receipt_payments where receipt_id = new.id)) then
    if lower_confidence then
      delete from public.receipt_payments where receipt_id = new.id;
    end if;
    insert into public.receipt_payments (receipt_id, method, amount, currency, payment_date)
    select new.id, payment.method, payment.amount, payment.currency, payment.payment_date
    from jsonb_to_recordset(assessment.payments_snapshot) as payment(
      method text, amount numeric, currency text, payment_date date
    );
  end if;

  if next_rank < prior_rank then
    perform set_config('receiptit.reassessment_rpc', 'on', true);
    update public.receipts receipt
    set status = assessment.prior_status,
        error_reason = assessment.prior_error_reason,
        parsed_at = nullif(assessment.receipt_snapshot->>'parsed_at', '')::timestamptz
    where receipt.id = new.id;
  end if;

  update public.receipt_reassessments
  set outcome_status = case when next_rank < prior_rank then assessment.prior_status else new.status end,
      completed_at = timezone('utc', now())
  where id = assessment.id;

  return new;
end;
$$;

drop trigger if exists receiptit_finish_reassessment on public.receipts;
create trigger receiptit_finish_reassessment
  after update on public.receipts
  for each row execute function public.finish_receipt_reassessment();

-- Let the security-definer reassessment RPC perform its deliberate transition
-- while keeping normal authenticated updates constrained by the existing guard.
create or replace function public.enforce_receiptit_client_receipt_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  is_retry boolean := false;
  is_purchase_document_confirmation boolean := false;
  is_evidence_replacement boolean := false;
begin
  if current_setting('receiptit.reassessment_rpc', true) = 'on' then
    return new;
  end if;

  if auth.role() = 'authenticated' then
    is_evidence_replacement := (
      current_setting('receiptit.evidence_replacement', true) = 'on'
      and new.status = 'processing'
      and new.error_reason is null
      and new.processing_attempt_started_at is not null
      and old.status in ('parsed', 'completed')
      and new.storage_path like auth.uid()::text || '/%'
      and new.image_url = new.storage_path
      and new.source = 'image'
    );

    if is_evidence_replacement then
      if (to_jsonb(new) - array[
            'status', 'error_reason', 'processing_attempt_started_at',
            'processing_attempts', 'storage_path', 'image_url', 'file_hash', 'source'
          ]) is distinct from
         (to_jsonb(old) - array[
            'status', 'error_reason', 'processing_attempt_started_at',
            'processing_attempts', 'storage_path', 'image_url', 'file_hash', 'source'
          ]) then
        raise exception 'Receipt evidence fields are processor managed';
      end if;
    elsif (to_jsonb(new) - array[
              'status', 'error_reason', 'user_confirmed_currency',
              'processing_attempt_started_at', 'folder', 'merchant', 'amount', 'category'
            ]) is distinct from
           (to_jsonb(old) - array[
              'status', 'error_reason', 'user_confirmed_currency',
              'processing_attempt_started_at', 'folder', 'merchant', 'amount', 'category'
            ]) then
      raise exception 'Receipt evidence fields are processor managed';
    end if;

    if new.merchant is distinct from old.merchant then
      if old.status not in ('parsed', 'completed', 'needs_review') then
        raise exception 'Store name can only be corrected after processing';
      end if;
      new.merchant := btrim(new.merchant);
      if new.merchant is null or char_length(new.merchant) < 1 or char_length(new.merchant) > 160 then
        raise exception 'Store name must be between 1 and 160 characters';
      end if;
    end if;

    if new.amount is distinct from old.amount then
      if old.status <> 'needs_review' then
        raise exception 'Purchase amount can only be corrected during document review';
      end if;
      if new.amount is null or new.amount < 0 or new.amount > 1000000 then
        raise exception 'Purchase amount must be between 0 and 1000000';
      end if;
    end if;

    if new.category is distinct from old.category then
      if old.status not in ('parsed', 'completed', 'needs_review') then
        raise exception 'Category can only be corrected after processing';
      end if;
      if new.category is null or new.category not in (
        'Groceries', 'Tech', 'Transport', 'Meals', 'Utility', 'Fashion', 'Toys', 'Other'
      ) then
        raise exception 'Choose an available receipt category';
      end if;
    end if;

    if new.status is distinct from old.status then
      is_retry := (
        new.status = 'processing'
        and new.error_reason is null
        and new.processing_attempt_started_at is not null
        and old.status in ('failed', 'needs_input', 'needs_review', 'rejected')
      );
      is_purchase_document_confirmation := (
        old.status = 'needs_review'
        and new.status = 'parsed'
        and new.error_reason is null
        and old.document_type in ('invoice', 'order_confirmation', 'payment_confirmation', 'hotel_folio', 'eftpos_slip', 'other_purchase_proof')
        and new.merchant is not null
        and btrim(new.merchant) <> ''
        and lower(btrim(new.merchant)) <> 'analyzing...'
        and new.amount is not null
        and new.amount between 0 and 1000000
      );
      if not (is_retry or is_purchase_document_confirmation or is_evidence_replacement) then
        raise exception 'Unsupported receipt status transition';
      end if;
      if is_retry or is_evidence_replacement then
        if coalesce(old.processing_attempts, 1) >= 5 then
          raise exception 'Retry limit reached. Please report this receipt for help.';
        end if;
        new.processing_attempts := coalesce(old.processing_attempts, 1) + 1;
      else
        new.parsed_at := timezone('utc', now());
      end if;
    end if;
  end if;
  return new;
end;
$$;

comment on table public.receipt_reassessments is
  'Owner-visible, privacy-safe diagnostics and known-good snapshots for targeted receipt reassessment.';
comment on function public.request_receipt_reassessment(uuid) is
  'Reprocesses the same owner receipt and private evidence while preserving its known-good structured baseline.';

commit;
