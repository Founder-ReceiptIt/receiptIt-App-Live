# P0 cross-user incident record — 3 September 2026

## Status

- **Reported risk:** a beta tester appeared to see controlled Harbour Market receipts they did not upload.
- **Wallet incident classification:** **D — the shared browser was authenticated as a different account**.
- **Server-side cross-user receipt disclosure found:** **No**.
- **Separate issue found during the audit:** an obsolete legacy Storage bucket was still public and contained historical uploads. It has been made private in place; no evidence objects were deleted or changed.
- **Personal-data breach-risk assessment required:** **Yes**, for the legacy bucket. Whether notification is legally required depends on the documented likelihood-and-severity assessment and must not be inferred from the absence of access logs.

This record is deliberately sanitised. It does not contain authentication email addresses, receipt contents, private object paths, signed URLs, credentials or personal document details.

## Scope and identifiers

- Reported account auth ID: `2ab1f79b-c040-4fef-a2eb-43752d9bc473`
- Account created: `2026-08-28 21:26:20 UTC`
- Last sign-in observed during the investigation: `2026-09-03 08:37:23 UTC`
- Receipt rows owned by that account at investigation time: `19`
- Foreign-owned receipt rows returned to that account in the ownership audit: `0`

Repository state at resumption was `b9e705c0` on `codex/alias-inbox-v0`, equal to `origin/main`. No incident build, deployment or test process was left running by the interrupted Codex request.

## Suspicious Wallet records and ownership

Every Harbour Market row visible in the reported account belongs to the same auth user shown above. The hashes, timestamps, source types and processing history tie them to controlled ReceiptIt fixtures exercised during beta verification.

| Receipt ID | Created (UTC) | Source | Amount | Hash prefix | Ownership finding |
|---|---:|---|---:|---|---|
| `1a3c3cf7-a070-4374-8cc8-cdc923b9322b` | 2026-08-29 08:43 | image | GBP 30.20 | `afe58cd5cd95` | controlled fixture; reported account owns row |
| `3dac0960-791c-493e-8050-a14ff3ac71a6` | 2026-08-29 09:20 | image | GBP 30.20 | `764eae92269e` | controlled dark-image fixture; reported account owns row |
| `6e57b1fd-4905-4d2b-9040-708a43c0c043` | 2026-08-29 09:23 | image | GBP 30.20 | `6235efe341e9` | controlled long-image fixture; reported account owns row |
| `977b96fa-2f38-4fd8-8a01-6b5cc4ba4198` | 2026-08-29 09:38 | image | GBP 30.20 | `67c23e63b1de` | controlled fixture; reported account owns row |
| `e9eae4bd-24a5-45aa-b989-1465dbc376e3` | 2026-08-29 09:41 | PDF | GBP 5.80 | `3f2b6dcc2411` | controlled text-PDF fixture; reported account owns row |
| `2cd67832-07a5-45ba-9cbb-f5ecaf54827c` | 2026-09-02 17:54 | image | GBP 5.80 | `7e29bd846404` | controlled fixture; reported account owns row |
| `a98f58d4-c01b-4c76-b6ae-b42f7a10d0bc` | 2026-09-02 17:56 | image | GBP 5.80 | `d2499db836f5` | controlled fixture; reported account owns row |

The account was the disposable fresh-user beta-test identity created for ReceiptIt testing on 28 August. There is no separate Lewis-owned receipt row among the reported Harbour Market data.

## First broken boundary and root cause

The first divergence was at **browser authentication/session identity**, before the Wallet query:

1. The browser restored the disposable test account session.
2. The app accepted that authenticated identity and correctly queried only that identity's data.
3. The Wallet therefore displayed controlled records that genuinely belonged to the active account, while the tester believed they were using their own account.

The server did not substitute another user's rows. The production Wallet query was already owner-filtered and database RLS independently enforced ownership.

The audit did identify client-side defence-in-depth gaps that could briefly retain the previous account's in-memory Wallet/profile/selected-receipt state while a different identity loaded. Pending PWA share-target data in IndexedDB was also not cleared on identity changes. These gaps did not create the persistent Harbour Market result, but they could cause a short same-browser data remanence window and were corrected as part of containment.

## Server-side audit

The audit confirmed:

- `receipts` reads and writes are restricted to `auth.uid()`.
- receipt item, payment, activity and Proof Pack access is restricted through the owned parent/user.
- private receipt Storage policies require the first object-path folder to equal `auth.uid()`.
- original-view and Proof Pack server functions verify the authenticated owner.
- account deletion verifies the requested user against the authenticated token.
- inbound email resolves the recipient to a server-owned alias and writes the resolved alias owner; it does not trust a client-supplied owner.
- Scanner Dispatch passes the watched receipt row's owner and Storage path into its child processor.
- Finalise verifies and updates the pair `receipt_id + user_id`.

## Alias audit

- The reported account's inbound history contained one Resend message classified as delivery/fulfilment, with no attachment and no generated receipt.
- No reported Harbour Market row was created through that inbound message.
- A controlled two-user routing test proved unique friendly and opaque aliases, correct friendly-to-opaque owner resolution, unknown-alias fail-closed behaviour, own-only alias visibility and denial of client-side alias reassignment.

## Separate legacy Storage exposure

The audit found the obsolete bucket `Receipts_uploads` with `public = true` before containment.

- Bucket created: `2026-01-16 10:57:45 UTC`
- First content object: `2026-02-03 11:26:46 UTC`
- Last content object: `2026-04-12 16:41:31 UTC`
- Content objects: `52` plus one empty placeholder
- Total content size: `61,124,968` bytes
- Unique contents by SHA-256: `14`
- Duplicate copies: `38`
- Objects with a current `receipts.file_hash` match: `0`
- Current receipt rows referencing the bucket: `0`
- Object owners recorded by Storage: none (`owner_id` was null)

Inspection of one copy of each unique hash established that the bucket included both controlled/stock fixtures and real personal purchase, billing and travel documents. The original cloud objects were preserved.

The bucket was switched to private in place on 3 September 2026. Migration `20260903153000_make_legacy_receipt_uploads_private.sql` makes that containment durable and is recorded in the production migration history. Unauthenticated public-object and anonymous authenticated-object requests now fail, and no permissive policy grants access to this legacy bucket.

The possible content-exposure window is therefore conservatively recorded as **3 February 2026 until containment on 3 September 2026**. Available database metadata does not establish whether any unauthorised person accessed an object. Lack of access evidence must not be treated as proof that access did not occur.

## Containment and correction

1. Made `Receipts_uploads` private without moving or deleting evidence.
2. Added a durable migration that asserts the bucket remains private.
3. Confirmed the reported test identity had no active refresh sessions at final verification; no live session remained to revoke.
4. Clear profile, Wallet, selected receipt, scan state and unowned share-target IndexedDB data before exposing a changed auth identity.
5. Remount the authenticated application shell per auth user and gate an open receipt modal to its owner.
6. Ignore stale profile and Wallet async results after an identity transition.
7. Scope realtime channels and server filters to the current user.
8. Removed identifiers and full receipt rows from browser console logging.

No suspicious receipt, child row, inbound record or Storage object was deleted or altered.

## Regression evidence

### Same-device account switch

A controlled same-client sequence signed in temporary User A, read only A's row, signed out, confirmed A's persisted session was removed, signed in User B using the same client-side storage, and read only B's row. The prior identity was absent after the switch. Temporary users and rows were removed after the test.

The application guard additionally verifies that the authenticated shell remounts per user, prior Wallet rows clear before the next query, stale asynchronous results are ignored, selected receipts are owner-gated and PWA share-target state clears on identity change.

### Two-user database/API/Storage

A controlled two-user test with real authenticated JWTs passed:

- own receipt access;
- denial of cross-user receipt and child reads;
- denial of cross-user receipt update/delete;
- own private-object read and signed URL creation;
- denial of cross-user private-object read, signing and upload;
- denial of cross-user original-view RPC activity;
- denial of anonymous sensitive-table and private-object access.

The temporary users, rows and objects were removed after the test.

### Build checks

- TypeScript: pass
- ESLint: pass with no errors (three pre-existing warnings)
- account/session isolation guard: pass
- share-target guard: pass
- production build: pass

## Risk assessment and required follow-up

The Wallet report itself did **not** expose another user's server-owned receipt data. Its immediate confidentiality risk is closed by proving the active identity and hardening identity transitions.

The legacy public bucket is a separate personal-data incident and requires a documented breach-risk decision by ReceiptIt's accountable owner. ICO guidance requires organisations to record every personal-data breach and says that a breach likely to risk people's rights and freedoms must be reported without undue delay and, where feasible, within 72 hours. Affected individuals must be informed without undue delay where the risk is high. See:

- [ICO — Personal data breaches: a guide](https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/personal-data-breaches-a-guide/)
- [ICO — Self-assessment for data breaches](https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach-assessment/)
- [ICO — 72 hours: how to respond](https://ico.org.uk/for-organisations/advice-for-small-organisations/personal-data-breaches/72-hours-how-to-respond-to-a-personal-data-breach/)

Recommended immediate owner action: complete the ICO self-assessment today using this incident record, record the decision and rationale, and seek qualified privacy/legal advice if the affected people, content sensitivity or access likelihood cannot be established promptly. This document records technical facts; it is not a legal determination.

## Closure criteria

Technical closure requires the identity-transition fix and legacy-bucket migration to be committed, deployed to production, and verified against the deployed commit. The formal breach-risk decision is an accountable-owner/legal task and remains separately time-sensitive even after technical containment.

## Final technical closure

- Fix/containment commit: `e31efde9f9d8eb70c00acb6d8291317533ae052a`
- Remote `main`: verified at the same commit
- Vercel production status: successful (`Deployment has completed`)
- Production origin: HTTP 200; the live bundle contains the per-user realtime channel scoping from the containment fix
- Legacy bucket: verified private after deployment
- Temporary local evidence copies: removed after the sanitised facts above were recorded
- Controlled users, rows and objects: removed; no incident-control records remain

**P0 cross-user technical incident status: CLOSED.**
