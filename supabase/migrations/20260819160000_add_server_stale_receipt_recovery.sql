-- Recover receipt jobs that are genuinely stranded outside the browser.
--
-- A retry always writes a fresh processing_attempt_started_at value, so this
-- function cannot interrupt an active retry. It only changes existing rows and
-- deliberately preserves the user, source, file hash and private Storage path.
create extension if not exists pg_cron;

create or replace function public.recover_stale_receipt_processing()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recovered_count integer;
begin
  update public.receipts
  set
    status = 'failed',
    error_reason = 'processing_timeout'
  where status = 'processing'
    and coalesce(processing_attempt_started_at, created_at) < now() - interval '3 minutes';

  get diagnostics recovered_count = row_count;
  return recovered_count;
end;
$$;

-- This is a server-only maintenance function. The scheduled job runs as the
-- migration owner, while app clients continue to use the existing retry path.
revoke all on function public.recover_stale_receipt_processing() from public;
revoke all on function public.recover_stale_receipt_processing() from anon, authenticated;
grant execute on function public.recover_stale_receipt_processing() to service_role;

-- A stable job name makes the migration safe to re-apply without accumulating
-- workers. Supabase Cron records run history in cron.job_run_details.
select cron.schedule(
  'receiptit-recover-stale-processing',
  '* * * * *',
  'select public.recover_stale_receipt_processing();'
);
