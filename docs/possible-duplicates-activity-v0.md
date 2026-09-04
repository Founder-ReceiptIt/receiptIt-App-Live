# Possible duplicates + Activity v0

## Purpose

ReceiptIt retains its existing per-user SHA-256 guard as the authoritative
exact-duplicate check. A second, non-destructive layer now identifies only
high-confidence similarities between different files after extraction. It
never blocks, merges or deletes a purchase. The owner sees **Possible
duplicate**, can open the existing purchase, and can choose **Save anyway**.

Activity is a calm, privacy-safe account history rather than an email inbox. It
derives receipt and email outcomes from existing owner-scoped records and shows
only events that explain what ReceiptIt did or what needs attention.

## Conservative matching

Candidates must belong to the same owner, have different file hashes, compatible
successful/review statuses, the same currency and an amount within one penny.
The database then requires one of:

- the same meaningful invoice, order or transaction reference plus recognisable
  merchant similarity; confidence `0.995`;
- same purchase date, strong merchant similarity, at least two items with at
  least 80% overlap, capture within two hours, and either the same card hint or
  complete item overlap; confidence `0.965–0.980`;
- for a one-item receipt, the same date/item/card hint, near-identical merchant
  and capture within 30 minutes; confidence `0.955`.

Generated `REF-*` and `EMAIL-*` placeholders are not treated as evidence.
Explicitly different invoice/order/transaction references prevent a match.
Different purchase dates prevent item-based matches. The review threshold is
`0.950`; lower-confidence similarities are ignored.

## Activity privacy

Activity reads a maximum of 100 recent events from the last 90 days. It uses:

- receipt status and timestamps;
- inbound message status, classification and sender domain;
- the attachment-to-receipt association;
- existing owner-scoped `purchase_activity` records;
- pending possible-duplicate decisions.

It does not request or render email subjects, addresses, body text, attachment
contents or provider authentication data. Correctly filtered marketing is
omitted. All source tables and duplicate candidates remain protected by RLS.
Exact duplicate activity is rate-bounded to one record per receipt per five
minutes.

## Lifecycle

Possible-duplicate records reference the owner and both receipts with cascading
foreign keys, so receipt/account deletion removes them. Activity and duplicate
review records are included in **Download my data** alongside purchase and
email outcome data. No private original path or email body is added to the
Activity UI.

## Verified matrix

The live database transaction test proves:

| Case | Result |
| --- | --- |
| Exact same image | Existing SHA-256 trigger blocks it |
| Same receipt photographed twice | High-confidence candidate |
| Same merchant/amount, different day | No candidate |
| Same merchant/amount/day, different reference | No candidate |
| Different receipt | No candidate |
| Same invoice, different evidence | High-confidence candidate |
| Same order confirmation, different evidence | High-confidence candidate |
| Cross-user candidate/receipt read | Denied by RLS |
| Save anyway | Owner-only RPC succeeds |
| Repeated exact duplicate activity | One bounded event |

The transaction rolls back all controlled rows after the assertions.
