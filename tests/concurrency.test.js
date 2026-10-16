import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { nativePostgres, initialize, snapshot, seed, guest, A, B } from './helpers/native-postgres.js';

let cluster, admin, one, two, other;
before(async () => {
  cluster = await nativePostgres(); admin = cluster.db;
  await initialize(admin);
  one = await cluster.connect(A); two = await cluster.connect(A); other = await cluster.connect(B);
});
after(async () => { await cluster?.close(); });
beforeEach(async () => {
  await admin.query('TRUNCATE public.workout_days,public.measurements,public.gymlog_sync_operations CASCADE');
  await seed(one);
});
const save = (client, generation, id='same-session') => client.query('select public.save_gymlog_session($1,$2,$3,$4,$5::jsonb,$6) as receipt', [A,id,'e','2026-10-16',JSON.stringify(guest().days[0].exercises[0].sets),generation]);
async function blocked(client) {
  const deadline = Date.now()+3000;
  while (Date.now()<deadline) {
    const row=(await admin.query("select wait_event_type from pg_stat_activity where pid=$1",[client.processID])).rows[0];
    if(row?.wait_event_type==='Lock') return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.fail('second connection never waited on the account lock');
}

test('two connections saving the same snapshot wait on the lock and produce one history',async()=>{
  const generation=(await snapshot(one))._generation;
  await one.query('BEGIN');
  try {
    await save(one,generation);
    const pending=save(two,generation);
    await blocked(two);
    await one.query('COMMIT');
    assert.equal((await pending).rows[0].receipt.replayed,true);
    assert.equal((await snapshot(two)).days[0].exercises[0].history.length,1);
  } finally { await one.query('ROLLBACK'); }
});
test('a regular REST-style set edit takes the same lock; a stale session is rejected',async()=>{
  const generation=(await snapshot(one))._generation;
  await one.query('BEGIN');
  try {
    await one.query("update public.active_sets set weight=99 where id='s'");
    const pending=save(two,generation).then(value=>({value}),error=>({error}));
    await blocked(two);
    await one.query('COMMIT');
    assert.match((await pending).error.message,/Workout sets changed/);
    const ex=(await snapshot(two)).days[0].exercises[0];
    assert.equal(ex.history.length,0); assert.equal(ex.sets[0].weight,99);
  } finally { await one.query('ROLLBACK'); }
});
test('a set added on another connection survives a waiting session save',async()=>{
  const generation=(await snapshot(one))._generation;
  await one.query('BEGIN');
  try {
    await one.query('select public.add_gymlog_set($1,$2,$3,$4,$5)',[A,'e','new',8,60]);
    const pending=save(two,generation);
    await blocked(two); await one.query('COMMIT'); await pending;
    assert.deepEqual((await snapshot(two)).days[0].exercises[0].sets,[{id:'new',num:1,reps:8,weight:60}]);
  } finally { await one.query('ROLLBACK'); }
});
test('replacement and ordinary edit serialize; waiting stale replacement preserves the edit',async()=>{
  const old=await snapshot(one);
  await one.query('BEGIN');
  try {
    await one.query('select public.mutate_gymlog_data($1,$2,$3,$4,$5::jsonb)',[A,'rename',old._version,'rename_day',JSON.stringify({id:'d',name:'Remote'})]);
    const pending=two.query('select public.apply_gymlog_migration($1,$2,$3,$4::jsonb,true)',[A,'replace',old._version,JSON.stringify(guest())]).then(value=>({value}),error=>({error}));
    await blocked(two); await one.query('COMMIT');
    assert.match((await pending).error.message,/Cloud data changed/);
    assert.equal((await snapshot(two)).days[0].name,'Remote');
  } finally { await one.query('ROLLBACK'); }
});
test('different accounts do not wait on each other and remain isolated',async()=>{
  await one.query('BEGIN');
  try {
    await one.query("update public.workout_days set name='Held by A' where id='d'");
    await other.query("SET statement_timeout='1s'");
    await seed(other,guest(),B);
    assert.equal((await snapshot(other,B)).days[0].name,'Push');
    await one.query('ROLLBACK');
    assert.equal((await snapshot(two)).days[0].name,'Push');
  } finally { await one.query('ROLLBACK'); }
});
