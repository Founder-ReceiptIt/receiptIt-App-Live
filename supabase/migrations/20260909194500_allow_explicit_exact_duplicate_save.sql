/*
  Let an owner explicitly save a second copy after ReceiptIt has shown the
  exact-duplicate decision. Automatic and concurrent duplicate attempts remain
  blocked; the override is valid only when it points to that owner's existing
  active receipt with the same SHA-256 fingerprint.
*/

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

  if existing_receipt_id is null then
    return new;
  end if;

  if new.duplicate_of = existing_receipt_id and coalesce(new.is_duplicate, false) is false then
    return new;
  end if;

  raise exception using
    errcode = '23505',
    message = 'This exact receipt file is already active or saved',
    detail = 'existing_receipt_id=' || existing_receipt_id::text;
end;
$$;

comment on function public.prevent_active_receipt_file_duplicate() is
  'Blocks silent exact duplicates while permitting one owner-confirmed save-again insert linked to the matching owned receipt.';
