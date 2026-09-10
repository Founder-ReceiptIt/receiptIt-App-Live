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
Final closure is pending the actual live matrix.
