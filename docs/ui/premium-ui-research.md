# ReceiptIt Premium UI Research

Date: 22 August 2026

## Products studied

| Category | Products | Patterns worth borrowing conceptually |
| --- | --- | --- |
| Privacy and security | 1Password, Bitwarden, Proton Mail, Tuta, Dashlane, NordPass | State the privacy benefit in everyday language, make sensitive actions explicit, retain a clear audit/history trail, and reserve strong colour for an action that genuinely needs attention. |
| Wallet and finance | Monzo, Starling, Wise, Revolut, Apple Wallet | Make the primary amount and status instantly legible; compress secondary information; use a clear active navigation state; give destructive actions a deliberate final confirmation. |
| Order and ownership | Apple Orders, Amazon Orders, Shopify Shop, Klarna, Google Wallet | Organise around the purchase rather than raw source data; show the next useful action (return, warranty or proof) before secondary details; make document provenance visible but quiet. |
| Premium productivity | Linear, Notion Calendar, Things, Raycast, Arc | Strong type hierarchy, short confident labels, responsive controls, predictable keyboard behaviour, lightweight empty states, and motion that acknowledges a change rather than performs for its own sake. |

## Guidance reviewed

- [Apple HIG: Motion](https://developer.apple.com/design/human-interface-guidelines/motion?changes=_2_2) supports purposeful, brief motion and avoiding animation that delays a routine action.
- [Apple HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) recommends comfortable control sizes and sufficient space between controls.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) adds AA requirements for target size and focus not being obscured; its [focus appearance guidance](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/) informs ReceiptIt's visible teal focus ring.
- [web.dev Core Web Vitals](https://web.dev/articles/vitals) treats lab diagnostics as complementary to field measurement; [LCP](https://web.dev/articles/optimize-lcp) should be at or below 2.5 seconds and [CLS](https://web.dev/articles/optimize-cls?hl=en) at or below 0.1 for a good experience.

## Findings for ReceiptIt

### Trust and privacy

1. Put the benefit before the mechanism: “private original” is more useful than a storage implementation detail.
2. Make sensitive actions calm and explicit. A proof pack is a private evidence summary, not legal certification; deletion needs an unambiguous confirmation.
3. Show protection as a tangible state with a concise explanation, never as a vague security claim.
4. Keep an activity history available in the Purchase Passport rather than making the Wallet dense.

### Information hierarchy

1. Wallet cards should lead with merchant, amount, date, protection state and one next action—not every OCR field.
2. Purchase Passport is the progressive-disclosure surface: primary proof, then items, payment, references and history.
3. Document Review must read as useful evidence awaiting confirmation, not an error.
4. Processing should communicate three true stages—secured, processing, ready—rather than fake percentages.

### Mobile and motion

1. A bottom dock must remain tappable at 320px and sit above the safe area.
2. Avoid repeated icon rotations, pulsing surfaces and large scale entrances. They dilute the useful status signals.
3. Use brief opacity/position transitions for context, with a complete reduced-motion fallback.
4. Maintain stable card dimensions while data loads; use skeletons only where the final shape is known.

## ReceiptIt-specific design principles

1. **Proof before polish.** The original, its state and the next action always outrank decoration.
2. **Private by default, clear by default.** Explain privacy in human language and avoid exaggerated claims.
3. **Terminal character, human readability.** Use the mono character for labels, values and proof moments; keep supporting prose short and easy to scan.
4. **One calm emphasis.** Teal means constructive action and private protection; warning and error colours carry status only.
5. **Evidence has forms.** Receipts, invoices and purchase confirmations are distinct, useful document states—not visual failures.
6. **Motion explains.** Animation confirms progress or preserves spatial context; it never blocks a task.
7. **Forgiveness is premium.** Empty, failure, duplicate and review states provide one obvious recovery path.

## Deliberate avoids

- Generic blue/purple SaaS gradients, fluorescent glows, glass on every surface, oversized pills and decorative charts.
- Presenting proof value as insurance, resale value or a guaranteed legal outcome.
- “Live” indicators that communicate only through colour or animations that continue indefinitely.
- Copying a competitor layout, component system or branded visual asset.

## Brand continuity

The implementation keeps the existing black/charcoal base, teal primary accent, JetBrains Mono character, restrained borders and quiet vault atmosphere. Refinement comes from more consistent geometry, contrast, text hierarchy, touch targets, focus behaviour and less theatrical motion—not a new identity.
