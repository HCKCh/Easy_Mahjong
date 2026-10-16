import { describe, it, expect } from 'vitest';
import type { Seat, Tile } from '../types/mahjong.js';
import { createGame } from '../engine/game.js';
import { isWinningHandWithMelds, winningTileTypes } from '../engine/winChecker.js';
import { tileKey } from '../engine/tiles.js';
import { scoreTaiwanHand } from './scoring.js';

let n=0;
const m=(r:number):Tile=>({kind:'suit',suit:'characters',rank:r as 1,id:`m${r}-${n++}`});
const p=(r:number):Tile=>({kind:'suit',suit:'dots',rank:r as 1,id:`p${r}-${n++}`});
const s=(r:number):Tile=>({kind:'suit',suit:'bamboo',rank:r as 1,id:`s${r}-${n++}`});
const w=(x:'east'|'south'|'west'|'north'):Tile=>({kind:'wind',wind:x,id:`w${x}-${n++}`});

// An ended game where `winner` won on `tile` (discarded by `from`, or self-drawn when from is undefined).
function endedGame(winner:Seat,concealed:Tile[],tile:Tile,from?:Seat){
  const g=createGame(()=>0.5,'east');
  for(const x of ['east','south','west','north'] as Seat[]){g.players[x].flowers=[];g.players[x].melds=[];}
  g.players[winner].concealed=from?concealed:[...concealed,tile];
  g.phase='ended';g.winner=winner;g.winners=[winner];g.winningTile=tile;
  g.endReason=from?'win':'self_draw';g.winFrom=from;
  g.events=[{type:'GAME_STARTED',dealer:'east'},{type:'DISCARD',seat:'east',tile:m(9)},{type:'DISCARD',seat:'south',tile:m(9)}];
  return g;
}

describe('win detection does not depend on tile order', () => {
  // 123m 456m 789m 123s EE + 4p5p → waits on 3p and 6p
  const hand=[m(1),m(2),m(3),m(4),m(5),m(6),m(7),m(8),m(9),s(1),s(2),s(3),w('east'),w('east'),p(4),p(5)];
  it('detects a win when the claimed tile is appended last', () => {
    expect(isWinningHandWithMelds([...hand,p(3)],[])).toBe(true);
    expect(isWinningHandWithMelds([...hand,p(6)],[])).toBe(true);
  });
  it('lists both ends of a two-sided wait', () => {
    expect(winningTileTypes(hand,[]).map(tileKey).sort()).toEqual(['dots:3','dots:6']);
  });
});

describe('scoring uses a real split of the hand', () => {
  it('a pung completed by a discard is not concealed (no 三暗坎 from two concealed pungs)', () => {
    // EEE SSS WW NN 123m 456m, wins on W from north → pungs E, S (concealed) + W (by discard)
    const hand=[w('east'),w('east'),w('east'),w('south'),w('south'),w('south'),w('west'),w('west'),w('north'),w('north'),m(1),m(2),m(3),m(4),m(5),m(6)];
    const r=scoreTaiwanHand({state:endedGame('south',hand,w('west'),'north'),winner:'south'});
    expect(r.items.map(i=>i.id)).not.toContain('three_concealed_triplets');
    expect(r.items.map(i=>i.id)).not.toContain('single_wait'); // two waits (W, N): not a sole wait
  });
  it('runs are not mistaken for pungs', () => {
    // 2p2p2p3p4p = pair 22p + run 234p; with 123m 456m 789m 123s, self-draw on 4p
    const hand=[p(2),p(2),p(2),p(3),m(1),m(2),m(3),m(4),m(5),m(6),m(7),m(8),m(9),s(1),s(2),s(3)];
    const r=scoreTaiwanHand({state:endedGame('south',hand,p(4)),winner:'south'});
    const ids=r.items.map(i=>i.id);
    expect(ids).not.toContain('all_pungs');
    expect(ids).not.toContain('three_concealed_triplets');
  });
  it('111222333 is scored as three concealed pungs when that is worth more', () => {
    const hand=[m(1),m(1),m(1),m(2),m(2),m(2),m(3),m(3),m(3),p(4),p(5),p(6),s(7),s(8),s(9),w('east')];
    const r=scoreTaiwanHand({state:endedGame('south',hand,w('east')),winner:'south'});
    expect(r.items.map(i=>i.id)).toContain('three_concealed_triplets');
  });
  it('edge wait only scores when it is the only wait', () => {
    // 123p 456p 789p 555s EE + 1m2m → only 3m completes it
    const hand=[p(1),p(2),p(3),p(4),p(5),p(6),p(7),p(8),p(9),s(5),s(5),s(5),w('east'),w('east'),m(1),m(2)];
    const r=scoreTaiwanHand({state:endedGame('south',hand,m(3),'north'),winner:'south'});
    expect(r.items.map(i=>i.id)).toContain('edge_wait');
  });
});
