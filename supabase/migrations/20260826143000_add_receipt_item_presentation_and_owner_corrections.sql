/*
  Add a source-preserving item presentation layer and tightly scoped owner
  corrections for beta receipt clean-up.

  - description remains the legacy processor field.
  - raw_description preserves the printed receipt text.
  - display_name and brand_name are optional presentation fields.
  - authenticated owners may update only display_name on their own child rows.
  - authenticated owners may correct merchant on their own finalised receipt;
    all other extracted evidence remains protected by the existing trigger.
*/

begin;

alter table public.receipt_items
  add column if not exists raw_description text,
  add column if not exists display_name text,
  add column if not exists brand_name text;

update public.receipt_items
set raw_description = description
where raw_description is null
  and description is not null;

alter table public.receipt_items
  drop constraint if exists receipt_items_raw_description_length,
  add constraint receipt_items_raw_description_length
    check (raw_description is null or char_length(raw_description) <= 500),
  drop constraint if exists receipt_items_display_name_length,
  add constraint receipt_items_display_name_length
    check (display_name is null or char_length(display_name) <= 160),
  drop constraint if exists receipt_items_brand_name_length,
  add constraint receipt_items_brand_name_length
    check (brand_name is null or char_length(brand_name) <= 120);

comment on column public.receipt_items.raw_description is
  'Exact item wording preserved from the receipt where available.';
comment on column public.receipt_items.display_name is
  'Optional human-readable item name generated confidently or corrected by the owner.';
comment on column public.receipt_items.brand_name is
  'Optional brand explicitly supported by the receipt text.';

drop policy if exists receiptit_receipt_items_update_display_name_own on public.receipt_items;
create policy receiptit_receipt_items_update_display_name_own
  on public.receipt_items for update to authenticated
  using (
    exists (
      select 1
      from public.receipts r
      where r.id = receipt_items.receipt_id
        and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.receipts r
      where r.id = receipt_items.receipt_id
        and r.user_id = auth.uid()
    )
  );

grant update (display_name) on table public.receipt_items to authenticated;

create or replace function public.enforce_receiptit_client_receipt_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'authenticated' then
    if (to_jsonb(new) - array['status', 'error_reason', 'user_confirmed_currency', 'processing_attempt_started_at', 'folder', 'merchant'])
       is distinct from
       (to_jsonb(old) - array['status', 'error_reason', 'user_confirmed_currency', 'processing_attempt_started_at', 'folder', 'merchant']) then
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

commit;
