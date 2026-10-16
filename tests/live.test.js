// Explicit opt-in: credentials must belong to disposable verification accounts.
// These tests replace ONLY those accounts' data through authenticated RPCs.
import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { guest } from './helpers/native-postgres.js';

if(!process.env.GYMLOG_LIVE_CONFIG)throw new Error('Set GYMLOG_LIVE_CONFIG to a private disposable-account configuration.');
const config=JSON.parse(await readFile(process.env.GYMLOG_LIVE_CONFIG,'utf8'));
assert.equal(config.accounts.length,2);
assert.ok(config.accounts.every(a=>a.email.startsWith('gymlog-verification-')),'Only disposable verification accounts are allowed');
assert.ok(config.key.startsWith('sb_publishable_'),'Use a publishable key, never a server secret');
const [A,B]=config.accounts.map(a=>a.id);
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:init?.signal?AbortSignal.any([init.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)})}};
const make=()=>createClient(config.url,config.key,options);
const one=make(),two=make(),other=make(),anon=make();
let scenario=crypto.randomUUID();
const rpc=async(client,name,args)=>{const r=await client.rpc(name,args);if(r.error)throw Object.assign(new Error(r.error.message),{code:r.error.code});return r.data;};
const snapshot=(client=one,id=A)=>rpc(client,'get_gymlog_snapshot',{expected_user_id:id});
async function migrate(client,payload,{id=A,operation=crypto.randomUUID(),version,replace=true}={}){
  version??=(await snapshot(client,id))._version;
  return rpc(client,'apply_gymlog_migration',{expected_user_id:id,operation_id:scenario+'-'+operation,expected_version:version,payload,replace_existing:replace});
}
async function mutate(client,action,payload,{id=A,operation=crypto.randomUUID(),version}={}){
  version??=(await snapshot(client,id))._version;
  return rpc(client,'mutate_gymlog_data',{expected_user_id:id,operation_id:scenario+'-'+operation,expected_version:version,action,payload});
}
async function save(client,{operation='same-session',generation,sets=guest().days[0].exercises[0].sets,id=A}={}){
  generation??=(await snapshot(client,id))._generation;
  return rpc(client,'save_gymlog_session',{expected_user_id:id,operation_id:scenario+'-'+operation,exercise_id:'e',log_date:'2026-10-16',sets,dataset_generation:generation});
}
async function rest(result){const r=await result;if(r.error)throw Object.assign(new Error(r.error.message),{code:r.error.code});return r.data;}
before(async()=>{
  for(const [client,account] of [[one,config.accounts[0]],[two,config.accounts[0]],[other,config.accounts[1]]]){
    const {data,error}=await client.auth.signInWithPassword({email:account.email,password:account.password});
    assert.ifError(error);assert.equal(data.user.id,account.id);
  }
});
after(async()=>{for(const c of [one,two,other])await c.auth.signOut();});
beforeEach(async()=>{
  scenario=crypto.randomUUID();
  await migrate(one,{days:[],measurements:[]});
  await migrate(other,{days:[],measurements:[]},{id:B});
});
test('live Auth signs in both accounts and refreshes a session before an authenticated snapshot',async()=>{
  const {data,error}=await one.auth.refreshSession();assert.ifError(error);assert.equal(data.user.id,A);
  assert.equal((await snapshot()).days.length,0);assert.equal((await snapshot(other,B)).days.length,0);
});
test('live upload retry preserves a later REST edit',async()=>{
  const version=(await snapshot())._version;
  await migrate(one,guest(),{version,operation:'upload-once',replace:false});
  await rest(two.from('workout_days').update({name:'Other device'}).eq('id','d'));
  assert.equal((await migrate(one,guest(),{version,operation:'upload-once',replace:false})).replayed,true);
  assert.equal((await snapshot()).days[0].name,'Other device');
});
test('simultaneous live uploads share one receipt and one hierarchy',async()=>{
  const version=(await snapshot())._version,operation='concurrent-upload';
  const receipts=await Promise.all([one,two].map(c=>migrate(c,guest(),{version,operation,replace:false})));
  assert.equal(receipts.filter(r=>r.replayed).length,1);assert.equal((await snapshot()).days.length,1);
});
test('simultaneous live creates from one version allow one winner and reject the stale writer',async()=>{
  const version=(await snapshot())._version;
  const results=await Promise.allSettled([one,two].map((c,i)=>mutate(c,'create_day',{id:'day-'+i,name:'Day '+i,createdAt:'2026-10-16'},{version})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'PT409');assert.equal((await snapshot()).days.length,1);
});
test('simultaneous live saves deduplicate and preserve a newly added set',async()=>{
  await migrate(one,guest());const generation=(await snapshot())._generation;
  await mutate(two,'add_set',{id:'later',exerciseId:'e',reps:8,weight:60});
  const receipts=await Promise.all([one,two].map(c=>save(c,{generation})));
  assert.equal(receipts.filter(r=>r.replayed).length,1);
  const ex=(await snapshot()).days[0].exercises[0];assert.equal(ex.history.length,1);assert.equal(ex.sets[0].id,'later');
});
test('different live operations cannot save consumed sets twice',async()=>{
  await migrate(one,guest());const generation=(await snapshot())._generation;
  const results=await Promise.allSettled([save(one,{generation,operation:'first'}),save(two,{generation,operation:'second'})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await snapshot()).days[0].exercises[0].history.length,1);
});
test('live edited or deleted source sets reject the whole session',async()=>{
  for(const change of [()=>two.from('active_sets').update({weight:99}).eq('id','s'),()=>two.from('active_sets').delete().eq('id','s')]){
    await migrate(one,guest());await rest(change());await assert.rejects(save(one),{code:'PT409'});
    assert.equal((await snapshot()).days[0].exercises[0].history.length,0);
  }
});
test('live replacement rejects a stale preview and preserves newer cloud data',async()=>{
  await migrate(one,guest());const version=(await snapshot())._version;
  await mutate(two,'rename_day',{id:'d',name:'Newer remote'});
  await assert.rejects(migrate(one,guest(),{version}),{code:'PT409'});assert.equal((await snapshot()).days[0].name,'Newer remote');
});
test('live malformed replacement and invalid ordinary write preserve the dataset',async()=>{
  await migrate(one,guest());const original=await snapshot();
  await assert.rejects(migrate(one,{days:null,measurements:[]}),{code:'22023'});
  await assert.rejects(mutate(one,'add_set',{id:'bad',exerciseId:'e',reps:0,weight:-1}));
  assert.deepEqual(await snapshot(),original);
});
test('live ordinary replay uses the receipt and preserves later edits',async()=>{
  const version=(await snapshot())._version,payload={id:'new',name:'Initial',createdAt:'2026-10-16'};
  await mutate(one,'create_day',payload,{version,operation:'create-once'});await mutate(two,'rename_day',{id:'new',name:'Later edit'});
  assert.equal((await mutate(one,'create_day',payload,{version,operation:'create-once'})).replayed,true);
  assert.equal((await snapshot()).days[0].name,'Later edit');
  await assert.rejects(mutate(one,'create_day',{...payload,name:'Changed'},{version,operation:'create-once'}),{code:'22023'});
});
test('live ordinary edits, ordering and cascade deletion cover the full hierarchy',async()=>{
  await migrate(one,guest());
  await mutate(one,'create_day',{id:'d2',name:'Second',createdAt:'2026-10-16'});await mutate(one,'reorder_days',{ids:['d2','d']});
  await mutate(one,'add_exercise',{id:'e2',dayId:'d',name:'Press'});await mutate(one,'rename_exercise',{id:'e2',name:'Overhead'});await mutate(one,'reorder_exercises',{dayId:'d',ids:['e2','e']});
  await mutate(one,'add_set',{id:'s2',exerciseId:'e',reps:8,weight:60});await mutate(one,'update_set',{id:'s2',reps:9,weight:65});await mutate(one,'delete_set',{id:'s'});
  assert.equal((await snapshot()).days[1].exercises[1].sets[0].num,1);
  await mutate(one,'create_measurement',{id:'m2',name:'Waist',createdAt:'2026-10-16'});await mutate(one,'rename_measurement',{id:'m2',name:'Waist cm'});
  await mutate(one,'add_measurement_entry',{id:'entry2',measurementId:'m2',logDate:'2026-10-16',value:80,unit:'cm'});await mutate(one,'reorder_measurements',{ids:['m2','m']});
  assert.equal((await snapshot()).measurements[0].entries[0].value,80);
  await mutate(one,'delete_measurement_entry',{id:'entry2'});await mutate(one,'delete_measurement',{id:'m2'});await mutate(one,'delete_exercise',{id:'e2'});await mutate(one,'delete_day',{id:'d'});
  assert.equal((await snapshot()).days.length,1);assert.equal((await snapshot()).days[0].id,'d2');
});
test('live stale ordering and missing targets reject instead of silently succeeding',async()=>{
  await migrate(one,guest());const original=await snapshot();
  await assert.rejects(mutate(one,'reorder_days',{ids:[]}),{code:'PT409'});
  await assert.rejects(mutate(one,'rename_day',{id:'missing',name:'No'}),{code:'PT409'});assert.deepEqual(await snapshot(),original);
});
test('live dataset generation distinguishes restored sets from stale retries',async()=>{
  await migrate(one,guest());const generation=(await snapshot())._generation;await save(one,{generation,operation:'old-session'});
  await migrate(one,guest());const newGeneration=(await snapshot())._generation;assert.notEqual(newGeneration,generation);
  assert.equal((await save(one,{generation,operation:'old-session'})).replayed,true);
  await assert.rejects(save(one,{generation,operation:'never-committed'}),{code:'PT409'});
  await save(one,{generation:newGeneration,operation:'new-generation'});assert.equal((await snapshot()).days[0].exercises[0].history.length,1);
});
test('live authenticated RPCs reject account mismatch and the legacy restore endpoint is denied',async()=>{
  await migrate(one,guest());
  await assert.rejects(snapshot(other,A),{code:'42501'});
  await assert.rejects(migrate(other,guest(),{id:A,version:'old'}),{code:'42501'});
  await assert.rejects(save(other,{id:A,generation:'0'}),{code:'42501'});
  await assert.rejects(mutate(other,'rename_day',{id:'d',name:'Wrong'},{id:A,version:'old'}),{code:'42501'});
  await assert.rejects(rpc(one,'replace_gymlog_data',{payload:guest()}),{code:'42501'});
});
test('live anonymous requests cannot invoke the new RPCs or read receipts',async()=>{
  for(const [name,args] of [
    ['get_gymlog_snapshot',{expected_user_id:A}],
    ['mutate_gymlog_data',{expected_user_id:A,operation_id:'anon',expected_version:'old',action:'create_day',payload:{}}],
    ['apply_gymlog_migration',{expected_user_id:A,operation_id:'anon',expected_version:'old',payload:guest(),replace_existing:true}],
    ['save_gymlog_session',{expected_user_id:A,operation_id:'anon',exercise_id:'e',log_date:'2026-10-16',sets:[],dataset_generation:'0'}]
  ])await assert.rejects(rpc(anon,name,args),{code:'42501'});
  const denied=await anon.from('gymlog_sync_operations').select('*');assert.equal(denied.error?.code,'42501');
});
test('live RLS scopes direct REST reads, ownership changes, foreign keys and receipts',async()=>{
  await migrate(one,guest());
  assert.deepEqual(await rest(other.from('workout_days').select('id').eq('user_id',A)),[]);
  await assert.rejects(rest(one.from('workout_days').update({user_id:B}).eq('id','d')),{code:'42501'});
  await assert.rejects(mutate(other,'add_exercise',{id:'cross',dayId:'d',name:'Cross'},{id:B}),{code:'23503'});
  assert.deepEqual(await rest(other.from('gymlog_sync_operations').select('operation_id').eq('user_id',A)),[]);
  await migrate(other,guest(),{id:B});assert.equal((await snapshot(other,B)).days[0].id,'d');
});
test('managed PostgREST snapshot retains more than 1000 nested entries in stable order',async()=>{
  const payload=guest();payload.measurements[0].entries=Array.from({length:1201},(_,i)=>({id:'bulk-'+String(i).padStart(4,'0'),date:'2026-10-16',value:i,unit:'kg'}));
  await migrate(one,payload);const entries=(await snapshot()).measurements[0].entries;
  assert.equal(entries.length,1201);assert.equal(entries[0].id,'bulk-0000');assert.equal(entries[1200].id,'bulk-1200');
});
