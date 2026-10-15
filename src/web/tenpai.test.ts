import { describe, it, expect } from 'vitest';
import type { Tile } from '../core/types/mahjong.js';
import { waitsFor, discardsToTenpai } from './tenpai.js';
import { tileKey } from '../core/engine/tiles.js';

let n=0;
const c=(r:number):Tile=>({kind:'suit',suit:'characters',rank:r as 1,id:`c${r}-${n++}`});
const d=(r:number):Tile=>({kind:'suit',suit:'dots',rank:r as 1,id:`d${r}-${n++}`});
const red=():Tile=>({kind:'dragon',dragon:'red',id:`r-${n++}`});

// 123m 456m 789m 123p 456p + 紅中 單吊 → 聽紅中；以及 23p 兩面
describe('tenpai', () => {
  it('finds waits and remaining counts', () => {
    const hand=[c(1),c(2),c(3),c(4),c(5),c(6),c(7),c(8),c(9),d(1),d(2),d(3),d(4),d(5),d(6),red()];
    const w=waitsFor(hand,[],[...hand,red()]);
    expect(w.map(x=>tileKey(x.tile))).toEqual(['dragon:red']);
    expect(w[0].left).toBe(2);
  });
  it('two-sided wait', () => {
    const hand=[c(1),c(2),c(3),c(4),c(5),c(6),c(7),c(8),c(9),d(1),d(1),d(1),red(),red(),d(2),d(3)];
    expect(waitsFor(hand,[]).map(x=>tileKey(x.tile))).toEqual(['dots:1','dots:4','dragon:red']);
  });
  it('lists discards that reach tenpai', () => {
    const hand=[c(1),c(2),c(3),c(4),c(5),c(6),c(7),c(8),c(9),d(1),d(2),d(3),d(4),d(5),d(6),red(),d(9)];
    const m=discardsToTenpai(hand,[]);
    expect(m.get('dots:9')?.map(x=>tileKey(x.tile))).toEqual(['dragon:red']);
    expect(m.get('dragon:red')?.map(x=>tileKey(x.tile))).toEqual(['dots:9']);
  });
});
