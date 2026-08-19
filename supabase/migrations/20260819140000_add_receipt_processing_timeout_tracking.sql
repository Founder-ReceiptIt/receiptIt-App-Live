-- Track every processing attempt independently of the original upload time.
-- This lets the client surface and recover jobs that genuinely became stale
-- without treating a fresh retry as an old stuck receipt.
alter table public.receipts
  add column if not exists processing_attempt_started_at timestamptz;

update public.receipts
set processing_attempt_started_at = created_at
where status = 'processing'
  and processing_attempt_started_at is null;

create index if not exists receipts_processing_timeout_idx
  on public.receipts (processing_attempt_started_at)
  where status = 'processing';
