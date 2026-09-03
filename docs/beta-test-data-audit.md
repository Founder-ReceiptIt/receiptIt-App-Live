# Beta test-data audit

Audit date: 23 August 2026.

This is a non-destructive inventory of controlled fixtures and the receipts visible in the current ReceiptIt test account. It is not a cross-account database export; beta users remain isolated from one another by the existing access controls.

## Current test-account records

| Record | Reason | Recommended action before inviting others |
| --- | --- | --- |
| Harbour Market — £30.20 (two records) | Controlled two- and three-image receipt checks. | Keep only in the dedicated test account, or delete manually before using this account as a beta participant. |
| Not a purchase document — £0.00 | Deliberately unreadable multi-image failure-path check. | Delete manually before using this account as a beta participant. |
| Lewis beta account: controlled Harbour Market, capture-quality, PDF and Briar Lane fixtures | Production QA was accidentally run through the normal Scan flow while Lewis's session was active. The app correctly assigned the rows to the authenticated account; the testing process selected the wrong owner. | Preserve until Lewis/Nicholas approve cleanup. Do not use this account for further production fixtures. |
| Founder-controlled QA: Harbour Market email receipt (`052c63bb-c5de-4b57-b67c-a0464c19d7cf`) | Post-fix direct attachment, child-data, signed-original and dedupe regression. | Keep in the dedicated QA account or remove during a later approved QA cleanup. |
| Founder-controlled QA: Bayview Home order confirmation (`0f7c0808-8ae7-4da8-9b48-beb2427cdc68`) | Post-fix purchase-document / Document Review regression. | Keep in the dedicated QA account or remove during a later approved QA cleanup. |
| Founder-controlled QA: hostile document (`eee779f3-54f3-4417-a17a-a4232e6b443f`) | Post-fix prompt-injection rejection regression. | Keep in the dedicated QA account or remove during a later approved QA cleanup. |
| Founder-controlled QA: Briar Lane image (`0960eb6a-4c4b-4308-aa85-cd3f3f4106b2`) | Post-fix normal Image Processor regression. | Keep in the dedicated QA account or remove during a later approved QA cleanup. |
| Founder-controlled QA: Parkside Grocer PDF (`ccc573c0-3fd7-4b38-9586-fa8f561e05f4`) | Post-fix normal PDF Processor regression. | Keep in the dedicated QA account or remove during a later approved QA cleanup. |

## Local-only fixtures

These project files are not application records and are not visible to ReceiptIt users:

- `output/pdf/test-*` — processing, rejection, and validation fixtures.
- `output/pdf/security-hostile-document.pdf` — hostile-content security fixture.
- `output/pdf/alias-inbox-order-confirmation.pdf` — inbound-email classification fixture.
- `tmp/multi-image-tests/` — temporary ordered-image fixtures for multi-image testing.

## Guardrail

Do not automatically delete any record or Storage object. Production fixtures must use the founder-controlled QA account and the fail-closed ?qa=1#scan entry point. The QA page checks a server-owned allowlist and never treats the current browser session as an approved target by default.
