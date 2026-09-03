# Lewis account routing and Alias reliability investigation — 3 September 2026

## Findings

This investigation found two separate defects:

1. **Controlled Scan fixtures targeted Lewis's real account.** The normal production Scan flow used the active authenticated browser identity. No explicit production-QA target check existed. Storage, the receipt row, Scanner Dispatch and Finalise then preserved Lewis's user ID correctly.
2. **Lewis's forwarded order email stopped before receipt processing.** Resend accepted the email and delivered one correctly signed webhook with HTTP 200. Alias lookup resolved the friendly address to Lewis. The message contained a forwarded purchase/order body and no attachment. The webhook created the inbound message, but the implementation only queued attachments; it left body-only mail at received, with no private object or receipt.

Neither finding is evidence of cross-user RLS, Storage or Alias ownership leakage.

## Controlled fixtures assigned to Lewis

The following proven fixture rows were created under Lewis's authenticated user ID and were not altered or deleted during the investigation:

| Receipt ID | Created (UTC) | Evidence |
| --- | --- | --- |
| 1a3c3cf7-a070-4374-8cc8-cdc923b9322b | 29 Aug 08:43 | Harbour Market image |
| 72f57356-5488-4037-bea2-a5c2419e43de | 29 Aug 08:46 | deliberately blurred image |
| 3dac0960-791c-493e-8050-a14ff3ac71a6 | 29 Aug 09:20 | dark-image fixture |
| 7bc79d19-d252-4bd5-aefd-f7933b12edd4 | 29 Aug 09:21 | underexposed fixture |
| 74984ffd-a7fb-43af-8baf-db98146fba05 | 29 Aug 09:22 | too-dark fixture |
| 584676ce-78c0-4325-aea4-3668e60a7f41 | 29 Aug 09:23 | cropped fixture |
| 6e57b1fd-4905-4d2b-9040-708a43c0c043 | 29 Aug 09:23 | long-receipt fixture |
| 977b96fa-2f38-4fd8-8a01-6b5cc4ba4198 | 29 Aug 09:38 | Harbour Market image |
| e9eae4bd-24a5-45aa-b989-1465dbc376e3 | 29 Aug 09:41 | Harbour Market text PDF |
| 2cd67832-07a5-45ba-9cbb-f5ecaf54827c | 2 Sep 17:54 | Harbour Market image |
| a98f58d4-c01b-4c76-b6ae-b42f7a10d0bc | 2 Sep 17:56 | Harbour Market image |
| 4fd0aa89-980f-48ad-b4f4-8ba068b6dd43 | 2 Sep 17:57 | deliberately blurred image |
| 98cc01dd-fde0-48fb-b3f1-5efa498cc654 | 2 Sep 17:58 | Briar Lane quantity/PDF fixture |

Six earlier Bunnings/IKEA rows were not labelled as ReceiptIt fixtures by their filenames or processing notes and were not reclassified or touched.

## First wrong-owner boundary

The first wrong-owner boundary was **test target selection in the production browser**, before Storage or database insertion. ScanTab builds the private object path from user.id and inserts the receipt with the same user.id. Make receives that owner from the watched row; it does not choose an account.

Repository and exported-workflow searches found no hard-coded Lewis UUID or friendly Alias in production code, Make mappings or committed scripts.

## Exact forwarded-email trace

- Provider: Resend Receiving
- Provider event: msg_3IZ2JfwWbw2CYl69my25qNGN9vb
- ReceiptIt inbound message: 9b0a6f24-d027-46dd-af59-3ef096b271b2
- Provider delivery: HTTP 200 on the first and only attempt
- Alias result: Lewis's active friendly Alias resolved to Lewis's active opaque routing identity
- Envelope classification: delivery_or_fulfilment
- Attachments: 0
- Pre-fix terminal state: received, no inbound evidence row, no receipt, no Make execution

The first failed boundary was the webhook's attachment loop. The message itself was accepted and correctly owned; no processor was invoked.

## Fixes

- Body-only, non-marketing email is rendered as an inert, text-searchable private PDF.
- That PDF enters the existing Scanner Dispatch → PDF Processor → canonical Finalise route.
- The body representation is deterministic, so the existing per-user SHA-256 duplicate guard remains authoritative.
- A synthetic inbound_attachments evidence row records queue, duplicate, rejected or failed state without storing the raw mailbox body in the database.
- HTML-only provider content has a bounded plain-text fallback.
- Message status is derived from the actual evidence outcome; body-only mail no longer remains silently received.
- A server-owned production-test allowlist and ?qa=1#scan guard prevent controlled fixtures from inheriting an arbitrary beta session.

No raw email body, credential, signed URL or full sender address is recorded in this report.
