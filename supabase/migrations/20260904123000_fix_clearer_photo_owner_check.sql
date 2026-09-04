/*
  Correct the owner-variable binding in the same-receipt clearer-photo RPC.

  The original version used a PL/pgSQL variable named owner_id, which clashes
  with storage.objects.owner_id at runtime. Keep the contract unchanged and
  qualify the storage row explicitly.
*/

begin;

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

commit;
