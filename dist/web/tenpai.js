import { tileKey } from '../core/engine/tiles.js';
import { isWinningHandWithMelds } from '../core/engine/winChecker.js';
// 聽牌提示：列出手牌再進哪一張就能胡，並扣掉自己看得到的牌算剩幾張
const candidates = [];
for (const suit of ['characters', 'dots', 'bamboo'])
    for (let r = 1; r <= 9; r++)
        candidates.push({ kind: 'suit', suit, rank: r, id: `wait-${suit}-${r}` });
for (const wind of ['east', 'south', 'west', 'north'])
    candidates.push({ kind: 'wind', wind, id: `wait-wind-${wind}` });
for (const dragon of ['red', 'green', 'white'])
    candidates.push({ kind: 'dragon', dragon, id: `wait-dragon-${dragon}` });
/** concealed 必須是 3n+1 張（等待進牌的狀態）；visible 為自己看得到的所有牌（手牌、副露、牌河…） */
export function waitsFor(concealed, melds, visible = []) {
    if (concealed.length % 3 !== 1)
        return [];
    const seen = new Map();
    for (const t of visible) {
        const k = tileKey(t);
        seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    const out = [];
    for (const c of candidates) {
        if (isWinningHandWithMelds([...concealed, c], melds))
            out.push({ tile: c, left: Math.max(0, 4 - (seen.get(tileKey(c)) ?? 0)) });
    }
    return out;
}
/** concealed 為 3n+2 張（輪到自己出牌）：回傳「打出哪種牌後會聽牌」→ 聽的牌 */
export function discardsToTenpai(concealed, melds, visible = []) {
    const out = new Map();
    if (concealed.length % 3 !== 2)
        return out;
    for (const t of concealed) {
        const k = tileKey(t);
        if (out.has(k))
            continue;
        const rest = concealed.filter(x => x !== t);
        out.set(k, waitsFor(rest, melds, visible));
    }
    for (const [k, w] of out)
        if (!w.length)
            out.delete(k);
    return out;
}
//# sourceMappingURL=tenpai.js.map