/*
  ReceiptIt Golden Egg v0

  Add only the durable records that cannot be derived from the receipt itself:
  generated Proof Packs and a small owner-scoped activity log. Shield state and
  protected value remain derived, so they cannot drift from the proof record.
*/

begin;

create table if not exists public.proof_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  storage_path text not null,
  status text not null default 'ready' check (status in ('ready', 'failed')),
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (storage_path like user_id::text || '/%')
);

create index if not exists proof_packs_user_generated_idx
  on public.proof_packs (user_id, generated_at desc);
create index if not exists proof_packs_receipt_idx
  on public.proof_packs (receipt_id, generated_at desc);

create table if not exists public.purchase_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  event_type text not null check (event_type in ('original_viewed', 'proof_pack_generated')),
  created_at timestamptz not null default now()
);

create index if not exists purchase_activity_receipt_created_idx
  on public.purchase_activity (receipt_id, created_at desc);

alter table public.proof_packs enable row level security;
alter table public.purchase_activity enable row level security;

drop policy if exists "receiptit_proof_packs_select_own" on public.proof_packs;
create policy "receiptit_proof_packs_select_own"
  on public.proof_packs for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "receiptit_purchase_activity_select_own" on public.purchase_activity;
create policy "receiptit_purchase_activity_select_own"
  on public.purchase_activity for select to authenticated
  using (user_id = auth.uid());

/* Activity writes are intentionally server-only except the bounded, owner-safe
   original-view event RPC below. */
revoke all on public.proof_packs, public.purchase_activity from anon, authenticated;
grant select on public.proof_packs, public.purchase_activity to authenticated;

create or replace function public.record_original_view(p_receipt_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.receipts
    where id = p_receipt_id and user_id = auth.uid()
  ) then
    raise exception 'Receipt not found';
  end if;

  insert into public.purchase_activity (user_id, receipt_id, event_type)
  values (auth.uid(), p_receipt_id, 'original_viewed');
end;
$$;

revoke all on function public.record_original_view(uuid) from public, anon;
grant execute on function public.record_original_view(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proof-packs', 'proof-packs', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/* No browser Storage policy is granted for proof packs. The authenticated Edge
   Function verifies ownership and creates a short-lived download URL. */
drop policy if exists "receiptit_proof_packs_no_direct_browser_access" on storage.objects;

comment on table public.proof_packs is
  'Owner-scoped generated Purchase Passport evidence summaries. Private files live in proof-packs Storage.';
comment on table public.purchase_activity is
  'Minimal receipt activity log. Derived capture/processing events stay on the receipt; only durable user actions are stored.';

commit;
