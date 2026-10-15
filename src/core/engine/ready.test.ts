import { describe, it, expect } from 'vitest';
import type { Seat, Tile } from '../types/mahjong.js';
import { createGame, canDeclareReady, declareReady, discardTile } from './game.js';
import { getReactionOptions, settleDiscardReactionWindow, declareConcealedKong } from './actions.js';
import { scoreTaiwanHand } from '../scoring/scoring.js';

let n=0;
const c=(r:number):Tile=>({kind:'suit',suit:'characters',rank:r as 1,id:`t-c${r}-${n++}`});
const d=(r:number):Tile=>({kind:'suit',suit:'dots',rank:r as 1,id:`t-d${r}-${n++}`});
const b=(r:number):Tile=>({kind:'suit',suit:'bamboo',rank:r as 1,id:`t-b${r}-${n++}`});
const red=():Tile=>({kind:'dragon',dragon:'red',id:`t-red-${n++}`});

// East: 111m 456m 789m 123p 456p + 紅中 + 9索 → 打 9索 單吊紅中
function setup(){
  const g=createGame(()=>0.5,'east');
  const nine=b(9);
  g.players.east.concealed=[c(1),c(1),c(1),c(4),c(5),c(6),c(7),c(8),c(9),d(1),d(2),d(3),d(4),d(5),d(6),red(),nine];
  g.players.east.melds=[];g.turn='east';g.phase='awaiting_discard';g.lastDraw={seat:'east',tile:nine,replacement:false};
  return {g,nine};
}
function allPass(g:ReturnType<typeof createGame>,except:Seat){
  const others=(['east','south','west','north'] as Seat[]).filter(s=>s!==except);
  settleDiscardReactionWindow(g,others.map(seat=>({seat,type:'pass'})));
}
function discardAs(g:ReturnType<typeof createGame>,seat:Seat,tile:Tile){
  g.players[seat].concealed.push(tile);g.turn=seat;g.phase='awaiting_discard';g.lastDraw={seat,tile,replacement:false};
  discardTile(g,seat,tile.id);
}

describe('declare ready (聽牌)', () => {
  it('only allows a discard that leaves the hand in tenpai', () => {
    const {g,nine}=setup();
    expect(canDeclareReady(g,'east',nine.id)).toBe(true);
    expect(canDeclareReady(g,'east',g.players.east.concealed[3].id)).toBe(false);
  });

  it('locks the hand: no pong/kong, only the drawn tile may be discarded, +1 tai on win', () => {
    const {g,nine}=setup();
    declareReady(g,'east',nine.id);
    expect(g.declaredReady).toEqual(['east']);
    allPass(g,'east');

    // South discards 1萬: East holds three but may not pong or kong
    discardAs(g,'south',c(1));
    expect(getReactionOptions(g,'east').map(o=>o.type)).toEqual(['pass']);
    allPass(g,'south');

    // East draws a tile: only that tile can be discarded, and no concealed kong
    const drawn=c(2);
    g.players.east.concealed.push(drawn);g.turn='east';g.phase='awaiting_discard';g.lastDraw={seat:'east',tile:drawn,replacement:false};
    expect(()=>discardTile(g,'east',g.players.east.concealed[0].id)).toThrow();
    expect(()=>declareConcealedKong(g,'east',g.players.east.concealed[0].id)).toThrow();
    discardTile(g,'east',drawn.id);
    allPass(g,'east');

    // West discards 紅中: East wins and scores the declared-ready tai
    discardAs(g,'west',red());
    expect(getReactionOptions(g,'east').some(o=>o.type==='win')).toBe(true);
    const win=getReactionOptions(g,'east').find(o=>o.type==='win')!;
    settleDiscardReactionWindow(g,[{seat:'east',type:'win',tiles:win.tiles},{seat:'south',type:'pass'},{seat:'north',type:'pass'}]);
    expect(g.winner).toBe('east');
    const score=scoreTaiwanHand({state:g,winner:'east'});
    expect(score.items.find(i=>i.id==='declared_ready')?.tai).toBe(1);
  });
});
