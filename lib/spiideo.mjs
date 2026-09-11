import {setTimeout as delay} from 'node:timers/promises';
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function gameId(value){const id=String(value??'').trim();if(!UUID.test(id))throw Error('Enter a valid Spiideo game ID.');return id.toLowerCase();}
export function apiUrl(value){const u=new URL(value,'https://api.spiideo.net');if(u.origin!=='https://api.spiideo.net'||u.username||u.password||!u.pathname.startsWith('/v2/'))throw Error('Only https://api.spiideo.net/v2/ requests are supported.');u.hash='';return u;}
// Tokenize copied cURL without evaluating shell syntax or substitutions.
export function curlTokens(text){
 const tokens=[];let token='',quote=null,started=false;
 text=text.replace(/(?:\\|\^)\r?\n/g,' ');
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quote){
   if(c===quote){quote=null;continue;}
   if(quote==='"'&&c==='\\'&&['"','\\','$','`'].includes(text[i+1])){token+=text[++i];continue;}
   token+=c;continue;
  }
  if(c==='"'||c==="'"){quote=c;started=true;continue;}
  if(/\s/.test(c)){if(started){tokens.push(token);token='';started=false;}continue;}
  if(c==='\\'&&i+1<text.length){token+=text[++i];started=true;continue;}
  token+=c;started=true;
 }
 if(quote)throw Error('The copied request has an unfinished quote. Copy the complete request as cURL (bash).');
 if(started)tokens.push(token);return tokens;
}
export function parseConnection(value){
 const text=String(value??'').trim();if(!text||text.length>64000)throw Error('Paste an Authorization value or a copied cURL request.');
 const headers={};let sourceUrl=null;
 if(/^curl(?:\.exe)?\b/i.test(text)){
  const args=curlTokens(text);let method='GET';
  for(let i=1;i<args.length;i++){
   const arg=args[i];let header;
   if(arg==='-H'||arg==='--header')header=args[++i];else if(arg.startsWith('--header='))header=arg.slice(9);
   if(header!==undefined){const colon=header.indexOf(':');if(colon<1)continue;const key=header.slice(0,colon).trim().toLowerCase();const val=header.slice(colon+1).trim();
    // Preserve application context and custom authentication headers; omit transport/browser-only headers.
    if(/^[a-z0-9-]+$/.test(key)&&!key.startsWith('sec-')&&!key.startsWith('proxy-')&&!['host','connection','content-length','accept-encoding','transfer-encoding','upgrade','te','trailer'].includes(key))headers[key]=val;
   }else if(arg==='-b'||arg==='--cookie')headers.cookie=args[++i];
   else if(arg.startsWith('--cookie='))headers.cookie=arg.slice(9);
   else if(arg==='-X'||arg==='--request')method=String(args[++i]).toUpperCase();
   else if(arg.startsWith('--request='))method=arg.slice(10).toUpperCase();
   else if(arg==='--url')sourceUrl=args[++i];
   else if(arg.startsWith('--url='))sourceUrl=arg.slice(6);
   else if(/^https:\/\//.test(arg)){if(sourceUrl)throw Error('Copy one Spiideo request at a time.');sourceUrl=arg;}
   else if(['-d','--data','--data-raw','--data-binary','-F','--form','--upload-file'].includes(arg))throw Error('Copy a successful GET request for tags or participants, not a request that changes data.');
  }
  if(method!=='GET')throw Error('Copy a successful GET request for tags or participants.');
  if(!sourceUrl)throw Error('The copied request needs its Spiideo API URL.');
  sourceUrl=apiUrl(sourceUrl).href;
 }else headers.authorization=text.replace(/^authorization:\s*/i,'');
 if(!Object.keys(headers).some(k=>!['origin','referer','user-agent','accept'].includes(k)))throw Error('No authentication or application headers found. Copy a successful request with its headers.');
 for(const v of Object.values(headers))if(typeof v!=='string'||/[\r\n]/.test(v))throw Error('Authentication headers must be single-line values.');
 return {headers,sourceUrl,sourceGameId:sourceUrl?new URL(sourceUrl).pathname.match(/\/games\/([0-9a-f-]{36})(?:\/|$)/i)?.[1]?.toLowerCase()||null:null};
}
export function credentials(value){return parseConnection(value).headers;}
export class SpiideoClient{
 constructor(headers,{fetcher=fetch,sleep=delay,onProgress=()=>{}}={}){this.headers=headers;this.fetcher=fetcher;this.sleep=sleep;this.onProgress=onProgress;}
 async json(value){
  const url=apiUrl(value);
  for(let attempt=0;attempt<4;attempt++){
   let response;
   try{response=await this.fetcher(url,{headers:{accept:'application/json',...this.headers},redirect:'manual',signal:AbortSignal.timeout(30000)});}catch(e){
    const code=e.cause?.code||e.code;
    if(['EACCES','EPERM'].includes(code))throw Error('Local network permission blocked the request. Restart the Matchroom server outside the Codex sandbox (or with approved network access). Refreshing Spiideo will not fix this.');
    if(['UND_ERR_INVALID_ARG','ERR_INVALID_CHAR','ERR_INVALID_ARG_TYPE','ERR_INVALID_HTTP_TOKEN'].includes(code))throw Error('The copied request contains a header the HTTP client cannot send. Copy it again as cURL (bash).');
    if(attempt===3){
     if(['ENOTFOUND','EAI_AGAIN'].includes(code))throw Error('The computer could not resolve api.spiideo.net. Check DNS, VPN, or network access.');
     if(e.name==='TimeoutError'||['ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT'].includes(code))throw Error('The request to Spiideo timed out. Check the network or retry later.');
     throw Error('The connection to Spiideo failed before an HTTP response. Check local network permissions, VPN, or firewall access.');
    }
    await this.sleep(1000*2**attempt);continue;
   }
   if(response.status>=300&&response.status<400){await response.body?.cancel();throw Error(`Spiideo redirected GET ${url.pathname}. Copy a successful API request from the signed-in page; redirects are not followed with session credentials.`);}
   if(response.status===401||response.status===403){await response.body?.cancel();const err=Error(`Spiideo returned HTTP ${response.status} for GET ${url.pathname}. ${response.status===401?'This request was not authenticated.':'This endpoint denied access; that does not by itself mean the session expired.'}`);err.auth=true;err.status=response.status;err.endpoint=url.pathname;throw err;}
   if(response.status===429||response.status>=500){
    const raw=response.headers.get('retry-after');let ms=raw?(Number.isFinite(Number(raw))?Number(raw)*1000:Date.parse(raw)-Date.now()):1000*2**attempt;
    if(!Number.isFinite(ms))ms=1000*2**attempt;
    await response.body?.cancel();
    if(attempt===3||ms>120000)throw Error('Spiideo is busy or rate-limited. The previous saved match is unchanged; try again later.');
    await this.sleep(Math.max(0,ms));continue;
   }
   if(!response.ok){const err=Error(`Spiideo returned HTTP ${response.status}. Check that the request and game are accessible.`);err.status=response.status;throw err;}
   try{return await response.json();}catch{throw Error('Spiideo returned an unexpected response instead of JSON.');}
  }
 }
 async pages(value,label){
  const base=apiUrl(value);base.searchParams.delete('nextToken');
  const raw=[],map=new Map(),seen=new Set();let token;
  for(let page=1;page<=1000;page++){
   const u=new URL(base);if(token)u.searchParams.set('nextToken',token);
   const payload=await this.json(u);
   if(!Array.isArray(payload?.content))throw Error(`${label}: expected a content array; import stopped without replacing saved data.`);
   raw.push(payload);
   for(const row of payload.content){if(!row||typeof row.id!=='string')throw Error(`${label}: a record is missing its ID.`);const old=map.get(row.id);if(!old||(row.timeModified??0)>=(old.timeModified??0))map.set(row.id,row);}
   this.onProgress(`${label}: page ${page}, ${map.size} records`);
   token=payload.nextParameters?.nextToken??payload.nextToken;
   if(token===undefined||token===null||token===''){
    if(payload.nextParameters && !Object.hasOwn(payload.nextParameters,'nextToken'))throw Error(`${label}: unfamiliar pagination metadata; refusing to assume completeness.`);
    return {records:[...map.values()],pages:raw};
   }
   if(typeof token!=='string'||seen.has(token))throw Error(`${label}: invalid or repeated pagination cursor.`);
   seen.add(token);await this.sleep(150);
  }
  throw Error(`${label}: exceeded 1000 pages; saved data was not changed.`);
 }
 async match(id){
  id=gameId(id);
  const cs=await this.pages(`/v2/games/${id}/contenders?pageSize=100`,'Teams');
  if(cs.records.length!==2||!cs.records.some(c=>c.type==='home')||!cs.records.some(c=>c.type==='away')||cs.records.some(c=>c.gameId!==id||!UUID.test(c.id))){
   const diagnostics={requestedGameId:id,recordCount:cs.records.length,contenders:cs.records.map(c=>({id:c.id,type:c.type??null,gameId:c.gameId??null,teamName:c.teamName??c.name??null,fields:Object.keys(c)}))};
   const error=Error(`Contender validation failed: received ${cs.records.length} records; sides [${cs.records.map(c=>c.type??'missing').join(', ')}]; ${cs.records.filter(c=>c.gameId===id).length} matching game IDs, ${cs.records.filter(c=>c.gameId==null).length} missing game IDs. Response details saved for diagnosis. No data replaced.`);
   error.diagnostics=diagnostics;throw error;
  }
  cs.records.sort((a,b)=>Number(b.type==='home')-Number(a.type==='home'));
  const participants=[],rosterPages={};
  for(const c of cs.records){const result=await this.pages(`/v2/contenders/${c.id}/participants?pageSize=100&type=player&type=coach`,c.teamName||c.type);if(result.records.some(p=>p.contenderId!==c.id))throw Error('Roster contains records for another contender.');participants.push(...result.records);rosterPages[c.id]=result.pages;}
  const tags=await this.pages(`/v2/games/${id}/tags?includeHidden=false&pageSize=250`,'Events');
  if(tags.records.some(e=>e.gameId!==id))throw Error('Events contain a different game ID.');
  const events=tags.records.filter(e=>typeof e.action?.type==='string'&&Number.isFinite(e.timestamp)).sort((a,b)=>a.timestamp-b.timestamp);
  const warnings=[];let metadata=null;
  try{metadata=await this.json(`/v2/games/${id}`);}catch(e){warnings.push(`Optional game details unavailable (${e.status||'request error'}); event and roster import succeeded. Timing and processing status remain unverified.`);}
  if(events.length!==tags.records.length)warnings.push(`${tags.records.length-events.length} non-action tags retained in raw data, excluded from statistics.`);
  if(!participants.length)warnings.push('No participant records returned.');
  if(!events.length)warnings.push('No structured events returned yet. Processing may still be pending.');
  return {gameId:id,importedAt:new Date().toISOString(),contenders:cs.records,participants,events,metadata,coverage:'all-visible-pages',processingVerified:false,warnings,counts:{tags:tags.records.length,events:events.length,participants:participants.length,eventPages:tags.pages.length,rosterPages:Object.values(rosterPages).reduce((n,p)=>n+p.length,0)},raw:{contenders:cs.pages,participants:rosterPages,tags:tags.pages}};
 }
 async discover(value,idField='id'){
  if(!['id','gameId'].includes(idField))throw Error('Discovery ID field must be id or gameId.');
  const result=await this.pages(value,'Game discovery');
  if(result.records.some(r=>!UUID.test(r[idField]??'')))throw Error('Game list does not match the configured ID field.');
  return [...new Set(result.records.map(r=>r[idField].toLowerCase()))];
 }
}
