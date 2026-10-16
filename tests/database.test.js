import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
let db;
let native;
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
  if (process.env.GYMLOG_NATIVE_TEST === '1') {
    const { nativePostgres } = await import('./helpers/native-postgres.js');
    native = await nativePostgres();
    db = native.db;
  } else db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
    INSERT INTO auth.users VALUES ('${A}'),('${B}');`);
  // Original files predate consistent CLI timestamps; replay their dependency order.
  for (const name of ['20260924_initial_gymlog_schema.sql','20260924_correct_gymlog_privileges.sql','20260925_add_history_sets_unique_constraint.sql','20260925_replace_gymlog_data_rpc.sql','20260925223000_scope_entity_ids.sql','20260925224500_scope_history_sets.sql','20261016091534_p1_atomic_sync.sql','20261016101518_p2_write_recovery.sql']) {
    await db.exec(await readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'));
  }
  await db.exec(`CREATE FUNCTION public.inject_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF current_setting('gymlog_test.fail',true)=TG_TABLE_NAME THEN RAISE EXCEPTION 'injected late failure'; END IF; RETURN NEW; END; $$;
    CREATE TRIGGER inject_measurement_failure BEFORE INSERT ON public.measurements FOR EACH ROW EXECUTE FUNCTION public.inject_failure();
    CREATE TRIGGER inject_history_failure BEFORE INSERT ON public.workout_history_sets FOR EACH ROW EXECUTE FUNCTION public.inject_failure();`);
});
after(async () => { if (native) await native.close(); else await db?.close(); });
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

async function mutate(action, payload, {id=crypto.randomUUID(), version, user=A}={}) {
  version ??= (await snapshot(user))._version;
  return (await db.query('select public.mutate_gymlog_data($1,$2,$3,$4,$5::jsonb) as result',[user,id,version,action,JSON.stringify(payload)])).rows[0].result;
}
test('ordinary create retries return a receipt without duplicates or overwriting later edits', async()=>{
  const version=(await snapshot())._version;
  const payload={id:'new-day',name:'Push',createdAt:'2026-10-16'};
  await mutate('create_day',payload,{version,id:'create-once'});
  await db.exec("update public.workout_days set name='Other device' where id='new-day'");
  assert.equal((await mutate('create_day',payload,{version,id:'create-once'})).replayed,true);
  const current=await snapshot(); assert.equal(current.days.length,1); assert.equal(current.days[0].name,'Other device');
});
test('stale ordinary edits cannot overwrite a remote change', async()=>{
  await seed(); const version=(await snapshot())._version;
  await db.exec("update public.workout_days set name='Remote' where id='d'");
  await assert.rejects(mutate('rename_day',{id:'d',name:'Stale draft'},{version}),/Cloud data changed/);
  assert.equal((await snapshot()).days[0].name,'Remote');
});
test('atomic ordering rejects incomplete, duplicate and foreign IDs', async()=>{
  await seed(); await mutate('create_day',{id:'d2',name:'Second',createdAt:'2026-10-16'});
  const original=await snapshot();
  for(const ids of [['d'],['d','d'],['d','foreign']]){
    await assert.rejects(mutate('reorder_days',{ids}),/ordering IDs|List changed/);
    assert.deepEqual(await snapshot(),original);
  }
  await mutate('reorder_days',{ids:['d2','d']});
  assert.deepEqual((await snapshot()).days.map(d=>d.id),['d2','d']);
});
test('ordering failure rolls back all position changes and its receipt',async()=>{
  await seed(); await mutate('create_day',{id:'d2',name:'Second',createdAt:'2026-10-16'});
  await db.exec(`RESET ROLE; CREATE FUNCTION public.fail_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.id='d2' AND NEW.position<>OLD.position THEN RAISE EXCEPTION 'ordering interrupted'; END IF; RETURN NEW; END; $$;
    CREATE TRIGGER fail_order BEFORE UPDATE ON public.workout_days FOR EACH ROW EXECUTE FUNCTION public.fail_order(); SET ROLE authenticated;`);
  const original=await snapshot();
  try {
    await assert.rejects(mutate('reorder_days',{ids:['d2','d']},{id:'order'}),/ordering interrupted/);
    assert.deepEqual(await snapshot(),original);
    assert.equal((await db.query("select count(*)::int as n from public.gymlog_sync_operations where operation_id='order'")).rows[0].n,0);
  } finally { await db.exec('RESET ROLE; DROP TRIGGER fail_order ON public.workout_days; DROP FUNCTION public.fail_order(); SET ROLE authenticated;'); }
});
test('missing rows and changed operation payloads do not report successful edits',async()=>{
  await seed();
  await assert.rejects(mutate('rename_day',{id:'missing',name:'Nope'}),/item changed or was deleted/);
  const version=(await snapshot())._version; await mutate('rename_day',{id:'d',name:'First'},{version,id:'same-id'});
  await assert.rejects(mutate('rename_day',{id:'d',name:'Second'},{version,id:'same-id'}),/Operation ID already used/);
  assert.equal((await snapshot()).days[0].name,'First');
});
test('ordinary writes respect account identity, RLS and anonymous grants',async()=>{
  await seed(); await identity(B);
  await assert.rejects(mutate('rename_day',{id:'d',name:'Wrong'},{user:A,version:'old'}),/Account changed/);
  await assert.rejects(mutate('rename_day',{id:'d',name:'Wrong'},{user:B}),/item changed or was deleted/);
  await db.exec('RESET ROLE; SET ROLE anon;');
  await assert.rejects(db.query('select public.mutate_gymlog_data($1,$2,$3,$4,$5::jsonb)',[A,'write','old','create_day','{}']),/permission denied/);
});
test('large nested snapshots retain all entries with deterministic equal-date ordering',async()=>{
  await seed();
  await db.exec(`insert into public.measurement_entries(id,measurement_id,user_id,log_date,value,unit)
    select 'bulk-'||lpad(n::text,4,'0'),'m','${A}','2026-10-16',n,'kg' from generate_series(1,1200) n;`);
  const entries=(await snapshot()).measurements[0].entries;
  assert.equal(entries.length,1201);
  assert.equal(entries[0].id,'bulk-0001'); assert.equal(entries[1199].id,'bulk-1200');
});

test('exercise create, rename, scoped reorder and delete preserve unrelated exercises',async()=>{
  await seed();
  await mutate('add_exercise',{id:'e2',dayId:'d',name:'Press'});
  await mutate('rename_exercise',{id:'e2',name:'Overhead press'});
  await mutate('reorder_exercises',{dayId:'d',ids:['e2','e']});
  assert.deepEqual((await snapshot()).days[0].exercises.map(e=>e.name),['Overhead press','Bench']);
  const original=await snapshot();
  await assert.rejects(mutate('reorder_exercises',{dayId:'other-day',ids:['e','e2']}),/Exercise order changed/);
  assert.deepEqual(await snapshot(),original);
  await mutate('delete_exercise',{id:'e2'});
  assert.equal((await snapshot()).days[0].exercises[0].sets[0].weight,50);
});
test('ordinary set create, update and delete preserve numbering and deduplicate retries',async()=>{
  await seed();const version=(await snapshot())._version;
  const payload={id:'s2',exerciseId:'e',reps:8,weight:60};
  await mutate('add_set',payload,{id:'add-set',version});
  assert.equal((await mutate('add_set',payload,{id:'add-set',version})).replayed,true);
  await mutate('update_set',{id:'s2',reps:9,weight:65});
  await mutate('delete_set',{id:'s'});
  assert.deepEqual((await snapshot()).days[0].exercises[0].sets,[{id:'s2',num:1,reps:9,weight:65}]);
  await assert.rejects(mutate('delete_set',{id:'s'}),/no longer exists/);
});
test('measurement create, rename, entry create/delete, reorder and cascade delete work atomically',async()=>{
  await seed();
  await mutate('create_measurement',{id:'m2',name:'Waist',createdAt:'2026-10-16'});
  await mutate('rename_measurement',{id:'m2',name:'Waist circumference'});
  await mutate('add_measurement_entry',{id:'entry2',measurementId:'m2',logDate:'2026-10-16',value:80,unit:'cm'});
  await mutate('reorder_measurements',{ids:['m2','m']});
  const current=await snapshot();assert.equal(current.measurements[0].name,'Waist circumference');assert.equal(current.measurements[0].entries[0].value,80);
  await assert.rejects(mutate('reorder_measurements',{ids:['m2']}),/List changed/);
  await mutate('delete_measurement_entry',{id:'entry2'});assert.equal((await snapshot()).measurements[0].entries.length,0);
  await mutate('delete_measurement',{id:'m'});assert.equal((await db.query("select count(*)::int as n from public.measurement_entries where measurement_id='m'")).rows[0].n,0);
});
test('day delete cascades sets and history; a repeated receipt preserves a recreated day',async()=>{
  await seed();await save();const version=(await snapshot())._version;
  await mutate('delete_day',{id:'d'},{version,id:'delete-original'});
  assert.equal((await snapshot()).days.length,0);
  for(const table of ['exercises','active_sets','workout_history','workout_history_sets'])assert.equal((await db.query(`select count(*)::int as n from public.${table}`)).rows[0].n,0);
  await mutate('create_day',{id:'d',name:'Recreated',createdAt:'2026-10-16'});
  assert.equal((await mutate('delete_day',{id:'d'},{version,id:'delete-original'})).replayed,true);
  assert.equal((await snapshot()).days[0].name,'Recreated');
});
test('missing targets and malformed ordinary actions roll back and create no receipt',async()=>{
  await seed();const original=await snapshot();
  for(const [action,payload] of [
    ['rename_exercise',{id:'missing',name:'No'}],['delete_exercise',{id:'missing'}],['update_set',{id:'missing',reps:5,weight:5}],
    ['rename_measurement',{id:'missing',name:'No'}],['delete_measurement',{id:'missing'}],['delete_measurement_entry',{id:'missing'}],
    ['add_exercise',{id:'bad',dayId:'missing',name:'No'}],['add_measurement_entry',{id:'bad',measurementId:'missing',logDate:'2026-10-16',value:1,unit:'kg'}],
    ['create_day',{id:'bad',name:'No',createdAt:'2026-02-30'}],['create_day',{id:'bad',name:'',createdAt:'2026-10-16'}],['unknown',{id:'bad'}]
  ]){
    await assert.rejects(mutate(action,payload,{id:'rejected'}));assert.deepEqual(await snapshot(),original);
    assert.equal((await db.query("select count(*)::int as n from public.gymlog_sync_operations where operation_id='rejected'")).rows[0].n,0);
  }
});
test('all relationship foreign keys include ownership and reject cross-account parents',async()=>{
  const rows=(await db.query("select conrelid::regclass::text as child,pg_get_constraintdef(oid) as definition from pg_constraint where contype='f' and connamespace='public'::regnamespace and confrelid in ('public.workout_days'::regclass,'public.exercises'::regclass,'public.workout_history'::regclass,'public.measurements'::regclass)")).rows;
  assert.equal(rows.length,5);assert.ok(rows.every(r=>/FOREIGN KEY \(\w+, user_id\) REFERENCES \w+\(id, user_id\)/.test(r.definition)));
  await seed();await identity(B);
  await assert.rejects(mutate('add_exercise',{id:'foreign',dayId:'d',name:'Cross-account'},{user:B}),/foreign key/);
  assert.equal((await snapshot(B)).days.length,0);
});
