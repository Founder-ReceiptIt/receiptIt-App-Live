-- Document type distinguishes a standard receipt from other legitimate
-- purchase evidence without changing any existing receipt processing path.
alter table public.receipts
  add column if not exists document_type text;

alter table public.receipts
  drop constraint if exists receipts_document_type_check;

alter table public.receipts
  add constraint receipts_document_type_check
  check (
    document_type is null
    or document_type in (
      'receipt',
      'invoice',
      'order_confirmation',
      'payment_confirmation',
      'hotel_folio',
      'eftpos_slip',
      'other_purchase_proof',
      'non_purchase_document'
    )
  );

comment on column public.receipts.document_type is
  'Canonical document classification emitted by ReceiptIt processors.';
