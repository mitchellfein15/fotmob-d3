import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {once} from 'node:events';
import {parseBoxScore,previewBoxScore,fetchBoxScore,boxScoreUrl} from '../lib/boxscore.mjs';
import {Store} from '../lib/store.mjs';
import {createApp} from '../server.mjs';
const url='https://athletics.case.edu/boxscore.aspx?id=9897&path=msoc';
const html=readFileSync(new URL('./fixtures/boxscore-9897.html',import.meta.url),'utf8');
function xmlMatch(b) {
 return {gameId:'11111111-1111-1111-1111-111111111111',importedAt:'2026-09-12T00:00:00Z',contenders:[{id:'a',teamName:'Case Western Reserve University'},{id:'b',teamName:'College of Wooster'}],participants:b.players.map(p=>({id:'xml-'+p.id,contenderId:p.teamKey==='CWRU'?'a':'b',name:p.name,numberText:p.name==='Louis Markin'?'99':p.jersey,type:'player'})),events:[{id:'shot',action:{type:'shot',contender:'a'}}],raw:{xml:'original'}};
}
test('actual SIDEARM fixture extracts both rosters, all periods and one copy of each substitution',()=>{
 const b=parseBoxScore(html,url);
 assert.equal(b.date,'2026-09-06');assert.equal(b.players.length,52);assert.equal(b.substitutions.length,60);assert.equal(b.timingComplete,true);
 assert.deepEqual(b.teams.map(t=>t.totals.shots),[17,8]);
 for(const t of b.teams) {
  assert.equal(b.players.filter(p=>p.teamKey===t.key&&p.starter).length,11);
  assert.equal(b.players.filter(p=>p.teamKey===t.key).reduce((sum,p)=>sum+p.derivedSeconds,0),11*5400);
 }
 const shedd=b.players.find(p=>p.name==='Carter Shedd'),markin=b.players.find(p=>p.name==='Louis Markin');
 assert.equal(shedd.derivedSeconds,4982);assert.equal(shedd.publishedMinutes,84);assert.equal(markin.derivedSeconds,418);assert.equal(markin.jersey,'00');
 const kamiya=b.players.find(p=>p.name==='Ohta Kamiya');assert.equal(kamiya.stints.length,2);assert.ok(b.substitutions.some(s=>s.coveredByPeriodLineup));
 assert.ok(b.warnings.some(w=>w.includes('Philip Vlastaris')));
});
test('missing boundary or inconsistent substitution withholds reconstructed time',()=>{
 const missing=parseBoxScore(html.replace('End of period [90:00].','Missing boundary').replace('End of period [90:00].','Missing boundary'),url);
 assert.equal(missing.timingComplete,false);assert.ok(missing.players.every(p=>p.derivedSeconds===null));
 const broken=parseBoxScore(html.replaceAll('Kamiya, Ohta for Miranda, Leo.','Kamiya, Ohta for Unknown, Person.'),url);
 assert.equal(broken.timingComplete,false);assert.ok(broken.warnings.some(w=>w.includes('inconsistent substitution')));
 const dismissal=parseBoxScore(html.replaceAll('Yellow card on CWRU Wilson, Sean.','Red card on CWRU Wilson, Sean.'),url);
 assert.equal(dismissal.timingComplete,false);assert.ok(dismissal.players.every(p=>p.derivedSeconds===null));
});
test('name and team matching flags jersey differences and same-name players under the wrong XML team',()=>{
 const b=parseBoxScore(html,url),m=xmlMatch(b),eby=m.participants.find(p=>p.name==='Alex Eby');
 m.participants.push({...eby,id:'wrong-team',contenderId:'b'});
 const preview=previewBoxScore(m,b);
 assert.deepEqual(preview.teamMapping,{CWRU:'a',WOO:'b'});
 assert.equal(preview.links.find(l=>l.name==='Louis Markin').status,'jersey-difference');
 assert.deepEqual(preview.unmatchedXml.map(p=>p.id),['wrong-team']);
 assert.equal(preview.comparisons[0].xml.shots,1);assert.equal(preview.comparisons[0].official.shots,17);
 assert.throws(()=>previewBoxScore(m,b,{CWRU:'a',WOO:'a'}));
});
test('source fetch restricts destinations and rejects redirects and oversized responses',async()=>{
 for(const bad of ['http://athletics.case.edu/boxscore.aspx?id=9897&path=msoc','https://127.0.0.1/boxscore.aspx?id=1&path=msoc','https://athletics.case.edu.evil.test/boxscore.aspx?id=1&path=msoc','https://user:pass@athletics.case.edu/boxscore.aspx?id=1&path=msoc','https://athletics.case.edu/other?id=1&path=msoc'])assert.throws(()=>boxScoreUrl(bad));
 await assert.rejects(fetchBoxScore(url,{fetcher:async(u,o)=>{assert.equal(o.redirect,'manual');return new Response('',{status:302,headers:{Location:'http://127.0.0.1'}});}}),/302/);
 await assert.rejects(fetchBoxScore(url,{fetcher:async()=>new Response('x'.repeat(8*1024*1024+1),{headers:{'Content-Type':'text/html'}})}),/8 MB/);
 assert.throws(()=>parseBoxScore('<html>unrelated</html>',url),/two SIDEARM/);
});
test('preview never writes; confirmed attachment persists separate official records and guards stale previews',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'matchroom-boxscore-'));
 assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));
 const store=new Store(dir),m=xmlMatch(parseBoxScore(html,url));await store.save(m);
 const app=createApp(store,{boxFetcher:async()=>({html,url})});app.listen(0,'127.0.0.1');await once(app,'listening');
 const base='http://127.0.0.1:'+app.address().port;
 const post=(route,body,extra={})=>fetch(base+'/api/boxscore/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Matchroom-Request':'1',...extra},body:JSON.stringify(body)});
 try {
  assert.equal((await post('preview',{gameId:m.gameId,url},{Origin:'https://example.com'})).status,403);
  const response=await post('preview',{gameId:m.gameId,url});assert.equal(response.status,200);const draft=await response.json();
  assert.equal((await store.match(m.gameId)).boxScore,undefined);
  assert.equal((await post('attach',{token:draft.token,confirmed:false})).status,400);
  assert.equal((await post('attach',{token:draft.token,confirmed:true,teamMapping:draft.teamMapping})).status,200);
  const saved=await new Store(dir).match(m.gameId);assert.equal(saved.boxScore.players.length,52);assert.equal(saved.raw.xml,'original');assert.equal(saved.raw.boxScoreHtml,html);assert.deepEqual(saved.events,m.events);
  const offlineResponse=await post('preview',{gameId:m.gameId,url,html});assert.equal(offlineResponse.status,200);
  const offline=await offlineResponse.json();assert.equal((await post('attach',{token:offline.token,confirmed:true,teamMapping:offline.teamMapping})).status,200);
  const revised=await store.match(m.gameId);assert.equal(revised.raw.boxScoreHistory.length,1);assert.equal(revised.raw.boxScoreHistory[0].html,html);
  assert.equal((await post('attach',{token:draft.token,confirmed:true})).status,400);
  const stale=await (await post('preview',{gameId:m.gameId,url})).json();saved.importedAt='changed';await store.save(saved);
  assert.equal((await post('attach',{token:stale.token,confirmed:true})).status,400);
 }finally{await new Promise(resolve=>app.close(resolve));await rm(dir,{recursive:true,force:true});}
});
