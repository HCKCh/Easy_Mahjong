import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createPersistence } from './persistence.mjs';
import { fileURLToPath } from 'node:url';
import {
  getReactionOptions,getKongReactionOptions,settleDiscardReactionWindow,claimRobKong,passReaction,
  canSelfDraw,declareSelfDraw,declareConcealedKong,declareAddedKong,isReadyDeclared,seats
} from './dist/core/engine/actions.js';
import { declareReady,discardTile,drawTile } from './dist/core/engine/game.js';
import { createMatch,currentPrevailingWind,settleCurrentHand,startNextHand } from './dist/core/match/match.js';
import { tileKey } from './dist/core/engine/tiles.js';
import { auditTiles } from './dist/core/engine/audit.js';
import { chooseDiscard,chooseReaction } from './dist/web/bot.js';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||80);
const ROOM_TTL_SECONDS=Math.max(300,Number(process.env.ROOM_TTL_SECONDS||86400));
// 閒置超過此秒數的房間（不論是否有人連線）會被自動關閉並刪除；0 = 停用
const ROOM_IDLE_SECONDS=Math.max(0,Number(process.env.ROOM_IDLE_SECONDS??3600));
const PERSISTENCE_DRIVER=process.env.PERSISTENCE_DRIVER||'file';
const DATA_DIR=process.env.DATA_DIR||path.join(ROOT,'data','rooms');
const REDIS_URL=process.env.REDIS_URL||'redis://127.0.0.1:6379/0';
const BOT_DELAY_MS=Math.max(0,Number(process.env.BOT_DELAY_MS??450));
const HUMAN_DELAY_MS=Math.max(0,Number(process.env.HUMAN_DELAY_MS??30));
const AI_LOG=process.env.AI_LOG!=='0';
const STALL_MS=Math.max(1000,Number(process.env.STALL_MS??6000));
const ALLOWED_ORIGINS=(process.env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
const persistence=await createPersistence({driver:PERSISTENCE_DRIVER,dataDir:DATA_DIR,redisUrl:REDIS_URL,ttlSeconds:ROOM_TTL_SECONDS});
const rooms=new Map();
const sockets=new Map();
const seatOrder=['east','south','west','north'];
// 頭像 0～7：同一房間內不可重複（真人與 AI 都算）
const AVATAR_COUNT=8;
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.map':'application/json','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};

function roomCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let c='';do{c=Array.from({length:5},()=>chars[Math.floor(Math.random()*chars.length)]).join('')}while(rooms.has(c));return c;}
function safeName(v){return String(v||'玩家').trim().slice(0,16)||'玩家';}
function roundLabel(match){const w=currentPrevailingWind(match);return `${w==='east'?'東':w==='south'?'南':w==='west'?'西':'北'}${match.handNumber}局`;}
function availableKongs(state,seat){const p=state.players[seat],groups=new Map();for(const t of p.concealed){if(t.kind==='flower')continue;const k=tileKey(t);groups.set(k,[...(groups.get(k)||[]),t]);}return{concealed:[...groups.values()].filter(v=>v.length===4).map(v=>v[0]),added:p.concealed.filter(t=>p.melds.some(m=>m.type==='pong'&&tileKey(m.tiles[0])===tileKey(t)))};}
function ownerFor(room,seat){return room.seats[seat];}
function humanClient(room,seat){const o=ownerFor(room,seat);return o?.kind==='human'?room.clients.get(o.clientId):undefined;}
function isBot(room,seat){return ownerFor(room,seat)?.kind==='bot';}
// 已宣告聽牌的真人：摸到不能胡的牌由伺服器自動打出；能自摸時停下來讓本人決定
function autoPlays(room,seat){const g=room.match?.game;return !!g&&!isBot(room,seat)&&isReadyDeclared(g,seat)&&!canSelfDraw(g,seat);}
function allOccupied(room){return seatOrder.every(s=>room.seats[s]);}
function firstEmptySeat(room){return seatOrder.find(s=>!room.seats[s]);}
function connectedClient(room,id){const w=room.clients.get(id)?.ws;return !!w&&!w.destroyed;}
// 開局條件：每位玩家起始點數、預設底／台
const STARTING_POINTS=1000;
// 結算畫面倒數：時間到自動開下一局（0 = 停用，由房主手動）
const NEXT_HAND_SECONDS=Math.max(0,Number(process.env.NEXT_HAND_SECONDS??10));
const DEFAULT_BASE=50,DEFAULT_PER_TAI=20;
function totalsInit(){return {east:STARTING_POINTS,south:STARTING_POINTS,west:STARTING_POINTS,north:STARTING_POINTS};}
const persistTimers=new Map();
function touchRoom(room){room.lastActivity=Date.now();room.expiresAt=room.lastActivity+ROOM_TTL_SECONDS*1000;}
function serializeRoom(room){
  return {
    schemaVersion:1,code:room.code,hostClientId:room.hostClientId,status:room.status,settings:room.settings,
    clients:[...room.clients.values()].map(c=>({clientId:c.clientId,name:c.name,seat:c.seat,ready:!!c.ready,avatar:c.avatar})),
    seats:room.seats,match:room.match,totals:room.totals,lastRecord:room.lastRecord,notice:room.notice,
    lastActivity:room.lastActivity,expiresAt:room.expiresAt,
    lineup:room.lineup,startPoints:room.startPoints,resultRecorded:!!room.resultRecorded
  };
}
function hydrateRoom(raw){
  const clients=new Map((raw.clients||[]).map(c=>[c.clientId,{...c,ws:undefined}]));
  const room={
    code:raw.code,hostClientId:raw.hostClientId,status:raw.status==='wind'?'lobby':(raw.status||'lobby'),settings:{nextHandSeconds:NEXT_HAND_SECONDS,...(raw.settings||{base:DEFAULT_BASE,perTai:DEFAULT_PER_TAI,ronMode:'single',reactionSeconds:8})},
    clients,seats:raw.seats||{},match:raw.match,totals:raw.totals||totalsInit(),lastRecord:raw.lastRecord,
    settledGame:raw.lastRecord&&raw.match?.game?.phase==='ended'?raw.match.game:undefined,pending:undefined,botTimer:undefined,
    notice:raw.notice||'房間已從持久化資料恢復',lastActivity:raw.lastActivity||Date.now(),expiresAt:raw.expiresAt||Date.now()+ROOM_TTL_SECONDS*1000,
    lineup:raw.lineup,startPoints:raw.startPoints,resultRecorded:!!raw.resultRecorded
  };
  return room;
}
function schedulePersist(room){
  touchRoom(room);
  const old=persistTimers.get(room.code);if(old)clearTimeout(old);
  const timer=setTimeout(async()=>{persistTimers.delete(room.code);try{await persistence.save(serializeRoom(room));}catch(e){console.error('[persistence] save failed',room.code,e?.message||e);}},40);
  timer.unref?.();persistTimers.set(room.code,timer);
}
// 排行榜：開局時記下四家名字（中途離開被 AI 接手也保留原本的名字），整場結束或房間關閉時寫入結果
function beginLineup(room){room.lineup=Object.fromEntries(seatOrder.map(s=>[s,{name:room.seats[s]?.name??s,kind:room.seats[s]?.kind??'bot'}]));room.startPoints=STARTING_POINTS;room.resultRecorded=false;}
function recordResult(room,finished){
  if(room.resultRecorded||!room.match?.completedHands)return;
  room.resultRecorded=true;
  const start=room.startPoints??0;
  const players=seatOrder.map(s=>{const l=room.lineup?.[s]??room.seats[s]??{};return {seat:s,name:l.name??s,kind:l.kind??'bot',points:room.totals[s],delta:room.totals[s]-start};});
  const humans=players.filter(p=>p.kind==='human').length;
  const rec={id:`${room.code}-${Date.now()}`,endedAt:Date.now(),mode:humans<=1?'solo':'friend',code:room.code,base:room.settings.base,perTai:room.settings.perTai,hands:room.match.completedHands,finished,players};
  persistence.pushResult(rec).catch(e=>console.warn('[results] save failed',room.code,e?.message||e));
}
function applyRecord(room,rec){for(const p of rec.payments){room.totals[p.from]-=p.amount;room.totals[p.to]+=p.amount;}room.lastRecord=rec;room.settledGame=room.match.game;}
function settleIfEnded(room){const g=room.match?.game;if(!g||g.phase!=='ended'||room.settledGame===g)return;if(!g.endReason)return;const audit=auditTiles(g);if(!audit.ok)console.error(`[audit] room=${room.code} tile check failed: ${audit.problems.join('; ')}`);const rec=settleCurrentHand(room.match);applyRecord(room,rec);room.status='ended';if(room.match.status==='ended')recordResult(room,true);scheduleAutoNext(room);}
function clearAutoNext(room){if(room.nextTimer)clearTimeout(room.nextTimer);room.nextTimer=undefined;room.nextDeadline=undefined;}
// 結算後倒數，時間到幫大家按「下一局」（同一局還停在結算畫面才會觸發）
function scheduleAutoNext(room){
  clearAutoNext(room);
  const secs=Number(room.settings?.nextHandSeconds??NEXT_HAND_SECONDS);if(!secs)return;
  const g=room.match?.game;room.nextDeadline=Date.now()+secs*1000;
  room.nextTimer=setTimeout(()=>{room.nextTimer=undefined;if(room.status!=='ended'||room.match?.game!==g||!rooms.has(room.code))return;try{nextHand(room);}catch(e){console.error('[auto-next]',room.code,e?.message||e);}},secs*1000);
  room.nextTimer.unref?.();
}
function scoreLines(rec){const score=rec?.score;return score?.items?.map(i=>({label:i.label,tai:i.tai}))||[];}
function publicPlayer(room,seat,viewerSeat){const o=ownerFor(room,seat);if(!o)return undefined;const g=room.match?.game;const ps=g?.players?.[seat];const base={seat,name:o.name,kind:o.kind,avatar:o.avatar,connected:o.kind==='bot'?true:connectedClient(room,o.clientId),ready:o.kind==='bot'?true:(room.clients.get(o.clientId)?.ready??false),concealedCount:ps?.concealed.length??0,declaredReady:!!ps&&isReadyDeclared(g,seat),flowers:ps?.flowers??[],melds:ps?.melds??[],discards:ps?.discards??[]};if(ps&&(viewerSeat===seat||g.phase==='ended'))base.concealed=ps.concealed;return base;}
function promptFor(room,seat){if(!room.match)return undefined;const g=room.match.game;const pending=room.pending;if(!pending||!pending.humans.has(seat))return undefined;const options=g.phase==='awaiting_kong_reactions'?getKongReactionOptions(g,seat):getReactionOptions(g,seat);return{kind:g.phase==='awaiting_kong_reactions'?'kong-reaction':'discard-reaction',options:options.filter(o=>o.type!=='pass'),deadline:pending.deadline};}
function snapshot(room,clientId){const c=room.clients.get(clientId);const viewerSeat=c?.seat;const out={code:room.code,hostClientId:room.hostClientId,you:c?{clientId,name:c.name,seat:c.seat}:undefined,status:room.status,players:{},settings:room.settings,notice:room.notice};for(const s of seatOrder){const p=publicPlayer(room,s,viewerSeat);if(p)out.players[s]=p;}if(room.status==='wind'&&room.windDraw)out.windDraw=windDrawView(room,viewerSeat);if(room.match&&viewerSeat){const g=room.match.game,k=availableKongs(g,viewerSeat);out.game={phase:g.phase,turn:g.turn,dealer:g.dealer,wallCount:g.wall.length,deadWallCount:g.deadWall.length,lastDiscard:g.lastDiscard,lastDrawId:g.lastDraw?.seat===viewerSeat?g.lastDraw.tile.id:undefined,roundLabel:roundLabel(room.match),dealerContinuations:room.match.dealerContinuations,totals:room.totals,prompt:promptFor(room,viewerSeat),canSelfDraw:canSelfDraw(g,viewerSeat),concealedKongs:k.concealed,addedKongs:k.added,settlement:room.lastRecord?{winners:room.lastRecord.winners||[],endReason:room.lastRecord.endReason,lines:scoreLines(room.lastRecord),handTai:room.lastRecord.score?.handTai,payments:room.lastRecord.payments,nextDeadline:room.nextDeadline,winningTile:g.winningTile,winFrom:g.winFrom,details:(room.lastRecord.scores||[]).map(sc=>({seat:sc.winner,handTai:sc.handTai,lines:sc.items.map(i=>({label:i.label,tai:i.tai}))})),audit:auditTiles(g)}:undefined};}return out;}
function broadcast(room){room.lastProgress=Date.now();settleIfEnded(room);schedulePersist(room);for(const [id,c] of room.clients)if(c.ws&&!c.ws.destroyed)send(c.ws,{type:'SNAPSHOT',snapshot:snapshot(room,id)});}
function err(ws,message){send(ws,{type:'ERROR',message});}
function makeRoom(hostId,name,settings={}){const code=roomCode();const room={code,hostClientId:hostId,status:'lobby',lastActivity:Date.now(),expiresAt:Date.now()+ROOM_TTL_SECONDS*1000,settings:{base:Number(settings.base??DEFAULT_BASE),perTai:Number(settings.perTai??DEFAULT_PER_TAI),ronMode:settings.ronMode==='multiple'?'multiple':'single',reactionSeconds:Number(settings.reactionSeconds??8),nextHandSeconds:NEXT_HAND_SECONDS},clients:new Map(),seats:{},match:undefined,totals:totalsInit(),lastRecord:undefined,settledGame:undefined,pending:undefined,botTimer:undefined,notice:'好友房已建立'};rooms.set(code,room);return room;}
function attachClient(room,rec){room.clients.set(rec.clientId,rec);if(rec.seat)room.seats[rec.seat]={kind:'human',clientId:rec.clientId,name:rec.name,avatar:rec.avatar};}
function takenAvatars(room,exceptSeat){return new Set(seatOrder.filter(s=>s!==exceptSeat).map(s=>room.seats[s]?.avatar).filter(a=>a!==undefined));}
function validAvatar(a){return Number.isInteger(a)&&a>=0&&a<AVATAR_COUNT;}
// 想要的頭像沒被選走就給它，否則給第一個空著的
function pickAvatar(room,preferred,exceptSeat){const taken=takenAvatars(room,exceptSeat);if(validAvatar(preferred)&&!taken.has(preferred))return preferred;for(let i=0;i<AVATAR_COUNT;i++)if(!taken.has(i))return i;}
// AI 出牌紀錄：每個 AI 動作寫進 docker logs，並在房間保留最近 300 筆，卡住時一併輸出
function tk(t){return t?tileKey(t):'-';}
function gameBrief(room){const g=room.match?.game;if(!g)return{status:room.status};return{status:room.status,phase:g.phase,turn:g.turn,turnKind:ownerFor(room,g.turn)?.kind,wall:g.wall.length,deadWall:g.deadWall.length,lastDiscard:g.lastDiscard?`${g.lastDiscard.seat}:${tk(g.lastDiscard.tile)}`:undefined,pending:!!room.pending,botTimer:!!room.botTimer,endReason:g.endReason};}
function aiLog(room,seat,action,detail={}){
  const g=room.match?.game;
  const e={t:Date.now(),seat,action,...detail,wall:g?.wall.length,dead:g?.deadWall.length};
  (room.aiLog??=[]).push(e);if(room.aiLog.length>300)room.aiLog.splice(0,room.aiLog.length-300);
  if(AI_LOG)console.log(`[ai] ${room.code} ${seat} ${action} ${JSON.stringify(detail)} wall=${e.wall} dead=${e.dead}`);
}
function dumpRoom(room,label,error){
  console.error(`[${label}] room=${room.code} ${JSON.stringify(gameBrief(room))}${error?`\n${error.stack||error}`:''}`);
  for(const e of (room.aiLog??[]).slice(-20))console.error(`  ${new Date(e.t).toISOString()} ${e.seat} ${e.action} ${JSON.stringify({...e,t:undefined,seat:undefined,action:undefined})}`);
}
function removeBot(room,seat){if(room.seats[seat]?.kind==='bot')delete room.seats[seat];}
// 建房時預先放好 n 個 AI（0～3），其餘空位留給朋友
function addBots(room,n){for(const s of seatOrder){if(n<=0)break;if(!room.seats[s]){room.seats[s]={kind:'bot',name:`AI ${s==='east'?'東':s==='south'?'南':s==='west'?'西':'北'}`,avatar:pickAvatar(room)};n--;}}}
function fillBots(room){for(const s of seatOrder)if(!room.seats[s])room.seats[s]={kind:'bot',name:`AI ${s==='east'?'東':s==='south'?'南':s==='west'?'西':'北'}`,avatar:pickAvatar(room)};}
function startRoom(room){if(room.status!=='lobby')throw new Error('房間已開始');if(!allOccupied(room))throw new Error('需要四個座位；可先用 AI 補滿');for(const c of room.clients.values())if(c.seat&&!c.ready&&c.clientId!==room.hostClientId)throw new Error(`${c.name} 尚未準備`);beginWindDraw(room);}
// 抓風：四張風牌蓋著洗亂，依入場順序（大廳 1～4 號位）輪流翻一張，翻到的風就是座位（東家起莊），四人都翻完後才發牌
const WIND_PICK_SECONDS=15,WIND_REVEAL_MS=2500;
function shuffled(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function clearWindTimers(room){const w=room.windDraw;if(w)clearTimeout(w.timer);}
function windPicker(w){return seatOrder.find(s=>!(s in w.picks));}
function beginWindDraw(room){
  clearWindTimers(room);
  room.match=undefined;room.lastRecord=undefined;room.settledGame=undefined;room.status='wind';room.notice='抓風決定座位';
  room.windDraw={tiles:shuffled(seatOrder),picks:{},deadline:0,timer:undefined};
  scheduleWindTurn(room);
}
// 輪到 AI 時稍等一下自動翻；輪到真人時給 WIND_PICK_SECONDS 秒，逾時由系統代翻
function scheduleWindTurn(room){
  const w=room.windDraw;if(!w||room.status!=='wind')return;
  clearTimeout(w.timer);
  const picker=windPicker(w);if(!picker)return;
  const bot=isBot(room,picker),ms=bot?BOT_DELAY_MS+300:WIND_PICK_SECONDS*1000;
  w.deadline=bot?0:Date.now()+ms;
  w.timer=setTimeout(()=>{if(room.windDraw===w&&windPicker(w)===picker)pickWind(room,picker);},ms);
}
function windDrawView(room,viewerSeat){const w=room.windDraw;const by=new Map(Object.entries(w.picks).map(([s,i])=>[i,s]));const picker=windPicker(w);return{deadline:w.deadline,done:!picker,canPick:!!viewerSeat&&picker===viewerSeat,picker:picker?(ownerFor(room,picker)?.name??picker):undefined,order:seatOrder.map(s=>ownerFor(room,s)?.name??s),tiles:w.tiles.map((wind,i)=>{const s=by.get(i);return s?{wind,by:ownerFor(room,s)?.name??s,mine:s===viewerSeat}:{};})};}
// picker 為大廳座位；index 省略時隨機挑一張還沒被翻的
function pickWind(room,picker,index){
  const w=room.windDraw;if(room.status!=='wind'||!w)throw new Error('目前不是抓風階段');
  if(picker in w.picks)throw new Error('你已經抓過風了');
  if(windPicker(w)!==picker)throw new Error('還沒輪到你抓風');
  const taken=new Set(Object.values(w.picks));
  if(index===undefined)index=shuffled(seatOrder.map((_,i)=>i).filter(i=>!taken.has(i)))[0];
  if(!Number.isInteger(index)||index<0||index>3||taken.has(index))throw new Error('這張已經被抓走了');
  w.picks[picker]=index;
  if(!windPicker(w)){clearTimeout(w.timer);room.notice='抓風完成，準備發牌';w.timer=setTimeout(()=>finishWindDraw(room),WIND_REVEAL_MS);}
  else scheduleWindTurn(room);
  broadcast(room);
}
function finishWindDraw(room){
  const w=room.windDraw;if(!w||room.status!=='wind')return;
  const next={};
  for(const [from,i] of Object.entries(w.picks)){const to=w.tiles[i];const o=room.seats[from];if(!o)continue;next[to]=o.kind==='bot'?{kind:'bot',name:`AI ${to==='east'?'東':to==='south'?'南':to==='west'?'西':'北'}`,avatar:o.avatar}:o;if(o.kind==='human'){const c=room.clients.get(o.clientId);if(c)c.seat=to;}}
  room.seats=next;fillBots(room);room.windDraw=undefined;
  room.match=createMatch({payment:{base:room.settings.base,perTai:room.settings.perTai},roomRules:{ronMode:room.settings.ronMode,missedWinPolicy:'until_next_draw',minTai:1}});room.totals=totalsInit();beginLineup(room);room.lastRecord=undefined;room.settledGame=undefined;room.status='playing';room.notice='牌局開始';
  broadcast(room);advance(room);
}
function clearPending(room){if(room.pending?.timer)clearTimeout(room.pending.timer);room.pending=undefined;}
function beginReactionWindow(room){const g=room.match.game;const excluded=g.phase==='awaiting_kong_reactions'?g.pendingAddedKong?.seat:g.lastDiscard?.seat;if(!excluded)return;const decisions=new Map();const humans=new Set();for(const s of seatOrder.filter(x=>x!==excluded)){if(isBot(room,s)){if(g.phase==='awaiting_kong_reactions'){const win=getKongReactionOptions(g,s).find(o=>o.type==='win');decisions.set(s,win?{seat:s,type:'win',tiles:win.tiles}:{seat:s,type:'pass'});}else{const d=chooseReaction(g,s);if(d.type!=='pass')aiLog(room,s,'react_'+d.type,{on:tk(g.lastDiscard?.tile)});decisions.set(s,d);}}else{const legal=(g.phase==='awaiting_kong_reactions'?getKongReactionOptions(g,s):getReactionOptions(g,s));if(legal.some(o=>o.type!=='pass'))humans.add(s);else decisions.set(s,{seat:s,type:'pass'});}}if(!humans.size){settlePending(room,{kind:g.phase,decisions,humans});return;}const pending={kind:g.phase,decisions,humans,deadline:Date.now()+room.settings.reactionSeconds*1000,timer:undefined};pending.timer=setTimeout(()=>{for(const s of pending.humans)if(!pending.decisions.has(s))pending.decisions.set(s,{seat:s,type:'pass'});pending.humans.clear();settlePending(room,pending);},room.settings.reactionSeconds*1000);room.pending=pending;broadcast(room);}
function settlePending(room,pending){if(room.pending&&room.pending!==pending)return;const g=room.match.game;if(pending.kind==='awaiting_kong_reactions'){
  const declarer=g.pendingAddedKong?.seat;const ordered=seatOrder.filter(s=>s!==declarer);const winner=ordered.map(s=>({s,d:pending.decisions.get(s)})).find(x=>x.d?.type==='win');if(winner){const opt=getKongReactionOptions(g,winner.s).find(o=>o.type==='win');if(opt)claimRobKong(g,opt);}else{for(const s of ordered){if(g.phase!=='awaiting_kong_reactions')break;passReaction(g,s);}}
 }else{settleDiscardReactionWindow(g,seatOrder.filter(s=>s!==g.lastDiscard?.seat).map(s=>pending.decisions.get(s)||{seat:s,type:'pass'}),g.rules);}clearPending(room);broadcast(room);advance(room);}
function humanDecision(room,seat,msg){const p=room.pending;if(!p||!p.humans.has(seat))throw new Error('目前沒有等待你的反應');const g=room.match.game;let d;if(msg.action==='PASS')d={seat,type:'pass'};else{const options=(g.phase==='awaiting_kong_reactions'?getKongReactionOptions(g,seat):getReactionOptions(g,seat)).filter(o=>o.type!=='pass');const o=options[msg.optionIndex];if(!o)throw new Error('無效的反應選項');d={seat,type:o.type,tiles:o.tiles};}p.decisions.set(seat,d);p.humans.delete(seat);if(!p.humans.size)settlePending(room,p);else broadcast(room);}
function botOwnTurn(room,seat){const g=room.match.game;if(canSelfDraw(g,seat)){aiLog(room,seat,'self_draw',{tile:tk(g.lastDraw?.tile)});declareSelfDraw(g,seat);return;}const p=g.players[seat],groups=new Map();for(const t of p.concealed){if(t.kind==='flower')continue;const k=tileKey(t);groups.set(k,[...(groups.get(k)||[]),t]);}const four=[...groups.values()].find(v=>v.length===4);if(four){aiLog(room,seat,'concealed_kong',{tile:tk(four[0])});declareConcealedKong(g,seat,four[0].id);return;}const added=p.concealed.find(t=>p.melds.some(m=>m.type==='pong'&&tileKey(m.tiles[0])===tileKey(t)));if(added){aiLog(room,seat,'added_kong',{tile:tk(added)});declareAddedKong(g,seat,added.id);return;}const t=chooseDiscard(g,seat);aiLog(room,seat,'discard',{tile:tk(t),hand:p.concealed.length});discardTile(g,seat,t.id);}
function advance(room){if(!room.match||room.status==='lobby'||room.pending)return;settleIfEnded(room);if(room.match.game.phase==='ended'){broadcast(room);return;}if(room.botTimer)return;room.botTimer=setTimeout(()=>{room.botTimer=undefined;const g=room.match.game;try{
  if(g.phase==='awaiting_draw'){const s=g.turn;const got=drawTile(g,s);if(isBot(room,s))aiLog(room,s,'draw',{tile:tk(got),replacement:!!g.lastDraw?.replacement});broadcast(room);if(isBot(room,s)||autoPlays(room,s))advance(room);return;}
  if(g.phase==='awaiting_discard'){const s=g.turn;if(isBot(room,s)){botOwnTurn(room,s);broadcast(room);advance(room);}else if(autoPlays(room,s)&&g.lastDraw?.seat===s){discardTile(g,s,g.lastDraw.tile.id);broadcast(room);advance(room);}else broadcast(room);return;}
  if(g.phase==='awaiting_reactions'||g.phase==='awaiting_kong_reactions'){beginReactionWindow(room);return;}
 }catch(e){if(room.match?.game?.phase==='ended')aiLog(room,room.match.game.turn,'hand_ended',{reason:room.match.game.endReason});else dumpRoom(room,'advance-error',e);room.notice=e.message||String(e);broadcast(room);}},isBot(room,room.match.game.turn)||autoPlays(room,room.match.game.turn)?BOT_DELAY_MS:HUMAN_DELAY_MS);}
function nextHand(room){if(!room.match||room.match.game.phase!=='ended')throw new Error('本局尚未結束');clearAutoNext(room);if(room.match.status==='ended'){beginWindDraw(room);broadcast(room);return;}startNextHand(room.match);room.lastRecord=undefined;room.settledGame=undefined;room.status='playing';room.notice='下一局開始';broadcast(room);advance(room);}
function findRoomByClient(id){for(const r of rooms.values())if(r.clients.has(id))return r;}
// 刪除房間：停掉計時器、從記憶體與持久化移除
function destroyRoom(room){
  recordResult(room,false);
  const p=room.pending;if(p?.timer)clearTimeout(p.timer);if(room.botTimer)clearTimeout(room.botTimer);clearWindTimers(room);clearAutoNext(room);
  const t=persistTimers.get(room.code);if(t){clearTimeout(t);persistTimers.delete(room.code);}
  rooms.delete(room.code);
  persistence.remove(room.code).catch(e=>console.warn('[persistence] remove failed',room.code,e?.message||e));
}
// 閒置關閉：通知仍連線的玩家後刪除房間，玩家回到首頁
function closeIdleRoom(room){
  const idleMin=Math.round((Date.now()-room.lastActivity)/60000);
  console.log(`[cleanup] closing idle room ${room.code} (${room.status}, idle ${idleMin} min)`);
  for(const c of room.clients.values()){if(c.ws&&!c.ws.destroyed){send(c.ws,{type:'ERROR',message:`牌局閒置超過 ${Math.round(ROOM_IDLE_SECONDS/60)} 分鐘，已自動關閉`});send(c.ws,{type:'LEFT'});}}
  for(const meta of sockets.values())if(meta.room===room)meta.room=undefined;
  destroyRoom(room);
}
// 離開牌局：開局後座位交給 AI 接手；大廳中則空出座位。沒有任何真人時直接刪除房間。
function leaveRoom(room,clientId){
  const c=room.clients.get(clientId);if(!c)return;
  const seat=c.seat,p=room.pending;
  if(seat&&p?.humans.has(seat)){p.decisions.set(seat,{seat,type:'pass'});p.humans.delete(seat);}
  room.clients.delete(clientId);
  if(seat&&room.seats[seat]?.clientId===clientId){
    if(room.status==='lobby')delete room.seats[seat];
    else room.seats[seat]={kind:'bot',name:`AI ${seat==='east'?'東':seat==='south'?'南':seat==='west'?'西':'北'}`,avatar:room.seats[seat].avatar};
  }
  if(!room.clients.size){destroyRoom(room);return;}
  if(room.hostClientId===clientId){const next=[...room.clients.values()].sort((a,b)=>Number(connectedClient(room,b.clientId))-Number(connectedClient(room,a.clientId)))[0];room.hostClientId=next.clientId;}
  room.notice=`${c.name} 離開牌局${room.status==='lobby'?'':'，由 AI 接手'}`;
  if(p&&!p.humans.size){settlePending(room,p);return;}
  if(room.status==='wind'&&room.windDraw&&windPicker(room.windDraw)===seat)scheduleWindTurn(room);
  broadcast(room);advance(room);
}
function handleMessage(ws,raw){let m;try{m=JSON.parse(raw)}catch{return err(ws,'訊息格式錯誤')}const meta=sockets.get(ws)||{};try{
 if(m.type==='HELLO'){meta.clientId=String(m.clientId||crypto.randomUUID());meta.name=safeName(m.name);sockets.set(ws,meta);send(ws,{type:'WELCOME',clientId:meta.clientId});const old=findRoomByClient(meta.clientId);if(old){const c=old.clients.get(meta.clientId);c.ws=ws;c.name=meta.name;if(c.seat&&old.seats[c.seat]?.kind==='human')old.seats[c.seat].name=meta.name;meta.room=old;broadcast(old);advance(old);}return;}
 if(!meta.clientId)throw new Error('尚未完成 HELLO');
 if(m.type==='CREATE_ROOM'){const old=findRoomByClient(meta.clientId);if(old)throw new Error('你已在房間中');const r=makeRoom(meta.clientId,safeName(m.name),m.settings||{});const rec={clientId:meta.clientId,name:safeName(m.name),seat:'east',ready:true,ws,avatar:pickAvatar(r,Number(m.avatar))};attachClient(r,rec);addBots(r,Number(m.settings?.aiCount)||0);meta.room=r;meta.name=rec.name;broadcast(r);return;}
 if(m.type==='JOIN_ROOM'){const code=String(m.code||'').toUpperCase();const r=rooms.get(code);if(!r)throw new Error('找不到房間');let rec=r.clients.get(meta.clientId);if(rec){rec.ws=ws;rec.name=safeName(m.name);meta.room=r;broadcast(r);return;}if(r.status!=='lobby')throw new Error('牌局已開始；只有原玩家可重連');const seat=firstEmptySeat(r)||seatOrder.find(s=>r.seats[s]?.kind==='bot');if(!seat)throw new Error('房間已滿');removeBot(r,seat);rec={clientId:meta.clientId,name:safeName(m.name),seat,ready:false,ws,avatar:pickAvatar(r,Number(m.avatar))};attachClient(r,rec);meta.room=r;broadcast(r);return;}
 const r=meta.room||findRoomByClient(meta.clientId);if(!r)throw new Error('尚未加入房間');const c=r.clients.get(meta.clientId);if(!c)throw new Error('房間玩家不存在');const seat=c.seat;
 if(m.type==='LEAVE_ROOM'){leaveRoom(r,meta.clientId);meta.room=undefined;send(ws,{type:'LEFT'});return;}
 if(m.type==='SET_NAME'){const name=safeName(m.name),old=c.name;if(name===old)return;c.name=name;meta.name=name;if(seat&&r.seats[seat]?.clientId===c.clientId)r.seats[seat].name=name;if(seat&&r.lineup?.[seat]?.kind==='human'&&r.seats[seat]?.clientId===c.clientId)r.lineup[seat].name=name;r.notice=`${old} 改名為 ${name}`;broadcast(r);return;}
 if(m.type==='SET_AVATAR'){const a=Number(m.avatar);if(!validAvatar(a))throw new Error('無效的頭像');if(!seat)throw new Error('你沒有座位');if(takenAvatars(r,seat).has(a))throw new Error('這個頭像已經有人選了');c.avatar=a;if(r.seats[seat]?.clientId===c.clientId)r.seats[seat].avatar=a;broadcast(r);return;}
 if(m.type==='PICK_WIND'){if(!seat)throw new Error('你沒有座位');pickWind(r,seat,Number(m.index));return;}
 if(m.type==='SET_READY'){if(r.status!=='lobby')throw new Error('已開始遊戲');c.ready=!!m.ready;broadcast(r);return;}
 if(m.type==='FILL_BOTS'){if(meta.clientId!==r.hostClientId)throw new Error('只有房主可以補 AI');fillBots(r);broadcast(r);return;}
 if(m.type==='START_GAME'){if(meta.clientId!==r.hostClientId)throw new Error('只有房主可以開始');startRoom(r);broadcast(r);return;}
 if(m.type==='NEXT_HAND'){if(meta.clientId!==r.hostClientId)throw new Error('只有房主可以開下一局');nextHand(r);return;}
 if(m.type==='ACTION'){if(!seat||!r.match)throw new Error('目前不能操作');const g=r.match.game;if(m.action==='PASS'||m.action==='REACTION'){humanDecision(r,seat,m);return;}if(g.phase!=='awaiting_discard'||g.turn!==seat)throw new Error('現在不是你的出牌階段');if(m.action==='DISCARD')discardTile(g,seat,m.tileId);else if(m.action==='DECLARE_READY')declareReady(g,seat,m.tileId);else if(m.action==='SELF_DRAW')declareSelfDraw(g,seat);else if(m.action==='CONCEALED_KONG')declareConcealedKong(g,seat,m.tileId);else if(m.action==='ADDED_KONG')declareAddedKong(g,seat,m.tileId);else throw new Error('未知動作');broadcast(r);advance(r);return;}
 if(m.type==='PING'){send(ws,{type:'PONG'});return;}
 }catch(e){err(ws,e.message||String(e));const rr=meta.room||(meta.clientId&&findRoomByClient(meta.clientId));if(rr?.match?.game?.phase==='ended'){broadcast(rr);advance(rr);}}}

function wsAccept(req,socket){const key=req.headers['sec-websocket-key'];if(!key){socket.destroy();return;}const accept=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);socket._buf=Buffer.alloc(0);socket.on('data',chunk=>{socket._buf=Buffer.concat([socket._buf,chunk]);parseFrames(socket);});socket.on('close',()=>disconnect(socket));socket.on('error',()=>disconnect(socket));sockets.set(socket,{});}
function parseFrames(socket){let b=socket._buf;while(b.length>=2){const b0=b[0],b1=b[1];const opcode=b0&15;let len=b1&127,off=2;if(len===126){if(b.length<4)break;len=b.readUInt16BE(2);off=4;}else if(len===127){if(b.length<10)break;const n=b.readBigUInt64BE(2);if(n>BigInt(Number.MAX_SAFE_INTEGER))return socket.destroy();len=Number(n);off=10;}const masked=(b1&128)!==0;if(masked){if(b.length<off+4)break;var mask=b.subarray(off,off+4);off+=4;}if(b.length<off+len)break;let payload=b.subarray(off,off+len);if(masked){const out=Buffer.alloc(len);for(let i=0;i<len;i++)out[i]=payload[i]^mask[i%4];payload=out;}b=b.subarray(off+len);if(opcode===8){socket.end();break;}if(opcode===9){sendFrame(socket,payload,10);continue;}if(opcode===1)handleMessage(socket,payload.toString('utf8'));}socket._buf=b;}
function sendFrame(socket,payload,opcode=1){if(socket.destroyed)return;const data=Buffer.isBuffer(payload)?payload:Buffer.from(String(payload));let h;if(data.length<126){h=Buffer.alloc(2);h[1]=data.length;}else if(data.length<65536){h=Buffer.alloc(4);h[1]=126;h.writeUInt16BE(data.length,2);}else{h=Buffer.alloc(10);h[1]=127;h.writeBigUInt64BE(BigInt(data.length),2);}h[0]=0x80|opcode;socket.write(Buffer.concat([h,data]));}
function send(ws,obj){sendFrame(ws,JSON.stringify(obj));}
function disconnect(ws){const m=sockets.get(ws);sockets.delete(ws);if(!m?.clientId)return;const r=findRoomByClient(m.clientId);const c=r?.clients.get(m.clientId);if(c){c.ws=undefined;broadcast(r);}}

for(const raw of await persistence.loadAll()){
  if(!raw?.code)continue;
  try{const r=hydrateRoom(raw);rooms.set(raw.code,r);if(r.status==='ended'&&r.match?.game?.phase==='ended')scheduleAutoNext(r);}catch(e){console.warn('[persistence] restore skipped',raw.code,e?.message||e);}
}
console.log(`[persistence] restored ${rooms.size} room(s)`);

function originAllowed(req){
  if(!ALLOWED_ORIGINS.length)return true;
  const origin=req.headers.origin;
  return !origin||ALLOWED_ORIGINS.includes(origin);
}

const server=http.createServer((req,res)=>{
  let url=new URL(req.url,'http://localhost').pathname;
  if(url==='/healthz'){
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    return res.end(JSON.stringify({ok:true,stage:'3.3.1',rooms:rooms.size,persistence:PERSISTENCE_DRIVER}));
  }
  if(url==='/api/leaderboard'){
    persistence.loadResults().then(list=>{res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({matches:list}));}).catch(e=>{res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:String(e?.message||e)}));});
    return;
  }
  if(url==='/')url='/index.html';
  // 不提供點開頭的檔案或資料夾（.env、.gittoken、.git…）
  if(url.split('/').some(seg=>seg.startsWith('.'))){res.writeHead(404);return res.end('Not found');}
  const f=path.normalize(path.join(ROOT,url));
  if(!f.startsWith(ROOT)){res.writeHead(403);return res.end('Forbidden');}
  fs.stat(f,(e,st)=>{if(e||!st.isFile()){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});fs.createReadStream(f).pipe(res);});
});
server.on('upgrade',(req,socket)=>{
  if(new URL(req.url,'http://localhost').pathname!=='/ws')return socket.destroy();
  if(!originAllowed(req)){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return socket.destroy();}
  wsAccept(req,socket);
});

function cleanupRooms(){
  const now=Date.now();
  for(const room of [...rooms.values()]){
    if(ROOM_IDLE_SECONDS&&now-(room.lastActivity||0)>=ROOM_IDLE_SECONDS*1000){closeIdleRoom(room);continue;}
    const anyConnected=[...room.clients.keys()].some(id=>connectedClient(room,id));
    if(!anyConnected&&room.expiresAt<=now)destroyRoom(room);
  }
}
cleanupRooms();
const cleanup=setInterval(cleanupRooms,60_000);cleanup.unref?.();

// 卡住偵測：牌局進行中、沒有等待真人反應、也沒有排程，但輪到 AI／伺服器動作卻超過 STALL_MS 沒進度 → 記錄並重新推進
const watchdog=setInterval(()=>{
  const now=Date.now();
  for(const room of rooms.values()){
    const g=room.match?.game;
    if(room.status!=='playing'||!g||g.phase==='ended'||room.pending||room.botTimer)continue;
    const serverTurn=g.phase==='awaiting_draw'||g.phase==='awaiting_reactions'||g.phase==='awaiting_kong_reactions'||(g.phase==='awaiting_discard'&&(isBot(room,g.turn)||autoPlays(room,g.turn)));
    if(!serverTurn||now-(room.lastProgress||0)<STALL_MS)continue;
    dumpRoom(room,'stall');room.lastProgress=now;advance(room);
  }
},Math.min(2000,STALL_MS));watchdog.unref?.();

server.listen(PORT,'0.0.0.0',()=>console.log(`東西南北麻將托兒所 (Four Winds Mahjong Nursery) Stage 3.3: http://localhost:${PORT}\nLAN: http://<你的電腦IP>:${PORT}\nPersistence: ${PERSISTENCE_DRIVER}`));
