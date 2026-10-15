import type { Tile, Suit, Wind, Dragon, Flower } from '../types/mahjong.js';

const suits: Suit[] = ['characters', 'dots', 'bamboo'];
const winds: Wind[] = ['east', 'south', 'west', 'north'];
const dragons: Dragon[] = ['red', 'green', 'white'];
const flowers: Flower[] = ['plum', 'orchid', 'bamboo', 'chrysanthemum', 'spring', 'summer', 'autumn', 'winter'];

export function createTaiwanTileSet(): Tile[] {
  const tiles: Tile[] = [];
  for (const suit of suits) {
    for (let rank = 1; rank <= 9; rank++) {
      for (let copy = 0; copy < 4; copy++) {
        tiles.push({ kind: 'suit', suit, rank: rank as 1|2|3|4|5|6|7|8|9, id: `${suit}-${rank}-${copy}` });
      }
    }
  }
  for (const wind of winds) {
    for (let copy = 0; copy < 4; copy++) tiles.push({ kind: 'wind', wind, id: `wind-${wind}-${copy}` });
  }
  for (const dragon of dragons) {
    for (let copy = 0; copy < 4; copy++) tiles.push({ kind: 'dragon', dragon, id: `dragon-${dragon}-${copy}` });
  }
  for (const flower of flowers) tiles.push({ kind: 'flower', flower, id: `flower-${flower}` });
  return tiles;
}

export function shuffle<T>(items: T[], rng = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function tileKey(tile: Tile): string {
  if (tile.kind === 'suit') return `${tile.suit}:${tile.rank}`;
  if (tile.kind === 'wind') return `wind:${tile.wind}`;
  if (tile.kind === 'dragon') return `dragon:${tile.dragon}`;
  return `flower:${tile.flower}`;
}
