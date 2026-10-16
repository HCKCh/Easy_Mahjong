import type { Seat, Tile } from '../core/types/mahjong.js';
import { tileLabel } from '../web/tileView.js';

// 介面語言：預設依瀏覽器語言，切換後記在 localStorage（首頁 index.html 也讀同一個 key）
export type Lang='zh'|'en';
const LANG_KEY='tw-mj-lang';
function initialLang():Lang{
  try{const v=localStorage.getItem(LANG_KEY);if(v==='zh'||v==='en')return v;}catch{}
  return navigator.language.toLowerCase().startsWith('zh')?'zh':'en';
}
export let lang:Lang=initialLang();
export function setLang(l:Lang):void{lang=l;try{localStorage.setItem(LANG_KEY,l);}catch{}document.documentElement.lang=l==='zh'?'zh-Hant':'en';}
document.documentElement.lang=lang==='zh'?'zh-Hant':'en';

const dict={
  // 通用
  home:['← 首頁','← Home'],
  installApp:['＋ 加入主畫面','＋ Install app'],
  you:['（你）',' (you)'],
  empty:['空位','Empty'],
  waitingPlayer:['等待玩家','Waiting for player'],
  connected:['已連線','Connected'],
  disconnected:['斷線','Offline'],
  readyMark:[' · ✓準備',' · ✓ Ready'],
  notConnected:['尚未連線','Not connected'],
  connecting:['連線中…','Connecting…'],
  reconnecting:['連線中斷，正在自動重連…','Connection lost, reconnecting…'],
  langToggle:['EN','中文'],
  langToggleLabel:['Switch to English','切換成中文'],
  // 開始畫面
  startTitle:['開一桌','Open a table'],
  startLead:['自己跟 AI 打，或用房號找朋友一起，空位都可以由 AI 補上。','Play against AI or invite friends with a room code. AI fills any empty seat.'],
  nickname:['你的暱稱','Your nickname'],
  aiCount:['AI 人數','AI players'],
  aiHint3:['你 vs AI ×3，建好房間就直接開始','You vs 3 AI. The game starts right away.'],
  aiHint0:['四位真人，分享房號邀請朋友加入','Four humans. Share the room code with friends.'],
  aiHintN:['留 {n} 個空位給朋友，人到齊再開始','{n} seat(s) left for friends. Start when everyone is in.'],
  startBattle:['開始對戰','Start game'],
  createRoom:['建立房間','Create room'],
  orJoin:['或用房號加入','or join with a room code'],
  join:['加入','Join'],
  benefitLandscape:['📱 手機橫向牌桌','📱 Landscape table'],
  benefitReconnect:['🔁 斷線自動重連','🔁 Auto reconnect'],
  benefitServer:['🔒 Server 驗證牌局','🔒 Server-verified game'],
  // 大廳
  roomTitle:['房間','Room'],
  roomSub:['把房號或 QR Code 給身邊朋友，掃一下就能加入。','Share the room code or QR code so friends can join.'],
  shareInvite:['分享邀請','Share invite'],
  showQr:['顯示 QR Code','Show QR code'],
  lineShare:['LINE 分享','Share on LINE'],
  copyCode:['複製房號','Copy code'],
  rename:['改名','Rename'],
  ready:['準備','Ready'],
  unready:['取消準備','Not ready'],
  fillBots:['AI 補滿空位','Fill with AI'],
  startGame:['開始遊戲','Start game'],
  lobbyTip:['開始遊戲後會依入場順序（1～4 號）輪流抓風決定東南西北座位，再發牌。手機遊戲時建議橫向；進牌局後可切全螢幕。','When the game starts, players draw wind tiles in join order (1–4) to decide their seats, then the tiles are dealt. Landscape works best on phones, and you can go fullscreen at the table.'],
  // 抓風
  windEyebrow:['抓風','SEAT DRAW'],
  windTitle:['抓風定座','Draw for seats'],
  windLead:['依入場順序輪流翻牌，翻到「東」的玩家坐東家、起莊。','Players flip a tile in join order. Whoever flips East sits East and deals first.'],
  windPreparing:['準備中…','Preparing…'],
  windDone:['抓風完成，準備發牌…','Seats decided. Dealing…'],
  windYourTurn:['輪到你了！點一張牌翻開，抓到的風就是你的座位','Your turn! Tap a tile to flip it. That wind is your seat.'],
  windWaiting:['等待 {name} 抓風…','Waiting for {name} to draw…'],
  windPickLabel:['抓這張風','Draw this tile'],
  // 牌桌
  tileBack:['牌背','Tile back'],
  flowers:['花：','Flowers: '],
  dealer:['莊','D'],
  readyBadge:['聽','Ready'],
  waits:['聽','Waits'],
  declaredWaits:['已聽牌','Ready'],
  discardToWait:['打{tile}聽','Discard {tile} to wait on'],
  canTenpai:['可聽牌','Tenpai possible'],
  canTenpaiNote:['打出標記的牌；選牌後可宣告聽牌 +1 台','Discard a marked tile. Select one to declare ready (+1 tai).'],
  canReact:['可以反應','Your call'],
  pass:['過','Pass'],
  win:['胡','Win'],
  pong:['碰','Pong'],
  kong:['槓','Kong'],
  chow:['吃','Chow'],
  declareReady:['聽牌 · 打{tile}（+1台）','Declare ready · discard {tile} (+1 tai)'],
  selfDraw:['自摸','Self-draw'],
  concealedKong:['暗槓 {tile}','Concealed kong {tile}'],
  addedKong:['加槓 {tile}','Added kong {tile}'],
  drawGame:['流局','Draw game'],
  handOver:['本局結束','Hand over'],
  taiUnit:['{n} 台','{n} tai'],
  nextHand:['下一局','Next hand'],
  autoNextIn:['{n} 秒後自動開始下一局','Next hand starts in {n}s'],
  waitHostNext:['等待房主開始下一局…','Waiting for the host to start the next hand…'],
  roomLabel:['房間','Room'],
  close:['關閉','Close'],
  share:['分享','Share'],
  fullscreen:['全螢幕','Fullscreen'],
  soundOn:['音效 開','Sound on'],
  soundOff:['音效 關','Sound off'],
  hapticsOn:['震動 開','Haptics on'],
  hapticsOff:['震動 關','Haptics off'],
  leave:['離開牌局','Leave game'],
  scores:['本場分數','Scores'],
  gameInfo:['牌局資訊','Game info'],
  round:['局數','Hand'],
  streak:['連莊','Dealer streak'],
  wallLeft:['剩餘牌','Tiles left'],
  deadWall:['王牌','Dead wall'],
  houseRules:['房規','House rules'],
  stakes:['底 {base} ／ 台 {perTai}','Base {base} / per tai {perTai}'],
  ronMulti:['一炮多響','Multiple winners'],
  ronSingle:['一炮一響','Single winner'],
  reactionSecs:['反應 {n} 秒','{n}s to react'],
  brand:['東西南北麻將托兒所','Four Winds Mahjong Nursery'],
  onlineDot:['連線中','Online'],
  qrTitle:['掃描加入 {code}','Scan to join {code}'],
  qrAlt:['房間 {code} QR Code','Room {code} QR code'],
  qrFallback:['若 QR Code 無法載入，也可以直接分享房號 <b>{code}</b>。','If the QR code does not load, share the room code <b>{code}</b> instead.'],
  shareLink:['分享邀請連結','Share invite link'],
  latest:['最新 · {seat}家 {tile}','Latest · {seat} {tile}'],
  roomCodeShort:['房 {code}','Room {code}'],
  yourTurn:['輪到你','Your turn'],
  waitingFor:['等待 {name}','Waiting for {name}'],
  roomInfo:['房間資訊','Room info'],
  streakN:['連莊 {n}','Streak {n}'],
  rotateTitle:['把手機橫過來玩','Rotate your phone'],
  rotateBody:['台灣麻將 16 張牌，橫向操作會舒服很多。','16-tile hands are much easier to play in landscape.'],
  enterFullscreen:['進入全螢幕','Go fullscreen'],
  shareTitle:['東西南北麻將托兒所','Four Winds Mahjong Nursery'],
  shareText:['來東西南北麻將托兒所跟我打麻將！房號 {code}','Join my table at Four Winds Mahjong Nursery! Room {code}'],
  lineText:['東西南北麻將托兒所開桌啦！一起打麻將，房號 {code}','Four Winds Mahjong Nursery is open! Play mahjong with me, room {code}'],
  linkCopied:['邀請連結已複製','Invite link copied'],
  installHelp:['iPhone/iPad：Safari → 分享 →「加入主畫面」\nAndroid：Chrome 選單 →「安裝應用程式／加入主畫面」','iPhone/iPad: Safari → Share → "Add to Home Screen"\nAndroid: Chrome menu → "Install app / Add to Home screen"'],
  renamePrompt:['輸入新的暱稱（最多 16 字）','Enter a new nickname (up to 16 characters)'],
  leaveAlone:['確定要離開牌局嗎？本場對戰將會結束。','Leave the game? This match will end.'],
  leaveOthers:['確定要離開牌局嗎？你的座位將由 AI 接手，離開後無法再回到這一局。','Leave the game? An AI will take over your seat and you cannot rejoin this match.'],
  defaultName:['玩家{n}','Player{n}'],
  leaveRoom:['離開房間','Leave room'],
  rulesLink:['📖 規則','📖 Rules'],
  leaveRoomConfirm:['確定要離開這個房間嗎？離開後可以重新開房或加入別的房間。','Leave this room? You can then open a new table or join another room.'],
  chooseAvatar:['選擇頭像','Choose an avatar'],
  avatarTaken:['{name} 已選','Taken by {name}'],
  totalTai:['牌型 {n} 台','{n} tai'],
  paymentsTitle:['算式','How it adds up'],
  tabResult:['結果','Result'],
  payLine:['{tai} 台：{base} ＋ {tai} × {per} ＝ {amount}','{tai} tai: {base} + {tai} × {per} = {amount}'],
  payTaiBreak:['（牌型 {hand} 台 ＋ 莊家 {dealer} 台）','(hand {hand} + dealer {dealer})'],
  dealerNote:['莊家台：胡牌的人或付錢的人是莊家時加 1 台，莊家每連莊一次再加 2 台（流局也算連莊）。','Dealer tai: +1 when the winner or the payer is the dealer, plus 2 for each dealer streak (draws extend the streak).'],
  zeroTai:['屁胡（0 台）','No tai (0)'],
  dealtIn:['放槍','Dealt in'],
  allHands:['所有玩家的牌','Everyone\'s tiles'],
  tileCheckOk:['牌數檢查 ✓ 共 {total} 張（數牌 {suits}、字牌 {honors}、花牌 {flowers}），沒有重複或遺失','Tile check ✓ {total} tiles (suits {suits}, honors {honors}, flowers {flowers}), none missing or duplicated'],
  tileCheckBad:['⚠ 牌數檢查異常：{msg}','⚠ Tile check failed: {msg}'],
  cutInWin:['胡！','WIN!'],
  cutInSelfDraw:['自摸！','SELF-DRAW!'],
} satisfies Record<string,[string,string]>;
export type MsgKey=keyof typeof dict;

export function t(key:MsgKey,vars:Record<string,string|number>={}):string{
  const s=dict[key][lang==='zh'?0:1];
  return s.replace(/\{(\w+)\}/g,(_,k)=>String(vars[k]??''));
}

const seatZh:Record<Seat,string>={east:'東',south:'南',west:'西',north:'北'};
const seatEn:Record<Seat,string>={east:'East',south:'South',west:'West',north:'North'};
const seatShortEn:Record<Seat,string>={east:'E',south:'S',west:'W',north:'N'};
/** 座位風：圓形徽章用短字（東／E），文字用完整名稱（東／East） */
export function seatShort(s:Seat):string{return lang==='zh'?seatZh[s]:seatShortEn[s];}
export function seatLong(s:Seat):string{return lang==='zh'?seatZh[s]:seatEn[s];}

const suitEn={characters:'Crak',dots:'Dot',bamboo:'Bam'} as const;
const dragonEn={red:'Red Dragon',green:'Green Dragon',white:'White Dragon'} as const;
const flowerEn={plum:'Plum',orchid:'Orchid',bamboo:'Bamboo',chrysanthemum:'Mum',spring:'Spring',summer:'Summer',autumn:'Autumn',winter:'Winter'} as const;
export function tileName(tile:Tile):string{
  if(lang==='zh')return tileLabel(tile);
  if(tile.kind==='suit')return `${tile.rank} ${suitEn[tile.suit]}`;
  if(tile.kind==='wind')return seatEn[tile.wind];
  if(tile.kind==='dragon')return dragonEn[tile.dragon];
  return flowerEn[tile.flower];
}

// Server 送來的文字（錯誤訊息、局數、台數名稱、AI 名字）是中文或引擎英文，依介面語言轉換
const serverExact:Record<string,[string,string]>={
  '你已在房間中':['你已在房間中','You are already in a room'],
  '你已經抓過風了':['你已經抓過風了','You have already drawn'],
  '你沒有座位':['你沒有座位','You do not have a seat'],
  '只有房主可以補 AI':['只有房主可以補 AI','Only the host can add AI players'],
  '只有房主可以開下一局':['只有房主可以開下一局','Only the host can start the next hand'],
  '只有房主可以開始':['只有房主可以開始','Only the host can start the game'],
  '尚未加入房間':['尚未加入房間','You have not joined a room'],
  '尚未完成 HELLO':['尚未完成連線','Still connecting'],
  '已開始遊戲':['已開始遊戲','The game has already started'],
  '房間已滿':['房間已滿','The room is full'],
  '房間已開始':['房間已開始','The room has already started'],
  '房間玩家不存在':['房間玩家不存在','Player not found in this room'],
  '找不到房間':['找不到房間','Room not found'],
  '未知動作':['未知動作','Unknown action'],
  '本局尚未結束':['本局尚未結束','This hand has not finished'],
  '無效的反應選項':['無效的反應選項','Invalid call'],
  '牌局已開始；只有原玩家可重連':['牌局已開始；只有原玩家可重連','The game has started. Only original players can rejoin.'],
  '現在不是你的出牌階段':['現在不是你的出牌階段','It is not your turn to discard'],
  '目前不是抓風階段':['目前不是抓風階段','Seats are not being drawn now'],
  '目前不能操作':['目前不能操作','You cannot act right now'],
  '目前沒有等待你的反應':['目前沒有等待你的反應','No call is waiting for you'],
  '這張已經被抓走了':['這張已經被抓走了','That tile has already been taken'],
  '還沒輪到你抓風':['還沒輪到你抓風','It is not your turn to draw yet'],
  '需要四個座位；可先用 AI 補滿':['需要四個座位；可先用 AI 補滿','Four players are needed. Fill the empty seats with AI first.'],
  'Not your turn':['還沒輪到你','Not your turn'],
  'Tile not in hand':['手牌裡沒有這張牌','Tile not in hand'],
  'Cannot discard flower':['花牌不能打出','Flowers cannot be discarded'],
  'Hand is not a legal self draw':['這手牌不能自摸','This hand cannot win by self-draw'],
  'Cannot declare ready with this discard':['打這張牌不會聽牌','Discarding this tile does not leave you ready'],
  'Cannot kong after declaring ready':['宣告聽牌後不能槓','You cannot kong after declaring ready'],
  'Declared ready: only the drawn tile can be discarded':['已宣告聽牌，只能打出剛摸的牌','You declared ready: only the drawn tile can be discarded'],
};
const scoreEn:Record<string,string>={
  '門清自摸':'Concealed self-draw','門清':'Concealed hand','自摸':'Self-draw','大三元':'Big three dragons','小三元':'Small three dragons','三元台':'Dragon pung',
  '門風':'Seat wind','圈風':'Round wind','大四喜':'Big four winds','小四喜':'Small four winds','湊一色':'Half flush','清一色':'Full flush','字一色':'All honors',
  '碰碰胡':'All pungs','五暗坎':'Five concealed pungs','四暗坎':'Four concealed pungs','三暗坎':'Three concealed pungs','全求':'All exposed','平糊':'All chows',
  '正花':'Matching flower','聽牌':'Declared ready','槓上開花':'Kong blossom','搶槓':'Robbing a kong','邊張':'Edge wait','中洞':'Closed wait','單吊':'Single wait','海底':'Last tile',
  '配牌花糊':'Dealer-ready flower','地聽':'Earthly ready','七搶一':'Seven robs one','八仙過海':'Eight flowers','人糊':'Human win','地糊':'Earthly win','天糊':'Heavenly win',
};
const windChars:Record<string,Seat>={'東':'east','南':'south','西':'west','北':'north'};
export function serverText(s:string):string{
  const exact=serverExact[s];if(exact)return exact[lang==='zh'?0:1];
  if(lang==='zh')return s;
  let m=s.match(/^(.+) 尚未準備$/);if(m)return `${m[1]} is not ready`;
  m=s.match(/^牌局閒置超過 (\d+) 分鐘，已自動關閉$/);if(m)return `The game was idle for over ${m[1]} minutes and has been closed`;
  return s;
}
/** 「東1局」→ "East 1" */
export function roundText(s:string):string{
  if(lang==='zh')return s;
  const m=s.match(/^([東南西北])(\d+)局$/);return m?`${seatEn[windChars[m[1]]]} ${m[2]}`:s;
}
export function scoreLabel(s:string):string{return lang==='zh'?s:(scoreEn[s]??s);}
/** AI 預設名字「AI 東」→ "AI East"；真人名字原樣 */
export function playerName(s:string):string{
  if(lang==='zh')return s;
  const m=s.match(/^AI ([東南西北])$/);return m?`AI ${seatEn[windChars[m[1]]]}`:s;
}
