# Performance Audit

## Changes applied

- Removed an artificial two-second app-shell delay.
- Replaced large whole-app scale entrance with a short opacity handoff.
- Centralised surface and motion rules in CSS rather than adding a component or animation dependency.
- Reduced decorative repeat animation; retained only meaningful processing feedback.
- Used stable skeleton geometry in Insights to limit layout movement.

## Validation

- Production build and TypeScript typecheck must pass before release.
- No extra runtime dependency was introduced.
- The Core Web Vitals targets remain LCP ≤2.5s, INP ≤200ms and CLS ≤0.1 at the 75th percentile. These require field telemetry or a signed-in production Lighthouse run to claim measured attainment; this repository has no RUM endpoint, so no synthetic score is represented as field data.

## P1 follow-up

- Add privacy-preserving Web Vitals aggregation if product analytics is approved.
- Run a signed-in Lighthouse profile under a throttled mobile network once the beta deployment is stable.
- Virtualise the Wallet only when real lists show an interaction problem; do not pre-optimise small beta data sets.
