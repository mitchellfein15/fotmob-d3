import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {createApp} from '../server.mjs';
import {Store} from '../lib/store.mjs';
import {login,TEST_PASSWORD} from './helpers/auth.mjs';
import {validateTeamImage} from '../lib/team-images.mjs';
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=';
test('team images reject unsafe formats, bad content and oversized files',()=>{
 assert.equal(validateTeamImage(image),image);
 for(const value of ['https://example.com/a.png','data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,aGVsbG8=',image+'!', 'x'.repeat(2800001),undefined])assert.throws(()=>validateTeamImage(value));
});
test('admin image upload persists publicly, survives reimport and can be removed',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'matchroom-images-'));
 const store=new Store(dir),app=createApp(store,{adminPassword:TEST_PASSWORD});app.listen(0,'127.0.0.1');await once(app,'listening');
 const base='http://127.0.0.1:'+app.address().port;
 const post=(route,body,cookie='')=>fetch(base+'/api/'+route,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-Matchroom-Request':'1'},body:JSON.stringify(body)});
 const xml='<file><ALL_INSTANCES><instance><ID>1</ID><start>1</start><end>2</end><code>shot</code><label><text>shot</text></label><label><text>Team A</text><group>team</group></label></instance><instance><ID>2</ID><start>3</start><end>4</end><code>shot</code><label><text>shot</text></label><label><text>Team B</text><group>team</group></label></instance></ALL_INSTANCES></file>';
 try{
  const cookie=await login(base),match=await (await post('import',{xml},cookie)).json();
  const body={gameId:match.gameId,teamId:match.contenders[0].id,crestUrl:image};
  assert.equal((await post('team-image',body)).status,401);
  assert.equal((await post('team-image',{...body,teamId:'unknown'},cookie)).status,400);
  assert.equal((await post('team-image',{...body,crestUrl:'javascript:alert(1)'},cookie)).status,400);
  assert.equal((await post('team-image',body,cookie)).status,200);
  const reimport=await (await post('import',{xml},cookie)).json();assert.equal(reimport.contenders[0].crestUrl,image);
  assert.equal((await new Store(dir).match(match.gameId)).contenders[0].crestUrl,image);
  const list=await (await fetch(base+'/api/matches')).json();assert.equal(list[0].contenders[0].crestUrl,image);
  assert.equal((await (await fetch(base+'/api/matches/'+match.gameId)).json()).contenders[0].crestUrl,image);
  assert.equal((await post('team-image',{...body,crestUrl:null},cookie)).status,200);
  assert.equal((await store.match(match.gameId)).contenders[0].crestUrl,undefined);
 }finally{await new Promise(resolve=>app.close(resolve));await rm(dir,{recursive:true,force:true});}
});
