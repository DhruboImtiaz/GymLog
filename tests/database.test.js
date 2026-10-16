import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
let db;
const guest = () => ({ days: [{ id: 'd', name: 'Push', createdAt: '2026-10-16', exercises: [{ id: 'e', name: 'Bench', sets: [{ id: 's', num: 1, reps: 5, weight: 50 }], history: [] }] }], measurements: [{ id: 'm', name: 'Weight', createdAt: '2026-10-16', entries: [{ id: 'en', date: '2026-10-16', value: 70, unit: 'kg' }] }] });
async function identity(id = A) { await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]); }
async function snapshot(id = A) { return (await db.query('select public.get_gymlog_snapshot($1) as doc', [id])).rows[0].doc; }
async function migrate(payload, version, { id = 'upload', replace = false, user = A } = {}) {
  return (await db.query('select public.apply_gymlog_migration($1,$2,$3,$4::jsonb,$5) as result', [user, id, version, JSON.stringify(payload), replace])).rows[0].result;
}
async function seed() { await migrate(guest(), (await snapshot())._version); }
async function save(sets = guest().days[0].exercises[0].sets, operation = 'session', user = A, generation) {
  generation ??= (await snapshot(user))._generation;
  return (await db.query('select public.save_gymlog_session($1,$2,$3,$4,$5::jsonb,$6) as result', [user, operation, 'e', '2026-10-16', JSON.stringify(sets),generation])).rows[0].result;
}

before(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
    INSERT INTO auth.users VALUES ('${A}'),('${B}');`);
  // Original files predate consistent CLI timestamps; replay their dependency order.
  for (const name of ['20260924_initial_gymlog_schema.sql','20260924_correct_gymlog_privileges.sql','20260925_add_history_sets_unique_constraint.sql','20260925_replace_gymlog_data_rpc.sql','20260925223000_scope_entity_ids.sql','20260925224500_scope_history_sets.sql','20261016091534_p1_atomic_sync.sql']) {
    await db.exec(await readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'));
  }
  await db.exec(`CREATE FUNCTION public.inject_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF current_setting('gymlog_test.fail',true)=TG_TABLE_NAME THEN RAISE EXCEPTION 'injected late failure'; END IF; RETURN NEW; END; $$;
    CREATE TRIGGER inject_measurement_failure BEFORE INSERT ON public.measurements FOR EACH ROW EXECUTE FUNCTION public.inject_failure();
    CREATE TRIGGER inject_history_failure BEFORE INSERT ON public.workout_history_sets FOR EACH ROW EXECUTE FUNCTION public.inject_failure();`);
});
after(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false); SELECT set_config('gymlog_test.fail','',false); TRUNCATE public.workout_days,public.measurements,public.gymlog_sync_operations CASCADE; SET ROLE authenticated;");
  await identity();
});

test('upload commits full hierarchy; retry after remote edit does not replace it', async () => {
  const v = (await snapshot())._version;
  await migrate(guest(),v);
  await db.exec("UPDATE public.workout_days SET name='Other device' WHERE id='d'");
  assert.equal((await migrate(guest(),v)).replayed,true);
  assert.equal((await snapshot()).days[0].name,'Other device');
  assert.equal((await snapshot()).measurements[0].entries[0].value,70);
});
test('late upload failure rolls back every hierarchy and receipt', async () => {
  const initial = await snapshot();
  await db.exec("SELECT set_config('gymlog_test.fail','measurements',false)");
  await assert.rejects(migrate(guest(),initial._version), /injected late failure/);
  assert.deepEqual(await snapshot(),initial);
  assert.equal((await db.query('select count(*)::int as n from public.gymlog_sync_operations')).rows[0].n,0);
});
test('stale replacement preview is rejected without deleting newer cloud data', async () => {
  await seed(); const old = await snapshot();
  await db.exec("UPDATE public.workout_days SET name='Newer' WHERE id='d'");
  await assert.rejects(migrate(guest(),old._version,{replace:true,id:'replace'}), /Cloud data changed/);
  assert.equal((await snapshot()).days[0].name,'Newer');
});
test('malformed root and nested arrays cannot erase cloud data', async () => {
  await seed(); const original = await snapshot();
  for (const payload of [{}, { days: null, measurements: [] }, { days: 'bad', measurements: [] }, { days: [{ ...guest().days[0], exercises: null }], measurements: [] }]) {
    await assert.rejects(migrate(payload,original._version,{replace:true,id:'invalid'}), /Invalid or missing data array/);
    assert.deepEqual(await snapshot(),original);
  }
});
test('late replacement insert failure restores deleted originals', async () => {
  await seed(); const original = await snapshot();
  await db.exec("SELECT set_config('gymlog_test.fail','measurements',false)");
  const changed = guest(); changed.days[0].name='Replacement';
  await assert.rejects(migrate(changed,original._version,{replace:true,id:'replace'}), /injected late failure/);
  assert.deepEqual(await snapshot(),original);
});
test('same session replay creates exactly one history and preserves later sets', async () => {
  await seed();
  await db.query('select public.add_gymlog_set($1,$2,$3,$4,$5)',[A,'e','concurrent',8,60]);
  await save();
  assert.equal((await save()).replayed,true);
  const ex=(await snapshot()).days[0].exercises[0];
  assert.equal(ex.history.length,1); assert.equal(ex.history[0].sets.length,1);
  assert.deepEqual(ex.sets,[{ id:'concurrent',num:1,reps:8,weight:60 }]);
});
test('late history failure leaves no parent and retains all active sets', async () => {
  await seed(); const original=await snapshot();
  await db.exec("SELECT set_config('gymlog_test.fail','workout_history_sets',false)");
  await assert.rejects(save(),/injected late failure/);
  assert.deepEqual(await snapshot(),original);
});
test('saving a remotely edited/deleted set rejects the entire session', async () => {
  await seed(); await db.exec("UPDATE public.active_sets SET weight=75 WHERE id='s'");
  await assert.rejects(save(),/Workout sets changed/);
  assert.equal((await snapshot()).days[0].exercises[0].history.length,0);
  await db.exec("DELETE FROM public.active_sets WHERE id='s'");
  await assert.rejects(save(),/Workout sets changed/);
});
test('delete renumbers current rows without overwriting remote values or resurrecting rows', async () => {
  await seed();
  await db.query('select public.add_gymlog_set($1,$2,$3,$4,$5)',[A,'e','remaining',10,80]);
  await db.query('select public.delete_gymlog_set($1,$2)',[A,'s']);
  assert.deepEqual((await snapshot()).days[0].exercises[0].sets,[{ id:'remaining',num:1,reps:10,weight:80 }]);
  await db.query('select public.delete_gymlog_set($1,$2)',[A,'s']);
  assert.equal((await snapshot()).days[0].exercises[0].sets.length,1);
});
test('account mismatch rejects all RPC writes and old replacement endpoint is denied', async () => {
  await seed(); await identity(B);
  await assert.rejects(snapshot(A), /Account changed/);
  await assert.rejects(save(undefined,'wrong',A,'0'), /Account changed/);
  await assert.rejects(migrate(guest(),'stale'), /Account changed/);
  await assert.rejects(db.query('select public.delete_gymlog_set($1,$2)',[A,'s']), /Account changed/);
  await assert.rejects(db.query('select public.replace_gymlog_data($1::jsonb)',[JSON.stringify(guest())]), /permission denied/);
  assert.equal((await snapshot(B)).days.length,0);
});
test('same guest IDs are isolated across accounts and receipts are RLS scoped', async () => {
  await seed(); await save(); await identity(B);
  await migrate(guest(),(await snapshot(B))._version,{user:B}); await save(undefined,'session',B);
  assert.equal((await snapshot(B)).days[0].exercises[0].history.length,1);
  assert.equal((await db.query('select count(*)::int as n from public.gymlog_sync_operations')).rows[0].n,2);
});

test('a reused operation ID cannot acknowledge a different payload', async () => {
  const version=(await snapshot())._version; await migrate(guest(),version);
  const changed=guest(); changed.days[0].name='Different';
  await assert.rejects(migrate(changed,version),/Operation ID already used/);
  assert.equal((await snapshot()).days[0].name,'Push');
});
test('another operation cannot save source sets already consumed by a device', async () => {
  await seed(); await save();
  await assert.rejects(save(undefined,'another-device-operation'),/Workout sets changed/);
  assert.equal((await snapshot()).days[0].exercises[0].history.length,1);
});
test('anonymous roles cannot invoke RPCs, read receipts, or access private helpers', async () => {
  await db.exec('RESET ROLE; SET ROLE anon;');
  await assert.rejects(snapshot(),/permission denied/);
  await assert.rejects(db.query('select * from public.gymlog_sync_operations'),/permission denied/);
  await assert.rejects(db.query('select gymlog_private.document()'),/permission denied/);
});
test('RLS is enabled on every data table and ownership cannot be reassigned', async () => {
  const rows=(await db.query("select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname in ('workout_days','exercises','active_sets','workout_history','workout_history_sets','measurements','measurement_entries','gymlog_sync_operations')")).rows;
  assert.equal(rows.length,8); assert.ok(rows.every(row=>row.relrowsecurity));
  await seed();
  await assert.rejects(db.query('update public.workout_days set user_id=$1 where id=$2',[B,'d']),/row-level security/);
});

test('restored active sets can be saved again in a new dataset generation', async () => {
  await seed(); const generation=(await snapshot())._generation;
  await save(undefined,'old-session',A,generation);
  await migrate(guest(),(await snapshot())._version,{id:'restore',replace:true});
  const restored=await snapshot(); assert.notEqual(restored._generation,generation);
  // A lost-response replay from before restore must preserve the restored sets.
  assert.equal((await save(undefined,'old-session',A,generation)).replayed,true);
  assert.equal((await snapshot()).days[0].exercises[0].sets.length,1);
  await save(undefined,'new-generation-session',A,restored._generation);
  assert.equal((await snapshot()).days[0].exercises[0].sets.length,0);
  assert.equal((await snapshot()).days[0].exercises[0].history.length,1);
});
test('an uncommitted session from a replaced dataset is rejected even with identical IDs', async () => {
  await seed(); const generation=(await snapshot())._generation;
  await migrate(guest(),(await snapshot())._version,{id:'restore',replace:true});
  await assert.rejects(save(undefined,'never-committed',A,generation),/dataset was replaced/);
  assert.equal((await snapshot()).days[0].exercises[0].sets.length,1);
});
