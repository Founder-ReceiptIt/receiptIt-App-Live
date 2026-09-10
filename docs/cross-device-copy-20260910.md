# Cross-device wording and Private email — 10 September 2026

## Scope

Only Wallet copy and Private email copy/wrapping changed. No analytics formula,
capture callback, Alias routing, authentication, backend, Storage or processing
changes. Quick scan still calls the same existing capture action on each platform.

## Before / after

- Wallet summary: `This month` / `£X spent` → dynamic `SEPTEMBER SPEND` / `£X`.
  Month name derives from the same calendar-month key already used by the total.
- Wallet shortcut: separate desktop `Scan receipt` and mobile `Quick scan` → one
  shared `Quick scan` label, without responsive copy branches.
- Private email: `At checkout` and `Forward a receipt`, plus a redundant footer
  → exactly the two sections below. Heading and Copy email action are unchanged.
- Narrow email hero: wrap between local-part and domain instead of splitting
  the normal receiving domain. Long local-parts retain safe overflow handling.

## Final Private email content

Your new private email

[User's friendly email address]

Copy email

STOP THE SPAM

Give retailers your receiptIt email instead of your personal inbox when they only need somewhere to send the receipt.

SEND RECEIPTS HERE

Forward receipts, invoices or order confirmations to your receiptIt address and we’ll add them for you.

## Verification

`scripts/test-cross-device-copy.mjs` renders the actual application bundle with
all Supabase requests intercepted using isolated fixtures. It performs no live
purchase uploads or account changes. This is visual/copy QA, not a new claim of
hardware camera or processor acceptance.

Browser-emulated viewports: desktop 1280×800, 320×568, 360×640, Pixel 393×873,
iPhone 390×844 and Samsung 412×915. All pass shared wording, horizontal fit,
Copy email, exactly two supporting sections and final-copy bottom-nav clearance.
Screenshots and machine-readable results: `output/cross-device-copy/`.

September fixture total stays £270.09; August's £37 is excluded. Moving the test
clock to October renders OCTOBER SPEND and the existing October total £42.50.
Monthly budget and average calculation remain unchanged.

TypeScript, production build, responsive guard, analytics consistency,
Scan/multi-image and async/document-review checks pass. ESLint: zero errors,
three existing unrelated AuthContext/ToastContext warnings. The existing bundle
size advisory remains. Old copy assertions were updated, not removed.
