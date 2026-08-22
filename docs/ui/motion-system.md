# ReceiptIt Motion System

## Purpose

Motion should communicate loading, completion, change of context or a direct press response. It must not delay capture, processing, retrieval or deletion.

| Token | Duration | Use |
| --- | ---: | --- |
| `--ri-fast` | 120ms | hover, press, border and colour feedback |
| `--ri-motion` | 220ms | card/state crossfade, menu reveal |
| view handoff | 280–340ms | app-shell/tab content opacity or small position change |

## Rules

- Use opacity and a small transform before animating size or layout.
- Avoid repeated decorative scale/rotation loops. Continuous motion is reserved for an active, labelled processing state.
- Do not animate a card away while an action is being confirmed.
- All animations are reduced to near-instant transitions under `prefers-reduced-motion: reduce`.
- UI status always has a textual state; motion is never the only signal.

## Applied changes

- App entry no longer waits for a theatrical two-second splash or scales the whole interface in.
- Auth and Alias no longer rotate/scale identity icons indefinitely.
- Wallet cards use a subtle one-pixel hover elevation rather than a large enlargement.
- Scan uses true language—secure upload then processing—rather than synthetic progress.
