import test from 'node:test';
import assert from 'node:assert/strict';
import {playersFor} from '../dist/model.js';
test('player statistics credit passes, both duel roles, blocks and cards',()=>{
 const events=[{action:{type:'pass',fromParticipant:'a',fromContender:'t',outcome:'successful'}},{action:{type:'pass',fromParticipant:'a',fromContender:'t',outcome:'unsuccessful'}},{action:{type:'duel',successfulParticipant:'a',successfulContender:'t',unsuccessfulParticipant:'b',unsuccessfulContender:'t'}},{action:{type:'shot',participant:'a',contender:'t',blockedBy:'b'}},{action:{type:'yellow_card',participant:'b',contender:'t'}}];
 const rows=playersFor(events,[{id:'a',name:'A',type:'player',contenderId:'t'},{id:'b',name:'B',type:'player',contenderId:'t'}],'t');
 const a=rows.find(p=>p.id==='a'),b=rows.find(p=>p.id==='b');
 assert.equal(a.passes,2);assert.equal(a.completed,1);assert.equal(a.duelsWon,1);assert.equal(a.shots,1);assert.equal(b.duelsLost,1);assert.equal(b.blocks,1);assert.equal(b.cards,1);
});
