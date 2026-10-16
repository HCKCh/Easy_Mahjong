import { describe, it, expect } from 'vitest';
import { createGame, discardTile, drawTile } from './game.js';
import { getReactionOptions, settleDiscardReactionWindow, seats } from './actions.js';
import { auditTiles } from './audit.js';

describe('tile audit', () => {
  it('a fresh deal has all 144 tiles (108 suits, 28 honors, 8 flowers)', () => {
    const a = auditTiles(createGame());
    expect(a).toMatchObject({ ok: true, total: 144, suits: 108, honors: 28, flowers: 8, problems: [] });
  });

  it('stays intact through many turns with calls', () => {
    const g = createGame();
    for (let turn = 0; turn < 200 && g.phase !== 'ended'; turn++) {
      if (g.phase === 'awaiting_draw') { try { drawTile(g, g.turn); } catch { break; } }
      if (g.phase === 'awaiting_discard') discardTile(g, g.turn, g.players[g.turn].concealed.find(t => t.kind !== 'flower')!.id);
      if (g.phase === 'awaiting_reactions') {
        const from = g.lastDiscard!.seat;
        // take the first pong/chow offered so melds are exercised, never win
        const decisions = seats.filter(s => s !== from).map(seat => {
          const o = getReactionOptions(g, seat).find(x => x.type === 'pong' || x.type === 'chow');
          return o ? { seat, type: o.type, tiles: o.tiles } : { seat, type: 'pass' as const };
        });
        const firstCall = decisions.find(d => d.type !== 'pass');
        settleDiscardReactionWindow(g, decisions.map(d => d === firstCall ? d : { seat: d.seat, type: 'pass' as const }));
      }
      expect(auditTiles(g).problems).toEqual([]);
    }
  });

  it('detects a lost or duplicated tile', () => {
    const g = createGame();
    const lost = g.wall.pop()!;
    expect(auditTiles(g).ok).toBe(false);
    g.wall.push(lost, { ...lost });
    expect(auditTiles(g).problems.some(p => p.startsWith('duplicate'))).toBe(true);
  });
});
