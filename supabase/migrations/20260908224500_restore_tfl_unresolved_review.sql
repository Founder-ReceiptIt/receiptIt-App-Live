/*
  Restore the controlled TfL purchase document to its last evidenced state.

  Processor/reassessment history never produced the later GBP 37.00 or the
  2023-12-15 date: the last captured baseline held both as null. Preserve the
  merchant, category, document type and immutable private original, but require
  an owner review before either value can enter monetary analytics.
*/

begin;

update public.receipts
set
  amount = null,
  amount_gbp = null,
  transaction_date = null,
  status = 'needs_review',
  error_reason = 'non_standard_purchase_document',
  parsed_at = null
where id = '53dc6978-5720-45e9-ba4d-9a9fda49f716'
  and user_id = '5b3d86f3-f9a7-4423-9c77-c5849bf78913'
  and merchant = 'Transport for London'
  and amount = 37.00
  and amount_gbp is null
  and document_type = 'other_purchase_proof'
  and storage_path = '5b3d86f3-f9a7-4423-9c77-c5849bf78913/rf9e335ifdl_1788361243147.jpg';

commit;
