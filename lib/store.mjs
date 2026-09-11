import {mkdir,readFile,writeFile,rename,unlink,readdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {gameId} from './spiideo.mjs';
export class Store{
 constructor(root=path.resolve('storage')){this.root=root;}
 async read(name,fallback){try{return JSON.parse(await readFile(path.join(this.root,name),'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
 async write(name,data){await mkdir(this.root,{recursive:true});const target=path.join(this.root,name),tmp=target+'.'+randomUUID()+'.tmp';try{await writeFile(tmp,JSON.stringify(data,null,2),{mode:0o600});await rename(tmp,target);}finally{await unlink(tmp).catch(()=>{});}}
 async match(id){return this.read(gameId(id)+'.json',null);}
 async save(snapshot){await this.write(gameId(snapshot.gameId)+'.json',snapshot);}
 async list(){await mkdir(this.root,{recursive:true});const rows=[];for(const name of await readdir(this.root)){if(!/^[0-9a-f-]{36}\.json$/.test(name))continue;const m=await this.read(name,null);if(m)rows.push({gameId:m.gameId,importedAt:m.importedAt,contenders:m.contenders,counts:m.counts,warnings:m.warnings});}return rows.sort((a,b)=>b.importedAt.localeCompare(a.importedAt));}
}
