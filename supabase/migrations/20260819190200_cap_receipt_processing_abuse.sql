/*
  Beta-safe client-side processing caps enforced at the database boundary.
  The browser may create only owner-scoped processing rows; the trigger makes
  repeated direct REST calls no cheaper than normal UI uploads.
*/

create or replace function public.enforce_receiptit_client_receipt_insert()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  recent_uploads integer;
  active_jobs integer;
begin
  if auth.role() = 'authenticated' then
    if new.file_hash is null or new.file_hash !~ '^[a-f0-9]{64}$' then
      raise exception 'A valid file fingerprint is required';
    end if;

    select count(*) into recent_uploads
    from public.receipts
    where user_id = auth.uid()
      and created_at >= now() - interval '1 hour';

    if recent_uploads >= 10 then
      raise exception 'Upload limit reached. Please try again later.';
    end if;

    select count(*) into active_jobs
    from public.receipts
    where user_id = auth.uid()
      and status = 'processing';

    if active_jobs >= 3 then
      raise exception 'Too many receipts are already processing.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists receiptit_enforce_client_receipt_insert on public.receipts;
create trigger receiptit_enforce_client_receipt_insert
  before insert on public.receipts
  for each row execute function public.enforce_receiptit_client_receipt_insert();

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

      if coalesce(old.processing_attempts, 1) >= 5 then
        raise exception 'Retry limit reached. Please report this receipt for help.';
      end if;

      new.processing_attempts := coalesce(old.processing_attempts, 1) + 1;
    end if;
  end if;

  return new;
end;
$$;
