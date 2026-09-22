import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountTracker} from '../dist/tracker-ui.js';
const sample=readFileSync(new URL('./fixtures/tracker.tsv',import.meta.url),'utf8');
// Small DOM surface for exercising the real form handlers and remount lifecycle.
function container(){return {
 isConnected:true,
 set innerHTML(value){this.nodes=Object.fromEntries(['tracker-team','tracker-tsv','tracker-save','tracker-status'].map(id=>[id,{value:'',disabled:false,textContent:'',add(option){if(!this.value)this.value=option.value;}}]));},
 querySelector(selector){return this.nodes[selector.slice(1)];}
};}
function fixture(){return {gameId:'game',contenders:[{id:'a',teamName:'First team'},{id:'b',teamName:'Second team'}],participants:[],events:[]};}
function choose(c,id){const el=c.querySelector('#tracker-team');el.value=id;el.onchange();}
function paste(c,text){const el=c.querySelector('#tracker-tsv');el.value=text;el.oninput();}

test('tracker editor keeps second team and independent drafts through save and remount',async t=>{
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  const body=JSON.parse(options.body);assert.equal(url,'/api/tracker');
  assert.equal(body.teamId,'b');assert.equal(body.tsv,sample);
  return new Response(JSON.stringify({...fixture(),trackerData:{b:body.tsv}}));
 });
 const oldOption=globalThis.Option;globalThis.Option=class {constructor(text,value){this.value=value;}};
 t.after(()=>{globalThis.Option=oldOption;});
 const c=container(),state={drafts:{}};
 const render=m=>mountTracker(c,m,render,state);render(fixture());
 paste(c,'unfinished first team draft');choose(c,'b');paste(c,sample);
 assert.match(c.querySelector('#tracker-save').textContent,/Second team/);
 assert.equal(c.querySelector('#tracker-save').disabled,false);
 choose(c,'a');assert.equal(c.querySelector('#tracker-tsv').value,'unfinished first team draft');
 choose(c,'b');assert.equal(c.querySelector('#tracker-tsv').value,sample);
 await c.querySelector('#tracker-save').onclick();
 assert.equal(c.querySelector('#tracker-team').value,'b');
 assert.equal(c.querySelector('#tracker-tsv').value,sample);
 assert.match(c.querySelector('#tracker-status').textContent,/saved for Second team/);
 assert.equal(c.querySelector('#tracker-save').disabled,true);
 choose(c,'a');assert.equal(c.querySelector('#tracker-tsv').value,'unfinished first team draft');
 assert.equal(c.querySelector('#tracker-save').disabled,true);
});

test('failed saves preserve the chosen team and paste; stale responses cannot replace a remounted form',async t=>{
 const oldOption=globalThis.Option;globalThis.Option=class {constructor(text,value){this.value=value;}};
 t.after(()=>{globalThis.Option=oldOption;});
 t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({error:'Try again'}),{status:500}));
 const c=container(),state={drafts:{}};let loads=0;
 mountTracker(c,fixture(),()=>loads++,state);choose(c,'b');paste(c,sample);
 await c.querySelector('#tracker-save').onclick();
 assert.equal(loads,0);assert.equal(c.querySelector('#tracker-team').value,'b');
 assert.equal(c.querySelector('#tracker-tsv').value,sample);
 assert.match(c.querySelector('#tracker-status').textContent,/Could not save.*Second team.*Try again/);
 assert.equal(c.querySelector('#tracker-save').disabled,false);
 let resolve;
 globalThis.fetch=()=>new Promise(r=>{resolve=r;});
 const pending=c.querySelector('#tracker-save').onclick();
 mountTracker(c,{...fixture(),gameId:'another'},()=>loads++,{drafts:{}});
 resolve(new Response(JSON.stringify(fixture())));await pending;
 assert.equal(loads,0);assert.equal(c.querySelector('#tracker-team').value,'a');
 assert.equal(c.querySelector('#tracker-tsv').value,'');
});
