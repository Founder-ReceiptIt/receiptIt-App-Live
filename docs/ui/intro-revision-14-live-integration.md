# Revision 14 intro integration

Uses the supplied `/intro/revision-06/preview.html?revision=14` artwork and
35.61-second timeline. The asset directory name is historical: its content is
revision 14, including the longer Step 2 explanation hold.

- Removed the external top receiptIt wordmark. The animation opens with its own
  “How receiptIt works” heading; its approved closing wordmark remains.
- Removed the legacy Continue footer. The animation's native “Let's begin”
  button invokes the existing onboarding continuation, without changing auth,
  access grants, intro completion storage or signup routing.
- Added an icon-only, 44px target replay button directly below Let's begin,
  centred, with accessible name and tooltip “Replay animation”. Replay resets
  the same animation to the start without completing onboarding.
- Pause/play remains available during the story. Playback stops at its ending
  rather than automatically looping. No extra forced delay after the supplied
  button reveal at 31.7575 seconds.
- Reduced-motion and asset-failure fallbacks retain the supplied static visual
  with a real Let's begin button; no non-functional replay is shown for a still.
- Assets and fonts are served from the app, not a local preview server.

The browser test uses the actual built app with isolated account API responses.
It checks the six desktop/mobile viewport sizes, story geometry and timing,
replay positioning/restart, Let's begin routing, no Continue or external logo,
full natural playback, reduced-motion and module-failure fallback. No real
account is created or changed by these tests. Physical-device hardware is not
claimed by the viewport checks.

Screenshots/results: `output/intro-animation/revision-14/integrated/` and
`output/intro-animation/revision-14/production/` for the deployed run.
