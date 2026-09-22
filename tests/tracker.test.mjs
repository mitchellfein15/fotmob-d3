import {login,TEST_PASSWORD} from './helpers/auth.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {once} from 'node:events';
import {parseTrackerData,nameKey,ratedPlayers} from '../dist/ratings.js';
import {importXml} from '../lib/xml-import.mjs';
import {createApp} from '../server.mjs';

const sample=readFileSync(new URL('./fixtures/tracker.tsv',import.meta.url),'utf8');
const header=sample.split('\n')[0];
const tsv=(values=['8','60','1,000','40','200','5','9'])=>header+'\n\tAlex Eby\t'+values.join('\t');
function match(){return {
 contenders:[{id:'a',teamName:'A'},{id:'b',teamName:'B'}],
 participants:[{id:'p',name:'Alex Eby',type:'player',contenderId:'a'},{id:'q',name:'Alex Eby',type:'player',contenderId:'b'}],
 events:[{action:{type:'pass',fromParticipant:'p',outcome:'successful'}},{action:{type:'pass',fromParticipant:'q',outcome:'successful'}}],
 trackerData:{a:tsv()}
};}

test('full tracker sample, CRLF, blank lines, name keys and comma-separated numbers',()=>{
 const parsed=parseTrackerData('\uFEFF\r\n'+sample.replaceAll('\n','\r\n\r\n'));
 assert.equal(parsed.size,24);
 assert.equal(nameKey(' Alex Eby #37 '),'alexeby');
 assert.deepEqual(parsed.get('cormacapostolides'),{name:'Cormac Apostolides',totalDistance:9.12,averageWorkRate:72.9,hardRunning:1274,hardRunningEfforts:64,sprinting:312,sprintEfforts:12,topSpeed:8.9});
 assert.equal(parseTrackerData(' \r\n').size,0);
 const reordered=tsv().split('\n').map(line=>line.split('\t').reverse().join('\t')).join('\n');
 assert.equal(parseTrackerData(reordered).get('alexeby').hardRunning,1000);
});

test('invalid headers, rows, duplicate normalized names and invalid numeric values fail clearly',()=>{
 for(const bad of [tsv().replace('Name','Player'),tsv()+'\n\tAlex-Eby\t8\t60\t1000\t40\t200\t5\t9',tsv().replace('1,000','1,00'),tsv().replace('1,000','1000m'),tsv().replace('1,000','-1'),tsv().replace('\t40\t','\t1.5\t'),tsv()+'\t',tsv().replace('Alex Eby','')])assert.throws(()=>parseTrackerData(bad));
 assert.throws(()=>parseTrackerData(null));
 assert.equal(parseTrackerData(tsv(['','','','','','',''])).get('alexeby').totalDistance,null);
});

test('tracker contributions merge without mutation and stay isolated to the selected team',()=>{
 const m=match(),before=JSON.stringify(m),p=ratedPlayers(m,'a')[0];
 const points=Object.fromEntries(p.contributions.map(c=>[c.label,c.points]));
 assert.equal(p.physicalStats.hardRunning,1000);
 assert.equal(points['Work rate bonus'],.1);assert.equal(points['Distance covered'],.16);
 assert.ok(Math.abs(points['High-intensity running']-.3)<1e-12);assert.equal(p.rating,6.6);
 assert.equal(ratedPlayers(m,'b')[0].physicalStats,null);assert.equal(ratedPlayers(m,'b')[0].rating,6);
 assert.equal(JSON.stringify(m),before);
 m.trackerData.a=tsv(['8','40','1000','40','200','5','9']);
 assert.ok(!ratedPlayers(m,'a')[0].contributions.some(c=>c.label==='Work rate bonus'));
 m.trackerData.a=tsv(['','','','','','','']);assert.equal(ratedPlayers(m,'a')[0].rating,6);
 m.trackerData.a=tsv().replace('Alex Eby','Unmatched Player');assert.equal(ratedPlayers(m,'a')[0].physicalStats,null);
});

test('tracker caps, final rating bound, official-only players and ambiguous names',()=>{
 const m=match();m.trackerData.a=tsv(['100','500','10000','100','10000','100','15']);
 const points=Object.fromEntries(ratedPlayers(m,'a')[0].contributions.map(c=>[c.label,c.points]));
 assert.equal(points['Work rate bonus'],.4);assert.equal(points['Distance covered'],.3);assert.equal(points['High-intensity running'],.4);
 m.events.push(...Array.from({length:10},()=>({action:{type:'goal',participant:'p'}})));
 assert.equal(ratedPlayers(m,'a')[0].rating,10);
 m.participants.push({...m.participants[0],id:'duplicate'});
 assert.ok(ratedPlayers(m,'a').every(p=>p.physicalStats===null));
 m.boxScore={players:[{id:'o',name:'Alex Eby',teamKey:'A',stats:{},publishedMinutes:90}],links:[],teamMapping:{A:'a'}};
 const official=ratedPlayers(m,'a')[0];assert.equal(official.id,'official:o');assert.equal(official.physicalStats.totalDistance,100);
 m.boxScore.players[0].publishedMinutes=0;assert.equal(ratedPlayers(m,'a')[0].rating,null);
});

test('tracker API validates, saves, reloads, preserves on XML reimport and clears by team',async()=>{
 const xml='<file><ALL_INSTANCES>'+['A','B'].map((team,i)=>`<instance><ID>${i}</ID><start>1</start><end>2</end><code>pass</code><label><text>pass</text></label><label><text>${team}</text><group>fromTeam</group></label><label><text>Alex Eby</text><group>fromPlayer</group></label></instance>`).join('')+'</ALL_INSTANCES></file>';
 let saved=importXml(xml);
 const store={match:async id=>id===saved.gameId?structuredClone(saved):null,save:async m=>{saved=structuredClone(m);}};
 const app=createApp(store,{adminPassword:TEST_PASSWORD});app.listen(0,'127.0.0.1');await once(app,'listening');
 const base='http://127.0.0.1:'+app.address().port,teamId=saved.contenders[0].id;
 const cookie=await login(base);
 const post=(route,body)=>fetch(base+'/api/'+route,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-Matchroom-Request':'1'},body:JSON.stringify(body)});
 const body={gameId:saved.gameId,teamId,tsv:sample};
 try {
  assert.equal((await post('tracker',body)).status,200);
  const loaded=await (await fetch(base+'/api/matches/'+saved.gameId)).json();assert.equal(loaded.trackerData[teamId],sample);
  const secondTeam=saved.contenders[1].id,secondSample=sample.replace('Alex Eby','Second Team Player');
  assert.equal((await post('tracker',{...body,teamId:secondTeam,tsv:secondSample})).status,200);
  const both=await (await fetch(base+'/api/matches/'+saved.gameId)).json();
  assert.equal(both.trackerData[teamId],sample);
  assert.equal(both.trackerData[secondTeam],secondSample);
  assert.equal((await post('tracker',{...body,tsv:'invalid'})).status,400);assert.equal(saved.trackerData[teamId],sample);
  assert.equal((await post('tracker',{...body,teamId:'other'})).status,400);
  assert.equal((await post('import',{xml})).status,200);assert.equal(saved.trackerData[teamId],sample);
  assert.equal((await post('tracker',{...body,tsv:''})).status,200);assert.equal(saved.trackerData[teamId],undefined);
  assert.equal(saved.trackerData[secondTeam],secondSample);
 } finally {await new Promise(resolve=>app.close(resolve));}
});
