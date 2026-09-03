# Production QA account guard

## Rule

Never run a controlled fixture through an ordinary production Scan page or whichever account happens to be signed in.

ReceiptIt has one server-approved production QA identity:

- label: Founder-controlled production QA
- username: nicholas47c

The allowlist is stored in production_test_accounts. Browser clients cannot read, add, remove or reassign allowlist entries. An authenticated client can only ask whether its own identity is approved.

## Required production-test entry

1. Sign in to the dedicated QA account.
2. Open https://www.receiptit.app/?qa=1#scan.
3. Confirm the page says “Approved production QA account”.
4. Only then submit a controlled fixture.

If the current identity is not approved, capture controls remain disabled. There is no fallback to the active session.

Normal customers continue to use the ordinary Scan page. The guard is deliberately activated only for controlled production QA.

## Other test entry points

- Make subscenario replays must map the existing receipt's receipt_id, user_id and storage_path; they must not substitute a user ID.
- Alias tests must use the dedicated QA account's friendly Alias unless the test explicitly concerns a named beta user's own reported message.
- Backend-controlled fixtures must state the target UUID and first verify it against production_test_accounts.
- Share-target tests use the authenticated recipient account and therefore require the same QA-account check before production fixture submission.
- No repository script or live Make blueprint may hard-code a beta user's user ID or friendly Alias.

## Audit note

The 29 August–2 September capture-quality and Harbour/Briar fixtures in Lewis's account pre-date this guard. They are preserved pending approved cleanup.
