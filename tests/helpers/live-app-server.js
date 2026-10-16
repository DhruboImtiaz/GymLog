import {createServer} from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,extname} from 'node:path';
import {build} from 'vite';

// Serves the production build only. Auth and RPC requests go to managed Supabase.
export async function liveAppServer(config){
  if(process.env.GYMLOG_DEPLOYED_URL){
    const url=new URL(process.env.GYMLOG_DEPLOYED_URL);
    if(url.protocol!=='https:'||!['gymlog7.netlify.app','deploy-preview-1--gymlog7.netlify.app'].includes(url.hostname)||url.pathname!=='/'||url.search||url.hash||url.username||url.password)throw new Error('Use the reviewed GymLog production or release-preview origin.');
    return {url:url.origin,async close(){}};
  }
  const dir=await mkdtemp(join(tmpdir(),'gymlog-live-frontend-'));
  await build({logLevel:'error',define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(config.url),'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify(config.key)},build:{outDir:dir,emptyOutDir:true}});
  const controls={offline:false};
  const server=createServer(async(req,res)=>{
    if(controls.offline){req.socket.destroy();return;}
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/test-blank.html'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><title>Setup</title>');}
    const filename=resolve(dir,'.'+decodeURIComponent(path));
    if(filename!==dir&&!filename.startsWith(dir+'/')){res.writeHead(403);return res.end();}
    const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json'};
    try{const body=await readFile(path==='/'?join(dir,'index.html'):filename);res.setHeader('Content-Type',types[extname(filename)]||(path==='/'?'text/html':'application/octet-stream'));res.end(body);}
    catch{if(extname(path)){res.writeHead(404);res.end();}else{res.setHeader('Content-Type','text/html');res.end(await readFile(join(dir,'index.html')));}}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {url:`http://127.0.0.1:${server.address().port}`,controls,async close(){await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});await rm(dir,{recursive:true,force:true});}};
}
