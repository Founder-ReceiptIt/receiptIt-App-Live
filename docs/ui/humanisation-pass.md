# Humanisation and simplification pass

## Applied

- Wallet now leads with receipts, removes the beta budget and protected-value panels, and only shows receipt states that need attention.
- Receipt details are titled **Receipt**. The normal detail view no longer shows implementation source, protection panels, or a purchase timeline.
- Scan, Alias, Settings and Insights use shorter, customer-facing British English.
- The proof-pack action is now **Create proof pack** and its document uses British dates and currency symbols. The saved original is appended whenever it can be safely embedded (PDF, JPG or PNG).

## Friendly alias constraint

The secure inbound pipeline is currently configured for `in.receiptit.app`. DNS shows that the root `receiptit.app` MX records are already handled by a different mail provider. Routing `username@receiptit.app` to Resend would therefore be a live MX change with a credible risk of interrupting existing root-domain mail.

No DNS change was made. The safest next step is to decide whether root-domain mail can be migrated to the inbound provider, or to approve a public receiving subdomain. The existing opaque receipt address and its secure routing are unchanged.
