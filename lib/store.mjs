import {gameId} from './identity.mjs';
import {getSupabase,storageError} from './supabase.mjs';
import {uploadTeamImage} from './team-images.mjs';

export class Store {
 constructor(supabase=getSupabase()){this.supabase=supabase;}

 async health(){
  const {error}=await this.supabase.from('matches').select('game_id').limit(1);
  if(error)throw storageError(error);
  const bucket=await this.supabase.storage.getBucket('images');
  if(bucket.error)throw storageError(bucket.error);
  if(!bucket.data?.public)throw storageError(Error('The images bucket must be public.'));
 }

 async match(id){
  const {data,error}=await this.supabase.from('matches')
   .select('snapshot,xml').eq('game_id',gameId(id)).maybeSingle();
  if(error)throw storageError(error);
  if(!data)return null;
  return {...data.snapshot,raw:{...data.snapshot.raw,xml:data.xml}};
 }

 async save(snapshot){
  const id=gameId(snapshot.gameId),saved=structuredClone(snapshot);
  for(const team of saved.contenders??[]){
   for(const field of ['crestUrl','logoUrl']){
    if(team[field]?.startsWith('data:'))
     team[field]=await uploadTeamImage(this.supabase,team[field],id,team.id);
   }
  }
  const {xml=null,...raw}=saved.raw??{};
  const {gameId:matchId,importedAt,contenders,counts,warnings}=saved;
  const row={game_id:id,imported_at:importedAt,xml,snapshot:{...saved,raw},
   summary:{gameId:matchId,importedAt,contenders,counts,warnings}};
  let {error}=await this.supabase.from('matches').insert(row);
  // Reimports and edits reuse the content-derived primary key.
  if(error?.code==='23505'){
   ({error}=await this.supabase.from('matches').update(row).eq('game_id',id));
  }
  if(error)throw storageError(error);
  // The API response must contain the persisted public URLs too.
  Object.assign(snapshot,saved);
 }

 async list(){
  const rows=[];
  for(let offset=0;;){
   const {data,error}=await this.supabase.from('matches').select('summary')
    .order('imported_at',{ascending:false}).order('game_id')
    .range(offset,offset+99);
   if(error)throw storageError(error);
   if(!data.length)return rows;
   rows.push(...data.map(row=>row.summary));
   offset+=data.length;
  }
 }
}
