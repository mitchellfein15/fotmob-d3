import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {deploymentConfig} from '../lib/config.mjs';
import {Store} from '../lib/store.mjs';
import {createApp} from '../server.mjs';
import {TEST_PASSWORD} from './helpers/auth.mjs';

const environment=()=>({NODE_ENV:'production',RENDER_EXTERNAL_URL:'https://matchroom.onrender.com',ADMIN_PASSWORD:TEST_PASSWORD,DATA_DIR:path.resolve('storage'),PORT:'10000'});
test('production configuration fails closed and supports Render and custom domains',()=>{
 const env=environment(),config=deploymentConfig(env);
 assert.equal(config.host,'0.0.0.0');assert.equal(config.port,10000);
 assert.equal(deploymentConfig({}).host,'127.0.0.1');
 assert.equal(deploymentConfig({...env,NODE_ENV:'development',RENDER:'true'}).production,true);
 for(const ADMIN_PASSWORD of ['', 'short', '            '])assert.throws(()=>deploymentConfig({...env,ADMIN_PASSWORD}),/ADMIN_PASSWORD/);
 for(const DATA_DIR of [undefined,'','relative'])assert.equal(deploymentConfig({...env,DATA_DIR}).production,true);
 assert.throws(()=>deploymentConfig({...env,RENDER_EXTERNAL_URL:''}),/APP_ORIGIN/);
 for(const APP_ORIGIN of ['http://example.com','https://user:pass@example.com','https://example.com/path','https://example.com/?x=1'])assert.throws(()=>deploymentConfig({...env,APP_ORIGIN}));
 for(const PORT of ['0','-1','65536','1.5','no'])assert.throws(()=>deploymentConfig({...env,PORT}),/PORT/);
 assert.deepEqual(deploymentConfig({...env,APP_ORIGIN:'https://soccer.example.com'}).origins,['https://soccer.example.com','https://matchroom.onrender.com']);
});

test('production proxy requests enforce host/origin, secure sessions and disk persistence across restarts',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'matchroom-deploy-'));
 const config=deploymentConfig({...environment(),APP_ORIGIN:'https://soccer.example.com'});
 let server,base;
 const start=async()=>{server=createApp(new Store(directory),{config,adminPassword:TEST_PASSWORD});server.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;};
 const close=()=>new Promise(resolve=>server.close(resolve));
 const request=(url,options={})=>new Promise((resolve,reject)=>{
  const req=http.request(base+url,{...options,headers:{Host:'matchroom.onrender.com',...options.headers}},res=>{
   const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:{get:key=>{const value=res.headers[key];return Array.isArray(value)?value.join('; '):value;}},json:async()=>JSON.parse(Buffer.concat(chunks).toString())}));res.on('error',reject);
  });req.on('error',reject);req.end(options.body);
 });
 const post=(url,body,headers={})=>request(url,{method:'POST',headers:{Origin:'https://matchroom.onrender.com','Content-Type':'application/json','X-Matchroom-Request':'1',...headers},body:JSON.stringify(body)});
 try{
  await start();
  assert.equal((await request('/')).status,200);
  assert.equal((await request('/',{headers:{Host:'soccer.example.com'}})).status,200);
  assert.equal((await request('/',{headers:{Host:'evil.example'}})).status,403);
  assert.equal((await request('/',{headers:{Host:'evil.example','X-Forwarded-Host':'matchroom.onrender.com'}})).status,403);
  assert.equal((await request('/healthz',{headers:{Host:'health.example'}})).status,200);
  assert.equal((await post('/api/auth/login',{password:TEST_PASSWORD},{Origin:'http://matchroom.onrender.com'})).status,403);
  assert.equal((await post('/api/auth/login',{password:TEST_PASSWORD},{Origin:'https://evil.example'})).status,403);
  const response=await post('/api/auth/login',{password:TEST_PASSWORD});assert.equal(response.status,200);
  const cookie=response.headers.get('set-cookie');assert.match(cookie,/; Secure/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);
  assert.equal(response.headers.get('strict-transport-security'),'max-age=31536000');
  const Cookie=cookie.split(';')[0];
  const xml='<file><ALL_INSTANCES>'+['A','B'].map((team,i)=>`<instance><ID>${i}</ID><start>1</start><end>2</end><code>pass</code><label><text>pass</text></label><label><text>${team}</text><group>fromTeam</group></label><label><text>Player</text><group>fromPlayer</group></label></instance>`).join('')+'</ALL_INSTANCES></file>';
  const saved=await post('/api/import',{xml},{Cookie});assert.equal(saved.status,200);const match=await saved.json();
  assert.equal((await post('/api/import',{xml},{Cookie,Origin:'https://evil.example'})).status,403);
  await close();await start();
  assert.equal((await request('/api/matches/'+match.gameId)).status,200);
  assert.equal((await (await request('/api/matches')).json()).length,1);
  assert.equal((await post('/api/import',{xml},{Cookie})).status,401);
  assert.equal((await request('/storage/'+match.gameId+'.json')).status,404);
  assert.equal((await request('/.env')).status,404);
 }finally{if(server?.listening)await close();await rm(directory,{recursive:true,force:true});}
});

test('health checks report unavailable storage without exposing filesystem errors',async()=>{
 const app=createApp({health:async()=>{throw Error('private filesystem path');}},{config:deploymentConfig({}),adminPassword:TEST_PASSWORD});
 app.listen(0,'127.0.0.1');await once(app,'listening');
 try{const response=await fetch(`http://127.0.0.1:${app.address().port}/healthz`);assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'Storage unavailable.'});}
 finally{await new Promise(resolve=>app.close(resolve));}
});
