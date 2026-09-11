# Fresh entry and tablet layout verification

## Fresh browser report

The reported historical Sign in flash could not be reproduced with the current
production build. Five independent browser contexts (desktop, tablet, phone,
direct /signin and direct /signup), each tested on first load and refresh,
recorded only Loading → Early access; no Sign in form was displayed. These used
the actual public deployment without auth mocks or pre-existing browser data.
The bare domain redirects to www; all entry URLs returned the same script hash.
The share-target service worker does not cache or intercept navigation HTML.

The existing entry HTML used `public, max-age=0, must-revalidate` and was served
from the CDN cache. As a preventative freshness measure, /, /index.html, /signin
and /signup now use no-store for browser and Vercel CDN HTML. Hashed JS/CSS,
authentication/session logic and the private share workflow are unchanged.
This is not evidence that caching caused the user's original observation.

## Reproduced layout defects and fixes

- At 800 CSS pixels, the desktop navigation was enabled at 768px and pushed
  Activity and Settings beyond the viewport. Top/bottom navigation now switch
  together at 1024px, with matching content clearance. Tablet portrait keeps
  the existing compact bottom navigation; landscape/desktop retains the header.
- At 1024px with a 20px root font, desktop link spacing still overflowed.
  Horizontal gaps/padding are tighter below 1280px; wide desktop is unchanged.
- At 320px the Settings currency selector's intrinsic width expanded its grid.
  The grid and labels now explicitly shrink, keeping currency/budget controls
  within the viewport. No currency or budget behaviour changes.

## Test scope and evidence

`test-fresh-entry-browser.mjs` records visible entry states and live bundle paths;
`VERIFY_ENTRY_CACHE=1` checks deployed no-store headers.
`test-tablet-layout-browser.mjs` uses isolated accounts and intercepted APIs,
never real receipts, for Wallet, detail, email, Scan, Insights, Activity,
Settings, intro, ending, signup and sign-in layout checks.

Viewports: 320×568, 360×640, 393×873, 390×844, 412×915, 600×960, 768×1024,
800×1280, 1024×768, 1280×800, 1440×900; additional 20px root-font tests at
800×1280 and 1024×768. Tests include nav reachability and Settings content
scrolling clear of the bottom navigation. Transient exit animations are allowed
to settle before static layout measurements.

Evidence lives under `output/entry-layout/` and `output/tablet-layout/`.
These are Chrome browser viewport simulations, not physical Samsung/iPad/Safari
hardware tests. No screenshot/model of the user's exact tablet was provided
during this verification, so that exact device remains unconfirmed.
