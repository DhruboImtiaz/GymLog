// Local HTTP contract fixture, NOT a Supabase/GoTrue/PostgREST replacement.
// The real browser, SDK, application, PostgreSQL, migrations and RPCs are exercised.
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname, resolve } from 'node:path';
import { build } from 'vite';
import { nativePostgres, initialize, A, B } from './native-postgres.js';

const rpcArguments = {
  get_gymlog_snapshot: ['expected_user_id'],
  apply_gymlog_migration: ['expected_user_id','operation_id','expected_version','payload','replace_existing'],
  save_gymlog_session: ['expected_user_id','operation_id','exercise_id','log_date','sets','dataset_generation'],
  mutate_gymlog_data: ['expected_user_id','operation_id','expected_version','action','payload'],
};
const listen = server => new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`)));
const close = server => new Promise(resolve=>{server.close(resolve); server.closeAllConnections();});
const user = id => ({id,email:id===A?'a@example.test':'b@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:'2026-10-16T00:00:00Z'});
export function session(id=A, expires=3600) {
  const exp=Math.floor(Date.now()/1000)+expires;
  const token=[{alg:'HS256',typ:'JWT'},{sub:id,aud:'authenticated',role:'authenticated',exp},'local-test-signature'].map(value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url')).join('.');
  return {access_token:token,refresh_token:`test-refresh-${id}`,token_type:'bearer',expires_in:expires,expires_at:exp,user:user(id)};
}
export async function browserServer() {
  const cluster=await nativePostgres(); await initialize(cluster.db);
  const requests=[];
  const controls={dropNext:null,failReads:false,holdNext:null,holds:[],originOffline:false,legacyWorker:false,missingBundle:false};
  const api=createServer(async(req,res)=>{
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Headers',req.headers['access-control-request-headers']||'authorization,apikey,content-type,x-client-info,x-supabase-api-version');
    res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
    res.setHeader('Cache-Control','no-store');
    if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
    const url=new URL(req.url,'http://localhost');
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
    let id;
    try {id=JSON.parse(Buffer.from((req.headers.authorization||'').split('.')[1]||'','base64url')).sub;}catch{}
    const record={path:url.pathname,body,userId:id};requests.push(record);
    const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
    if(url.pathname==='/auth/v1/token') {
      const target=url.searchParams.get('grant_type')==='refresh_token'?body.refresh_token?.replace('test-refresh-',''):body.email==='b@example.test'?B:A;
      return json(200,session(target));
    }
    if(url.pathname==='/auth/v1/user')return id?json(200,user(id)):json(401,{message:'Not authenticated'});
    if(url.pathname==='/auth/v1/logout'){res.writeHead(204);return res.end();}
    const name=url.pathname.split('/').at(-1),args=rpcArguments[name];
    if(!args)return json(404,{message:'No test endpoint'});
    if(![A,B].includes(id))return json(401,{message:'Not authenticated'});
    if(controls.failReads&&name==='get_gymlog_snapshot')return json(503,{message:'Injected read outage'});
    const client=await cluster.connect();
    try {
      await client.query('BEGIN; SET LOCAL ROLE authenticated');
      await client.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
      const params=args.map(key=>typeof body[key]==='object'?JSON.stringify(body[key]):body[key]);
      const sql=`select public.${name}(${args.map((arg,i)=>`${arg} => $${i+1}`).join(',')}) as result`;
      const result=(await client.query(sql,params)).rows[0].result;
      await client.query('COMMIT');record.result=result;
      if(controls.holdNext===name){controls.holdNext=null;await new Promise(resolve=>controls.holds.push(resolve));}
      if(controls.dropNext===name){req.socket.destroy();return;}
      return json(200,result);
    }catch(error){await client.query('ROLLBACK');record.error=error.message;json(400,{message:error.message,code:error.code});}
    finally{await client.end();}
  });
  const apiUrl=await listen(api);
  const outDir=await mkdtemp(join(tmpdir(),'gymlog-browser-dist-'));
  await build({logLevel:'error',define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(apiUrl),'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify('local-test-public-key')},build:{outDir,emptyOutDir:true}});
  const staticServer=createServer(async(req,res)=>{
    if(controls.originOffline){req.socket.destroy();return;}
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/sw.js'&&controls.legacyWorker){res.setHeader('Content-Type','text/javascript');res.setHeader('Cache-Control','no-store');return res.end(await readFile(new URL('../fixtures/legacy-worker.js',import.meta.url)));}
    if(path.startsWith('/assets/')&&controls.missingBundle){res.writeHead(503);return res.end();}
    if(path==='/test-blank.html'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><title>Test setup</title>');}
    if(path.startsWith('/rest/')||path.startsWith('/auth/')){res.setHeader('Content-Type','application/json');return res.end('{"network":true}');}
    const asset=resolve(outDir,'.'+decodeURIComponent(path));
    if(asset!==outDir&&!asset.startsWith(outDir+'/')){res.writeHead(403);return res.end();}
    const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
    try{const data=await readFile(path==='/'?join(outDir,'index.html'):asset);res.setHeader('Content-Type',types[extname(asset)]|| (path==='/'?'text/html':'application/octet-stream'));res.end(data);}
    catch{if(extname(path)){res.writeHead(404);res.end();}else{res.setHeader('Content-Type','text/html');res.end(await readFile(join(outDir,'index.html')));}}
  });
  const appUrl=await listen(staticServer);
  return {cluster,apiUrl,appUrl,requests,controls,session,
    storageKey:'sb-127-auth-token',
    async reset(){requests.length=0;controls.dropNext=null;controls.failReads=false;controls.holdNext=null;controls.originOffline=false;controls.legacyWorker=false;controls.missingBundle=false;controls.holds.splice(0).forEach(resolve=>resolve());await cluster.db.query('TRUNCATE public.workout_days,public.measurements,public.gymlog_sync_operations CASCADE');},
    async close(){controls.holds.splice(0).forEach(resolve=>resolve());await close(staticServer);await close(api);await cluster.close();await rm(outDir,{recursive:true,force:true});}
  };
}
