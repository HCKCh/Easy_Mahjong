// 8 個原創 Q 版頭像（SVG，0～3 男生、4～7 女生），每個玩家在房間內選一個，不可重複。
// mood: happy 平常／胡牌，shock 輸牌時（驚嚇＋流淚）
export const AVATAR_COUNT = 8;
const defs = [
    // 男生：短髮／刺蝟頭、粗眉、無睫毛
    { male: true, hair: '#e8453c', hairDark: '#b52a23', style: 'spiky', eye: '#d9822b', acc: 'headband', accColor: '#ffffff' },
    { male: true, hair: '#3b7dd8', hairDark: '#2558a3', style: 'short', eye: '#3aa0e0', acc: 'glasses', accColor: '#2b2b3a' },
    { male: true, hair: '#b9c3cf', hairDark: '#8592a3', style: 'spiky', eye: '#4a6fd1', acc: 'headphones', accColor: '#e8453c' },
    { male: true, hair: '#33313b', hairDark: '#1c1a22', style: 'short', eye: '#8a5cd6', acc: 'beanie', accColor: '#2f7fd1' },
    // 女生：長髮／雙馬尾／鮑伯頭、睫毛、腮紅
    { male: false, hair: '#9b59d0', hairDark: '#6f3aa8', style: 'twin', eye: '#c25bd6', acc: 'ribbon', accColor: '#ff5c8a' },
    { male: false, hair: '#2f9e63', hairDark: '#1d7a4a', style: 'bob', eye: '#2fbf7a', acc: 'star', accColor: '#ffd84a' },
    { male: false, hair: '#f2c14e', hairDark: '#c9962a', style: 'long', eye: '#e0702b', acc: 'catEars', accColor: '#ffb3c4' },
    { male: false, hair: '#ff8fb8', hairDark: '#e0628f', style: 'long', eye: '#e0507a', acc: 'flower', accColor: '#fff27a' },
];
function backHair(d) {
    if (d.style === 'long')
        return `<path d="M14 62Q14 12 60 12Q106 12 106 62L108 114L86 114L84 74L36 74L34 114L12 114Z" fill="${d.hairDark}"/>`;
    if (d.style === 'twin')
        return `<ellipse cx="13" cy="80" rx="12" ry="28" fill="${d.hairDark}"/><ellipse cx="107" cy="80" rx="12" ry="28" fill="${d.hairDark}"/><circle cx="60" cy="58" r="46" fill="${d.hairDark}"/>`;
    if (d.style === 'short')
        return `<path d="M16 66Q14 14 60 13Q106 14 104 66Q100 52 98 46L22 46Q20 52 16 66Z" fill="${d.hairDark}"/>`;
    if (d.style === 'bob')
        return `<path d="M15 64Q15 12 60 12Q105 12 105 64L105 96Q60 106 15 96Z" fill="${d.hairDark}"/>`;
    return `<circle cx="60" cy="58" r="46" fill="${d.hairDark}"/>`;
}
function bangs(d) {
    if (d.style === 'spiky')
        return `<path d="M18 64Q20 14 60 13Q100 14 102 64L92 48L84 62L74 40L64 60L56 40L46 60L36 44L28 60Z" fill="${d.hair}"/>`;
    if (d.style === 'short')
        return `<path d="M17 62Q16 12 60 12Q104 12 103 62Q100 44 90 34Q76 46 46 42Q30 46 17 62Z" fill="${d.hair}"/>`;
    return `<path d="M18 68Q16 12 60 12Q104 12 102 68Q96 44 82 34Q78 48 64 52Q68 42 66 34Q52 50 36 52Q42 42 42 34Q24 46 18 68Z" fill="${d.hair}"/>`;
}
function eyes(d, mood) {
    if (mood === 'shock') {
        const eye = (x) => `<circle cx="${x}" cy="73" r="9" fill="#fff" stroke="#2b1a3a" stroke-width="2.5"/><circle cx="${x}" cy="74" r="2.6" fill="#2b1a3a"/>`;
        return eye(45) + eye(75) + `<path d="M39 84Q36 98 41 108" stroke="#7cc8ff" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M81 84Q84 98 79 108" stroke="#7cc8ff" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    }
    // 男生眼睛稍小、加粗眉；女生眼睛較大、加睫毛
    const ry = d.male ? 9.5 : 11;
    const eye = (x) => `<ellipse cx="${x}" cy="73" rx="8" ry="${ry}" fill="#2b1a3a"/><ellipse cx="${x}" cy="75" rx="5.6" ry="${ry - 3.4}" fill="${d.eye}"/><circle cx="${x + 2.6}" cy="69" r="3.2" fill="#fff"/><circle cx="${x - 2.6}" cy="77.5" r="1.6" fill="#fff"/>`;
    const extra = d.male
        ? `<path d="M36 59Q45 54 54 59" stroke="${d.hairDark}" stroke-width="3.6" fill="none" stroke-linecap="round"/><path d="M66 59Q75 54 84 59" stroke="${d.hairDark}" stroke-width="3.6" fill="none" stroke-linecap="round"/>`
        : `<path d="M37.5 66L33 62M38.5 63L35.5 58" stroke="#2b1a3a" stroke-width="2" stroke-linecap="round"/><path d="M82.5 66L87 62M81.5 63L84.5 58" stroke="#2b1a3a" stroke-width="2" stroke-linecap="round"/>`;
    return eye(45) + eye(75) + extra;
}
function mouth(d, mood) {
    if (mood === 'shock')
        return `<ellipse cx="60" cy="93" rx="6" ry="7.5" fill="#5a1f2e"/><path d="M101 38Q108 52 101 57Q94 52 101 38Z" fill="#7cc8ff"/>`;
    return d.male ? `<path d="M52 88Q60 97 68 88Z" fill="#a8364c"/>` : `<path d="M51 88Q60 99 69 88Z" fill="#e0567a"/>`;
}
function accessory(d) {
    const c = d.accColor;
    switch (d.acc) {
        case 'headband': return `<path d="M20 50Q60 30 100 50L100 58Q60 38 20 58Z" fill="${c}"/><circle cx="98" cy="54" r="5" fill="#e8453c"/><path d="M100 56L112 66L104 68Z" fill="${c}"/>`;
        case 'glasses': return `<circle cx="45" cy="73" r="13" fill="none" stroke="${c}" stroke-width="3"/><circle cx="75" cy="73" r="13" fill="none" stroke="${c}" stroke-width="3"/><path d="M58 72L62 72" stroke="${c}" stroke-width="3"/>`;
        case 'ribbon': return `<path d="M86 22L106 10L104 34Z" fill="${c}"/><path d="M86 22L68 8L70 32Z" fill="${c}"/><circle cx="86" cy="21" r="5" fill="#d93a6a"/>`;
        case 'star': return `<path d="M88 22l4 9 10 1-7.5 6.5 2.3 9.8L88 43l-8.8 5.3 2.3-9.8L74 32l10-1z" fill="${c}" stroke="#c99a12" stroke-width="1.5"/>`;
        case 'catEars': return `<path d="M22 34L26 2L50 22Z" fill="${d.hair}"/><path d="M98 34L94 2L70 22Z" fill="${d.hair}"/><path d="M28 28L30 10L44 22Z" fill="${c}"/><path d="M92 28L90 10L76 22Z" fill="${c}"/>`;
        case 'headphones': return `<path d="M14 66Q14 8 60 8Q106 8 106 66" fill="none" stroke="#3a3a46" stroke-width="7"/><rect x="5" y="58" width="16" height="26" rx="6" fill="${c}"/><rect x="99" y="58" width="16" height="26" rx="6" fill="${c}"/>`;
        case 'flower': return `<g transform="translate(30 30)">${[0, 72, 144, 216, 288].map(a => `<ellipse cx="0" cy="-8" rx="6" ry="9" fill="#fff" transform="rotate(${a})"/>`).join('')}<circle r="5" fill="${c}"/></g>`;
        case 'beanie': return `<path d="M15 52Q15 4 60 4Q105 4 105 52Z" fill="${c}"/><rect x="12" y="44" width="96" height="12" rx="6" fill="#1f5fa8"/><circle cx="60" cy="5" r="8" fill="#fff"/>`;
    }
}
export function avatarSvg(index, mood = 'happy') {
    const d = defs[((index % AVATAR_COUNT) + AVATAR_COUNT) % AVATAR_COUNT];
    return `<svg viewBox="0 0 120 120" aria-hidden="true">${backHair(d)}<ellipse cx="60" cy="69" rx="37" ry="34" fill="#ffe6d3"/>${bangs(d)}${eyes(d, mood)}<ellipse cx="35" cy="86" rx="6.5" ry="3.2" fill="#ff8fa3" opacity="${d.male ? .35 : .75}"/><ellipse cx="85" cy="86" rx="6.5" ry="3.2" fill="#ff8fa3" opacity="${d.male ? .35 : .75}"/>${mouth(d, mood)}${accessory(d)}</svg>`;
}
//# sourceMappingURL=avatars.js.map