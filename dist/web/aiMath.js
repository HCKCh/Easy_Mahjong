import { tileKey } from '../core/engine/tiles.js';
const keys = [];
for (const suit of ['characters', 'dots', 'bamboo'])
    for (let r = 1; r <= 9; r++)
        keys.push(`${suit}:${r}`);
for (const w of ['east', 'south', 'west', 'north'])
    keys.push(`wind:${w}`);
for (const d of ['red', 'green', 'white'])
    keys.push(`dragon:${d}`);
const keyIndex = new Map(keys.map((k, i) => [k, i]));
function countsOf(tiles) {
    const c = Array(34).fill(0);
    for (const t of tiles) {
        if (t.kind === 'flower')
            continue;
        const i = keyIndex.get(tileKey(t));
        if (i !== undefined)
            c[i]++;
    }
    return c;
}
export function shantenOf(tiles, melds = []) {
    const c = countsOf(tiles);
    const open = melds.length;
    let best = 99;
    const dfs = (idx, m, t, p) => {
        while (idx < 34 && c[idx] === 0)
            idx++;
        if (idx >= 34) {
            const meldsTotal = open + m;
            const need = Math.max(0, 5 - meldsTotal);
            const taatsu = Math.min(t, need);
            best = Math.min(best, 10 - 2 * meldsTotal - taatsu - p);
            return;
        }
        // discard singleton path
        c[idx]--;
        dfs(idx, m, t, p);
        c[idx]++;
        if (c[idx] >= 3) {
            c[idx] -= 3;
            dfs(idx, m + 1, t, p);
            c[idx] += 3;
        }
        if (c[idx] >= 2) {
            c[idx] -= 2;
            if (!p)
                dfs(idx, m, t, 1);
            dfs(idx, m, t + 1, p);
            c[idx] += 2;
        }
        if (idx < 27) {
            const pos = idx % 9;
            if (pos <= 6 && c[idx + 1] > 0 && c[idx + 2] > 0) {
                c[idx]--;
                c[idx + 1]--;
                c[idx + 2]--;
                dfs(idx, m + 1, t, p);
                c[idx]++;
                c[idx + 1]++;
                c[idx + 2]++;
            }
            if (pos <= 7 && c[idx + 1] > 0) {
                c[idx]--;
                c[idx + 1]--;
                dfs(idx, m, t + 1, p);
                c[idx]++;
                c[idx + 1]++;
            }
            if (pos <= 6 && c[idx + 2] > 0) {
                c[idx]--;
                c[idx + 2]--;
                dfs(idx, m, t + 1, p);
                c[idx]++;
                c[idx + 2]++;
            }
        }
    };
    dfs(0, 0, 0, 0);
    return best;
}
function visibleCount(state, key) {
    let n = 0;
    for (const s of ['east', 'south', 'west', 'north']) {
        const p = state.players[s];
        n += p.discards.filter(t => tileKey(t) === key).length;
        n += p.melds.flatMap(m => m.tiles).filter(t => tileKey(t) === key).length;
        n += p.flowers.filter(t => tileKey(t) === key).length;
    }
    return n;
}
function prototypeForKey(key) {
    const [a, b] = key.split(':');
    if (a === 'characters' || a === 'dots' || a === 'bamboo')
        return { kind: 'suit', suit: a, rank: Number(b), id: `probe-${key}` };
    if (a === 'wind')
        return { kind: 'wind', wind: b, id: `probe-${key}` };
    return { kind: 'dragon', dragon: b, id: `probe-${key}` };
}
export function effectiveTiles(state, seat, tiles, melds) {
    const base = shantenOf(tiles, melds);
    let outs = 0;
    const improving = [];
    const own = new Map();
    for (const t of tiles)
        own.set(tileKey(t), (own.get(tileKey(t)) ?? 0) + 1);
    for (const key of keys) {
        const totalSeen = visibleCount(state, key) + (own.get(key) ?? 0);
        if (totalSeen >= 4)
            continue;
        const s = shantenOf([...tiles, prototypeForKey(key)], melds);
        if (s < base) {
            improving.push(key);
            outs += 4 - totalSeen;
        }
    }
    return { shanten: base, outs, keys: improving };
}
export function bestAfterClaim(state, seat, remaining, melds) {
    let best = { shanten: 99, outs: -1 };
    for (const t of remaining) {
        const hand = remaining.filter(x => x.id !== t.id);
        const e = effectiveTiles(state, seat, hand, melds);
        if (e.shanten < best.shanten || (e.shanten === best.shanten && e.outs > best.outs))
            best = { shanten: e.shanten, outs: e.outs };
    }
    return best;
}
//# sourceMappingURL=aiMath.js.map