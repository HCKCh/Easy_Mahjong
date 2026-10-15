import { tileKey } from '../core/engine/tiles.js';
import { getReactionOptions } from '../core/engine/actions.js';
import { bestAfterClaim, effectiveTiles } from './aiMath.js';
function countSame(hand, tile) { const key = tileKey(tile); return hand.filter(t => tileKey(t) === key).length; }
function visibleRiverCount(state, tile) { const key = tileKey(tile); let n = 0; for (const s of ['east', 'south', 'west', 'north'])
    n += state.players[s].discards.filter(t => tileKey(t) === key).length; return n; }
function tieBreak(state, seat, tile) {
    const hand = state.players[seat].concealed, count = countSame(hand, tile);
    let score = count * 3;
    if (tile.kind === 'suit') {
        const ranks = new Set(hand.filter((t) => t.kind === 'suit' && t.suit === tile.suit).map(t => Number(t.rank)));
        if (ranks.has(tile.rank - 1))
            score += 2;
        if (ranks.has(tile.rank + 1))
            score += 2;
        if (ranks.has(tile.rank - 2))
            score += .7;
        if (ranks.has(tile.rank + 2))
            score += .7;
        if (tile.rank === 1 || tile.rank === 9)
            score -= .8;
    }
    else if (count === 1)
        score -= 2;
    score -= visibleRiverCount(state, tile) * .6;
    return score;
}
export function chooseDiscard(state, seat) {
    const p = state.players[seat];
    if (!p.concealed.length)
        throw new Error('Bot has no tile to discard');
    const ranked = p.concealed.map(tile => {
        const hand = p.concealed.filter(t => t.id !== tile.id);
        const e = effectiveTiles(state, seat, hand, p.melds);
        return { tile, shanten: e.shanten, outs: e.outs, tie: tieBreak(state, seat, tile) };
    }).sort((a, b) => a.shanten - b.shanten || b.outs - a.outs || a.tie - b.tie);
    return ranked[0].tile;
}
function acceptMeld(state, seat, o) {
    if (!o.tiles || !['chow', 'pong', 'kong'].includes(o.type))
        return false;
    const p = state.players[seat];
    const before = effectiveTiles(state, seat, p.concealed, p.melds);
    const discardId = state.lastDiscard?.tile.id;
    const handIds = new Set(o.tiles.filter(t => t.id !== discardId).map(t => t.id));
    const remaining = p.concealed.filter(t => !handIds.has(t.id));
    const meld = o.type === 'chow' ? { type: 'chow', tiles: o.tiles, from: state.lastDiscard.seat } : o.type === 'pong' ? { type: 'pong', tiles: o.tiles, from: state.lastDiscard.seat } : { type: 'kong', tiles: o.tiles, from: state.lastDiscard.seat, concealed: false };
    if (o.type === 'kong') {
        const after = effectiveTiles(state, seat, remaining, [...p.melds, meld]);
        return after.shanten <= before.shanten;
    }
    const after = bestAfterClaim(state, seat, remaining, [...p.melds, meld]);
    return after.shanten < before.shanten || (after.shanten === before.shanten && after.outs >= before.outs + 2);
}
export function chooseReaction(state, seat) {
    const options = getReactionOptions(state, seat);
    const win = options.find(x => x.type === 'win');
    if (win)
        return { seat, type: 'win', tiles: win.tiles };
    for (const type of ['kong', 'pong', 'chow']) {
        for (const o of options.filter(x => x.type === type)) {
            if (acceptMeld(state, seat, o))
                return { seat, type: o.type, tiles: o.tiles };
        }
    }
    return { seat, type: 'pass' };
}
//# sourceMappingURL=bot.js.map