import test from 'node:test';
import assert from 'node:assert/strict';
import {ratedPlayers,teamStatistics} from '../dist/ratings.js';
function fixture(){
 const official={id:'o',name:'Alex Eby',teamKey:'C',position:'DEF',stats:{shots:3,goals:1,assists:1},derivedSeconds:300,publishedMinutes:5};
 return {contenders:[{id:'c',teamName:'CWRU'},{id:'w',teamName:'College of Wooster'}],participants:[{id:'p',name:'Alex Eby',type:'player',contenderId:'c'},{id:'bad',name:'Alex Eby',type:'player',contenderId:'w'}],events:[{action:{type:'shot',participant:'p',contender:'c'}},{action:{type:'goal',participant:'p',contender:'c'}},{action:{type:'pass',fromParticipant:'bad',fromContender:'w',outcome:'successful'}}],boxScore:{players:[official],links:[{officialId:'o',participantId:'p'}],teamMapping:{C:'c'},comparisons:[{teamKey:'C',official:{shots:17,goals:1}}]}};
}
test('higher overlapping counts are selected, incorrect roster identity dropped, source retained',()=>{
 const m=fixture(),before=JSON.stringify(m),p=ratedPlayers(m,'c')[0];
 assert.equal(p.shots,3);assert.equal(p.goals,1);assert.equal(p.assists,1);
 assert.equal(teamStatistics(m,'c').shots,17);
 assert.equal(ratedPlayers(m,'w').length,0);assert.equal(JSON.stringify(m),before);
 assert.equal(p.coverage,'Brief appearance');assert.equal(p.rating,8.2);
 m.boxScore.players[0].stats.shots=0;assert.equal(ratedPlayers(m,'c')[0].shots,1);
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
 assert.equal(ratedPlayers(m,'c')[0].rating,null);
 o.derivedSeconds=null;o.goalkeeper={seconds:5400,saves:5,goalsAgainst:0};
 const p=ratedPlayers(m,'c')[0];assert.equal(p.role,'GK');assert.equal(p.minutes,90);assert.equal(p.rating,7.5);
 o.goalkeeper=null;o.publishedMinutes=20;assert.equal(ratedPlayers(m,'c')[0].minutes,20);
});
