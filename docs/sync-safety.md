# Sync safety and rollout

## Required rollout order

1. Back up the database and verify all six existing migrations are applied, including user-scoped entity IDs and history-set uniqueness.
2. Apply `supabase/migrations/20261016091534_p1_atomic_sync.sql` to a staging Supabase project, then run the staging checks below. The new migration does not delete or rewrite existing workout data.
3. Apply the same migration to production, then deploy this frontend together with `public/sw.js`. The unguarded legacy `replace_gymlog_data` endpoint is deliberately revoked: old clients must reload to use guarded replacement. Existing REST CRUD still works, but old clients do not gain atomic session saves until they reload.
4. Verify the new worker activates, removes the old `gymlog-cache-v1` cache, and serves no Auth, REST or RPC request from Cache Storage. Reload open app/PWA windows after deployment.

The historical migration names have duplicate date-only versions and are not a clean CLI reset sequence. Do not blindly reset a production database or rename migrations already recorded there. For a fresh project, apply the old files in this dependency order (the test fixture uses this same order):

1. `20260924_initial_gymlog_schema.sql`
2. `20260924_correct_gymlog_privileges.sql`
3. `20260925_add_history_sets_unique_constraint.sql`
4. `20260925_replace_gymlog_data_rpc.sql`
5. `20260925223000_scope_entity_ids.sql`
6. `20260925224500_scope_history_sets.sql`
7. `20261016091534_p1_atomic_sync.sql`

## Behavior

- Migration completion is scoped to both account and guest-data fingerprint. Legacy string markers, including `in_progress`, are reevaluated.
- A migration journal is persisted before the request. Reloads and lost responses resume the same operation ID. A committed replay returns a receipt without overwriting later cloud edits.
- Guest data is removed only after a transactional receipt and only if its stored value still matches the uploaded revision. Another tab's edits are preserved and evaluated separately. Keeping cloud data retains the guest dataset and acknowledges that revision only for the current account.
- Snapshots come from one SQL query, with deterministic ordering. A content version is checked under the per-account transaction lock before uploads and replacements. All authenticated REST writes take the same lock via statement triggers.
- Session operation IDs are derived from exercise, date and active-set IDs/values. Retries and simultaneous saves of the same snapshot share the operation. Saves validate the selected sets, insert history and delete only those selected sets in one transaction. New sets remain; edited/deleted selected sets cause a conflict.
- Add and delete set RPCs calculate numbering from current database rows. Deletion never upserts stale reps/weights or resurrects removed sets.
- Account identity is checked before requests and again inside every new RPC. UI completion and guest cleanup also check the auth epoch, including A→B→A transitions.
- Backup exports contain data/preferences only. Restore ignores imported migration markers/journals and preserves existing local recovery records.

## Local verification

Run `npm ci`, `npm test`, and `npm run build` with Node 24 or newer.

`test:db` executes the real migrations and RPCs in PGlite/PostgreSQL, using separate authenticated/anonymous roles and two users. It covers late-write rollback, lost-response replay, stale replacement, malformed payloads, session deduplication, interleaved set edits, and ownership boundaries. `test:ui` exercises real React providers with a mocked Supabase transport plus the worker's fetch/cache handlers.

PGlite uses one database connection. These tests verify interleaved outcomes and transaction rollback; they do not establish two-connection lock behavior or deployed browser/HTTP headers.

## Staging checks before rollout

- With two browser profiles for one account, save the same active-set snapshot simultaneously. Expect one history record. Add a new set in the other profile before saving; expect it to survive. Edit/delete a selected set; expect a conflict and no partial history.
- Disconnect after the server commits an upload but before the response arrives. Reload and resume; expect the same receipt and no duplicate or overwritten later edits.
- Edit cloud data after opening the replacement preview. Expect replacement rejection, a fresh preview and unchanged cloud data until reconfirmed.
- Switch A→B and A→B→A during upload/save. Expect no cross-account writes, stale completion or guest deletion. Test logout in another tab and token refresh too.
- Inspect Network and Cache Storage in an installed PWA. Auth/REST/RPC must use the network; old private cached responses must be gone. Check offline/online recovery in multiple browsers.
- Run Supabase database security advisors against the staged schema. Check function grants, RLS and composite foreign keys against the deployed schema, not only this repository.

No live database migration, production deployment, or real multi-browser test is performed by the local test commands.
