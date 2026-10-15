const KEY = 'tw-mj-replays-v1';
const seats = ['east', 'south', 'west', 'north'];
function cp(v) { return JSON.parse(JSON.stringify(v)); }
export function snapshot(state, label, index) {
    const players = {};
    for (const s of seats) {
        const p = state.players[s];
        players[s] = { concealed: s === 'east' ? cp(p.concealed) : [], concealedCount: p.concealed.length, flowers: cp(p.flowers), melds: cp(p.melds), discards: cp(p.discards) };
    }
    return { index, label, phase: state.phase, turn: state.turn, wallCount: state.wall.length, deadWallCount: state.deadWall.length, lastDiscard: state.lastDiscard ? cp(state.lastDiscard) : undefined, players };
}
export function loadReplays() { try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
}
catch {
    return [];
} }
export function saveReplay(a) { const list = loadReplays(); list.unshift(a); localStorage.setItem(KEY, JSON.stringify(list.slice(0, 12))); }
export function clearReplays() { localStorage.removeItem(KEY); }
//# sourceMappingURL=replay.js.map