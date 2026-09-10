# First-open animation — revision 5

The supplied `receiptIt-Animation-System` revision 5 replaces the former
“Everything after the purchase, handled.” headline and supporting diagram.
The canonical wordmark remains above the full animation; Continue remains
immediately available and uses the existing onboarding callback.

## Integration

- Self-hosted snapshot: `public/intro/revision-05/`, including font/icon licences.
- Web component: `variant="full"`, `layout="signup"`, 390×540 composition.
- Original imported JavaScript SHA-256 (before the timing refinement below):
  `22053e50f613f048c3d234ea351663fa06718b32bbee493e50c64ad08ee22b11`.
- No iframe or runtime dependency on the local review server.
- Reduced motion uses the supplied 780×1080 static image. Module failure retains
  the same fallback. Pause/play is available without blocking Continue.
- Unmount removes the component and its animation/observers. The supplied
  component pauses advancement when offscreen or the document is hidden.
- No authentication, capture, processing, Alias or database changes.

## Verification

`scripts/test-intro-animation-browser.mjs` exercises the actual application with
isolated access-grant responses: no real accounts are created or modified.
Desktop 1280×800, 320×568, 360×640, Pixel 393×873, iPhone 390×844 and Samsung
412×915 pass animation, ordering, horizontal-fit, scroll-clearance and Continue
checks. Pause/play, reduced-motion and module-failure fallback pass.
These are browser viewport simulations, not physical-device tests.

Screenshots and JSON results are saved in `output/intro-animation/`.
TypeScript, lint (zero errors; three pre-existing warnings), responsive,
auth/gate, account/session, startup, async review and scan review guards pass.

## Approved closing-line refinement

The full loop now lasts 15.5 seconds. The first closing line fades in from
9.70–10.35s, the second from 10.55–11.30s, and both hold until the reset at
15.32s. This provides about one additional second of fully visible closing copy
compared with the previous hold. Signup text increases from 14 to 15 SVG units,
with slightly wider line spacing; the external wordmark moves upwards 8px.
Copy, checkout, email and receipt movement are unchanged. The static fallback
is re-rendered from the same updated component. The module uses `?v=6` to avoid
stale cached timing. Browser tests cover the sequential reveals and text fit.
