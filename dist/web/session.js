import { createMatch, currentPrevailingWind, settleCurrentHand, startNextHand } from '../core/match/match.js';
export const defaultAppSettings = { base: 50, perTai: 20, aiSpeed: 650, ronMode: 'single', missedWinPolicy: 'until_next_draw', reactionSeconds: 8, soundEnabled: true };
export function createLocalSession(settings = {}) {
    const cfg = { ...defaultAppSettings, ...settings };
    const match = createMatch({ payment: { base: cfg.base, perTai: cfg.perTai }, roomRules: { ronMode: cfg.ronMode, missedWinPolicy: cfg.missedWinPolicy, minTai: 1 } });
    return { match, totals: { east: 0, south: 0, west: 0, north: 0 }, settings: cfg };
}
export function roundLabel(session) { const wind = currentPrevailingWind(session.match); const w = wind === 'east' ? '東' : wind === 'south' ? '南' : wind === 'west' ? '西' : '北'; return `${w}${session.match.handNumber}局`; }
export function settleEndedHand(session) {
    const g = session.match.game;
    if (g.phase !== 'ended')
        return undefined;
    if (session.settledGameRef === g)
        return session.lastRecord;
    const rec = settleCurrentHand(session.match);
    for (const p of rec.payments) {
        session.totals[p.from] -= p.amount;
        session.totals[p.to] += p.amount;
    }
    session.lastRecord = rec;
    session.settledGameRef = g;
    return rec;
}
export function startNextSessionHand(session) { startNextHand(session.match); session.lastRecord = undefined; session.settledGameRef = undefined; return { state: session.match.game }; }
//# sourceMappingURL=session.js.map