import type { GameState, PlayerState, Seat, Tile } from '../types/mahjong.js';
import { createTaiwanTileSet, shuffle } from './tiles.js';
import { removeOneById, sortTiles } from './hand.js';
import { taiwanRules } from '../rules/taiwan.js';
import { isReadyDeclared, nextSeat } from './actions.js';
import { isTenpai } from './winChecker.js';
import { mergeRoomRules, type RoomRules } from '../rules/roomRules.js';

const seats: Seat[] = ['east', 'south', 'west', 'north'];

function emptyPlayer(seat: Seat): PlayerState {
  return { seat, concealed: [], flowers: [], melds: [], discards: [] };
}

function drawReplacement(state: GameState, seat: Seat): Tile {
  // 王牌用完時改從牌牆尾端補牌；兩者都沒牌才以流局結束
  const tile = state.deadWall.pop() ?? state.wall.pop();
  if (!tile) {
    state.phase = 'ended';
    state.endReason = 'wall_exhausted';
    state.events.push({type:'DRAW_GAME', reason:'wall_exhausted'});
    throw new Error('Wall exhausted');
  }
  if (tile.kind === 'flower') {
    state.players[seat].flowers.push(tile);
    state.events.push({type:'FLOWER_REVEALED', seat, tile});
    return drawReplacement(state, seat);
  }
  state.players[seat].concealed.push(tile);
  state.players[seat].concealed = sortTiles(state.players[seat].concealed);
  state.lastDraw = {seat, tile, replacement:true};
  state.events.push({type:'DRAW', seat, tile, replacement:true});
  return tile;
}

function normalizeFlowers(state: GameState, seat: Seat): void {
  let changed = true;
  while (changed) {
    changed = false;
    const hand = state.players[seat].concealed;
    const flowerIdx = hand.findIndex(t => t.kind === 'flower');
    if (flowerIdx >= 0) {
      const [flower] = hand.splice(flowerIdx, 1);
      state.players[seat].flowers.push(flower);
      state.events.push({type:'FLOWER_REVEALED', seat, tile:flower});
      drawReplacement(state, seat);
      changed = true;
    }
  }
  state.players[seat].concealed = sortTiles(state.players[seat].concealed);
}

export function createGame(rng = Math.random, dealer: Seat = 'east', roomRules: Partial<RoomRules> = {}): GameState {
  const all = shuffle(createTaiwanTileSet(), rng);
  const deadWall = all.splice(all.length - taiwanRules.deadWallSize);
  const players = {
    east: emptyPlayer('east'), south: emptyPlayer('south'), west: emptyPlayer('west'), north: emptyPlayer('north')
  } satisfies Record<Seat, PlayerState>;

  for (let i = 0; i < taiwanRules.handSize; i++) {
    for (const seat of seats) players[seat].concealed.push(all.shift()!);
  }
  players[dealer].concealed.push(all.shift()!);

  const state: GameState = {
    dealer,
    turn: dealer,
    wall: all,
    deadWall,
    players,
    phase: 'awaiting_discard',
    passedReactions: [],
    events: [{type:'GAME_STARTED', dealer}],
    rules: mergeRoomRules(roomRules),
    temporaryFuriten: [],
  };

  for (const seat of seats) normalizeFlowers(state, seat);
  state.lastDraw = undefined;
  return state;
}

export function drawTile(state: GameState, seat: Seat): Tile {
  if (state.phase === 'ended') throw new Error('Game ended');
  if (state.phase !== 'awaiting_draw') throw new Error('Not in draw phase');
  if (state.turn !== seat) throw new Error('Not your turn');

  if (state.temporaryFuriten?.includes(seat)) {
    state.temporaryFuriten = state.temporaryFuriten.filter(s => s !== seat);
  }

  const tile = state.wall.shift();
  if (!tile) {
    state.phase = 'ended';
    state.endReason = 'wall_exhausted';
    state.events.push({type:'DRAW_GAME', reason:'wall_exhausted'});
    throw new Error('Wall exhausted');
  }

  if (tile.kind === 'flower') {
    state.players[seat].flowers.push(tile);
    state.events.push({type:'FLOWER_REVEALED', seat, tile});
    const replacement = drawReplacement(state, seat);
    state.phase = 'awaiting_discard';
    return replacement;
  }

  state.players[seat].concealed.push(tile);
  state.players[seat].concealed = sortTiles(state.players[seat].concealed);
  state.lastDraw = {seat, tile, replacement:false};
  state.events.push({type:'DRAW', seat, tile, replacement:false});
  state.phase = 'awaiting_discard';
  return tile;
}

export function discardTile(state: GameState, seat: Seat, tileId: string): Tile {
  if (state.phase === 'ended') throw new Error('Game ended');
  if (state.phase !== 'awaiting_discard') throw new Error('Not in discard phase');
  if (state.turn !== seat) throw new Error('Not your turn');

  const tile = state.players[seat].concealed.find(t => t.id === tileId);
  if (!tile) throw new Error('Tile not in hand');
  if (tile.kind === 'flower') throw new Error('Cannot discard flower');
  if (isReadyDeclared(state, seat) && state.lastDraw?.seat === seat && tile.id !== state.lastDraw.tile.id) throw new Error('Declared ready: only the drawn tile can be discarded');

  state.players[seat].concealed = removeOneById(state.players[seat].concealed, tileId);
  state.players[seat].discards.push(tile);
  state.lastDiscard = { seat, tile };
  state.lastDraw = undefined;
  state.passedReactions = [];
  state.turn = nextSeat(seat);
  state.phase = 'awaiting_reactions';
  state.events.push({type:'DISCARD', seat, tile});
  return tile;
}

// Declare ready (聽牌): discard a tile that leaves the hand in tenpai. Worth +1 tai if the hand wins.
export function canDeclareReady(state: GameState, seat: Seat, tileId: string): boolean {
  if (state.phase !== 'awaiting_discard' || state.turn !== seat || isReadyDeclared(state, seat)) return false;
  const p = state.players[seat];
  const tile = p.concealed.find(t => t.id === tileId);
  if (!tile || tile.kind === 'flower') return false;
  return isTenpai(p.concealed.filter(t => t.id !== tileId), p.melds);
}

export function declareReady(state: GameState, seat: Seat, tileId: string): Tile {
  if (!canDeclareReady(state, seat, tileId)) throw new Error('Cannot declare ready with this discard');
  const tile = discardTile(state, seat, tileId);
  (state.declaredReady ??= []).push(seat);
  state.events.push({type:'READY_DECLARED', seat, tile});
  return tile;
}

export function forceAdvanceAfterDiscard(state: GameState): void {
  if (state.phase !== 'awaiting_reactions' || !state.lastDiscard) throw new Error('No discard to advance');
  state.lastDiscard = undefined;
  state.passedReactions = [];
  state.phase = 'awaiting_draw';
}

export function endAsWallExhausted(state: GameState): void {
  state.phase = 'ended';
  state.endReason = 'wall_exhausted';
  state.events.push({type:'DRAW_GAME', reason:'wall_exhausted'});
}
