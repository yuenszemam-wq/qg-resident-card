/* ================= 每日更表（異世界居民每日出沒啟示錄） =================
   - 圖片 1012 × 1350：用 Canva 匯出的背景及透明拆件（daily/）。
   - 影片 1080 × 1920：換上加長背景（video/daily-bg.jpg），卡片元素按同一套設計座標
     放大 1.091 倍、x −8、y +236（與加長背景逐點對齊），唔會拉伸或移位。
   - 每位居民 = 一組相框（絲帶蝴蝶結＋相框＋名字 Banner＋分類標記），整組一齊移動及縮放；
     相片可以喺框內獨立拖動及縮放。
   - 共用工具（mkCanvas、clamp、prog、easeOut、easeBack、loadImg、saveBlob、NAME_FONTS、
     HAND_FONTS、loadFontCss）來自 index.html。 */
(function(){
'use strict';
const W = 1012, H = 1350, MAX = 6;
const $ = id => document.getElementById(id);
const cv = $('dyCv'), cardCtx = cv.getContext('2d');
let g = cardCtx;
const lim = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- 素材（設計座標 = 1012 × 1350） ----------
const L = {
  bg:{f:'bg.jpg', x:0, y:0},
  title:{f:'title.webp', x:182.4, y:180.6},
  qg:{f:'qg.webp', x:210.5, y:1235.5},
  bow:{f:'bow.webp', x:132.5, y:1068.7},
  keyL:{f:'keyL.webp', x:7.4, y:856.7},
  keyR:{f:'keyR.webp', x:832.5, y:822.6},
  sparkL:{f:'sparkL.webp', x:106.2, y:918.1},
  sparkR:{f:'sparkR.webp', x:866, y:724},
  ribbon:{f:'ribbon.webp'}, banner:{f:'banner.webp'},
  tagLimited:{f:'tagLimited.webp'}, tagShadow:{f:'tagShadow.webp'}, tagTrial:{f:'tagTrial.webp'},
};
const img = {}, blurImg = {};
let assetsReady = false;
// 標題逐字（12 字）、Queen's Garden 逐字的切位（相對素材左邊）
const TITLE_CUTS = [0,52,105,159,212,265,322,372,425,479,535,586,643];
const QG_CUTS = [0,90,145,190,235,282,298,325,410,460,502,540,572,605];

// ---------- 居民相框（相對相片左上角，scale = 1 時的卡片像素） ----------
const FW = 233.7, FH = 231.9;              // 相片範圍
const FR = {radius:9, ringInset:5.5, ringW:2.4, ringR:5,
  shadow:[[8.2,6.4,0.7],[16.5,12.8,0.2]],
  ribbon:{x:-44.0, y:-34.8}, banner:{x:-27.5, y:203.5},
  tag:{cx:-2, cy:5, w:100},                // 分類標記：中心喺相片左上角附近
  name:{cx:FW/2 - 1, cy:FH + 6, size:37, sp:14, maxW:196}};
const CATS = [
  {id:'resident', label:'常駐', tag:null},
  {id:'limited',  label:'限定', tag:'tagLimited'},
  {id:'shadow',   label:'影子', tag:'tagShadow'},
  {id:'trial',    label:'試煉', tag:'tagTrial'},
];
const catOf = id => CATS.find(c => c.id === id) || CATS[0];
// 預設版型（相片中心，取自 Canva 參考圖），k = 預設大小
const LAYOUTS = {
  1:{k:1.35, c:[[506,690]]},
  2:{k:1, c:[[272,655.5],[668.5,827]]},
  3:{k:1, c:[[275,611.5],[691.5,621],[493.5,937.5]]},
  4:{k:1, c:[[327,614.5],[660.5,614.5],[301.5,941.5],[668.5,941]]},
  5:{k:1, c:[[205,644.5],[511.5,645],[818.5,645],[335,987.5],[668.5,987.5]]},
  6:{k:1, c:[[205,644.5],[511.5,645],[818.5,645],[205,987.5],[502.5,987.5],[818,987.5]]},
};
const SCALE_MIN = 0.5, SCALE_MAX = 2;

// ---------- 文字 ----------
const DATE_FONTS = [{id:'leckerli', label:'Leckerli One（預設）', fam:'Leckerli One', w:400}]
  .concat(HAND_FONTS.map(f => ({id:f.id, label:f.label.replace('（預設）',''), fam:f.fam, w:f.w})));
const NAME_LIST = [{id:'chiron', label:'Chiron GoRound TC（預設）', fam:'Chiron GoRound TC', w:900, bold:0, css:'Chiron+GoRound+TC:wght@900'}]
  .concat(NAME_FONTS.filter(f => f.id !== 'chiron').map(f => ({...f, label:f.label.replace('（預設）','')})));
const DATE_FALLBACK = '"Leckerli One","Kalam","Chalkboard SE",cursive';
const NAME_FALLBACK = '"Chiron GoRound TC","PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif';
// 日期（白字黑邊）及開放時間（紫紅字白邊），位置取自 Canva 參考圖
const TXT = {
  date:{cx:497, cy:372, size:50, sp:9, fill:'#ffffff', stroke:'#000000', sw:7, bold:2.2, skew:0.1},
  time:{cx:510, cy:437, size:48, sp:9, fill:'#a25885', stroke:'#ffffff', sw:7, bold:2.4, skew:0.12},
};
const ADJ = [['size','大小',-20,30],['sp','字距',-10,30],['dx','左右',-300,300],['dy','上下',-200,200]];
const ADJ_RANGE = Object.fromEntries(ADJ.map(([f,,a,b]) => [f,[a,b]]));
const blankAdj = () => ({size:0, sp:0, dx:0, dy:0});

// ---------- 狀態 ----------
let uid = 0;
const blankRes = () => ({id:++uid, name:'', cat:'resident', photo:null, photoBlob:null,
  zoom:1, px:0, py:0, pos:null, s:1, adj:blankAdj()});
const state = {
  date:'', start:'18:00', end:'22:00',
  count:2, res:Array.from({length:MAX}, blankRes), // count 之後的資料暫時保留，增加人數時會還原
  sizeMode:'uniform', uniS:null,
  font:{date:'leckerli', name:'chiron'},
  adj:{date:blankAdj(), time:blankAdj()},
};
let playing = false, exporting = false;
const active = () => state.res.slice(0, state.count);

// ---------- 小工具 ----------
function makeBlur(src, f){
  const b = mkCanvas(Math.max(4, Math.round(src.width/f)), Math.max(4, Math.round(src.height/f)));
  const c = b.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(src,0,0,b.width,b.height);
  const u = mkCanvas(Math.max(4, Math.round(src.width/3)), Math.max(4, Math.round(src.height/3)));
  const uc = u.getContext('2d'); uc.imageSmoothingQuality = 'high'; uc.drawImage(b,0,0,u.width,u.height);
  return u;
}
function rr(c, x, y, w, h, r){
  r = Math.min(r, w/2, h/2);
  c.beginPath();
  c.moveTo(x+r, y); c.arcTo(x+w, y, x+w, y+h, r); c.arcTo(x+w, y+h, x, y+h, r);
  c.arcTo(x, y+h, x, y, r); c.arcTo(x, y, x+w, y, r); c.closePath();
}
// 畫一張圖：alpha、blur(0~1)、以中心縮放／旋轉
function drawImg(I, x, y, w, h, alpha=1, o={}){
  if(!I || alpha<=0.003) return;
  const B = o.blurImg;
  g.save();
  g.translate(x + w/2, y + h/2);
  if(o.scale && o.scale!==1) g.scale(o.scale, o.scale);
  if(o.rot) g.rotate(o.rot);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  const bm = o.blur||0;
  if(bm>0.003 && B){ g.globalAlpha = alpha*Math.min(1,bm*2); g.drawImage(B, -w/2, -h/2, w, h); }
  if(bm<1){ g.globalAlpha = alpha*(1-bm); g.drawImage(I, -w/2, -h/2, w, h); }
  g.restore();
}
const layer = (k, a=1, o={}) => { const I = img[k]; if(I) drawImg(I, L[k].x+(o.dx||0), L[k].y+(o.dy||0), I.width, I.height, a, {...o, blurImg:blurImg[k]}); };
// 逐字出現（打字效果）：已出現的字全部畫，最新一個字淡入
function typed(k, cuts, t, start, step, fade=0.06){
  const I = img[k]; if(!I) return;
  const P = L[k];
  for(let i=0;i<cuts.length-1;i++){
    const a = prog(t, start + i*step, fade);
    if(a<=0.003) break;
    const sx = cuts[i], ex = cuts[i+1];
    g.globalAlpha = a;
    g.drawImage(I, sx, 0, ex-sx, I.height, P.x+sx, P.y, ex-sx, I.height);
  }
  g.globalAlpha = 1;
}

// ---------- 相框位置 ----------
function scaleOf(r){ return state.sizeMode==='uniform' ? (state.uniS ?? LAYOUTS[state.count].k) : r.s; }
function centerOf(r, i){
  if(r.pos) return r.pos;
  const c = LAYOUTS[state.count].c[i] || [W/2, H/2];
  return {x:c[0], y:c[1]};
}
function frameRect(r, i){
  const k = scaleOf(r), c = centerOf(r, i);
  return {x:c.x - FW*k/2, y:c.y - FH*k/2, w:FW*k, h:FH*k, k, cx:c.x, cy:c.y};
}
// 整組範圍（用來點選相框）
function groupBounds(r, i){
  const f = frameRect(r, i), k = f.k;
  return {x:f.x + FR.ribbon.x*k, y:f.y + FR.ribbon.y*k, w:(FR.banner.x + img.banner.width - FR.ribbon.x)*k, h:(FR.banner.y + img.banner.height - FR.ribbon.y)*k};
}
function clampCenter(r, i){
  if(!r.pos) return;
  r.pos.x = lim(r.pos.x, 40, W-40); r.pos.y = lim(r.pos.y, 60, H-40);
}

// ---------- 相片 ----------
function photoRect(r, f){
  const p = r.photo; if(!p) return null;
  const s = Math.max(f.w/p.width, f.h/p.height) * r.zoom;
  const w = p.width*s, h = p.height*s;
  return {x:f.x + (f.w-w)/2 + r.px*f.w, y:f.y + (f.h-h)/2 + r.py*f.w, w, h};
}
function clampPhoto(r){
  const p = r.photo; if(!p) return;
  r.zoom = lim(r.zoom, 1, 4);
  const s = Math.max(FW/p.width, FH/p.height) * r.zoom;
  const mx = Math.max(0, (p.width*s - FW)/2)/FW, my = Math.max(0, (p.height*s - FH)/2)/FW;
  r.px = lim(r.px, -mx, mx); r.py = lim(r.py, -my, my);
}

// ---------- 名字 ----------
const nameFontObj = () => NAME_LIST.find(f => f.id===state.font.name) || NAME_LIST[0];
const dateFontObj = () => DATE_FONTS.find(f => f.id===state.font.date) || DATE_FONTS[0];
const nameBounds = [], textBounds = {};
// sp：字距（數字，或按前後兩個字計算的函數）
const isWide = ch => /[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch);
function spacedWidth(chars, sp){
  let w = 0;
  chars.forEach((ch, i) => { w += g.measureText(ch).width; if(i<chars.length-1) w += typeof sp==='function' ? sp(ch, chars[i+1]) : sp; });
  return w;
}
function drawSpaced(text, cx, cy, sp, paint){
  const chars = [...text];
  const total = spacedWidth(chars, sp);
  let x = cx - total/2;
  chars.forEach((ch, i) => {
    const w = g.measureText(ch).width;
    paint(ch, x + w/2, cy, i);
    x += w + (i<chars.length-1 ? (typeof sp==='function' ? sp(ch, chars[i+1]) : sp) : 0);
  });
  return total;
}
function drawName(r, i, f, a, pop){
  nameBounds[i] = null;
  if(!r.name) return;
  const k = f.k, F = nameFontObj();
  let size = (FR.name.size + r.adj.size) * k, sp = (FR.name.sp + r.adj.sp) * k;
  g.save();
  g.font = `${F.w} ${size}px "${F.fam}",${NAME_FALLBACK}`;
  // 中文字之間字距較闊，英文字母之間較窄（同 Canva 原稿一樣）
  const spf = (a, b) => (isWide(a) || isWide(b) ? 1 : 0.4) * sp;
  // 名字太長就縮細，保持喺 Banner 入面
  const raw = spacedWidth([...r.name], spf);
  const maxW = FR.name.maxW*k;
  if(raw > maxW){ const q = maxW/raw; size *= q; sp *= q; g.font = `${F.w} ${size}px "${F.fam}",${NAME_FALLBACK}`; }
  const cx = f.x + FR.name.cx*k + r.adj.dx, cy = f.y + FR.name.cy*k + r.adj.dy;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.translate(cx, cy); g.scale(pop, pop); g.translate(-cx, -cy);
  g.globalAlpha = a;
  const bold = (F.bold||0)*size;
  const total = drawSpaced(r.name, cx, cy, spf, (ch, x, y) => {
    g.strokeStyle = '#000'; g.lineWidth = size*0.24 + bold; g.strokeText(ch, x, y);
    if(bold){ g.strokeStyle = '#f7a8c9'; g.lineWidth = bold; g.strokeText(ch, x, y); }
    g.fillStyle = '#f7a8c9'; g.fillText(ch, x, y);
  });
  g.restore();
  nameBounds[i] = {x:cx-total/2-size*0.15, y:cy-size*0.62, w:total+size*0.3, h:size*1.24};
}

// ---------- 一位居民（整組） ----------
function drawResident(r, i, t, final){
  const f = frameRect(r, i), k = f.k;
  // 時序：相框依序登場 → 相片淡入 → 名字出現
  const st = 0.3 + i*0.11;
  const ga = final ? 1 : easeOut(prog(t, st, 0.25));
  if(ga<=0.003){ nameBounds[i] = null; return; }
  const gp = final ? 1 : easeOut(prog(t, st, 0.4));
  const gs = 0.86 + 0.14*gp, gy = 18*(1-gp);
  g.save();
  g.translate(f.cx, f.cy + gy); g.scale(gs, gs); g.translate(-f.cx, -f.cy);
  g.globalAlpha = ga;
  // 絲帶蝴蝶結（喺相框後面）
  const rb = img.ribbon;
  g.drawImage(rb, f.x + FR.ribbon.x*k, f.y + FR.ribbon.y*k, rb.width*k, rb.height*k);
  // 陰影
  const pa = final ? 1 : easeOut(prog(t, st + 0.12, 0.35));
  for(const [sx, sy, a] of FR.shadow){
    g.globalAlpha = ga*a*pa; g.fillStyle = '#000';
    rr(g, f.x + sx*k, f.y + sy*k, f.w, f.h, FR.radius*k); g.fill();
  }
  g.globalAlpha = ga;
  // 相片（框內）
  g.save();
  rr(g, f.x, f.y, f.w, f.h, FR.radius*k); g.clip();
  const pr = photoRect(r, f);
  if(!pr){ g.fillStyle = '#2a1f38'; g.fillRect(f.x, f.y, f.w, f.h); }
  if(pr){
    g.globalAlpha = ga*pa; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(r.photo, pr.x, pr.y, pr.w, pr.h);
  } else {
    g.fillStyle = '#a996c2'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `600 ${22*k}px -apple-system,"PingFang TC","Noto Sans TC",sans-serif`;
    g.fillText('居民 '+(i+1), f.x+f.w/2, f.y+f.h/2 - 14*k);
    g.font = `500 ${15*k}px -apple-system,"PingFang TC","Noto Sans TC",sans-serif`;
    g.fillText('未選相片', f.x+f.w/2, f.y+f.h/2 + 16*k);
  }
  g.restore();
  // 白色內框
  g.globalAlpha = ga;
  g.strokeStyle = '#fff'; g.lineWidth = FR.ringW*k;
  const ins = FR.ringInset*k;
  rr(g, f.x+ins, f.y+ins, f.w-ins*2, f.h-ins*2, FR.ringR*k); g.stroke();
  // 名字 Banner
  const bn = img.banner;
  g.drawImage(bn, f.x + FR.banner.x*k, f.y + FR.banner.y*k, bn.width*k, bn.height*k);
  g.restore();
  // 名字：相框之後依序彈出
  const np = final ? 1 : prog(t, st + 0.3, 0.3);
  if(np>0) drawName(r, i, {...f, x:f.x, y:f.y + gy}, Math.min(1, np*2), final ? 1 : 0.7 + 0.3*easeBack(np, 1.8));
  else nameBounds[i] = null;
}
// 分類標記：喺所有相框之後畫（唔會被其他相框遮住），開頭由大縮細飛入標記位置
function drawTag(r, i, t, final, order){
  const c = catOf(r.cat); if(!c.tag) return;
  const I = img[c.tag]; if(!I) return;
  const f = frameRect(r, i), k = f.k;
  const w = FR.tag.w*k, h = w*I.height/I.width;
  const tx = f.x + FR.tag.cx*k, ty = f.y + FR.tag.cy*k;
  if(final){ drawImg(I, tx-w/2, ty-h/2, w, h, 1); return; }
  // 對照 Canva 原片：約 0.8 秒以好大、模糊的標記蓋住畫面中間，約 0.3 秒縮細飛到相框左上角
  const st = 0.78 + order*0.08, p = prog(t, st, 0.32);
  if(p<=0) return;
  const e = 1 - Math.pow(1 - Math.pow(p, 1.5), 1.5);
  const sc = 1 + 10*(1-e);
  const x = W/2 + (tx - W/2)*e, y = H*0.45 + (ty - H*0.45)*e;
  drawImg(I, x-w/2, y-h/2, w, h, Math.min(1, p*4), {scale:sc, blur:Math.pow(1-p, 1.4), blurImg:blurImg[c.tag]});
}

// ---------- 日期及時間 ----------
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const pad = n => String(n).padStart(2,'0');
function fromVal(v){ const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v||''); return m ? new Date(+m[1], +m[2]-1, +m[3]) : null; }
const toVal = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
function dateText(){ const d = fromVal(state.date); return d ? `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()} (${DOW[d.getDay()]})` : ''; }
function hm(v){
  const m = /^(\d{1,2}):(\d{2})/.exec(v||''); if(!m) return '';
  const h = +m[1], ap = h>=12 ? 'pm' : 'am', h12 = h%12 || 12;
  return `${h12}:${m[2]} ${ap}`;
}
function timeText(){ const a = hm(state.start), b = hm(state.end); return a && b ? `${a} - ${b}` : (a || b); }
function drawLine(key, text, t, final, start){
  textBounds[key] = null;
  if(!text) return;
  const T = TXT[key], A = state.adj[key], F = dateFontObj();
  const size = T.size + A.size, sp = T.sp + A.sp;
  const cx = T.cx + A.dx, cy = T.cy + A.dy;
  g.save();
  g.font = `${F.w} ${size}px "${F.fam}",${DATE_FALLBACK}`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.miterLimit = 2;
  const sw = T.sw*size/T.size;
  const total = drawSpaced(text, cx, cy, sp, (ch, x, y, i) => {
    if(ch===' ') return;
    let a = 1, dy = 0;
    if(!final){ const p = prog(t, start + i*0.032, 0.08); if(p<=0) return; a = p; dy = 8*(1-easeOut(p)); }
    g.globalAlpha = a;
    // Canva 原稿：稍為斜身、加粗（用字身顏色描邊模擬）
    g.save(); g.translate(x, y+dy); g.transform(1,0,-T.skew,1,0,0);
    const bold = T.bold*size/T.size;
    g.strokeStyle = T.stroke; g.lineWidth = sw + bold; g.strokeText(ch, 0, 0);
    g.strokeStyle = T.fill; g.lineWidth = bold; g.strokeText(ch, 0, 0);
    g.fillStyle = T.fill; g.fillText(ch, 0, 0);
    g.restore();
  });
  g.restore();
  textBounds[key] = {x:cx-total/2, y:cy-size*0.6, w:total, h:size*1.15};
}

// ---------- 星星閃爍、鎖匙旋轉 ----------
const twinkle = (t, ph) => 0.55 + 0.45*Math.cos(2*Math.PI*(t/1.1) + ph);
// 鎖匙：喺背景入面一直轉（約 4.3 秒轉一個圈），最後停返原本角度
const spin = t => { const p = prog(t, 0.35, 4.3); return 2*Math.PI*(p<0.5 ? 2*p*p : 1-Math.pow(-2*p+2,2)/2); };

// ---------- 畫面（t = 秒；final = 完成圖；noBg = 影片用，背景由加長背景取代） ----------
function render(t, final=false, noBg=false){
  g = cardCtx;
  g.setTransform(1,0,0,1,0,0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  if(!assetsReady){ g.fillStyle = '#16101f'; g.fillRect(0,0,W,H); return; }
  if(final) t = 99;
  if(noBg) g.clearRect(0,0,W,H); else g.drawImage(img.bg, 0, 0);
  // 背景裝飾：柔和淡入，鎖匙旋轉，星星閃爍
  const da = final ? 1 : easeOut(prog(t, 0, 0.45));
  const rot = final ? 0 : spin(t);
  layer('keyL', da, {rot});
  layer('keyR', da, {rot:-rot});
  layer('sparkL', da*(final ? 1 : twinkle(t, 0)), {scale: final ? 1 : 0.92 + 0.08*twinkle(t, 0)});
  layer('sparkR', da*(final ? 1 : twinkle(t, 2.1)), {scale: final ? 1 : 0.92 + 0.08*twinkle(t, 2.1)});
  // 標題逐字出現
  if(final) layer('title'); else typed('title', TITLE_CUTS, t, 0.05, 0.062);
  // 日期及開放時間
  drawLine('date', dateText(), t, final, 0.2);
  drawLine('time', timeText(), t, final, 0.26);
  // 大蝴蝶結：模糊淡入
  drawBow(t, final);
  // Queen's Garden 逐字出現
  if(final) layer('qg'); else typed('qg', QG_CUTS, t, 0.93, 0.075);
  // 居民
  const list = active();
  list.forEach((r, i) => drawResident(r, i, t, final));
  let order = 0;
  list.forEach((r, i) => { if(catOf(r.cat).tag) drawTag(r, i, t, final, order++); });
  for(let i=list.length;i<MAX;i++) nameBounds[i] = null;
}
function drawBow(t, final){
  const bp = prog(t, 0.85, 0.32);
  layer('bow', final ? 1 : easeOut(bp), {blur: final ? 0 : Math.pow(1-bp, 1.5), scale: final ? 1 : 0.94 + 0.06*easeOut(bp)});
}
// 影片：蝴蝶結下半部超出卡片（1350），喺卡片以外補畫，令下方完整
function videoOverlay(o, P, t){
  if(!assetsReady || !img.bow) return;
  o.save();
  o.beginPath(); o.rect(0, P.y + P.h, o.canvas.width, o.canvas.height); o.clip();
  o.translate(P.x, P.y); o.scale(P.w/W, P.h/H);
  g = o;
  try{ drawBow(t, false); } finally { g = cardCtx; o.restore(); }
}
const still = () => { if(!playing) render(0, true); };

// ---------- 播放 ----------
const DURATION = 5;
let playToken = 0;
function playOnce(){
  const token = ++playToken;
  return new Promise(res => {
    playing = true;
    const t0 = performance.now();
    (function step(now){
      if(token!==playToken){ res(false); return; }
      const t = (now - t0)/1000;
      render(Math.min(t, DURATION));
      if(t < DURATION) requestAnimationFrame(step); else { playing = false; res(true); }
    })(t0);
  });
}
function stopPreview(){ if(playing && !exporting){ playToken++; playing = false; render(0,true); } }
async function preview(){
  if(exporting || !assetsReady) return;
  await ensureFonts();
  if(await playOnce()) render(0,true);
}

// ---------- 字體 ----------
function ensureFonts(){
  if(!document.fonts || !document.fonts.load) return Promise.resolve();
  const F = dateFontObj(), N = nameFontObj();
  const names = active().map(r=>r.name).join('') || '居民';
  const p = Promise.all([
    document.fonts.load(`${F.w} 50px "${F.fam}"`, '0123456789 JanFebMarAprMayJunJulAugSepOctNovDec()SunMonTueWedThuFriSat:-apm'),
    (N.css ? loadFontCss(N.css) : Promise.resolve()).then(() => document.fonts.load(`${N.w} 34px "${N.fam}"`, names)),
  ]).catch(()=>{});
  return Promise.race([p, new Promise(r => setTimeout(r, 6000))]);
}
const refont = () => ensureFonts().then(still);

// ---------- 相片輸入 ----------
function blobToCanvas(blob){
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob), im = new Image();
    im.onload = () => {
      const sc = Math.min(1, 1600/Math.max(im.width, im.height));
      const c = mkCanvas(Math.max(1,Math.round(im.width*sc)), Math.max(1,Math.round(im.height*sc)));
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c);
    };
    im.onerror = e => { URL.revokeObjectURL(url); rej(e); };
    im.src = url;
  });
}
async function loadPhoto(r, file){
  try{
    r.photo = await blobToCanvas(file); r.photoBlob = null;
    r.zoom = 1; r.px = 0; r.py = 0;
    // Decoding can finish while someone is typing. Preserve the live inputs.
    const i = state.res.indexOf(r);
    const thumb = listBox.querySelector(`.dy-res[data-i="${i}"] .dy-ph`);
    if(thumb){
      thumb.querySelectorAll('canvas, span').forEach(el => el.remove());
      thumb.prepend(photoThumb(r));
    }
    say(''); still(); summary(); ed.sync();
  }catch(err){ say('相片讀取失敗，請換一張再試'); }
}

// ---------- 介面：居民清單 ----------
const say = m => { $('dyStatus').textContent = m||''; };
const listBox = $('dyList');
function hasData(r){ return !!(r.name || r.photo); }
function setCount(n, why){
  n = lim(n, 1, MAX);
  if(n === state.count) return;
  state.count = n;
  // 人數改變：版面按新人數重新排列（相片、名字、分類保留）
  state.res.forEach(r => { r.pos = null; r.s = LAYOUTS[n].k; });
  state.uniS = null;
  if(sel >= n) sel = n-1;
  renderList(); still(); ed.sync();
  say(why || `已按 ${n} 人版面重新排列，居民資料保留`);
}
function removeAt(i){
  const r = state.res[i];
  if(state.count<=1){ say('最少要有 1 位居民'); return; }
  if(hasData(r) && !confirm(`刪除「居民 ${i+1}${r.name ? '｜'+r.name : ''}」？相片及名字會移除。`)) return;
  state.res.splice(i, 1); state.res.push(blankRes());
  const n = state.count - 1;
  setCount(n, `已刪除居民，版面已按 ${n} 人重新排列`);
}
function photoThumb(r){
  const c = mkCanvas(96, 96), x = c.getContext('2d');
  const s = Math.max(96/r.photo.width, 96/r.photo.height);
  x.drawImage(r.photo, (96-r.photo.width*s)/2, (96-r.photo.height*s)/2, r.photo.width*s, r.photo.height*s);
  return c;
}
function renderList(){
  const seg = $('dyCountSeg');
  seg.querySelectorAll('button').forEach(b => { const on = +b.dataset.n === state.count; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  $('dyCountLbl').textContent = `居民（${state.count} 人）`;
  const kept = state.res.slice(state.count).filter(hasData).length;
  $('dyKept').textContent = kept ? `另有 ${kept} 位居民資料暫時保留，增加人數時會還原` : '';
  listBox.replaceChildren(...active().map((r, i) => {
    const row = document.createElement('div'); row.className = 'dy-res'; row.dataset.i = i;
    const thumb = document.createElement('label'); thumb.className = 'dy-ph';
    thumb.setAttribute('aria-label', `居民 ${i+1} 相片`);
    if(r.photo) thumb.append(photoThumb(r));
    else thumb.append(Object.assign(document.createElement('span'), {textContent:'📷'}));
    const file = document.createElement('input'); file.type = 'file'; file.accept = 'image/*'; file.className = 'dy-file';
    file.onchange = () => { const f = file.files && file.files[0]; file.value = ''; if(f) loadPhoto(r, f); };
    thumb.append(file);
    const mid = document.createElement('div'); mid.className = 'dy-mid';
    const head = document.createElement('div'); head.className = 'dy-head';
    const no = document.createElement('span'); no.className = 'dy-no'; no.textContent = '居民 '+(i+1);
    const cat = document.createElement('select'); cat.className = 'dy-cat'; cat.setAttribute('aria-label', `居民 ${i+1} 分類`);
    for(const c of CATS){ const o = document.createElement('option'); o.value = c.id; o.textContent = c.label; cat.append(o); }
    cat.value = r.cat;
    cat.onchange = () => { r.cat = cat.value; still(); };
    const adj = document.createElement('button'); adj.type = 'button'; adj.className = 'small dy-adj'; adj.textContent = '調整';
    adj.onclick = () => { sel = i; ed.open('frame'); };
    const del = document.createElement('button'); del.type = 'button'; del.className = 'dy-del'; del.textContent = '×';
    del.setAttribute('aria-label', `刪除居民 ${i+1}`); del.disabled = state.count<=1;
    del.onclick = () => removeAt(i);
    head.append(no, cat, adj, del);
    const name = document.createElement('input'); name.type = 'text'; name.placeholder = '居民名字'; name.value = r.name;
    name.autocomplete = 'off'; name.setAttribute('aria-label', `居民 ${i+1} 名字`);
    name.oninput = () => { r.name = name.value.trim(); still(); ensureFonts().then(still); };
    mid.append(head, name);
    row.append(thumb, mid);
    return row;
  }));
  $('dyAdd').disabled = state.count >= MAX;
  $('dyAdd').textContent = state.count >= MAX ? '已達 6 位居民上限' : '＋ 增加居民';
  summary();
}
$('dyCountSeg').addEventListener('click', e => {
  const b = e.target.closest('[data-n]'); if(!b || exporting) return;
  const n = +b.dataset.n;
  setCount(n, n < state.count ? `已改為 ${n} 人；第 ${n+1} 位之後的資料暫時保留` : null);
});
$('dyAdd').addEventListener('click', () => { if(state.count < MAX && !exporting){ setCount(state.count+1, `已增加居民，版面已按 ${state.count+1} 人重新排列`); const el = listBox.lastElementChild?.querySelector('input[type=text]'); el?.focus({preventScroll:false}); } });

// ---------- 日期及時間輸入 ----------
function updateDate(){
  state.date = $('dyDate').value;
  state.start = $('dyStart').value; state.end = $('dyEnd').value;
  const d = dateText(), tm = timeText();
  $('dyOut').textContent = d ? '會顯示為：' + d + (tm ? '｜' + tm : '') : '請選擇日期';
  still(); markCurrent();
}
['dyDate','dyStart','dyEnd'].forEach(id => ['input','change'].forEach(ev => $(id).addEventListener(ev, updateDate)));
function today(){ const d = new Date(); d.setHours(0,0,0,0); return d; }

// ---------- 摘要 ----------
function summary(){
  const s = $('dySum'); if(!s) return;
  const list = active(), ph = list.filter(r=>r.photo).length, nm = list.filter(r=>r.name).length;
  const moved = list.some(r=>r.pos) || state.uniS!==null || state.sizeMode!=='uniform';
  s.textContent = `相片 ${ph}/${list.length}｜名字 ${nm}/${list.length}｜${moved ? '版面：已調整' : '版面：預設'}`;
  s.classList.toggle('on', ph>0 || nm>0);
}

// ================= 預覽及調整（全螢幕編輯器） =================
let sel = 0; // 選中的居民
const ed = (function(){
  const h = (tag, attrs={}, ...kids) => {
    const el = document.createElement(tag);
    for(const [k,v] of Object.entries(attrs)){
      if(k==='class') el.className = v; else if(k==='text') el.textContent = v; else if(k==='hidden') el.hidden = v; else el.setAttribute(k, v);
    }
    el.append(...kids.filter(Boolean)); return el;
  };
  let mode = 'frame', tsel = 'date', opened = false, raf = 0, dirty = false;
  const play = h('button', {class:'small', type:'button', id:'dyEdPlay', text:'▶ 播放'});
  const done = h('button', {class:'ed-done', type:'button', id:'dyEdDone', text:'完成'});
  const exit = h('button', {class:'ed-done', type:'button', id:'dyEdExit', text:'✕ 退出'});
  const title = h('h2', {id:'dyEdTitle', text:'預覽及調整'});
  const pv = h('canvas', {id:'dyEdPv', 'aria-label':'即時預覽'});
  const view = h('div', {class:'ed-view'}, pv);
  const chips = h('div', {class:'dy-chips', role:'tablist', 'aria-label':'揀居民'});
  const segM = h('div', {class:'seg', role:'tablist'},
    h('button', {type:'button', 'data-m':'frame', text:'相框'}),
    h('button', {type:'button', 'data-m':'photo', text:'相片'}),
    h('button', {type:'button', 'data-m':'text', text:'文字'}));
  // 相框
  const tipF = h('div', {class:'ed-tip'});
  const segS = h('div', {class:'seg two dy-size', role:'tablist'},
    h('button', {type:'button', 'data-s':'uniform', text:'統一大小'}),
    h('button', {type:'button', 'data-s':'individual', text:'獨立大小'}));
  const fRange = h('input', {type:'range', min:String(SCALE_MIN), max:String(SCALE_MAX), step:'0.01', value:'1', 'aria-label':'相框大小'});
  const fOut = h('output', {text:'100%'});
  const resetFrame = h('button', {class:'small', type:'button', text:'重設此相框'});
  const resetLayout = h('button', {class:'small', type:'button', text:'全部重設版面'});
  const paneF = h('div', {'data-pane':'frame'}, tipF, segS,
    h('div', {class:'ed-row'}, h('span', {text:'大小'}),
      h('button', {class:'step', type:'button', 'data-fz':'-1', 'aria-label':'相框縮細', text:'−'}), fRange,
      h('button', {class:'step', type:'button', 'data-fz':'1', 'aria-label':'相框放大', text:'+'}), fOut),
    h('div', {class:'ed-foot'}, resetFrame, resetLayout));
  // 相片
  const tipP = h('div', {class:'ed-tip'});
  const zRange = h('input', {type:'range', min:'1', max:'4', step:'0.01', value:'1', 'aria-label':'相片縮放'});
  const zOut = h('output', {text:'100%'});
  const fileIn = h('input', {type:'file', accept:'image/*', hidden:true});
  const resetPos = h('button', {class:'small', type:'button', id:'dyEdResetPos', text:'重設相片位置'});
  const paneP = h('div', {'data-pane':'photo', hidden:true}, tipP,
    h('div', {class:'ed-row'}, h('span', {text:'縮放'}),
      h('button', {class:'step', type:'button', 'data-z':'-1', 'aria-label':'相片縮細', text:'−'}), zRange,
      h('button', {class:'step', type:'button', 'data-z':'1', 'aria-label':'相片放大', text:'+'}), zOut),
    h('div', {class:'ed-foot'}, h('label', {class:'small ed-file', text:'📷 換相片'}, fileIn), resetPos));
  // 文字
  const tipT = h('div', {class:'ed-tip'});
  const segT = h('div', {class:'seg', role:'tablist'},
    h('button', {type:'button', 'data-k':'date', text:'日期'}),
    h('button', {type:'button', 'data-k':'time', text:'時間'}),
    h('button', {type:'button', 'data-k':'name', text:'名字'}));
  const fontName = h('span', {class:'t'});
  const font = h('button', {type:'button', class:'ed-fontbtn', id:'dyEdFont', 'aria-haspopup':'dialog', 'aria-label':'字體'}, fontName, h('span', {class:'go', text:'⌄'}));
  const sheetList = h('div', {class:'qg-fs-list', role:'listbox', 'aria-label':'字體'});
  const sheetDone = h('button', {type:'button', class:'ed-done', id:'dyEdFontDone', text:'完成'});
  const sheetHint = h('span', {class:'qg-fs-hint'});
  const sheet = h('div', {class:'qg-fs', id:'dyEdFontSheet', hidden:true, role:'dialog', 'aria-modal':'true', 'aria-label':'揀字體'},
    h('div', {class:'qg-fs-panel'}, h('div', {class:'qg-fs-head'}, h('strong', {text:'揀字體'}), sheetHint, sheetDone), sheetList));
  const rows = h('div', {class:'ed-rows'}), ranges = {}, outs = {};
  for(const [f, l, mn, mx] of ADJ){
    ranges[f] = h('input', {type:'range', min:String(mn), max:String(mx), step:'1', value:'0', 'data-f':f, 'aria-label':l});
    outs[f] = h('output', {text:'0'});
    rows.append(h('div', {class:'ed-row'}, h('span', {text:l}),
      h('button', {class:'step', type:'button', 'data-f':f, 'data-d':'-1', 'aria-label':l+'減少', text:'−'}), ranges[f],
      h('button', {class:'step', type:'button', 'data-f':f, 'data-d':'1', 'aria-label':l+'增加', text:'+'}), outs[f]));
  }
  const resetOne = h('button', {class:'small', type:'button'});
  const resetAll = h('button', {class:'small', type:'button', text:'全部重設'});
  const paneT = h('div', {'data-pane':'text', hidden:true}, tipT, segT,
    h('div', {class:'ed-font'}, h('span', {text:'字體'}), font), rows, h('div', {class:'ed-foot'}, resetOne, resetAll));
  const el = h('div', {class:'editor qg-ed dy-ed', id:'dyEd', hidden:true, role:'dialog', 'aria-modal':'true', 'aria-labelledby':'dyEdTitle'},
    h('div', {class:'ed-head'}, title, play, done, exit), view,
    h('div', {class:'ed-ctrl'}, h('div', {}, chips, segM, paneF, paneP, paneT)), sheet);
  $('tab-daily').append(el);

  const R = () => state.res[sel];
  // 文字微調對象：日期／時間／選中居民的名字
  const adjOf = () => tsel==='name' ? R().adj : state.adj[tsel];
  const textLabel = () => tsel==='date' ? '日期' : tsel==='time' ? '時間' : `居民 ${sel+1} 名字`;
  const fontsOf = () => tsel==='name' ? NAME_LIST : DATE_FONTS;
  const fontKey = () => tsel==='name' ? 'name' : 'date';

  function syncChips(){
    chips.replaceChildren(...active().map((r, i) => h('button', {type:'button', role:'tab', 'data-r':String(i),
      class:'dy-chip'+(i===sel ? ' on' : ''), 'aria-selected':String(i===sel), text:`${i+1}${r.name ? ' '+r.name : ''}`})));
  }
  function syncFrame(){
    const r = R(), uni = state.sizeMode==='uniform';
    segS.querySelectorAll('button').forEach(b => { const on = b.dataset.s===state.sizeMode; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    const k = scaleOf(r);
    fRange.value = k; fOut.textContent = Math.round(k*100)+'%';
    tipF.textContent = uni ? '拖動移動相框，兩指或滑桿調整全部相框大小' : `拖動移動相框，兩指或滑桿只調整居民 ${sel+1}`;
  }
  function syncPhoto(){
    const r = R();
    tipP.textContent = r.photo ? `居民 ${sel+1}：拖動相片，兩指縮放` : `居民 ${sel+1} 未有相片，按「換相片」揀一張`;
    zRange.value = r.zoom; zOut.textContent = Math.round(r.zoom*100)+'%'; zRange.disabled = !r.photo;
  }
  function styleFont(node, f, px){
    node.style.fontFamily = `"${f.fam}",${tsel==='name' ? NAME_FALLBACK : DATE_FALLBACK}`;
    node.style.fontWeight = f.w || 400;
    node.style.webkitTextStroke = f.bold ? (f.bold*px).toFixed(2)+'px currentColor' : '';
  }
  function sample(){ return tsel==='date' ? (dateText() || '19 Nov 2026 (Thu)') : tsel==='time' ? (timeText() || '6:00 pm - 10:00 pm') : (R().name || '居民名字'); }
  function syncText(){
    segT.querySelectorAll('button').forEach(b => { const on = b.dataset.k===tsel; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    const A = adjOf();
    for(const [f] of ADJ){ ranges[f].value = A[f]; outs[f].textContent = A[f]; }
    const list = fontsOf(), cur = list.find(f => f.id===state.font[fontKey()]) || list[0];
    fontName.textContent = cur.label; styleFont(fontName, cur, 17);
    resetOne.textContent = '重設' + textLabel();
    const has = tsel==='name' ? !!R().name : tsel==='date' ? !!dateText() : !!timeText();
    tipT.textContent = has ? `${textLabel()}：可以直接在卡上拖動；字體只套用今次製作` : `未輸入${textLabel()}，先喺下面填寫`;
    if(!sheet.hidden) fillSheet();
  }
  function fillSheet(load){
    const list = fontsOf(), cur = state.font[fontKey()], s = sample();
    sheetHint.textContent = tsel==='name' ? '套用到全部名字' : '套用到日期及時間';
    sheetList.replaceChildren(...list.map(f => {
      const on = f.id===cur, sp = h('span', {class:'s', text:s}); styleFont(sp, f, 26);
      return h('button', {type:'button', role:'option', 'aria-selected':String(on), class:'qg-fs-item'+(on?' on':''), 'data-id':f.id},
        h('span', {class:'n', text:(on ? '✓ ' : '') + f.label}), sp);
    }));
    if(load) for(const f of list) (f.css ? loadFontCss(f.css) : Promise.resolve()).then(() => document.fonts?.load(`${f.w||400} 26px "${f.fam}"`, s)).catch(()=>{});
  }
  function syncMode(){
    segM.querySelectorAll('button').forEach(b => { const on = b.dataset.m===mode; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    paneF.hidden = mode!=='frame'; paneP.hidden = mode!=='photo'; paneT.hidden = mode!=='text';
  }
  function sync(){
    if(sel >= state.count) sel = state.count-1;
    syncChips(); syncFrame(); syncPhoto(); syncText(); syncMode(); summary();
  }
  function touch(){ dirty = true; if(!opened) flush(); }
  function flush(){ dirty = false; still(); }

  // 預覽
  const pctx = pv.getContext('2d');
  function size(){
    if(!opened) return;
    const aw = view.clientWidth - 12, ah = view.clientHeight - 12;
    if(aw<=0 || ah<=0) return;
    const cw = Math.min(aw, ah*W/H), ch = cw*H/W, dpr = Math.min(window.devicePixelRatio||1, 3);
    pv.style.width = cw+'px'; pv.style.height = ch+'px';
    pv.width = Math.round(cw*dpr); pv.height = Math.round(ch*dpr);
  }
  if(window.ResizeObserver) new ResizeObserver(() => size()).observe(view);
  window.addEventListener('resize', size); window.visualViewport?.addEventListener('resize', size);
  function outline(b, s, u, color){
    const p = 8;
    pctx.save(); pctx.setTransform(s,0,0,s,0,0);
    pctx.lineWidth = 2*u; pctx.setLineDash([7*u, 5*u]);
    pctx.strokeStyle = 'rgba(0,0,0,.6)'; pctx.strokeRect(b.x-p, b.y-p, b.w+p*2, b.h+p*2);
    pctx.lineDashOffset = 6*u; pctx.strokeStyle = color; pctx.strokeRect(b.x-p, b.y-p, b.w+p*2, b.h+p*2);
    pctx.restore();
  }
  function paint(){
    if(!opened) return;
    if(dirty) flush();
    if(pv.width){
      pctx.setTransform(1,0,0,1,0,0); pctx.imageSmoothingEnabled = true; pctx.imageSmoothingQuality = 'high';
      pctx.drawImage(cv, 0, 0, pv.width, pv.height);
      if(!playing && assetsReady){
        const s = pv.width/W, u = Math.min(window.devicePixelRatio||1, 3)/s;
        let b = null;
        if(mode==='text') b = tsel==='name' ? nameBounds[sel] : textBounds[tsel];
        else { const f = frameRect(R(), sel); b = mode==='photo' ? f : groupBounds(R(), sel); }
        if(b) outline(b, s, u, '#f2d48a');
      }
    }
    raf = requestAnimationFrame(paint);
  }
  function open(m){
    if(exporting) return;
    mode = m || mode || 'frame';
    if(mode==='text' && tsel==='name' && !R().name) tsel = 'date';
    opened = true; el.hidden = false; document.body.style.overflow = 'hidden';
    sync();
    requestAnimationFrame(() => { size(); cancelAnimationFrame(raf); paint(); });
  }
  function close(){
    if(!opened) return;
    sheet.hidden = true; opened = false; el.hidden = true;
    cancelAnimationFrame(raf); document.body.style.overflow = '';
    if(dirty) flush(); still(); summary();
  }

  // 事件
  play.onclick = () => preview();
  done.onclick = close; exit.onclick = close;
  chips.onclick = e => { const b = e.target.closest('[data-r]'); if(b){ sel = +b.dataset.r; sync(); } };
  segM.onclick = e => { const b = e.target.closest('[data-m]'); if(b){ mode = b.dataset.m; if(mode==='text' && tsel==='name' && !R().name) tsel='date'; syncMode(); syncText(); } };
  segS.onclick = e => {
    const b = e.target.closest('[data-s]'); if(!b || b.dataset.s===state.sizeMode) return;
    if(b.dataset.s==='individual'){ const k = state.uniS ?? LAYOUTS[state.count].k; state.res.forEach(r => r.s = k); }
    else state.uniS = R().s;
    state.sizeMode = b.dataset.s; syncFrame(); touch();
  };
  function setScale(k){
    k = lim(k, SCALE_MIN, SCALE_MAX);
    if(state.sizeMode==='uniform') state.uniS = k; else R().s = k;
    fRange.value = k; fOut.textContent = Math.round(k*100)+'%';
  }
  fRange.oninput = () => { setScale(+fRange.value); touch(); };
  resetFrame.onclick = () => {
    const r = R(); r.pos = null;
    if(state.sizeMode==='individual') r.s = LAYOUTS[state.count].k;
    syncFrame(); touch();
  };
  resetLayout.onclick = () => {
    state.res.forEach(r => { r.pos = null; r.s = LAYOUTS[state.count].k; }); state.uniS = null; state.sizeMode = 'uniform';
    syncFrame(); touch();
  };
  zRange.oninput = () => { const r = R(); if(!r.photo) return; r.zoom = +zRange.value; clampPhoto(r); zOut.textContent = Math.round(r.zoom*100)+'%'; touch(); };
  fileIn.onchange = () => { const f = fileIn.files && fileIn.files[0]; fileIn.value = ''; if(f) loadPhoto(R(), f); };
  resetPos.onclick = () => { const r = R(); r.zoom = 1; r.px = 0; r.py = 0; syncPhoto(); touch(); };
  segT.onclick = e => { const b = e.target.closest('[data-k]'); if(b){ tsel = b.dataset.k; syncText(); } };
  function setAdj(f, v){ adjOf()[f] = lim(Math.round(v), ...ADJ_RANGE[f]); }
  rows.addEventListener('input', e => { const f = e.target.dataset.f; if(!f) return; setAdj(f, +e.target.value); outs[f].textContent = adjOf()[f]; touch(); });
  font.onclick = () => { fillSheet(true); sheet.hidden = false; sheetList.querySelector('.on')?.scrollIntoView({block:'center'}); };
  sheetDone.onclick = () => { sheet.hidden = true; };
  sheet.onclick = e => { if(e.target===sheet) sheet.hidden = true; };
  sheetList.onclick = e => { const b = e.target.closest('[data-id]'); if(!b) return; state.font[fontKey()] = b.dataset.id; syncText(); refont(); touch(); };
  resetOne.onclick = () => { Object.assign(adjOf(), blankAdj()); syncText(); touch(); };
  resetAll.onclick = () => {
    state.adj.date = blankAdj(); state.adj.time = blankAdj();
    state.res.forEach(r => r.adj = blankAdj());
    state.font = {date:'leckerli', name:'chiron'};
    syncText(); refont(); touch();
  };
  // − / ＋：按一下調一格，按住連續調
  {
    let rep = null;
    const stop = () => { if(rep){ clearTimeout(rep.t); clearInterval(rep.i); rep = null; } };
    const bump = b => {
      if(b.dataset.fz){ setScale(scaleOf(R()) + 0.02*(+b.dataset.fz)); }
      else if(b.dataset.z){ const r = R(); if(!r.photo) return; r.zoom += 0.05*(+b.dataset.z); clampPhoto(r); syncPhoto(); }
      else { const f = b.dataset.f; setAdj(f, adjOf()[f] + (+b.dataset.d)); ranges[f].value = adjOf()[f]; outs[f].textContent = adjOf()[f]; }
      touch();
    };
    const box = el.querySelector('.ed-ctrl');
    box.addEventListener('pointerdown', e => {
      const b = e.target.closest('.step'); if(!b) return;
      e.preventDefault(); stop(); bump(b);
      rep = {t:setTimeout(() => { rep.i = setInterval(() => bump(b), 60); }, 400)};
    });
    ['pointerup','pointercancel','pointerleave'].forEach(ev => box.addEventListener(ev, stop));
    box.addEventListener('click', e => { const b = e.target.closest('.step'); if(b && e.detail===0) bump(b); });
  }
  // 預覽上：揀相框（點中邊個就揀邊個）、拖動、兩指縮放
  {
    const pts = new Map(); let pinch = null, drag = null;
    const toCard = e => { const r = pv.getBoundingClientRect(), k = W/r.width; return {x:(e.clientX-r.left)*k, y:(e.clientY-r.top)*k}; };
    const k = () => W/(pv.getBoundingClientRect().width || 1);
    function hitFrame(p, photoOnly){
      const list = active();
      for(let i=list.length-1;i>=0;i--){ // 上面嗰個優先
        const b = photoOnly ? frameRect(list[i], i) : groupBounds(list[i], i);
        if(p.x>=b.x && p.x<=b.x+b.w && p.y>=b.y && p.y<=b.y+b.h) return i;
      }
      return -1;
    }
    function hitText(p){
      let best = 40, hit = null;
      const cand = [['date', textBounds.date, -1], ['time', textBounds.time, -1]];
      active().forEach((r, i) => cand.push(['name', nameBounds[i], i]));
      for(const [key, b, i] of cand){
        if(!b) continue;
        const d = Math.hypot(Math.max(b.x-p.x, 0, p.x-b.x-b.w), Math.max(b.y-p.y, 0, p.y-b.y-b.h));
        if(d < best){ best = d; hit = {key, i}; }
      }
      return hit;
    }
    pv.addEventListener('pointerdown', e => {
      e.preventDefault();
      if(playing) stopPreview();
      const p = toCard(e);
      if(pts.size===0){
        if(mode==='text'){
          const hit = hitText(p);
          if(hit){ tsel = hit.key; if(hit.i>=0){ sel = hit.i; syncChips(); } syncText(); }
          const A = adjOf();
          drag = {x:e.clientX, y:e.clientY, dx:A.dx, dy:A.dy};
        } else {
          const i = hitFrame(p, mode==='photo');
          if(i>=0 && i!==sel){ sel = i; sync(); }
          const r = R();
          if(mode==='frame'){ const c = centerOf(r, sel); drag = {x:e.clientX, y:e.clientY, cx:c.x, cy:c.y, on:i>=0}; }
          else drag = {x:e.clientX, y:e.clientY, px:r.px, py:r.py, on:i>=0};
        }
      }
      try{ pv.setPointerCapture(e.pointerId); }catch{}
      pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
      if(pts.size===2 && mode!=='text'){
        const [a, b] = [...pts.values()];
        pinch = {d:Math.hypot(a.x-b.x, a.y-b.y)||1, k:scaleOf(R()), z:R().zoom};
      }
    });
    pv.addEventListener('pointermove', e => {
      const prev = pts.get(e.pointerId); if(!prev) return;
      pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
      const q = k(), r = R();
      if(pts.size>=2 && pinch){
        const [a, b] = [...pts.values()], m = Math.hypot(a.x-b.x, a.y-b.y)/pinch.d;
        if(mode==='frame') setScale(pinch.k*m);
        else if(mode==='photo' && r.photo){ r.zoom = pinch.z*m; clampPhoto(r); zRange.value = r.zoom; zOut.textContent = Math.round(r.zoom*100)+'%'; }
      } else if(drag && pts.size===1){
        const dx = (e.clientX-drag.x)*q, dy = (e.clientY-drag.y)*q;
        if(mode==='text'){
          setAdj('dx', drag.dx+dx); setAdj('dy', drag.dy+dy);
          ranges.dx.value = outs.dx.textContent = adjOf().dx; ranges.dy.value = outs.dy.textContent = adjOf().dy;
        } else if(mode==='frame' && drag.on){
          r.pos = {x:drag.cx+dx, y:drag.cy+dy}; clampCenter(r, sel);
        } else if(mode==='photo' && drag.on && r.photo){
          const f = frameRect(r, sel);
          r.px = drag.px + dx/f.w; r.py = drag.py + dy/f.w; clampPhoto(r);
        }
      }
      touch();
    });
    const end = e => {
      pts.delete(e.pointerId);
      if(pts.size<2) pinch = null;
      if(!pts.size){ drag = null; summary(); }
    };
    ['pointerup','pointercancel','lostpointercapture'].forEach(ev => pv.addEventListener(ev, end));
  }
  document.addEventListener('keydown', e => {
    if(e.key!=='Escape' || !opened) return;
    if(!sheet.hidden) sheet.hidden = true; else close();
  });
  $('dyThumb').addEventListener('click', () => open('frame'));
  $('dyOpenFrame').addEventListener('click', () => open('frame'));
  $('dyOpenText').addEventListener('click', () => open('text'));
  return {open, close, sync:() => { if(opened) sync(); else summary(); }, isOpen:() => opened};
})();

// ---------- 下載 ----------
const BUSY_IDS = ['dyPlay','dyPng','dyMp4','dyThumb','dyOpenFrame','dyOpenText','dyAdd','dyDate','dyStart','dyEnd'];
function setBusy(b){
  exporting = b;
  BUSY_IDS.forEach(id => { const x = $(id); if(x) x.disabled = b || (id==='dyAdd' && state.count>=MAX); });
  document.querySelectorAll('#tab-daily .dy-res input, #tab-daily .dy-res select, #tab-daily .dy-res button, #dyCountSeg button, #dyHist button')
    .forEach(x => { x.disabled = b || (x.classList.contains('dy-del') && state.count<=1); });
}
function ready(){
  if(!assetsReady){ say('素材仲載入緊，請稍等'); return false; }
  if(!dateText()){ say('請選擇日期'); return false; }
  if(!timeText()){ say('請設定開放時間'); return false; }
  const list = active();
  const miss = list.findIndex(r => !r.photo);
  if(miss>=0){ say(`請先為居民 ${miss+1} 選擇相片`); return false; }
  const noName = list.findIndex(r => !r.name);
  if(noName>=0){ say(`請輸入居民 ${noName+1} 的名字`); return false; }
  return true;
}
function baseName(){ const d = fromVal(state.date); return `每日更表_${d.getDate()}-${d.getMonth()+1}_${state.count}人`; }
$('dyPlay').addEventListener('click', preview);
$('dyPng').addEventListener('click', async () => {
  if(exporting || !ready()) return;
  stopPreview(); setBusy(true);
  window.qgWorkflow?.progress('daily', 5, '正在生成每日更表圖片');
  let ok = false;
  try{
    await ensureFonts(); render(0, true);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    if(!blob){ say('圖片生成失敗，請再試一次'); return; }
    window.qgWorkflow?.progress('daily', 70, '儲存本機記錄');
    await saveHistory();
    window.qgWorkflow?.progress('daily', 85, '準備下載圖片');
    ok = await saveBlob(blob, baseName()+'.png', say);
  }catch(err){ say('圖片生成失敗，請再試一次'); }
  finally{ setBusy(false); }
  if(ok) window.qgWorkflow?.finish('daily', true, '圖片已準備好');
  else window.qgWorkflow?.fail('daily', '未能下載圖片');
});
// 影片：設計座標放大 1.091 倍，與加長背景逐點對齊
const VIDEO_PLACE = {x:-8, y:236, w:W*1.091, h:H*1.091};
let pendingVideo = null;
$('dyMp4').addEventListener('click', async () => {
  if(exporting || !ready()) return;
  stopPreview();
  await ensureFonts();
  const name = baseName();
  $('dySaveBox').classList.remove('on'); pendingVideo = null;
  setBusy(true); $('dyRec').classList.add('on'); say('影片製作中…請稍等');
  window.qgWorkflow?.progress('daily', 3, '開始製作影片');
  playing = true;
  let ok = false;
  try{
    const out = await window.qgVideo.record({
      bg:'video/daily-bg.jpg', card:cv, cardBg:img.bg, duration:DURATION, hold:0.08, place:VIDEO_PLACE,
      frame:t => render(t, false, true), after:videoOverlay,
      progress:p => window.qgWorkflow?.progress('daily', Math.min(90, Math.round(6+84*p)), '正在製作影片'),
    });
    pendingVideo = {blob:out.blob, name:name+'.'+out.ext};
    const webm = out.ext==='webm' ? '（這個瀏覽器只能錄成 WebM 格式）' : '';
    const saved = await window.qgVideo.autoSave(out.blob, pendingVideo.name);
    if(saved==='saved'){ say('影片已自動儲存：'+pendingVideo.name+webm); window.qgWorkflow?.finish('daily', true, '影片已完成並儲存'); }
    else { say('影片已製作好！按下面「儲存影片」存入相簿'+webm); window.qgWorkflow?.finish('daily', true, '影片已完成，請按「儲存影片」'); }
    $('dySaveBox').classList.add('on');
    ok = true;
  }catch(err){ say(err.message || '錄影失敗，請再試一次'); window.qgWorkflow?.fail('daily', '錄影失敗'); }
  finally{ playing = false; $('dyRec').classList.remove('on'); setBusy(false); render(0, true); }
  if(ok) saveHistory();
});
$('dySaveVid').addEventListener('click', async () => {
  if(!pendingVideo) return;
  const ok = await saveBlob(pendingVideo.blob, pendingVideo.name, say);
  if(ok) window.qgWorkflow?.finish('daily', true, '影片已儲存'); else window.qgWorkflow?.fail('daily', '未能儲存影片');
});

// ---------- 最近 10 次記錄（只存在這部裝置的瀏覽器 IndexedDB，獨立資料庫，唔會影響其他製作器） ----------
const HIST_MAX = 10;
let dbP = null;
function db(){
  if(!dbP){
    dbP = new Promise((res, rej) => {
      try{
        const r = indexedDB.open('qg-daily', 1);
        r.onupgradeneeded = () => { r.result.createObjectStore('hist', {keyPath:'id'}); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blocked'));
      }catch(e){ rej(e); }
    });
    dbP.catch(() => { dbP = null; });
  }
  return dbP;
}
function tx(mode, fn){
  return db().then(d => new Promise((res, rej) => {
    const t = d.transaction('hist', mode), s = t.objectStore('hist');
    let out; const r = fn(s); if(r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  }));
}
const histAll = () => tx('readonly', s => s.getAll()).then(a => (a||[]).sort((x,y) => y.ts-x.ts));
const toBlob = (c, type, q) => new Promise(r => c.toBlob(r, type, q));
// Some WebKit builds cannot persist Blob objects in IndexedDB. Store JPEG
// bytes instead; keep reading legacy Blob records without upgrading/deleting DBs.
const historyBlob = value => value instanceof Blob ? value : new Blob([value], {type:'image/jpeg'});
async function saveHistory(){
  try{
    const list = active();
    for(const r of list) if(r.photo && !r.photoBlob) r.photoBlob = await toBlob(r.photo, 'image/jpeg', 0.9);
    const tc = mkCanvas(240, 320), tcc = tc.getContext('2d');
    tcc.imageSmoothingQuality = 'high'; tcc.drawImage(cv, 0, 0, tc.width, tc.height);
    const thumb = await (await toBlob(tc, 'image/jpeg', 0.82)).arrayBuffer();
    const photos = await Promise.all(list.map(r => r.photoBlob ? historyBlob(r.photoBlob).arrayBuffer() : null));
    // 同一個日期只保留最新一次
    const entry = {id:state.date, ts:Date.now(), date:state.date, start:state.start, end:state.end, text:dateText(),
      count:state.count, sizeMode:state.sizeMode, uniS:state.uniS, font:{...state.font},
      adj:{date:{...state.adj.date}, time:{...state.adj.time}},
      res:list.map((r, i) => ({name:r.name, cat:r.cat, photo:photos[i], zoom:r.zoom, px:r.px, py:r.py,
        pos:r.pos ? {...r.pos} : null, s:r.s, adj:{...r.adj}})),
      thumb};
    await tx('readwrite', s => s.put(entry));
    const all = await histAll();
    if(all.length>HIST_MAX) await tx('readwrite', s => { all.slice(HIST_MAX).forEach(x => s.delete(x.id)); });
    await showHistory();
  }catch(err){ $('dyHistMsg').textContent = '這個瀏覽器未能保存記錄（例如私密瀏覽模式）'; }
}
let thumbUrls = [], histCache = [];
async function showHistory(){
  const box = $('dyHist'), msg = $('dyHistMsg');
  let all;
  try{ all = await histAll(); }
  catch(err){ box.innerHTML = ''; msg.textContent = '這個瀏覽器未能使用記錄功能（例如私密瀏覽模式）'; return; }
  thumbUrls.forEach(u => URL.revokeObjectURL(u)); thumbUrls = [];
  histCache = all;
  box.replaceChildren(...all.map((hh, i) => {
    const wrap = document.createElement('div'); wrap.className = 'wk-hi'; wrap.dataset.id = hh.id;
    const go = document.createElement('button'); go.type = 'button'; go.className = 'go'; go.dataset.i = i;
    go.setAttribute('aria-label', '載入 '+hh.text);
    if(hh.thumb){ const u = URL.createObjectURL(historyBlob(hh.thumb)); thumbUrls.push(u); const im = document.createElement('img'); im.src = u; im.alt = ''; go.append(im); }
    const d = new Date(hh.ts);
    const t1 = document.createElement('span'); t1.className = 'd'; t1.textContent = (hh.text||'').replace(/ \d{4}/, '') + '｜' + hh.count + '人';
    const t2 = document.createElement('span'); t2.className = 'w'; t2.textContent = `${d.getDate()}/${d.getMonth()+1} ${pad(d.getHours())}:${pad(d.getMinutes())} 儲存`;
    go.append(t1, t2);
    const del = document.createElement('button'); del.type = 'button'; del.className = 'del'; del.dataset.del = i; del.textContent = '×';
    del.setAttribute('aria-label', '刪除這個記錄');
    wrap.append(go, del); return wrap;
  }));
  msg.textContent = all.length ? '按記錄可以重新載入當時的日期、居民、相片及版面，繼續編輯' : '未有記錄。下載圖片或影片後會自動記錄最近 10 次。';
  markCurrent();
}
function markCurrent(){ $('dyHist').querySelectorAll('.wk-hi').forEach(el => el.classList.toggle('cur', el.dataset.id===state.date)); }
$('dyHist').addEventListener('click', async e => {
  if(exporting) return;
  stopPreview();
  const del = e.target.closest('[data-del]');
  if(del){
    const hh = histCache[+del.dataset.del]; if(!hh) return;
    if(!confirm('刪除「'+hh.text+'」這個記錄？')) return;
    try{ await tx('readwrite', s => s.delete(hh.id)); }catch(err){}
    showHistory(); return;
  }
  const go = e.target.closest('[data-i]'); if(!go) return;
  const hh = histCache[+go.dataset.i]; if(!hh) return;
  if(active().some(hasData) && !confirm('載入記錄會取代目前填寫的居民資料，確定？')) return;
  try{
    const res = [];
    for(const x of hh.res||[]){
      const r = blankRes();
      r.name = x.name||''; r.cat = catOf(x.cat).id;
      r.photoBlob = x.photo ? historyBlob(x.photo) : null;
      r.photo = r.photoBlob ? await blobToCanvas(r.photoBlob) : null;
      r.zoom = x.zoom||1; r.px = x.px||0; r.py = x.py||0;
      r.pos = x.pos && Number.isFinite(x.pos.x) ? {x:x.pos.x, y:x.pos.y} : null;
      r.s = Number.isFinite(x.s) ? x.s : 1; r.adj = {...blankAdj(), ...(x.adj||{})};
      clampPhoto(r); res.push(r);
    }
    while(res.length<MAX) res.push(blankRes());
    state.res = res; state.count = lim(hh.count||res.length, 1, MAX);
    state.sizeMode = hh.sizeMode==='individual' ? 'individual' : 'uniform';
    state.uniS = Number.isFinite(hh.uniS) ? hh.uniS : null;
    state.font = {date:'leckerli', name:'chiron', ...(hh.font||{})};
    state.adj = {date:{...blankAdj(), ...(hh.adj?.date||{})}, time:{...blankAdj(), ...(hh.adj?.time||{})}};
    $('dyDate').value = hh.date; $('dyStart').value = hh.start||'18:00'; $('dyEnd').value = hh.end||'22:00';
    sel = 0; updateDate(); renderList(); ed.sync(); refont();
    say('已載入記錄：'+hh.text+'，可以繼續調整後重新下載');
    $('tab-daily').scrollIntoView({behavior:'smooth', block:'start'});
  }catch(err){ say('記錄載入失敗'); }
});

// ---------- 開始（第一次打開分頁時載入素材） ----------
let started = false;
function start(){
  if(started) return; started = true;
  $('dyDate').value = toVal(today()); $('dyStart').value = state.start; $('dyEnd').value = state.end;
  updateDate(); renderList(); showHistory();
  say('載入素材中…');
  Promise.all(Object.keys(L).map(k => loadImg('daily/'+L[k].f).then(i => { img[k] = i; })))
    .then(async () => {
      ['bow','tagLimited','tagShadow','tagTrial'].forEach(k => blurImg[k] = makeBlur(img[k], 18));
      assetsReady = true; say(''); render(0, true);
      await ensureFonts(); render(0, true);
    })
    .catch(() => { started = false; say('素材載入失敗，請重新整理頁面'); });
}
window.qgDaily = {start, isBusy:() => exporting, render, state, setCount, LAYOUTS, frameRect, VIDEO_PLACE,
  loadPhoto, renderList, still:() => still(), started:() => started};
})();
