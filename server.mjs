import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SyncService} from './lib/sync.mjs';
import {gameId} from './lib/spiideo.mjs';
const root=path.resolve('dist');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};
export function createApp(service){return http.createServer(async(req,res)=>{
 const send=(status,body)=>res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify(body));
 try{
  const host=req.headers.host;
  if(!/^127\.0\.0\.1:\d+$/.test(host??'')){send(403,{error:'Use the 127.0.0.1 address printed by the server.'});return;}
  const url=new URL(req.url,`http://${host}`);
  if(url.pathname.startsWith('/api/')){
   if(req.headers.origin && req.headers.origin!==`http://${host}`){send(403,{error:'Cross-origin access denied.'});return;}
   if(req.method==='POST' && (req.headers['x-matchroom-request']!=='1'||!req.headers['content-type']?.startsWith('application/json'))){send(403,{error:'Use the local app to make changes.'});return;}
   let body={};if(req.method==='POST'){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>70000){send(413,{error:'Request too large.'});return;}}try{body=JSON.parse(raw);}catch{send(400,{error:'Invalid JSON.'});return;}}
   if(req.method==='GET'&&url.pathname==='/api/status'){send(200,service.status());return;}
   if(req.method==='GET'&&url.pathname==='/api/matches'){send(200,await service.store.list());return;}
   if(req.method==='GET'&&url.pathname.startsWith('/api/matches/')){const id=gameId(url.pathname.split('/')[3]);const match=await service.store.match(id);if(!match){send(404,{error:'Match has not been synced yet.'});return;}const {raw,...summary}=match;send(200,summary);return;}
   if(req.method==='POST'&&url.pathname==='/api/connect'){send(200,await service.connect(body.credential));return;}
   if(req.method==='POST'&&url.pathname==='/api/disconnect'){send(200,service.disconnect());return;}
   if(req.method==='POST'&&url.pathname==='/api/settings'){send(200,await service.configure(body));return;}
   if(req.method==='POST'&&url.pathname==='/api/sync'){
    if(service.running){send(409,{error:'A sync is already running.'});return;}
    if(!service.headers){send(400,{error:'Connect Spiideo first.'});return;}
    if(body.gameId)gameId(body.gameId);
    void service.sync(body.gameId).catch(()=>{});send(202,service.status());return;
   }
   send(404,{error:'Unknown API route.'});return;
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){send(405,{error:'Method not allowed.'});return;}
  const name=decodeURIComponent(url.pathname);const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
  if(!file.startsWith(root+path.sep)){send(403,{error:'Forbidden.'});return;}
  const data=await readFile(file);
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'"}).end(req.method==='HEAD'?undefined:data);
 }catch(e){send(e.code==='ENOENT'?404:400,{error:e.code==='ENOENT'?'Not found':e.message});}
});}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const service=new SyncService();await service.init();
 createApp(service).listen(4173,'127.0.0.1',()=>console.log('D3 Matchroom: http://127.0.0.1:4173'));
}
