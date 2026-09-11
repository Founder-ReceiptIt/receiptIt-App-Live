# Intro loading, blue-box hold and ending stability

## Proven causes

The wrapper displayed the reduced-motion explanatory image before the JavaScript
and fonts were ready, then replaced it with the animation. With a delayed module
response after submitting the access-code form, this reproduces the text flash.
The image now renders only for reduced motion or an actual asset-load failure;
normal loading reserves a blank black visual area. Auth routing is unchanged.

The replay button changed from display:none to a 44px flex item plus 8px margin
inside the vertically centred finale. This moved the existing ending up 26px.
It now reserves space throughout, remaining invisible, disabled and unfocusable
until ready. Static mode still excludes replay.

## Timing

The blue Personal inbox / Stays separate box holds for another 0.5 seconds.
An explicit scene-clock hold at 17.36–17.86 seconds preserves all downstream
transitions and reading durations. Playback is now 36.11 seconds; the ending
starts at 30.935 and Let's begin becomes available at 32.2575 seconds.
The dynamic module URL is versioned `v=15-app` to avoid stale cached behaviour.

## Verification

`scripts/test-intro-transition.mjs` submits an isolated access code through the
actual access form and delays the module request. Before: fallback visible,
26px ending shift. After: no fallback flash, 0px ending shift; blue-box extra
hold, Replay and Let's begin pass. No actual account or auth configuration is
modified. Evidence: `output/intro-animation/transition/`.

The existing six-viewport browser suite checks the new timing, full natural
playback, layout, pause/play, replay, signup continuation, reduced-motion and
module-failure fallback. TypeScript, lint, responsive, auth/gate and account
isolation guards are unchanged and run for this patch.

## Additional Step 2 reading hold

The subsequent requested refinement adds one further second before the private
email address appears: the heading and paragraph are fully visible at 5.825s,
and the address now starts at 8.325s (a 2.5-second reading hold). The address
reveal still takes 0.61s. All later scenes move one second later; the blue-box
hold and stable ending are retained. Total playback is 37.11s and the live
module version is `v=16-app`. Transition tests explicitly assert that the
paragraph is fully visible and the address absent throughout this longer hold.
