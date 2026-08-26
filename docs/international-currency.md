# International currency model

## Source evidence versus account presentation

`receipts.amount` and `receipts.currency` are the original transaction values.
They are never rewritten when a user changes account settings. The legacy
`receipts.amount_gbp` field remains GBP-specific and unchanged for backwards
compatibility.

`profiles.preferred_currency` controls Wallet and Insights aggregates.
`profiles.monthly_budget_amount` is denominated in
`profiles.monthly_budget_currency`; the database requires the budget currency
to match the preferred currency.

The beta UI exposes GBP, AUD, USD, EUR, CAD and NZD from one configuration in
`src/lib/currency.ts`. Profile columns accept ISO 4217-shaped codes so future
provider-supported currencies do not require a schema redesign.

## Historical conversion

The authenticated `currency-rates` Edge Function requests date-specific rates
from Frankfurter v2. Rates are cached server-side by source currency, target
currency and requested date. The provider's effective rate date is retained,
including its preceding-business-day behaviour.

If a receipt has no transaction date, the function uses the current rate and
marks the result approximate. If no safe rate can be obtained, the receipt is
left unchanged and excluded from that aggregate; it is never converted to zero
and never treated as numerically equal to another currency.

## Security and ownership

Currency and budget settings use the existing owner-only `profiles` RLS
policies. The FX cache is server-only and grants no browser or anonymous table
access. The conversion function requires a verified user session, trusted
origin and rate-limit allowance.

## Legacy budget migration

The former GBP budget browser key is read once for existing accounts. A valid
explicit value is copied to the user's profile as GBP, the migration is marked
complete, and the browser value is removed. The profile is authoritative on all
subsequent devices.
