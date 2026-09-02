/*
  Let an authenticated owner confirm one processor-classified purchase
  document after reviewing its merchant and original-currency amount.

  The immutable original and all other processor-managed evidence remain
  protected. Retry behaviour and its existing attempt cap are unchanged.
*/

create or replace function public.enforce_receiptit_client_receipt_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  is_retry boolean := false;
  is_purchase_document_confirmation boolean := false;
begin
  if auth.role() = 'authenticated' then
    if (to_jsonb(new) - array[
          'status',
          'error_reason',
          'user_confirmed_currency',
          'processing_attempt_started_at',
          'folder',
          'merchant',
          'amount'
        ])
       is distinct from
       (to_jsonb(old) - array[
          'status',
          'error_reason',
          'user_confirmed_currency',
          'processing_attempt_started_at',
          'folder',
          'merchant',
          'amount'
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

      if not (is_retry or is_purchase_document_confirmation) then
        raise exception 'Unsupported receipt status transition';
      end if;

      if is_retry then
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
  'Protects processor-managed receipt evidence while allowing owner retry, folder/store corrections, and explicit purchase-document confirmation.';
