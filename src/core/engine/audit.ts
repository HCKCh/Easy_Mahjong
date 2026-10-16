import type { GameState, Seat, Tile } from '../types/mahjong.js';
import { tileKey } from './tiles.js';

const seats: Seat[] = ['east','south','west','north'];

export interface TileAudit {
  ok: boolean;
  total: number;    // expected 144
  suits: number;    // expected 108 (characters, dots, bamboo)
  honors: number;   // expected 28 (winds, dragons)
  flowers: number;  // expected 8
  problems: string[];
}

// Counts every tile wherever it is (wall, dead wall, hands, melds, discards, flowers)
// and checks the 144-tile set is intact: no tile lost, duplicated or invented.
export function auditTiles(state: GameState): TileAudit {
  const all: Tile[] = [...state.wall, ...state.deadWall];
  for (const s of seats) {
    const p = state.players[s];
    all.push(...p.concealed, ...p.flowers, ...p.discards, ...p.melds.flatMap(m => m.tiles));
  }
  const problems: string[] = [];
  const ids = new Map<string, number>();
  for (const t of all) ids.set(t.id, (ids.get(t.id) ?? 0) + 1);
  const dupes = [...ids].filter(([, n]) => n > 1).map(([id]) => id);
  if (dupes.length) problems.push(`duplicate tiles: ${dupes.join(', ')}`);

  const byKey = new Map<string, number>();
  for (const t of all) byKey.set(tileKey(t), (byKey.get(tileKey(t)) ?? 0) + 1);
  for (const [key, n] of byKey) {
    const expected = key.startsWith('flower:') ? 1 : 4;
    if (n !== expected) problems.push(`${key} x${n} (expected ${expected})`);
  }

  const suits = all.filter(t => t.kind === 'suit').length;
  const honors = all.filter(t => t.kind === 'wind' || t.kind === 'dragon').length;
  const flowers = all.filter(t => t.kind === 'flower').length;
  if (all.length !== 144) problems.push(`total ${all.length} (expected 144)`);
  if (suits !== 108) problems.push(`suits ${suits} (expected 108)`);
  if (honors !== 28) problems.push(`honors ${honors} (expected 28)`);
  if (flowers !== 8) problems.push(`flowers ${flowers} (expected 8)`);
  if (byKey.size !== 42) problems.push(`${byKey.size} tile types (expected 42)`);

  return { ok: problems.length === 0, total: all.length, suits, honors, flowers, problems };
}
