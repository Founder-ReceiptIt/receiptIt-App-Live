# ReceiptIt beta threat model

## Security objective

ReceiptIt stores purchase evidence. A user must be able to upload, view,
export, retry, and delete only their own evidence. Receipt text and images are
untrusted input; no document may obtain account, database, Storage, email, or
administrative authority.

## Data flow and trust boundaries

```text
User browser
  | authenticated insert + private object upload
  v
Supabase Auth / RLS / private receipts bucket
  | database event (trusted service path)
  v
Make Scanner Dispatch -> Image/PDF Processor -> OpenAI extraction
  | structured extraction only; no tool access
  v
Finalise (service role) -> receipts, items, payments
  | owner-scoped signed URL on demand
  v
User browser / Wallet
```

Trust boundaries: the browser, uploaded documents, Make executions, OpenAI
responses, Storage, and any future alias/email ingress are independent trust
boundaries. Only service-role automation may write processor-owned receipt
facts or child records.

## Sensitive data inventory

- private originals and extracted receipt text
- merchant, line-item, total, tax, payment-method, date, loyalty and reference data
- account identity, private email alias, authenticated session tokens
- Storage paths and signed URLs
- service-role, OpenAI, Make, Vercel, and webhook credentials

## Primary threats and controls

| Threat | Severity if unmitigated | Current control |
|---|---:|---|
| Cross-user receipt/child-data access | P0 | RLS on every user-facing table; child rows derive access from owned parent receipt |
| Cross-user original access | P0 | private bucket, authenticated owner-folder policies, 60-second signed links |
| Profile/admin privilege escalation | P0 | browser column grants exclude `plan`; owner-only policies |
| Public processing/payment logs | P0 | RLS enabled and browser grants removed |
| Malicious file / cost abuse | P1 | MIME/signature/size/page/image-dimension checks, private bucket MIME/size controls, active-job and hourly upload caps |
| Prompt injection / malformed AI output | P1 | no model tools or database authority; JSON-only extraction, canonical parser/router, fail-closed unknown classifications; PDF prompt explicitly treats document text as hostile evidence |
| Account deletion leaving evidence | P1 | server deletion removes private objects before auth cascade and verifies controlled cleanup path |
| Alias/access-code enumeration / unauthorised beta signup | P1 | access codes are server-verified only with hashed rate limits; a short-lived, one-time opaque signup authorization is consumed server-side before account creation |
| Signed-link leakage | P1 | on-demand, owner-authorized, 60-second signed URLs; no permanent frontend public URL |
| Lost device / session theft | P1 | Supabase Auth sessions; users should sign out on shared devices and use a unique password |
| Insider/support browsing | P2 for beta | no support UI or casual browser access; service access remains privileged and must be deliberate |

## Residual beta risks

- Make execution history necessarily contains processor inputs and OpenAI
  outputs for troubleshooting. Access must remain limited to founders who need
  it; retention should be minimized before public launch.
- The project is on the Supabase Free plan. Automatic backup/PITR and a
  separately verified Storage restore process are not confirmed for beta.
- Future alias/email ingestion needs its own signed webhook, replay protection,
  sender-abuse controls, and redaction rules before activation.
- Make execution history and OpenAI retain the processor input needed to
  extract a document. This is deliberately limited to the processing path, but
  retention and operator access must be tightened before public launch.
