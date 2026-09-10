# Direct receipt camera — 10 September 2026

Both Wallet Quick scan (Scan receipt on desktop) and Scan → Scan receipt open
one shared camera view. Previously they clicked a mixed PDF/image file input with
a capture hint; browsers could display an OS source chooser instead of the camera.
Wallet also intentionally skipped capture on desktop. Both causes are removed.

The camera uses the browser's media API, requests video only, prefers the rear
camera and falls back to an available camera on a computer. It does not request
microphone access. First-use permission remains mandatory; denial, unavailable
cameras and unsupported browsers show clear recovery copy, never a hidden file
chooser. Upload from device remains the separate JPEG/PNG/PDF picker.

Captured JPEGs enter the existing Scan file-validation and ordered multi-image
review path. No upload occurs until the user confirms. Frames preserve the full
image and aspect ratio, with a 2560px long-edge ceiling and JPEG quality 0.95 so
three frames fit the existing 20MP selection limit. This does not change existing
file-upload limits, hashing, Storage, receipt creation or processing.

Tracks stop on capture, cancellation, unmount and backgrounding. Pending permission
requests that resolve after cancellation also stop immediately. Returning from the
background requires reopening the camera. No stale native-picker flag is created.
Simply navigating to the Scan tab does not request camera access.

Verification uses Chrome's simulated media device, not the operator's camera, and
intercepted Supabase responses. Six viewport sizes cover 320×568, 360×640,
393×873, 390×844, 412×915 and 1280×800. Tests exercise both entry points,
actual media playback/canvas JPEG capture, ordered 1/2/3-page review, cancellation,
permission denial, missing camera, late permission, background cleanup and the
separate file picker. No real receipt or Storage object is created by these tests.
Physical phone OS permission behaviour still needs a user check; emulation does
not establish that every browser/device exposes a usable camera.

Tests: scripts/test-direct-camera-browser.mjs, scripts/test-startup-browser.mjs,
responsive, Scan/multi-image, async review and account/session guards; TypeScript,
lint and production build. Screenshots: output/direct-camera/local and production.

API reference: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
