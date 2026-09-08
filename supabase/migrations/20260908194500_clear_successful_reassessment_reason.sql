/*
  A successful reassessment must not retain the internal request marker.

  The marker is useful while the existing receipt is being processed, but a
  parsed/completed result must return to the same clean success contract as a
  first-pass receipt.
*/

begin;

create or replace function public.preserve_receipt_reassessment_baseline()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  assessment public.receipt_reassessments%rowtype;
  baseline jsonb;
  baseline_confidence numeric;
  next_confidence numeric;
begin
  select * into assessment
  from public.receipt_reassessments
  where receipt_id = new.id and completed_at is null
  order by requested_at desc
  limit 1;

  if not found then return new; end if;

  baseline := assessment.receipt_snapshot;
  baseline_confidence := coalesce(assessment.prior_confidence, -1);
  next_confidence := coalesce(new.confidence_score, -1);

  new.merchant := coalesce(nullif(btrim(new.merchant), ''), nullif(baseline->>'merchant', ''));
  new.amount := coalesce(new.amount, nullif(baseline->>'amount', '')::numeric);
  new.amount_gbp := coalesce(new.amount_gbp, nullif(baseline->>'amount_gbp', '')::numeric);
  new.subtotal := coalesce(nullif(btrim(new.subtotal), ''), nullif(baseline->>'subtotal', ''));
  new.vat_amount := coalesce(new.vat_amount, nullif(baseline->>'vat_amount', '')::numeric);
  new.discount_amount := coalesce(new.discount_amount, nullif(baseline->>'discount_amount', '')::numeric);
  new.currency := coalesce(nullif(btrim(new.currency), ''), nullif(baseline->>'currency', ''));
  new.transaction_date := coalesce(new.transaction_date, nullif(baseline->>'transaction_date', '')::date);
  new.category := coalesce(nullif(btrim(new.category), ''), nullif(baseline->>'category', ''));
  new.card_last_4 := coalesce(nullif(btrim(new.card_last_4), ''), nullif(baseline->>'card_last_4', ''));
  new.reference_number := coalesce(nullif(btrim(new.reference_number), ''), nullif(baseline->>'reference_number', ''));
  new.order_number := coalesce(nullif(btrim(new.order_number), ''), nullif(baseline->>'order_number', ''));
  new.invoice_number := coalesce(nullif(btrim(new.invoice_number), ''), nullif(baseline->>'invoice_number', ''));
  new.document_type := coalesce(nullif(btrim(new.document_type), ''), nullif(baseline->>'document_type', ''));

  if next_confidence < baseline_confidence then
    new.merchant := coalesce(nullif(baseline->>'merchant', ''), new.merchant);
    new.amount := coalesce(nullif(baseline->>'amount', '')::numeric, new.amount);
    new.amount_gbp := coalesce(nullif(baseline->>'amount_gbp', '')::numeric, new.amount_gbp);
    new.subtotal := coalesce(nullif(baseline->>'subtotal', ''), new.subtotal);
    new.vat_amount := coalesce(nullif(baseline->>'vat_amount', '')::numeric, new.vat_amount);
    new.discount_amount := coalesce(nullif(baseline->>'discount_amount', '')::numeric, new.discount_amount);
    new.currency := coalesce(nullif(baseline->>'currency', ''), new.currency);
    new.transaction_date := coalesce(nullif(baseline->>'transaction_date', '')::date, new.transaction_date);
    new.category := coalesce(nullif(baseline->>'category', ''), new.category);
    new.card_last_4 := coalesce(nullif(baseline->>'card_last_4', ''), new.card_last_4);
    new.reference_number := coalesce(nullif(baseline->>'reference_number', ''), new.reference_number);
    new.order_number := coalesce(nullif(baseline->>'order_number', ''), new.order_number);
    new.invoice_number := coalesce(nullif(baseline->>'invoice_number', ''), new.invoice_number);
    new.document_type := coalesce(nullif(baseline->>'document_type', ''), new.document_type);
  end if;

  if new.status in ('parsed', 'completed') then
    new.error_reason := null;
  end if;

  return new;
end;
$$;

-- Repair the one controlled Bayview reassessment completed before this guard
-- was installed. No other receipts are changed.
update public.receipts
set error_reason = null
where id = '0f7c0808-8ae7-4da8-9b48-beb2427cdc68'
  and status in ('parsed', 'completed')
  and error_reason = 'review_assist_requested';

commit;
