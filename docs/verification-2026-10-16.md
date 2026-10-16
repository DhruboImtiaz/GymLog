# GymLog required-test verification — 16 October 2026

## Result

**172 local checks passed, zero failed, zero skipped.** Clean dependency installation, production build, and diff validation also passed. The dependency audit reports zero vulnerabilities after updating the compatible source-map-js patch release.

| Suite | Passed | Environment |
|---|---:|---|
| Database regression | 30 | PGlite, real migrations and RPCs |
| React, storage, worker-handler and drag regression | 44 | Vitest, mocked Supabase transport |
| Native database regression and concurrency | 35 | Disposable PostgreSQL 17.6; 30 SQL regressions plus 5 independent-connection contention tests |
| Browser flow and service worker | 63 | Chromium 156, Firefox 157, WebKit 27.2; production frontend and real PostgreSQL RPCs |
| **Total** | **172** | Includes the same SQL regressions executed in both database runtimes |

Reproduce with Node 24 or newer:

```sh
npm ci
npx playwright install chromium firefox webkit
npm run test:required
```

## Required scenario coverage

| Required check | Evidence / result |
|---|---|
| Two devices save the same sets | Independent PostgreSQL connections genuinely wait on the account lock; two browser profiles use the same session operation ID; one history record. |
| Concurrent set add/edit/delete | New sets survive; edited/deleted source sets reject with no partial history. |
| Lost migration response | Response is dropped after commit; reload reuses the receipt and preserves later remote edits. |
| Stale replacement preview | Migration replacement and backup restore reject stale versions; remote data remains and confirmation stays explicit. |
| A→B and A→B→A during writes | Delayed upload/save completion does not clean the guest revision or the old account’s recovery record; explicit recovery succeeds. |
| Logout in another tab; token refresh | Real SDK BroadcastChannel logout hides cloud data; an expired access token refreshes through the SDK. |
| Ordinary-write retries | Lost create response retains fields; reload retries the same operation ID and creates one row. |
| Acknowledged write, failed follow-up read | Recovery sends a read only, without another mutation. |
| Multi-device drafts | Focus refresh updates the underlying view while preserving draft fields; stale submission rejects until reopened. |
| Overlapping slow reads | Refresh calls coalesce; an older delayed read cannot overwrite a newer write result. |
| Polling and reconnect | Visible polling refreshes; simulated hidden state and browser offline state suppress reads; reconnect refreshes. |
| Storage quota and malformed data | Quota failure before journaling prevents a network write; malformed guest data and failed restores preserve existing data. |
| Worker cache safety | All three engines purge the seeded legacy private cache and bypass Auth/REST/RPC. Origin connections are then refused: the cached guest app boots, while a fresh context without a worker fails. |
| Ordinary mutations | Every mutation action is exercised, including exercise/measurement ordering, cascading deletes, missing targets and replay. |
| Local security boundaries | RLS, anonymous RPC denial, account mismatches, ownership updates, composite foreign keys and receipt scoping pass in both SQL runtimes. |

## Issue found and fixed

Switching accounts while an exercise was open could leave a blank content area. Detail/progress pages navigated during rendering, and both progress views skipped state hooks when their record disappeared. They now render declarative redirects and keep hook order stable. Browser regressions verify account transitions and remote deletion across all five detail/progress views in all three engines.

## Live Supabase inspection

The GymLog project became active during testing. Read-only inspection confirmed:

- All seven existing workout tables have RLS enabled.
- User-scoped primary keys, all five composite ownership foreign keys, and history-set uniqueness are present.
- None of `get_gymlog_snapshot`, `apply_gymlog_migration`, `save_gymlog_session`, or `mutate_gymlog_data` is installed.
- The migration history endpoint returns an empty list, although the older schema exists. Historical application was therefore verified from schema, not migration records.
- The legacy restore endpoint remains executable by authenticated users and is denied to anonymous users.
- Live HTTP requests without a user token were denied with HTTP 401 for all seven workout tables. Managed PostgREST returned HTTP 404/PGRST202 for the missing snapshot RPC.
- Security advisors report one warning: [leaked-password protection is disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

A private backup of all seven workout tables was captured before proposing any live change. It is outside the Git checkout and has owner-only file permissions. No live schema or workout data was changed.

**Live write-flow tests are blocked by the Supabase migration connector.** The user explicitly approved both reviewed migrations and isolated-account tests. The migration tool repeatedly returned `McpServerError: Invalid or expired requestState`; after the interrupted attempt, SQL inspection still found the new functions absent. No migration succeeded. Further user approval is not required for the already authorized migrations. Applying P1 will revoke the old restore endpoint, so old frontend restore behavior changes until the updated frontend is deployed.

## Limits that still require rollout testing

The browser fixture implements the HTTP/Auth contract locally. The actual application, SDK, browser storage, workers and SQL run, but managed Supabase Auth/PostgREST/gateway configuration is not validated by it. Account-switch tests inject the SDK’s BroadcastChannel auth event; token refresh and logout use the real SDK against fixture endpoints. Quota and hidden visibility are injected conditions.

Physical installed PWAs, mobile OS lifecycle/backgrounding, and deployed worker update behavior still need device checks after deployment. These tests seed an old cache before the real worker installs; they do not reproduce every lifecycle of an already installed old worker. Browser storage clearing continues to erase guest data and recovery journals.

WebKit’s Playwright offline flag has an upstream [service-worker emulation defect](https://github.com/microsoft/playwright/issues/42775); worker fallback is therefore verified by refusing actual origin connections, with a no-worker negative control.

The build succeeds with the existing bundle-size warning (about 741 KB before gzip). This is not a failed sync check.

