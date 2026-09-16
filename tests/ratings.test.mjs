import test from 'node:test';
import assert from 'node:assert/strict';
import {ratedPlayers,teamStatistics} from '../dist/ratings.js';
import {previewBoxScore} from '../lib/boxscore.mjs';
function fixture(){
 const official={id:'o',name:'Alex Eby',teamKey:'C',position:'DEF',stats:{shots:3,goals:1,assists:1},derivedSeconds:300,publishedMinutes:5};
 return {contenders:[{id:'c',teamName:'CWRU'},{id:'w',teamName:'College of Wooster'}],participants:[{id:'p',name:'Alex Eby',type:'player',contenderId:'c'},{id:'bad',name:'Alex Eby',type:'player',contenderId:'w'}],events:[{action:{type:'shot',participant:'p',contender:'c'}},{action:{type:'goal',participant:'p',contender:'c'}},{action:{type:'pass',fromParticipant:'bad',fromContender:'w',outcome:'successful'}}],boxScore:{players:[official],links:[{officialId:'o',participantId:'p'}],teamMapping:{C:'c'},comparisons:[{teamKey:'C',official:{shots:17,goals:1}}]}};
}

test('official roster eligibility works across teams, names, jersey differences and ambiguous XML identities',()=>{
 const official=(id,name,teamKey)=>({id,name,teamKey,jersey:'9',stats:{},publishedMinutes:90});
 const player=(id,name,contenderId)=>({id,name,contenderId,type:'player',numberText:'99'});
 const m={contenders:[{id:'a',teamName:'North'},{id:'b',teamName:'South'}],participants:[
  player('valid','Garcia, Jose','a'),player('wrong','José García','b'),
  player('unknown','Unlisted Player','a'),player('duplicate1','Sam Lee','a'),player('duplicate2','Sam Lee','a'),
  player('south','Morgan Park','b')
 ],events:['valid','wrong','unknown','duplicate1','duplicate2','south'].map(id=>({action:{type:'pass',fromParticipant:id,outcome:'successful'}}))};
 const box={teams:[{key:'N',totals:{}},{key:'S',totals:{}}],players:[
  official('jose','José García','N'),official('sam','Sam Lee','N'),official('morgan','Morgan Park','S'),official('only','Taylor Smith','N')
 ]};
 const preview=previewBoxScore(m,box,{N:'a',S:'b'});
 m.boxScore={...box,...preview,boxScore:undefined};
 const before=JSON.stringify(m);
 const north=ratedPlayers(m,'a'),south=ratedPlayers(m,'b');
 assert.deepEqual(new Set(north.map(p=>p.id)),new Set(['valid','official:sam','official:only']));
 assert.deepEqual(south.map(p=>p.id),['south']);
 assert.equal(north.find(p=>p.id==='valid').passes,1);
 assert.equal(north.find(p=>p.id==='official:sam').passes,0);
 assert.equal(preview.links.find(l=>l.participantId==='valid').status,'jersey-difference');
 assert.equal(preview.links.find(l=>l.officialId==='sam').status,'ambiguous');
 assert.deepEqual(new Set(preview.unmatchedXml.map(p=>p.id)),new Set(['wrong','unknown','duplicate1','duplicate2']));
 assert.equal(JSON.stringify(m),before);
 // A mismapped link must not let a wrong-team identity into the ratings.
 m.boxScore.links.push({officialId:'jose',participantId:'wrong'});
 assert.deepEqual(ratedPlayers(m,'b').map(p=>p.id),['south']);
 delete m.boxScore;
 assert.equal(ratedPlayers(m,'a').length,4);assert.equal(ratedPlayers(m,'b').length,2);
});
test('higher overlapping counts are selected, incorrect roster identity dropped, source retained',()=>{
 const m=fixture(),before=JSON.stringify(m),p=ratedPlayers(m,'c')[0];
 assert.equal(p.shots,3);assert.equal(p.goals,1);assert.equal(p.assists,1);
 assert.equal(teamStatistics(m,'c').shots,17);
 assert.equal(ratedPlayers(m,'w').length,0);assert.equal(JSON.stringify(m),before);
 assert.equal(p.coverage,'Brief appearance');assert.equal(p.rating,8.2);
 m.boxScore.players[0].stats.shots=0;assert.equal(ratedPlayers(m,'c')[0].shots,1);
});

test('advanced contributions use role weights, target accuracy, turnover penalties and caps',()=>{
 const m=fixture();m.events=[];
 const o=m.boxScore.players[0];o.stats={};o.derivedSeconds=5400;
 const add=action=>m.events.push({action:{participant:'p',contender:'c',...action}});
 add({type:'pass',outcome:'successful',fromPosition:{x:0,y:0},toPosition:{x:10,y:0}});
 add({type:'pass',outcome:'intercepted'});
 add({type:'shot',outcome:'saved'});add({type:'shot',outcome:'blocked'});
 add({type:'corner'});add({type:'cross'});
 const points=()=>Object.fromEntries(ratedPlayers(m,'c')[0].contributions.map(c=>[c.label,c.points]));
 assert.equal(points()['Progressive passes'],.06);assert.equal(points()['Passes intercepted'],-.02);
 assert.equal(points()['Shots on target'],.12);assert.equal(points()['Set pieces executed'],.06);
 o.position='MID';assert.equal(points()['Progressive passes'],.06);
 o.position='FWD';assert.equal(points()['Progressive passes'],.04);
 const savedRating=ratedPlayers(m,'c')[0].rating;
 m.events[2].action.outcome='off_target';assert.ok(ratedPlayers(m,'c')[0].rating<savedRating);
 m.events=Array.from({length:100},()=>({action:{type:'pass',participant:'p',outcome:'intercepted'}}));
 assert.equal(points()['Passes intercepted'],-1);
 for(let i=0;i<100;i++)add({type:'duel',unsuccessfulParticipant:'p'});
 for(let i=0;i<10;i++)add({type:'red_card'});
 o.goalkeeper={seconds:5400,saves:0,goalsAgainst:10};
 assert.equal(ratedPlayers(m,'c')[0].rating,1);
});
test('XML-only ratings, unknown minutes and bounds remain finite',()=>{
 const m=fixture();delete m.boxScore;
 const p=ratedPlayers(m,'c')[0];assert.equal(p.minutes,null);assert.equal(p.coverage,'XML only');assert.ok(Number.isFinite(p.rating));
 m.events.push(...Array.from({length:100},()=>({action:{type:'goal',participant:'p',contender:'c'}})));
 assert.equal(ratedPlayers(m,'c')[0].rating,10);
});
test('official-only keepers and unused substitutes receive appropriate handling',()=>{
 const m=fixture();m.participants=[];m.events=[];m.boxScore.links=[];
 const o=m.boxScore.players[0];o.stats={};o.derivedSeconds=0;o.publishedMinutes=0;
 const unused=ratedPlayers(m,'c')[0];
 assert.equal(unused.rating,null);
 for(const metric of ['progressivePasses','passesIntercepted','shotsOnTarget','setPiecesExecuted'])assert.equal(unused[metric],0);
 o.derivedSeconds=null;o.goalkeeper={seconds:5400,saves:5,goalsAgainst:0};
 const p=ratedPlayers(m,'c')[0];assert.equal(p.role,'GK');assert.equal(p.minutes,90);assert.equal(p.rating,7.5);
 o.goalkeeper=null;o.publishedMinutes=20;assert.equal(ratedPlayers(m,'c')[0].minutes,20);
});
