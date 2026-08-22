# ReceiptIt Design System

## Tokens

The global tokens in `src/index.css` are the source for the refinements. They intentionally supplement existing Tailwind utility classes rather than introduce a framework migration.

- **Surface:** `ri-surface` is the default elevated section/card; `ri-surface-muted` is a lower-priority internal panel.
- **Shape:** cards are 18px, controls 12px, tags/statuses remain pill-like only when their compact semantic grouping benefits from it.
- **Depth:** a quiet dark shadow clarifies a modal or elevated surface. Teal shadows are not general decoration.
- **Typography:** page titles use tighter tracking; `ri-eyebrow` is the terminal-flavoured section label; `ri-terminal` is for figures, aliases and references.
- **Interaction:** primary click feedback is a 120ms colour/border response with a minimal card lift; controls retain at least usable mobile touch space.

## Component rules

| Component | Rule |
| --- | --- |
| Page shell | `ri-page` handles max width, responsive gutters and bottom-safe-area clearance. |
| Navigation | Active state is teal plus a location indicator; never teal alone. |
| Wallet card | merchant, amount, date, Shield and next action first; secondary proof only on Passport. |
| Status | icon + concise label + optional action; colour reinforces rather than carries the full meaning. |
| Dialog | semantic label, Escape close, focus restoration, dark overlay and one elevated pane. |
| Loading | stable geometry and `ri-skeleton`; no fake numerical progress. |
| Empty state | explain the next task in a single sentence with the action close by. |

## Copy rules

- Use “original” rather than a storage implementation detail.
- Use sentence case and a specific action: “Choose photo or PDF”, “View original”, “Create Proof Pack”.
- `Ready` means a normal receipt; `Document Review` means useful purchase evidence that is not a conventional receipt.
- Avoid raw provider errors and avoid claiming legal certification, E2EE or zero knowledge.
