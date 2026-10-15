import type { GameState, Seat, Tile, Meld } from '../types/mahjong.js';
import { tileKey } from './tiles.js';
import { sortTiles } from './hand.js';
import { isStandardWinningHand, isWinningHandWithMelds } from './winChecker.js';
import { defaultRoomRules, type RoomRules } from '../rules/roomRules.js';

export const seats: Seat[] = ['east','south','west','north'];
export type ReactionType = 'pass'|'chow'|'pong'|'kong'|'win';

export interface ReactionOption {
  type: ReactionType;
  seat: Seat;
  tiles?: Tile[];
  context?: 'discard'|'added_kong';
}

export function nextSeat(seat: Seat): Seat {
  return seats[(seats.indexOf(seat)+1)%4];
}

function sameType(a: Tile,b: Tile): boolean { return tileKey(a) === tileKey(b); }

export function getReactionOptions(state: GameState, seat: Seat): ReactionOption[] {
  const ld = state.lastDiscard;
  if (!ld || ld.seat === seat || state.phase !== 'awaiting_reactions') return [];

  const hand = state.players[seat].concealed;
  const options: ReactionOption[] = [{type:'pass', seat, context:'discard'}];
  const matches = hand.filter(t => sameType(t, ld.tile));
  // A declared-ready hand is locked: it may only win or pass.
  const locked = isReadyDeclared(state, seat);

  if (!locked && matches.length >= 2) options.push({type:'pong', seat, tiles:[matches[0],matches[1],ld.tile], context:'discard'});
  if (!locked && matches.length >= 3) options.push({type:'kong', seat, tiles:[matches[0],matches[1],matches[2],ld.tile], context:'discard'});

  if (!locked && ld.tile.kind === 'suit' && nextSeat(ld.seat) === seat) {
    const discardedTile = ld.tile;
    const suit = discardedTile.suit;
    const r = discardedTile.rank;
    const candidates = [[r-2,r-1],[r-1,r+1],[r+1,r+2]];

    for (const pair of candidates) {
      if (pair[0] < 1 || pair[1] > 9) continue;
      const a = hand.find(t => t.kind==='suit' && t.suit===suit && t.rank===pair[0]);
      const b = hand.find(t => t.kind==='suit' && t.suit===suit && t.rank===pair[1]);
      if (a && b) options.push({type:'chow', seat, tiles:[a,b,discardedTile], context:'discard'});
    }
  }

  const blocked = state.temporaryFuriten?.includes(seat) ?? false;
  if (!blocked && isWinningHandWithMelds([...hand, ld.tile], state.players[seat].melds)) {
    options.push({type:'win', seat, tiles:[ld.tile], context:'discard'});
  }
  return options;
}

export function getKongReactionOptions(state: GameState, seat: Seat): ReactionOption[] {
  const pending = state.pendingAddedKong;
  if (!pending || state.phase !== 'awaiting_kong_reactions' || seat === pending.seat) return [];
  const options: ReactionOption[] = [{type:'pass', seat, context:'added_kong'}];
  const blocked = state.temporaryFuriten?.includes(seat) ?? false;
  if (!blocked && isWinningHandWithMelds([...state.players[seat].concealed, pending.tile], state.players[seat].melds)) {
    options.push({type:'win', seat, tiles:[pending.tile], context:'added_kong'});
  }
  return options;
}

export function getAllReactionOptions(state: GameState): ReactionOption[] {
  if (state.phase === 'awaiting_kong_reactions' && state.pendingAddedKong) {
    return seats.filter(s => s !== state.pendingAddedKong!.seat).flatMap(s => getKongReactionOptions(state,s));
  }
  if (!state.lastDiscard || state.phase !== 'awaiting_reactions') return [];
  return seats.filter(seat => seat !== state.lastDiscard!.seat).flatMap(seat => getReactionOptions(state, seat));
}

export function reactionPriority(type: ReactionType): number {
  return type === 'win' ? 4 : type === 'kong' ? 3 : type === 'pong' ? 2 : type === 'chow' ? 1 : 0;
}

function distanceFromDiscarder(discarder: Seat, seat: Seat): number {
  const from = seats.indexOf(discarder);
  const to = seats.indexOf(seat);
  return (to - from + 4) % 4;
}

export function resolveReaction(options: ReactionOption[], discarder?: Seat): ReactionOption | null {
  const actionable = options.filter(o => o.type !== 'pass');
  if (!actionable.length) return null;
  return [...actionable].sort((a,b) => {
    const p = reactionPriority(b.type)-reactionPriority(a.type);
    if (p !== 0) return p;
    if (!discarder) return 0;
    return distanceFromDiscarder(discarder, a.seat) - distanceFromDiscarder(discarder, b.seat);
  })[0];
}

function removeClaimTilesFromHand(state: GameState, reaction: ReactionOption, discarded: Tile): void {
  const p = state.players[reaction.seat];
  const needed = reaction.tiles!.filter(t => t.id !== discarded.id);
  for (const t of needed) {
    const idx = p.concealed.findIndex(x => x.id === t.id);
    if (idx < 0) throw new Error('Claim tile missing from hand');
    p.concealed.splice(idx,1);
  }
}

function removeLastDiscardFromRiver(state: GameState): void {
  const ld = state.lastDiscard!;
  const discards = state.players[ld.seat].discards;
  const idx = discards.findIndex(t => t.id === ld.tile.id);
  if (idx >= 0) discards.splice(idx,1);
}

function drawReplacementFromDeadWall(state: GameState, seat: Seat): Tile {
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
    return drawReplacementFromDeadWall(state, seat);
  }
  state.players[seat].concealed.push(tile);
  state.players[seat].concealed = sortTiles(state.players[seat].concealed);
  state.lastDraw = {seat, tile, replacement:true};
  state.events.push({type:'DRAW', seat, tile, replacement:true});
  return tile;
}

export function claimDiscard(state: GameState, reaction: ReactionOption): void {
  const ld = state.lastDiscard;
  if (!ld) throw new Error('No discard to claim');
  if (state.phase !== 'awaiting_reactions') throw new Error('Not accepting reactions');
  if (reaction.seat === ld.seat) throw new Error('Discarder cannot claim own discard');

  const legal = getReactionOptions(state, reaction.seat);
  const matchesLegal = legal.some(o => {
    if (o.type !== reaction.type) return false;
    if (!reaction.tiles || !o.tiles) return o.type === reaction.type;
    return [...o.tiles].map(t => t.id).sort().join('|') === [...reaction.tiles].map(t => t.id).sort().join('|');
  });
  if (!matchesLegal) throw new Error('Illegal reaction');

  if (reaction.type === 'win') {
    state.phase = 'ended'; state.turn = reaction.seat; state.winner = reaction.seat; state.winners = [reaction.seat];
    state.winFrom = ld.seat; state.winningTile = ld.tile; state.endReason = 'win';
    state.events.push({type:'WIN', seat:reaction.seat, from:ld.seat, tile:ld.tile});
    return;
  }

  if (!reaction.tiles) throw new Error('Reaction tiles missing');
  if (!['chow','pong','kong'].includes(reaction.type)) throw new Error('Invalid claim');
  removeClaimTilesFromHand(state, reaction, ld.tile);

  const meld: Meld = reaction.type === 'chow'
    ? {type:'chow', tiles:reaction.tiles, from:ld.seat}
    : reaction.type === 'pong'
      ? {type:'pong', tiles:reaction.tiles, from:ld.seat}
      : {type:'kong', tiles:reaction.tiles, from:ld.seat, concealed:false};
  state.players[reaction.seat].melds.push(meld);
  removeLastDiscardFromRiver(state);

  if (reaction.type === 'chow') state.events.push({type:'CHOW', seat:reaction.seat, from:ld.seat, tiles:reaction.tiles});
  if (reaction.type === 'pong') state.events.push({type:'PONG', seat:reaction.seat, from:ld.seat, tiles:reaction.tiles});
  if (reaction.type === 'kong') state.events.push({type:'KONG', seat:reaction.seat, from:ld.seat, tiles:reaction.tiles, concealed:false, added:false});

  state.lastDiscard = undefined; state.passedReactions = []; state.turn = reaction.seat; state.phase = 'awaiting_discard';
  if (reaction.type === 'kong') drawReplacementFromDeadWall(state, reaction.seat);
}

function finalizeAddedKong(state: GameState): void {
  const pending = state.pendingAddedKong;
  if (!pending) throw new Error('No pending added kong');
  const player = state.players[pending.seat];
  const idx = player.concealed.findIndex(t => t.id === pending.tile.id);
  if (idx < 0) throw new Error('Added kong tile missing from hand');
  player.concealed.splice(idx,1);
  const old = player.melds[pending.meldIndex];
  if (!old || old.type !== 'pong') throw new Error('Matching pong no longer exists');
  const tiles = [...old.tiles,pending.tile];
  player.melds[pending.meldIndex] = {type:'kong',tiles,from:old.from,concealed:false};
  state.events.push({type:'KONG',seat:pending.seat,from:old.from,tiles,concealed:false,added:true});
  state.pendingAddedKong = undefined; state.passedReactions = []; state.turn = pending.seat; state.phase = 'awaiting_discard';
  drawReplacementFromDeadWall(state,pending.seat);
}

export function claimRobKong(state: GameState, reaction: ReactionOption): void {
  const pending = state.pendingAddedKong;
  if (!pending || state.phase !== 'awaiting_kong_reactions') throw new Error('No added kong reaction window');
  if (reaction.type !== 'win' || reaction.context !== 'added_kong') throw new Error('Only win can claim an added kong');
  const legal = getKongReactionOptions(state,reaction.seat);
  if (!legal.some(o => o.type === 'win')) throw new Error('Illegal rob kong win');
  state.phase='ended'; state.turn=reaction.seat; state.winner=reaction.seat; state.winners=[reaction.seat]; state.winFrom=pending.seat;
  state.winningTile=pending.tile; state.endReason='rob_kong';
  state.events.push({type:'ROB_KONG_WIN',seat:reaction.seat,from:pending.seat,tile:pending.tile});
  state.pendingAddedKong=undefined; state.passedReactions=[];
}

function markMissedWinIfNeeded(state: GameState, seat: Seat, context: 'discard'|'added_kong'): void {
  const rules = state.rules ?? defaultRoomRules;
  if (rules.missedWinPolicy === 'none') return;
  const options = context === 'discard' ? getReactionOptions(state, seat) : getKongReactionOptions(state, seat);
  if (!options.some(o => o.type === 'win')) return;
  state.temporaryFuriten ??= [];
  if (!state.temporaryFuriten.includes(seat)) state.temporaryFuriten.push(seat);
}

export function passReaction(state: GameState, seat: Seat): void {
  if (state.phase === 'awaiting_kong_reactions') {
    const pending = state.pendingAddedKong;
    if (!pending) throw new Error('No added kong reaction window');
    if (seat === pending.seat) throw new Error('Kong declarer cannot pass reaction');
    if (!state.passedReactions.includes(seat)) {
      markMissedWinIfNeeded(state, seat, 'added_kong');
      state.passedReactions.push(seat); state.events.push({type:'PASS',seat,context:'added_kong'});
    }
    const waiting = seats.filter(s => s !== pending.seat);
    if (waiting.every(s => state.passedReactions.includes(s))) finalizeAddedKong(state);
    return;
  }

  if (state.phase !== 'awaiting_reactions' || !state.lastDiscard) throw new Error('No reaction window');
  if (seat === state.lastDiscard.seat) throw new Error('Discarder cannot pass reaction');
  if (!state.passedReactions.includes(seat)) {
    markMissedWinIfNeeded(state, seat, 'discard');
    state.passedReactions.push(seat); state.events.push({type:'PASS', seat, context:'discard'});
  }
  const waitingSeats = seats.filter(s => s !== state.lastDiscard!.seat);
  if (waitingSeats.every(s => state.passedReactions.includes(s))) {
    state.lastDiscard = undefined; state.passedReactions = []; state.phase = 'awaiting_draw';
  }
}

export function isReadyDeclared(state: GameState, seat: Seat): boolean {
  return state.declaredReady?.includes(seat) ?? false;
}

export function canSelfDraw(state: GameState, seat: Seat): boolean {
  return state.phase === 'awaiting_discard' && state.turn === seat && isWinningHandWithMelds(state.players[seat].concealed, state.players[seat].melds);
}

export function declareSelfDraw(state: GameState, seat: Seat): void {
  if (!canSelfDraw(state, seat)) throw new Error('Hand is not a legal self draw');
  const tile = state.lastDraw?.seat === seat ? state.lastDraw.tile : state.players[seat].concealed[state.players[seat].concealed.length - 1];
  state.phase='ended'; state.winner=seat; state.winners=[seat]; state.winningTile=tile; state.endReason='self_draw';
  state.events.push({type:'SELF_DRAW',seat,tile});
}

export function declareConcealedKong(state: GameState, seat: Seat, tileId: string): void {
  if (state.phase !== 'awaiting_discard' || state.turn !== seat) throw new Error('Not your kong turn');
  if (isReadyDeclared(state, seat)) throw new Error('Cannot kong after declaring ready');
  const player = state.players[seat];
  const reference = player.concealed.find(t => t.id === tileId);
  if (!reference || reference.kind === 'flower') throw new Error('Invalid kong tile');
  const matches = player.concealed.filter(t => sameType(t, reference));
  if (matches.length !== 4) throw new Error('Need four identical tiles for concealed kong');
  const ids = new Set(matches.map(t => t.id));
  player.concealed = player.concealed.filter(t => !ids.has(t.id));
  player.melds.push({type:'kong',tiles:matches,concealed:true});
  state.events.push({type:'KONG',seat,tiles:matches,concealed:true,added:false});
  drawReplacementFromDeadWall(state,seat);
}

export function declareAddedKong(state: GameState, seat: Seat, tileId: string): void {
  if (state.phase !== 'awaiting_discard' || state.turn !== seat) throw new Error('Not your kong turn');
  if (isReadyDeclared(state, seat)) throw new Error('Cannot kong after declaring ready');
  const player = state.players[seat];
  const tile = player.concealed.find(t => t.id === tileId);
  if (!tile || tile.kind === 'flower') throw new Error('Invalid added kong tile');
  const meldIndex = player.melds.findIndex(m => m.type === 'pong' && sameType(m.tiles[0], tile));
  if (meldIndex < 0) throw new Error('No matching pong for added kong');
  const old = player.melds[meldIndex];
  if (old.type !== 'pong') throw new Error('Internal meld mismatch');

  state.pendingAddedKong = {seat,tile,meldIndex,originalPong:old};
  state.passedReactions = [];
  state.phase = 'awaiting_kong_reactions';
  state.events.push({type:'KONG_DECLARED',seat,tile,added:true});
}


export interface ReactionDecision {
  seat: Seat;
  type: ReactionType;
  tiles?: Tile[];
}

// Settles one discard reaction window after the server/UI has collected one
// decision from every opponent. This is the Stage 1.5 entry point for
// single-ron vs multi-ron room rules.
export function settleDiscardReactionWindow(
  state: GameState,
  decisions: ReactionDecision[],
  rules: RoomRules = state.rules ?? defaultRoomRules,
): ReactionOption[] {
  const ld = state.lastDiscard;
  if (!ld || state.phase !== 'awaiting_reactions') throw new Error('No discard reaction window');
  const opponents = seats.filter(s => s !== ld.seat);
  const bySeat = new Map(decisions.map(d => [d.seat, d]));
  for (const seat of opponents) if (!bySeat.has(seat)) throw new Error(`Missing reaction from ${seat}`);

  const legalChosen: ReactionOption[] = [];
  for (const seat of opponents) {
    const d = bySeat.get(seat)!;
    const legal = getReactionOptions(state, seat);
    const chosen = legal.find(o => {
      if (o.type !== d.type) return false;
      if (!d.tiles || !o.tiles) return true;
      return [...o.tiles].map(t => t.id).sort().join('|') === [...d.tiles].map(t => t.id).sort().join('|');
    });
    if (!chosen) throw new Error(`Illegal reaction from ${seat}`);
    legalChosen.push(chosen);
  }

  const wins = legalChosen.filter(o => o.type === 'win')
    .sort((a,b) => distanceFromDiscarder(ld.seat,a.seat)-distanceFromDiscarder(ld.seat,b.seat));

  // Passing a legal ron causes temporary furiten according to room policy.
  for (const o of legalChosen) {
    if (o.type !== 'pass') continue;
    markMissedWinIfNeeded(state, o.seat, 'discard');
  }

  if (wins.length) {
    const winners = rules.ronMode === 'multiple' ? wins : [wins[0]];
    state.phase = 'ended';
    state.winner = winners[0].seat;
    state.winners = winners.map(w => w.seat);
    state.turn = winners[0].seat;
    state.winFrom = ld.seat;
    state.winningTile = ld.tile;
    state.endReason = 'win';
    if (winners.length === 1) {
      state.events.push({type:'WIN',seat:winners[0].seat,from:ld.seat,tile:ld.tile});
    } else {
      state.events.push({type:'MULTI_WIN',seats:winners.map(w=>w.seat),from:ld.seat,tile:ld.tile});
    }
    return winners;
  }

  const actionable = legalChosen.filter(o => o.type !== 'pass');
  const chosen = resolveReaction(actionable, ld.seat);
  if (chosen) {
    claimDiscard(state, chosen);
    return [chosen];
  }

  // Everyone passed.
  state.lastDiscard = undefined;
  state.passedReactions = [];
  state.phase = 'awaiting_draw';
  return [];
}
