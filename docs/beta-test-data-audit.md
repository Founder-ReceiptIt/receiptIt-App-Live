# Beta test-data audit

Audit date: 23 August 2026.

This is a non-destructive inventory of controlled fixtures and the receipts visible in the current ReceiptIt test account. It is not a cross-account database export; beta users remain isolated from one another by the existing access controls.

## Current test-account records

| Record | Reason | Recommended action before inviting others |
| --- | --- | --- |
| Harbour Market — £30.20 (two records) | Controlled two- and three-image receipt checks. | Keep only in the dedicated test account, or delete manually before using this account as a beta participant. |
| Not a purchase document — £0.00 | Deliberately unreadable multi-image failure-path check. | Delete manually before using this account as a beta participant. |

## Local-only fixtures

These project files are not application records and are not visible to ReceiptIt users:

- `output/pdf/test-*` — processing, rejection, and validation fixtures.
- `output/pdf/security-hostile-document.pdf` — hostile-content security fixture.
- `output/pdf/alias-inbox-order-confirmation.pdf` — inbound-email classification fixture.
- `tmp/multi-image-tests/` — temporary ordered-image fixtures for multi-image testing.

## Guardrail

Do not automatically delete any record or Storage object. Before inviting a friend or family member, use a dedicated account or manually remove the controlled records above from the account they will use.
