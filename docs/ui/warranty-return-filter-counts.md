# Warranty / Return filter counts

The existing controls now show icon + number, with singular/plural accessible
names and tooltips. Zero remains visible with a subdued inactive treatment.
The complete control is clickable; selected states are unchanged.

Counts, filter membership and Wallet badges use the same ID sets from
`getWalletProtection`. Input is the existing deduplicated Wallet data, before
search/category selection. It is explicitly scoped to the current owner, parsed/
completed purchases only, and excludes non-purchase documents, unresolved errors,
invalid/missing dates and expired protection. Sets prevent counting an ID twice.

Existing receipt fetch/realtime/edit/delete updates recompute the sets immediately.
A lightweight 30-second display clock updates expiry without receipt writes; focus
and visibility restoration refresh it immediately. No added server polling.
Warranty retains its existing expiry-instant rule; returns retain the existing
local calendar-day rule (the deadline day itself remains active).

Defects found and fixed: invalid return dates previously fell through to active;
filter membership previously did not enforce the same saved-purchase eligibility
as the count. Both now fail closed and use the same qualifying IDs.

Tests: `test-wallet-protection-counts.mjs` (pure rules),
`test-wallet-protection-browser.mjs` (six viewport layouts, count/result equality,
search/category independence and zero counts), and
`test-protection-counts-live-state.mjs` (rendered realtime events and clock changes).
Browser tests intercept Supabase HTTP/WebSocket traffic and use isolated fixtures,
not real user data or production record writes.

Verified counts: one purchase with both = 1/1; six-purchase variant fixture = 2/3
(2 warranty matches, 3 return matches); selecting each filter produces exactly that
many saved purchases without additional filters. Search/category selections leave
the global counts unchanged. Repeated INSERT does not increase counts; correction
and DELETE update them. Failed/rejected/review/non-purchase/invalid-date rows do not
increase counts. Clock-only expiry updates them. Same-tab account switch A 1/1 →
B 0/1 passes, with A's receipt absent. All six viewport sizes and existing responsive,
account/session isolation, async review, analytics, Scan and receipt-detail guards pass.

No backend, security-policy, ingestion, processing, duplicate or analytics change.
