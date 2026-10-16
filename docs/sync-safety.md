# Sync safety and rollout

## Required rollout order

1. Back up the database and verify all six existing migrations are applied, including user-scoped entity IDs and history-set uniqueness.
2. Apply `supabase/migrations/20261016091534_p1_atomic_sync.sql`, then `supabase/migrations/20261016101518_p2_write_recovery.sql`, then `supabase/migrations/20261016125242_explicit_sync_conflicts.sql`, to a staging Supabase project, then run the staging checks below. These migrations do not delete or rewrite existing workout data. The third migration is required: application conflicts use `PT409`/HTTP 409 instead of serialization failure, which [managed PostgREST can retry indefinitely](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).
3. Apply the same migrations to production, then deploy this frontend together with `public/sw.js`. The unguarded legacy `replace_gymlog_data` endpoint is deliberately revoked: old clients must reload to use guarded replacement. Existing REST CRUD still works, but all devices must reload to use atomic session saves, guarded ordinary edits, and atomic reordering.
4. Verify the new worker activates, removes the old `gymlog-cache-v1` cache, and serves no Auth, REST or RPC request from Cache Storage. Reload open app/PWA windows after deployment.

The historical migration names have duplicate date-only versions and are not a clean CLI reset sequence. Do not blindly reset a production database or rename migrations already recorded there. For a fresh project, apply the old files in this dependency order (the test fixture uses this same order):

1. `20260924_initial_gymlog_schema.sql`
2. `20260924_correct_gymlog_privileges.sql`
3. `20260925_add_history_sets_unique_constraint.sql`
4. `20260925_replace_gymlog_data_rpc.sql`
5. `20260925223000_scope_entity_ids.sql`
6. `20260925224500_scope_history_sets.sql`
7. `20261016091534_p1_atomic_sync.sql`
8. `20261016101518_p2_write_recovery.sql`
9. `20261016125242_explicit_sync_conflicts.sql`

## Behavior

- Migration completion is scoped to both account and guest-data fingerprint. Legacy string markers, including `in_progress`, are reevaluated.
- A migration journal is persisted before the request. Reloads and lost responses resume the same operation ID. A committed replay returns a receipt without overwriting later cloud edits.
- Guest data is removed only after a transactional receipt and only if its stored value still matches the uploaded revision. Another tab's edits are preserved and evaluated separately. Keeping cloud data retains the guest dataset and acknowledges that revision only for the current account.
- Snapshots come from one SQL query, with deterministic ordering. A content version is checked under the per-account transaction lock before uploads and replacements. All authenticated REST writes take the same lock via statement triggers.
- Session operation IDs are derived from dataset generation, exercise, date and active-set IDs/values. An explicit upload/replacement advances the generation, allowing restored sets to be logged again while stale retries still return their original receipts. Retries and simultaneous saves of the same snapshot share the operation. Saves validate the selected sets, insert history and delete only those selected sets in one transaction. New sets remain; edited/deleted selected sets cause a conflict.
- Add and delete set RPCs calculate numbering from current database rows. Deletion never upserts stale reps/weights or resurrects removed sets.
- Account identity is checked before requests and again inside every new RPC. UI completion and guest cleanup also check the auth epoch, including A→B→A transitions.
- Backup exports contain data/preferences only. Restore ignores imported migration markers/journals and preserves existing local recovery records.

## P2 consistency and recovery

- Ordinary creates, renames, edits, deletes, and reorders use `mutate_gymlog_data`. It checks the account and the reviewed content version under the account lock and records a receipt in the same transaction. Missing rows, incomplete ordering lists, and stale versions are rejected instead of silently succeeding.
- Each ordinary write, session save, and cloud restore first persists an account-scoped recovery record. Separate keys keep tabs from overwriting each other's records. An uncertain transport error leaves the original operation available through **Retry saved change**, including after reload. New writes are blocked until pending changes are resolved. Writes are never automatically replayed on reconnect.
- After a confirmed receipt, failed reads retain an acknowledged record. **Refresh** finishes reconciliation without sending another mutation. A transaction rejection clears its record; network errors preserve it. Quota failures before journaling prevent the network write.
- The single SQL snapshot retains large nested histories and entries; equal-date ordering is deterministic. The frontend coalesces refresh requests, invalidates reads started before a write or identity transition, and queues refresh events during writes.
- Cloud views refresh on window focus, reconnect, visibility change and a 30-second visible/online interval. A failed refresh keeps loaded data and open drafts visible with retry controls. This is periodic synchronization, not a live subscription.
- Rename and set-edit forms retain the version they originally displayed. On a stale edit, close and reopen the editor to review current values before resubmitting. Reordering retains its starting snapshot, and every position update is atomic.
- Forms await the actual outcome. Failed submissions retain their fields; recovered writes clear/close only the matching unchanged draft. Unrelated drafts remain.
- Guest reads validate the full schema and preserve malformed data. Guest writes check for a changed local snapshot and update memory only after persistence. Guest restore validates before replacing the single atomic data value. If preferences fail afterward, the UI reports that workout data was restored rather than falsely claiming rollback.

## Local verification

Run `npm ci`, `npm test`, and `npm run build` with Node 24 or newer.

`test:db` executes the real migrations and RPCs in PGlite/PostgreSQL, using separate authenticated/anonymous roles and two users. It covers late-write rollback, lost-response replay, stale replacement, malformed payloads, session deduplication, interleaved set edits, and ownership boundaries. `test:ui` exercises real React providers with a mocked Supabase transport plus the worker's fetch/cache handlers.

For the extended local checks, install the test browsers with `npx playwright install chromium firefox webkit`, then run `npm run test:required`. Browser downloads can use `PLAYWRIGHT_BROWSERS_PATH` if a separate cache location is needed.

- `test:native` repeats every SQL regression against a disposable native PostgreSQL 17.6 server and tests lock contention on independent connections. It never connects to a configured external database. The server listens on loopback and its temporary data directory is removed afterward.
- `test:browser` builds the production frontend and runs Chromium, Firefox, and WebKit against real PostgreSQL RPCs through a local HTTP contract fixture. Browser storage, the Supabase SDK, React, network failures, BroadcastChannel, and service workers are real. The fixture supplies test authentication responses and RPC HTTP dispatch; it does **not** validate managed Supabase Auth, PostgREST, API gateway headers, or deployed settings.
- Browser checks cover migration and ordinary-write recovery, concurrent profiles, stale edits and restores, delayed responses, account transitions, token refresh, cross-tab logout, polling, storage quota, remote deletion, and worker cache behavior. Hidden-document polling is tested using a simulated visibility property; quota failure is injected. Worker offline startup is tested by refusing origin connections, with a fresh no-worker context as a negative control. This avoids Playwright's [WebKit offline-emulation defect](https://github.com/microsoft/playwright/issues/42775).

The extended commands are local verification. Live Supabase checks and installed PWA/device checks remain separate rollout requirements.

`test:live` is an explicit opt-in suite for managed Supabase Auth, PostgREST and the production frontend. Set `GYMLOG_LIVE_CONFIG` to an absolute path outside the checkout containing `{ "url": "https://PROJECT.supabase.co", "key": "PUBLISHABLE_KEY", "accounts": [{ "id": "DISPOSABLE_USER_A_UUID", "email": "gymlog-verification-a@example.test", "password": "PRIVATE_PASSWORD" }, { "id": "DISPOSABLE_USER_B_UUID", "email": "gymlog-verification-b@example.test", "password": "PRIVATE_PASSWORD" }] }`. Provision confirmed disposable accounts first. The suite replaces only these accounts' data and checks the email prefix before running. Never use real user accounts, commit this configuration, or provide a server secret key. Run live files sequentially because they share the disposable accounts. Sign out and remove the accounts after verification.

The live browser suite serves a local production build configured with the real project URL. Auth and RPCs go directly to managed Supabase. It injects selected lost responses and delayed deliveries after real server commits; it does not substitute SQL or Auth responses. Physical installed-PWA checks and deployed frontend headers remain separate.

## Staging checks before rollout

- With two browser profiles for one account, save the same active-set snapshot simultaneously. Expect one history record. Add a new set in the other profile before saving; expect it to survive. Edit/delete a selected set; expect a conflict and no partial history.
- Disconnect after the server commits an upload but before the response arrives. Reload and resume; expect the same receipt and no duplicate or overwritten later edits.
- Edit cloud data after opening the replacement preview. Expect replacement rejection, a fresh preview and unchanged cloud data until reconfirmed.
- Switch A→B and A→B→A during upload/save. Expect no cross-account writes, stale completion or guest deletion. Test logout in another tab and token refresh too.
- Inspect Network and Cache Storage in an installed PWA. Auth/REST/RPC must use the network; old private cached responses must be gone. Check offline/online recovery in multiple browsers.
- Keep an edit form open while another device changes data, then focus/reconnect. Expect a refreshed underlying view, an intact draft and a conflict until the editor is reopened. Test a lost ordinary-create response followed by reload/recovery; expect one row and an unchanged operation ID.
- Verify visible polling, hidden/offline suppression, slow overlapping reads, pending writes across account changes, quota failures and Cache Storage behavior in each supported browser. Browser storage clearing still erases guest data and local recovery records.
- Run Supabase database security advisors against the staged schema. Check function grants, RLS and composite foreign keys against the deployed schema, not only this repository.

No live database migration or production deployment is performed by these commands. Browser-engine tests do not substitute for an installed PWA on supported physical devices.
