import type { Tile } from '../types/mahjong.js';
import { tileKey } from './tiles.js';

export function sortTiles(tiles: Tile[]): Tile[] {
  const order = (t: Tile) => {
    if (t.kind === 'suit') {
      const base = t.suit === 'characters' ? 0 : t.suit === 'dots' ? 20 : 40;
      return base + t.rank;
    }
    if (t.kind === 'wind') return 60 + ['east','south','west','north'].indexOf(t.wind);
    if (t.kind === 'dragon') return 70 + ['red','green','white'].indexOf(t.dragon);
    return 100 + t.id.charCodeAt(0);
  };
  return [...tiles].sort((a,b) => order(a) - order(b));
}

export function removeOneById(tiles: Tile[], tileId: string): Tile[] {
  const idx = tiles.findIndex(t => t.id === tileId);
  if (idx < 0) throw new Error(`Tile not found: ${tileId}`);
  return [...tiles.slice(0, idx), ...tiles.slice(idx + 1)];
}

export function countByKey(tiles: Tile[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tiles) m.set(tileKey(t), (m.get(tileKey(t)) ?? 0) + 1);
  return m;
}
