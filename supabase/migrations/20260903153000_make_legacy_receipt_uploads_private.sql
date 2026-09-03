-- P0 incident containment: an obsolete pre-owner-folder bucket still held
-- historical uploads and retained its original public flag. Keep the evidence
-- in place, but make unauthenticated object delivery impossible.
update storage.buckets
set public = false
where id = 'Receipts_uploads';

do $$
begin
  if exists (
    select 1
    from storage.buckets
    where id = 'Receipts_uploads'
      and public = true
  ) then
    raise exception 'Legacy Receipts_uploads bucket must remain private';
  end if;
end;
$$;
