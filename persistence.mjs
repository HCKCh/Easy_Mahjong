import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';

function roomKey(code){ return `mj:room:${code}`; }
// 排行榜：最近幾場的結算紀錄（新的在前）
const RESULTS_KEY='mj:results';
export const RESULTS_LIMIT=10;

class FileStore {
  constructor(dir, ttlSeconds){ this.dir=dir; this.ttlSeconds=ttlSeconds; }
  async init(){ await fs.mkdir(this.dir,{recursive:true}); }
  async save(room){
    await this.init();
    const file=path.join(this.dir,`${room.code}.json`);
    const tmp=`${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp,JSON.stringify(room),'utf8');
    await fs.rename(tmp,file);
  }
  async remove(code){ try{ await fs.unlink(path.join(this.dir,`${code}.json`)); }catch(e){ if(e?.code!=='ENOENT') throw e; } }
  async loadAll(){
    await this.init();
    const now=Date.now(); const out=[];
    for(const name of await fs.readdir(this.dir)){
      if(!name.endsWith('.json')) continue;
      try{
        const obj=JSON.parse(await fs.readFile(path.join(this.dir,name),'utf8'));
        if(obj.expiresAt && obj.expiresAt<=now){ await this.remove(obj.code); continue; }
        out.push(obj);
      }catch(e){ console.warn('[persistence] skip invalid file',name,e?.message||e); }
    }
    return out;
  }
  resultsFile(){ return path.join(this.dir,'..','results.json'); }
  async loadResults(){ try{ return JSON.parse(await fs.readFile(this.resultsFile(),'utf8')).slice(0,RESULTS_LIMIT); }catch{ return []; } }
  async pushResult(rec){
    const list=[rec,...await this.loadResults()].slice(0,RESULTS_LIMIT);
    const file=this.resultsFile(),tmp=`${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp,JSON.stringify(list),'utf8'); await fs.rename(tmp,file);
  }
  async close(){}
}

function encodeCommand(args){
  const parts=[`*${args.length}\r\n`];
  for(const arg of args){ const s=String(arg); parts.push(`$${Buffer.byteLength(s)}\r\n${s}\r\n`); }
  return parts.join('');
}

function parseResp(buf, offset=0){
  if(offset>=buf.length) return null;
  const type=String.fromCharCode(buf[offset]);
  const lineEnd=buf.indexOf('\r\n',offset+1,'utf8');
  if(lineEnd<0) return null;
  const line=buf.toString('utf8',offset+1,lineEnd);
  if(type==='+' || type==='-' || type===':'){
    return {value:type===':'?Number(line):line,error:type==='-'?line:undefined,next:lineEnd+2};
  }
  if(type==='$'){
    const len=Number(line); if(len===-1) return {value:null,next:lineEnd+2};
    const start=lineEnd+2, end=start+len; if(buf.length<end+2) return null;
    return {value:buf.toString('utf8',start,end),next:end+2};
  }
  if(type==='*'){
    const count=Number(line); if(count===-1) return {value:null,next:lineEnd+2};
    let next=lineEnd+2; const arr=[];
    for(let i=0;i<count;i++){ const r=parseResp(buf,next); if(!r) return null; if(r.error) throw new Error(r.error); arr.push(r.value); next=r.next; }
    return {value:arr,next};
  }
  throw new Error(`Unsupported RESP type ${type}`);
}

class RedisStore {
  constructor(url, ttlSeconds){
    this.url=new URL(url); this.ttlSeconds=ttlSeconds;
    this.host=this.url.hostname; this.port=Number(this.url.port||6379);
    this.username=decodeURIComponent(this.url.username||''); this.password=decodeURIComponent(this.url.password||'');
    this.db=Number((this.url.pathname||'/0').slice(1)||0);
  }
  async request(args){
    const commands=[];
    if(this.password) commands.push(this.username?['AUTH',this.username,this.password]:['AUTH',this.password]);
    if(this.db) commands.push(['SELECT',String(this.db)]);
    commands.push(args);
    return await new Promise((resolve,reject)=>{
      const socket=net.createConnection({host:this.host,port:this.port});
      let data=Buffer.alloc(0), settled=false;
      const done=(fn,v)=>{if(settled)return;settled=true;socket.destroy();fn(v);};
      socket.setTimeout(5000,()=>done(reject,new Error('Redis timeout')));
      socket.on('error',e=>done(reject,e));
      socket.on('connect',()=>socket.write(commands.map(encodeCommand).join('')));
      socket.on('data',chunk=>{
        data=Buffer.concat([data,chunk]); let off=0; const values=[];
        try{
          while(values.length<commands.length){ const r=parseResp(data,off); if(!r)return; if(r.error)throw new Error(r.error); values.push(r.value); off=r.next; }
          done(resolve,values.at(-1));
        }catch(e){done(reject,e);}
      });
    });
  }
  async init(){ await this.request(['PING']); }
  async save(room){ await this.request(['SET',roomKey(room.code),JSON.stringify(room),'EX',String(this.ttlSeconds)]); }
  async remove(code){ await this.request(['DEL',roomKey(code)]); }
  async loadAll(){
    const out=[]; let cursor='0';
    do{
      const res=await this.request(['SCAN',cursor,'MATCH','mj:room:*','COUNT','200']);
      cursor=String(res?.[0]??'0');
      const keys=res?.[1]??[];
      for(const key of keys){ const raw=await this.request(['GET',key]); if(!raw)continue; try{out.push(JSON.parse(raw));}catch{} }
    }while(cursor!=='0');
    return out;
  }
  async loadResults(){
    const raw=await this.request(['LRANGE',RESULTS_KEY,'0',String(RESULTS_LIMIT-1)])??[];
    return raw.map(x=>{try{return JSON.parse(x);}catch{return undefined;}}).filter(Boolean);
  }
  async pushResult(rec){
    await this.request(['LPUSH',RESULTS_KEY,JSON.stringify(rec)]);
    await this.request(['LTRIM',RESULTS_KEY,'0',String(RESULTS_LIMIT-1)]);
  }
  async close(){}
}

export async function createPersistence({driver='file',dataDir='./data/rooms',redisUrl='redis://127.0.0.1:6379/0',ttlSeconds=86400}={}){
  let store;
  if(driver==='redis') store=new RedisStore(redisUrl,ttlSeconds);
  else store=new FileStore(dataDir,ttlSeconds);
  await store.init();
  console.log(`[persistence] ${driver} ready`);
  return store;
}
