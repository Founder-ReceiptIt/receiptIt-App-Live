# Golden Egg v0

Golden Egg turns the existing private receipt vault into a first, useful
purchase-protection loop:

`Capture -> Understand -> Protect -> Act -> Prove`

It deliberately builds on the frozen image, PDF, email, private-Storage and
document-classification paths. It does not introduce a second receipt model.

## Purchase Passport

The existing receipt detail sheet is now the Purchase Passport. It presents the
purchase hero, secured original, capture source, document type, extracted
items, payment evidence, references, explicit return/warranty dates and a
minimal timeline. Non-standard purchase evidence continues to use the existing
Document Review state and remains visibly distinct from a completed receipt.

## Shield rules

Shield is derived on read rather than stored, so it cannot become stale:

- **Protected**: parsed/completed purchase with a private original.
- **Action soon**: an explicit return date is within seven days, or an explicit
  warranty expiry is within 30 days.
- **Review needed**: a document-review/currency-review record or a completed
  record whose original is unexpectedly missing.
- **Not protected**: processing, failed, rejected or otherwise unfinished.

Only explicit extracted or user-confirmed dates are used. ReceiptIt does not
infer retailer policies or statutory rights.

## Protected value

Wallet calculates protected value from parsed/completed purchases only when all
of these are true: a positive `amount_gbp`, a private original path, and a
finalised purchase status. Needs-review, rejected, failed and duplicate records
are excluded. The metric means the value for which ReceiptIt currently holds
usable proof; it is not insurance, resale or replacement value.

## Proof Pack

`generate-proof-pack` is an authenticated Supabase Edge Function. It verifies
the caller owns the ready purchase, retrieves only that purchase and its child
items/payments through the service role, generates a ReceiptIt PDF evidence
summary, writes it to the separate private `proof-packs` bucket, records a
`proof_pack_generated` activity event, and returns a 60-second signed download
URL. No permanent URL is stored or exposed.

The pack is a clean, shareable purchase record created from the user's saved
receipt. It appends the original receipt as the source evidence rather than
embedding a durable Storage URL; the original also remains available through
ReceiptIt's normal signed Original flow. It does not certify legal validity,
replace a retailer receipt or guarantee a claim outcome.

## Activity model

Capture and processing completion are derived from the receipt timestamps and
status. `purchase_activity` stores only privacy-safe, owner-scoped user actions:

- `original_viewed`
- `proof_pack_generated`

The activity table and Proof Pack records are RLS-protected to their owner.

## Data and deletion

Migration `20260820120000_add_golden_egg_v0.sql` adds `proof_packs`,
`purchase_activity`, the owner-verified `record_original_view` RPC and the
private `proof-packs` Storage bucket. The account-deletion function now removes
both receipt originals and Proof Pack objects before deleting the account.

## Beta scope intentionally deferred

- serial/model and product-photo records
- household ownership and purchase merging
- retailer-policy or statutory-right calculations
- recall, resale and repair intelligence
- permanent/revocable sharing links
