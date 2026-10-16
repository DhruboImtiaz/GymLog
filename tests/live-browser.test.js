// Explicit opt-in. Only disposable verification accounts may be configured.
// Production frontend -> real managed Supabase Auth/PostgREST -> real database.
import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {chromium,firefox,webkit} from 'playwright';
import {guest} from './helpers/native-postgres.js';
import {liveAppServer} from './helpers/live-app-server.js';

if(!process.env.GYMLOG_LIVE_CONFIG)throw new Error('Set GYMLOG_LIVE_CONFIG to a private disposable-account configuration.');
const config=JSON.parse(await readFile(process.env.GYMLOG_LIVE_CONFIG,'utf8'));
assert.equal(config.accounts.length,2);assert.ok(config.accounts.every(a=>a.email.startsWith('gymlog-verification-')));
assert.ok(config.key.startsWith('sb_publishable_'),'Use a publishable key, never a server secret');
const [A,B]=config.accounts.map(a=>a.id);
const key='sb-'+new URL(config.url).hostname.split('.')[0]+'-auth-token';
const clients=config.accounts.map(()=>createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:init?.signal?AbortSignal.any([init.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)})}}));
const sessions=[];const browsers={};const contexts=[];let server;
const rpc=async(client,name,args)=>{const r=await client.rpc(name,args);if(r.error)throw Object.assign(new Error(r.error.message),{code:r.error.code});return r.data;};
const snapshot=(index=0)=>rpc(clients[index],'get_gymlog_snapshot',{expected_user_id:config.accounts[index].id});
async function seed(payload=guest(),index=0){return rpc(clients[index],'apply_gymlog_migration',{expected_user_id:config.accounts[index].id,operation_id:crypto.randomUUID(),expected_version:(await snapshot(index))._version,payload,replace_existing:true});}
async function mutate(action,payload,index=0){return rpc(clients[index],'mutate_gymlog_data',{expected_user_id:config.accounts[index].id,operation_id:crypto.randomUUID(),expected_version:(await snapshot(index))._version,action,payload});}
async function until(fn,label='condition'){const end=Date.now()+15000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,30));}assert.fail('Timed out waiting for '+label);}
const ready=page=>page.getByText('Cloud data loaded',{exact:true}).waitFor();
const pending=page=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('gymlog_pending_write_')).map(k=>JSON.parse(localStorage.getItem(k))));
const createDay=async(page,name)=>{await page.getByRole('button',{name:'+ New Day',exact:true}).click();await page.getByPlaceholder('e.g. Push Day, Leg Day...').fill(name);await page.getByRole('button',{name:'Create',exact:true}).click();};
before(async()=>{
  for(const [i,account] of config.accounts.entries()){
    const {data,error}=await clients[i].auth.signInWithPassword({email:account.email,password:account.password});assert.ifError(error);assert.equal(data.user.id,account.id);sessions[i]=data.session;
  }
  server=await liveAppServer(config);
  for(const [name,engine] of Object.entries({chromium,firefox,webkit}))browsers[name]=await engine.launch();
});
after(async()=>{await Promise.all(contexts.map(c=>c.close()));await Promise.all(Object.values(browsers).map(b=>b.close()));await server?.close();for(const client of clients)await client.auth.signOut();});
async function profile(name,{local,path='/',authenticated=true,oldCache=false,session=sessions[0]}={}){
  // A preceding real global logout revokes its managed Auth session. A fresh
  // test profile must sign in again rather than bootstrap a revoked token.
  if(authenticated&&session===sessions[0]){
    const response=await fetch(config.url+'/auth/v1/user',{headers:{apikey:config.key,Authorization:'Bearer '+session.access_token},signal:AbortSignal.timeout(15000)});
    if([401,403].includes(response.status)){
      const {data,error}=await clients[0].auth.signInWithPassword({email:config.accounts[0].email,password:config.accounts[0].password});assert.ifError(error);session=data.session;sessions[0]=session;
    }else assert.equal(response.status,200);
  }
  const items=[];if(authenticated)items.push({name:key,value:JSON.stringify(session)});if(local)items.push({name:'gymlog_data',value:JSON.stringify(local)});
  // Playwright does not reliably route requests from a controlled WebKit page.
  // Its fault-injection flows block workers; the separate cache test enables
  // the real worker and uses unmodified managed Auth/RPC traffic.
  const context=await browsers[name].newContext({serviceWorkers:name==='webkit'&&!oldCache?'block':'allow',storageState:{cookies:[],origins:[{origin:server.url,localStorage:items}]}});contexts.push(context);
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('dialog',dialog=>dialog.accept());
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('response',async response=>{if(response.url().includes('/auth/v1/user')&&response.status()>=400){const body=await response.json().catch(()=>({}));console.error('Managed Auth user request:',response.status(),body.code||body.error_code||body.msg||'');}});
  if(oldCache){
    // A deployed SPA rewrites this path to the app. Supply a blank setup page
    // before registration so activation really encounters the seeded old cache.
    if(process.env.GYMLOG_DEPLOYED_URL)await context.route(server.url+'/test-blank.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Setup</title>'}));
    await page.goto(server.url+'/test-blank.html');await page.evaluate(async()=>{const c=await caches.open('gymlog-cache-v1');await c.put('/rest/v1/private',new Response('old private response'));});
  }
  await page.goto(server.url+path);return{page,context,errors};
}
async function signInUI(page,index){await page.goto(server.url+'/auth');await page.getByPlaceholder('you@example.com').fill(config.accounts[index].email);await page.locator('input[type=password]').fill(config.accounts[index].password);await page.getByRole('button',{name:'Log In',exact:true}).click();await page.waitForFunction(({key,id})=>JSON.parse(localStorage.getItem(key)||'null')?.user?.id===id,{key,id:config.accounts[index].id});sessions[index]=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);}
async function logoutUI(page,migration=false){
  const cancel=page.getByRole('button',{name:'Cancel for Now',exact:true});if(migration)await cancel.waitFor();if(await cancel.isVisible())await cancel.click();
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Log Out',exact:true}).click();
  await until(async()=>!(await page.evaluate(key=>!!localStorage.getItem(key),key)),'logout storage cleared');
}
async function fault(context,name,{drop=false,hold=false,fail=false}={}){
  const state={records:[],releases:[],drop,hold,fail};
  await context.route(config.url+'/rest/v1/rpc/'+name,async route=>{
    if(state.fail){state.records.push({status:503});return route.fulfill({status:503,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':server.url},body:JSON.stringify({message:'Injected read outage'})});}
    const body=route.request().postDataJSON();const response=await route.fetch({timeout:15000});state.records.push({body,status:response.status()});
    if(state.hold){state.hold=false;await new Promise(resolve=>state.releases.push(resolve));}
    if(state.drop)return route.abort('failed');
    return route.fulfill({response});
  });
  state.release=()=>state.releases.splice(0).forEach(resolve=>resolve());
  state.remove=async()=>{state.drop=false;state.fail=false;state.release();await context.unroute(config.url+'/rest/v1/rpc/'+name);};
  return state;
}

for(const name of ['chromium','firefox','webkit']){
  const check=(label,fn)=>test(`${name} live: ${label}`,async()=>{
    await seed({days:[],measurements:[]});await seed({days:[],measurements:[]},1);
    const start=contexts.length;
    try{await fn();}catch(error){console.error(error.message);for(const c of contexts.slice(start))for(const p of c.pages())console.error((await p.locator('body').innerText()).slice(0,1400));throw error;}
    finally{await Promise.all(contexts.splice(start).map(c=>c.close()));}
  });
  check('real UI login migrates guest data and clears its acknowledged local revision',async()=>{
    const {page,errors}=await profile(name,{authenticated:false,local:guest()});await signInUI(page,0);
    await page.getByRole('button',{name:'Upload to Cloud',exact:true}).click();await ready(page);
    sessions[0]=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
    assert.equal((await snapshot()).days[0].name,'Push');assert.equal(await page.evaluate(()=>localStorage.getItem('gymlog_data')),null);assert.deepEqual(errors,[]);
  });
  check('lost upload response resumes the original receipt after reload and preserves later edits',async()=>{
    const {page,context}=await profile(name,{local:guest()});const interrupted=await fault(context,'apply_gymlog_migration',{drop:true});
    try{
      await page.getByRole('button',{name:'Upload to Cloud',exact:true}).click();await page.getByRole('button',{name:'Resume migration',exact:true}).waitFor();
      const original=interrupted.records[0].body.operation_id;await mutate('rename_day',{id:'d',name:'Later live edit'});await interrupted.remove();await page.reload();
      const replay=await fault(context,'apply_gymlog_migration');await page.getByRole('button',{name:'Resume migration',exact:true}).click();await ready(page);
      assert.equal(replay.records[0].body.operation_id,original);assert.equal((await snapshot()).days[0].name,'Later live edit');
    }finally{await interrupted.remove();}
  });
  check('stale migration replacement returns HTTP 409 without losing guest or remote data',async()=>{
    await seed();await mutate('rename_day',{id:'d',name:'Cloud original'});const {page,context}=await profile(name,{local:guest()});
    const replace=page.getByRole('button',{name:/REPLACE CLOUD WITH LOCAL/});await replace.waitFor();await mutate('rename_day',{id:'d',name:'Newer remote'});
    const responses=await fault(context,'apply_gymlog_migration');await replace.click();await page.getByText(/Cloud data changed/).waitFor();
    assert.equal(responses.records[0].status,409);assert.equal((await snapshot()).days[0].name,'Newer remote');assert.ok(await page.evaluate(()=>localStorage.getItem('gymlog_data')));
    assert.equal(await page.evaluate(id=>localStorage.getItem('gymlog_pending_migration_'+id),A),null);
  });
  check('two profiles save the same snapshot once while a remotely added set survives',async()=>{
    await seed();const first=await profile(name,{path:'/day/d/exercise/e'}),second=await profile(name,{path:'/day/d/exercise/e'});await ready(first.page);await ready(second.page);
    await mutate('add_set',{id:'later',exerciseId:'e',reps:8,weight:60});const held=await fault(first.context,'save_gymlog_session',{hold:true});const replay=await fault(second.context,'save_gymlog_session');
    try{
      await first.page.getByRole('button',{name:"Save Today's Workout to History",exact:true}).click();await until(()=>held.releases.length===1,'first committed session');
      await second.page.getByRole('button',{name:"Save Today's Workout to History",exact:true}).click();await until(()=>replay.records.length===1,'second session receipt');held.release();
      await until(async()=>!(await pending(first.page)).length&&!(await pending(second.page)).length,'session reconciliation');
      assert.equal(held.records[0].body.operation_id,replay.records[0].body.operation_id);const ex=(await snapshot()).days[0].exercises[0];assert.equal(ex.history.length,1);assert.equal(ex.sets[0].id,'later');
    }finally{held.release();}
  });
  check('lost ordinary-create response retains the draft and replays once after reload',async()=>{
    const {page,context}=await profile(name);await ready(page);const lost=await fault(context,'mutate_gymlog_data',{drop:true});
    try{
      await createDay(page,'Live create');await page.getByRole('button',{name:'Retry saved change',exact:true}).waitFor();await until(()=>lost.records.length>0,'committed create');
      assert.equal(await page.getByPlaceholder('e.g. Push Day, Leg Day...').inputValue(),'Live create');const original=(await pending(page))[0].id;
      const id=(await snapshot()).days[0].id;await mutate('rename_day',{id,name:'Later live name'});await lost.remove();await page.reload();await ready(page);
      const retried=await fault(context,'mutate_gymlog_data');await page.getByRole('button',{name:'Retry saved change',exact:true}).click();await until(async()=>!(await pending(page)).length,'recovered create');
      assert.equal(retried.records[0].body.operation_id,original);const data=await snapshot();assert.equal(data.days.length,1);assert.equal(data.days[0].name,'Later live name');
    }finally{await lost.remove();}
  });
  check('acknowledged writes reconcile with a read only after a failed response read',async()=>{
    const {page,context}=await profile(name);await ready(page);const held=await fault(context,'mutate_gymlog_data',{hold:true});
    try{
      await createDay(page,'Saved live');await until(()=>held.releases.length===1,'committed write');const reads=await fault(context,'get_gymlog_snapshot',{fail:true});held.release();
      await page.getByText(/Your change was saved. Finish refreshing/).waitFor();await until(()=>reads.records.some(r=>r.status===503),'injected read failure');await page.getByText('Showing last loaded data',{exact:true}).waitFor();assert.equal((await pending(page))[0].phase,'acknowledged');await reads.remove();
      await page.getByRole('button',{name:'Retry saved change',exact:true}).click();await until(async()=>!(await pending(page)).length,'read reconciliation');assert.equal(held.records.length,1);
    }finally{held.release();}
  });
  check('real remote edits refresh underlying data while retaining a stale draft',async()=>{
    await seed();const {page,context}=await profile(name);await ready(page);await page.getByRole('button',{name:'Edit',exact:true}).click();const input=page.locator('.modal-box input');await input.fill('My live draft');
    await mutate('rename_day',{id:'d',name:'Remote live name'});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.locator('.card-title').filter({hasText:'Remote live name'}).waitFor();assert.equal(await input.inputValue(),'My live draft');
    const responses=await fault(context,'mutate_gymlog_data');await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText(/Cloud data changed/).waitFor();assert.equal(responses.records[0].status,409);assert.equal((await pending(page)).length,0);
    await context.setOffline(true);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));assert.equal(await input.inputValue(),'My live draft');
    await context.setOffline(false);await page.evaluate(()=>window.dispatchEvent(new Event('online')));await ready(page);assert.equal(await input.inputValue(),'My live draft');
  });
  check('stale backup preview returns a conflict and stays open without replacing cloud data',async()=>{
    await seed();const {page}=await profile(name);await ready(page);await page.getByRole('button',{name:'Settings',exact:true}).click();const picker=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Restore',exact:true}).click();
    await(await picker).setFiles({name:'GymLog_Backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({metadata:{app:'GymLog',schemaVersion:1},data:{gymlog_data:JSON.stringify(guest())}}))});
    await page.getByRole('button',{name:'Confirm Restore',exact:true}).waitFor();await mutate('rename_day',{id:'d',name:'After backup preview'});await page.getByRole('button',{name:'Confirm Restore',exact:true}).click();await page.getByText(/Cloud data changed/).waitFor();
    assert.equal((await snapshot()).days[0].name,'After backup preview');await page.getByRole('button',{name:'Confirm Restore',exact:true}).waitFor();
  });
  check('real expired local session metadata triggers managed Auth token refresh',async()=>{
    const client=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});const {data,error}=await client.auth.signInWithPassword({email:config.accounts[0].email,password:config.accounts[0].password});assert.ifError(error);
    const {page}=await profile(name,{session:{...data.session,expires_at:Math.floor(Date.now()/1000)-1}});await ready(page);
    const current=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);assert.ok(current.expires_at>Math.floor(Date.now()/1000));assert.notEqual(current.refresh_token,data.session.refresh_token);
  });
  check('real cross-tab A to B to A auth transitions invalidate delayed upload completion',async()=>{
    const {page,context}=await profile(name,{local:guest()});const held=await fault(context,'apply_gymlog_migration',{hold:true});
    try{
      await page.getByRole('button',{name:'Upload to Cloud',exact:true}).click();await until(()=>held.releases.length===1,'held upload');const tab=await context.newPage();tab.setDefaultTimeout(15000);await tab.goto(server.url);await logoutUI(tab,true);await signInUI(tab,1);
      await page.getByRole('button',{name:'Upload to Cloud',exact:true}).waitFor();assert.equal((await snapshot(1)).days.length,0);
      await logoutUI(tab,true);await signInUI(tab,0);await page.getByRole('button',{name:'Resume migration',exact:true}).waitFor();const response=page.waitForResponse(r=>r.url().endsWith('/apply_gymlog_migration'));held.release();await response;
      assert.ok(await page.evaluate(()=>localStorage.getItem('gymlog_data')));assert.ok(await page.evaluate(id=>localStorage.getItem('gymlog_pending_migration_'+id),A));await mutate('rename_day',{id:'d',name:'Edit after delayed upload'});
      await page.getByRole('button',{name:'Resume migration',exact:true}).click();await ready(page);assert.equal((await snapshot()).days[0].name,'Edit after delayed upload');
    }finally{held.release();}
  });
  check('real cross-tab A to B to A auth transitions retain delayed session recovery',async()=>{
    await seed();const {page,context}=await profile(name,{path:'/day/d/exercise/e'});await ready(page);const held=await fault(context,'save_gymlog_session',{hold:true});
    try{
      await page.getByRole('button',{name:"Save Today's Workout to History",exact:true}).click();await until(()=>held.releases.length===1,'held save');const original=(await pending(page))[0].id;
      const tab=await context.newPage();tab.setDefaultTimeout(15000);await tab.goto(server.url);await ready(tab);await logoutUI(tab);await signInUI(tab,1);await page.getByText('No Workout Days Yet',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Retry saved change',exact:true}).count(),0);
      await logoutUI(tab);await signInUI(tab,0);await page.getByRole('button',{name:'Retry saved change',exact:true}).waitFor();const response=page.waitForResponse(r=>r.url().endsWith('/save_gymlog_session'));held.release();await response;
      assert.equal((await pending(page))[0].id,original);assert.equal((await pending(page))[0].phase,'prepared');await page.getByRole('button',{name:'Retry saved change',exact:true}).click();await until(async()=>!(await pending(page)).length,'session recovery');assert.equal((await snapshot()).days[0].exercises[0].history.length,1);
    }finally{held.release();}
  });
  check('real logout in another tab hides cloud data in both windows',async()=>{
    await seed();const {page,context}=await profile(name);await ready(page);const tab=await context.newPage();tab.setDefaultTimeout(15000);await tab.goto(server.url);await ready(tab);await logoutUI(tab);
    await page.getByText('No Workout Days Yet',{exact:true}).waitFor();assert.equal(await page.getByText('Cloud data loaded',{exact:true}).count(),0);
  });
  check('worker removes the legacy private cache and never caches real Auth or RPC responses',async()=>{
    await seed();const {page}=await profile(name,{oldCache:true});await ready(page);await page.waitForFunction(()=>navigator.serviceWorker.controller);
    await until(async()=>!(await page.evaluate(()=>caches.keys())).includes('gymlog-cache-v1'),'legacy cache removal');await page.getByRole('button',{name:'Refresh',exact:true}).click();await ready(page);
    const urls=await page.evaluate(async()=>{const urls=[];for(const name of await caches.keys())for(const request of await(await caches.open(name)).keys())urls.push(request.url);return urls;});
    assert.ok(urls.length>0);assert.ok(urls.every(url=>url.startsWith(server.url)&&!url.includes('/auth/')&&!url.includes('/rest/')));
  });
}
