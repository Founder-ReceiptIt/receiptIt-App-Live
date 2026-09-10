# Exact vs possible duplicates and reliable deletion — 10 September 2026

## Proven incident

The Northbridge Tech original is `12c0321e-7410-44af-8001-e47a61ba63e2`.
The later attempt `f7df3ee4-5576-4070-9a22-94b1084e620a` (09:16:35 UTC)
shares SHA-256 `4dbd7c44b17859c9e8cdbdaeb3825b64c30c4bc207beb2058c8377b22bbfdce3`.
Its client exact-duplicate override created a new processing row. The Image
Processor correctly suppressed it at 09:16:38 UTC (`processing_logs`
`5b3c9993-62b0-4cf3-a13e-2ff71f876343`, route image_processor, skip duplicate).
The result was status duplicate / is_duplicate true / merchant Analyzing, hidden
from normal Wallet. This was NOT the separate fuzzy acknowledgement failing.
Two historic fuzzy acknowledgements were still saved_anyway with parsed rows.

The original had zero Storage objects at its recorded path, despite its parsed
row remaining. Existing deletion removed Storage BEFORE the DB DELETE. The DB
failure was reproduced using disposable transactional rows: FK ON DELETE SET NULL
updates duplicate_of, which enforce_receiptit_client_receipt_update rejected with
P0001 "Receipt evidence fields are processor managed". The FK definitions themselves
were correct. original_receipt_id had the same latent conflict.

The exact-hash-matching local fixture restored the missing original to its same
owner-private path. No existing production purchase row or duplicate attempt was
deleted during investigation. The restoration was verified in Storage.

## Corrected semantics

- Exact bytes/hash: Already saved; View existing / Cancel. No override. Database
  advisory lock retains race protection, including explicit forged overrides.
  Lookup prefers an actual saved receipt over historic suppressed duplicate jobs.
- Different evidence: existing conservative matching thresholds unchanged. The
  new purchase is persisted BEFORE the post-processing possible-duplicate notice.
  Save anyway validates it remains independently saved and records saved_anyway
  idempotently. It does not create a third row, merge purchases or bypass hashing.
- FK detachment is permitted only inside a nested trigger after the referenced
  row is gone, with every other field unchanged. Direct client link/evidence edits
  stay blocked. Independent purchases remain, with their links detached.
- Only historic same-owner/same-hash suppressed duplicate jobs explicitly linked
  to a deleted original are removed with it. Different photographs, parsed rows
  and independently saved purchases never cascade with the original.

## Deletion reliability

The shared browser helper sends only receiptId to delete-receipt. The function
verifies the signed-in user and performs the database DELETE with their JWT/RLS.
It never trusts client Storage paths. Database deletion atomically queues primary,
evidence-version and generated Proof Pack paths before dependent rows cascade.
No original is removed if this transaction fails.

After commit, service-only cleanup checks whether another receipt still uses each
path before deleting it. Queue entries disappear only after successful removal or
confirmation another receipt still uses the evidence. Failures remain retryable,
with a safe machine code and attempts count; no document contents are logged.

`receiptit-storage-delete-recovery` runs every five minutes using existing
Supabase pg_cron/pg_net. It only invokes the worker if the queue is non-empty.
The worker processes at most 100 queued objects per invocation. Queue table is
RLS-enabled with no public/anonymous/authenticated grants. Only service_role reads
or drains it. Job credentials cannot select a receipt to delete or supply paths.
The browser endpoint is owner-authorised and rate-limited. Unknown/other-owner IDs
are indistinguishable idempotent no-ops.

Credential: RECEIPT_DELETE_CLEANUP_SECRET in Edge secrets; matching private Vault
entry receipt_delete_cleanup_secret. Generated securely, never stored in source,
logs or chat. No new paid service. Stale-processing recovery was not changed.
Completed cleanup entries are removed immediately; pending entries retain only
owner/receipt IDs, paths, attempts and safe error code until resolved.

## Verification

The live database transactional suite passes exact override denial, possible
acknowledgement/idempotency, managed-field denial, FK unlinking, independent-row
preservation, durable queue creation, reupload and owner-scoped hash lookup.
All fixtures and dispatch trigger effects in that suite are rolled back.

Live browser/processor matrix and receipt IDs are recorded by the opt-in
scripts/test-duplicate-delete-live.mjs under output/duplicate-delete/. Credentials
remain in process memory. No production PASS is inferred from static guards.
The deployed live matrix completed at 09:52:19 UTC on 10 September 2026.

| Production check | Result | Controlled receipt IDs |
|---|---|---|
| Normal image, exact repeat blocked, no second object, View existing | PASS | cd2f0dce-0624-40fb-a45d-e16fd7bff2a4 |
| Different photograph; Save anyway; both in Wallet after reload | PASS | original above + ae4d8c71-063e-46d3-94fa-58323329b049 |
| Delete second only, preserving original | PASS | ae4d8c71-063e-46d3-94fa-58323329b049 |
| Reupload second photograph after deletion | PASS | 03db2a0a-cf16-4d48-abf5-544afeacf6cf |
| Delete original with pending possible link; other purchase remains | PASS | cd2f0dce-0624-40fb-a45d-e16fd7bff2a4 removed; 03db2a0a-cf16-4d48-abf5-544afeacf6cf preserved |
| Reupload original, independent row and signed original | PASS | c4c15a42-6334-4f74-b450-85694d9a56a7 |
| Second owner: no foreign lookup/access/delete, own same bytes process | PASS | cdf2e844-71f2-4662-8eaf-d05a7e9cc6df |

All five controlled image receipts reached the real production processor and
parsed as Northbridge Tech / GBP 129.99 / document_type receipt. They were then
deleted only from the two explicitly disposable QA accounts. Each corresponding
private object was verified absent; the cleanup queue was empty. Founder records
were not removed. Screenshots: exact-Pixel.png, possible-Pixel.png and
saved-separately-Pixel.png alongside the machine-readable evidence.json.

Fresh signed-URL creation, rather than a previously cached download, verifies
current Storage absence. A cached download initially caused a test-harness false
alarm; authoritative object metadata and new signed requests confirmed removal.
Deletion cannot erase a copy already downloaded by an authorised user.

During the live run Finalise exposed the transient status `finalising`. The exact
guard and lookup now cover it too (migration 20260910131500). The transactional
test explicitly proves lookup and insertion-race protection in that status.

TypeScript, production build, responsive, async/review, scan/multi-image,
account/session isolation and possible-duplicate/Activity guards pass. ESLint
has zero errors and three pre-existing AuthContext/ToastContext warnings. No
new lint warnings. The existing build-size advisory is unchanged.

The actual Receipt Details menu/confirmation/Wallet deletion passed on live
production (`3216e7d8-9e82-4b99-8142-3dd5b7d6dcb4`). A separate deletion fixture
(`dab456d8-5508-47a5-8dfc-82c336b0b81a`) verified items, payments, evidence
versions and Proof Pack child cleanup. Its three private paths remained queued
after a direct owner DB DELETE, then the real 09:55 UTC cron run removed all
three without browser involvement. pg_net response 919 was HTTP 200,
`{"success":true,"pending":0}`. A second worker invocation had no duplicate
side effects. Anonymous deletion was denied and owners could not read the
service-only cleanup queue. Evidence: deletion-recovery.json.
Both disposable QA accounts were removed after verifying their receipt rows and
both private bucket prefixes were empty. These were the only accounts removed.
Test purchases/files were intentionally deleted and cannot be restored from the
app; their controlled local fixture and verification evidence remain available.

## Release

Application/function change: d0deb1b8. Vercel production deployment succeeded:
https://vercel.com/receiptits-projects/receipt-it-app-live/Ffs5cpVsnrSntLMxrkFwBGcNZvpZ
Migrations 20260910130000, 20260910130500 and 20260910131500 are applied live.
All changes stay within duplicate semantics and deletion reliability. No Make,
classification, Alias, analytics, camera or auth-flow changes were needed.

DUPLICATE + DELETE SEMANTICS = CLOSED
