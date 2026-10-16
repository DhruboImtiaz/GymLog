import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test, expect, vi } from 'vitest';

function worker() {
  const handlers={}; const contents=new Map(); const deleted=[];
  const cache={ addAll:vi.fn(async()=>{}), put:vi.fn(async(key,response)=>contents.set(typeof key==='string'?key:key.url,response.clone())) };
  const caches={ open:vi.fn(async()=>cache),keys:async()=>['gymlog-cache-v1','gymlog-static-v2','unrelated-cache'],delete:async name=>deleted.push(name),match:vi.fn(async key=>contents.get(typeof key==='string'?key:key.url)?.clone()) };
  const self={ location:{origin:'https://gymlog.example'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:vi.fn(),clients:{claim:vi.fn(async()=>{})} };
  const fetch=vi.fn(async()=>new Response('fresh',{status:200}));
  vm.runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),{self,caches,fetch,URL,Response});
  return {handlers,cache,caches,self,fetch,contents,deleted};
}
function request(url,options={}) { return {url,method:'GET',mode:'cors',headers:new Headers(),...options}; }
function dispatch(w,req) { let response; w.handlers.fetch({request:req,respondWith:value=>response=value}); return response; }

test('Supabase Auth, REST and RPC requests never consult or populate caches',async()=>{
  const w=worker();
  for(const path of ['/auth/v1/user','/rest/v1/workout_days?user_id=eq.A','/rest/v1/rpc/get_gymlog_snapshot']){
    expect(dispatch(w,request('https://example.supabase.co'+path))).toBeUndefined();
  }
  expect(w.caches.match).not.toHaveBeenCalled(); expect(w.cache.put).not.toHaveBeenCalled(); expect(w.fetch).not.toHaveBeenCalled();
});
test('same-origin APIs and authorized asset requests also bypass caches',()=>{
  const w=worker();
  expect(dispatch(w,request('https://gymlog.example/api/user'))).toBeUndefined();
  expect(dispatch(w,request('https://gymlog.example/assets/main.js',{headers:new Headers({Authorization:'Bearer A'})}))).toBeUndefined();
});
test('activation deletes the old private response cache and claims open pages',async()=>{
  const w=worker(); let task;
  w.handlers.activate({waitUntil:value=>task=value}); await task;
  expect(w.deleted).toEqual(['gymlog-cache-v1']); expect(w.self.clients.claim).toHaveBeenCalledOnce();
});
test('static assets use fresh network data and remain available offline',async()=>{
  const w=worker(); const req=request('https://gymlog.example/assets/main.js');
  expect(await (await dispatch(w,req)).text()).toBe('fresh');
  w.fetch.mockRejectedValue(new Error('offline'));
  expect(await (await dispatch(w,req)).text()).toBe('fresh');
});
