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

## Production deployment

The fix was published to `main` in commit `719c7c239b093f5cb8cd736be2eb5f097ae2302d`
(`Protect beta accounts and process body-only purchase emails`). The production
Vercel deployment completed successfully, the production QA allowlist migration
was applied, and the `inbound-email` Edge Function was deployed with the existing
Resend and Supabase secrets. No credential was committed or recorded here.

## Live replay result

After deployment, the original Resend event was replayed once through the signed
production webhook. The same ReceiptIt inbound message was reused and the body was
converted to one private PDF evidence object. The result was:

- owner: Lewis's existing user ID;
- receipt: `4c628c00-344c-4bd0-a52b-dc9bc6d5c21d`;
- source: `email`;
- classification: `order_confirmation`;
- status: `needs_review`;
- reason: `non_standard_purchase_document`;
- merchant: eufy AU;
- amount: AUD 71.85;
- private original: present.

This is the intended Document Review outcome for an order confirmation. It did
not enter the standard receipt Finalise path and did not create receipt item or
payment child rows. The message no longer disappears.

## Alias regression matrix

All controlled regression data below was directed to the server-approved
`nicholas47c` QA identity unless the case explicitly concerned Lewis's own
reported message.

| Check | Result | Evidence |
| --- | --- | --- |
| Friendly Alias ownership | PASS | `calmfox78` resolves to Lewis; `nicholas47c` resolves to the approved QA user. |
| Opaque Alias ownership | PASS | Each active opaque Alias resolves to the same owner as its friendly Alias. Authenticated clients retain SELECT-only, own-row access. |
| Forwarded body-only email | PASS | Lewis's original message produced private evidence and the Document Review result above. |
| Direct attachment email | PASS | A signed QA event produced receipt `052c63bb-c5de-4b57-b67c-a0464c19d7cf`, Harbour Market, GBP 5.80, three items, one card payment, status `parsed`. |
| Exact attachment duplicate | PASS | A separate email containing the identical PDF ended `duplicate` / `exact_duplicate`; it created no receipt and its temporary object was removed. |
| Same webhook replay | PASS | Replaying the same event returned `replayed: true` and retained exactly one message, evidence row, receipt and object. |
| Marketing email | PASS | The message ended `ignored` with no evidence, receipt or Storage object. |
| Purchase-related document | PASS | A controlled order confirmation produced Bayview Home, GBP 37.00, `order_confirmation` / `needs_review`. |
| Hostile document content | PASS | The hostile PDF ended `non_purchase_document` / `rejected`, with no child rows and its private original preserved. |
| Unknown Alias | PASS | The endpoint returned the same generic accepted response, recorded only a hashed-recipient `unknown_or_disabled_alias` rejection, and created no inbound message. |
| Invalid signature | PASS | A current invalid-signature request returned HTTP 401 before Alias or provider processing. |
| Signed original | PASS | The QA email receipt opened successfully through the normal short-lived signed private URL flow. |

## Core regression and isolation evidence

- A fresh QA image receipt completed as Briar Lane Market, GBP 8.00,
  `receipt` / `parsed`.
- A fresh QA text PDF completed as Parkside Grocer, GBP 17.00,
  `receipt` / `parsed`.
- The QA Wallet displayed the QA Alias fixtures and did not display Lewis's eufy
  order. Lewis's private evidence object remained under Lewis's owner folder.
- ReceiptIt's account/session, responsive, asynchronous-review and share-target
  guards passed. TypeScript passed; ESLint completed with zero errors and three
  pre-existing warnings; the production build completed successfully.
- No RLS, Storage, Scanner Dispatch, processor, Finalise or duplicate-security
  rule was weakened for this fix.

## Impact conclusion

No further beta-user data was found to be affected. The controlled fixture rows
listed above are the complete proven set placed in Lewis's account, and they remain
preserved pending explicit cleanup approval. All post-fix controlled data was
confined to the approved QA account. The failure was a test-targeting process flaw
plus a body-only ingestion gap, not cross-user disclosure.

**Lewis test routing and Alias reliability investigation: CLOSED.**
