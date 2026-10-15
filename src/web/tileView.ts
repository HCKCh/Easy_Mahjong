import type { Tile } from '../core/types/mahjong.js';

const windLabel = { east:'東', south:'南', west:'西', north:'北' } as const;
const dragonLabel = { red:'中', green:'發', white:'白' } as const;
const flowerLabel = {plum:'梅',orchid:'蘭',bamboo:'竹',chrysanthemum:'菊',spring:'春',summer:'夏',autumn:'秋',winter:'冬'} as const;
const flowerNumber = {plum:1,orchid:2,bamboo:3,chrysanthemum:4,spring:1,summer:2,autumn:3,winter:4} as const;
const zhNum = ['','一','二','三','四','五','六','七','八','九'];

export function tileLabel(tile:Tile):string {
  if (tile.kind==='suit') return `${tile.rank}${tile.suit==='characters'?'萬':tile.suit==='dots'?'筒':'索'}`;
  if (tile.kind==='wind') return windLabel[tile.wind];
  if (tile.kind==='dragon') return dragonLabel[tile.dragon];
  return flowerLabel[tile.flower];
}
export function tileClass(tile:Tile):string {
  if (tile.kind==='suit') return `suit-${tile.suit}`;
  if (tile.kind==='dragon') return `dragon-${tile.dragon}`;
  if (tile.kind==='flower') return 'flower';
  return 'honor';
}

// 傳統麻將牌配色
const INK='#1a2340', RED='#c62828', GREEN='#17793c', BLUE='#1f4e9c', IVORY='#fffdf5';
type Pt=[number,number,string];

function svg(body:string):string{return `<svg viewBox="0 0 60 80" aria-hidden="true">${body}</svg>`;}
function text(s:string,x:number,y:number,size:number,fill:string):string{return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="middle">${s}</text>`;}

/** 筒子的單顆圓：外圈色、象牙內圈、色心、白點 */
function pip(x:number,y:number,r:number,c:string):string{
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/><circle cx="${x}" cy="${y}" r="${r*.74}" fill="${IVORY}"/><circle cx="${x}" cy="${y}" r="${r*.52}" fill="${c}"/><circle cx="${x}" cy="${y}" r="${r*.2}" fill="${IVORY}"/>`;
}
const dotLayouts:Record<number,{r:number;p:Pt[]}>={
  2:{r:11,p:[[30,23,GREEN],[30,57,BLUE]]},
  3:{r:9.5,p:[[15,17,BLUE],[30,40,RED],[45,63,GREEN]]},
  4:{r:10,p:[[18,23,BLUE],[42,23,GREEN],[18,57,GREEN],[42,57,BLUE]]},
  5:{r:9,p:[[16,17,BLUE],[44,17,GREEN],[30,40,RED],[16,63,GREEN],[44,63,BLUE]]},
  6:{r:8.5,p:[[19,15,GREEN],[41,15,GREEN],[19,44,RED],[41,44,RED],[19,65,RED],[41,65,RED]]},
  7:{r:7.5,p:[[14,11,GREEN],[30,19,GREEN],[46,27,GREEN],[19,47,RED],[41,47,RED],[19,67,RED],[41,67,RED]]},
  8:{r:7.6,p:[13,31,49,67].flatMap(y=>[[19,y,BLUE],[41,y,BLUE]] as Pt[])},
  9:{r:8,p:([[17,BLUE],[40,RED],[63,GREEN]] as const).flatMap(([y,c])=>[[13,y,c],[30,y,c],[47,y,c]] as Pt[])},
};
function dotsFace(rank:number):string{
  if(rank===1){
    const ring=Array.from({length:12},(_,i)=>{const a=i*Math.PI/6;return `<circle cx="${(30+16*Math.cos(a)).toFixed(1)}" cy="${(40+16*Math.sin(a)).toFixed(1)}" r="2.6" fill="${RED}"/>`;}).join('');
    return svg(`<circle cx="30" cy="40" r="24" fill="${GREEN}"/><circle cx="30" cy="40" r="21" fill="${IVORY}"/>${ring}<circle cx="30" cy="40" r="11" fill="${BLUE}"/><circle cx="30" cy="40" r="7.5" fill="${IVORY}"/><circle cx="30" cy="40" r="4.5" fill="${RED}"/>`);
  }
  const l=dotLayouts[rank];
  return svg(l.p.map(([x,y,c])=>pip(x,y,l.r,c)).join(''));
}

/** 索子的竹節：圓角竹身 + 上中下三個竹節 */
function stick(x:number,y:number,h:number,c:string,rot=0,w=7):string{
  const top=y-h/2,dark=c===RED?'#8e1b1b':'#0e5428';
  const nodes=[top+1,y-1,top+h-3].map(ny=>`<rect x="${x-w/2-1}" y="${ny}" width="${w+2}" height="2" rx="1" fill="${dark}"/>`).join('');
  return `<g${rot?` transform="rotate(${rot} ${x} ${y})"`:''}><rect x="${x-w/2}" y="${top}" width="${w}" height="${h}" rx="${w/2}" fill="${c}"/><rect x="${x-.6}" y="${top+3}" width="1.2" height="${h-6}" fill="#ffffff66"/>${nodes}</g>`;
}
type St=[number,number,string,number?];
const EIGHT_TILT=26;
const bambooLayouts:Record<number,{h:number;w?:number;s:St[]}>={
  2:{h:28,s:[[30,23,GREEN],[30,57,GREEN]]},
  3:{h:28,s:[[30,23,GREEN],[19,57,GREEN],[41,57,GREEN]]},
  4:{h:28,s:[[20,23,GREEN],[40,23,GREEN],[20,57,GREEN],[40,57,GREEN]]},
  5:{h:28,s:[[14,23,GREEN],[46,23,GREEN],[30,40,RED],[14,57,GREEN],[46,57,GREEN]]},
  6:{h:28,s:[[15,23,GREEN],[30,23,GREEN],[45,23,GREEN],[15,57,GREEN],[30,57,GREEN],[45,57,GREEN]]},
  7:{h:21,s:[[30,14,RED],[15,40,GREEN],[30,40,GREEN],[45,40,GREEN],[15,65,GREEN],[30,65,GREEN],[45,65,GREEN]]},
  // 八索：外側兩支直立，上排內側成 V（M 字）、下排內側成 Λ（W 字），斜竹尖端相接
  8:{h:28,w:5.5,s:[[8,23,GREEN],[24,23,GREEN,-EIGHT_TILT],[36,23,GREEN,EIGHT_TILT],[52,23,GREEN],[8,57,GREEN],[24,57,GREEN,EIGHT_TILT],[36,57,GREEN,-EIGHT_TILT],[52,57,GREEN]]},
  9:{h:22,s:[14,40,66].flatMap(y=>[[15,y,GREEN],[30,y,RED],[45,y,GREEN]] as St[])},
};
function bambooFace(rank:number):string{
  if(rank===1){
    // 一索：孔雀
    return svg(`<path d="M30 50 L12 74 Q30 66 30 66 Q30 66 48 74 Z" fill="${BLUE}"/><path d="M30 50 L20 74 Q30 70 40 74 Z" fill="${GREEN}"/><circle cx="21" cy="70" r="2.4" fill="${RED}"/><circle cx="39" cy="70" r="2.4" fill="${RED}"/><circle cx="30" cy="71" r="2.4" fill="${RED}"/><ellipse cx="30" cy="44" rx="10" ry="13" fill="${GREEN}"/><path d="M24 40 Q30 54 37 42 Q32 47 24 40 Z" fill="#0e5428"/><path d="M27 33 Q26 24 31 20" stroke="${GREEN}" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="32" cy="19" r="5.5" fill="${GREEN}"/><circle cx="33.5" cy="18" r="1.4" fill="${IVORY}"/><path d="M37 19 L42 21 L37 22 Z" fill="${RED}"/><path d="M31 14 L28 8 M32 14 L32 7 M33 14 L36 8" stroke="${RED}" stroke-width="1.6" stroke-linecap="round"/><path d="M27 56 L25 62 M33 56 L35 62" stroke="${RED}" stroke-width="1.8" stroke-linecap="round"/>`);
  }
  const l=bambooLayouts[rank];
  return svg(l.s.map(([x,y,c,r])=>stick(x,y,l.h,c,r,l.w)).join(''));
}

function flowerFace(tile:Extract<Tile,{kind:'flower'}>):string{
  const season=['spring','summer','autumn','winter'].includes(tile.flower);
  const c=season?RED:BLUE;
  return svg(`<rect x="5" y="5" width="50" height="70" rx="5" fill="none" stroke="${c}" stroke-width="1.2" opacity=".55"/>${text(String(flowerNumber[tile.flower]),13,18,12,c)}<path d="M44 12 q3 -5 6 0 q-3 5 -6 0 Z M44 12 q-5 -3 0 -6 q5 3 0 6 Z" fill="${season?GREEN:RED}"/>${text(flowerLabel[tile.flower],30,58,32,c)}`);
}

/**
 * Presentation-only face markup. Inline SVG (no external images) keeps the PWA
 * small, works offline and scales cleanly from discard-size to hand-size tiles.
 */
export function tileFace(tile:Tile):string {
  if(tile.kind==='suit' && tile.suit==='characters')return svg(`${text(zhNum[tile.rank],30,33,27,INK)}${text('萬',30,71,31,RED)}`);
  if(tile.kind==='suit' && tile.suit==='dots')return dotsFace(tile.rank);
  if(tile.kind==='suit' && tile.suit==='bamboo')return bambooFace(tile.rank);
  if(tile.kind==='wind')return svg(text(windLabel[tile.wind],30,55,42,INK));
  if(tile.kind==='dragon'){
    if(tile.dragon==='white')return svg(`<rect x="9" y="10" width="42" height="60" rx="3" fill="none" stroke="${BLUE}" stroke-width="3.2"/><rect x="14" y="15" width="32" height="50" rx="2" fill="none" stroke="${BLUE}" stroke-width="1.2"/>`);
    return svg(text(dragonLabel[tile.dragon],30,56,44,tile.dragon==='red'?RED:GREEN));
  }
  if(tile.kind==='flower')return flowerFace(tile);
  return svg(text('?',30,52,36,INK));
}
