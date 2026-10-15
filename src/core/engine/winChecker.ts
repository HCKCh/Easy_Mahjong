import type { Meld, Tile } from '../types/mahjong.js';
import { tileKey } from './tiles.js';

// Standard Taiwan 16-tile hand: 5 melds + 1 pair total.
// This legacy helper expects the supplied collection itself to contain all melds.
export function isStandardWinningHand(tiles: Tile[]): boolean {
  if (tiles.some(t => t.kind === 'flower')) return false;
  if (tiles.length % 3 !== 2) return false;
  return canFormExactMeldsAndPair(tiles, (tiles.length - 2) / 3);
}

// Stage 1.5: meld-aware winning validation. Exposed chow/pong/kong each count
// as one of the five required melds, so concealed tile count shrinks accordingly.
export function isWinningHandWithMelds(concealed: Tile[], melds: Meld[]): boolean {
  if (melds.length > 5) return false;
  if (concealed.some(t => t.kind === 'flower')) return false;
  if (!melds.every(isValidMeld)) return false;
  const neededMelds = 5 - melds.length;
  if (concealed.length !== neededMelds * 3 + 2) return false;
  return canFormExactMeldsAndPair(concealed, neededMelds);
}

function isValidMeld(meld: Meld): boolean {
  if (meld.type === 'kong') {
    return meld.tiles.length === 4 && meld.tiles.every(t => tileKey(t) === tileKey(meld.tiles[0]));
  }
  if (meld.type === 'pong') {
    return meld.tiles.length === 3 && meld.tiles.every(t => tileKey(t) === tileKey(meld.tiles[0]));
  }
  if (meld.tiles.length !== 3 || meld.tiles.some(t => t.kind !== 'suit')) return false;
  const suitTiles = meld.tiles as Extract<Tile,{kind:'suit'}>[];
  if (!suitTiles.every(t => t.suit === suitTiles[0].suit)) return false;
  const ranks = suitTiles.map(t => t.rank).sort((a,b) => a-b);
  return ranks[1] === ranks[0] + 1 && ranks[2] === ranks[1] + 1;
}

function canFormExactMeldsAndPair(tiles: Tile[], exactMelds: number): boolean {
  const counts = new Map<string, number>();
  const proto = new Map<string, Tile>();
  for (const t of tiles) {
    const k = tileKey(t);
    counts.set(k, (counts.get(k) ?? 0) + 1);
    proto.set(k, t);
  }

  for (const [pairKey, n] of counts) {
    if (n < 2) continue;
    const work = new Map(counts);
    work.set(pairKey, n - 2);
    if (canFormMelds(work, proto, exactMelds)) return true;
  }
  return false;
}

function canFormMelds(counts: Map<string, number>, proto: Map<string, Tile>, meldsLeft?: number): boolean {
  const nextEntry = [...counts.entries()].find(([,n]) => n > 0);
  if (!nextEntry) return meldsLeft === undefined || meldsLeft === 0;
  if (meldsLeft !== undefined && meldsLeft <= 0) return false;
  const [key, n] = nextEntry;
  const tile = proto.get(key)!;

  if (n >= 3) {
    counts.set(key, n - 3);
    if (canFormMelds(counts, proto, meldsLeft === undefined ? undefined : meldsLeft - 1)) return true;
    counts.set(key, n);
  }

  if (tile.kind === 'suit' && tile.rank <= 7) {
    const k2 = `${tile.suit}:${tile.rank + 1}`;
    const k3 = `${tile.suit}:${tile.rank + 2}`;
    if ((counts.get(k2) ?? 0) > 0 && (counts.get(k3) ?? 0) > 0) {
      counts.set(key, n - 1);
      counts.set(k2, (counts.get(k2) ?? 0) - 1);
      counts.set(k3, (counts.get(k3) ?? 0) - 1);
      if (canFormMelds(counts, proto, meldsLeft === undefined ? undefined : meldsLeft - 1)) return true;
      counts.set(key, n);
      counts.set(k2, (counts.get(k2) ?? 0) + 1);
      counts.set(k3, (counts.get(k3) ?? 0) + 1);
    }
  }
  return false;
}

const tileTypes: Tile[] = [
  ...(['characters','dots','bamboo'] as const).flatMap(suit => [1,2,3,4,5,6,7,8,9].map(rank => ({kind:'suit', suit, rank, id:`probe-${suit}-${rank}`}) as Tile)),
  ...(['east','south','west','north'] as const).map(wind => ({kind:'wind', wind, id:`probe-wind-${wind}`}) as Tile),
  ...(['red','green','white'] as const).map(dragon => ({kind:'dragon', dragon, id:`probe-dragon-${dragon}`}) as Tile),
];

// Tenpai: one more tile of some type would complete the hand.
export function isTenpai(concealed: Tile[], melds: Meld[]): boolean {
  return tileTypes.some(t => isWinningHandWithMelds([...concealed, t], melds));
}

export function canFormMeldOnlyHand(tiles: Tile[]): boolean {
  if (tiles.some(t => t.kind === 'flower')) return false;
  if (tiles.length % 3 !== 0) return false;
  const counts = new Map<string, number>();
  const proto = new Map<string, Tile>();
  for (const t of tiles) {
    const k = tileKey(t);
    counts.set(k,(counts.get(k)??0)+1);
    proto.set(k,t);
  }
  return canFormMelds(counts,proto);
}
