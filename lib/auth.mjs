import {randomBytes, scrypt, scryptSync, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt);

// Credentials never reach the browser. Sessions are invalidated on server restart.
export function createAuth(password, {sessionMs=8*60*60*1000, now=Date.now, secure=false}={}) {
 const configured=typeof password==='string'&&password.trim().length>=12&&password.length<=1024;
 if(password&&!configured)throw Error('ADMIN_PASSWORD must contain at least 12 non-padding characters and at most 1024 characters.');
 const salt=randomBytes(16),hash=configured?scryptSync(password,salt,32):null;
 const sessions=new Map(),attempts=new Map();
 let pending=0,globalAttempts={count:0,until:0};
 const token=req=>req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('matchroom_admin='))?.slice(16);
 function authenticated(req) {
  const key=token(req),expiry=sessions.get(key);
  if(!expiry||expiry<=now()){sessions.delete(key);return false;}
  return true;
 }
 function cookie(res,value,maxAge){res.setHeader('Set-Cookie',`matchroom_admin=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure?'; Secure':''}`);}
 return {configured,authenticated,
  async login(req,res,password){
   if(!configured)return {status:503,error:'Admin access is not configured. Set ADMIN_PASSWORD on the server (at least 12 characters) and restart.'};
   const address=req.socket.remoteAddress;
   // Do not trust user-supplied forwarding headers. A service-wide budget also
   // bounds hashing work when attackers rotate addresses or proxy connections.
   if(globalAttempts.until<=now())globalAttempts={count:0,until:now()+15*60*1000};
   if(globalAttempts.count>=20||pending>=2)return {status:429,error:'Too many sign-in attempts. Try again later.'};
   for(const [key,value] of attempts)if(value.until<=now())attempts.delete(key);
   const attempt=attempts.get(address)||{count:0,until:now()+15*60*1000};
   if(attempt.count>=5)return {status:429,error:'Too many sign-in attempts. Try again in 15 minutes.'};
   if(!attempts.has(address)&&attempts.size>=1000)return {status:429,error:'Too many sign-in attempts. Try again later.'};
   // Reserve the attempt before yielding so concurrent requests cannot bypass it.
   attempt.count++;attempts.set(address,attempt);globalAttempts.count++;pending++;
   let valid=false;
   try{valid=typeof password==='string'&&password.length<=1024&&timingSafeEqual(hash,await derive(password,salt,32));}
   finally{pending--;}
   if(!valid)return {status:401,error:'Incorrect password.'};
   attempts.delete(address);
   for(const [key,expiry] of sessions)if(expiry<=now())sessions.delete(key);
   if(sessions.size>=100)sessions.delete(sessions.keys().next().value);
   sessions.delete(token(req));
   const key=randomBytes(32).toString('hex');sessions.set(key,now()+sessionMs);cookie(res,key,Math.floor(sessionMs/1000));
   return {status:200,authenticated:true};
  },
  logout(req,res){sessions.delete(token(req));cookie(res,'',0);}
 };
}
