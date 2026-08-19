# Alias Inbox v0

## Scope

Alias Inbox gives each ReceiptIt account one opaque inbound address:

`ri-<40 random hexadecimal characters>@in.receiptit.app`

It is generated only by the database, is not derived from an account ID or
sign-in email, and is intentionally separate from historic user-chosen profile
aliases. The data model supports multiple, rotated and disabled aliases later;
v0 permits one active alias per user.

## Provider and domain

v0 uses **Resend Receiving**. The production receiving subdomain is
`in.receiptit.app`, deliberately separate from any normal mailbox MX records.
Resend sends only signed `email.received` events to:

`https://qqfntftbughorckugceu.supabase.co/functions/v1/inbound-email`

The deployment requires these Supabase Edge Function secrets, set only in the
Supabase project (never Vercel or the browser bundle):

- `RESEND_API_KEY` — restricted to receiving-message and attachment retrieval.
- `RESEND_WEBHOOK_SECRET` — the Svix secret for this exact webhook.

The provider account and the DNS MX record are external prerequisites. Until
both secrets exist, the endpoint deliberately returns `503` and performs no
alias lookup or message processing.

## Inbound security model

1. The endpoint accepts `POST` only, limits webhook size to 256 KiB, and
   verifies the raw Resend/Svix signature before alias resolution.
2. The Svix timestamp is accepted for five minutes only. `svix-id` is the
   first idempotency key; provider `message_id` is a second dedupe key.
3. A recipient resolves only against one active opaque alias. Unknown,
   disabled and malformed addresses receive the same generic accepted result,
   avoiding account/alias enumeration.
4. Email content is hostile evidence. The webhook never follows links, does
   not use sender-provided ownership data, and only retrieves the message and
   attachments from Resend's authenticated Receiving API.
5. At most five non-inline attachments are considered. Each is capped at 6
   MiB and must pass PDF/JPEG/PNG magic-byte validation. Filenames are reduced
   to safe metadata; they never influence paths.
6. Accepted attachment originals are written directly to the existing private
   `receipts` bucket under a random, user-scoped path. The attachment hash is
   used for the existing active-file duplicate guard. No public URL is created.
7. An attachment creates the same `receipts` processing row used by uploads,
   allowing Scanner Dispatch to use the established PDF or image processor.
   Replayed webhooks and exact attachments cannot create a second processing
   record. The original is removed if the receipt queue insert fails.

The service stores minimal mail metadata for observability: sender/reply-to,
sender domain, subject, provider IDs, selected authentication-result headers,
classification, status and hashes. It deliberately does **not** retain full raw
mail source or HTML. Original purchase attachments are retained as the private
receipt original and follow existing deletion/account-deletion rules.

## Classification and routing

Envelope-level classifications are:

- `purchase_transactional`
- `delivery_or_fulfilment`
- `return_or_refund`
- `warranty_or_service`
- `marketing`
- `uncertain`

Obvious marketing is recorded as `ignored` and creates no Wallet purchase.
Attachments use the frozen Image/PDF canonical document-type routing:

- `receipt` → Ready
- invoice/order/payment/hotel/EFTPOS/other purchase proof → Document Review
- non-purchase document → rejected

Plain-text email body extraction is a deliberately separate next implementation
step. It must use the same strict canonical schema and hostile-input rules as
the image and PDF extractors. Until it exists, body-only evidence remains in
minimal inbound metadata rather than being falsely promoted to a Wallet receipt.

## Observability

`inbound_messages` records whether an email was accepted, ignored, processed,
rejected, failed or duplicate. `inbound_attachments` records the private path,
hash, receipt link and queue result. `inbound_webhook_rejections` stores only a
hashed recipient and a stable rejection reason for unknown/malformed aliases.
All three are owner-isolated; browser clients have read-only access only to
their own aliases/messages/attachments.

## Deployment checklist

1. Create/verify the Resend account and `in.receiptit.app` receiving domain.
2. Add Resend's supplied MX record for **only** `in.receiptit.app`.
3. Create an `email.received` webhook pointing to the endpoint above.
4. Set the two Supabase secrets and invoke one signed test event.
5. Confirm a PDF, scanned PDF and image attachment become a single private
   receipt; test replay and exact attachment duplicate behavior.
6. Add the Email Text Processor before advertising body-only receipt support.

## Retention

ReceiptIt is not a mailbox archive. It retains only private purchase originals
and minimal operational metadata needed for delivery/replay diagnosis. It does
not persist full marketing content, raw MIME, or an entire customer mailbox.
