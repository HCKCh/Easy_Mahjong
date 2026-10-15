import type { GameState, Seat, Tile } from '../types/mahjong.js';
import { tileKey } from './tiles.js';
import { canFormMeldOnlyHand, isStandardWinningHand } from './winChecker.js';

export interface DerivedWinFlags {
  kongBlossom: boolean;
  robKong: boolean;
  edgeWait: boolean;
  closedWait: boolean;
  singleWait: boolean;
  lastTile: boolean;
  eightFlowers: boolean;
  heavenWin: boolean;
  earthWin: boolean;
  humanWin: boolean;
  declaredReady: boolean;
}

function removeOneByKey(tiles: Tile[], key: string): Tile[] | null {
  const i=tiles.findIndex(t=>tileKey(t)===key);
  if(i<0) return null;
  return [...tiles.slice(0,i),...tiles.slice(i+1)];
}

function finalConcealed(state:GameState,winner:Seat):Tile[]{
  const tiles=[...state.players[winner].concealed];
  const wt=state.winningTile;
  if (wt && state.endReason!=='self_draw' && !tiles.some(t=>t.id===wt.id)) tiles.push(wt);
  return tiles;
}

function deriveWait(state:GameState,winner:Seat):Pick<DerivedWinFlags,'edgeWait'|'closedWait'|'singleWait'>{
  const wt=state.winningTile;
  if(!wt) return {edgeWait:false,closedWait:false,singleWait:false};
  let pre=removeOneByKey(finalConcealed(state,winner),tileKey(wt));
  if(!pre) return {edgeWait:false,closedWait:false,singleWait:false};

  const pairRest=removeOneByKey(pre,tileKey(wt));
  const singleWait=!!pairRest && canFormMeldOnlyHand(pairRest);
  let edgeWait=false,closedWait=false;
  if(wt.kind==='suit'){
    const take=(r1:number,r2:number):boolean=>{
      if(r1<1||r1>9||r2<1||r2>9) return false;
      const a=removeOneByKey(pre!,`${wt.suit}:${r1}`); if(!a) return false;
      const b=removeOneByKey(a,`${wt.suit}:${r2}`); if(!b) return false;
      return isStandardWinningHand(b);
    };
    closedWait=take(wt.rank-1,wt.rank+1);
    if(wt.rank===3) edgeWait=take(1,2);
    if(wt.rank===7) edgeWait=take(8,9);
  }
  return {edgeWait,closedWait,singleWait};
}

export function deriveWinFlags(state: GameState, winner: Seat): DerivedWinFlags {
  const isSelfDraw=state.endReason==='self_draw';
  const hasSelfDrawEvent=state.events.some(e=>e.type==='SELF_DRAW'&&e.seat===winner);
  const hasWinEvent=state.events.some(e=>e.type==='WIN'&&e.seat===winner);
  const discardCount=state.events.filter(e=>e.type==='DISCARD').length;
  const winnerDiscardCount=state.events.filter(e=>e.type==='DISCARD'&&e.seat===winner).length;
  const winnerDrawCount=state.events.filter(e=>e.type==='DRAW'&&e.seat===winner).length;
  const wait=deriveWait(state,winner);

  return {
    kongBlossom:isSelfDraw&&hasSelfDrawEvent&&!!state.lastDraw?.replacement&&state.lastDraw.seat===winner,
    robKong:state.endReason==='rob_kong'||state.events.some(e=>e.type==='ROB_KONG_WIN'&&e.seat===winner),
    ...wait,
    lastTile:isSelfDraw&&hasSelfDrawEvent&&state.wall.length===0&&state.lastDraw?.seat===winner&&!state.lastDraw.replacement,
    eightFlowers:state.players[winner].flowers.length===8,
    heavenWin:winner===state.dealer&&isSelfDraw&&hasSelfDrawEvent&&discardCount===0,
    earthWin:winner!==state.dealer&&isSelfDraw&&hasSelfDrawEvent&&winnerDrawCount===1&&winnerDiscardCount===0,
    humanWin:state.endReason==='win'&&hasWinEvent&&winner!==state.dealer&&discardCount===1,
    declaredReady:state.declaredReady?.includes(winner)??false,
  };
}
