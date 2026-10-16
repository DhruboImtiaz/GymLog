import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright';
import { browserServer } from './helpers/browser-server.js';
import { A, B, guest, seed, snapshot } from './helpers/native-postgres.js';

let server, sql;
const browsers={}, contexts=[];
before(async()=>{
  server=await browserServer();sql=await server.cluster.connect(A);
  for(const [name,engine] of Object.entries({chromium,firefox,webkit}))browsers[name]=await engine.launch();
});
after(async()=>{await Promise.all(contexts.map(c=>c.close()));await Promise.all(Object.values(browsers).map(b=>b.close()));await server?.close();});
async function until(fn,message='condition',timeout=8000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,20));}assert.fail(`Timed out waiting for ${message}`);}
const records=name=>server.requests.filter(r=>r.path===`/rest/v1/rpc/${name}`);
async function profile(name,{userId=A,local,path='/',expires=3600,clock=false,oldCache=false}={}) {
  const items=[];if(userId)items.push({name:server.storageKey,value:JSON.stringify(server.session(userId,expires))});
  if(local)items.push({name:'gymlog_data',value:JSON.stringify(local)});
  const context=await browsers[name].newContext({storageState:{cookies:[],origins:[{origin:server.appUrl,localStorage:items}]}});contexts.push(context);
  const page=await context.newPage();page.setDefaultTimeout(8000);page.on('dialog',dialog=>dialog.accept());
  if(clock)await page.clock.install();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  if(oldCache){await page.goto(server.appUrl+'/test-blank.html');await page.evaluate(async()=>{const old=await caches.open('gymlog-cache-v1');await old.put('/rest/v1/private',new Response('private old response'));});}
  await page.goto(server.appUrl+path);
  return {page,context,errors};
}
async function ready(page){await page.getByText('Cloud data loaded',{exact:true}).waitFor();}
async function pending(page){return page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('gymlog_pending_write_')).map(k=>JSON.parse(localStorage.getItem(k))));}
async function createDay(page,name){await page.getByRole('button',{name:'+ New Day',exact:true}).click();await page.getByPlaceholder('e.g. Push Day, Leg Day...').fill(name);await page.getByRole('button',{name:'Create',exact:true}).click();}
async function renameRemote(name){await sql.query('update public.workout_days set name=$1 where id=$2',[name,'d']);}
async function switchAccount(page,id){
  await page.evaluate(({key,s})=>{localStorage.setItem(key,JSON.stringify(s));const channel=new BroadcastChannel(key);channel.postMessage({event:'SIGNED_IN',session:s});channel.close();},{key:server.storageKey,s:server.session(id)});
}
async function restorePreview(page,payload){
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  const picker=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Restore',exact:true}).click();
  await (await picker).setFiles({name:'GymLog_Backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({metadata:{app:'GymLog',schemaVersion:1},data:{gymlog_data:JSON.stringify(payload)}}))});
  await page.getByRole('button',{name:'Confirm Restore',exact:true}).waitFor();
}

for(const name of ['chromium','firefox','webkit']) {
  const check=(label,fn)=>test(`${name}: ${label}`,async()=>{
    await server.reset();
    const start=contexts.length;
    try{await fn();}catch(error){
      console.error(error.message);
      for(const c of contexts.slice(start))for(const page of c.pages())console.error((await page.locator('body').innerText()).slice(0,2000));
      console.error(JSON.stringify(server.requests.slice(-8)));
      throw error;
    }finally{await Promise.all(contexts.splice(start).map(c=>c.close()));}
  });
  check('guest UI persists after reload; storage clearing removes guest data',async()=>{
    const {page,errors}=await profile(name,{userId:null});
    await createDay(page,'Guest workout');await page.locator('.card-title').filter({hasText:'Guest workout'}).waitFor();
    await page.reload();await page.locator('.card-title').filter({hasText:'Guest workout'}).waitFor();
    await page.evaluate(()=>localStorage.clear());await page.reload();await page.getByText('No Workout Days Yet',{exact:true}).waitFor();
    assert.equal(records('mutate_gymlog_data').length,0);assert.deepEqual(errors,[]);
  });
  check('guest upload commits data and removes only the acknowledged local revision',async()=>{
    const {page,errors}=await profile(name,{local:guest()});
    await page.getByRole('button',{name:'Upload to Cloud',exact:true}).click();await ready(page);
    assert.equal((await snapshot(sql)).days[0].name,'Push');assert.equal(await page.evaluate(()=>localStorage.getItem('gymlog_data')),null);
    assert.deepEqual(errors,[]);
  });
  check('lost upload response survives reload and replays without overwriting later edits',async()=>{
    const {page}=await profile(name,{local:guest()});server.controls.dropNext='apply_gymlog_migration';
    await page.getByRole('button',{name:'Upload to Cloud',exact:true}).click();
    await page.getByRole('button',{name:'Resume migration',exact:true}).waitFor();
    const first=records('apply_gymlog_migration')[0].body.operation_id;
    await renameRemote('Later remote edit');server.controls.dropNext=null;await page.reload();
    await page.getByRole('button',{name:'Resume migration',exact:true}).click();await ready(page);
    assert.equal((await snapshot(sql)).days[0].name,'Later remote edit');
    assert.ok(records('apply_gymlog_migration').every(r=>r.body.operation_id===first));
    assert.equal(await page.evaluate(()=>localStorage.getItem('gymlog_data')),null);
  });
  check('stale replacement preview rejects and requires a second confirmation',async()=>{
    await seed(sql);await renameRemote('Cloud original');
    const {page}=await profile(name,{local:guest()});
    const replace=page.getByRole('button',{name:/REPLACE CLOUD WITH LOCAL/});await replace.waitFor();await renameRemote('New remote edit');
    await replace.click();await page.getByText(/Cloud data changed/).waitFor();
    assert.equal((await snapshot(sql)).days[0].name,'New remote edit');
    assert.ok(await page.evaluate(()=>localStorage.getItem('gymlog_data')));
    await replace.click();await ready(page);assert.equal((await snapshot(sql)).days[0].name,'Push');
  });
  check('two browser profiles save one session and preserve a set added remotely',async()=>{
    await seed(sql);
    const first=await profile(name,{path:'/day/d/exercise/e'}),second=await profile(name,{path:'/day/d/exercise/e'});
    await ready(first.page);await ready(second.page);
    await sql.query('select public.add_gymlog_set($1,$2,$3,$4,$5)',[A,'e','later',8,60]);
    server.controls.holdNext='save_gymlog_session';
    await first.page.getByRole('button',{name:"Save Today's Workout to History",exact:true}).click();
    await until(()=>server.controls.holds.length===1,'first committed save');
    await second.page.getByRole('button',{name:"Save Today's Workout to History",exact:true}).click();
    await until(()=>records('save_gymlog_session').length===2,'second save');
    server.controls.holds.splice(0).forEach(resolve=>resolve());
    await until(async()=>!(await pending(first.page)).length&&!(await pending(second.page)).length,'both receipts reconciled');
    const ex=(await snapshot(sql)).days[0].exercises[0];assert.equal(ex.history.length,1);assert.equal(ex.sets[0].id,'later');
    assert.equal(records('save_gymlog_session')[0].body.operation_id,records('save_gymlog_session')[1].body.operation_id);
  });
  check('remotely edited and deleted selected sets reject without partial history',async()=>{
    for(const statement of ["update public.active_sets set weight=90 where id='s'","delete from public.active_sets where id='s'"]){
      await seed(sql);const {page,context}=await profile(name,{path:'/day/d/exercise/e'});await ready(page);await sql.query(statement);
      await page.getByRole('button',{name:"Save Today's Workout to History",exact:true}).click();await page.getByText(/Workout sets changed/).waitFor();
      assert.equal((await snapshot(sql)).days[0].exercises[0].history.length,0);assert.equal((await pending(page)).length,0);await context.close();
    }
  });
  check('lost ordinary-create response retains form and recovers the same operation after reload',async()=>{
    const {page}=await profile(name);await ready(page);server.controls.dropNext='mutate_gymlog_data';
    await createDay(page,'Once only');await page.getByRole('button',{name:'Retry saved change',exact:true}).waitFor();
    await until(()=>records('mutate_gymlog_data').some(r=>r.result),'committed create');
    assert.equal(await page.getByPlaceholder('e.g. Push Day, Leg Day...').inputValue(),'Once only');
    const original=(await pending(page))[0].id;
    await sql.query("update public.workout_days set name='Later name'");server.controls.dropNext=null;await page.reload();await ready(page);
    await page.getByRole('button',{name:'Retry saved change',exact:true}).click();
    await until(async()=>!(await pending(page)).length,'recovered write');
    assert.equal((await snapshot(sql)).days.length,1);assert.equal((await snapshot(sql)).days[0].name,'Later name');
    assert.ok(records('mutate_gymlog_data').every(r=>r.body.operation_id===original));
  });
  check('acknowledged write with failed read refreshes without resending the mutation',async()=>{
    const {page}=await profile(name);await ready(page);server.controls.holdNext='mutate_gymlog_data';
    await createDay(page,'Committed');await until(()=>server.controls.holds.length===1,'committed mutation');
    server.controls.failReads=true;server.controls.holds.splice(0).forEach(resolve=>resolve());
    await page.getByText(/Your change was saved. Finish refreshing/).waitFor();
    assert.equal((await pending(page))[0].phase,'acknowledged');server.controls.failReads=false;
    await page.getByRole('button',{name:'Retry saved change',exact:true}).click();
    await until(async()=>!(await pending(page)).length,'refresh only');assert.equal(records('mutate_gymlog_data').length,1);
    await page.locator('.card-title').filter({hasText:'Committed'}).waitFor();
  });
  check('refresh preserves open draft and stale edits reject until the editor is reopened',async()=>{
    await seed(sql);const {page}=await profile(name);await ready(page);
    await page.getByRole('button',{name:'Edit',exact:true}).click();const input=page.locator('.modal-box input');await input.fill('My draft');
    await renameRemote('Remote name');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.locator('.card-title').filter({hasText:'Remote name'}).waitFor();assert.equal(await input.inputValue(),'My draft');
    await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText(/Cloud data changed/).waitFor();
    assert.equal((await snapshot(sql)).days[0].name,'Remote name');assert.equal(await input.inputValue(),'My draft');
    await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'Edit',exact:true}).click();
    await input.fill('Reviewed name');await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.locator('.card-title').filter({hasText:'Reviewed name'}).waitFor();
  });
  check('quota failure prevents the cloud mutation and preserves the draft',async()=>{
    const {page}=await profile(name);await ready(page);
    await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('gymlog_pending_write_'))throw new DOMException('Test quota full','QuotaExceededError');return original.call(this,key,value);};});
    await createDay(page,'Quota draft');await page.getByText(/Test quota full/).waitFor();
    assert.equal(records('mutate_gymlog_data').length,0);assert.equal(await page.getByPlaceholder('e.g. Push Day, Leg Day...').inputValue(),'Quota draft');
  });
  check('logout propagates to another tab and hides cloud data in both',async()=>{
    await seed(sql);const {page,context}=await profile(name);await ready(page);
    const second=await context.newPage();await second.goto(server.appUrl);await ready(second);
    await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Log Out',exact:true}).click();
    await second.getByText('No Workout Days Yet',{exact:true}).waitFor();assert.equal(await second.getByText('Cloud data loaded',{exact:true}).count(),0);
    await page.getByText('No Workout Days Yet',{exact:true}).waitFor();
    assert.equal(await page.getByText('Cloud data loaded',{exact:true}).count(),0);
  });
  check('an expired access token refreshes through the real SDK before a cloud read',async()=>{
    await seed(sql);const {page}=await profile(name,{expires:-1});await ready(page);
    assert.ok(server.requests.some(r=>r.path==='/auth/v1/token'&&r.body.refresh_token));
    await page.locator('.card-title').filter({hasText:'Push'}).waitFor();
  });
  check('account switch while an upload response is delayed preserves the guest revision',async()=>{
    const {page,context}=await profile(name,{local:guest()});server.controls.holdNext='apply_gymlog_migration';
    await page.getByRole('button',{name:'Upload to Cloud',exact:true}).click();await until(()=>server.controls.holds.length===1,'held upload');
    const tab=await context.newPage();await tab.goto(server.appUrl+'/auth');
    // Signing in from another tab causes the actual SDK BroadcastChannel auth event.
    await tab.evaluate(async({apiUrl,key})=>{const response=await fetch(apiUrl+'/auth/v1/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'b@example.test',password:'test-password'})});const s=await response.json();localStorage.setItem(key,JSON.stringify(s));const channel=new BroadcastChannel(key);channel.postMessage({event:'SIGNED_IN',session:s});channel.close();},{apiUrl:server.apiUrl,key:server.storageKey});
    await until(async()=>await page.getByRole('button',{name:'Upload to Cloud',exact:true}).isVisible(),'account B migration');
    server.controls.holds.splice(0).forEach(resolve=>resolve());
    await until(async()=>await page.evaluate(()=>!!localStorage.getItem('gymlog_data')),'guest preserved');
    const b=await server.cluster.connect(B);assert.equal((await snapshot(b,B)).days.length,0);await b.end();
    assert.ok(await page.evaluate(()=>localStorage.getItem('gymlog_pending_migration_11111111-1111-4111-8111-111111111111')));
  });
  check('A to B to A during upload ignores the original completion and requires recovery',async()=>{
    const {page,context}=await profile(name,{local:guest()});server.controls.holdNext='apply_gymlog_migration';
    await page.getByRole('button',{name:'Upload to Cloud',exact:true}).click();await until(()=>server.controls.holds.length===1,'held upload');
    const tab=await context.newPage();await tab.goto(server.appUrl);
    await switchAccount(tab,B);await page.getByRole('button',{name:'Upload to Cloud',exact:true}).waitFor();
    await switchAccount(tab,A);await page.getByRole('button',{name:'Resume migration',exact:true}).waitFor();
    const response=page.waitForResponse(r=>r.url().endsWith('/apply_gymlog_migration'));
    server.controls.holds.splice(0).forEach(resolve=>resolve());await response;
    assert.ok(await page.evaluate(()=>localStorage.getItem('gymlog_data')));
    assert.ok(await page.evaluate(()=>localStorage.getItem('gymlog_pending_migration_11111111-1111-4111-8111-111111111111')));
    await renameRemote('Edit after upload');await page.getByRole('button',{name:'Resume migration',exact:true}).click();await ready(page);
    assert.equal((await snapshot(sql)).days[0].name,'Edit after upload');
  });
  check('A to B to A during session save preserves the original account recovery record',async()=>{
    await seed(sql);const {page,context}=await profile(name,{path:'/day/d/exercise/e'});await ready(page);
    server.controls.holdNext='save_gymlog_session';await page.getByRole('button',{name:"Save Today's Workout to History",exact:true}).click();
    await until(()=>server.controls.holds.length===1,'held session');const original=(await pending(page))[0].id;
    const tab=await context.newPage();await tab.goto(server.appUrl);
    await switchAccount(tab,B);await page.getByText('No Workout Days Yet',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Retry saved change',exact:true}).count(),0);
    await switchAccount(tab,A);await page.getByRole('button',{name:'Retry saved change',exact:true}).waitFor();
    const response=page.waitForResponse(r=>r.url().endsWith('/save_gymlog_session'));server.controls.holds.splice(0).forEach(resolve=>resolve());await response;
    assert.equal((await pending(page))[0].id,original);assert.equal((await pending(page))[0].phase,'prepared');
    await page.getByRole('button',{name:'Retry saved change',exact:true}).click();await until(async()=>!(await pending(page)).length,'session receipt recovery');
    assert.equal((await snapshot(sql)).days[0].exercises[0].history.length,1);
  });
  check('a slow overlapping read is coalesced and cannot replace newer write results',async()=>{
    await seed(sql);const {page}=await profile(name);await ready(page);
    const initial=records('get_gymlog_snapshot').length;server.controls.holdNext='get_gymlog_snapshot';
    await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('focus'));});
    await until(()=>server.controls.holds.length===1,'held read');assert.equal(records('get_gymlog_snapshot').length,initial+1);
    await createDay(page,'Newer write');await page.locator('.card-title').filter({hasText:'Newer write'}).waitFor();
    const response=page.waitForResponse(r=>r.url().endsWith('/get_gymlog_snapshot'));server.controls.holds.splice(0).forEach(resolve=>resolve());await response;
    await ready(page);assert.equal(await page.locator('.card-title').filter({hasText:'Newer write'}).count(),1);
  });
  check('visible polling refreshes; simulated hidden state and real offline state suppress it',async()=>{
    await seed(sql);const {page,context}=await profile(name,{clock:true});await ready(page);
    await renameRemote('Polled');await page.clock.fastForward(30010);await page.locator('.card-title').filter({hasText:'Polled'}).waitFor();
    await page.evaluate(()=>Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'}));
    const count=records('get_gymlog_snapshot').length;await renameRemote('Hidden update');await page.clock.fastForward(60010);
    assert.equal(records('get_gymlog_snapshot').length,count);
    await page.evaluate(()=>Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'}));
    await context.setOffline(true);await page.clock.fastForward(60010);assert.equal(records('get_gymlog_snapshot').length,count);
    await context.setOffline(false);await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.locator('.card-title').filter({hasText:'Hidden update'}).waitFor();
  });
  check('stale backup preview keeps the modal open and preserves remote data',async()=>{
    await seed(sql);const {page}=await profile(name);await ready(page);const backup=guest();backup.days[0].name='Backup content';
    await restorePreview(page,backup);await renameRemote('Newer than preview');
    await page.getByRole('button',{name:'Confirm Restore',exact:true}).click();await page.getByText(/Cloud data changed/).waitFor();
    assert.equal((await snapshot(sql)).days[0].name,'Newer than preview');await page.getByRole('button',{name:'Confirm Restore',exact:true}).waitFor();
  });
  check('guest changes made in another tab during upload are preserved for the next decision',async()=>{
    const {page,context}=await profile(name,{local:guest()});server.controls.holdNext='apply_gymlog_migration';
    await page.getByRole('button',{name:'Upload to Cloud',exact:true}).click();await until(()=>server.controls.holds.length===1,'held upload');
    const tab=await context.newPage();await tab.goto(server.appUrl);const changed=guest();changed.days[0].name='New guest revision';
    await tab.evaluate(value=>localStorage.setItem('gymlog_data',JSON.stringify(value)),changed);
    server.controls.holds.splice(0).forEach(resolve=>resolve());
    await page.getByRole('button',{name:/KEEP CLOUD DATA/}).waitFor();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('gymlog_data')).days[0].name),'New guest revision');
    assert.equal((await snapshot(sql)).days[0].name,'Push');
  });
  check('remote deletion redirects all detail and progress views without a render crash',async()=>{
    for(const path of ['/day/d','/day/d/exercise/e','/day/d/exercise/e/progress','/measurements/m','/measurements/m/progress']){
      await seed(sql);const {page,context,errors}=await profile(name,{path});await ready(page);
      await sql.query(path.startsWith('/day/')?"delete from public.workout_days where id='d'":"delete from public.measurements where id='m'");
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      await until(()=>new URL(page.url()).pathname===(path.startsWith('/day/')?'/':'/measurements'),'redirect after remote deletion');
      assert.deepEqual(errors,[]);await context.close();
    }
  });
}

for(const name of ['chromium','firefox','webkit'])test(`${name}: service worker purges old private cache, bypasses APIs, and boots guest UI offline`,async()=>{
  await server.reset();const {page,context}=await profile(name,{userId:null,oldCache:true});
  await page.waitForFunction(()=>navigator.serviceWorker.controller);
  await until(()=>page.evaluate(async()=>!!await caches.match('/index.html')),'precache completed');
  await until(async()=>!(await page.evaluate(()=>caches.keys())).includes('gymlog-cache-v1'),'old private cache purged');
  const calls=['/auth/v1/user','/rest/v1/workout_days','/rest/v1/rpc/get_gymlog_snapshot'];
  for(const path of calls){const response=await page.evaluate(async path=>await(await fetch(path,{headers:{Authorization:'Bearer test'}})).json(),path);assert.equal(response.network,true);}
  const cached=await page.evaluate(async()=>{const urls=[];for(const name of await caches.keys())for(const request of await(await caches.open(name)).keys())urls.push(request.url);return urls;});
  assert.ok(cached.every(url=>!url.includes('/auth/')&&!url.includes('/rest/')));
  await createDay(page,'Offline guest');await page.locator('.card-title').filter({hasText:'Offline guest'}).waitFor();
  await page.reload();await page.getByRole('button',{name:'+ New Day',exact:true}).waitFor();
  // Refuse actual origin connections. WebKit's setOffline emulation incorrectly
  // rejects even cache-only worker responses (Playwright issue #42775).
  server.controls.originOffline=true;
  const negative=await browsers[name].newContext({serviceWorkers:'block'});contexts.push(negative);
  const uncached=await negative.newPage();await assert.rejects(uncached.goto(server.appUrl,{timeout:3000}));await negative.close();
  await page.reload();
  await page.locator('.card-title').filter({hasText:'Offline guest'}).waitFor();
  assert.equal(await page.evaluate(async()=>{try{await fetch('/rest/v1/private');return false;}catch{return true;}}),true);
  server.controls.originOffline=false;await page.reload();await page.locator('.card-title').filter({hasText:'Offline guest'}).waitFor();
  await context.close();
});
