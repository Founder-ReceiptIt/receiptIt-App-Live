# Live capture quality assist — 10 September 2026

## Scope and status

Advisory enhancement to the existing ReceiptCamera. No changes to camera
permissions, environment-camera preference, captured JPEG resolution/quality,
Scan intake, multi-page combining, upload validation, hashing/duplicates,
processing, Storage, auth, RLS or classification. The camera remains usable if the
entire quality component fails. Physical-device acceptance is required before
closing this task; browser emulation is not a physical Pixel/Samsung/Safari test.

## Architecture and privacy

`CaptureQualityAssist` samples a separate canvas, at most 160px on its long edge,
and transfers RGBA pixels into a bundled local module worker. `captureQuality.ts`
contains bounded deterministic heuristics; the worker retains only one previous
greyscale frame for movement comparison and returns advisory state/geometry.
No AI, network analysis, third-party SDK, telemetry, frame logging or frame
persistence. Only the bundled worker JavaScript is downloaded. Raw preview pixels
are transient client-side memory, never sent to the backend or added to the photo.

Default: 350ms between completed analyses (approximately 2.8 samples/second).
Devices reporting four or fewer logical cores start at 128px / 800ms. Only one
sample can be in flight. After three warm-up samples, three sustained slow samples
(main-thread draw/read >8ms or worker analysis >12ms) reduce to 128px / 1Hz,
brightness/movement only. Continued pressure disables the layer silently. A 2s
worker timeout, missing Worker/canvas support, read error or worker failure also
disables guidance, never capture. All timers/worker state stop on shutter,
close/unmount, backgrounding and camera error; there is no frame backlog.

## Heuristics, not receipt recognition

- Approximate light-paper boundary: a connected near-neutral bright region with
  contrast from its background, plausible fill/area, and internal dark text-like
  rows. Extreme corners form an approximate quadrilateral. This is not precise
  contour tracking, and is not reliable on every surface/receipt.
- Dark: low overall luminance or dim detected paper. Bright paper against a dark
  background is judged by the paper rather than the surrounding scene.
- Hold still: changing frames (with global brightness shifts compensated), or low
  internal text-edge sharpness. Paper edges alone cannot prove text is sharp.
- Move closer: plausible paper occupies less than roughly a fifth of the frame.
- Fit the whole receipt in frame: plausible paper reaches the sampled frame edge.
- Glare: a substantial local clipped highlight on otherwise dimmer paper. Uniform
  bright white paper is excluded. This is only a highlight hint, not optical glare
  identification.
- Long: clearly narrow geometry, once per camera opening, suggests sections.
- Ready: text-like paper, adequate light and edge detail, stable frames, no obvious
  framing/quality issue. Requires repeated agreement. It does NOT classify the
  document as valid purchase proof or guarantee extraction success.

Blank paper, flat backgrounds, clutter or ambiguous boundaries remain neutral.
No detection is required to take a photo. Printed screenshots/documents can have
good capture quality while still being rejected later by the unchanged processor.

## UI

One short message: Frame your receipt / Move closer / Fit the whole receipt in
frame / More light needed / Hold still / Watch for glare / Ready. The occasional
long-receipt hint is Scan in sections if needed. No metrics or percentages in UI.

Teal Ready, muted amber advice, grey neutral. A thin approximate outline follows
confident geometry; otherwise a subtle neutral guide. The SVG uses the same
aspect-fit as the video, not the letterboxed container. Message agreement and
cooldowns reduce chatter; Ready is withdrawn immediately if evidence deteriorates.
No flashing, animated glow or decorative motion. Text accompanies colour and uses
a polite live region. The Take photo disabled condition is still only video
availability/capture-in-progress, never a quality score.

## Verification and limitations

- `test-capture-quality.mjs`: good, dark, blur, movement, too small, cropped,
  bright white paper, glare, blank/no document, low-contrast backgrounds, clutter,
  bend, occlusion and long-paper fixtures; hysteresis, no repeated long hint;
  sample bounds and unchanged input bytes; shutter/capture-resolution invariants.
- `test-capture-quality-browser.mjs`: actual video/canvas/worker flow with
  controlled raster camera streams. All six requested viewport sizes, advisory
  shutter enabled, real JPEG capture into existing review, no-worker/read-error/
  timeout/slow-worker fallback, cleanup and no remote frame/API writes.
- `test-direct-camera-browser.mjs`: direct entry, camera/permission lifecycle,
  1/2/3-image review, file-picker separation and account-scoped mocked state.
- TypeScript, lint, build, responsive, Scan/multi-image, account isolation,
  async-review and Share-target guards.

Evidence and measured timings: `output/capture-quality/local/verification.json`
and `output/capture-quality/production/verification.json`. Screenshots use
controlled camera fixtures, not physical-phone photographs. Report cold worker
startup separately from steady p95. Shutter timing is event → local JPEG handoff,
not network upload or AI processing. Do not compare first-review entrance animation
with an already-mounted review screen as if it were analysis overhead.

No claim is made about physical-phone battery/heat, real Safari camera behaviour,
universal boundary accuracy, or a new live processor acceptance test based on these
emulated tests. Physical checks should include a real receipt under normal/dim
light, movement, distance, crop, glare/clutter, a bend, and capture despite advice;
then Upload receipt → Wallet and an exact duplicate using the same saved file.

Browser worker design reference:
https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers

### Measured pre-release results

Six desktop-Chrome viewport runs (320–1280px) passed. Steady worker p95 was
3.1–7.3ms; main-thread preview draw/read p95 was 0.9–2.8ms, with approximately
358–361ms between samples. Cold startup is recorded separately in the evidence.
Local JPEG handoff remained 13–50ms, versus 9–18ms with the advisory worker
unavailable; these small single-run comparisons are not physical-device latency
or battery benchmarks.

An existing realistic generated receipt photograph was also run through the
actual video/canvas/worker path at Pixel and Samsung viewport sizes, including
dim-light, blur and cropped variants. All four expected states passed and capture
remained enabled. Evidence: `output/capture-quality/realistic-local/`.
The original fixture was not modified, uploaded or sent to an analysis service.

### Production verification — 10 September 2026

Implementation commit `70e5ccf49cfac345f5ec7c73f1feed5e08b5af6a` was pushed to
production main. Vercel reported successful deployment:
https://vercel.com/receiptits-projects/receipt-it-app-live/BrigcrgBWh19LtYE1q7yCyx4emXU

The public site serves `index-CVi3VYWd.js` and the local analyser
`captureQuality.worker-Cf_Jhv_d.js` (HTTP 200, JavaScript MIME type).
Controlled camera tests ran against that deployed application. All account/API
state was intercepted; no real receipt/Storage rows were created by these tests.

| Chrome viewport (not physical device) | Guidance/capture result | Steady worker p95 | Main draw/read p95 |
| --- | --- | --- | --- |
| 320×568 | PASS | 2.3ms | 2.5ms |
| 360×640 | PASS | 2.3ms | 0.9ms |
| Pixel size 393×873 | PASS | 3.0ms | 2.2ms |
| iPhone size 390×844 | PASS | 4.0ms | 0.9ms |
| Samsung size 412×915 | PASS | 3.4ms | 1.6ms |
| Desktop 1280×800 | PASS | 3.4ms | 1.9ms |

One navigation timed out before camera entry after the first four viewport tests;
the two remaining sizes were retried and passed without application changes.
The production verification JSON contains that successful two-size continuation;
screenshots cover all six, and the four earlier PASS results are retained in the
execution transcript. Do not describe the timeout as a camera failure.

The realistic generated photographic fixture also passed clear/dark/blur/crop
and silent fallback checks against production at Pixel and Samsung sizes.
Worker p95 was 5.3ms and 2.0ms respectively; preview readback p95 was 1.5ms and
2.1ms. Evidence: `output/capture-quality/realistic-production/verification.json`
and adjacent Ready/dark/blur/cropped screenshots. No physical-device, real Safari,
heat/battery, live upload/processor or live duplicate acceptance is inferred.

The direct-camera browser suite also passed all six production viewport sizes:
Wallet and Scan entry, rear-camera preference, audio disabled, full-frame JPEG,
1/2/3-image review, cancellation, upload-picker separation, denied/missing camera,
background cleanup and late-permission cleanup. It made no backend writes.
Screenshots: `output/capture-quality/direct-production/`.

Closure remains pending physical camera testing and a real upload/duplicate
check. The device-specific action has been requested; no account/security change
or backend implementation is needed to perform it.
