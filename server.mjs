import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Store} from './lib/store.mjs';
import {gameId} from './lib/identity.mjs';
import {importXml} from './lib/xml-import.mjs';
import {fetchBoxScore,parseBoxScore,previewBoxScore,boxScoreUrl} from './lib/boxscore.mjs';
import {randomUUID} from 'node:crypto';
import {parseTrackerData} from './dist/tracker.js';
import {createAuth} from './lib/auth.mjs';
import {ratedPlayers} from './dist/ratings.js';
import {boundPosition} from './dist/pitch-layout.js';
import {validateTeamImage} from './lib/team-images.mjs';
const root=fileURLToPath(new URL('./dist/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
const summary=({raw,...match})=>match;
export function createApp(store=new Store(),{boxFetcher=fetchBoxScore,adminPassword=process.env.ADMIN_PASSWORD,authOptions}={}) {
 const drafts=new Map();
 const auth=createAuth(adminPassword,authOptions);
 return http.createServer(async(req,res)=>{
  const send=(status,body)=>res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify(body));
  try {
   const host=req.headers.host;
   if(!/^127\.0\.0\.1:\d+$/.test(host??'')){send(403,{error:'Use the 127.0.0.1 address printed by the server.'});return;}
   const url=new URL(req.url,`http://${host}`);
   if(url.pathname.startsWith('/api/')) {
    if(req.headers.origin&&req.headers.origin!==`http://${host}`){send(403,{error:'Cross-origin access denied.'});return;}
    if(req.method==='GET'&&url.pathname==='/api/auth'){send(200,{configured:auth.configured,authenticated:auth.authenticated(req)});return;}
    if(req.method==='POST'&&['/api/auth/login','/api/auth/logout'].includes(url.pathname)) {
     if(req.headers['x-matchroom-request']!=='1'||!req.headers['content-type']?.startsWith('application/json')){send(403,{error:'Use the app to sign in.'});return;}
     if(url.pathname.endsWith('/logout')){auth.logout(req,res);send(200,{authenticated:false});return;}
     const chunks=[];let size=0;
     for await(const chunk of req){size+=chunk.length;if(size>4096){send(413,{error:'Request too large.'});return;}chunks.push(chunk);}
     let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{send(400,{error:'Invalid sign-in request.'});return;}
     const {status,...result}=auth.login(req,res,body?.password);send(status,result);return;
    }
    // Fail closed for all write methods, including future API routes.
    if(!['GET','HEAD'].includes(req.method)&&!auth.authenticated(req)){send(401,{error:'Sign in as admin to make changes.'});return;}
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
    if(req.method==='POST'&&['/api/import','/api/tracker','/api/pitch','/api/team-image','/api/boxscore/preview','/api/boxscore/attach'].includes(url.pathname)) {
     if(req.headers['x-matchroom-request']!=='1'||!req.headers['content-type']?.startsWith('application/json')){send(403,{error:'Use the local app to import a match.'});return;}
     const chunks=[];let size=0;
     for await(const chunk of req){size+=chunk.length;if(size>25*1024*1024){send(413,{error:'Request too large. Use an XML export under 20 MB.'});return;}chunks.push(chunk);}
     let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{send(400,{error:'Invalid import request.'});return;}
     if(url.pathname==='/api/team-image') {
      const match=await store.match(gameId(body?.gameId));if(!match)throw Error('Load a saved match first.');
      const team=match.contenders.find(c=>c.id===body.teamId);if(!team)throw Error('Choose a team in this match.');
      const image=validateTeamImage(body.crestUrl);
      if(image)team.crestUrl=image;else {delete team.crestUrl;delete team.logoUrl;}
      await store.save(match);send(200,summary(match));return;
     }
     if(url.pathname==='/api/pitch') {
      const match=await store.match(gameId(body?.gameId));if(!match)throw Error('Load a saved match first.');
      if(!match.contenders.some(c=>c.id===body.teamId))throw Error('Choose a team in this match.');
      if(!body.positions||typeof body.positions!=='object'||Array.isArray(body.positions))throw Error('Invalid pitch positions.');
      const players=new Set(ratedPlayers(match,body.teamId).map(p=>p.id)),positions=Object.create(null);
      for(const [id,p] of Object.entries(body.positions)){
       if(!players.has(id)||!Number.isFinite(p?.x)||!Number.isFinite(p?.y))throw Error('Invalid player or pitch coordinates.');
       positions[id]=boundPosition(p.x,p.y);
      }
      match.pitchPositions??={};match.pitchPositions[body.teamId]=positions;
      await store.save(match);send(200,summary(match));return;
     }
     if(url.pathname==='/api/tracker') {
      const match=await store.match(gameId(body?.gameId));if(!match)throw Error('Load an XML match first.');
      if(!match.contenders.some(c=>c.id===body.teamId))throw Error('Choose a team in this match.');
      if(typeof body.tsv!=='string'||body.tsv.length>1024*1024)throw Error('Paste tracker data under 1 MB.');
      parseTrackerData(body.tsv);
      match.trackerData??={};
      if(body.tsv.trim())match.trackerData[body.teamId]=body.tsv;
      else delete match.trackerData[body.teamId];
      await store.save(match);send(200,summary(match));return;
     }
     if(url.pathname==='/api/boxscore/preview') {
      const match=await store.match(gameId(body?.gameId));if(!match)throw Error('Load an XML match first.');
      const source=body.html!==undefined?{html:body.html,url:boxScoreUrl(body.url)}:await boxFetcher(body.url);
      const box=parseBoxScore(source.html,source.url),preview=previewBoxScore(match,box,body.teamMapping);
      for(const [token,draft] of drafts)if(draft.expires<Date.now())drafts.delete(token);
      if(drafts.size>=5)drafts.delete(drafts.keys().next().value);
      const token=randomUUID();drafts.set(token,{gameId:match.gameId,importedAt:match.importedAt,box,html:source.html,expires:Date.now()+15*60*1000});
      send(200,{...preview,token});return;
     }
     if(url.pathname==='/api/boxscore/attach') {
      const draft=drafts.get(body?.token);
      if(!draft||draft.expires<Date.now())throw Error('Preview expired. Preview the box score again.');
      if(body.confirmed!==true)throw Error('Confirm the match date, opponents, and player mapping first.');
      const match=await store.match(gameId(draft.gameId));
      if(!match||match.importedAt!==draft.importedAt)throw Error('The XML match changed. Preview the box score again.');
      const reviewed=previewBoxScore(match,draft.box,body.teamMapping);
      if(reviewed.links.some(l=>l.status==='ambiguous'))throw Error('Ambiguous player identities must be resolved before attachment.');
      const previous=match.boxScore;
      match.raw??={};
      if(previous){match.raw.boxScoreHistory??=[];match.raw.boxScoreHistory.push({attachment:previous,html:match.raw.boxScoreHtml});}
      match.boxScore={...reviewed.boxScore,teamMapping:reviewed.teamMapping,links:reviewed.links,unmatchedXml:reviewed.unmatchedXml,comparisons:reviewed.comparisons,attachedAt:new Date().toISOString(),identityConfirmed:true};
      match.raw.boxScoreHtml=draft.html;
      await store.save(match);drafts.delete(body.token);
      send(200,summary(match));return;
     }
     const match=importXml(body?.xml,body?.filename);
     const previous=await store.match(match.gameId);
     for(const team of match.contenders){const saved=previous?.contenders.find(c=>c.id===team.id);if(saved?.crestUrl)team.crestUrl=saved.crestUrl;}
     if(previous?.pitchPositions)match.pitchPositions=previous.pitchPositions;
     if(previous?.trackerData)match.trackerData=previous.trackerData;
     if(previous?.boxScore){match.boxScore=previous.boxScore;for(const k of ['boxScoreHtml','boxScoreHistory'])if(previous.raw?.[k])match.raw[k]=previous.raw[k];}
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
   res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data: https:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'"}).end(req.method==='HEAD'?undefined:data);
  }catch(e){send(e.code==='ENOENT'?404:400,{error:e.code==='ENOENT'?'Not found':e.message});}
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const port=Number(process.env.PORT||4173);
 createApp().listen(port,'127.0.0.1',()=>console.log(`D3 Matchroom: http://127.0.0.1:${port}`));
}

