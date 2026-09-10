begin;

-- Exact evidence is never overridable. Serialize concurrent attempts per owner/hash.
create or replace function public.prevent_active_receipt_file_duplicate()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare existing_receipt_id uuid;
begin
  if new.file_hash is null or new.user_id is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':' || new.file_hash, 0));
  select r.id into existing_receipt_id from public.receipts r
  where r.user_id = new.user_id and r.id <> new.id
    and r.status in ('processing','parsed','completed','needs_review','needs_input','duplicate')
    and (r.file_hash = new.file_hash or exists (
      select 1 from public.receipt_evidence_versions e where e.receipt_id=r.id and e.file_hash=new.file_hash
    ))
  order by (r.status='duplicate'),r.created_at desc limit 1;
  if existing_receipt_id is not null then
    raise exception using errcode='23505', message='This exact receipt file is already active or saved',
      detail='existing_receipt_id=' || existing_receipt_id::text;
  end if;
  return new;
end $$;
comment on function public.prevent_active_receipt_file_duplicate() is 'Owner-scoped exact evidence guard. No save-anyway override, including concurrent uploads.';

create or replace function public.find_existing_receipt_by_file_hash(p_file_hash text)
returns table(id uuid,status text,merchant text) language sql stable security definer
set search_path = public, pg_temp as $$
  select r.id,r.status,r.merchant from public.receipts r
  where auth.uid() is not null and r.user_id=auth.uid() and p_file_hash ~ '^[a-f0-9]{64}$'
    and r.status in ('processing','parsed','completed','needs_review','needs_input','duplicate')
    and (r.file_hash=p_file_hash or exists (
      select 1 from public.receipt_evidence_versions e where e.receipt_id=r.id and e.file_hash=p_file_hash
    ))
  order by (r.status='duplicate'),r.created_at desc limit 1;
$$;

-- Permit only genuine FK SET NULL caused by deleting the referenced row.
-- A direct owner UPDATE still cannot alter processor-managed evidence/link fields.
do $$
declare definition text; insertion text := $patch$
  if pg_trigger_depth() > 1
     and (to_jsonb(new) - array['duplicate_of','original_receipt_id']) =
         (to_jsonb(old) - array['duplicate_of','original_receipt_id'])
     and (new.duplicate_of is not distinct from old.duplicate_of or
       (new.duplicate_of is null and old.duplicate_of is not null and
        not exists(select 1 from public.receipts where id=old.duplicate_of)))
     and (new.original_receipt_id is not distinct from old.original_receipt_id or
       (new.original_receipt_id is null and old.original_receipt_id is not null and
        not exists(select 1 from public.receipts where id=old.original_receipt_id))) then
    return new;
  end if;
$patch$;
begin
  select pg_get_functiondef('public.enforce_receiptit_client_receipt_update()'::regprocedure) into definition;
  if position('if pg_trigger_depth() > 1' in definition)=0 then
    if position('  if auth.role() = ''authenticated'' then' in definition)=0 then
      raise exception 'Unexpected receipt update guard; migration not applied';
    end if;
    execute replace(definition,'  if auth.role() = ''authenticated'' then',insertion || '  if auth.role() = ''authenticated'' then');
  end if;
end $$;

-- Possible-duplicate review is post-extraction: both independent rows already
-- exist. Acknowledgement must verify that fact, never create a third row.
create or replace function public.keep_possible_duplicate(p_receipt_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.receipts%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into r from public.receipts where id=p_receipt_id and user_id=auth.uid() for update;
  if not found or r.status not in ('parsed','completed','needs_review') or r.is_duplicate is true then
    raise exception 'Independent saved purchase not found';
  end if;
  update public.receipt_possible_duplicates set decision='saved_anyway',resolved_at=coalesce(resolved_at,now())
    where receipt_id=r.id and user_id=auth.uid();
  -- Idempotent if already acknowledged or the referenced purchase was deleted.
end $$;

-- Durable, service-only Storage cleanup. Enqueued inside the receipt DELETE
-- transaction: a DB failure cannot remove the original; Storage failure can retry.
create table public.receipt_storage_cleanup (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null,
  user_id uuid not null,
  bucket_id text not null check(bucket_id in ('receipts','proof-packs')),
  storage_path text not null,
  created_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text,
  unique(receipt_id,bucket_id,storage_path),
  check(storage_path like user_id::text || '/%'),
  check(storage_path !~ '(^|/)\.\.(/|$)')
);
alter table public.receipt_storage_cleanup enable row level security;
revoke all on public.receipt_storage_cleanup from public,anon,authenticated;
grant all on public.receipt_storage_cleanup to service_role;

create or replace function public.queue_deleted_receipt_storage()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.receipt_storage_cleanup(receipt_id,user_id,bucket_id,storage_path)
  select old.id,old.user_id,paths.bucket_id,paths.path from (
    select 'receipts'::text bucket_id,old.storage_path path
    union select 'receipts',old.image_url where old.image_url like old.user_id::text||'/%'
    union select 'receipts',e.storage_path from public.receipt_evidence_versions e where e.receipt_id=old.id and e.user_id=old.user_id
    union select 'proof-packs',p.storage_path from public.proof_packs p where p.receipt_id=old.id and p.user_id=old.user_id
  ) paths where paths.path is not null and paths.path like old.user_id::text||'/%'
  on conflict do nothing;

  -- Old exact-override attempts are suppressed jobs, not independent purchases.
  -- Remove only same-owner, same-hash, explicitly suppressed children. Different
  -- photographs and all legitimate independent purchases are never cascaded.
  if old.status <> 'duplicate' and old.file_hash is not null then
    delete from public.receipts shadow where shadow.duplicate_of=old.id
      and shadow.id<>old.id and shadow.user_id=old.user_id
      and shadow.file_hash=old.file_hash and shadow.status='duplicate' and shadow.is_duplicate is true;
  end if;
  return old;
end $$;
revoke all on function public.queue_deleted_receipt_storage() from public,anon,authenticated;
create trigger receiptit_queue_deleted_storage before delete on public.receipts
for each row execute function public.queue_deleted_receipt_storage();

-- Verify object reachability immediately before cleanup; never delete evidence
-- still referenced by another independent purchase (including legacy sharing).
create or replace function public.receipt_cleanup_path_in_use(p_bucket text,p_path text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select case when p_bucket='receipts' then
    exists(select 1 from public.receipts where storage_path=p_path or image_url=p_path)
    or exists(select 1 from public.receipt_evidence_versions where storage_path=p_path)
  when p_bucket='proof-packs' then exists(select 1 from public.proof_packs where storage_path=p_path)
  else true end;
$$;
revoke all on function public.receipt_cleanup_path_in_use(text,text) from public,anon,authenticated;
grant execute on function public.receipt_cleanup_path_in_use(text,text) to service_role;

commit;
