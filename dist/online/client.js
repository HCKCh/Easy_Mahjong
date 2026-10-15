import { tileClass, tileFace } from '../web/tileView.js';
import { playSound } from '../web/sound.js';
import { waitsFor, discardsToTenpai } from '../web/tenpai.js';
import { tileKey } from '../core/engine/tiles.js';
import { avatarSvg, AVATAR_COUNT } from './avatars.js';
import { t, lang, setLang, seatShort, seatLong, tileName, serverText, roundText, scoreLabel, playerName } from './i18n.js';
const app = document.querySelector('#online-app');
const seats = ['east', 'south', 'west', 'north'];
let ws;
let snapshot;
let selected;
let name = localStorage.getItem('tw-mj-name') || t('defaultName', { n: Math.floor(Math.random() * 900 + 100) });
const clientIdKey = 'tw-mj-client-id';
// 建房時選 AI 人數；選 3 個 AI（只有自己一個真人）時建好房間就直接開局
let aiCount = Math.min(3, Math.max(0, Number(localStorage.getItem('tw-mj-ai-count') ?? 3) || 0));
let clientId = localStorage.getItem(clientIdKey) || crypto.randomUUID();
localStorage.setItem(clientIdKey, clientId);
let autoStart = false;
// 想用的頭像（進房時送出；被選走時 Server 會改給空著的）
let avatarChoice = (() => { const v = Number(localStorage.getItem('tw-mj-avatar')); return Number.isInteger(v) && v >= 0 && v < AVATAR_COUNT ? v : Math.floor(Math.random() * AVATAR_COUNT); })();
// 連線狀態存 key，畫面上依語言顯示
let connectState = 'notConnected';
let infoOpen = false;
let qrOpen = false;
let installPrompt;
let soundEnabled = localStorage.getItem('tw-mj-sound') !== '0';
let hapticsEnabled = localStorage.getItem('tw-mj-haptics') !== '0';
let pendingDiscardId;
let callFlash;
let flashTimer;
// 胡牌動畫：誰胡就跳出誰的 cut-in，播完才顯示結算
let winCutIn;
let cutInTimer;
// 剛摸的牌只在第一次出現時播放摸牌動畫
let animatedDrawId;
// 反應選單同一個（同一個截止時間）只播一次彈出動畫
let animatedPromptDeadline = 0;
function esc(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c)); }
// 顯示目前持有點數（起始 1000）
function scoreText(n) { return String(n); }
function inviteUrl() { return `${location.origin}/online.html?room=${snapshot?.code ?? ''}`; }
function tileHtml(tile, opt = {}) {
    if (opt.hidden)
        return `<button class="mj back ${opt.small ? 'small' : ''}" disabled aria-label="${t('tileBack')}"></button>`;
    const cls = ["mj", tileClass(tile), opt.small ? 'small' : '', opt.latest ? 'latest' : '', opt.selected ? 'selected' : '', opt.drawn ? 'drawn drawn-slot' : '', opt.pending ? 'pending-discard' : '', opt.cls ?? ''].filter(Boolean).join(' ');
    return `<button class="${cls}" ${opt.clickable ? '' : 'disabled'} data-tile="${esc(tile.id)}" aria-label="${esc(tileName(tile))}"><span class="tile-face">${tileFace(tile)}</span></button>`;
}
// 純展示用的小牌（不可點、不帶 data-tile，可放進按鈕裡）
function miniTile(t, cls = '') { return `<span class="mj small ${tileClass(t)} ${cls}" aria-hidden="true"><span class="tile-face">${tileFace(t)}</span></span>`; }
// Server 會把摸進的牌排進手牌；畫面上把剛摸的牌獨立放在最右邊，出牌前不併入
function handInDrawOrder(hand, drawId) {
    const drawn = drawId ? hand.find(t => t.id === drawId) : undefined;
    return drawn ? [...hand.filter(t => t !== drawn), drawn] : hand;
}
function meldHtml(m) { return `<div class="meld">${m.tiles.map(t => tileHtml(t, { small: true })).join('')}</div>`; }
function vibrate(pattern) { if (!hapticsEnabled)
    return; try {
    navigator.vibrate?.(pattern);
}
catch { } }
function flash(text, kind = 'call') { callFlash = { text, kind }; if (flashTimer)
    clearTimeout(flashTimer); flashTimer = window.setTimeout(() => { callFlash = undefined; render(); }, 780); }
function lineInvite() { const text = `${t('lineText', { code: snapshot?.code ?? '' })}\n${inviteUrl()}`; window.open(`https://line.me/R/msg/text/?${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer'); }
function feedbackForSnapshot(prev, next) {
    const pg = prev?.game, ng = next.game;
    if (!ng)
        return;
    if (ng.settlement && !pg?.settlement) {
        playSound('win', soundEnabled);
        vibrate([70, 45, 120]);
        if (ng.settlement.winners.length) {
            winCutIn = { seats: ng.settlement.winners, selfDraw: ng.settlement.endReason === 'self_draw' };
            if (cutInTimer)
                clearTimeout(cutInTimer);
            const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            cutInTimer = window.setTimeout(() => { winCutIn = undefined; render(); }, reduce ? 1500 : 2900 + ng.settlement.winners.length * 250);
        }
        return;
    }
    for (const s of seats) {
        const before = prev?.players[s]?.melds?.length ?? 0;
        const after = next.players[s]?.melds?.length ?? 0;
        if (after > before) {
            const m = next.players[s]?.melds?.[after - 1];
            if (m) {
                const cue = m.type === 'chow' ? 'chow' : m.type === 'pong' ? 'pong' : 'kong';
                playSound(cue, soundEnabled);
                vibrate(m.type === 'kong' ? [45, 35, 65] : 45);
                flash(t(m.type === 'chow' ? 'chow' : m.type === 'pong' ? 'pong' : 'kong'));
                return;
            }
        }
    }
    const prevDiscard = pg?.lastDiscard?.tile.id, nextDiscard = ng.lastDiscard?.tile.id;
    if (nextDiscard && nextDiscard !== prevDiscard && nextDiscard !== pendingDiscardId) {
        playSound('discard', soundEnabled);
    }
    if (ng.lastDrawId && ng.lastDrawId !== pg?.lastDrawId && ng.turn === next.you?.seat) {
        playSound('draw', soundEnabled);
        vibrate(18);
    }
    const prevPrompt = pg?.prompt?.deadline ?? 0, nextPrompt = ng.prompt?.deadline ?? 0;
    if (nextPrompt && nextPrompt !== prevPrompt) {
        vibrate([25, 35, 25]);
    }
}
function send(m) { if (ws?.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify(m)); }
function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING))
        return;
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${scheme}://${location.host}/ws`);
    connectState = 'connecting';
    render();
    ws.onopen = () => { connectState = 'connected'; send({ type: 'HELLO', clientId, name }); render(); };
    ws.onmessage = e => {
        const m = JSON.parse(e.data);
        if (m.type === 'WELCOME') {
            clientId = m.clientId;
            localStorage.setItem(clientIdKey, clientId);
        }
        if (m.type === 'SNAPSHOT') {
            const prev = snapshot;
            feedbackForSnapshot(prev, m.snapshot);
            snapshot = m.snapshot;
            selected = undefined;
            pendingDiscardId = undefined;
            autoStartIfReady();
        }
        if (m.type === 'LEFT') {
            snapshot = undefined;
            selected = undefined;
            pendingDiscardId = undefined;
            infoOpen = false;
            qrOpen = false;
            autoStart = false;
        }
        if (m.type === 'ERROR')
            alert(serverText(m.message));
        render();
    };
    ws.onclose = () => { connectState = 'reconnecting'; render(); setTimeout(connect, 3000); };
}
function autoStartIfReady() {
    if (!autoStart || snapshot?.status !== 'lobby' || snapshot.hostClientId !== snapshot.you?.clientId)
        return;
    if (seats.some(s => !snapshot.players[s]))
        return;
    autoStart = false;
    void goFullscreen();
    send({ type: 'START_GAME' });
}
function seatPlayer(s) { return snapshot?.players[s]; }
function avatarHtml(p, s, cls = 'player-avatar') {
    if (p?.avatar !== undefined)
        return `<div class="${cls} has-face">${avatarSvg(p.avatar)}</div>`;
    return `<div class="${cls}">${avatarText(p, s)}</div>`;
}
function avatarText(p, s) {
    if (!p)
        return seatShort(s);
    const txt = playerName(p.name).trim();
    return esc((txt[0] || seatShort(s)).toUpperCase());
}
function connectionBadge() {
    const good = connectState === 'connected';
    return `<div class="connection-toast ${good ? 'ok' : 'warn'}" aria-live="polite"><span></span>${esc(t(connectState))}</div>`;
}
function langButton() { return `<button class="ghost-btn lang-btn" data-act="lang" aria-label="${t('langToggleLabel')}">${t('langToggle')}</button>`; }
function topbar() { return `<div class="mobile-topbar"><a class="back-link" href="./">${t('home')}</a><span class="topbar-right"><a class="ghost-btn rules-link" href="./rules.html" target="_blank" rel="noopener">${t('rulesLink')}</a>${pwaHint()}${langButton()}</span></div>`; }
function pwaHint() {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    if (standalone)
        return '';
    return `<button class="ghost-btn" data-act="install">${t('installApp')}</button>`;
}
function lobby() {
    // 大廳只是入座順序，風位要等開局抓風才決定
    const rows = seats.map((s, i) => {
        const p = seatPlayer(s);
        return `<div class="seat-row"><div class="seat-mark">${i + 1}</div>${p ? avatarHtml(p, s, 'seat-avatar') : ''}<div class="seat-copy">${p ? `<b>${esc(playerName(p.name))}${s === snapshot?.you?.seat ? t('you') : ''}</b><small>${p.kind === 'bot' ? 'AI' : p.connected ? t('connected') : t('disconnected')}${p.ready ? t('readyMark') : ''}</small>` : `<b>${t('empty')}</b><small>${t('waitingPlayer')}</small>`}</div></div>`;
    }).join('');
    const me = snapshot?.you, mine = me?.seat ? seatPlayer(me.seat) : undefined;
    const host = !!me && snapshot?.hostClientId === me.clientId;
    return `<main class="lobby-wrap mobile-page"><section class="lobby-card">${topbar()}<div class="eyebrow">ROOM</div><h1>${t('roomTitle')}</h1><div class="room-code">${snapshot?.code ?? '----'}</div><p class="room-sub">${t('roomSub')}</p><div class="invite-actions"><button data-act="share" class="primary">${t('shareInvite')}</button><button data-act="qr">${t('showQr')}</button><button data-act="line">${t('lineShare')}</button><button data-act="copy">${t('copyCode')}</button></div><div class="seat-list">${rows}</div>${mine?.kind === 'human' ? avatarPicker(mine.avatar, new Map(seats.filter(s => s !== me?.seat).flatMap(s => { const q = seatPlayer(s); return q?.avatar !== undefined ? [[q.avatar, playerName(q.name)]] : []; }))) : ''}<div class="lobby-actions">${mine?.kind === 'human' ? `<button data-act="rename">${t('rename')}</button><button class="primary" data-act="ready">${mine.ready ? t('unready') : t('ready')}</button>` : ''}${host ? `<button data-act="bots">${t('fillBots')}</button><button class="primary" data-act="start">${t('startGame')}</button>` : ''}<button class="leave-btn" data-act="leaveroom">${t('leaveRoom')}</button></div><p class="tip">${t('lobbyTip')}</p></section>${qrModal()}</main>${connectionBadge()}`;
}
function windTile(slot, i, canPick) {
    if (!slot.wind)
        return `<button class="mj back wind-pick" data-wind="${i}" ${canPick ? '' : 'disabled'} aria-label="${t('windPickLabel')}"></button>`;
    const tile = { kind: 'wind', wind: slot.wind, id: `draw-${slot.wind}` };
    return `<div class="wind-slot ${slot.mine ? 'mine' : ''}">${tileHtml(tile, {})}<small>${esc(playerName(slot.by ?? ''))}${slot.mine ? t('you') : ''}</small></div>`;
}
function windScreen() {
    const w = snapshot?.windDraw;
    const tiles = (w?.tiles ?? []).map((slot, i) => slot.wind ? windTile(slot, i, false) : `<div class="wind-slot">${windTile(slot, i, !!w?.canPick)}<small>&nbsp;</small></div>`).join('');
    const status = !w ? t('windPreparing') : w.done ? t('windDone') : w.canPick ? t('windYourTurn') : t('windWaiting', { name: esc(playerName(w.picker ?? '')) });
    const order = (w?.order ?? []).map((n, i) => `<li class="${!w?.done && n === w?.picker ? 'current' : ''}">${i + 1}. ${esc(playerName(n))}</li>`).join('');
    return `<main class="start-wrap mobile-page"><section class="start-card wind-card">${topbar()}<div class="eyebrow">${t('windEyebrow')}</div><h1>${t('windTitle')}</h1><p class="lead">${t('windLead')}${w && !w.done && w.deadline ? `<b id="wind-countdown" data-deadline="${w.deadline}"></b>` : ''}</p><ol class="wind-order">${order}</ol><div class="wind-row">${tiles}</div><p class="wind-status">${status}</p><button class="leave-btn" data-act="leave">${t('leave')}</button></section></main>${connectionBadge()}`;
}
// 頭像選單：taken 為「已被別人選走的頭像 → 選走的人」
function avatarPicker(current, taken) {
    return `<div class="avatar-picker"><b>${t('chooseAvatar')}</b><div class="avatar-grid">${Array.from({ length: AVATAR_COUNT }, (_, i) => { const owner = taken.get(i); return `<button class="avatar-opt ${i === current ? 'active' : ''}" data-avatar="${i}" ${owner !== undefined ? 'disabled' : ''} aria-label="${owner !== undefined ? esc(t('avatarTaken', { name: owner })) : t('chooseAvatar') + ' ' + (i + 1)}">${avatarSvg(i)}${owner !== undefined ? `<small>${esc(owner)}</small>` : ''}</button>`; }).join('')}</div></div>`;
}
function aiPicker() {
    const hint = aiCount === 3 ? t('aiHint3') : aiCount === 0 ? t('aiHint0') : t('aiHintN', { n: 3 - aiCount });
    return `<div class="ai-picker"><b>${t('aiCount')}</b><div class="ai-options">${[0, 1, 2, 3].map(n => `<button class="${n === aiCount ? 'active' : ''}" data-ai="${n}">${n}</button>`).join('')}</div><small>${hint}</small></div>`;
}
function startScreen() {
    const inviteCode = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
    return `<main class="start-wrap mobile-page"><section class="start-card">${topbar()}<div class="eyebrow">FOUR WINDS MAHJONG NURSERY</div><h1>${t('startTitle')}</h1><p class="lead">${t('startLead')}</p><div class="connection-inline">${esc(t(connectState))}</div><label>${t('nickname')}<input id="name" maxlength="16" value="${esc(name)}" autocomplete="nickname"></label>${avatarPicker(avatarChoice, new Map())}${aiPicker()}<button class="primary wide big-action" data-act="create">${aiCount === 3 ? t('startBattle') : t('createRoom')}</button><div class="or"><span>${t('orJoin')}</span></div><div class="join-row"><input id="code" inputmode="text" maxlength="6" placeholder="ABCDE" value="${esc(inviteCode)}" autocomplete="off"><button data-act="join">${t('join')}</button></div><div class="mobile-benefits"><span>${t('benefitLandscape')}</span><span>${t('benefitReconnect')}</span><span>${t('benefitServer')}</span></div></section></main>${connectionBadge()}`;
}
function playerMeta(p, s) {
    const total = snapshot?.game?.totals[s] ?? 0;
    if (!p)
        return `<div class="player-meta"><div class="player-avatar">${seatShort(s)}</div><span class="wind">${seatShort(s)}</span><span class="player-name">${t('empty')}</span></div>`;
    return `<div class="player-meta">${avatarHtml(p, s)}<span class="wind">${seatShort(s)}</span><span class="player-name">${esc(playerName(p.name))}</span>${snapshot?.game?.dealer === s ? `<i class="dealer">${t('dealer')}</i>` : ''}${p.declaredReady ? `<i class="ready-badge">${t('readyBadge')}</i>` : ''}<span class="player-score">${scoreText(total)}</span>${!p.connected && p.kind === 'human' ? `<em class="player-status">${t('disconnected')}</em>` : ''}</div>`;
}
function opponent(p, s, pos) {
    if (!p)
        return `<section class="opp ${pos}">${playerMeta(undefined, s)}</section>`;
    return `<section class="opp ${pos} ${snapshot?.game?.turn === s ? 'active' : ''}">${metaStack(p, s)}<div class="backs">${Array.from({ length: p.concealedCount }, () => tileHtml(undefined, { small: true, hidden: true })).join('')}</div><div class="melds">${p.melds.map(meldHtml).join('')}</div></section>`;
}
// 花牌擺在名字上方（小牌，一列最多四張），滑鼠移上去可看名稱
function metaStack(p, s) { return `<div class="meta-stack">${flowerRow(p)}${playerMeta(p, s)}</div>`; }
function flowerRow(p) {
    if (!p.flowers.length)
        return '';
    return `<div class="flowers-row" title="${esc(t('flowers') + p.flowers.map(tileName).join(' '))}">${p.flowers.map(f => miniTile(f, 'flower-tile')).join('')}</div>`;
}
function relativePos(viewer, target) {
    const vi = seats.indexOf(viewer), ti = seats.indexOf(target), d = (ti - vi + 4) % 4;
    return d === 0 ? 'bottom' : d === 1 ? 'right' : d === 2 ? 'top' : 'left';
}
function river(p, pos) {
    return `<div class="river r-${pos}">${(p?.discards ?? []).map(t => tileHtml(t, { small: true, latest: snapshot?.game?.lastDiscard?.tile.id === t.id })).join('')}</div>`;
}
// 聽牌提示：等牌時顯示聽哪些牌；輪到自己出牌時標出「打了會聽」的牌，選中後預覽聽牌
// 聽哪些牌只跟自己的手牌有關，只在手牌改變時重算；剩餘張數另外依牌桌上看得到的牌即時扣
let tenpaiCache;
let lastHintSig = '';
function tenpaiInfo(p) {
    const concealed = p.concealed ?? [];
    const key = `${concealed.map(t => t.id).join(',')}|${p.melds.length}`;
    if (tenpaiCache?.key !== key)
        tenpaiCache = { key, waits: waitsFor(concealed, p.melds), byDiscard: discardsToTenpai(concealed, p.melds) };
    // 剩餘張數只扣牌桌上看得到的牌（各家牌河與副露），不扣自己手裡的牌
    const seen = new Map();
    for (const s of seats) {
        const q = seatPlayer(s);
        if (!q)
            continue;
        for (const x of [...q.discards, ...q.melds.flatMap(m => m.tiles)]) {
            const k = tileKey(x);
            seen.set(k, (seen.get(k) ?? 0) + 1);
        }
    }
    const count = (ws) => ws.map(w => ({ tile: w.tile, left: Math.max(0, 4 - (seen.get(tileKey(w.tile)) ?? 0)) }));
    return { waits: count(tenpaiCache.waits), byDiscard: new Map([...tenpaiCache.byDiscard].map(([k, ws]) => [k, count(ws)])) };
}
// 內容（標題＋聽哪些牌）沒變就不重播進場動畫，避免每次有人打牌就閃一下
function waitsHtml(label, waits) {
    return hintBox(label, `<div class="tenpai-tiles">${waits.map(w => `<span class="tenpai-wait ${w.left ? '' : 'dead'}">${miniTile(w.tile)}<i>${w.left}</i></span>`).join('')}</div>`, label + waits.map(w => tileKey(w.tile)).join(','));
}
function hintBox(label, inner, sig) {
    const still = sig === lastHintSig;
    lastHintSig = sig;
    return `<div class="tenpai-hint ${still ? 'still' : ''}"><b>${label}</b>${inner}</div>`;
}
function tenpaiHint(p, canDiscard) {
    const { waits, byDiscard } = tenpaiInfo(p);
    if (waits.length)
        return waitsHtml(p.declaredReady ? t('declaredWaits') : t('waits'), waits);
    if (!canDiscard || !byDiscard.size || p.declaredReady) {
        lastHintSig = '';
        return '';
    }
    const sel = (p.concealed ?? []).find(t => t.id === selected);
    const w = sel && byDiscard.get(tileKey(sel));
    return w ? waitsHtml(t('discardToWait', { tile: tileName(sel) }), w) : hintBox(t('canTenpai'), `<span class="tenpai-note">${t('canTenpaiNote')}</span>`, 'can-tenpai');
}
function wallRail(pos) {
    const count = (pos === 'top' || pos === 'bottom') ? 18 : 12;
    return `<div class="wall ${pos}">${Array.from({ length: count }, () => '<span class="wall-tile"></span>').join('')}</div>`;
}
// 吃／碰／槓按鈕直接畫出要組成的牌（被拿的那張高亮），不用再到牌面上找
function callButton(type, tiles, discardId, i) {
    const seq = [...tiles].sort((a, b) => (a.kind === 'suit' ? a.rank : 0) - (b.kind === 'suit' ? b.rank : 0));
    return `<button class="primary chow-btn" data-reaction="${i}" aria-label="${t(type)} ${seq.map(tileName).join(' ')}"><span>${t(type)}</span><span class="chow-tiles">${seq.map(x => miniTile(x, x.id === discardId ? 'chow-taken' : '')).join('')}</span></button>`;
}
function actionBar() {
    const g = snapshot?.game, me = snapshot?.you;
    if (!g || !me?.seat)
        return '';
    const p = seatPlayer(me.seat);
    if (!p)
        return '';
    if (g.prompt) {
        const still = g.prompt.deadline === animatedPromptDeadline;
        animatedPromptDeadline = g.prompt.deadline;
        return `<div class="reaction-card ${still ? 'still' : ''}"><div class="reaction-head"><span>${t('canReact')}</span><b id="reaction-countdown" data-deadline="${g.prompt.deadline}"></b></div><div class="actions"><button data-act="pass">${t('pass')}</button>${g.prompt.options.map((o, i) => o.type === 'chow' || o.type === 'pong' || o.type === 'kong' ? callButton(o.type, o.tiles ?? [], g.lastDiscard?.tile.id, i) : `<button class="${o.type === 'win' ? 'win' : 'primary'}" data-reaction="${i}">${t(o.type === 'pass' ? 'pass' : o.type)}</button>`).join('')}</div></div>`;
    }
    if (g.phase === 'awaiting_discard' && g.turn === me.seat) {
        const sel = !p.declaredReady && selected ? (p.concealed ?? []).find(t => t.id === selected) : undefined;
        const riichi = sel && tenpaiInfo(p).byDiscard.has(tileKey(sel)) ? `<button class="win" data-act="riichi" data-id="${esc(sel.id)}">${t('declareReady', { tile: tileName(sel) })}</button>` : '';
        const special = `${riichi}${g.canSelfDraw ? `<button class="win" data-act="tsumo">${t('selfDraw')}</button>` : ''}${g.concealedKongs.map(k => `<button data-act="ck" data-id="${k.id}">${t('concealedKong', { tile: tileName(k) })}</button>`).join('')}${g.addedKongs.map(k => `<button data-act="ak" data-id="${k.id}">${t('addedKong', { tile: tileName(k) })}</button>`).join('')}`;
        return special ? `<div class="actions own-actions">${special}</div>` : '';
    }
    return '';
}
// 胡牌 cut-in：胡的人用自己的頭像（開心），輸的人（要付錢的）頭像全部擺上去（驚嚇）
const bandColors = { east: '#c62828', south: '#1f5fb8', west: '#6f3aa8', north: '#1d7a4a' };
function faceOf(s, mood) { return avatarSvg(seatPlayer(s)?.avatar ?? seats.indexOf(s), mood); }
function cutInHtml() {
    if (!winCutIn)
        return '';
    const word = winCutIn.selfDraw ? t('cutInSelfDraw') : t('cutInWin');
    const losers = [...new Set((snapshot?.game?.settlement?.payments ?? []).map(p => p.from))].filter(s => !winCutIn.seats.includes(s));
    const bands = winCutIn.seats.map((s, i) => `<div class="cutin-band" style="--band:${bandColors[s]};--delay:${i * .25}s"><div class="cutin-face">${faceOf(s, 'happy')}</div><div class="cutin-copy"><div class="cutin-word">${word}</div><div class="cutin-name">${esc(nameOf(s))}</div></div></div>`).join('');
    const loserRow = losers.length ? `<div class="cutin-losers" style="--delay:${.45 + winCutIn.seats.length * .25}s">${losers.map(s => `<div class="cutin-loser"><div class="cutin-loser-face">${faceOf(s, 'shock')}</div><span>${esc(nameOf(s))}</span></div>`).join('')}</div>` : '';
    return `<div class="win-cutin" aria-live="assertive">${bands}${loserRow}</div>`;
}
function settlement() {
    if (winCutIn)
        return cutInHtml();
    const s = snapshot?.game?.settlement;
    if (!s)
        return '';
    return `<div class="result-overlay"><div class="result"><div class="result-kicker">${roundText(snapshot?.game?.roundLabel ?? '')}</div><h2>${s.endReason === 'wall_exhausted' ? t('drawGame') : t('handOver')}</h2><h3>${s.winners.map(w => esc(nameOf(w))).join(lang === 'zh' ? '、' : ', ')}</h3>${s.lines.map(x => `<div class="score-line"><span>${esc(scoreLabel(x.label))}</span><b>${t('taiUnit', { n: x.tai })}</b></div>`).join('')}<div class="payments">${s.payments.map(p => `<p>${esc(nameOf(p.from))} → ${esc(nameOf(p.to))}: ${p.amount}</p>`).join('')}</div>${snapshot?.hostClientId === snapshot?.you?.clientId ? `<button class="primary wide" data-act="next">${t('nextHand')}</button>` : `<p>${t('waitHostNext')}</p>`}</div></div>`;
}
function nameOf(s) { const p = seatPlayer(s); return p ? playerName(p.name) : seatLong(s); }
function soundLabel() { return soundEnabled ? t('soundOn') : t('soundOff'); }
function hapticsLabel() { return hapticsEnabled ? t('hapticsOn') : t('hapticsOff'); }
function rulesText(sep) { const st = snapshot.settings; return [t('stakes', { base: st.base, perTai: st.perTai }), st.ronMode === 'multiple' ? t('ronMulti') : t('ronSingle'), t('reactionSecs', { n: st.reactionSeconds })].join(sep); }
function scoreRows() {
    const g = snapshot.game;
    return seats.map(s => { const p = seatPlayer(s); return `<div class="side-row"><span class="side-seat"><span class="mini-wind">${seatShort(s)}</span>${esc(p ? playerName(p.name) : t('empty'))}</span><span class="side-money">${scoreText(g.totals[s])}</span></div>`; }).join('');
}
function infoContent() {
    const g = snapshot.game;
    return `<div class="info-handle"></div><div class="info-head"><div><small>${t('roomLabel')}</small><b>${snapshot.code}</b></div><button class="icon-btn" data-act="closeinfo" aria-label="${t('close')}">×</button></div><div class="info-actions"><button class="primary" data-act="share">${t('share')}</button><button data-act="line">LINE</button><button data-act="qr">QR Code</button><button data-act="fullscreen">${t('fullscreen')}</button><button data-act="sound">${soundLabel()}</button><button data-act="haptics">${hapticsLabel()}</button><button data-act="rename">${t('rename')}</button><button data-act="lang">${t('langToggle')}</button><a class="rules-btn" href="./rules.html" target="_blank" rel="noopener">${t('rulesLink')}</a><button class="leave-btn" data-act="leave">${t('leave')}</button></div><section class="sheet-section"><h3>${t('scores')}</h3>${scoreRows()}</section><section class="sheet-section info-grid"><div><small>${t('round')}</small><b>${roundText(g.roundLabel)}</b></div><div><small>${t('streak')}</small><b>${g.dealerContinuations}</b></div><div><small>${t('wallLeft')}</small><b>${g.wallCount}</b></div><div><small>${t('deadWall')}</small><b>${g.deadWallCount}</b></div></section><section class="sheet-section"><h3>${t('houseRules')}</h3><div class="side-rule">${rulesText(' · ')}</div></section>`;
}
function sidePanel() { const g = snapshot.game; return `<aside class="side-panel"><div class="side-brand"><b>${t('brand')}</b><span class="online-dot" title="${t('onlineDot')}"></span></div><div class="side-box"><h3>${t('roomLabel')}</h3><div class="room-pill">${snapshot.code}</div><button data-act="share">${t('shareInvite')}</button><button data-act="line">${t('lineShare')}</button><button data-act="qr">${t('showQr')}</button><button data-act="sound">${soundLabel()}</button><button data-act="haptics">${hapticsLabel()}</button><button data-act="rename">${t('rename')}</button><button data-act="lang">${t('langToggle')}</button><a class="rules-btn" href="./rules.html" target="_blank" rel="noopener">${t('rulesLink')}</a><button class="leave-btn" data-act="leave">${t('leave')}</button></div><div class="side-box"><h3>${t('scores')}</h3>${scoreRows()}</div><div class="side-box"><h3>${t('gameInfo')}</h3><div class="side-row"><span>${t('round')}</span><b>${roundText(g.roundLabel)}</b></div><div class="side-row"><span>${t('streak')}</span><b>${g.dealerContinuations}</b></div><div class="side-row"><span>${t('wallLeft')}</span><b>${g.wallCount}</b></div><div class="side-row"><span>${t('deadWall')}</span><b>${g.deadWallCount}</b></div></div><div class="side-box"><h3>${t('houseRules')}</h3><div class="side-rule">${rulesText('<br>')}</div></div></aside>`; }
function qrModal() {
    if (!qrOpen || !snapshot?.code)
        return '';
    const url = inviteUrl();
    const src = `https://quickchart.io/qr?size=260&margin=1&text=${encodeURIComponent(url)}`;
    return `<div class="modal-backdrop"><section class="qr-card"><button class="modal-close" data-act="closeqr">×</button><div class="eyebrow">SCAN TO JOIN</div><h2>${t('qrTitle', { code: snapshot.code })}</h2><img src="${src}" alt="${t('qrAlt', { code: snapshot.code })}"><p>${t('qrFallback', { code: snapshot.code })}</p><button class="primary wide" data-act="share">${t('shareLink')}</button></section></div>`;
}
function game() {
    const g = snapshot.game, me = snapshot.you, mySeat = me.seat, p = seatPlayer(mySeat);
    const posMap = {};
    for (const s of seats) {
        const pos = relativePos(mySeat, s);
        if (pos !== 'bottom')
            posMap[pos] = s;
    }
    const canDiscard = g.phase === 'awaiting_discard' && g.turn === mySeat && !g.prompt;
    const tenpai = tenpaiInfo(p);
    const drawAnim = g.lastDrawId !== animatedDrawId;
    animatedDrawId = g.lastDrawId;
    const latest = g.lastDiscard ? `<div class="last">${t('latest', { seat: seatLong(g.lastDiscard.seat), tile: tileName(g.lastDiscard.tile) })}</div>` : '';
    return `<div class="online-shell"><header><a href="./">${t('brand')}</a><div class="header-mid"><b>${roundText(g.roundLabel)}</b><span class="desktop-only"> · ${t('roomCodeShort', { code: snapshot.code })}</span> · ${g.turn === mySeat ? `<strong class="your-turn">${t('yourTurn')}</strong>` : t('waitingFor', { name: esc(nameOf(g.turn)) })}</div><div class="header-score desktop-only">${seats.map(s => `${seatShort(s)} ${scoreText(g.totals[s])}`).join('　')}</div><button class="game-menu" data-act="info" aria-label="${t('roomInfo')}">☰</button></header><div class="game-layout"><main class="table-area"><div class="table-wrap"><div class="table">${wallRail('top')}${wallRail('right')}${wallRail('bottom')}${wallRail('left')}${['top', 'left', 'right'].map(pos => { const s = posMap[pos]; return opponent(seatPlayer(s), s, pos); }).join('')}<div class="center"><div><div class="round">${roundText(g.roundLabel)}</div><strong>${g.wallCount}</strong><small>${t('wallLeft')}</small><div class="stakes">${snapshot.settings.base} / ${snapshot.settings.perTai}</div><div class="continuation">${g.dealerContinuations ? t('streakN', { n: g.dealerContinuations }) : ' '}</div>${latest}</div></div>${seats.map(s => river(seatPlayer(s), relativePos(mySeat, s))).join('')}<section class="you ${g.turn === mySeat ? 'active' : ''}"><div class="hand-actions">${actionBar()}</div>${tenpaiHint(p, canDiscard)}${metaStack(p, mySeat)}<div class="melds">${p.melds.map(meldHtml).join('')}</div><div class="hand">${handInDrawOrder(p.concealed ?? [], g.lastDrawId).map(t => tileHtml(t, { selected: selected === t.id, clickable: canDiscard && (!p.declaredReady || t.id === g.lastDrawId), drawn: g.lastDrawId === t.id, pending: pendingDiscardId === t.id, cls: [canDiscard && tenpai.byDiscard.has(tileKey(t)) ? 'tenpai-discard' : '', g.lastDrawId === t.id && !drawAnim ? 'settled' : ''].join(' ') })).join('')}</div></section></div></div><div class="actionbar"></div></main>${sidePanel()}</div><div class="mobile-sheet ${infoOpen ? 'open' : ''}">${infoContent()}</div><div class="sheet-scrim ${infoOpen ? 'open' : ''}" data-act="closeinfo"></div><div class="rotate-hint"><div>↻</div><b>${t('rotateTitle')}</b><span>${t('rotateBody')}</span><button data-act="fullscreen">${t('enterFullscreen')}</button></div>${callFlash ? `<div class="call-flash ${callFlash.kind}">${callFlash.text}</div>` : ''}${settlement()}${qrModal()}${connectionBadge()}</div>`;
}
function render() { if (!snapshot)
    app.innerHTML = startScreen();
else if (snapshot.status === 'wind')
    app.innerHTML = windScreen();
else if (snapshot.status === 'lobby')
    app.innerHTML = lobby();
else
    app.innerHTML = game(); bind(); updatePromptCountdown(); }
async function shareInvite() {
    const data = { title: t('shareTitle'), text: t('shareText', { code: snapshot?.code ?? '' }), url: inviteUrl() };
    try {
        if (navigator.share) {
            await navigator.share(data);
            return;
        }
    }
    catch { }
    try {
        await navigator.clipboard.writeText(inviteUrl());
        alert(t('linkCopied'));
    }
    catch { }
}
async function goFullscreen() {
    try {
        if (!document.fullscreenElement)
            await document.documentElement.requestFullscreen();
    }
    catch { }
    try {
        await screen.orientation?.lock?.('landscape');
    }
    catch { }
}
async function installPwa() {
    if (installPrompt) {
        installPrompt.prompt();
        try {
            await installPrompt.userChoice;
        }
        catch { }
        installPrompt = undefined;
        return;
    }
    alert(t('installHelp'));
}
function updatePromptCountdown() {
    const el = document.querySelector('#reaction-countdown,#wind-countdown');
    if (!el)
        return;
    const deadline = Number(el.dataset.deadline || 0);
    const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    el.textContent = `${left}s`;
}
function bind() {
    document.querySelectorAll('[data-act]').forEach(el => el.onclick = () => {
        const a = el.dataset.act;
        try {
            if (a === 'create') {
                name = document.querySelector('#name').value.trim() || name;
                localStorage.setItem('tw-mj-name', name);
                autoStart = aiCount === 3;
                if (autoStart)
                    void goFullscreen();
                send({ type: 'CREATE_ROOM', name, avatar: avatarChoice, settings: { aiCount } });
            }
            else if (a === 'join') {
                name = document.querySelector('#name').value.trim() || name;
                localStorage.setItem('tw-mj-name', name);
                send({ type: 'JOIN_ROOM', code: document.querySelector('#code').value.trim().toUpperCase(), name, avatar: avatarChoice });
            }
            else if (a === 'copy')
                navigator.clipboard?.writeText(snapshot?.code ?? '');
            else if (a === 'copylink')
                navigator.clipboard?.writeText(inviteUrl());
            else if (a === 'share') {
                playSound('button', soundEnabled);
                void shareInvite();
            }
            else if (a === 'line') {
                playSound('button', soundEnabled);
                lineInvite();
            }
            else if (a === 'sound') {
                soundEnabled = !soundEnabled;
                localStorage.setItem('tw-mj-sound', soundEnabled ? '1' : '0');
                if (soundEnabled)
                    playSound('button', true);
                render();
            }
            else if (a === 'haptics') {
                hapticsEnabled = !hapticsEnabled;
                localStorage.setItem('tw-mj-haptics', hapticsEnabled ? '1' : '0');
                vibrate(25);
                render();
            }
            else if (a === 'qr') {
                qrOpen = true;
                render();
            }
            else if (a === 'closeqr') {
                qrOpen = false;
                render();
            }
            else if (a === 'info') {
                infoOpen = true;
                render();
            }
            else if (a === 'closeinfo') {
                infoOpen = false;
                render();
            }
            else if (a === 'fullscreen')
                void goFullscreen();
            else if (a === 'install')
                void installPwa();
            else if (a === 'rename') {
                const next = prompt(t('renamePrompt'), snapshot?.you?.name ?? name)?.trim().slice(0, 16);
                if (next) {
                    name = next;
                    localStorage.setItem('tw-mj-name', name);
                    send({ type: 'SET_NAME', name });
                }
            }
            else if (a === 'lang') {
                const input = document.querySelector('#name');
                if (input)
                    name = input.value;
                setLang(lang === 'zh' ? 'en' : 'zh');
                render();
            }
            else if (a === 'ready')
                send({ type: 'SET_READY', ready: !seatPlayer(snapshot.you.seat)?.ready });
            else if (a === 'bots')
                send({ type: 'FILL_BOTS' });
            else if (a === 'start') {
                void goFullscreen();
                send({ type: 'START_GAME' });
            }
            else if (a === 'pass')
                send({ type: 'ACTION', action: 'PASS' });
            else if (a === 'riichi') {
                playSound('discard', soundEnabled);
                vibrate([30, 30, 60]);
                flash(t('readyBadge'));
                send({ type: 'ACTION', action: 'DECLARE_READY', tileId: el.dataset.id });
            }
            else if (a === 'tsumo')
                send({ type: 'ACTION', action: 'SELF_DRAW' });
            else if (a === 'ck')
                send({ type: 'ACTION', action: 'CONCEALED_KONG', tileId: el.dataset.id });
            else if (a === 'ak')
                send({ type: 'ACTION', action: 'ADDED_KONG', tileId: el.dataset.id });
            else if (a === 'next')
                send({ type: 'NEXT_HAND' });
            else if (a === 'leaveroom') {
                if (confirm(t('leaveRoomConfirm')))
                    send({ type: 'LEAVE_ROOM' });
            }
            else if (a === 'leave') {
                const alone = seats.every(s => { const p = seatPlayer(s); return !p || p.kind === 'bot' || s === snapshot?.you?.seat; });
                const msg = alone ? t('leaveAlone') : t('leaveOthers');
                if (confirm(msg))
                    send({ type: 'LEAVE_ROOM' });
            }
        }
        catch { }
    });
    document.querySelectorAll('[data-tile]').forEach(el => el.onclick = () => {
        const id = el.dataset.tile;
        if (pendingDiscardId)
            return;
        if (selected === id) {
            pendingDiscardId = id;
            playSound('discard', soundEnabled);
            vibrate(32);
            render();
            window.setTimeout(() => { send({ type: 'ACTION', action: 'DISCARD', tileId: id }); selected = undefined; pendingDiscardId = undefined; }, 120);
        }
        else {
            selected = id;
            playSound('button', soundEnabled);
            vibrate(12);
            render();
        }
    });
    document.querySelectorAll('[data-avatar]').forEach(el => el.onclick = () => {
        const input = document.querySelector('#name');
        if (input)
            name = input.value;
        avatarChoice = Number(el.dataset.avatar);
        localStorage.setItem('tw-mj-avatar', String(avatarChoice));
        playSound('button', soundEnabled);
        if (snapshot?.status === 'lobby')
            send({ type: 'SET_AVATAR', avatar: avatarChoice });
        else
            render();
    });
    document.querySelectorAll('[data-ai]').forEach(el => el.onclick = () => {
        const input = document.querySelector('#name');
        if (input)
            name = input.value;
        aiCount = Number(el.dataset.ai);
        localStorage.setItem('tw-mj-ai-count', String(aiCount));
        playSound('button', soundEnabled);
        render();
    });
    document.querySelectorAll('[data-wind]').forEach(el => el.onclick = () => { playSound('draw', soundEnabled); vibrate(20); send({ type: 'PICK_WIND', index: Number(el.dataset.wind) }); });
    document.querySelectorAll('[data-reaction]').forEach(el => el.onclick = () => { playSound('button', soundEnabled); vibrate(28); send({ type: 'ACTION', action: 'REACTION', optionIndex: Number(el.dataset.reaction) }); });
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; render(); });
if ('serviceWorker' in navigator)
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => { }));
window.addEventListener('online', () => connect());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && (!ws || ws.readyState === WebSocket.CLOSED))
    connect(); });
setInterval(updatePromptCountdown, 250);
connect();
render();
//# sourceMappingURL=client.js.map