import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {SpiideoClient,credentials,apiUrl} from '../lib/spiideo.mjs';
import {Store} from '../lib/store.mjs';
import {SyncService} from '../lib/sync.mjs';
import {createApp} from '../server.mjs';
const id='f840de60-f2a1-47cb-91fd-0147d1a48e46';
const home='0d35c2f3-660a-46dc-85a7-611da2f2ce3a',away='88923497-e646-4d4c-92fa-f4bc93aa3d84';
const ok=x=>new Response(JSON.stringify(x),{status:200});
test('pagination begins at page one, encodes cursors, and deduplicates revisions',async()=>{
 const urls=[];const client=new SpiideoClient({}, {sleep:async()=>{},fetcher:async u=>{urls.push(new URL(u));return urls.length===1?ok({content:[{id:'x',timeModified:1}],nextParameters:{nextToken:'a+/='}}):ok({content:[{id:'x',timeModified:2},{id:'y'}]});}});
 const result=await client.pages('/v2/games?pageSize=250&nextToken=stale','test');assert.equal(urls[0].searchParams.has('nextToken'),false);assert.equal(urls[1].searchParams.get('nextToken'),'a+/=');assert.equal(result.records.length,2);assert.equal(result.records[0].timeModified,2);
});
test('pagination rejects repeated cursors and unfamiliar response shapes',async()=>{
 const c=new SpiideoClient({}, {sleep:async()=>{},fetcher:async()=>ok({content:[],nextParameters:{nextToken:'same'}})});await assert.rejects(c.pages('/v2/games','test'),/repeated/);
 const d=new SpiideoClient({}, {fetcher:async()=>ok({other:[]})});await assert.rejects(d.pages('/v2/games','test'),/content array/);
});
test('rate limit retry and expired authorization are handled without leaking upstream text',async()=>{
 const waits=[];let n=0;const c=new SpiideoClient({}, {sleep:async ms=>waits.push(ms),fetcher:async()=>++n===1?new Response('',{status:429,headers:{'Retry-After':'2'}}):ok({content:[]})});await c.pages('/v2/games','test');assert.deepEqual(waits,[2000]);
 const d=new SpiideoClient({}, {fetcher:async()=>new Response('SECRET',{status:401})});await assert.rejects(d.json('/v2/games'),e=>e.auth&&!e.message.includes('SECRET'));
});
test('never forward authentication to foreign hosts and never execute cURL',()=>{
 assert.throws(()=>apiUrl('https://example.com/v2/games'));assert.throws(()=>apiUrl('https://api.spiideo.net.evil.test/v2/games'));
 assert.deepEqual(credentials("curl 'https://api.spiideo.net/v2/games' -H 'authorization: Bearer demo' -H 'user-agent: ignored'"),{authorization:'Bearer demo','user-agent':'ignored'});
 assert.throws(()=>credentials("curl 'https://api.spiideo.net/v2/games'"));
});
test('full match imports both roster pages and all tag pages while retaining non-action tags',async()=>{
 const requests=[];
 const c=new SpiideoClient({}, {sleep:async()=>{},fetcher:async input=>{const u=new URL(input);requests.push(u);
  if(u.pathname.endsWith('/contenders'))return ok({content:[{id:home,gameId:id,type:'home'},{id:away,gameId:id,type:'away'}]});
  if(u.pathname.includes('/participants')){assert.deepEqual(u.searchParams.getAll('type'),['player','coach']);const cid=u.pathname.split('/')[3];return ok({content:[{id:cid+'-player',contenderId:cid}]});}
  if(u.pathname.endsWith('/tags'))return u.searchParams.has('nextToken')?ok({content:[{id:'b',gameId:id}]}):ok({content:[{id:'a',gameId:id,timestamp:1,action:{type:'pass'}}],nextParameters:{nextToken:'two'}});
  return ok({id});
 }});
 const m=await c.match(id);assert.equal(m.events.length,1);assert.equal(m.participants.length,2);assert.equal(m.counts.tags,2);assert.equal(m.raw.tags.length,2);assert.equal(m.processingVerified,false);
});
test('failed refresh preserves previous snapshot, successful refresh reconciles removed records',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'d3-test-'));try{
 const store=new Store(dir);await store.save({gameId:id,events:[{id:'old'}]});
 const service=new SyncService(store,()=>({match:async()=>{throw Error('page failed');}}));service.connect('Bearer test');await service.sync(id);assert.equal((await store.match(id)).events[0].id,'old');assert.match(service.lastError,/page failed/);
 service.clientFactory=()=>({match:async()=>({gameId:id,events:[]})});await service.sync(id);assert.equal((await store.match(id)).events.length,0);
 }finally{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'d3-test-'));await rm(dir,{recursive:true,force:true});}
});
test('local API rejects cross-origin credential changes, does not expose raw snapshots or credentials',async()=>{
 const fake={status:()=>({connected:true}),store:{match:async()=>({gameId:id,events:[],raw:{secret:'raw'}})},connect:()=>{throw Error('should not run');}};
 const server=createApp(fake);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const base=`http://127.0.0.1:${server.address().port}`;
 const blocked=await fetch(base+'/api/connect',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json','X-Matchroom-Request':'1'},body:'{}'});assert.equal(blocked.status,403);
 const response=await fetch(base+'/api/matches/'+id);assert.equal(response.status,200);assert.equal((await response.json()).raw,undefined);
 const missing=await fetch(base+'/api/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(missing.status,403);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('custom session headers and browser context survive a copied request',()=>{
 const headers=credentials(`curl 'https://api.spiideo.net/v2/games/${id}/tags?pageSize=250' \\\n -H 'x-auth-token: private-test-value' \\\n -H 'x-organization-id: org-test' \\\n -H 'origin: https://app.spiideo.net' \\\n -H 'referer: https://app.spiideo.net/' \\\n -H 'sec-fetch-site: same-site' \\\n -b 'session=example'`);
 assert.equal(headers['x-auth-token'],'private-test-value');assert.equal(headers['x-organization-id'],'org-test');assert.equal(headers.origin,'https://app.spiideo.net');assert.equal(headers.cookie,'session=example');assert.equal(headers['sec-fetch-site'],undefined);
 const cmd=credentials(`curl.exe "https://api.spiideo.net/v2/games/${id}/tags" ^\r\n -H "authorization: Bearer cmd-test"`);assert.equal(cmd.authorization,'Bearer cmd-test');
});
test('connect probes the original copied URL, reports safe diagnostics, and detects its game ID',async()=>{
 let called;const service=new SyncService({},h=>({json:async url=>{called=url;assert.equal(h['x-auth-token'],'private-test-value');return {content:[]};}}));
 const status=await service.connect(`curl 'https://api.spiideo.net/v2/games/${id}/tags?nextToken=opaque' -H 'x-auth-token: private-test-value'`);
 assert.ok(called.endsWith('?nextToken=opaque'));assert.equal(status.running,false);assert.equal(status.connectionInfo.verified,true);assert.equal(status.connectionInfo.sourceGameId,id);assert.equal(JSON.stringify(status).includes('private-test-value'),false);assert.equal(JSON.stringify(status).includes('opaque'),false);
});
test('optional metadata 403 does not discard successfully fetched tags and rosters',async()=>{
 const c=new SpiideoClient({}, {sleep:async()=>{},fetcher:async input=>{const u=new URL(input);
  if(u.pathname.endsWith('/contenders'))return ok({content:[{id:home,gameId:id,type:'home'},{id:away,gameId:id,type:'away'}]});
  if(u.pathname.includes('/participants'))return ok({content:[]});
  if(u.pathname.endsWith('/tags'))return ok({content:[{id:'event',gameId:id,timestamp:1,action:{type:'pass'}}]});
  return new Response('do not expose',{status:403});
 }});
 const result=await c.match(id);assert.equal(result.events.length,1);assert.equal(result.metadata,null);assert.ok(result.warnings.some(w=>w.includes('403')));
});
test('required endpoint denial pauses schedules without erasing the loaded session',async()=>{
 const service=new SyncService({},()=>({match:async()=>{const e=Error('HTTP 403 for contenders');e.auth=true;throw e;}}));await service.connect('Bearer keep-in-memory');const result=await service.sync(id);assert.equal(result.connected,true);assert.equal(result.needsAttention,true);assert.match(result.lastError,/contenders/);assert.equal(JSON.stringify(result).includes('keep-in-memory'),false);
});

test('sandbox permission errors fail immediately with a local-network explanation',async()=>{
 let attempts=0;const c=new SpiideoClient({}, {sleep:async()=>{throw Error('should not retry');},fetcher:async()=>{attempts++;throw new TypeError('fetch failed',{cause:{code:'EACCES'}});}});
 await assert.rejects(c.json('/v2/games'),/Local network permission blocked/);assert.equal(attempts,1);
});
test('redirect responses are reported without forwarding credentials to a new host',async()=>{
 let attempts=0;const c=new SpiideoClient({authorization:'Bearer private'}, {fetcher:async(url,options)=>{attempts++;assert.equal(options.redirect,'manual');return new Response('',{status:302,headers:{location:'https://other.example/'}});}});
 await assert.rejects(c.json('/v2/games'),/redirected GET/);assert.equal(attempts,1);
});
