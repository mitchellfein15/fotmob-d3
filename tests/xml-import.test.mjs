import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {importXml} from '../lib/xml-import.mjs';
import {Store} from '../lib/store.mjs';
import {createApp} from '../server.mjs';
const wrap=rows=>'<file><ALL_INSTANCES>'+rows.join('')+'</ALL_INSTANCES></file>';
const row=(id,type,fields={},code=type,start=12,end=16)=>'<instance><ID>'+id+'</ID><start>'+start+'</start><end>'+end+'</end><code>'+code+'</code><label><text>'+type+'</text></label>'+Object.entries(fields).map(([k,v])=>'<label><text>'+v+'</text><group>'+k+'</group></label>').join('')+'</instance>';
const fields={fromPlayer:'9 A &amp; B',fromTeam:'Team A',outcome:'SUCCESSFUL',fromPosition:'Point(x=-1.5, y=2)',toPosition:'Point(x=3, y=4)',phase:'1'};
const fixture=()=>wrap([
 row(1,'pass',fields),
 row(2,'pass',fields,'Team A'),
 row(3,'pass',fields,'9 A &amp; B'),
 row(4,'pass',fields),
 row(5,'shot',{player:'10 Other',team:'Team B',outcome:'GOAL'}),
 row(6,'goal',{player:'10 Other',team:'Team B'}),
]);
test('action lanes exclude representations and exact duplicates without losing raw XML',()=>{
 const xml=fixture(),m=importXml(xml,'tags.xml');
 assert.deepEqual(m.counts,{instances:6,actionRows:4,representations:2,duplicateRows:1,events:3,participants:2});
 assert.equal(m.raw.xml,xml);
 const p=m.participants.find(p=>p.numberText==='9');
 assert.equal(p.name,'A & B');
 assert.equal(m.events[0].action.fromParticipant,p.id);
 assert.deepEqual(m.events[0].action.fromPosition,{x:-1.5,y:2});
 assert.deepEqual(m.events[0].sourceIds,['1','4']);
 assert.equal(m.totals.find(t=>t.team==='Team B').goals,1);
 assert.equal(m.totals.find(t=>t.team==='Team B').shots,1);
 assert.ok(m.contenders.every(t=>t.type==='unknown'));
});
test('content identity survives filename, source ID and row ordering changes; revisions stay separate',()=>{
 const a=importXml(fixture(),'one.xml');
 const b=importXml(fixture().replace('<ID>1</ID>','<ID>99</ID>'),'two.xml');
 assert.equal(a.gameId,b.gameId);
 const c=importXml(fixture().replace('SUCCESSFUL','UNSUCCESSFUL'));
 assert.notEqual(a.gameId,c.gameId);
});
test('same label under two teams stays separate and is reported',()=>{
 const m=importXml(wrap([row(1,'pass',{fromPlayer:'9 Same',fromTeam:'Team A'}),row(2,'pass',{fromPlayer:'9 Same',fromTeam:'Team B'})]));
 assert.equal(m.participants.length,2);assert.notEqual(m.participants[0].id,m.participants[1].id);
 assert.ok(m.warnings.some(w=>w.includes('both teams')));
});
test('malformed XML, DTDs, invalid clips, repeated IDs, orphan lanes and missing teams fail',()=>{
 for(const xml of ['<file>','<!DOCTYPE file SYSTEM "file:///private"><file/>',fixture().replace('</instance>',''),fixture().replace('<start>12</start>','<start>bad</start>'),fixture().replace('<ID>2</ID>','<ID>1</ID>'),fixture().replace('<code>Team A</code>','<code>Unknown</code>'),wrap([row(1,'pass',{fromTeam:'Team A'})])]) assert.throws(()=>importXml(xml));
});
test('different outcomes or clip ranges are not collapsed',()=>{
 const m=importXml(wrap([row(1,'pass',fields),row(2,'pass',{...fields,outcome:'UNSUCCESSFUL'}),row(3,'pass',fields,'pass',13,17),row(4,'shot',{team:'Team B'})]));
 assert.equal(m.events.length,4);assert.equal(m.counts.duplicateRows,0);
});
test('local HTTP import persists, reimports stay idempotent, failed imports preserve data and source downloads round-trip',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'matchroom-xml-'));
 const store=new Store(dir),app=createApp(store);app.listen(0,'127.0.0.1');await once(app,'listening');
 const base='http://127.0.0.1:'+app.address().port;
 const post=(xml,extra={})=>fetch(base+'/api/import',{method:'POST',headers:{'Content-Type':'application/json','X-Matchroom-Request':'1',...extra},body:JSON.stringify({xml,filename:'test.xml'})});
 try {
  assert.equal((await fetch(base+'/api/matches')).status,200);
  assert.equal((await post(fixture(),{Origin:'https://example.com'})).status,403);
  assert.equal((await post(fixture(),{'X-Matchroom-Request':'0'})).status,403);
  const response=await post(fixture());assert.equal(response.status,200);const m=await response.json();assert.equal(m.raw,undefined);
  assert.equal((await post(fixture())).status,200);assert.equal((await store.list()).length,1);
  const attached=await store.match(m.gameId);attached.boxScore={date:'2026-09-06'};attached.raw.boxScoreHtml='<html>saved official source</html>';await store.save(attached);
  assert.equal((await post(fixture())).status,200);const reimported=await store.match(m.gameId);assert.equal(reimported.boxScore.date,'2026-09-06');assert.equal(reimported.raw.boxScoreHtml,attached.raw.boxScoreHtml);
  assert.equal((await post('<bad/>')).status,400);assert.equal((await new Store(dir).match(m.gameId)).events.length,3);
  assert.equal(await (await fetch(base+'/api/matches/'+m.gameId+'/source')).text(),fixture());
  assert.equal((await fetch(base+'/api/connect',{method:'POST'})).status,404);
  assert.equal((await fetch(base+'/api/status')).status,404);
  assert.equal((await fetch(base+'/api/matches/not-an-id')).status,400);
  assert.equal((await fetch(base+'/')).status,200);
 } finally {await new Promise(resolve=>app.close(resolve));await rm(dir,{recursive:true,force:true});}
});
