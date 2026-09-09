-- Alias email evidence follows the same 10 MiB file-size contract as Scan and
-- the private receipts bucket. Keep rejected oversized attachment metadata
-- auditable even when the source file itself is deliberately not stored.

alter table public.inbound_attachments
  drop constraint if exists inbound_attachments_byte_size_check;

alter table public.inbound_attachments
  add constraint inbound_attachments_byte_size_check
  check (byte_size >= 0);

