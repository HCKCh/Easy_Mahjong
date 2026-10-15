const KEY = 'tw-mj-career-stats-v1';
export const emptyStats = { hands: 0, wins: 0, selfDraws: 0, ronWins: 0, dealsIn: 0, draws: 0, net: 0, bestHandTai: 0 };
export function loadCareerStats() { try {
    return { ...emptyStats, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
}
catch {
    return { ...emptyStats };
} }
export function saveCareerStats(s) { localStorage.setItem(KEY, JSON.stringify(s)); }
export function clearCareerStats() { localStorage.removeItem(KEY); return { ...emptyStats }; }
export function applyHandToStats(prev, rec, human = 'east') {
    const s = { ...prev, hands: prev.hands + 1 };
    const winners = rec.winners ?? (rec.winner ? [rec.winner] : []);
    if (rec.endReason === 'wall_exhausted')
        s.draws++;
    if (winners.includes(human)) {
        s.wins++;
        if (rec.endReason === 'self_draw')
            s.selfDraws++;
        else
            s.ronWins++;
    }
    for (const sc of rec.scores ?? []) {
        if (sc.winner === human)
            s.bestHandTai = Math.max(s.bestHandTai, sc.handTai);
    }
    let dealtIn = false;
    for (const p of rec.payments) {
        if (p.from === human) {
            s.net -= p.amount;
            if ((rec.endReason === 'win' || rec.endReason === 'rob_kong') && winners.length)
                dealtIn = true;
        }
        if (p.to === human)
            s.net += p.amount;
    }
    if (dealtIn)
        s.dealsIn++;
    return s;
}
//# sourceMappingURL=stats.js.map