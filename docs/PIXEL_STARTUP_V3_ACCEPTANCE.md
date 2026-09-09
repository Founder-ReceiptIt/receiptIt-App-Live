# Pixel startup v3 — physical acceptance pending

## Proven failure and previous evidence gap

Production commit 34df53ad remained on `Loading...` when the browser held
`lock:sb-qqfntftbughorckugceu-auth-token`. A controlled Chromium page acquired
that lock before app initialisation; the deployed auth client queued behind it
indefinitely, even without a signed-in user. This reproduces the reported
symptom but does not establish which request/lock was present on the founder's
physical Pixel; that device has not been inspected remotely.

The committed npm lockfile installed supabase-js 2.57.4 / auth-js 2.71.1 while
the local pnpm installation used 2.112.3. The former calls `_acquireLock(-1)` at
initialisation; the latter no longer takes a browser Web Lock by default. The
dependency and production lockfile are now pinned to the verified 2.112.3.
The identical held-lock test reaches Early access with the new build.

The service worker has only ever handled `/share-target`. It does not cache
HTML, application bundles or navigation responses. Production HTML and worker
responses use `max-age=0, must-revalidate`. Worker installation already uses
skipWaiting and clients.claim. Registration now also bypasses HTTP cache for
worker update checks. No caches, private files or share payloads are deleted.

## Startup and authorisation

```text
Valid user session -> App (independent of browser-grant recovery)
No session + verified beta-device grant + incomplete intro -> Intro -> Signup
No session + verified beta-device grant + completed intro -> Sign in
No session + no verified grant -> Early access
Explicit /signup + verified device grant -> new single-use signup permission
Request fails -> clear recovery action; no indefinite loading
```

`receiptit_startup_version=3` migrates only obsolete routing preferences.
The previous existing-user boolean is removed; it is not proof of admission.
Existing valid signup grants can be exchanged through server verification.
Existing authenticated beta accounts can restore browser approval through a
server-validated user session and matching profile. Supabase session storage,
currency preferences and pending Android shares remain intact.

An older release may already have deleted its only grant at sign-out. A plain
old boolean cannot safely replace it: that browser needs the invitation once,
then keeps the new signed grant. No manual browser-data clearing is required.

The device grant lasts 180 days and is an opaque signed bearer token stored in
localStorage, independent of the user session. It is verified by the server on
startup. It contains no account identity. It is a browser approval, not hardware
attestation. Signup still needs its separate 15-minute, one-use server token.
Sign-out clears account state, short signup permission and protected hashes but
preserves beta admission. `/signin`, `/signup`, old preference flags and forged
device tokens cannot admit a new browser.

The server signs/verifies grants using a purpose-separated HMAC with its
existing server-only Supabase service-role credential. No new secret was created
or sent to the browser. `BETA_DEVICE_GRANT_EPOCH` defaults to `1`; an authorised
operator may change it to revoke all outstanding browser grants. Removing the
device-grant key locally forgets admission on that browser. Neither operation
deletes an account. Credential rotation also invalidates signed device grants.

Auth, profile/bootstrap and gate HTTP operations abort their actual request at
15 seconds, including response-body reads. They expose recoverable failure and
preserve stored authentication on transport failure. Uploads and receipt
processing are not assigned this deadline. Auth callbacks remain synchronous
and schedule dependent requests outside callback execution. Disposed bootstrap
results are ignored and newer auth events supersede earlier bootstrap results.

## Internal diagnostics

Inspect `window.__receiptItStartup` in browser developer tools. It contains only
version/build, phase, beta-approved boolean, auth-resolved boolean, recognised
protected route, intro requirement, destination, worker state and stable error
codes. No email, account ID, receipt, token, URL query or email content is logged.

## Verification

- Production old-build Web Lock reproduction: indefinite Loading confirmed.
- New build with the same held lock: Early access.
- Live verifier: invalid code denied; valid existing code -> signed grant -> intro.
- Fresh `/`, `/signin`, `/signup`, `#settings`, `#wallet`: gated.
- Old routing flag migration: preserved unrelated preferences.
- Verified grant + completed intro, new tab storage and reload: Sign in.
- Signed-grant forgery, expiry and epoch revocation: denied.
- Stalled token refresh: request aborted; loading exits; stored session retained.
- Mocked authenticated browser matrix: sign-out clears session/hash, keeps grant.
- Mocked mobile Wallet tap: camera input opens within user activation, one image,
  `capture=environment`; desktop opens normal Scan without forcing a camera.
- Quick-scan cancellation: no phantom upload; normal Scan options remain.
- The native camera hint stays set until another picker mode is selected; no
  100 ms timer races the OS. Session/grant refresh does not remount capture.
- Intro: consistent Receipt / FolderCheck / CalendarCheck outline icons, equal
  surface treatment, aligned icon baseline, human privacy copy.
- Viewports: 320x568, 360x640, Pixel 393x873, iPhone 390x844,
  Samsung 412x915, desktop 1280x800.

Authenticated browser simulations do not constitute physical Android/iOS camera
acceptance. Existing processing/security regression guards are separate from
new live ingestion runs; this task does not send or upload purchase evidence.

## Founder acceptance still required

On the existing physical Pixel, without clearing site data:

1. Open https://www.receiptit.app and confirm the old Loading state resolves.
2. If the old release removed admission, enter the invitation once; continue
   through the intro and choose Sign In. Sign in and confirm Wallet.
3. Settings -> Sign out: Sign in, no `#settings`.
4. Close Chrome, reopen the root URL: Sign in, no access gate or Loading.
5. Incognito: Early access only, including direct `/signin` and `/signup`.
6. Valid invitation -> intro -> Continue -> account/sign-in choice.
7. Wallet -> Quick scan: native camera where supported, normal OS fallback
   otherwise. Cancel: no upload is shown. Verify Samsung/iPhone on hardware too.

Status: AWAITING PHYSICAL PIXEL ACCEPTANCE. Do not mark auth closed from browser
viewport, mocked-session or automated results alone.
