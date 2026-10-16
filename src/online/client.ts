import type { RoomSnapshot, ServerMessage, ClientMessage, PublicPlayer } from './protocol.js';
import type { Seat, Tile, Meld } from '../core/types/mahjong.js';
import { tileClass, tileFace } from '../web/tileView.js';
import { playSound } from '../web/sound.js';
import { waitsFor, discardsToTenpai, type Wait } from '../web/tenpai.js';
import { tileKey } from '../core/engine/tiles.js';
import { avatarSvg, AVATAR_COUNT } from './avatars.js';
import { t, lang, setLang, seatShort, seatLong, tileName, serverText, roundText, scoreLabel, playerName } from './i18n.js';

const app=document.querySelector<HTMLDivElement>('#online-app')!;
const seats:Seat[]=['east','south','west','north'];
let ws:WebSocket|undefined;
let snapshot:RoomSnapshot|undefined;
let selected:string|undefined;
let name=localStorage.getItem('tw-mj-name')||t('defaultName',{n:Math.floor(Math.random()*900+100)});
const clientIdKey='tw-mj-client-id';
// 建房時選 AI 人數；選 3 個 AI（只有自己一個真人）時建好房間就直接開局
let aiCount=Math.min(3,Math.max(0,Number(localStorage.getItem('tw-mj-ai-count')??3)||0));
let clientId=localStorage.getItem(clientIdKey)||crypto.randomUUID();
localStorage.setItem(clientIdKey,clientId);
let autoStart=false;
// 想用的頭像（進房時送出；被選走時 Server 會改給空著的）
let avatarChoice=(()=>{const v=Number(localStorage.getItem('tw-mj-avatar'));return Number.isInteger(v)&&v>=0&&v<AVATAR_COUNT?v:Math.floor(Math.random()*AVATAR_COUNT);})();
// 連線狀態存 key，畫面上依語言顯示
let connectState:'notConnected'|'connecting'|'connected'|'reconnecting'='notConnected';
let infoOpen=false;
let qrOpen=false;
let installPrompt:any;
let soundEnabled=localStorage.getItem('tw-mj-sound')!=='0';
let hapticsEnabled=localStorage.getItem('tw-mj-haptics')!=='0';
let pendingDiscardId:string|undefined;
let callFlash:{text:string;kind:'call'|'win'}|undefined;
let flashTimer:number|undefined;
// 結算畫面（胡牌動畫＋結算合一）：同一局的結算只播一次進場動畫
let resultAnimKey='';
let resultAnimAt=0;
// 手機結算畫面的分頁：結果／所有人的牌／算式
let resultTab:'result'|'hands'|'pay'='result';
// 剛摸的牌只在第一次出現時播放摸牌動畫
let animatedDrawId:string|undefined;
// 反應選單同一個（同一個截止時間）只播一次彈出動畫
let animatedPromptDeadline=0;

function esc(s:string):string{return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c));}
// 顯示目前持有點數（起始 1000）
function scoreText(n:number):string{return String(n);}
function inviteUrl():string{return `${location.origin}/online.html?room=${snapshot?.code??''}`;}
function tileHtml(tile:Tile,opt:{small?:boolean;hidden?:boolean;latest?:boolean;clickable?:boolean;selected?:boolean;drawn?:boolean;pending?:boolean;cls?:string}={}):string{
  if(opt.hidden)return `<button class="mj back ${opt.small?'small':''}" disabled aria-label="${t('tileBack')}"></button>`;
  const cls=["mj",tileClass(tile),opt.small?'small':'',opt.latest?'latest':'',opt.selected?'selected':'',opt.drawn?'drawn drawn-slot':'',opt.pending?'pending-discard':'',opt.cls??''].filter(Boolean).join(' ');
  return `<button class="${cls}" ${opt.clickable?'':'disabled'} data-tile="${esc(tile.id)}" aria-label="${esc(tileName(tile))}"><span class="tile-face">${tileFace(tile)}</span></button>`;
}
// 純展示用的小牌（不可點、不帶 data-tile，可放進按鈕裡）
function miniTile(t:Tile,cls=''):string{return `<span class="mj small ${tileClass(t)} ${cls}" aria-hidden="true"><span class="tile-face">${tileFace(t)}</span></span>`;}
// Server 會把摸進的牌排進手牌；畫面上把剛摸的牌獨立放在最右邊，出牌前不併入
function handInDrawOrder(hand:Tile[],drawId:string|undefined):Tile[]{
  const drawn=drawId?hand.find(t=>t.id===drawId):undefined;
  return drawn?[...hand.filter(t=>t!==drawn),drawn]:hand;
}
function meldHtml(m:Meld):string{return `<div class="meld">${m.tiles.map(t=>tileHtml(t,{small:true})).join('')}</div>`;}
function vibrate(pattern:number|number[]):void{if(!hapticsEnabled)return;try{navigator.vibrate?.(pattern);}catch{}}
function flash(text:string,kind:'call'|'win'='call'):void{callFlash={text,kind};if(flashTimer)clearTimeout(flashTimer);flashTimer=window.setTimeout(()=>{callFlash=undefined;render();},780);}
function lineInvite():void{const text=`${t('lineText',{code:snapshot?.code??''})}\n${inviteUrl()}`;window.open(`https://line.me/R/msg/text/?${encodeURIComponent(text)}`,'_blank','noopener,noreferrer');}
function feedbackForSnapshot(prev:RoomSnapshot|undefined,next:RoomSnapshot):void{
  const pg=prev?.game,ng=next.game;if(!ng)return;
  if(ng.settlement&&!pg?.settlement){
    if(ng.settlement.winners.length){playSound('win',soundEnabled);vibrate([70,45,120]);}
    return;
  }
  for(const s of seats){const before=prev?.players[s]?.melds?.length??0;const after=next.players[s]?.melds?.length??0;if(after>before){const m=next.players[s]?.melds?.[after-1];if(m){const cue=m.type==='chow'?'chow':m.type==='pong'?'pong':'kong';playSound(cue,soundEnabled);vibrate(m.type==='kong'?[45,35,65]:45);flash(t(m.type==='chow'?'chow':m.type==='pong'?'pong':'kong'));return;}}}
  const prevDiscard=pg?.lastDiscard?.tile.id,nextDiscard=ng.lastDiscard?.tile.id;if(nextDiscard&&nextDiscard!==prevDiscard&&nextDiscard!==pendingDiscardId){playSound('discard',soundEnabled);}
  if(ng.lastDrawId&&ng.lastDrawId!==pg?.lastDrawId&&ng.turn===next.you?.seat){playSound('draw',soundEnabled);vibrate(18);}
  const prevPrompt=pg?.prompt?.deadline??0,nextPrompt=ng.prompt?.deadline??0;if(nextPrompt&&nextPrompt!==prevPrompt){vibrate([25,35,25]);}
}
function send(m:ClientMessage):void{if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(m));}
function connect():void{
  if(ws&&(ws.readyState===WebSocket.OPEN||ws.readyState===WebSocket.CONNECTING))return;
  const scheme=location.protocol==='https:'?'wss':'ws';
  ws=new WebSocket(`${scheme}://${location.host}/ws`);
  connectState='connecting';render();
  ws.onopen=()=>{connectState='connected';send({type:'HELLO',clientId,name});render();};
  ws.onmessage=e=>{
    const m=JSON.parse(e.data) as ServerMessage;
    if(m.type==='WELCOME'){clientId=m.clientId;localStorage.setItem(clientIdKey,clientId);}
    if(m.type==='SNAPSHOT'){const prev=snapshot;feedbackForSnapshot(prev,m.snapshot);snapshot=m.snapshot;selected=undefined;pendingDiscardId=undefined;autoStartIfReady();}
    if(m.type==='LEFT'){snapshot=undefined;selected=undefined;pendingDiscardId=undefined;infoOpen=false;qrOpen=false;autoStart=false;}
    if(m.type==='ERROR')alert(serverText(m.message));
    render();
  };
  ws.onclose=()=>{connectState='reconnecting';render();setTimeout(connect,3000);};
}
function autoStartIfReady():void{
  if(!autoStart||snapshot?.status!=='lobby'||snapshot.hostClientId!==snapshot.you?.clientId)return;
  if(seats.some(s=>!snapshot!.players[s]))return;
  autoStart=false;void goFullscreen();send({type:'START_GAME'});
}
function seatPlayer(s:Seat):PublicPlayer|undefined{return snapshot?.players[s];}
function avatarHtml(p:PublicPlayer|undefined,s:Seat,cls='player-avatar'):string{
  if(p?.avatar!==undefined)return `<div class="${cls} has-face">${avatarSvg(p.avatar)}</div>`;
  return `<div class="${cls}">${avatarText(p,s)}</div>`;
}
function avatarText(p:PublicPlayer|undefined,s:Seat):string{
  if(!p)return seatShort(s);
  const txt=playerName(p.name).trim();
  return esc((txt[0]||seatShort(s)).toUpperCase());
}
function connectionBadge():string{
  const good=connectState==='connected';
  return `<div class="connection-toast ${good?'ok':'warn'}" aria-live="polite"><span></span>${esc(t(connectState))}</div>`;
}
function langButton():string{return `<button class="ghost-btn lang-btn" data-act="lang" aria-label="${t('langToggleLabel')}">${t('langToggle')}</button>`;}
function topbar():string{return `<div class="mobile-topbar"><a class="back-link" href="./">${t('home')}</a><span class="topbar-right"><a class="ghost-btn rules-link" href="./rules.html" target="_blank" rel="noopener">${t('rulesLink')}</a>${pwaHint()}${langButton()}</span></div>`;}
function pwaHint():string{
  const standalone=window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone===true;
  if(standalone)return '';
  return `<button class="ghost-btn" data-act="install">${t('installApp')}</button>`;
}
function lobby():string{
  // 大廳只是入座順序，風位要等開局抓風才決定
  const rows=seats.map((s,i)=>{
    const p=seatPlayer(s);
    return `<div class="seat-row"><div class="seat-mark">${i+1}</div>${p?avatarHtml(p,s,'seat-avatar'):''}<div class="seat-copy">${p?`<b>${esc(playerName(p.name))}${s===snapshot?.you?.seat?t('you'):''}</b><small>${p.kind==='bot'?'AI':p.connected?t('connected'):t('disconnected')}${p.ready?t('readyMark'):''}</small>`:`<b>${t('empty')}</b><small>${t('waitingPlayer')}</small>`}</div></div>`;
  }).join('');
  const me=snapshot?.you,mine=me?.seat?seatPlayer(me.seat):undefined;
  const host=!!me&&snapshot?.hostClientId===me.clientId;
  return `<main class="lobby-wrap mobile-page"><section class="lobby-card">${topbar()}<div class="eyebrow">ROOM</div><h1>${t('roomTitle')}</h1><div class="room-code">${snapshot?.code??'----'}</div><p class="room-sub">${t('roomSub')}</p><div class="invite-actions"><button data-act="share" class="primary">${t('shareInvite')}</button><button data-act="qr">${t('showQr')}</button><button data-act="line">${t('lineShare')}</button><button data-act="copy">${t('copyCode')}</button></div><div class="seat-list">${rows}</div>${mine?.kind==='human'?avatarPicker(mine.avatar,new Map(seats.filter(s=>s!==me?.seat).flatMap(s=>{const q=seatPlayer(s);return q?.avatar!==undefined?[[q.avatar,playerName(q.name)] as [number,string]]:[];}))):''}<div class="lobby-actions">${mine?.kind==='human'?`<button data-act="rename">${t('rename')}</button><button class="primary" data-act="ready">${mine.ready?t('unready'):t('ready')}</button>`:''}${host?`<button data-act="bots">${t('fillBots')}</button><button class="primary" data-act="start">${t('startGame')}</button>`:''}<button class="leave-btn" data-act="leaveroom">${t('leaveRoom')}</button></div><p class="tip">${t('lobbyTip')}</p></section>${qrModal()}</main>${connectionBadge()}`;
}
function windTile(slot:NonNullable<RoomSnapshot['windDraw']>['tiles'][number],i:number,canPick:boolean):string{
  if(!slot.wind)return `<button class="mj back wind-pick" data-wind="${i}" ${canPick?'':'disabled'} aria-label="${t('windPickLabel')}"></button>`;
  const tile={kind:'wind',wind:slot.wind,id:`draw-${slot.wind}`} as Tile;
  return `<div class="wind-slot ${slot.mine?'mine':''}">${tileHtml(tile,{})}<small>${esc(playerName(slot.by??''))}${slot.mine?t('you'):''}</small></div>`;
}
function windScreen():string{
  const w=snapshot?.windDraw;
  const tiles=(w?.tiles??[]).map((slot,i)=>slot.wind?windTile(slot,i,false):`<div class="wind-slot">${windTile(slot,i,!!w?.canPick)}<small>&nbsp;</small></div>`).join('');
  const status=!w?t('windPreparing'):w.done?t('windDone'):w.canPick?t('windYourTurn'):t('windWaiting',{name:esc(playerName(w.picker??''))});
  const order=(w?.order??[]).map((n,i)=>`<li class="${!w?.done&&n===w?.picker?'current':''}">${i+1}. ${esc(playerName(n))}</li>`).join('');
  return `<main class="start-wrap mobile-page"><section class="start-card wind-card">${topbar()}<div class="eyebrow">${t('windEyebrow')}</div><h1>${t('windTitle')}</h1><p class="lead">${t('windLead')}${w&&!w.done&&w.deadline?`<b id="wind-countdown" data-deadline="${w.deadline}"></b>`:''}</p><ol class="wind-order">${order}</ol><div class="wind-row">${tiles}</div><p class="wind-status">${status}</p><button class="leave-btn" data-act="leave">${t('leave')}</button></section></main>${connectionBadge()}`;
}
// 頭像選單：taken 為「已被別人選走的頭像 → 選走的人」
function avatarPicker(current:number|undefined,taken:Map<number,string>):string{
  return `<div class="avatar-picker"><b>${t('chooseAvatar')}</b><div class="avatar-grid">${Array.from({length:AVATAR_COUNT},(_,i)=>{const owner=taken.get(i);return `<button class="avatar-opt ${i===current?'active':''}" data-avatar="${i}" ${owner!==undefined?'disabled':''} aria-label="${owner!==undefined?esc(t('avatarTaken',{name:owner})):t('chooseAvatar')+' '+(i+1)}">${avatarSvg(i)}${owner!==undefined?`<small>${esc(owner)}</small>`:''}</button>`;}).join('')}</div></div>`;
}
function aiPicker():string{
  const hint=aiCount===3?t('aiHint3'):aiCount===0?t('aiHint0'):t('aiHintN',{n:3-aiCount});
  return `<div class="ai-picker"><b>${t('aiCount')}</b><div class="ai-options">${[0,1,2,3].map(n=>`<button class="${n===aiCount?'active':''}" data-ai="${n}">${n}</button>`).join('')}</div><small>${hint}</small></div>`;
}
function startScreen():string{
  const inviteCode=(new URLSearchParams(location.search).get('room')||'').toUpperCase();
  return `<main class="start-wrap mobile-page"><section class="start-card">${topbar()}<div class="eyebrow">FOUR WINDS MAHJONG NURSERY</div><h1>${t('startTitle')}</h1><p class="lead">${t('startLead')}</p><div class="connection-inline">${esc(t(connectState))}</div><label>${t('nickname')}<input id="name" maxlength="16" value="${esc(name)}" autocomplete="nickname"></label>${avatarPicker(avatarChoice,new Map())}${aiPicker()}<button class="primary wide big-action" data-act="create">${aiCount===3?t('startBattle'):t('createRoom')}</button><div class="or"><span>${t('orJoin')}</span></div><div class="join-row"><input id="code" inputmode="text" maxlength="6" placeholder="ABCDE" value="${esc(inviteCode)}" autocomplete="off"><button data-act="join">${t('join')}</button></div><div class="mobile-benefits"><span>${t('benefitLandscape')}</span><span>${t('benefitReconnect')}</span><span>${t('benefitServer')}</span></div></section></main>${connectionBadge()}`;
}
function playerMeta(p:PublicPlayer|undefined,s:Seat):string{
  const total=snapshot?.game?.totals[s]??0;
  if(!p)return `<div class="player-meta"><div class="player-avatar">${seatShort(s)}</div><span class="wind">${seatShort(s)}</span><span class="player-name">${t('empty')}</span></div>`;
  return `<div class="player-meta">${avatarHtml(p,s)}<span class="wind">${seatShort(s)}</span><span class="player-name">${esc(playerName(p.name))}</span>${snapshot?.game?.dealer===s?`<i class="dealer">${t('dealer')}</i>`:''}${p.declaredReady?`<i class="ready-badge">${t('readyBadge')}</i>`:''}<span class="player-score">${scoreText(total)}</span>${!p.connected&&p.kind==='human'?`<em class="player-status">${t('disconnected')}</em>`:''}</div>`;
}
function opponent(p:PublicPlayer|undefined,s:Seat,pos:'top'|'left'|'right'):string{
  if(!p)return `<section class="opp ${pos}">${playerMeta(undefined,s)}</section>`;
  return `<section class="opp ${pos} ${snapshot?.game?.turn===s?'active':''}">${metaStack(p,s)}<div class="backs ${p.concealed?'revealed':''}">${p.concealed?p.concealed.map(x=>tileHtml(x,{small:true})).join(''):Array.from({length:p.concealedCount},()=>tileHtml(undefined as never,{small:true,hidden:true})).join('')}</div><div class="melds">${p.melds.map(meldHtml).join('')}</div></section>`;
}
// 花牌擺在名字上方（小牌，一列最多四張），滑鼠移上去可看名稱
function metaStack(p:PublicPlayer,s:Seat):string{return `<div class="meta-stack">${flowerRow(p)}${playerMeta(p,s)}</div>`;}
function flowerRow(p:PublicPlayer):string{
  if(!p.flowers.length)return '';
  return `<div class="flowers-row" title="${esc(t('flowers')+p.flowers.map(tileName).join(' '))}">${p.flowers.map(f=>miniTile(f,'flower-tile')).join('')}</div>`;
}
function relativePos(viewer:Seat,target:Seat):'bottom'|'right'|'top'|'left'{
  const vi=seats.indexOf(viewer),ti=seats.indexOf(target),d=(ti-vi+4)%4;
  return d===0?'bottom':d===1?'right':d===2?'top':'left';
}
function river(p:PublicPlayer|undefined,pos:'bottom'|'right'|'top'|'left'):string{
  return `<div class="river r-${pos}">${(p?.discards??[]).map(t=>tileHtml(t,{small:true,latest:snapshot?.game?.lastDiscard?.tile.id===t.id})).join('')}</div>`;
}
// 聽牌提示：等牌時顯示聽哪些牌；輪到自己出牌時標出「打了會聽」的牌，選中後預覽聽牌
// 聽哪些牌只跟自己的手牌有關，只在手牌改變時重算；剩餘張數另外依牌桌上看得到的牌即時扣
let tenpaiCache:{key:string;waits:Wait[];byDiscard:Map<string,Wait[]>}|undefined;
let lastHintSig='';
function tenpaiInfo(p:PublicPlayer):{waits:Wait[];byDiscard:Map<string,Wait[]>}{
  const concealed=p.concealed??[];
  const key=`${concealed.map(t=>t.id).join(',')}|${p.melds.length}`;
  if(tenpaiCache?.key!==key)tenpaiCache={key,waits:waitsFor(concealed,p.melds),byDiscard:discardsToTenpai(concealed,p.melds)};
  // 剩餘張數只扣牌桌上看得到的牌（各家牌河與副露），不扣自己手裡的牌
  const seen=new Map<string,number>();
  for(const s of seats){const q=seatPlayer(s);if(!q)continue;for(const x of [...q.discards,...q.melds.flatMap(m=>m.tiles)]){const k=tileKey(x);seen.set(k,(seen.get(k)??0)+1);}}
  const count=(ws:Wait[])=>ws.map(w=>({tile:w.tile,left:Math.max(0,4-(seen.get(tileKey(w.tile))??0))}));
  return {waits:count(tenpaiCache.waits),byDiscard:new Map([...tenpaiCache.byDiscard].map(([k,ws])=>[k,count(ws)]))};
}
// 內容（標題＋聽哪些牌）沒變就不重播進場動畫，避免每次有人打牌就閃一下
function waitsHtml(label:string,waits:Wait[]):string{
  return hintBox(label,`<div class="tenpai-tiles">${waits.map(w=>`<span class="tenpai-wait ${w.left?'':'dead'}">${miniTile(w.tile)}<i>${w.left}</i></span>`).join('')}</div>`,label+waits.map(w=>tileKey(w.tile)).join(','));
}
function hintBox(label:string,inner:string,sig:string):string{
  const still=sig===lastHintSig;lastHintSig=sig;
  return `<div class="tenpai-hint ${still?'still':''}"><b>${label}</b>${inner}</div>`;
}
function tenpaiHint(p:PublicPlayer,canDiscard:boolean):string{
  const {waits,byDiscard}=tenpaiInfo(p);
  if(waits.length)return waitsHtml(p.declaredReady?t('declaredWaits'):t('waits'),waits);
  if(!canDiscard||!byDiscard.size||p.declaredReady){lastHintSig='';return'';}
  const sel=(p.concealed??[]).find(t=>t.id===selected);
  const w=sel&&byDiscard.get(tileKey(sel));
  return w?waitsHtml(t('discardToWait',{tile:tileName(sel!)}),w):hintBox(t('canTenpai'),`<span class="tenpai-note">${t('canTenpaiNote')}</span>`,'can-tenpai');
}
function wallRail(pos:'top'|'right'|'bottom'|'left'):string{
  const count=(pos==='top'||pos==='bottom')?18:12;
  return `<div class="wall ${pos}">${Array.from({length:count},()=>'<span class="wall-tile"></span>').join('')}</div>`;
}
// 吃／碰／槓按鈕直接畫出要組成的牌（被拿的那張高亮），不用再到牌面上找
function callButton(type:'chow'|'pong'|'kong',tiles:Tile[],discardId:string|undefined,i:number):string{
  const seq=[...tiles].sort((a,b)=>(a.kind==='suit'?a.rank:0)-(b.kind==='suit'?b.rank:0));
  return `<button class="primary chow-btn" data-reaction="${i}" aria-label="${t(type)} ${seq.map(tileName).join(' ')}"><span>${t(type)}</span><span class="chow-tiles">${seq.map(x=>miniTile(x,x.id===discardId?'chow-taken':'')).join('')}</span></button>`;
}
function actionBar():string{
  const g=snapshot?.game,me=snapshot?.you;if(!g||!me?.seat)return'';
  const p=seatPlayer(me.seat);if(!p)return'';
  if(g.prompt){const still=g.prompt.deadline===animatedPromptDeadline;animatedPromptDeadline=g.prompt.deadline;return `<div class="reaction-card ${still?'still':''}"><div class="reaction-head"><span>${t('canReact')}</span><b id="reaction-countdown" data-deadline="${g.prompt.deadline}"></b></div><div class="actions"><button data-act="pass">${t('pass')}</button>${g.prompt.options.map((o,i)=>o.type==='chow'||o.type==='pong'||o.type==='kong'?callButton(o.type,o.tiles??[],g.lastDiscard?.tile.id,i):`<button class="${o.type==='win'?'win':'primary'}" data-reaction="${i}">${t(o.type==='pass'?'pass':o.type)}</button>`).join('')}</div></div>`;}
  if(g.phase==='awaiting_discard'&&g.turn===me.seat){const sel=!p.declaredReady&&selected?(p.concealed??[]).find(t=>t.id===selected):undefined;const riichi=sel&&tenpaiInfo(p).byDiscard.has(tileKey(sel))?`<button class="win" data-act="riichi" data-id="${esc(sel.id)}">${t('declareReady',{tile:tileName(sel)})}</button>`:'';const special=`${riichi}${g.canSelfDraw?`<button class="win" data-act="tsumo">${t('selfDraw')}</button>`:''}${g.concealedKongs.map(k=>`<button data-act="ck" data-id="${k.id}">${t('concealedKong',{tile:tileName(k)})}</button>`).join('')}${g.addedKongs.map(k=>`<button data-act="ak" data-id="${k.id}">${t('addedKong',{tile:tileName(k)})}</button>`).join('')}`;return special?`<div class="actions own-actions">${special}</div>`:'';}
  return'';
}
// 結算畫面：胡牌橫幅（開心頭像＋加分）→ 胡牌牌組與台數 → 其他人（輸的人哭哭臉＋扣分；放槍那張擺在旁邊）→ 所有人手牌 → 牌數檢查
const bandColors:Record<Seat,string>={east:'#c62828',south:'#1f5fb8',west:'#6f3aa8',north:'#1d7a4a'};
function faceOf(s:Seat,mood:'happy'|'shock'):string{return avatarSvg(seatPlayer(s)?.avatar??seats.indexOf(s),mood);}
function signed(n:number):string{return n>0?`+${n}`:`${n}`;}
function resTiles(tiles:Tile[],cls='res-tile'):string{return tiles.map(x=>miniTile(x,cls)).join('');}
// 副露＋手牌；hideId 用來把胡的那張從手牌拿出來另外擺
function handRow(s:Seat,hideId?:string):string{
  const p=seatPlayer(s);if(!p)return'';
  const concealed=(p.concealed??[]).filter(x=>x.id!==hideId);
  return `${p.melds.map(m=>`<span class="res-meld">${resTiles(m.tiles)}</span>`).join('')}<span class="res-concealed">${resTiles(concealed)}</span>`;
}
function resultOverlay():string{
  const g=snapshot?.game,s=g?.settlement;if(!g||!s)return'';
  const key=JSON.stringify([g.roundLabel,s.winners,s.payments,s.winningTile?.id]);
  // 重畫時用 --elapsed 讓動畫從原本播到的地方接著播；播完（4 秒後）就完全靜止
  if(key!==resultAnimKey){resultAnimKey=key;resultAnimAt=Date.now();resultTab='result';}
  const elapsed=(Date.now()-resultAnimAt)/1000,still=elapsed>4;
  const selfDraw=s.endReason==='self_draw',won=s.winners.length>0;
  const delta=new Map<Seat,number>(seats.map(x=>[x,0]));
  for(const p of s.payments){delta.set(p.to,delta.get(p.to)!+p.amount);delta.set(p.from,delta.get(p.from)!-p.amount);}
  // 搶槓時胡的那張還在被搶者手裡，攤牌時拿掉避免重複
  const hideFor=(x:Seat)=>selfDraw&&s.winners.includes(x)?s.winningTile?.id:s.endReason==='rob_kong'&&x===s.winFrom?s.winningTile?.id:undefined;
  const word=selfDraw?t('cutInSelfDraw'):t('cutInWin');
  const bands=s.winners.map((w,i)=>`<div class="cutin-band" style="--band:${bandColors[w]};--delay:${i*.25}s"><div class="cutin-face">${faceOf(w,'happy')}</div><div class="cutin-copy"><div class="cutin-word">${word}</div><div class="cutin-name">${esc(nameOf(w))} <b class="res-plus">${signed(delta.get(w)!)}</b></div></div></div>`).join('');
  const details=s.details?.length?s.details:s.winners.map(w=>({seat:w,handTai:s.handTai??0,lines:s.lines}));
  const winHands=details.map(d=>`<section class="res-win"><div class="res-win-head"><span class="res-mini-face">${faceOf(d.seat,'happy')}</span><b>${esc(nameOf(d.seat))}</b><span class="res-total">${d.handTai?t('totalTai',{n:d.handTai}):t('zeroTai')}</span></div><div class="res-hand">${handRow(d.seat,hideFor(d.seat))}${selfDraw&&s.winningTile?`<span class="res-winning">${resTiles([s.winningTile],'res-tile win-tile')}<small>${t('selfDraw')}</small></span>`:''}</div>${d.lines.length?`<div class="res-lines">${d.lines.map(x=>`<span>${esc(scoreLabel(x.label))} <b>${t('taiUnit',{n:x.tai})}</b></span>`).join('')}</div>`:''}</section>`).join('');
  const people=seats.filter(x=>!s.winners.includes(x)).map(x=>{
    const d=delta.get(x)!,lost=d<0,dealIn=!selfDraw&&won&&s.winFrom===x&&s.winningTile;
    return `<div class="res-person ${lost?'lost':''}"><div class="res-face">${faceOf(x,lost?'shock':'happy')}</div>${dealIn?`<div class="res-dealin">${resTiles([s.winningTile!],'res-tile win-tile')}<small>${t('dealtIn')}</small></div>`:''}<div class="res-person-copy"><b>${esc(nameOf(x))}</b><span class="${lost?'neg':''}">${signed(d)}</span></div></div>`;
  }).join('');
  // 每一筆付款的算式：底 ＋ 台 × 每台；台數＝牌型台數＋莊家台（胡牌者或付錢的人是莊家時才有）
  const st=snapshot!.settings;
  const handTaiOf=(x:Seat)=>details.find(d=>d.seat===x)?.handTai??0;
  const payLines=s.payments.map(p=>{const hand=handTaiOf(p.to),dealer=p.tai-hand;return `<li><b>${esc(nameOf(p.from))} → ${esc(nameOf(p.to))}</b> ${t('payLine',{tai:p.tai,base:st.base,per:st.perTai,amount:p.amount})}${dealer>0?` <small>${t('payTaiBreak',{hand,dealer})}</small>`:''}</li>`;}).join('');
  const hasDealer=s.payments.some(p=>p.tai>handTaiOf(p.to));
  const wide=window.matchMedia('(min-width:1120px) and (min-height:601px)').matches;
  // 手機上由分頁決定顯示哪一塊，所以 details 一律展開
  const payBox=s.payments.length?`<details class="res-pay" open><summary>${t('paymentsTitle')}</summary><ul>${payLines}</ul>${hasDealer?`<p>${t('dealerNote')}</p>`:''}</details>`:'';
  const allHands=`<details class="res-all" ${wide&&won?'':'open'}><summary>${t('allHands')}</summary>${seats.map(x=>`<div class="res-all-row"><span class="res-mini-face">${faceOf(x,'happy')}</span><b>${esc(nameOf(x))}</b><div class="res-hand">${handRow(x,hideFor(x))}${(seatPlayer(x)?.flowers.length)?`<span class="res-flowers">${resTiles(seatPlayer(x)!.flowers)}</span>`:''}</div></div>`).join('')}</details>`;
  const a=s.audit;
  // 牌數檢查只在出錯時顯示
  const audit=a&&!a.ok?`<p class="res-audit bad">${t('tileCheckBad',{msg:esc(a.problems.join('; '))})}</p>`:'';
  // 倒數：數字由 updatePromptCountdown 每 0.25 秒更新
  const cd=s.nextDeadline?`<b class="next-countdown" data-deadline="${s.nextDeadline}">${Math.max(0,Math.ceil((s.nextDeadline-Date.now())/1000))}</b>`:'';
  const footer=snapshot?.hostClientId===snapshot?.you?.clientId?`<button class="primary wide" data-act="next">${t('nextHand')}${cd?` (${cd})`:''}</button>`:`<p class="res-wait">${cd?t('autoNextIn',{n:cd}):t('waitHostNext')}</p>`;
  const tab=(id:typeof resultTab,label:string)=>`<button class="${resultTab===id?'active':''}" data-rtab="${id}">${label}</button>`;
  const tabs=`<div class="res-tabs">${tab('result',t('tabResult'))}${tab('hands',t('allHands'))}${s.payments.length?tab('pay',t('paymentsTitle')):''}</div>`;
  // 手機：動畫播完橫幅收起，改用卡片頂端一行摘要
  const head=won?s.winners.map(w=>`<span class="res-head-item"><span class="res-mini-face">${faceOf(w,'happy')}</span><b class="res-head-word">${word}</b><span class="res-head-name">${esc(nameOf(w))}</span><b class="res-plus">${signed(delta.get(w)!)}</b></span>`).join(''):`<b class="res-head-word">${t('drawGame')}</b>`;
  return `<div class="win-result ${won?'has-bands':''} ${still?'still':''}" style="--elapsed:${elapsed.toFixed(2)}s" aria-live="assertive">${won?`<div class="res-bands">${bands}</div>`:`<div class="res-draw-title">${t('drawGame')}</div>`}<div class="result-panel tab-${resultTab}" style="--panel-delay:${won?.55+s.winners.length*.25:0}s"><div class="result-kicker">${roundText(g.roundLabel)}</div><div class="res-head">${head}<span class="res-head-round">${roundText(g.roundLabel)}</span></div>${tabs}<div class="res-body"><div class="res-tab res-tab-result"><div class="res-wins">${winHands}</div><div class="res-people">${people}</div></div><div class="res-tab res-tab-hands">${allHands}</div><div class="res-tab res-tab-pay">${payBox}</div></div><div class="res-foot">${audit}${footer}</div></div></div>`;
}
function nameOf(s:Seat):string{const p=seatPlayer(s);return p?playerName(p.name):seatLong(s);}
function soundLabel():string{return soundEnabled?t('soundOn'):t('soundOff');}
function hapticsLabel():string{return hapticsEnabled?t('hapticsOn'):t('hapticsOff');}
function rulesText(sep:string):string{const st=snapshot!.settings;return [t('stakes',{base:st.base,perTai:st.perTai}),st.ronMode==='multiple'?t('ronMulti'):t('ronSingle'),t('reactionSecs',{n:st.reactionSeconds})].join(sep);}
function scoreRows():string{
  const g=snapshot!.game!;
  return seats.map(s=>{const p=seatPlayer(s);return `<div class="side-row"><span class="side-seat"><span class="mini-wind">${seatShort(s)}</span>${esc(p?playerName(p.name):t('empty'))}</span><span class="side-money">${scoreText(g.totals[s])}</span></div>`;}).join('');
}
function infoContent():string{
  const g=snapshot!.game!;
  return `<div class="info-handle"></div><div class="info-head"><div><small>${t('roomLabel')}</small><b>${snapshot!.code}</b></div><button class="icon-btn" data-act="closeinfo" aria-label="${t('close')}">×</button></div><div class="info-actions"><button class="primary" data-act="share">${t('share')}</button><button data-act="line">LINE</button><button data-act="qr">QR Code</button><button data-act="fullscreen">${t('fullscreen')}</button><button data-act="sound">${soundLabel()}</button><button data-act="haptics">${hapticsLabel()}</button><button data-act="rename">${t('rename')}</button><button data-act="lang">${t('langToggle')}</button><a class="rules-btn" href="./rules.html" target="_blank" rel="noopener">${t('rulesLink')}</a><button class="leave-btn" data-act="leave">${t('leave')}</button></div><section class="sheet-section"><h3>${t('scores')}</h3>${scoreRows()}</section><section class="sheet-section info-grid"><div><small>${t('round')}</small><b>${roundText(g.roundLabel)}</b></div><div><small>${t('streak')}</small><b>${g.dealerContinuations}</b></div><div><small>${t('wallLeft')}</small><b>${g.wallCount}</b></div><div><small>${t('deadWall')}</small><b>${g.deadWallCount}</b></div></section><section class="sheet-section"><h3>${t('houseRules')}</h3><div class="side-rule">${rulesText(' · ')}</div></section>`;
}
function sidePanel():string{const g=snapshot!.game!;return `<aside class="side-panel"><div class="side-brand"><b>${t('brand')}</b><span class="online-dot" title="${t('onlineDot')}"></span></div><div class="side-box"><h3>${t('roomLabel')}</h3><div class="room-pill">${snapshot!.code}</div><button data-act="share">${t('shareInvite')}</button><button data-act="line">${t('lineShare')}</button><button data-act="qr">${t('showQr')}</button><button data-act="sound">${soundLabel()}</button><button data-act="haptics">${hapticsLabel()}</button><button data-act="rename">${t('rename')}</button><button data-act="lang">${t('langToggle')}</button><a class="rules-btn" href="./rules.html" target="_blank" rel="noopener">${t('rulesLink')}</a><button class="leave-btn" data-act="leave">${t('leave')}</button></div><div class="side-box"><h3>${t('scores')}</h3>${scoreRows()}</div><div class="side-box"><h3>${t('gameInfo')}</h3><div class="side-row"><span>${t('round')}</span><b>${roundText(g.roundLabel)}</b></div><div class="side-row"><span>${t('streak')}</span><b>${g.dealerContinuations}</b></div><div class="side-row"><span>${t('wallLeft')}</span><b>${g.wallCount}</b></div><div class="side-row"><span>${t('deadWall')}</span><b>${g.deadWallCount}</b></div></div><div class="side-box"><h3>${t('houseRules')}</h3><div class="side-rule">${rulesText('<br>')}</div></div></aside>`;}
function qrModal():string{
  if(!qrOpen||!snapshot?.code)return'';
  const url=inviteUrl();
  const src=`https://quickchart.io/qr?size=260&margin=1&text=${encodeURIComponent(url)}`;
  return `<div class="modal-backdrop"><section class="qr-card"><button class="modal-close" data-act="closeqr">×</button><div class="eyebrow">SCAN TO JOIN</div><h2>${t('qrTitle',{code:snapshot.code})}</h2><img src="${src}" alt="${t('qrAlt',{code:snapshot.code})}"><p>${t('qrFallback',{code:snapshot.code})}</p><button class="primary wide" data-act="share">${t('shareLink')}</button></section></div>`;
}
function game():string{
  const g=snapshot!.game!,me=snapshot!.you!,mySeat=me.seat!,p=seatPlayer(mySeat)!;
  const posMap:Partial<Record<'top'|'left'|'right',Seat>>={};
  for(const s of seats){const pos=relativePos(mySeat,s);if(pos!=='bottom')posMap[pos]=s;}
  const canDiscard=g.phase==='awaiting_discard'&&g.turn===mySeat&&!g.prompt;
  const tenpai=tenpaiInfo(p);
  const drawAnim=g.lastDrawId!==animatedDrawId;animatedDrawId=g.lastDrawId;
  const latest=g.lastDiscard?`<div class="last">${t('latest',{seat:seatLong(g.lastDiscard.seat),tile:tileName(g.lastDiscard.tile)})}</div>`:'';
  return `<div class="online-shell"><header><a href="./">${t('brand')}</a><div class="header-mid"><b>${roundText(g.roundLabel)}</b><span class="desktop-only"> · ${t('roomCodeShort',{code:snapshot!.code})}</span> · ${g.turn===mySeat?`<strong class="your-turn">${t('yourTurn')}</strong>`:t('waitingFor',{name:esc(nameOf(g.turn))})}</div><div class="header-score desktop-only">${seats.map(s=>`${seatShort(s)} ${scoreText(g.totals[s])}`).join('　')}</div><button class="game-menu" data-act="info" aria-label="${t('roomInfo')}">☰</button></header><div class="game-layout"><main class="table-area"><div class="table-wrap"><div class="table">${wallRail('top')}${wallRail('right')}${wallRail('bottom')}${wallRail('left')}${(['top','left','right'] as const).map(pos=>{const s=posMap[pos]!;return opponent(seatPlayer(s),s,pos);}).join('')}<div class="center"><div><div class="round">${roundText(g.roundLabel)}</div><strong>${g.wallCount}</strong><small>${t('wallLeft')}</small><div class="stakes">${snapshot!.settings.base} / ${snapshot!.settings.perTai}</div><div class="continuation">${g.dealerContinuations?t('streakN',{n:g.dealerContinuations}):' '}</div>${latest}</div></div>${seats.map(s=>river(seatPlayer(s),relativePos(mySeat,s))).join('')}<section class="you ${g.turn===mySeat?'active':''}"><div class="hand-actions">${actionBar()}</div>${tenpaiHint(p,canDiscard)}${metaStack(p,mySeat)}<div class="melds">${p.melds.map(meldHtml).join('')}</div><div class="hand">${handInDrawOrder(p.concealed??[],g.lastDrawId).map(t=>tileHtml(t,{selected:selected===t.id,clickable:canDiscard&&(!p.declaredReady||t.id===g.lastDrawId),drawn:g.lastDrawId===t.id,pending:pendingDiscardId===t.id,cls:[canDiscard&&tenpai.byDiscard.has(tileKey(t))?'tenpai-discard':'',g.lastDrawId===t.id&&!drawAnim?'settled':''].join(' ')})).join('')}</div></section></div></div><div class="actionbar"></div></main>${sidePanel()}</div><div class="mobile-sheet ${infoOpen?'open':''}">${infoContent()}</div><div class="sheet-scrim ${infoOpen?'open':''}" data-act="closeinfo"></div><div class="rotate-hint"><div>↻</div><b>${t('rotateTitle')}</b><span>${t('rotateBody')}</span><button data-act="fullscreen">${t('enterFullscreen')}</button></div>${callFlash?`<div class="call-flash ${callFlash.kind}">${callFlash.text}</div>`:''}${resultOverlay()}${qrModal()}${connectionBadge()}</div>`;
}
function render():void{if(!snapshot)app.innerHTML=startScreen();else if(snapshot.status==='wind')app.innerHTML=windScreen();else if(snapshot.status==='lobby')app.innerHTML=lobby();else app.innerHTML=game();bind();updatePromptCountdown();}
async function shareInvite():Promise<void>{
  const data={title:t('shareTitle'),text:t('shareText',{code:snapshot?.code??''}),url:inviteUrl()};
  try{if(navigator.share){await navigator.share(data);return;}}catch{}
  try{await navigator.clipboard.writeText(inviteUrl());alert(t('linkCopied'));}catch{}
}
async function goFullscreen():Promise<void>{
  try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();}catch{}
  try{await (screen.orientation as any)?.lock?.('landscape');}catch{}
}
async function installPwa():Promise<void>{
  if(installPrompt){installPrompt.prompt();try{await installPrompt.userChoice;}catch{}installPrompt=undefined;return;}
  alert(t('installHelp'));
}
function updatePromptCountdown():void{
  document.querySelectorAll<HTMLElement>('.next-countdown').forEach(x=>{x.textContent=String(Math.max(0,Math.ceil((Number(x.dataset.deadline)-Date.now())/1000)));});
  const el=document.querySelector<HTMLElement>('#reaction-countdown,#wind-countdown');if(!el)return;
  const deadline=Number(el.dataset.deadline||0);const left=Math.max(0,Math.ceil((deadline-Date.now())/1000));el.textContent=`${left}s`;
}
function bind():void{
  document.querySelectorAll<HTMLElement>('[data-act]').forEach(el=>el.onclick=()=>{
    const a=el.dataset.act!;
    try{
      if(a==='create'){
        name=(document.querySelector('#name') as HTMLInputElement).value.trim()||name;localStorage.setItem('tw-mj-name',name);autoStart=aiCount===3;if(autoStart)void goFullscreen();send({type:'CREATE_ROOM',name,avatar:avatarChoice,settings:{aiCount}});
      }else if(a==='join'){
        name=(document.querySelector('#name') as HTMLInputElement).value.trim()||name;localStorage.setItem('tw-mj-name',name);send({type:'JOIN_ROOM',code:(document.querySelector('#code') as HTMLInputElement).value.trim().toUpperCase(),name,avatar:avatarChoice});
      }else if(a==='copy')navigator.clipboard?.writeText(snapshot?.code??'');
      else if(a==='copylink')navigator.clipboard?.writeText(inviteUrl());
      else if(a==='share'){playSound('button',soundEnabled);void shareInvite();}
      else if(a==='line'){playSound('button',soundEnabled);lineInvite();}
      else if(a==='sound'){soundEnabled=!soundEnabled;localStorage.setItem('tw-mj-sound',soundEnabled?'1':'0');if(soundEnabled)playSound('button',true);render();}
      else if(a==='haptics'){hapticsEnabled=!hapticsEnabled;localStorage.setItem('tw-mj-haptics',hapticsEnabled?'1':'0');vibrate(25);render();}
      else if(a==='qr'){qrOpen=true;render();}
      else if(a==='closeqr'){qrOpen=false;render();}
      else if(a==='info'){infoOpen=true;render();}
      else if(a==='closeinfo'){infoOpen=false;render();}
      else if(a==='fullscreen')void goFullscreen();
      else if(a==='install')void installPwa();
      else if(a==='rename'){
        const next=prompt(t('renamePrompt'),snapshot?.you?.name??name)?.trim().slice(0,16);
        if(next){name=next;localStorage.setItem('tw-mj-name',name);send({type:'SET_NAME',name});}
      }
      else if(a==='lang'){const input=document.querySelector<HTMLInputElement>('#name');if(input)name=input.value;setLang(lang==='zh'?'en':'zh');render();}
      else if(a==='ready')send({type:'SET_READY',ready:!seatPlayer(snapshot!.you!.seat!)?.ready});
      else if(a==='bots')send({type:'FILL_BOTS'});
      else if(a==='start'){void goFullscreen();send({type:'START_GAME'});}
      else if(a==='pass')send({type:'ACTION',action:'PASS'});
      else if(a==='riichi'){playSound('discard',soundEnabled);vibrate([30,30,60]);flash(t('readyBadge'));send({type:'ACTION',action:'DECLARE_READY',tileId:el.dataset.id!});}
      else if(a==='tsumo')send({type:'ACTION',action:'SELF_DRAW'});
      else if(a==='ck')send({type:'ACTION',action:'CONCEALED_KONG',tileId:el.dataset.id!});
      else if(a==='ak')send({type:'ACTION',action:'ADDED_KONG',tileId:el.dataset.id!});
      else if(a==='next')send({type:'NEXT_HAND'});
      else if(a==='leaveroom'){if(confirm(t('leaveRoomConfirm')))send({type:'LEAVE_ROOM'});}
      else if(a==='leave'){
        const alone=seats.every(s=>{const p=seatPlayer(s);return !p||p.kind==='bot'||s===snapshot?.you?.seat;});
        const msg=alone?t('leaveAlone'):t('leaveOthers');
        if(confirm(msg))send({type:'LEAVE_ROOM'});
      }
    }catch{}
  });
  document.querySelectorAll<HTMLElement>('[data-tile]').forEach(el=>el.onclick=()=>{
    const id=el.dataset.tile!;
    if(pendingDiscardId)return;
    if(selected===id){
      pendingDiscardId=id;playSound('discard',soundEnabled);vibrate(32);render();
      window.setTimeout(()=>{send({type:'ACTION',action:'DISCARD',tileId:id});selected=undefined;pendingDiscardId=undefined;},120);
    }else{selected=id;playSound('button',soundEnabled);vibrate(12);render();}
  });
  // 切分頁只換 class，不重畫整個畫面（避免閃爍、卡片大小不變）
  document.querySelectorAll<HTMLElement>('[data-rtab]').forEach(el=>el.onclick=()=>{
    resultTab=el.dataset.rtab as typeof resultTab;playSound('button',soundEnabled);
    const panel=el.closest('.result-panel');if(!panel){render();return;}
    panel.classList.remove('tab-result','tab-hands','tab-pay');panel.classList.add(`tab-${resultTab}`);
    panel.querySelectorAll<HTMLElement>('[data-rtab]').forEach(b=>b.classList.toggle('active',b===el));
    panel.querySelector('.res-body')?.scrollTo(0,0);
  });
  document.querySelectorAll<HTMLElement>('[data-avatar]').forEach(el=>el.onclick=()=>{
    const input=document.querySelector<HTMLInputElement>('#name');if(input)name=input.value;
    avatarChoice=Number(el.dataset.avatar);localStorage.setItem('tw-mj-avatar',String(avatarChoice));playSound('button',soundEnabled);
    if(snapshot?.status==='lobby')send({type:'SET_AVATAR',avatar:avatarChoice});else render();
  });
  document.querySelectorAll<HTMLElement>('[data-ai]').forEach(el=>el.onclick=()=>{
    const input=document.querySelector<HTMLInputElement>('#name');if(input)name=input.value;
    aiCount=Number(el.dataset.ai);localStorage.setItem('tw-mj-ai-count',String(aiCount));playSound('button',soundEnabled);render();
  });
  document.querySelectorAll<HTMLElement>('[data-wind]').forEach(el=>el.onclick=()=>{playSound('draw',soundEnabled);vibrate(20);send({type:'PICK_WIND',index:Number(el.dataset.wind)});});
  document.querySelectorAll<HTMLElement>('[data-reaction]').forEach(el=>el.onclick=()=>{playSound('button',soundEnabled);vibrate(28);send({type:'ACTION',action:'REACTION',optionIndex:Number(el.dataset.reaction)});});
}

window.addEventListener('beforeinstallprompt',(e:Event)=>{e.preventDefault();installPrompt=e;render();});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
window.addEventListener('online',()=>connect());
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&(!ws||ws.readyState===WebSocket.CLOSED))connect();});
setInterval(updatePromptCountdown,250);
connect();render();
