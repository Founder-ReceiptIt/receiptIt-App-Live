# ReceiptIt beta incident runbook

Use this runbook for containment first. Preserve evidence, avoid broad
production deletion, and record the time, scope, and action owner.

## Suspected credential leak

1. Disable the affected Edge Function or Make scenario if it can use the credential.
2. Rotate the affected Supabase service-role/OpenAI/Make/Vercel credential.
3. Redeploy affected functions and verify their secrets are present only server-side.
4. Review provider activity from the suspected exposure window and identify affected users or objects.
5. Force re-authentication if an auth/JWT signing secret is involved.

## Cross-user data or Storage exposure

1. Immediately disable the affected route or bucket policy; do not make a bucket public as a workaround.
2. Preserve the policy, request IDs, and minimal access logs needed to identify scope.
3. Repair RLS/policy, then repeat two-user select/update/delete/list/download/signed-URL tests.
4. Identify affected users/objects and prepare a factual notification plan.
5. Rotate signed-link or credential material if it could have been exposed.

## Malicious upload or prompt-injection attempt

1. Mark the existing receipt failed or rejected; preserve the original unless the user deletes it.
2. Pause the affected Scanner route if executions are looping.
3. Inspect processor execution metadata without copying raw documents into tickets.
4. Fix deterministic validation or the narrow prompt/router rule, then test normal image and PDF regressions.

## Runaway OpenAI or Make usage

1. Turn off Scanner Dispatch or the affected child scenario.
2. Check recent `processing` rows and execution history for a common account, hash, or route.
3. Confirm upload, retry, duplicate, and rate limits are operating.
4. Re-enable only after one controlled receipt finishes successfully.

## Compromised account

1. Ask the user to reset their password and sign out shared devices.
2. Review the user's recent receipts, storage paths, account-security logs when available, and reports for unexpected activity.
3. If an original may have been opened, note that existing signed links expire in 60 seconds.

## Deletion failure

1. Do not report deletion success until Auth, profile/receipt children, and Storage cleanup have completed.
2. Retry the controlled server deletion path; keep the account active if private Storage cleanup fails.
3. Query orphan candidates by user ID and Storage folder, then remove only confirmed user-scoped objects.

## Backup and restore

1. Do not restore over production for a beta incident.
2. Restore into an isolated project first and verify RLS, private bucket settings, and owner-folder policies before any cutover.
3. Reconcile Storage separately; database backup alone does not prove private originals are recoverable.
