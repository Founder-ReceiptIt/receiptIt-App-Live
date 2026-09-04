/*
  ReceiptIt possible duplicates + Activity v0

  Exact SHA-256 duplicate prevention remains authoritative and unchanged. This
  migration adds a separate, conservative review signal for different evidence
  files that appear to describe the same purchase. Nothing is merged, deleted
  or blocked automatically.
*/

begin;

create extension if not exists pg_trgm with schema extensions;

create table if not exists public.receipt_possible_duplicates (
  receipt_id uuid primary key references public.receipts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  possible_duplicate_of uuid not null references public.receipts(id) on delete cascade,
  confidence numeric(4, 3) not null check (confidence between 0.950 and 1.000),
  signals jsonb not null default '[]'::jsonb check (jsonb_typeof(signals) = 'array'),
  decision text not null default 'pending' check (decision in ('pending', 'saved_anyway')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (receipt_id <> possible_duplicate_of)
);

create index if not exists receipt_possible_duplicates_user_pending_idx
  on public.receipt_possible_duplicates (user_id, created_at desc)
  where decision = 'pending';

alter table public.receipt_possible_duplicates enable row level security;

drop policy if exists "receiptit_possible_duplicates_select_own"
  on public.receipt_possible_duplicates;
create policy "receiptit_possible_duplicates_select_own"
  on public.receipt_possible_duplicates for select to authenticated
  using (user_id = auth.uid());

revoke all on public.receipt_possible_duplicates from public, anon, authenticated;
grant select on public.receipt_possible_duplicates to authenticated;

create or replace function public.receiptit_match_key(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select nullif(regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', '', 'g'), '');
$$;

create or replace function public.receiptit_meaningful_reference(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select case
    when p_value is null or length(btrim(p_value)) < 4 then null
    when upper(btrim(p_value)) like 'REF-%' then null
    when upper(btrim(p_value)) like 'EMAIL-%' then null
    else public.receiptit_match_key(p_value)
  end;
$$;

create or replace function public.refresh_receipt_possible_duplicate(p_receipt_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  current_receipt public.receipts%rowtype;
  candidate public.receipts%rowtype;
  current_merchant text;
  candidate_merchant text;
  merchant_similarity real;
  current_invoice text;
  candidate_invoice text;
  current_order text;
  candidate_order text;
  current_reference text;
  candidate_reference text;
  same_reference boolean;
  conflicting_reference boolean;
  current_items text[];
  candidate_items text[];
  shared_item_count integer;
  item_overlap numeric;
  capture_gap interval;
  card_matches boolean;
  candidate_confidence numeric;
  candidate_signals jsonb;
  best_receipt_id uuid;
  best_confidence numeric := 0;
  best_signals jsonb := '[]'::jsonb;
begin
  select * into current_receipt
  from public.receipts
  where id = p_receipt_id;

  if not found
     or current_receipt.status not in ('parsed', 'completed', 'needs_review')
     or current_receipt.is_duplicate is true
     or current_receipt.amount is null
     or current_receipt.currency is null
     or current_receipt.merchant is null then
    delete from public.receipt_possible_duplicates
    where receipt_id = p_receipt_id and decision = 'pending';
    return;
  end if;

  current_merchant := public.receiptit_match_key(current_receipt.merchant);
  if current_merchant is null or current_merchant in ('analyzing', 'analysing', 'unknownmerchant') then
    return;
  end if;

  current_invoice := public.receiptit_meaningful_reference(current_receipt.invoice_number);
  current_order := public.receiptit_meaningful_reference(current_receipt.order_number);
  current_reference := public.receiptit_meaningful_reference(current_receipt.reference_number);

  select coalesce(array_agg(item_key order by item_key), '{}'::text[])
    into current_items
  from (
    select distinct public.receiptit_match_key(
      coalesce(nullif(display_name, ''), nullif(raw_description, ''), description)
    ) as item_key
    from public.receipt_items
    where receipt_id = current_receipt.id
  ) item_keys
  where item_key is not null;

  for candidate in
    select r.*
    from public.receipts r
    where r.user_id = current_receipt.user_id
      and r.id <> current_receipt.id
      and r.status in ('parsed', 'completed', 'needs_review')
      and r.is_duplicate is not true
      and r.amount is not null
      and upper(coalesce(r.currency, '')) = upper(current_receipt.currency)
      and abs(r.amount - current_receipt.amount) <= 0.01
      and r.created_at <= current_receipt.created_at
      and (r.file_hash is null or current_receipt.file_hash is null or r.file_hash <> current_receipt.file_hash)
    order by r.created_at desc
    limit 100
  loop
    candidate_merchant := public.receiptit_match_key(candidate.merchant);
    if candidate_merchant is null then continue; end if;

    merchant_similarity := case
      when candidate_merchant = current_merchant then 1
      else extensions.similarity(candidate_merchant, current_merchant)
    end;

    candidate_invoice := public.receiptit_meaningful_reference(candidate.invoice_number);
    candidate_order := public.receiptit_meaningful_reference(candidate.order_number);
    candidate_reference := public.receiptit_meaningful_reference(candidate.reference_number);

    same_reference :=
      (current_invoice is not null and candidate_invoice = current_invoice)
      or (current_order is not null and candidate_order = current_order)
      or (current_reference is not null and candidate_reference = current_reference);

    conflicting_reference :=
      (current_invoice is not null and candidate_invoice is not null and current_invoice <> candidate_invoice)
      or (current_order is not null and candidate_order is not null and current_order <> candidate_order)
      or (current_reference is not null and candidate_reference is not null and current_reference <> candidate_reference);

    if conflicting_reference then continue; end if;

    select coalesce(array_agg(item_key order by item_key), '{}'::text[])
      into candidate_items
    from (
      select distinct public.receiptit_match_key(
        coalesce(nullif(display_name, ''), nullif(raw_description, ''), description)
      ) as item_key
      from public.receipt_items
      where receipt_id = candidate.id
    ) item_keys
    where item_key is not null;

    select count(*) into shared_item_count
    from unnest(current_items) current_item
    where current_item = any(candidate_items);

    item_overlap := case
      when greatest(cardinality(current_items), cardinality(candidate_items)) = 0 then 0
      else shared_item_count::numeric / greatest(cardinality(current_items), cardinality(candidate_items))
    end;
    capture_gap := current_receipt.created_at - candidate.created_at;
    card_matches := current_receipt.card_last_4 is not null
      and candidate.card_last_4 is not null
      and current_receipt.card_last_4 = candidate.card_last_4;

    candidate_confidence := 0;
    candidate_signals := '[]'::jsonb;

    if same_reference and merchant_similarity >= 0.70 then
      candidate_confidence := 0.995;
      candidate_signals := '["same_reference","same_total","same_currency"]'::jsonb;
    elsif current_receipt.transaction_date is not null
      and candidate.transaction_date = current_receipt.transaction_date
      and merchant_similarity >= 0.92
      and cardinality(current_items) >= 2
      and cardinality(candidate_items) >= 2
      and item_overlap >= 0.80
      and capture_gap between interval '0 seconds' and interval '2 hours'
      and (card_matches or item_overlap = 1) then
      candidate_confidence := case when card_matches then 0.980 else 0.965 end;
      candidate_signals := jsonb_build_array(
        'same_day', 'same_total', 'same_currency', 'strong_item_overlap',
        case when card_matches then 'same_payment_hint' else 'close_capture_time' end
      );
    elsif current_receipt.transaction_date is not null
      and candidate.transaction_date = current_receipt.transaction_date
      and merchant_similarity >= 0.97
      and cardinality(current_items) = 1
      and cardinality(candidate_items) = 1
      and item_overlap = 1
      and card_matches
      and capture_gap between interval '0 seconds' and interval '30 minutes' then
      candidate_confidence := 0.955;
      candidate_signals := '["same_day","same_total","same_currency","same_item","same_payment_hint","close_capture_time"]'::jsonb;
    end if;

    if candidate_confidence > best_confidence then
      best_receipt_id := candidate.id;
      best_confidence := candidate_confidence;
      best_signals := candidate_signals;
    end if;
  end loop;

  if best_receipt_id is null or best_confidence < 0.950 then
    delete from public.receipt_possible_duplicates
    where receipt_id = current_receipt.id and decision = 'pending';
    return;
  end if;

  insert into public.receipt_possible_duplicates (
    receipt_id, user_id, possible_duplicate_of, confidence, signals, decision, resolved_at
  ) values (
    current_receipt.id, current_receipt.user_id, best_receipt_id, best_confidence, best_signals, 'pending', null
  )
  on conflict (receipt_id) do update
  set possible_duplicate_of = excluded.possible_duplicate_of,
      confidence = excluded.confidence,
      signals = excluded.signals,
      created_at = now(),
      resolved_at = null
  where receipt_possible_duplicates.decision = 'pending';
end;
$$;

revoke all on function public.refresh_receipt_possible_duplicate(uuid) from public, anon, authenticated;

create or replace function public.receiptit_refresh_possible_duplicate_from_receipt()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.refresh_receipt_possible_duplicate(new.id);
  return new;
end;
$$;

drop trigger if exists receiptit_refresh_possible_duplicate_on_receipt on public.receipts;
create trigger receiptit_refresh_possible_duplicate_on_receipt
after insert or update of status, merchant, amount, currency, transaction_date,
  reference_number, order_number, invoice_number, card_last_4
on public.receipts
for each row
when (new.status in ('parsed', 'completed', 'needs_review'))
execute function public.receiptit_refresh_possible_duplicate_from_receipt();

create or replace function public.receiptit_refresh_possible_duplicate_from_item()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_receipt_possible_duplicate(old.receipt_id);
    return old;
  end if;

  perform public.refresh_receipt_possible_duplicate(new.receipt_id);
  return new;
end;
$$;

drop trigger if exists receiptit_refresh_possible_duplicate_on_item on public.receipt_items;
create trigger receiptit_refresh_possible_duplicate_on_item
after insert or update or delete on public.receipt_items
for each row execute function public.receiptit_refresh_possible_duplicate_from_item();

create or replace function public.keep_possible_duplicate(p_receipt_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  update public.receipt_possible_duplicates
  set decision = 'saved_anyway', resolved_at = now()
  where receipt_id = p_receipt_id and user_id = auth.uid() and decision = 'pending';

  if not found then raise exception 'Possible duplicate not found'; end if;
end;
$$;

revoke all on function public.keep_possible_duplicate(uuid) from public, anon;
grant execute on function public.keep_possible_duplicate(uuid) to authenticated;

alter table public.purchase_activity
  drop constraint if exists purchase_activity_event_type_check;
alter table public.purchase_activity
  add constraint purchase_activity_event_type_check
  check (event_type in ('original_viewed', 'proof_pack_generated', 'exact_duplicate_detected'));

create or replace function public.record_exact_duplicate_activity(p_receipt_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.receipts
    where id = p_receipt_id and user_id = auth.uid()
  ) then
    raise exception 'Receipt not found';
  end if;

  if not exists (
    select 1 from public.purchase_activity
    where user_id = auth.uid()
      and receipt_id = p_receipt_id
      and event_type = 'exact_duplicate_detected'
      and created_at > now() - interval '5 minutes'
  ) then
    insert into public.purchase_activity (user_id, receipt_id, event_type)
    values (auth.uid(), p_receipt_id, 'exact_duplicate_detected');
  end if;
end;
$$;

revoke all on function public.record_exact_duplicate_activity(uuid) from public, anon;
grant execute on function public.record_exact_duplicate_activity(uuid) to authenticated;

comment on table public.receipt_possible_duplicates is
  'Owner-scoped, non-destructive high-confidence possible-duplicate review signals. Exact hash prevention remains separate and authoritative.';

commit;
