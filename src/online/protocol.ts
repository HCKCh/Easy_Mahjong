import type { GamePhase, Meld, Seat, Tile } from '../core/types/mahjong.js';
import type { ReactionOption } from '../core/engine/actions.js';

export interface PublicPlayer {
  seat:Seat; name:string; kind:'human'|'bot'; avatar?:number; connected:boolean; ready:boolean; declaredReady:boolean;
  concealedCount:number; concealed?:Tile[]; flowers:Tile[]; melds:Meld[]; discards:Tile[];
}
export interface PublicSettlement {
  winners:Seat[]; endReason?:string; lines:{label:string;tai:number}[];
  handTai?:number; payments:{from:Seat;to:Seat;tai:number;amount:number}[];
  // 胡的那張牌與放槍者（自摸時沒有 winFrom）；牌數檢查結果
  winningTile?:Tile; winFrom?:Seat;
  // 倒數結束時自動開下一局（沒有就是停用）
  nextDeadline?:number;
  // 每位胡牌者各自的台數明細（一炮多響時有多筆）
  details?:{seat:Seat;handTai:number;lines:{label:string;tai:number}[]}[];
  audit?:{ok:boolean;total:number;suits:number;honors:number;flowers:number;problems:string[]};
}
export interface RoomSnapshot {
  code:string; hostClientId:string; you?:{clientId:string;seat?:Seat;name:string};
  status:'lobby'|'wind'|'playing'|'ended';
  players:Partial<Record<Seat,PublicPlayer>>;
  settings:{base:number;perTai:number;ronMode:'single'|'multiple';reactionSeconds:number;nextHandSeconds?:number};
  game?:{
    phase:GamePhase; turn:Seat; dealer:Seat; wallCount:number; deadWallCount:number;
    lastDiscard?:{seat:Seat;tile:Tile}; lastDrawId?:string;
    roundLabel:string; dealerContinuations:number; totals:Record<Seat,number>;
    prompt?:{kind:'discard-reaction'|'kong-reaction';options:ReactionOption[];deadline:number};
    canSelfDraw:boolean; concealedKongs:Tile[]; addedKongs:Tile[];
    settlement?:PublicSettlement;
  };
  // 抓風：四張蓋著的風牌，依入場順序（order）輪流翻；picker 為目前輪到的人，被翻開的牌帶 wind 與翻牌者名字
  windDraw?:{deadline:number;done:boolean;canPick:boolean;picker?:string;order:string[];tiles:{wind?:Seat;by?:string;mine?:boolean}[]};
  notice?:string;
}

export type ClientMessage =
  | {type:'HELLO';clientId:string;name:string}
  | {type:'CREATE_ROOM';name:string;avatar?:number;settings?:Partial<RoomSnapshot['settings']>&{aiCount?:number}}
  | {type:'JOIN_ROOM';code:string;name:string;avatar?:number}
  | {type:'SET_AVATAR';avatar:number}
  | {type:'SET_NAME';name:string}
  | {type:'PICK_WIND';index:number}
  | {type:'SET_READY';ready:boolean}
  | {type:'FILL_BOTS'}
  | {type:'START_GAME'}
  | {type:'ACTION';action:'DISCARD'|'DECLARE_READY';tileId:string}
  | {type:'ACTION';action:'PASS'}
  | {type:'ACTION';action:'REACTION';optionIndex:number}
  | {type:'ACTION';action:'SELF_DRAW'}
  | {type:'ACTION';action:'CONCEALED_KONG'|'ADDED_KONG';tileId:string}
  | {type:'NEXT_HAND'}
  | {type:'LEAVE_ROOM'}
  | {type:'PING'};
export type ServerMessage = {type:'WELCOME';clientId:string}|{type:'SNAPSHOT';snapshot:RoomSnapshot}|{type:'ERROR';message:string}|{type:'PONG'}|{type:'LEFT'};
