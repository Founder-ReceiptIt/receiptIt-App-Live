/*
  Lewis beta UX recovery patch.

  - Allow an owner to correct a receipt category from the existing Edit receipt
    surface, while retaining the processor-managed evidence boundary.
  - Keep every original when a clearer photo is supplied for the same receipt.
  - Reprocess the existing receipt row through the existing dispatch path.
*/

begin;

create table if not exists public.receipt_evidence_versions (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  file_hash text,
  evidence_role text not null check (evidence_role in ('original', 'clearer_photo')),
  is_current boolean not null default false,
  structured_snapshot jsonb,
  created_at timestamptz not null default now(),
  check (storage_path like user_id::text || '/%')
);

create index if not exists receipt_evidence_versions_receipt_created_idx
  on public.receipt_evidence_versions (receipt_id, created_at desc);
create unique index if not exists receipt_evidence_versions_one_current_idx
  on public.receipt_evidence_versions (receipt_id)
  where is_current;

alter table public.receipt_evidence_versions enable row level security;

drop policy if exists receiptit_receipt_evidence_versions_select_own
  on public.receipt_evidence_versions;
create policy receiptit_receipt_evidence_versions_select_own
  on public.receipt_evidence_versions for select to authenticated
  using (user_id = auth.uid());

revoke all on table public.receipt_evidence_versions from public, anon, authenticated;
grant select on table public.receipt_evidence_versions to authenticated;

create or replace function public.prevent_active_receipt_file_duplicate()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  existing_receipt_id uuid;
begin
  if new.file_hash is null or new.user_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.user_id::text || ':' || new.file_hash, 0)
  );

  select r.id into existing_receipt_id
  from public.receipts r
  where r.user_id = new.user_id
    and r.status in ('processing', 'parsed', 'completed', 'needs_review', 'needs_input', 'duplicate')
    and (
      r.file_hash = new.file_hash
      or exists (
        select 1 from public.receipt_evidence_versions evidence
        where evidence.receipt_id = r.id and evidence.file_hash = new.file_hash
      )
    )
  order by r.created_at desc
  limit 1;

  if existing_receipt_id is not null then
    raise exception using
      errcode = '23505',
      message = 'This exact receipt file is already active or saved',
      detail = 'existing_receipt_id=' || existing_receipt_id::text;
  end if;

  return new;
end;
$$;

create or replace function public.find_existing_receipt_by_file_hash(p_file_hash text)
returns table (id uuid, status text, merchant text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.status, r.merchant
  from public.receipts r
  where auth.uid() is not null
    and r.user_id = auth.uid()
    and p_file_hash ~ '^[a-f0-9]{64}$'
    and r.status in ('processing', 'parsed', 'completed', 'needs_review', 'needs_input', 'duplicate')
    and (
      r.file_hash = p_file_hash
      or exists (
        select 1 from public.receipt_evidence_versions evidence
        where evidence.receipt_id = r.id and evidence.file_hash = p_file_hash
      )
    )
  order by r.created_at desc
  limit 1;
$$;

revoke all on function public.find_existing_receipt_by_file_hash(text) from public, anon;
grant execute on function public.find_existing_receipt_by_file_hash(text) to authenticated;

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
            'status',
            'error_reason',
            'processing_attempt_started_at',
            'processing_attempts',
            'storage_path',
            'image_url',
            'file_hash',
            'source'
          ])
         is distinct from
         (to_jsonb(old) - array[
            'status',
            'error_reason',
            'processing_attempt_started_at',
            'processing_attempts',
            'storage_path',
            'image_url',
            'file_hash',
            'source'
          ]) then
        raise exception 'Receipt evidence fields are processor managed';
      end if;
    elsif (to_jsonb(new) - array[
              'status',
              'error_reason',
              'user_confirmed_currency',
              'processing_attempt_started_at',
              'folder',
              'merchant',
              'amount',
              'category'
            ])
          is distinct from
          (to_jsonb(old) - array[
              'status',
              'error_reason',
              'user_confirmed_currency',
              'processing_attempt_started_at',
              'folder',
              'merchant',
              'amount',
              'category'
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

    if new.amount is distinct from old.amount then
      if old.status <> 'needs_review' then
        raise exception 'Purchase amount can only be corrected during document review';
      end if;

      if new.amount is null or new.amount < 0 or new.amount > 1000000 then
        raise exception 'Purchase amount must be between 0 and 1000000';
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
        and old.document_type in (
          'invoice',
          'order_confirmation',
          'payment_confirmation',
          'hotel_folio',
          'eftpos_slip',
          'other_purchase_proof'
        )
        and new.merchant is not null
        and btrim(new.merchant) <> ''
        and lower(btrim(new.merchant)) <> 'analyzing...'
        and new.amount is not null
        and new.amount >= 0
        and new.amount <= 1000000
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

comment on function public.enforce_receiptit_client_receipt_update() is
  'Protects processor-managed receipt evidence while allowing bounded owner retry, folder/store/category corrections, document confirmation, and audited clearer-photo replacement.';

create or replace function public.add_clearer_receipt_photo(
  p_receipt_id uuid,
  p_storage_path text,
  p_file_hash text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  current_receipt public.receipts%rowtype;
  evidence_id uuid;
  snapshot jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  select r.* into current_receipt
  from public.receipts r
  where r.id = p_receipt_id and r.user_id = caller_id
  for update;

  if not found then
    raise exception 'Receipt not found';
  end if;
  if current_receipt.status not in ('parsed', 'completed') then
    raise exception 'A clearer photo can only be added to a ready receipt';
  end if;
  if coalesce(current_receipt.processing_attempts, 1) >= 5 then
    raise exception 'Retry limit reached. Please report this receipt for help.';
  end if;
  if p_storage_path is null
     or p_storage_path not like caller_id::text || '/%'
     or lower(p_storage_path) !~ '\.(jpe?g|png)$' then
    raise exception 'Invalid clearer photo path';
  end if;
  if p_storage_path = current_receipt.storage_path then
    raise exception 'Choose a different photo';
  end if;
  if p_file_hash is not null and p_file_hash = current_receipt.file_hash then
    raise exception 'Choose a different photo';
  end if;
  if exists (
    select 1 from public.receipt_evidence_versions evidence
    where evidence.storage_path = p_storage_path
  ) then
    raise exception 'This photo is already attached to a receipt';
  end if;
  if p_file_hash is not null and exists (
    select 1 from public.receipt_evidence_versions evidence
    where evidence.receipt_id = current_receipt.id and evidence.file_hash = p_file_hash
  ) then
    raise exception 'Choose a different photo';
  end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'receipts'
      and object.name = p_storage_path
      and object.owner_id::text = caller_id::text
  ) then
    raise exception 'Clearer photo was not stored';
  end if;
  if p_file_hash is not null and exists (
    select 1 from public.receipts receipt
    where receipt.user_id = caller_id
      and receipt.file_hash = p_file_hash
      and receipt.id <> p_receipt_id
      and receipt.status in ('processing', 'parsed', 'completed', 'needs_review', 'needs_input', 'duplicate')
  ) then
    raise exception 'This exact photo is already saved';
  end if;

  snapshot := jsonb_build_object(
    'merchant', current_receipt.merchant,
    'amount', current_receipt.amount,
    'amount_gbp', current_receipt.amount_gbp,
    'subtotal', current_receipt.subtotal,
    'vat_amount', current_receipt.vat_amount,
    'currency', current_receipt.currency,
    'transaction_date', current_receipt.transaction_date,
    'category', current_receipt.category,
    'reference_number', current_receipt.reference_number,
    'order_number', current_receipt.order_number,
    'invoice_number', current_receipt.invoice_number,
    'confidence_score', current_receipt.confidence_score
  );

  insert into public.receipt_evidence_versions (
    receipt_id, user_id, storage_path, file_hash, evidence_role, is_current, structured_snapshot
  ) values (
    current_receipt.id,
    caller_id,
    current_receipt.storage_path,
    current_receipt.file_hash,
    'original',
    false,
    snapshot
  ) on conflict (storage_path) do nothing;

  update public.receipt_evidence_versions evidence
  set is_current = false
  where evidence.receipt_id = current_receipt.id and evidence.is_current;

  insert into public.receipt_evidence_versions (
    receipt_id, user_id, storage_path, file_hash, evidence_role, is_current, structured_snapshot
  ) values (
    current_receipt.id,
    caller_id,
    p_storage_path,
    nullif(btrim(p_file_hash), ''),
    'clearer_photo',
    true,
    snapshot
  ) returning id into evidence_id;

  perform set_config('receiptit.evidence_replacement', 'on', true);
  update public.receipts receipt
  set storage_path = p_storage_path,
      image_url = p_storage_path,
      file_hash = nullif(btrim(p_file_hash), ''),
      source = 'image',
      status = 'processing',
      error_reason = null,
      processing_attempt_started_at = timezone('utc', now())
  where receipt.id = current_receipt.id and receipt.user_id = caller_id;

  return evidence_id;
end;
$$;

revoke all on function public.add_clearer_receipt_photo(uuid, text, text) from public, anon;
grant execute on function public.add_clearer_receipt_photo(uuid, text, text) to authenticated;

comment on function public.add_clearer_receipt_photo(uuid, text, text) is
  'Attaches a privately stored clearer image to the same owner receipt, preserves prior evidence, and returns the existing row to the normal processor.';

create or replace function public.preserve_known_receipt_fields_after_clearer_photo()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  baseline jsonb;
  baseline_confidence numeric;
  next_confidence numeric;
begin
  if old.status = 'processing' and new.status in ('parsed', 'completed') then
    select structured_snapshot into baseline
    from public.receipt_evidence_versions
    where receipt_id = new.id and is_current
    order by created_at desc
    limit 1;

    if baseline is not null then
      baseline_confidence := coalesce(nullif(baseline->>'confidence_score', '')::numeric, -1);
      next_confidence := coalesce(new.confidence_score, -1);

      /* Never replace known source-of-truth values with a missing extraction. */
      new.merchant := coalesce(nullif(btrim(new.merchant), ''), nullif(baseline->>'merchant', ''));
      new.amount := coalesce(new.amount, nullif(baseline->>'amount', '')::numeric);
      new.amount_gbp := coalesce(new.amount_gbp, nullif(baseline->>'amount_gbp', '')::numeric);
      new.subtotal := coalesce(new.subtotal, nullif(baseline->>'subtotal', '')::numeric);
      new.vat_amount := coalesce(new.vat_amount, nullif(baseline->>'vat_amount', '')::numeric);
      new.currency := coalesce(nullif(btrim(new.currency), ''), nullif(baseline->>'currency', ''));
      new.transaction_date := coalesce(new.transaction_date, nullif(baseline->>'transaction_date', '')::date);
      new.category := coalesce(nullif(btrim(new.category), ''), nullif(baseline->>'category', ''));

      /* A lower-confidence pass may add item detail, but cannot silently
         replace previously trusted merchant/total/date/reference fields. */
      if next_confidence < baseline_confidence then
        new.merchant := coalesce(nullif(baseline->>'merchant', ''), new.merchant);
        new.amount := coalesce(nullif(baseline->>'amount', '')::numeric, new.amount);
        new.amount_gbp := coalesce(nullif(baseline->>'amount_gbp', '')::numeric, new.amount_gbp);
        new.subtotal := coalesce(nullif(baseline->>'subtotal', '')::numeric, new.subtotal);
        new.vat_amount := coalesce(nullif(baseline->>'vat_amount', '')::numeric, new.vat_amount);
        new.currency := coalesce(nullif(baseline->>'currency', ''), new.currency);
        new.transaction_date := coalesce(nullif(baseline->>'transaction_date', '')::date, new.transaction_date);
        new.category := coalesce(nullif(baseline->>'category', ''), new.category);
        new.reference_number := coalesce(nullif(baseline->>'reference_number', ''), new.reference_number);
        new.order_number := coalesce(nullif(baseline->>'order_number', ''), new.order_number);
        new.invoice_number := coalesce(nullif(baseline->>'invoice_number', ''), new.invoice_number);
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists receiptit_preserve_clearer_photo_baseline on public.receipts;
create trigger receiptit_preserve_clearer_photo_baseline
  before update on public.receipts
  for each row execute function public.preserve_known_receipt_fields_after_clearer_photo();

comment on function public.preserve_known_receipt_fields_after_clearer_photo() is
  'Keeps known-good receipt facts when clearer-photo extraction is missing or less confident, while allowing the existing processor to improve item detail.';

commit;
