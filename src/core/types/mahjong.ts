export type Suit = 'characters' | 'dots' | 'bamboo';
export type Wind = 'east' | 'south' | 'west' | 'north';
export type Dragon = 'red' | 'green' | 'white';
export type Flower = 'plum' | 'orchid' | 'bamboo' | 'chrysanthemum' | 'spring' | 'summer' | 'autumn' | 'winter';

export type Tile =
  | { kind: 'suit'; suit: Suit; rank: 1|2|3|4|5|6|7|8|9; id: string }
  | { kind: 'wind'; wind: Wind; id: string }
  | { kind: 'dragon'; dragon: Dragon; id: string }
  | { kind: 'flower'; flower: Flower; id: string };

export type Seat = Wind;

export type Meld =
  | { type: 'chow'; tiles: Tile[]; from: Seat }
  | { type: 'pong'; tiles: Tile[]; from: Seat }
  | { type: 'kong'; tiles: Tile[]; from?: Seat; concealed: boolean };

export interface PlayerState {
  seat: Seat;
  concealed: Tile[];
  flowers: Tile[];
  melds: Meld[];
  discards: Tile[];
}

export type GamePhase = 'awaiting_draw' | 'awaiting_discard' | 'awaiting_reactions' | 'awaiting_kong_reactions' | 'ended';
export type EndReason = 'win' | 'self_draw' | 'rob_kong' | 'wall_exhausted';

export interface PendingAddedKong {
  seat: Seat;
  tile: Tile;
  meldIndex: number;
  originalPong: Extract<Meld,{type:'pong'}>;
}

export type GameEvent =
  | { type: 'GAME_STARTED'; dealer: Seat }
  | { type: 'FLOWER_REVEALED'; seat: Seat; tile: Tile }
  | { type: 'DRAW'; seat: Seat; tile: Tile; replacement: boolean }
  | { type: 'DISCARD'; seat: Seat; tile: Tile }
  | { type: 'READY_DECLARED'; seat: Seat; tile: Tile }
  | { type: 'CHOW'; seat: Seat; from: Seat; tiles: Tile[] }
  | { type: 'PONG'; seat: Seat; from: Seat; tiles: Tile[] }
  | { type: 'KONG_DECLARED'; seat: Seat; tile: Tile; added: true }
  | { type: 'KONG'; seat: Seat; from?: Seat; tiles: Tile[]; concealed: boolean; added: boolean }
  | { type: 'PASS'; seat: Seat; context?: 'discard'|'added_kong' }
  | { type: 'WIN'; seat: Seat; from: Seat; tile: Tile }
  | { type: 'MULTI_WIN'; seats: Seat[]; from: Seat; tile: Tile }
  | { type: 'ROB_KONG_WIN'; seat: Seat; from: Seat; tile: Tile }
  | { type: 'SELF_DRAW'; seat: Seat; tile: Tile }
  | { type: 'DRAW_GAME'; reason: 'wall_exhausted' };

import type { RoomRules } from '../rules/roomRules.js';

export interface GameState {
  dealer: Seat;
  turn: Seat;
  wall: Tile[];
  deadWall: Tile[];
  players: Record<Seat, PlayerState>;
  lastDiscard?: { seat: Seat; tile: Tile };
  lastDraw?: { seat: Seat; tile: Tile; replacement: boolean };
  pendingAddedKong?: PendingAddedKong;
  phase: GamePhase;
  passedReactions: Seat[];
  winner?: Seat;
  winners?: Seat[];
  winFrom?: Seat;
  winningTile?: Tile;
  endReason?: EndReason;
  events: GameEvent[];
  rules?: RoomRules;
  temporaryFuriten?: Seat[];
  /** Seats that declared ready (聽牌): their hand is locked and each drawn tile is discarded unless it wins. */
  declaredReady?: Seat[];
}
