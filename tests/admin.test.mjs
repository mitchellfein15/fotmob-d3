import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../server.mjs';
import {login,TEST_PASSWORD} from './helpers/auth.mjs';
const id='11111111-1111-1111-1111-111111111111';
async function setup(options={}) {
 let saved={gameId:id,contenders:[{id:'a',teamName:'A'},{id:'b',teamName:'B'}],participants:[{id:'p',name:'Player',type:'player',contenderId:'a'}],events:[]},writes=0;
 const store={list:async()=>[],match:async key=>key===id?structuredClone(saved):null,save:async value=>{writes++;saved=structuredClone(value);}};
 const app=createApp(store,options);app.listen(0,'127.0.0.1');await once(app,'listening');
 const base='http://127.0.0.1:'+app.address().port;
 const post=(route,body={},cookie='',headers={})=>fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Matchroom-Request':'1',Cookie:cookie,...headers},body:JSON.stringify(body)});
 return {base,post,saved:()=>saved,writes:()=>writes,close:()=>new Promise(resolve=>app.close(resolve))};
}
test('public reads remain available; every write route fails closed without configured credentials',async()=>{
 const s=await setup({adminPassword:''});
 try{
  assert.deepEqual(await (await fetch(s.base+'/api/auth')).json(),{configured:false,authenticated:false});
  assert.equal((await fetch(s.base+'/api/matches/'+id)).status,200);
  for(const route of ['import','tracker','pitch','boxscore/preview','boxscore/attach','future-write'])assert.equal((await s.post(route)).status,401,route);
  assert.equal((await s.post('auth/login',{password:TEST_PASSWORD})).status,503);
  assert.equal(s.writes(),0);
 }finally{await s.close();}
});
test('password verification, CSRF checks, cookie flags, public pitch persistence, validation, reset and logout',async()=>{
 const s=await setup({adminPassword:TEST_PASSWORD});
 try{
  assert.equal((await s.post('auth/login',{password:'wrong'})).status,401);
  assert.equal((await s.post('auth/login',{password:TEST_PASSWORD},'',{Origin:'https://evil.example'})).status,403);
  assert.equal((await s.post('auth/login',{password:TEST_PASSWORD},'',{'X-Matchroom-Request':'0'})).status,403);
  const response=await s.post('auth/login',{password:TEST_PASSWORD});
  const header=response.headers.get('set-cookie');assert.match(header,/HttpOnly/);assert.match(header,/SameSite=Strict/);assert.match(header,/Max-Age=28800/);
  const cookie=header.split(';')[0];
  assert.equal((await (await fetch(s.base+'/api/auth',{headers:{Cookie:cookie}})).json()).authenticated,true);
  const body={gameId:id,teamId:'a',positions:{p:{x:120,y:240}}};
  assert.equal((await s.post('pitch',body,'matchroom_admin=forged')).status,401);
  assert.equal((await s.post('pitch',body,cookie,{Origin:'https://evil.example'})).status,403);
  assert.equal((await s.post('pitch',body,cookie,{'X-Matchroom-Request':'0'})).status,403);
  assert.equal((await s.post('pitch',body,cookie)).status,200);
  assert.deepEqual((await (await fetch(s.base+'/api/matches/'+id)).json()).pitchPositions.a,body.positions);
  for(const changes of [{teamId:'other'},{positions:{alien:{x:1,y:2}}},{positions:{p:{x:'1',y:2}}},{positions:[]}])assert.equal((await s.post('pitch',{...body,...changes},cookie)).status,400);
  assert.equal(s.writes(),1);
  assert.equal((await s.post('pitch',{...body,positions:{}},cookie)).status,200);
  assert.deepEqual(s.saved().pitchPositions.a,{});
  assert.equal((await s.post('auth/logout',{},cookie)).status,200);
  assert.equal((await s.post('pitch',body,cookie)).status,401);
  assert.equal((await (await fetch(s.base+'/api/auth',{headers:{Cookie:cookie}})).json()).authenticated,false);
 }finally{await s.close();}
});
test('sessions expire and failed sign-ins are throttled',async()=>{
 let time=1000;
 const s=await setup({adminPassword:TEST_PASSWORD,authOptions:{now:()=>time,sessionMs:1000}});
 try{
  const cookie=await login(s.base);time+=1001;
  assert.equal((await s.post('tracker',{},cookie)).status,401);
  for(let n=0;n<5;n++)assert.equal((await s.post('auth/login',{password:'wrong'})).status,401);
  assert.equal((await s.post('auth/login',{password:TEST_PASSWORD})).status,429);
  time+=15*60*1000;
  assert.equal((await s.post('auth/login',{password:TEST_PASSWORD})).status,200);
 }finally{await s.close();}
});
test('short configured passwords are rejected at startup',()=>{
 assert.throws(()=>createApp(undefined,{adminPassword:'short'}),/at least 12/);
});
