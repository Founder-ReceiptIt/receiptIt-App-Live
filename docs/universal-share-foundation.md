# receiptIt universal share foundation v0

## Shipped boundary

The installed Android PWA registers `receiptIt` as an operating-system share target. A shared payload is accepted by the service worker, bounded before storage, and held in local IndexedDB for no more than one hour. The app then sends supported evidence through the existing Scan pipeline:

`share sheet → local pending share → existing validation → exact hash → private Storage → owner receipt row → Scanner Dispatch → Wallet`

The safe handoff boundary remains unchanged: receiptIt says **Receipt added** only after the private original and owner-scoped `processing` row both exist. Processing is server-owned after that point.

Supported v0 inputs:

- one JPEG, PNG, WebP or PDF;
- up to ten ordered receipt images as one logical receipt;
- plain-text purchase/order/payment messages with sufficient purchase evidence;
- a shared file plus accompanying text (the file is authoritative).

WebP is decoded locally and stored as a high-quality JPEG so it can enter the existing private Storage and Image Processor contract without changing Storage policy or Make. Shared plain text is rendered locally as inert image evidence. Its stable text hash preserves exact-duplicate behaviour. HTML is never interpreted.

One PDF remains one receipt. A share containing a PDF plus another file, or multiple PDFs, is rejected with **Upload one PDF at a time.**

## Authentication and recovery

The pending payload is local to the device and survives the sign-in screen. The share URL retains its opaque intent identifier; after authentication, the Scan screen resumes the same payload. A failed initial upload keeps the payload available for **Try again**. Successful handoff, duplicate detection, unsupported content, cancellation and expiry remove it.

Only privacy-safe diagnostics are retained locally: event name, stable error code, file MIME types, file count and total bytes. No message body, URL, filename, token or receipt content is written to diagnostics. Pending evidence expires after one hour; diagnostic metadata expires after seven days.

## Shared URL security decision

V0 does **not** fetch shared URLs. A URL-only share gives the user the safe next action: save or screenshot the receipt, then share the image or PDF.

Any later remote importer must run server-side in an isolated egress-restricted worker and must, before every request and redirect:

1. require HTTPS and reject credentials in URLs;
2. resolve DNS and reject loopback, link-local, private, carrier-grade NAT, multicast and reserved IPv4/IPv6 ranges;
3. pin the validated public destination for the connection and defend against DNS rebinding;
4. cap redirects and revalidate the complete destination after every redirect;
5. use no user cookies, browser session, Authorization header or internal service credential;
6. enforce small time, byte and decompressed-size limits while streaming;
7. validate magic bytes independently of extension and `Content-Type`;
8. allow only known receipt image/PDF types and reject HTML, SVG, scripts and executables;
9. render/parse inside a sandbox with no tools, network, database or secret access;
10. treat fetched text as hostile evidence under the existing prompt-injection rules;
11. store only the validated resulting evidence in the owner folder; and
12. log only a one-way destination fingerprint, outcome code, byte count and timing.

Authenticated, expiring or retailer-app-only links should fail clearly rather than being fetched with user credentials. A remote importer is intentionally deferred until those controls can be implemented and independently tested.

## Platform reality (September 2026)

| Platform | V0 behaviour |
| --- | --- |
| Pixel/Android Chrome, installed PWA | Supported through the Android WebAPK share target. Files, text and URLs depend on what the source app supplies. |
| Samsung phone using an app installed by Chrome | Same Android WebAPK path; verify the device’s source app supplies the expected MIME data. |
| Android Chrome, not installed | Not available as an OS share destination; use receiptIt’s normal Scan flow. |
| iPhone Safari tab | Cannot register this PWA as an iOS share-sheet destination. |
| Installed iPhone web app | Web Share Target is not available as a reliable iOS PWA capability. |
| Future native iOS wrapper/app | Requires an Apple Share Extension in a containing native app; not part of this PWA patch. |

This foundation does not claim that iOS web installation provides a native share extension.

## Verification matrix

Automated repository checks cover the manifest contract, POST/multipart service-worker boundary, input limits, local expiry, privacy-safe diagnostics, no URL fetch, existing Scan pipeline reuse and service-worker registration. Production verification additionally covers registration and the unchanged responsive/authenticated app.

True OS share-sheet invocation must be checked on installed Android hardware because desktop and browser automation do not emulate Android’s WebAPK share-target registration. Device acceptance cases are:

- SMS purchase text → one processing receipt, Wallet background completion;
- URL-only → safe unsupported guidance, no network request or receipt row;
- screenshot/JPEG/PNG/WebP → one existing Image Processor job;
- two or three ordered images → one combined receipt;
- one PDF → one existing PDF Processor job;
- exact re-share → existing receipt surfaced, no second Storage object/job;
- unsupported/oversized share → deterministic message before paid processing;
- signed-out share → sign in, then resume the same pending payload;
- background/close after handoff → server processing completes and Wallet reconciles;
- downstream rejection/failure → existing recoverable Wallet state remains visible.

## Future native capture path

If receiptIt later ships native Android/iOS clients, keep the current upload contract and replace only the OS handoff adapter. Android can use native share intents; iOS requires an Apple Share Extension. Both should submit the same validated evidence to the same private Storage/receipt-row boundary rather than creating a second extraction architecture.
