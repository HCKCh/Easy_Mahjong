import { tileKey } from '../engine/tiles.js';
import { deriveWinFlags } from '../engine/winContext.js';
const v = {
    self_draw: 1, concealed: 1, concealed_self_draw: 3,
    seat_wind: 1, round_wind: 1, dragon: 1, matching_flower: 1,
    declared_ready: 1, kong_blossom: 1, rob_kong: 1, edge_wait: 1, closed_wait: 1, single_wait: 1, last_tile: 1,
    pinfu: 2, all_exposed: 2, three_concealed_triplets: 2, dealer_ready_flower: 4, earth_ready: 4,
    all_pungs: 4, small_three_dragons: 4, half_flush: 4, four_concealed_triplets: 5,
    big_three_dragons: 8, full_flush: 8, all_honors: 8, seven_flowers_rob: 8, eight_flowers: 8, five_concealed_triplets: 8, small_four_winds: 8, human_win: 8,
    earth_win: 16, big_four_winds: 16, heaven_win: 24,
};
export const mahjongoTaiwanProfile = { values: v, minTai: 0 };
const flowerSeatMap = {
    // 梅蘭竹菊、春夏秋冬依序對應 1～4 號：東 1、南 2、西 3、北 4
    east: ['spring', 'plum'], south: ['summer', 'orchid'], west: ['autumn', 'bamboo'], north: ['winter', 'chrysanthemum']
};
function isHonor(t) { return t.kind === 'wind' || t.kind === 'dragon'; }
function isExposed(m) { return m.type !== 'kong' || !m.concealed; }
function allTiles(state, winner) {
    const p = state.players[winner];
    const concealed = [...p.concealed];
    if ((state.endReason === 'win' || state.endReason === 'rob_kong') && state.winningTile && !concealed.some(t => t.id === state.winningTile.id))
        concealed.push(state.winningTile);
    return [...concealed, ...p.melds.flatMap(m => m.tiles)];
}
function tripletKeys(state, winner) {
    const p = state.players[winner];
    const out = [];
    for (const m of p.melds)
        if (m.type === 'pong' || m.type === 'kong')
            out.push(tileKey(m.tiles[0]));
    const counts = new Map();
    for (const t of p.concealed)
        counts.set(tileKey(t), (counts.get(tileKey(t)) ?? 0) + 1);
    if ((state.endReason === 'win' || state.endReason === 'rob_kong') && state.winningTile)
        counts.set(tileKey(state.winningTile), (counts.get(tileKey(state.winningTile)) ?? 0) + 1);
    for (const [k, n] of counts)
        if (n >= 3)
            out.push(k);
    return out;
}
function countConcealedTriplets(state, winner) {
    const p = state.players[winner];
    let n = p.melds.filter(m => m.type === 'kong' && m.concealed).length;
    const counts = new Map();
    for (const t of p.concealed)
        counts.set(tileKey(t), (counts.get(tileKey(t)) ?? 0) + 1);
    if ((state.endReason === 'win' || state.endReason === 'rob_kong') && state.winningTile)
        counts.set(tileKey(state.winningTile), (counts.get(tileKey(state.winningTile)) ?? 0) + 1);
    for (const c of counts.values())
        if (c >= 3)
            n++;
    return n;
}
function pairKey(state, winner) {
    const counts = new Map();
    for (const t of state.players[winner].concealed)
        counts.set(tileKey(t), (counts.get(tileKey(t)) ?? 0) + 1);
    if ((state.endReason === 'win' || state.endReason === 'rob_kong') && state.winningTile)
        counts.set(tileKey(state.winningTile), (counts.get(tileKey(state.winningTile)) ?? 0) + 1);
    return [...counts.entries()].find(([, n]) => n % 3 === 2)?.[0];
}
function hasAnyChow(state, winner) { return state.players[winner].melds.some(m => m.type === 'chow'); }
export function scoreTaiwanHand(ctx) {
    const { state, winner } = ctx;
    const winners = state.winners ?? (state.winner ? [state.winner] : []);
    if (state.phase !== 'ended' || !winners.includes(winner))
        throw new Error('Game must be ended with this winner');
    const profile = ctx.profile ?? mahjongoTaiwanProfile;
    const derived = deriveWinFlags(state, winner);
    const flags = { ...derived, ...(ctx.flags ?? {}) };
    const p = state.players[winner];
    const items = [];
    const add = (id, label, count = 1) => { if (count > 0)
        items.push({ id, label, tai: profile.values[id] * count }); };
    const isSelfDraw = state.endReason === 'self_draw';
    const isConcealed = p.melds.every(m => !isExposed(m));
    if (isConcealed && isSelfDraw)
        add('concealed_self_draw', '門清自摸');
    else {
        if (isConcealed)
            add('concealed', '門清');
        if (isSelfDraw)
            add('self_draw', '自摸');
    }
    const triplets = tripletKeys(state, winner);
    const dragonKeys = ['dragon:red', 'dragon:green', 'dragon:white'];
    const dragonTriplets = dragonKeys.filter(k => triplets.includes(k)).length;
    const pKey = pairKey(state, winner);
    const smallThree = dragonTriplets === 2 && !!pKey && dragonKeys.includes(pKey);
    const bigThree = dragonTriplets === 3;
    if (bigThree)
        add('big_three_dragons', '大三元');
    else if (smallThree)
        add('small_three_dragons', '小三元');
    else
        for (const k of dragonKeys)
            if (triplets.includes(k))
                add('dragon', '三元台');
    if (triplets.includes(`wind:${winner}`))
        add('seat_wind', '門風');
    if (ctx.prevailingWind && triplets.includes(`wind:${ctx.prevailingWind}`))
        add('round_wind', '圈風');
    const windKeys = ['wind:east', 'wind:south', 'wind:west', 'wind:north'];
    const windTriplets = windKeys.filter(k => triplets.includes(k)).length;
    const smallFour = windTriplets === 3 && !!pKey && windKeys.includes(pKey);
    const bigFour = windTriplets === 4;
    if (bigFour)
        add('big_four_winds', '大四喜');
    else if (smallFour)
        add('small_four_winds', '小四喜');
    const tiles = allTiles(state, winner).filter(t => t.kind !== 'flower');
    const suits = new Set(tiles.filter(t => t.kind === 'suit').map(t => t.kind === 'suit' ? t.suit : ''));
    const hasHonors = tiles.some(isHonor);
    const hasSuit = tiles.some(t => t.kind === 'suit');
    if (hasSuit && suits.size === 1 && hasHonors)
        add('half_flush', '湊一色');
    if (hasSuit && suits.size === 1 && !hasHonors)
        add('full_flush', '清一色');
    if (!hasSuit && hasHonors)
        add('all_honors', '字一色');
    const meldCount = p.melds.length;
    const concealedTriplets = countConcealedTriplets(state, winner);
    const chowLikely = hasAnyChow(state, winner) || tiles.filter(t => t.kind === 'suit').length >= 3;
    const allPungs = triplets.length >= 5 || (meldCount + concealedTriplets >= 5 && !hasAnyChow(state, winner));
    if (allPungs)
        add('all_pungs', '碰碰胡');
    if (concealedTriplets >= 5)
        add('five_concealed_triplets', '五暗坎');
    else if (concealedTriplets >= 4)
        add('four_concealed_triplets', '四暗坎');
    else if (concealedTriplets >= 3)
        add('three_concealed_triplets', '三暗坎');
    const allExposed = p.melds.length === 5 && !isSelfDraw;
    if (allExposed)
        add('all_exposed', '全求');
    const noHonors = !tiles.some(isHonor);
    const allChows = !allPungs && !triplets.length && chowLikely;
    if (allChows && noHonors && p.flowers.length === 0 && !isSelfDraw && !flags.singleWait && !flags.edgeWait && !flags.closedWait)
        add('pinfu', '平糊');
    for (const f of p.flowers)
        if (f.kind === 'flower' && flowerSeatMap[winner].includes(f.flower))
            add('matching_flower', '正花');
    if (flags.declaredReady)
        add('declared_ready', '聽牌');
    if (flags.kongBlossom)
        add('kong_blossom', '槓上開花');
    if (flags.robKong)
        add('rob_kong', '搶槓');
    if (flags.edgeWait)
        add('edge_wait', '邊張');
    if (flags.closedWait)
        add('closed_wait', '中洞');
    if (flags.singleWait)
        add('single_wait', '單吊');
    if (flags.lastTile)
        add('last_tile', '海底');
    if (flags.dealerReadyFlower)
        add('dealer_ready_flower', '配牌花糊');
    if (flags.earthReady)
        add('earth_ready', '地聽');
    if (flags.sevenFlowersRob)
        add('seven_flowers_rob', '七搶一');
    if (flags.eightFlowers)
        add('eight_flowers', '八仙過海');
    if (flags.humanWin)
        add('human_win', '人糊');
    if (flags.earthWin)
        add('earth_win', '地糊');
    if (flags.heavenWin)
        add('heaven_win', '天糊');
    // Dominant special wins do not stack with ordinary concealed/self-draw bonuses in this MVP profile.
    const special = items.find(i => ['heaven_win', 'earth_win', 'human_win'].includes(i.id));
    const finalItems = special ? items.filter(i => !['self_draw', 'concealed', 'concealed_self_draw'].includes(i.id)) : items;
    const handTai = finalItems.reduce((s, i) => s + i.tai, 0);
    return { winner, handTai, items: finalItems, isSelfDraw, isConcealed, qualifies: handTai >= profile.minTai };
}
export function dealerTai(dealerContinuations) { return 1 + 2 * Math.max(0, dealerContinuations); }
export function calculatePayments(state, score, dealer, dealerContinuations, cfg) {
    const payments = [];
    const dTai = dealerTai(dealerContinuations);
    const pay = (from) => {
        const tai = score.handTai + ((score.winner === dealer || from === dealer) ? dTai : 0);
        payments.push({ from, to: score.winner, tai, amount: cfg.base + tai * cfg.perTai });
    };
    if (score.isSelfDraw) {
        for (const s of ['east', 'south', 'west', 'north']) {
            if (s !== score.winner)
                pay(s);
        }
    }
    else {
        if (!state.winFrom) {
            throw new Error('Ron win requires state.winFrom');
        }
        pay(state.winFrom);
    }
    return payments;
}
export function calculateMultiWinnerPayments(state, scores, dealer, dealerContinuations, cfg) {
    if (!scores.length)
        return [];
    if (state.endReason === 'self_draw' && scores.length > 1)
        throw new Error('Self draw cannot have multiple winners');
    return scores.flatMap(score => calculatePayments(state, score, dealer, dealerContinuations, cfg));
}
//# sourceMappingURL=scoring.js.map