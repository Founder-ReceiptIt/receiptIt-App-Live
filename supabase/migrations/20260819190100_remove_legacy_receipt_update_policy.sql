-- A pre-hardening owner-only UPDATE policy remained alongside the new policy.
-- It is redundant, but removing it keeps the live receipt authorization model
-- auditable: one policy per browser operation.
drop policy if exists "Enable update for users based on user_id" on public.receipts;
