import type { GameState, Meld, Seat, Tile } from '../core/types/mahjong.js';
export interface ReplayPlayer{concealed:Tile[];concealedCount:number;flowers:Tile[];melds:Meld[];discards:Tile[];}
export interface ReplayFrame{index:number;label:string;phase:GameState['phase'];turn:Seat;wallCount:number;deadWallCount:number;lastDiscard?:{seat:Seat;tile:Tile};players:Record<Seat,ReplayPlayer>;}
export interface ReplayArchive{id:string;title:string;createdAt:number;frames:ReplayFrame[];result:string;}
const KEY='tw-mj-replays-v1'; const seats:Seat[]=['east','south','west','north'];
function cp<T>(v:T):T{return JSON.parse(JSON.stringify(v)) as T;}
export function snapshot(state:GameState,label:string,index:number):ReplayFrame{
 const players={} as Record<Seat,ReplayPlayer>;
 for(const s of seats){const p=state.players[s];players[s]={concealed:s==='east'?cp(p.concealed):[],concealedCount:p.concealed.length,flowers:cp(p.flowers),melds:cp(p.melds),discards:cp(p.discards)};}
 return{index,label,phase:state.phase,turn:state.turn,wallCount:state.wall.length,deadWallCount:state.deadWall.length,lastDiscard:state.lastDiscard?cp(state.lastDiscard):undefined,players};
}
export function loadReplays():ReplayArchive[]{try{return JSON.parse(localStorage.getItem(KEY)||'[]') as ReplayArchive[]}catch{return[]}}
export function saveReplay(a:ReplayArchive):void{const list=loadReplays();list.unshift(a);localStorage.setItem(KEY,JSON.stringify(list.slice(0,12)));}
export function clearReplays():void{localStorage.removeItem(KEY);}
