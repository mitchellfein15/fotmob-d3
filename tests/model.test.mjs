import test from 'node:test';
import assert from 'node:assert/strict';
import {playersFor} from '../dist/model.js';
test('player statistics credit passes, both duel roles, blocks and cards',()=>{
 const events=[{action:{type:'pass',fromParticipant:'a',fromContender:'t',outcome:'successful'}},{action:{type:'pass',fromParticipant:'a',fromContender:'t',outcome:'unsuccessful'}},{action:{type:'duel',successfulParticipant:'a',successfulContender:'t',unsuccessfulParticipant:'b',unsuccessfulContender:'t'}},{action:{type:'shot',participant:'a',contender:'t',blockedBy:'b'}},{action:{type:'yellow_card',participant:'b',contender:'t'}}];
 const rows=playersFor(events,[{id:'a',name:'A',type:'player',contenderId:'t'},{id:'b',name:'B',type:'player',contenderId:'t'}],'t');
 const a=rows.find(p=>p.id==='a'),b=rows.find(p=>p.id==='b');
 assert.equal(a.passes,2);assert.equal(a.completed,1);assert.equal(a.duelsWon,1);assert.equal(a.shots,1);assert.equal(b.duelsLost,1);assert.equal(b.blocks,1);assert.equal(b.cards,1);
});

test('advanced metrics credit the actor and require forward successful passes and strict shot outcomes',()=>{
 const participants=['a','b'].map(id=>({id,name:id,type:'player',contenderId:'t'}));
 const pass=(outcome,x,y=0)=>({type:'pass',participant:'a',toParticipant:'b',outcome,fromPosition:{x:0,y:0},toPosition:{x,y}});
 const actions=[pass('successful',10),pass('successful',9),pass('successful',-20),pass('successful',0,30),
  pass('intercepted',20),pass('unsuccessful',20),{...pass('successful',20),toPosition:undefined},
  {...pass('successful',20),toPosition:{x:NaN,y:0}},
  {...pass('successful',20),fromParticipant:'b'},
  ...['goal','saved','off_target','blocked','successful'].map(outcome=>({type:'shot',participant:'a',outcome})),
  {type:'corner',participant:'a'},{type:'cross',fromParticipant:'a',toParticipant:'b'},
  {type:'goal_kick',participant:'a'},{type:'goal',participant:'a'}];
 const rows=playersFor(actions.map(action=>({action})),participants,'t');
 const a=rows.find(p=>p.id==='a'), b=rows.find(p=>p.id==='b');
 assert.equal(a.passes,8);assert.equal(a.completed,6);assert.equal(a.progressivePasses,1);
 assert.equal(a.passesIntercepted,1);assert.equal(a.shots,5);assert.equal(a.shotsOnTarget,2);
 assert.equal(a.setPiecesExecuted,2);assert.equal(b.progressivePasses,1);
 assert.equal(b.passesIntercepted,0);assert.equal(b.shotsOnTarget,0);assert.equal(b.setPiecesExecuted,0);
});
