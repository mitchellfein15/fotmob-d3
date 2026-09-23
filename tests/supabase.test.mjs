import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store} from '../lib/store.mjs';
import {testDatabase} from './helpers/supabase.mjs';

const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=';
const fixture=()=>({gameId:randomUUID(),importedAt:new Date().toISOString(),contenders:[{id:randomUUID(),crestUrl:image}],raw:{xml:'<file>original &amp; source</file>',boxScoreHtml:'<html>source</html>'},trackerData:{notes:'text data'}});

test('Supabase stores buffers and public URLs, round-trips XML/text, and updates duplicate IDs',async()=>{
 const db=testDatabase(),store=new Store(db.client),match=fixture();
 await store.health();assert.equal(await store.match(match.gameId),null);
 await store.save(match);
 const upload=db.uploads[0];
 assert.ok(Buffer.isBuffer(upload.body));
 assert.deepEqual(upload.body,Buffer.from(image.split(',')[1],'base64'));
 assert.equal(new Headers(upload.headers).get('content-type'),'image/png');
 assert.match(match.contenders[0].crestUrl,/^https:\/\/test.supabase.co\/storage\/v1\/object\/public\/images\//);
 assert.equal(db.rows.get(match.gameId).xml,match.raw.xml);
 assert.equal(db.rows.get(match.gameId).snapshot.raw.xml,undefined);
 assert.deepEqual(await store.match(match.gameId),match);
 match.trackerData.notes='updated text';await store.save(match);
 assert.equal(db.rows.size,1);assert.equal(db.uploads.length,1);
 assert.ok(db.calls.some(call=>call.method==='PATCH'));
 assert.deepEqual(await store.match(match.gameId),match);
});

test('upload and database failures reject saves and preserve the prior row',async()=>{
 const db=testDatabase(),store=new Store(db.client),match=fixture();
 await store.save(match);const before=await store.match(match.gameId);
 match.contenders[0].crestUrl=image;
 db.fail=url=>url.pathname.startsWith('/storage/v1/object/');
 await assert.rejects(store.save(match),{code:'STORAGE_ERROR'});
 assert.equal(db.uploads.length,1);assert.equal(match.contenders[0].crestUrl,image);
 db.fail=(url,method)=>method==='PATCH';
 await assert.rejects(store.save(match),{code:'STORAGE_ERROR'});
 assert.deepEqual(await store.match(match.gameId),before);
 db.fail=(url,method)=>method==='POST'&&url.pathname==='/rest/v1/matches';
 const updates=db.calls.filter(call=>call.method==='PATCH').length;
 await assert.rejects(store.save(fixture()),{code:'STORAGE_ERROR'});
 assert.equal(db.calls.filter(call=>call.method==='PATCH').length,updates);
 db.fail=()=>true;
 await assert.rejects(store.health(),{code:'STORAGE_ERROR'});
 await assert.rejects(store.list(),{code:'STORAGE_ERROR'});
 await assert.rejects(store.match(match.gameId),{code:'STORAGE_ERROR'});
});

test('match lists paginate beyond the default API row limit and exclude raw sources',async()=>{
 const db=testDatabase(),store=new Store(db.client);
 for(let i=0;i<1005;i++){
  const id=randomUUID();db.rows.set(id,{game_id:id,imported_at:new Date(i*1000).toISOString(),summary:{gameId:id,index:i}});
 }
 const rows=await store.list();
 assert.equal(rows.length,1005);assert.equal(rows[0].index,1004);assert.equal(rows.at(-1).index,0);
 assert.ok(rows.every(row=>!row.raw&&!row.xml));
});
