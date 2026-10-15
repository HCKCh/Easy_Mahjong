import type { EndReason, GameState, Seat } from '../types/mahjong.js';
import { createGame } from '../engine/game.js';
import { nextSeat } from '../engine/actions.js';
import { calculateMultiWinnerPayments, scoreTaiwanHand, type Payment, type PaymentConfig, type ScoreContextFlags, type ScoreResult } from '../scoring/scoring.js';
import { defaultRoomRules, type RoomRules } from '../rules/roomRules.js';

export interface MatchConfig {
  prevailingWinds: Seat[];
  dealerStaysOnDraw: boolean;
  payment: PaymentConfig;
  roomRules: RoomRules;
}

export interface HandRecord {
  prevailingWind: Seat;
  handNumber: number;
  dealer: Seat;
  dealerContinuations: number;
  winner?: Seat;
  winners?: Seat[];
  endReason: EndReason;
  score?: ScoreResult;
  scores?: ScoreResult[];
  payments: Payment[];
}

export interface MatchState {
  config: MatchConfig;
  prevailingWindIndex: number;
  handNumber: number;
  dealer: Seat;
  dealerContinuations: number;
  completedHands: number;
  status: 'playing'|'ended';
  game: GameState;
  history: HandRecord[];
}

export const defaultMatchConfig: MatchConfig = {
  prevailingWinds:['east','south'],
  dealerStaysOnDraw:true,
  payment:{base:50,perTai:20},
  roomRules: defaultRoomRules,
};

export function createMatch(config:Partial<MatchConfig> = {}, rng=Math.random): MatchState {
  const c:MatchConfig = {...defaultMatchConfig,...config,payment:{...defaultMatchConfig.payment,...config.payment},roomRules:{...defaultMatchConfig.roomRules,...config.roomRules}};
  return {
    config:c, prevailingWindIndex:0, handNumber:1, dealer:'east', dealerContinuations:0,
    completedHands:0, status:'playing', game:createGame(rng,'east',c.roomRules), history:[]
  };
}

export function currentPrevailingWind(match:MatchState): Seat { return match.config.prevailingWinds[match.prevailingWindIndex]; }

export function settleCurrentHand(match:MatchState, flags:ScoreContextFlags = {}): HandRecord {
  if (match.status==='ended') throw new Error('Match ended');
  if (match.game.phase!=='ended' || !match.game.endReason) throw new Error('Current hand has not ended');
  let score:ScoreResult|undefined;
  let scores:ScoreResult[]|undefined;
  let payments:Payment[]=[];
  const winners = match.game.winners ?? (match.game.winner ? [match.game.winner] : []);
  if (winners.length) {
    scores = winners.map(winner => scoreTaiwanHand({state:match.game,winner,prevailingWind:currentPrevailingWind(match),flags}));
    score = scores[0];
    payments = calculateMultiWinnerPayments(match.game,scores,match.dealer,match.dealerContinuations,match.config.payment);
  }
  const rec:HandRecord = {
    prevailingWind:currentPrevailingWind(match), handNumber:match.handNumber, dealer:match.dealer,
    dealerContinuations:match.dealerContinuations, winner:match.game.winner, winners:winners.length?winners:undefined, endReason:match.game.endReason,
    score,scores,payments
  };
  match.history.push(rec); match.completedHands++;
  advanceMatchPosition(match);
  return rec;
}

function advanceMatchPosition(match:MatchState): void {
  const winners = match.game.winners ?? (match.game.winner ? [match.game.winner] : []);
  const dealerWon = winners.includes(match.dealer);
  const draw = match.game.endReason === 'wall_exhausted';
  const stays = dealerWon || (draw && match.config.dealerStaysOnDraw);
  if (stays) { match.dealerContinuations++; return; }
  match.dealer = nextSeat(match.dealer);
  match.dealerContinuations = 0;
  match.handNumber++;
  if (match.handNumber > 4) {
    match.handNumber = 1;
    match.prevailingWindIndex++;
    if (match.prevailingWindIndex >= match.config.prevailingWinds.length) match.status='ended';
  }
}

export function startNextHand(match:MatchState, rng=Math.random): GameState {
  if (match.status==='ended') throw new Error('Match ended');
  if (match.game.phase!=='ended') throw new Error('Current hand still active');
  match.game = createGame(rng,match.dealer,match.config.roomRules);
  return match.game;
}
