import path from 'node:path';

export function deploymentConfig(env=process.env) {
 const production=env.NODE_ENV==='production'||env.RENDER==='true';
 const origins=[env.APP_ORIGIN,env.RENDER_EXTERNAL_URL].filter(Boolean).map(value=>{
  let url;try{url=new URL(value);}catch{throw Error('APP_ORIGIN / RENDER_EXTERNAL_URL must be a valid origin.');}
  if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||url.protocol!==(production?'https:':'http:'))throw Error(`Public origins must use ${production?'HTTPS':'HTTP'} with no path, credentials, query or fragment.`);
  return url.origin;
 });
 if(production&&!origins.length)throw Error('Set APP_ORIGIN to the public HTTPS origin (Render supplies RENDER_EXTERNAL_URL automatically).');
 if(production&&(!env.ADMIN_PASSWORD||env.ADMIN_PASSWORD.trim().length<12))throw Error('Production requires ADMIN_PASSWORD with at least 12 non-padding characters.');
 if(production&&(!env.DATA_DIR||!path.isAbsolute(env.DATA_DIR)))throw Error('Production requires an absolute DATA_DIR on a persistent disk.');
 const port=Number(env.PORT||4173);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT must be an integer from 1 to 65535.');
 return {production,origins,port,host:production?'0.0.0.0':'127.0.0.1'};
}
