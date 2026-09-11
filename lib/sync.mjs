import {SpiideoClient,credentials,parseConnection,gameId,apiUrl} from './spiideo.mjs';
import {Store} from './store.mjs';
export class SyncService{
 constructor(store=new Store(),clientFactory=h=>new SpiideoClient(h)) {this.store=store;this.clientFactory=clientFactory;this.headers=null;this.running=false;this.verifying=false;this.needsAttention=false;this.connectionInfo=null;this.progress='Not connected';this.lastError=null;this.lastRun=null;this.nextRun=null;this.config={gameIds:[],enabled:false,intervalHours:6,discoveryUrl:'',idField:'id'};}
 async init(){this.config={...this.config,...await this.store.read('settings.json',{})};if(process.env.SPIIDEO_AUTHORIZATION)this.headers=credentials(process.env.SPIIDEO_AUTHORIZATION);this.timer=setInterval(()=>{if(this.config.enabled&&!this.running&&!this.verifying&&!this.needsAttention&&this.headers&&(!this.nextRun||Date.now()>=this.nextRun))void this.sync().catch(()=>{});},30000);this.timer.unref();}
 status(){return {connected:!!this.headers,running:this.running||this.verifying,needsAttention:this.needsAttention,connectionInfo:this.connectionInfo,progress:this.progress,lastError:this.lastError,lastRun:this.lastRun,nextRun:this.nextRun?new Date(this.nextRun).toISOString():null,config:this.config};}
 async connect(value){
  if(this.running||this.verifying)throw Error('Wait for the current request to finish.');
  this.verifying=true;this.lastError=null;this.progress='Testing the copied request against Spiideo…';
  try{
   const parsed=parseConnection(value);
   this.connectionInfo={headerNames:Object.keys(parsed.headers).sort(),sourcePath:parsed.sourceUrl?new URL(parsed.sourceUrl).pathname:null,sourceGameId:parsed.sourceGameId,verified:false};
   if(parsed.sourceUrl){const client=this.clientFactory(parsed.headers);await client.json(parsed.sourceUrl);this.connectionInfo.verified=true;}
   this.headers=parsed.headers;this.needsAttention=false;this.verifying=false;
   this.progress=parsed.sourceUrl?'Copied request verified successfully. You can now sync the match.':'Authorization loaded; sync a match to verify it.';
   return this.status();
  }catch(e){this.lastError=e.message;this.progress='Connection test failed';this.needsAttention=true;throw e;}
  finally{this.verifying=false;}
 }
 disconnect(){if(this.running||this.verifying)throw Error('Wait for the current request to finish.');this.headers=null;this.connectionInfo=null;this.needsAttention=false;this.progress='Disconnected';return this.status();}
 async configure(input){if(this.running)throw Error('Wait for the current sync to finish.');const ids=[...new Set(String(input.gameIds??'').split(/[\s,]+/).filter(Boolean).map(gameId))];if(ids.length>100)throw Error('Use at most 100 tracked games.');const hours=Number(input.intervalHours);if(![1,3,6,12,24].includes(hours))throw Error('Choose an available sync interval.');let url=String(input.discoveryUrl??'').trim();if(url){url=apiUrl(url).href;const u=new URL(url);if([...u.searchParams.keys()].some(k=>/auth|cookie|key|secret|access_token/i.test(k)))throw Error('Keep credentials out of the discovery URL.');}if(!['id','gameId'].includes(input.idField))throw Error('Choose an available game ID field.');const config={gameIds:ids,enabled:input.enabled===true,intervalHours:hours,discoveryUrl:url,idField:input.idField};await this.store.write('settings.json',config);this.config=config;this.nextRun=Date.now()+hours*3600000;return this.status();}
 async sync(oneId){
  if(this.running||this.verifying)throw Error('A request is already running.');if(!this.headers)throw Error('Connect your Spiideo session first.');
  const requested=oneId?gameId(oneId):null;
  this.running=true;this.needsAttention=false;this.lastError=null;this.progress='Starting sync';
  const client=this.clientFactory(this.headers);client.onProgress=text=>this.progress=text;
  const failures=[];let completed=0;
  try{
   let ids=requested?[requested]:[...this.config.gameIds];
   if(!requested&&this.config.discoveryUrl){const discovered=await client.discover(this.config.discoveryUrl,this.config.idField);ids=[...new Set([...ids,...discovered])];}
   if(ids.length>100)throw Error('Discovery returned more than 100 games. Narrow the source request.');
   if(!ids.length)throw Error('Add a game ID or configure a game-list request.');
   for(const id of ids){try{this.progress=`Loading ${id}`;const snapshot=await client.match(id);await this.store.save(snapshot);completed++;}catch(e){if(e.diagnostics)await this.store.write('diagnostic-'+id+'.json',e.diagnostics);if(e.auth)throw e;failures.push({gameId:id,error:e.message});}}
   if(failures.length)this.lastError=failures.map(f=>`${f.gameId}: ${f.error}`).join('\n');
   this.progress=`Saved ${completed} match(es)${failures.length?`; ${failures.length} failed`:''}.`;
  }catch(e){if(e.auth)this.needsAttention=true;this.lastError=e.message;this.progress='Sync needs attention';}
  finally{this.running=false;this.lastRun=new Date().toISOString();this.nextRun=Date.now()+this.config.intervalHours*3600000;}
  return this.status();
 }
 close(){clearInterval(this.timer);}
}
