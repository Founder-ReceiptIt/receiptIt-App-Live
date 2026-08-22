# Humanisation and simplification pass

## Applied

- Wallet now leads with receipts, removes the beta budget and protected-value panels, and only shows receipt states that need attention.
- Receipt details are titled **Receipt**. The normal detail view no longer shows implementation source, protection panels, or a purchase timeline.
- Scan, Alias, Settings and Insights use shorter, customer-facing British English.
- The proof-pack action is now **Create proof pack** and its document uses British dates and currency symbols. The saved original is appended whenever it can be safely embedded (PDF, JPG or PNG).

## Friendly alias

The public receipt address is now `username@in.receiptit.app`. It is a friendly,
unique address on the already configured Resend receiving subdomain, backed
server-side by an opaque high-entropy routing alias. The opaque address remains
available for backwards compatibility but is never shown in normal product UI.

No root `receiptit.app` MX record was changed. Unknown addresses fail closed
without revealing whether an account exists; ownership is assigned only by the
server.
