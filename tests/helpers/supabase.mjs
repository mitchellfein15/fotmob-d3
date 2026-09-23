import {createClient} from '@supabase/supabase-js';
import {Store as SupabaseStore} from '../../lib/store.mjs';

// Exercise the real SDK against an in-memory HTTP transport, without credentials.
const databases=new Map();
export function testDatabase(key=Symbol()) {
 if(databases.has(key))return databases.get(key);
 const state={rows:new Map(),uploads:[],calls:[],fail:null};
 const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
 state.client=createClient('https://test.supabase.co','test-service-key',{
  auth:{persistSession:false,autoRefreshToken:false},
  global:{fetch:async(input,options={})=>{
   const url=new URL(input),method=options.method??'GET';
   state.calls.push({method,path:url.pathname});
   if(state.fail?.(url,method))return reply({code:'XX000',message:'Injected backend failure'},500);
   if(url.pathname==='/storage/v1/bucket/images')return reply({id:'images',public:true});
   if(url.pathname.startsWith('/storage/v1/object/images/')){
    state.uploads.push({path:url.pathname,body:options.body,headers:options.headers});
    return reply({Key:url.pathname.slice('/storage/v1/object/'.length)});
   }
   if(url.pathname!=='/rest/v1/matches')return reply({},404);
   const id=url.searchParams.get('game_id')?.slice(3);
   if(method==='POST'){
    const row=JSON.parse(options.body);
    if(state.rows.has(row.game_id))return reply({code:'23505',message:'duplicate key'},409);
    state.rows.set(row.game_id,row);return reply(null,201);
   }
   if(method==='PATCH'){
    if(state.rows.has(id))state.rows.set(id,JSON.parse(options.body));
    return reply(null);
   }
   let rows=[...state.rows.values()].filter(row=>!id||row.game_id===id);
   rows.sort((a,b)=>b.imported_at.localeCompare(a.imported_at)||a.game_id.localeCompare(b.game_id));
   const offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??1000);
   rows=rows.slice(offset,offset+limit);
   const fields=(url.searchParams.get('select')??'*').split(',');
   return reply(rows.map(row=>Object.fromEntries(fields.map(field=>[field,row[field]]))));
  }}
 });
 databases.set(key,state);return state;
}

export class Store extends SupabaseStore {
 constructor(key){super(testDatabase(key).client);}
}
