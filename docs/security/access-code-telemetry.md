# Access-code journey telemetry

Migration: `20260911130000_access_code_journey_events.sql`.
Production project: `qqfntftbughorckugceu`.

## Scope and event definitions

This is a small founder-only beta funnel, not a public analytics dashboard or a
source of authentication authority. No existing access code is consumed,
disabled or made single-use. The current product order is **access → intro →
signup → Wallet**, not signup before intro.

| Event | Authoritative source / meaning |
| --- | --- |
| code_submitted | Verifier receives a non-empty, rate-limit-allowed code and completes its lookup. Active known codes use their exact label; invalid/inactive values become `unknown_code`. No raw invalid value is stored. |
| code_accepted | Existing validation AND one-use signup-authorisation issuance succeed. |
| signup_started | create-account is about to create the user, after existing access, input, rate-limit and alias checks. Alias availability checks do not count. |
| signup_completed | Auth user and transactional beta profile/alias setup have both succeeded. Server attaches the new user ID. Login/session restoration cannot emit this event. |
| intro_completed | User presses Let's begin at the available ending; `completed`. Reduced-motion/static/error fallback continuation is `skipped`. Replaying the animation does not emit an event. No new Skip action was added. |
| wallet_reached | Authenticated app first renders Wallet after loading/profile/alias/currency/recovery gates. Endpoint verifies the user JWT; conflicting journey user attribution is rejected. |

No events are backfilled. Earlier use of SEBASTIAN26 cannot be established from
this new table. A session is not proof of a unique person or of Sebastian's
identity: anyone to whom the invitation was shared can use it.

## Exact schema

See the migration for the complete executable definition.

| Column | Type / default |
| --- | --- |
| id | uuid primary key; gen_random_uuid() |
| code_label | text not null; 1–128 characters |
| event_type | text not null; one of the six event types above |
| created_at | timestamptz not null; now() |
| user_id | nullable uuid; FK auth.users(id), on delete set null |
| session_id | uuid not null |
| metadata | nullable jsonb; only intro completion_method completed/skipped permitted |

Unique `(session_id,event_type)` enforces one event per type per journey even
under concurrent requests. Label/time index supports founder queries. Normal
users have no SELECT/INSERT/UPDATE/DELETE grants; RLS is enabled with **no
anon/authenticated policies**. Service role has SELECT/INSERT only; privileged
Supabase SQL administrators can inspect the table. No client database writes.

## Session and privacy behaviour

- A random UUID is created on each submitted access-code journey and held in
  sessionStorage, not a cookie/fingerprint. It survives same-tab reloads and the
  gate/intro/signup/Wallet transition. Independent submissions get separate IDs.
- The server signs a purpose-separated telemetry token valid for 24 hours.
  It cannot authorise signup, device access, database reads or receipt access.
  The existing server-only service-role secret signs it; no new secret is added.
- The browser stores only the opaque capability, UUID and delivered event names.
  Sign-out clears this state. Existing sessions without a journey emit nothing.
- Server writes use EdgeRuntime.waitUntil and a two-second request timeout.
  Browser writes have a four-second timeout, keepalive and in-flight/success
  deduplication. Database uniqueness is the final duplicate guard.
- Failures are swallowed only for this optional telemetry; a static server
  warning identifies telemetry availability failure without sensitive content.
  Access validation, signup checks and product navigation remain authoritative.
- This is best-effort telemetry, not an audit-grade delivery guarantee. Closing
  a browser while offline can lose client events. A missing event is not proof
  that a person did not perform the action.
- No passwords, email addresses/bodies, IPs, locations, user-agent strings or
  fingerprints are added to telemetry. Existing security rate limits are
  unchanged. User deletion removes the user link; anonymous funnel data remains.
- Recommended founder retention: 90 days. No new scheduled purge was installed;
  choose/approve a retention schedule before retaining this indefinitely.

## Founder SQL

All Sebastian-labelled events (includes the controlled tests listed below):

```sql
select *
from public.access_code_events
where code_label = 'SEBASTIAN26'
order by created_at desc;
```

Visitor-only funnel, excluding this deployment's two known Sebastian-labelled
QA journeys (the third QA journey was invalid and labelled unknown_code):

```sql
select session_id,
  min(created_at) as first_seen,
  max(created_at) as last_seen,
  bool_or(event_type = 'code_submitted') as code_submitted,
  bool_or(event_type = 'code_accepted') as code_accepted,
  bool_or(event_type = 'signup_started') as signup_started,
  bool_or(event_type = 'signup_completed') as signup_completed,
  bool_or(event_type = 'intro_completed') as intro_completed,
  max(metadata->>'completion_method')
    filter (where event_type = 'intro_completed') as intro_method,
  bool_or(event_type = 'wallet_reached') as wallet_reached,
  max(user_id::text) as user_id
from public.access_code_events
where code_label = 'SEBASTIAN26'
  and session_id not in (
    'e9eeff57-ddc0-4ca6-abc0-c744e4908ba9'::uuid,
    '59672509-2c06-46e7-86a6-c8019b222098'::uuid
  )
group by session_id
order by first_seen desc;
```

## QA and deployment record

- Unit/handler tests execute the actual Edge handler source with isolated Auth/DB
  substitutes: all six events, invalid-code redaction, token tampering,
  cross-user Wallet attribution rejection, failed signup, no alias-check signup,
  unique events and simulated telemetry outages without blocking access/signup.
- Browser integration executes gate → intro → create account → Wallet with
  intercepted backend responses. Repeats with telemetry returning 503 and
  refreshes the authenticated page: navigation passes, no repeat signup.
- Live API test created one empty controlled account and authenticated it using
  a generated password held only in memory. No credentials were saved or logged.
  The account has no receipts or personal user data; retained pending approved
  cleanup. User ID: `e8a36708-bb4f-4da1-82b0-410e6c2cc64a`.
- Live journey `e9eeff57-ddc0-4ca6-abc0-c744e4908ba9`: full six-event server/API
  check including repeated intro and Wallet requests. These client events were
  explicitly invoked by the test, not an observed visit by Sebastian.
- `59672509-2c06-46e7-86a6-c8019b222098`: separate accepted use of the same code.
- `a66a1cd7-bbc5-4730-a12a-17babe8b6752`: invalid-code privacy test.
- Live anonymous table read: 401. Live authenticated QA table read: 403.
  Missing authenticated Wallet identity: 401. Tampered journey: 400.
  Signup without a valid existing grant: 403. Existing beta security preserved.
- Supabase SQL read-back confirmed exactly nine test rows: six events in the
  completed journey, two in the second accepted journey, one unknown-code
  submission. Every event has copies = 1, including repeated intro/Wallet calls.
- Migration applied transactionally through the signed-in Supabase SQL editor
  and recorded in supabase_migrations.schema_migrations. No Keychain access.
- verify-access-code and create-account were read from the live editor, compared
  to the repository baseline and patched only with telemetry hooks/helper.
- access-code-event deployed as an equivalent self-contained dashboard source
  (shared helper and existing origin functions inlined); repository source keeps
  the shared imports for future CLI deployment. Legacy JWT verification remains
  ON. Existing functions' auth configuration was not changed.
- Frontend deployment and final regression results are recorded in the task
  completion report; raw local evidence is under output/access-code-telemetry/.

## Files

Migration; `_shared/access-code-telemetry.ts`; `access-code-event/index.ts`;
verify-access-code/index.ts; create-account/index.ts; supabase/config.toml;
src/lib/accessCodeTelemetry.ts; src/lib/betaAccess.ts; AlphaGatekeeper.tsx;
ProductIntro.tsx; ReceiptItIntroAnimation.tsx; AuthContext.tsx; App.tsx;
scripts/test-access-code-telemetry.mjs; scripts/test-access-journey-browser.mjs;
scripts/test-access-code-telemetry-live.mjs; this document.
