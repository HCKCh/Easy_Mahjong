import type { Seat } from '../core/types/mahjong.js';
import type { RoomRules } from '../core/rules/roomRules.js';
import { createMatch, currentPrevailingWind, settleCurrentHand, startNextHand, type HandRecord, type MatchState } from '../core/match/match.js';
import { type ControllerResult } from './controller.js';

export interface AppSettings {
  base:number; perTai:number; aiSpeed:number;
  ronMode:RoomRules['ronMode']; missedWinPolicy:RoomRules['missedWinPolicy'];
  reactionSeconds:number; soundEnabled:boolean;
}
export const defaultAppSettings:AppSettings={base:50,perTai:20,aiSpeed:650,ronMode:'single',missedWinPolicy:'until_next_draw',reactionSeconds:8,soundEnabled:true};
export interface LocalSession { match:MatchState; totals:Record<Seat,number>; lastRecord?:HandRecord; settledGameRef?:object; settings:AppSettings; }
export function createLocalSession(settings:Partial<AppSettings>={}):LocalSession{
  const cfg={...defaultAppSettings,...settings};
  const match=createMatch({payment:{base:cfg.base,perTai:cfg.perTai},roomRules:{ronMode:cfg.ronMode,missedWinPolicy:cfg.missedWinPolicy,minTai:1}});
  return {match,totals:{east:0,south:0,west:0,north:0},settings:cfg};
}
export function roundLabel(session:LocalSession):string{const wind=currentPrevailingWind(session.match);const w=wind==='east'?'東':wind==='south'?'南':wind==='west'?'西':'北';return `${w}${session.match.handNumber}局`;}
export function settleEndedHand(session:LocalSession):HandRecord|undefined{
  const g=session.match.game;if(g.phase!=='ended')return undefined;if(session.settledGameRef===g)return session.lastRecord;
  const rec=settleCurrentHand(session.match);for(const p of rec.payments){session.totals[p.from]-=p.amount;session.totals[p.to]+=p.amount;}session.lastRecord=rec;session.settledGameRef=g;return rec;
}
export function startNextSessionHand(session:LocalSession):ControllerResult{startNextHand(session.match);session.lastRecord=undefined;session.settledGameRef=undefined;return {state:session.match.game};}
