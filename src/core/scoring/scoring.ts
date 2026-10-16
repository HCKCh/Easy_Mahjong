import type { GameState, Meld, Seat, Tile } from '../types/mahjong.js';
import { tileKey } from '../engine/tiles.js';
import { deriveWinFlags } from '../engine/winContext.js';
import { decompose, type Decomposition, type HandSet } from '../engine/winChecker.js';

export type ScoreRuleId =
  | 'self_draw' | 'concealed' | 'concealed_self_draw'
  | 'seat_wind' | 'round_wind' | 'dragon' | 'matching_flower'
  | 'declared_ready' | 'kong_blossom' | 'rob_kong' | 'edge_wait' | 'closed_wait' | 'single_wait' | 'last_tile'
  | 'pinfu' | 'all_exposed' | 'three_concealed_triplets' | 'dealer_ready_flower' | 'earth_ready'
  | 'all_pungs' | 'small_three_dragons' | 'half_flush' | 'four_concealed_triplets'
  | 'big_three_dragons' | 'full_flush' | 'all_honors' | 'seven_flowers_rob' | 'eight_flowers' | 'five_concealed_triplets' | 'small_four_winds' | 'human_win'
  | 'earth_win' | 'big_four_winds' | 'heaven_win';

export interface ScoreItem { id: ScoreRuleId; label: string; tai: number; }

export interface TaiwanScoringProfile {
  values: Record<ScoreRuleId, number>;
  minTai: number;
}

export interface ScoreContextFlags {
  declaredReady?: boolean;
  kongBlossom?: boolean;
  robKong?: boolean;
  edgeWait?: boolean;
  closedWait?: boolean;
  singleWait?: boolean;
  lastTile?: boolean;
  dealerReadyFlower?: boolean;
  earthReady?: boolean;
  sevenFlowersRob?: boolean;
  eightFlowers?: boolean;
  humanWin?: boolean;
  earthWin?: boolean;
  heavenWin?: boolean;
}

export interface ScoreContext {
  state: GameState;
  winner: Seat;
  prevailingWind?: Seat;
  flags?: ScoreContextFlags;
  profile?: TaiwanScoringProfile;
}

export interface ScoreResult {
  winner: Seat;
  handTai: number;
  items: ScoreItem[];
  isSelfDraw: boolean;
  isConcealed: boolean;
  qualifies: boolean;
}

const v: Record<ScoreRuleId, number> = {
  self_draw:1, concealed:1, concealed_self_draw:3,
  seat_wind:1, round_wind:1, dragon:1, matching_flower:1,
  declared_ready:1, kong_blossom:1, rob_kong:1, edge_wait:1, closed_wait:1, single_wait:1, last_tile:1,
  pinfu:2, all_exposed:2, three_concealed_triplets:2, dealer_ready_flower:4, earth_ready:4,
  all_pungs:4, small_three_dragons:4, half_flush:4, four_concealed_triplets:5,
  big_three_dragons:8, full_flush:8, all_honors:8, seven_flowers_rob:8, eight_flowers:8, five_concealed_triplets:8, small_four_winds:8, human_win:8,
  earth_win:16, big_four_winds:16, heaven_win:24,
};

export const mahjongoTaiwanProfile: TaiwanScoringProfile = { values:v, minTai:0 };

const flowerSeatMap: Record<Seat, string[]> = {
  // 梅蘭竹菊、春夏秋冬依序對應 1～4 號：東 1、南 2、西 3、北 4
  east:['spring','plum'], south:['summer','orchid'], west:['autumn','bamboo'], north:['winter','chrysanthemum']
};

function isHonor(t: Tile): boolean { return t.kind === 'wind' || t.kind === 'dragon'; }
function isExposed(m: Meld): boolean { return m.type !== 'kong' || !m.concealed; }
// The concealed part of the final hand, including the winning tile on a discard win.
function finalConcealed(state: GameState, winner: Seat): Tile[] {
  const concealed = [...state.players[winner].concealed];
  if ((state.endReason === 'win' || state.endReason === 'rob_kong') && state.winningTile && !concealed.some(t => t.id === state.winningTile!.id)) concealed.push(state.winningTile);
  return concealed;
}
function chowHas(set: HandSet, key: string): boolean {
  if (set.kind !== 'chow') return false;
  const [suit, r] = set.key.split(':'); const [s2, r2] = key.split(':');
  return suit === s2 && Number(r2) >= Number(r) && Number(r2) <= Number(r) + 2;
}

// Scores the hand. A complete hand can often be split into sets in more than one way
// (e.g. 111222333 as three pungs or three chows); every split is scored and the best one wins.
export function scoreTaiwanHand(ctx: ScoreContext): ScoreResult {
  const {state,winner} = ctx;
  const winners = state.winners ?? (state.winner ? [state.winner] : []);
  if (state.phase !== 'ended' || !winners.includes(winner)) throw new Error('Game must be ended with this winner');
  const p = state.players[winner];
  const splits: (Decomposition | undefined)[] = decompose(finalConcealed(state, winner), 5 - p.melds.length);
  if (!splits.length) splits.push(undefined);
  let best: ScoreResult | undefined;
  for (const split of splits) {
    const r = scoreSplit(ctx, split);
    if (!best || r.handTai > best.handTai) best = r;
  }
  return best!;
}

function scoreSplit(ctx: ScoreContext, split: Decomposition | undefined): ScoreResult {
  const {state,winner} = ctx;
  const profile = ctx.profile ?? mahjongoTaiwanProfile;
  const derived = deriveWinFlags(state,winner);
  const flags: ScoreContextFlags = {...derived,...(ctx.flags ?? {})};
  const p = state.players[winner];
  const items: ScoreItem[] = [];
  const add = (id:ScoreRuleId,label:string,count=1) => { if (count>0) items.push({id,label,tai:profile.values[id]*count}); };
  const isSelfDraw = state.endReason === 'self_draw';
  const isConcealed = p.melds.every(m => !isExposed(m));

  if (isConcealed && isSelfDraw) add('concealed_self_draw','門清自摸');
  else { if (isConcealed) add('concealed','門清'); if (isSelfDraw) add('self_draw','自摸'); }

  const setsInHand = split?.sets ?? [];
  const meldPungs = p.melds.filter(m => m.type === 'pong' || m.type === 'kong').map(m => tileKey(m.tiles[0]));
  const handPungs = setsInHand.filter(x => x.kind === 'pung').map(x => x.key);
  const triplets = [...meldPungs, ...handPungs];
  const pKey = split?.pair;

  const dragonKeys = ['dragon:red','dragon:green','dragon:white'];
  const dragonTriplets = dragonKeys.filter(k => triplets.includes(k)).length;
  const smallThree = dragonTriplets === 2 && !!pKey && dragonKeys.includes(pKey);
  const bigThree = dragonTriplets === 3;
  if (bigThree) add('big_three_dragons','大三元');
  else if (smallThree) add('small_three_dragons','小三元');
  else for (const k of dragonKeys) if (triplets.includes(k)) add('dragon','三元台');

  if (triplets.includes(`wind:${winner}`)) add('seat_wind','門風');
  if (ctx.prevailingWind && triplets.includes(`wind:${ctx.prevailingWind}`)) add('round_wind','圈風');

  const windKeys = ['wind:east','wind:south','wind:west','wind:north'];
  const windTriplets = windKeys.filter(k => triplets.includes(k)).length;
  if (windTriplets === 4) add('big_four_winds','大四喜');
  else if (windTriplets === 3 && !!pKey && windKeys.includes(pKey)) add('small_four_winds','小四喜');

  const tiles = [...finalConcealed(state, winner), ...p.melds.flatMap(m => m.tiles)].filter(t => t.kind !== 'flower');
  const suits = new Set(tiles.filter(t => t.kind === 'suit').map(t => t.kind==='suit'?t.suit:''));
  const hasHonors = tiles.some(isHonor);
  const hasSuit = tiles.some(t => t.kind === 'suit');
  if (hasSuit && suits.size === 1 && hasHonors) add('half_flush','湊一色');
  if (hasSuit && suits.size === 1 && !hasHonors) add('full_flush','清一色');
  if (!hasSuit && hasHonors) add('all_honors','字一色');

  const meldChows = p.melds.some(m => m.type === 'chow');
  const allPungs = !!split && !meldChows && setsInHand.every(x => x.kind === 'pung');
  if (allPungs) add('all_pungs','碰碰胡');

  // Concealed pungs: concealed kongs + pungs in the hand. On a discard win, a pung that
  // can only have been completed by the winning tile counts as exposed.
  let concealedTriplets = p.melds.filter(m => m.type === 'kong' && m.concealed).length + handPungs.length;
  const wt = state.winningTile;
  if (!isSelfDraw && wt) {
    const k = tileKey(wt);
    if (handPungs.includes(k) && pKey !== k && !setsInHand.some(x => chowHas(x, k))) concealedTriplets--;
  }
  if (concealedTriplets >= 5) add('five_concealed_triplets','五暗坎');
  else if (concealedTriplets >= 4) add('four_concealed_triplets','四暗坎');
  else if (concealedTriplets >= 3) add('three_concealed_triplets','三暗坎');

  if (p.melds.length === 5 && !isSelfDraw) add('all_exposed','全求');

  const allChows = !!split && !meldPungs.length && setsInHand.every(x => x.kind === 'chow');
  if (allChows && !hasHonors && p.flowers.length===0 && !isSelfDraw && !flags.singleWait && !flags.edgeWait && !flags.closedWait) add('pinfu','平糊');

  for (const f of p.flowers) if (f.kind==='flower' && flowerSeatMap[winner].includes(f.flower)) add('matching_flower','正花');
  if (flags.declaredReady) add('declared_ready','聽牌');
  if (flags.kongBlossom) add('kong_blossom','槓上開花');
  if (flags.robKong) add('rob_kong','搶槓');
  if (flags.edgeWait) add('edge_wait','邊張');
  if (flags.closedWait) add('closed_wait','中洞');
  if (flags.singleWait) add('single_wait','單吊');
  if (flags.lastTile) add('last_tile','海底');
  if (flags.dealerReadyFlower) add('dealer_ready_flower','配牌花糊');
  if (flags.earthReady) add('earth_ready','地聽');
  if (flags.sevenFlowersRob) add('seven_flowers_rob','七搶一');
  if (flags.eightFlowers) add('eight_flowers','八仙過海');
  if (flags.humanWin) add('human_win','人糊');
  if (flags.earthWin) add('earth_win','地糊');
  if (flags.heavenWin) add('heaven_win','天糊');

  // Dominant special wins do not stack with ordinary concealed/self-draw bonuses in this MVP profile.
  const special = items.find(i => ['heaven_win','earth_win','human_win'].includes(i.id));
  const finalItems = special ? items.filter(i => !['self_draw','concealed','concealed_self_draw'].includes(i.id)) : items;
  const handTai = finalItems.reduce((s,i)=>s+i.tai,0);
  return {winner,handTai,items:finalItems,isSelfDraw,isConcealed,qualifies:handTai>=profile.minTai};
}

export interface PaymentConfig { base: number; perTai: number; }
export interface Payment { from: Seat; to: Seat; tai: number; amount: number; }

export function dealerTai(dealerContinuations:number): number { return 1 + 2*Math.max(0,dealerContinuations); }

export function calculatePayments(state: GameState, score: ScoreResult, dealer: Seat, dealerContinuations:number, cfg:PaymentConfig): Payment[] {
  const payments: Payment[] = [];
  const dTai = dealerTai(dealerContinuations);
  const pay = (from:Seat) => {
    const tai = score.handTai + ((score.winner===dealer || from===dealer) ? dTai : 0);
    payments.push({from,to:score.winner,tai,amount:cfg.base+tai*cfg.perTai});
  };
  if (score.isSelfDraw) {
    for (const s of ['east','south','west','north'] as Seat[]) {
      if (s !== score.winner) pay(s);
    }
  } else {
    if (!state.winFrom) {
      throw new Error('Ron win requires state.winFrom');
    }
    pay(state.winFrom);
  }
  return payments;
}


export function calculateMultiWinnerPayments(
  state: GameState,
  scores: ScoreResult[],
  dealer: Seat,
  dealerContinuations: number,
  cfg: PaymentConfig,
): Payment[] {
  if (!scores.length) return [];
  if (state.endReason === 'self_draw' && scores.length > 1) throw new Error('Self draw cannot have multiple winners');
  return scores.flatMap(score => calculatePayments(state, score, dealer, dealerContinuations, cfg));
}
