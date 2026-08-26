/*
  Preserve the existing beta retry cap while allowing the narrowly scoped
  owner correction to a processed receipt's merchant name.
*/

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

      if coalesce(old.processing_attempts, 1) >= 5 then
        raise exception 'Retry limit reached. Please report this receipt for help.';
      end if;

      new.processing_attempts := coalesce(old.processing_attempts, 1) + 1;
    end if;
  end if;

  return new;
end;
$$;
