import test from 'node:test';
import assert from 'node:assert/strict';
import {tieredLayout,splitLineup,lastName,ratingColor,boundPosition} from '../dist/pitch-layout.js';

test('four fixed bands spread arbitrary line sizes evenly without mutating roster',()=>{
 const roster=['GK','DEF','DEF','DEF','MID','MID','FWD'].map((role,i)=>({id:String(i),role}));
 const layout=tieredLayout(roster);
 assert.equal(layout.length,7);
 assert.deepEqual(layout.filter(p=>p.band==='DEF').map(p=>p.x),[212,360,508]);
 assert.equal(layout.find(p=>p.band==='GK').y,700);
 assert.equal(layout.find(p=>p.band==='MID').y,300);
 assert.equal(layout.find(p=>p.band==='FWD').y,100);
 assert.equal(roster[0].x,undefined);
 assert.deepEqual(tieredLayout([]),[]);
});
test('saved positions override bands, stay in bounds, and invalid saved data falls back',()=>{
 const players=[{id:'one',role:'GK'},{id:'two',role:'DEF'}];
 const layout=tieredLayout(players,{one:{x:260,y:230},two:{x:'invalid',y:0}});
 assert.equal(layout.find(p=>p.id==='one').y,230);
 assert.equal(layout.find(p=>p.id==='two').y,500);
 assert.deepEqual(boundPosition(-100,10000),{x:64,y:734});
});
test('official starters and substitutes take precedence; missing status is never invented',()=>{
 const starter={id:'s',official:{starter:true},inStartingLineup:false};
 const sub={id:'b',official:{starter:false},inStartingLineup:true};
 const unknown={id:'u',lineupKnown:false};
 assert.deepEqual(splitLineup([starter,sub,unknown]),{starters:[starter],bench:[sub],unassigned:[unknown]});
 assert.deepEqual(tieredLayout([{id:'unknown',position:'Unknown'}]),[]);
});
test('display names and rating boundaries',()=>{
 assert.equal(lastName({name:'Smith, Alex'}),'Smith');
 assert.equal(lastName({name:'Alex Smith'}),'Smith');
 assert.equal(lastName({name:'Alex van Dijk',lastName:'van Dijk'}),'van Dijk');
 assert.equal(ratingColor(7),'#7ed957');
 assert.equal(ratingColor(6),'#f3a846');
 assert.equal(ratingColor(5.9),'#ec6464');
 assert.equal(ratingColor(null),'#64746c');
});
