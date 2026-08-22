# Accessibility Audit

## Implemented baseline

- Visible teal focus treatment with offset and contrast for interactive controls.
- Mobile-safe minimum canvas width of 320px and a more resilient flexible bottom navigation.
- `prefers-reduced-motion` disables nonessential animations and smooth scrolling.
- Wallet folder selector now has tab semantics and selected state.
- Scan status changes use polite live regions.
- Purchase Passport is labelled as a modal dialog, can be closed with Escape and restores prior focus on close.
- Login state errors use `role="alert"`; authentication tabs expose pressed state.
- Alias can wrap instead of being clipped at narrow widths.

## Verification notes

- TypeScript compilation passes after these semantic changes.
- The UI uses native buttons/inputs for primary actions; no custom pointer-only controls were introduced.
- All Shield states retain icon + text. Colour is not their sole distinction.

## P1 device/assistive-tech sweep

- Screen-reader walkthrough of Wallet → Passport → View original → Proof Pack on iOS VoiceOver and macOS VoiceOver.
- Keyboard-only traversal with real browser zoom at 200% and text-size settings.
- Confirm focus trapping in Passport if a future nested dialog is introduced; current dialog provides label, Escape and focus restoration.
