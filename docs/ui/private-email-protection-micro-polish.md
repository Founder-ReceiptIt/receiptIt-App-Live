# Private email and purchase protection micro-polish

## Scope

Presentation only. No changes to auth/routing, receipt dates or status calculations,
processing, scanning, Alias handling, analytics, duplicates, Storage or RLS.

- Private email heading: **Your new private email**. Explanatory subheading removed,
  with no replacement; hero and examples retain their existing spacing and content.
- Intro: **USE IT LATER — Returns · Warranties · Proof of purchase**. The final phrase
  stays together when the line wraps.
- Warranty details: compact shield, teal heading, teal border/tint, restrained glow,
  explicit Active status and existing expiry date.
- Return details: compact return arrow, coral/rose heading, border/tint/glow, existing
  days remaining. Existing urgent status gets a slightly stronger treatment.
- Wallet: compact matching active warranty and return pills below purchase metadata.
  At narrow widths the badges use their own row rather than squeezing the amount.
- Expired details remain muted without glow. Absent dates create no placeholder.

## Verification

Production build rendered with isolated, intercepted Supabase display fixtures;
no production records or originals created, modified or deleted by these checks.
Browser viewport simulation is not a physical-phone acceptance claim.

Passed: 1280×800, 320×568, 360×640, Pixel 393×873, iPhone 390×844, Samsung 412×915.
Checked private email, intro wrapping, Wallet and Details with both/only warranty/
only returns/neither, plus urgent and expired cases. No horizontal page overflow.
Compact details remain approximately 88px high for a one-line date/status.

Checks: TypeScript, lint (zero errors; three pre-existing context warnings), responsive
guard, async/Document Review guard, analytics consistency, Scan/multi-image guard,
Lewis UX guard, production build. Existing bundle-size warning remains unchanged.

Repeatable isolated browser test: `scripts/test-micro-polish-browser.mjs`.
Set `RECEIPTIT_BROWSER_MODULE` if Playwright is outside the project, and `TEST_URL`
to a local preview or deployed frontend. All Supabase requests are intercepted.
`QA_PHASE=before` captures the previous layout without the new-copy assertions;
default phase tests the new copy and badges. `QA_ONLY=Pixel,Samsung,Desktop` narrows
the viewport list. Screenshots are under `output/micro-polish-email-warranty/`.

Before/after screenshots include `detail-Desktop.png`, `detail-Pixel.png`,
`detail-Samsung.png`, equivalent `wallet-*`, `email-*`, and `intro-*` captures.
The previous physical Pixel startup acceptance remains separate and is not closed
or retested by this styling task.
