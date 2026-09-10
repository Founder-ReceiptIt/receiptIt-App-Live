# Warranty / Returns visual system and Wallet composition

## Reference and implementation

Reference: Screenshot 2026-09-09 at 11.09.17 pm.png, supplied 10 September 2026.
The design uses a prominent unboxed outline shield, teal gradient/tint and ambient
border light; the return arrow sits in a tinted outlined tile with warm coral
status text. Both use small uppercase status labels and quieter calendar/clock
metadata. The new compact treatment follows those characteristics without copying
the example's dates or duration.

Shared icon/colour/surface definitions live in purchaseProtectionVisuals.ts.
ProtectionCard, ProtectionBadge and PurchaseProtectionFilter share those tokens.
Warranty expiry is the currently available stored value; a warranty duration is
not exposed by the receipt data model. Show its real expiry and calendar days left,
not a fabricated duration. The existing active/urgent/expired decisions are unchanged.

Details order is purchase summary → Items & payment → Warranty / Returns.
Mobile stacks the cards; desktop uses two columns. They share the Items section
width. Expired protection is muted without glow; missing dates create no cards.

Wallet large summary blocks are removed. The two compact 44px filters live beside
Receipts on mobile and left of search on desktop. Each toggles off; selecting the
other clears the first. Selected border/tint and a small text label communicate
the filter. Empty states are No active warranties / No active return windows.
Search/category composition remains unchanged. Wallet badges use the same icons
and colour tokens. Card padding/gaps reduced without deleting metadata.

## Verification

All Supabase traffic was intercepted by isolated UI fixtures. No production user
records or originals were written. Mobile results are browser viewport simulations,
not claims of physical-phone or OLED hardware testing.

Passed: 320×568, 360×640, Pixel 393×873, iPhone 390×844, Samsung 412×915,
desktop 1280×800. Screenshots reviewed against the supplied image for outline
icons, teal/coral surfaces, restrained visible glow, status hierarchy and layout.

Cases: both, warranty only, returns only, neither, urgent, expired; category/search,
mutually exclusive toggles, empty states, no horizontal overflow and cards below
Items & payment. Existing Quick scan browser test passed camera-picker activation,
navigation, retained Scan flow and account sign-out on Small/Pixel/iPhone/Samsung;
desktop still opens Scan without forcing a camera.

Measured using equivalent fixtures:
- Pixel/iPhone first receipt top: 615px → 501px (114px higher).
- Samsung first receipt top: 615px → 501px.
- Desktop first receipt top: 666px → 530px (136px higher).
- Pixel/iPhone card: 219.25px → 197.25px (10.0% shorter).
- Samsung/desktop card: 160.75px → 138.75px (13.7% shorter).

TypeScript, lint (0 errors, 3 pre-existing warnings), build, responsive guard,
account/session isolation, async/document-review, analytics, Scan/multi-image and
Lewis receipt-detail UX guards passed. Existing bundle-size warning remains.

Repeatable tests: scripts/test-wallet-protection-browser.mjs and
scripts/test-startup-browser.mjs. Set RECEIPTIT_BROWSER_MODULE if Playwright is
installed outside the project. TEST_URL selects local preview or live frontend;
Supabase responses remain intercepted. QA_ONLY can narrow the device list.
Screenshots: output/wallet-protection-composition/{before,after,production}/.

No changes to auth, ingestion, processing, analytics, Storage/RLS, duplicate logic
or AI review. The separate physical Pixel startup acceptance is not reopened.
