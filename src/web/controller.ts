import type { GameState, Seat, Tile } from '../core/types/mahjong.js';
import { canSelfDraw, claimRobKong, declareAddedKong, declareConcealedKong, declareSelfDraw, getKongReactionOptions, getReactionOptions, passReaction, seats, settleDiscardReactionWindow, type ReactionDecision, type ReactionOption } from '../core/engine/actions.js';
import { createGame, discardTile, drawTile } from '../core/engine/game.js';
import { tileKey } from '../core/engine/tiles.js';
import { chooseDiscard, chooseReaction } from './bot.js';

export const HUMAN:Seat='east';
export interface HumanPrompt{kind:'discard-reaction'|'kong-reaction';options:ReactionOption[];}
export interface ControllerResult{state:GameState;prompt?:HumanPrompt;message?:string;botActed?:boolean;}
export function newLocalGame():GameState{return createGame(Math.random,HUMAN,{ronMode:'single',missedWinPolicy:'until_next_draw'});}
export function availableHumanKongs(state:GameState):{concealed:Tile[];added:Tile[]}{const p=state.players[HUMAN],groups=new Map<string,Tile[]>();for(const t of p.concealed){if(t.kind==='flower')continue;const k=tileKey(t);groups.set(k,[...(groups.get(k)??[]),t]);}return{concealed:[...groups.values()].filter(v=>v.length===4).map(v=>v[0]),added:p.concealed.filter(t=>p.melds.some(m=>m.type==='pong'&&tileKey(m.tiles[0])===tileKey(t)))};}
function humanReactionOptions(state:GameState):ReactionOption[]{if(state.phase==='awaiting_reactions'&&state.lastDiscard?.seat!==HUMAN)return getReactionOptions(state,HUMAN).filter(o=>o.type!=='pass');if(state.phase==='awaiting_kong_reactions'&&state.pendingAddedKong?.seat!==HUMAN)return getKongReactionOptions(state,HUMAN).filter(o=>o.type!=='pass');return[];}
function botTryKong(state:GameState,seat:Seat):boolean{if(state.phase!=='awaiting_discard'||state.turn!==seat)return false;const p=state.players[seat],groups=new Map<string,Tile[]>();for(const t of p.concealed){if(t.kind==='flower')continue;const k=tileKey(t);groups.set(k,[...(groups.get(k)??[]),t]);}const four=[...groups.values()].find(v=>v.length===4);if(four){declareConcealedKong(state,seat,four[0].id);return true;}const added=p.concealed.find(t=>p.melds.some(m=>m.type==='pong'&&tileKey(m.tiles[0])===tileKey(t)));if(added){declareAddedKong(state,seat,added.id);return true;}return false;}

// Executes at most one visible bot/state-machine step. The UI schedules repeated calls,
// which creates a natural thinking cadence without blocking the browser.
export function stepBots(state:GameState):ControllerResult{
  if(state.phase==='ended')return{state};
  const h=humanReactionOptions(state);if(h.length)return{state,prompt:{kind:state.phase==='awaiting_kong_reactions'?'kong-reaction':'discard-reaction',options:h}};
  if(state.phase==='awaiting_draw'){
    const seat=state.turn; try{drawTile(state,seat);}catch{return{state};}
    return{state,botActed:seat!==HUMAN,message:seat!==HUMAN?`${seat} 摸牌`:undefined};
  }
  if(state.phase==='awaiting_discard'){
    if(state.turn===HUMAN)return{state}; const seat=state.turn;
    if(canSelfDraw(state,seat)){declareSelfDraw(state,seat);return{state,botActed:true,message:`${seat} 自摸`};}
    if(botTryKong(state,seat))return{state,botActed:true,message:`${seat} 槓`};
    const tile=chooseDiscard(state,seat);discardTile(state,seat,tile.id);return{state,botActed:true,message:`${seat} 出牌`};
  }
  if(state.phase==='awaiting_reactions'&&state.lastDiscard){
    const discarder=state.lastDiscard.seat;
    const decisions:ReactionDecision[]=seats.filter(s=>s!==discarder).map(seat=>seat===HUMAN?{seat,type:'pass'}:chooseReaction(state,seat));
    settleDiscardReactionWindow(state,decisions,state.rules);return{state,botActed:true};
  }
  if(state.phase==='awaiting_kong_reactions'&&state.pendingAddedKong){
    const declarer=state.pendingAddedKong.seat;
    for(const seat of seats.filter(s=>s!==declarer)){
      if(state.phase!=='awaiting_kong_reactions')break;
      const win=getKongReactionOptions(state,seat).find(o=>o.type==='win');
      if(seat!==HUMAN&&win){claimRobKong(state,win);break;} passReaction(state,seat);
    }
    return{state,botActed:true};
  }
  return{state};
}
export function humanDiscard(state:GameState,tileId:string):ControllerResult{discardTile(state,HUMAN,tileId);return{state};}
export function humanSelfDraw(state:GameState):ControllerResult{declareSelfDraw(state,HUMAN);return{state};}
export function humanConcealedKong(state:GameState,tileId:string):ControllerResult{declareConcealedKong(state,HUMAN,tileId);return{state};}
export function humanAddedKong(state:GameState,tileId:string):ControllerResult{declareAddedKong(state,HUMAN,tileId);return{state};}
export function humanPass(state:GameState):ControllerResult{if(state.phase==='awaiting_kong_reactions'){passReaction(state,HUMAN);return{state};}return humanReaction(state,{type:'pass',seat:HUMAN,context:'discard'});}
export function humanReaction(state:GameState,option:ReactionOption):ControllerResult{
  if(state.phase==='awaiting_kong_reactions'){if(option.type==='win')claimRobKong(state,option);else passReaction(state,HUMAN);return{state};}
  const ld=state.lastDiscard;if(!ld)return{state};const decisions:ReactionDecision[]=seats.filter(s=>s!==ld.seat).map(seat=>seat===HUMAN?{seat,type:option.type,tiles:option.tiles}:chooseReaction(state,seat));settleDiscardReactionWindow(state,decisions,state.rules);return{state};
}
