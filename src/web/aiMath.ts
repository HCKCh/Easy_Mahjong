import type { GameState, Meld, Seat, Tile } from '../core/types/mahjong.js';
import { tileKey } from '../core/engine/tiles.js';

const keys:string[]=[];
for(const suit of ['characters','dots','bamboo']) for(let r=1;r<=9;r++) keys.push(`${suit}:${r}`);
for(const w of ['east','south','west','north']) keys.push(`wind:${w}`);
for(const d of ['red','green','white']) keys.push(`dragon:${d}`);
const keyIndex=new Map(keys.map((k,i)=>[k,i]));

function countsOf(tiles:Tile[]):number[]{
  const c=Array(34).fill(0) as number[];
  for(const t of tiles){ if(t.kind==='flower')continue; const i=keyIndex.get(tileKey(t)); if(i!==undefined)c[i]++; }
  return c;
}

export function shantenOf(tiles:Tile[],melds:Meld[]=[]):number{
  const c=countsOf(tiles); const open=melds.length; let best=99;
  const dfs=(idx:number,m:number,t:number,p:number)=>{
    while(idx<34&&c[idx]===0)idx++;
    if(idx>=34){
      const meldsTotal=open+m; const need=Math.max(0,5-meldsTotal); const taatsu=Math.min(t,need);
      best=Math.min(best,10-2*meldsTotal-taatsu-p);
      return;
    }
    // discard singleton path
    c[idx]--; dfs(idx,m,t,p); c[idx]++;
    if(c[idx]>=3){c[idx]-=3;dfs(idx,m+1,t,p);c[idx]+=3;}
    if(c[idx]>=2){
      c[idx]-=2;
      if(!p)dfs(idx,m,t,1);
      dfs(idx,m,t+1,p);
      c[idx]+=2;
    }
    if(idx<27){
      const pos=idx%9;
      if(pos<=6&&c[idx+1]>0&&c[idx+2]>0){c[idx]--;c[idx+1]--;c[idx+2]--;dfs(idx,m+1,t,p);c[idx]++;c[idx+1]++;c[idx+2]++;}
      if(pos<=7&&c[idx+1]>0){c[idx]--;c[idx+1]--;dfs(idx,m,t+1,p);c[idx]++;c[idx+1]++;}
      if(pos<=6&&c[idx+2]>0){c[idx]--;c[idx+2]--;dfs(idx,m,t+1,p);c[idx]++;c[idx+2]++;}
    }
  };
  dfs(0,0,0,0); return best;
}

function visibleCount(state:GameState,key:string):number{
  let n=0;
  for(const s of ['east','south','west','north'] as Seat[]){
    const p=state.players[s];
    n+=p.discards.filter(t=>tileKey(t)===key).length;
    n+=p.melds.flatMap(m=>m.tiles).filter(t=>tileKey(t)===key).length;
    n+=p.flowers.filter(t=>tileKey(t)===key).length;
  }
  return n;
}

function prototypeForKey(key:string):Tile{
  const [a,b]=key.split(':');
  if(a==='characters'||a==='dots'||a==='bamboo') return {kind:'suit',suit:a,rank:Number(b) as 1|2|3|4|5|6|7|8|9,id:`probe-${key}`};
  if(a==='wind')return {kind:'wind',wind:b as 'east'|'south'|'west'|'north',id:`probe-${key}`};
  return {kind:'dragon',dragon:b as 'red'|'green'|'white',id:`probe-${key}`};
}

export function effectiveTiles(state:GameState,seat:Seat,tiles:Tile[],melds:Meld[]):{shanten:number;outs:number;keys:string[]} {
  const base=shantenOf(tiles,melds); let outs=0; const improving:string[]=[];
  const own=new Map<string,number>(); for(const t of tiles)own.set(tileKey(t),(own.get(tileKey(t))??0)+1);
  for(const key of keys){
    const totalSeen=visibleCount(state,key)+(own.get(key)??0);
    if(totalSeen>=4)continue;
    const s=shantenOf([...tiles,prototypeForKey(key)],melds);
    if(s<base){improving.push(key);outs+=4-totalSeen;}
  }
  return {shanten:base,outs,keys:improving};
}

export function bestAfterClaim(state:GameState,seat:Seat,remaining:Tile[],melds:Meld[]):{shanten:number;outs:number}{
  let best={shanten:99,outs:-1};
  for(const t of remaining){
    const hand=remaining.filter(x=>x.id!==t.id);
    const e=effectiveTiles(state,seat,hand,melds);
    if(e.shanten<best.shanten||(e.shanten===best.shanten&&e.outs>best.outs))best={shanten:e.shanten,outs:e.outs};
  }
  return best;
}
