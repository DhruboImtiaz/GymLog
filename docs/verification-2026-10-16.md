# GymLog sync verification — 16 October 2026

## Result

**232 automated checks passed: 176 local and 56 against managed Supabase.** All scenarios have a passing final result after the application fix and test-harness corrections. Production build and diff validation pass. The clean dependency install reports zero vulnerabilities.

| Suite | Passed | Environment |
|---|---:|---|
| SQL regressions | 31 | PGlite, real migrations/RPCs and roles |
| React, storage, worker handlers and drag | 46 | Vitest |
| Native SQL regressions and lock contention | 36 | Disposable PostgreSQL 17.6; includes the same 31 SQL regressions plus 5 independent-connection tests |
| Local production-frontend browser checks | 63 | Chromium, Firefox and WebKit |
| Live Auth/API/SQL checks | 17 | Real managed Supabase Auth and PostgREST, two disposable accounts |
| Live production-frontend browser checks | 39 | 13 scenarios per engine against the real Supabase project |
| **Total** | **232** | Database regressions are intentionally repeated in both local SQL runtimes |

The initial full live browser run passed all 26 Chromium/Firefox cases and five WebKit cases. Eight WebKit fault-injection cases failed because the worker-controlled page bypassed Playwright routing. After correcting that test setup, all 13 WebKit scenarios passed. The raw initial log is retained; `live-browser-results-20261016.json` records the latest verdict and evidence file for each of the 39 scenarios.

## Issue exposed only by live testing

The original RPCs raised `40001` for application conflicts. Managed PostgREST retried a stale concurrent-create request repeatedly instead of returning the conflict. I used the wrong error class for this deployment. The test request was stopped, and no other users' data was changed.

The new migration `20261016125242_explicit_sync_conflicts.sql` changes domain conflicts in the migration, session-save and ordinary-mutation RPCs to `PT409`/HTTP 409. It preserves the installed transaction logic, ownership, grants and data. The frontend recognizes this as a definite rejection and removes the rejected journal while retaining the user's draft or guest data. Local tests verify the function definitions and grants; live tests verify prompt HTTP 409 responses and no duplicate or partial writes. This follows [Supabase's documented workaround](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).

The earlier browser verification also found blank detail views after account changes and conditional hooks in progress views when records disappeared. Declarative redirects and stable hook order fix those paths; all five detail/progress views are covered by local browser regressions.

## Required scenario evidence

| Scenario | Verified result |
|---|---|
| Simultaneous saves | Independent SQL connections wait on the account lock; real live API requests and browser profiles produce one history record. |
| Concurrent set changes | New sets survive; edited/deleted selected sets reject with no partial history. |
| Interrupted guest upload | A real committed response is dropped; reload replays the original operation and preserves a later live edit. |
| Stale migration/backup replacement | HTTP 409, unchanged remote data, retained guest data or open preview. |
| Ordinary create retry | Fields remain after a lost response; reload retries the same operation ID, creates one row and preserves later edits. |
| Confirmed write, failed read | An acknowledged journal reconciles through a read without another mutation. |
| A→B→A during upload/save | Real UI sign-ins and cross-tab Auth events invalidate delayed completion and retain the original account's recovery record. |
| Logout and refresh | Real managed Auth refresh works; logout in another tab hides cloud data; revoked test sessions are not reused for fresh profiles. |
| Draft consistency | Focus refresh updates the underlying remote view without replacing draft text; stale submission returns HTTP 409. |
| Read overlap/polling | Local browser/provider checks cover coalescing, stale-response invalidation, visible polling, hidden/offline suppression and reconnect. Live browsers verify focus/online behavior. |
| Storage errors | Local browser/provider tests cover quota failures, malformed guest data and atomic restore failures without overwriting existing data. |
| Cache safety | All three engines remove a seeded legacy private cache and keep real Auth/RPC responses out of Cache Storage. Local browser tests verify cached guest startup during an origin outage, with a no-worker negative control. |
| Ownership/security | Live anonymous RPC/receipt denial, account mismatches, direct REST RLS, ownership reassignment rejection and composite-parent ownership checks pass. |
| Large snapshots | Managed PostgREST returns all 1,201 nested entries in stable order. |
| Ordinary actions | Create, rename, edit, delete, ordering, cascading deletion, missing-target rejection and replay are exercised against the live hierarchy. |

## Applied database state and cleanup

The user applied P1 and P2 through SQL Editor. The compatibility migration was then applied successfully through the connector. Migration history now matches these repository versions:

- `20261016091534_p1_atomic_sync`
- `20261016101518_p2_write_recovery`
- `20261016125242_explicit_sync_conflicts`

All four new public RPCs are security invokers with an empty search path, callable by authenticated users and denied to anonymous users. The legacy restore endpoint is denied to both roles. All eight public data/receipt tables have RLS enabled, and the five composite ownership foreign keys remain present.

Both disposable test accounts were removed after signing out/cleaning their sessions. Confirmed remaining test users, sessions, identities, refresh tokens and receipts: **zero**. The private account credential file was removed.

A full row-by-row comparison against the private pre-test workout backup confirms every original record is unchanged:

| Table | Before | After | Identical |
|---|---:|---:|---|
| Workout days | 10 | 10 | Yes |
| Exercises | 8 | 8 | Yes |
| Active sets | 0 | 0 | Yes |
| Workout history | 12 | 12 | Yes |
| History sets | 26 | 26 | Yes |
| Measurements | 6 | 6 | Yes |
| Measurement entries | 6 | 6 | Yes |

No sync RPC was still running after cleanup. Security advisors report only the existing [leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) warning; it was not silently changed.

## Reproduction and remaining limits

Local verification: Node 24+, `npm ci`, `npx playwright install chromium firefox webkit`, then `npm run test:required`.

Live verification: provision two confirmed disposable accounts, prepare the private publishable-key configuration described in `docs/sync-safety.md`, then set `GYMLOG_LIVE_CONFIG` and run `npm run test:live`. The suite replaces only the configured disposable accounts' data; it must not use real user accounts. This run's disposable accounts have been deleted.

Live browser tests serve the production frontend locally and use real managed Auth/PostgREST/database requests. They simulate selected dropped or delayed responses after actual server commits. WebKit fault-injection cases block service workers because Playwright cannot reliably route a controlled WebKit page; its separate worker-cache case enables the real worker and real API traffic. Local tests inject quota and hidden-document states. These limitations are explicit, not skipped checks.

**Still required after frontend deployment:** installed-PWA upgrade behavior on supported physical devices, mobile OS/background lifecycle, and deployed frontend/worker headers. The old cache was seeded for automated checks; every lifecycle of an already installed old worker has not been reproduced. Browser storage clearing still erases guest data and recovery journals.

The older six schema files have historical duplicate date-only versions and were applied manually before this work. Their schema effects were inspected, but that legacy history still needs a deliberate baseline before using a blanket CLI push/reset. The three new migration records are reconciled; no old migration was renamed or rerun.

**The database is updated; the frontend has not been deployed.** Apply all three migrations before deploying the combined P1/P2 frontend. Keep the two PRs together in rollout order. The successful build retains the existing approximately 741 KB bundle-size warning.

