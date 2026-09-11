import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Store} from './lib/store.mjs';
import {gameId} from './lib/identity.mjs';
import {importXml} from './lib/xml-import.mjs';
const root=fileURLToPath(new URL('./dist/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const summary=({raw,...match})=>match;
export function createApp(store=new Store()) {
 return http.createServer(async(req,res)=>{
  const send=(status,body)=>res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify(body));
  try {
   const host=req.headers.host;
   if(!/^127\.0\.0\.1:\d+$/.test(host??'')){send(403,{error:'Use the 127.0.0.1 address printed by the server.'});return;}
   const url=new URL(req.url,`http://${host}`);
   if(url.pathname.startsWith('/api/')) {
    if(req.headers.origin&&req.headers.origin!==`http://${host}`){send(403,{error:'Cross-origin access denied.'});return;}
    if(req.method==='GET'&&url.pathname==='/api/matches'){send(200,await store.list());return;}
    const matchRoute=url.pathname.match(/^\/api\/matches\/([^/]+)(\/source)?$/);
    if(req.method==='GET'&&matchRoute) {
     const match=await store.match(gameId(matchRoute[1]));
     if(!match){send(404,{error:'Saved match not found.'});return;}
     if(matchRoute[2]) {
      if(!match.raw?.xml){send(404,{error:'No original XML is available for this match.'});return;}
      res.writeHead(200,{'Content-Type':'application/xml; charset=utf-8','Content-Disposition':`attachment; filename="match-${match.gameId}.xml"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(match.raw.xml);return;
     }
     send(200,summary(match));return;
    }
    if(req.method==='POST'&&url.pathname==='/api/import') {
     if(req.headers['x-matchroom-request']!=='1'||!req.headers['content-type']?.startsWith('application/json')){send(403,{error:'Use the local app to import a match.'});return;}
     const chunks=[];let size=0;
     for await(const chunk of req){size+=chunk.length;if(size>25*1024*1024){send(413,{error:'Request too large. Use an XML export under 20 MB.'});return;}chunks.push(chunk);}
     let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{send(400,{error:'Invalid import request.'});return;}
     const match=importXml(body?.xml,body?.filename);
     await store.save(match);
     send(200,summary(match));return;
    }
    send(404,{error:'Unknown API route.'});return;
   }
   if(req.method!=='GET'&&req.method!=='HEAD'){send(405,{error:'Method not allowed.'});return;}
   const name=decodeURIComponent(url.pathname);
   const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
   if(!file.startsWith(path.resolve(root)+path.sep)){send(403,{error:'Forbidden.'});return;}
   const data=await readFile(file);
   res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'"}).end(req.method==='HEAD'?undefined:data);
  }catch(e){send(e.code==='ENOENT'?404:400,{error:e.code==='ENOENT'?'Not found':e.message});}
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const port=Number(process.env.PORT||4173);
 createApp().listen(port,'127.0.0.1',()=>console.log(`D3 Matchroom: http://127.0.0.1:${port}`));
}
