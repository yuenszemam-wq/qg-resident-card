/* 共用「預覽及調整」編輯器（以每週更表為標準）：
   上面即時預覽，下面「相片／文字」兩個分頁。
   相片：手指拖動、兩指縮放、縮放滑桿、換相片、重設位置。
   文字：沿用限定宣傳的介面（名字／IG／日期、字體、微調滑桿、重設）。
   每個分頁用 qgEditor.register(設定) 接入，卡片畫法及資料仍由各自的程式負責。 */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'hidden') el.hidden = v;
    else el.setAttribute(k, v);
  }
  el.append(...kids.filter(Boolean));
  return el;
};
const editors = {};
let current = null;

function register(cfg) {
  const id = cfg.id;
  const T = cfg.text, P = cfg.photo;
  let mode = 'photo', sel = T.items[0][0], opened = false, raf = 0, dirty = false;

  // ---------- 介面 ----------
  const play = h('button', {class:'small', type:'button', id:id+'Play', text:'▶ 播放'});
  const done = h('button', {class:'ed-done', type:'button', id:id+'Done', text:'完成'});
  const exit = h('button', {class:'ed-done', type:'button', id:id+'Exit', text:'✕ 退出'});
  const title = h('h2', {id:id+'Title', text:'預覽及調整'});
  const pv = h('canvas', {id:id+'Pv', 'aria-label':'即時預覽'});
  const view = h('div', {class:'ed-view'}, pv);
  const segM = h('div', {class:'seg two', role:'tablist'},
    h('button', {type:'button', role:'tab', 'data-m':'photo', text:'相片'}),
    h('button', {type:'button', role:'tab', 'data-m':'text', text:'文字'}));

  // 相片
  const tipP = h('div', {class:'ed-tip'});
  const zRange = h('input', {type:'range', min:'1', max:'3', step:'0.01', value:'1', 'aria-label':'縮放'});
  const zOut = h('output', {text:'100%'});
  const fileIn = h('input', {type:'file', accept:'image/*', hidden:true});
  const resetPos = h('button', {class:'small', type:'button', id:id+'ResetPos', text:'重設位置'});
  const paneP = h('div', {'data-pane':'photo'}, tipP,
    h('div', {class:'ed-row'}, h('span', {text:'縮放'}),
      h('button', {class:'step', type:'button', 'data-z':'-1', 'aria-label':'縮細', text:'−'}), zRange,
      h('button', {class:'step', type:'button', 'data-z':'1', 'aria-label':'放大', text:'+'}), zOut),
    h('div', {class:'ed-foot'}, h('label', {class:'small ed-file', text:'📷 換相片'}, fileIn), resetPos));

  // 文字
  const tipT = h('div', {class:'ed-tip'});
  // 以影子精靈的調整頁為標準：一律顯示文字分頁及兩個重設掣
  const segT = h('div', {class:'seg', role:'tablist'});
  segT.style.gridTemplateColumns = `repeat(${T.items.length},1fr)`;
  for (const [k, l] of T.items) segT.append(h('button', {type:'button', role:'tab', 'data-k':k, text:l}));
  // 字體：iPhone 原生選單唔可以顯示字款，改用自製面板，每行用該字體寫出現時文字
  const fontName = h('span', {class:'t'});
  const font = h('button', {type:'button', class:'ed-fontbtn', id:id+'Font', 'aria-haspopup':'dialog', 'aria-label':'字體'}, fontName, h('span', {class:'go', text:'⌄'}));
  const sheetList = h('div', {class:'qg-fs-list', role:'listbox', 'aria-label':'字體'});
  const sheetDone = h('button', {type:'button', class:'ed-done', id:id+'FontDone', text:'完成'});
  const sheet = h('div', {class:'qg-fs', id:id+'FontSheet', hidden:true, role:'dialog', 'aria-modal':'true', 'aria-label':'揀字體'},
    h('div', {class:'qg-fs-panel'}, h('div', {class:'qg-fs-head'}, h('strong', {text:'揀字體'}), h('span', {class:'qg-fs-hint', text:'撳一款即時套用'}), sheetDone), sheetList));
  const rows = h('div', {class:'ed-rows'});
  const ranges = {}, outs = {};
  for (const [f, l, mn, mx] of T.fields) {
    ranges[f] = h('input', {type:'range', min:String(mn), max:String(mx), step:'1', value:'0', 'data-f':f, 'aria-label':l});
    outs[f] = h('output', {text:'0'});
    rows.append(h('div', {class:'ed-row'}, h('span', {text:l}),
      h('button', {class:'step', type:'button', 'data-f':f, 'data-d':'-1', 'aria-label':l+'減少', text:'−'}), ranges[f],
      h('button', {class:'step', type:'button', 'data-f':f, 'data-d':'1', 'aria-label':l+'增加', text:'+'}), outs[f]));
  }
  const resetOne = h('button', {class:'small', type:'button', id:id+'ResetText'});
  const resetAll = h('button', {class:'small', type:'button', text:'全部重設'});
  const paneT = h('div', {'data-pane':'text', hidden:true}, tipT, segT,
    h('div', {class:'ed-font'}, h('span', {text:'字體'}), font), rows,
    h('div', {class:'ed-foot'}, resetOne, resetAll));

  const el = h('div', {class:'editor qg-ed', id, hidden:true, role:'dialog', 'aria-modal':'true', 'aria-labelledby':id+'Title'},
    h('div', {class:'ed-head'}, title, play, done, exit),
    view,
    h('div', {class:'ed-ctrl'}, h('div', {}, segM, paneP, paneT)), sheet);
  // 放在分頁內，令原本「記住位置」的事件監聽照樣生效
  (cfg.panel || document.body).append(el);

  // ---------- 同步 ----------
  const label = k => (T.items.find(i => i[0] === k) || [k, k])[1];
  function syncPhoto() {
    const has = P.has();
    tipP.textContent = has ? '用手指拖動相片，兩指縮放' : '未選相片，按「換相片」揀一張';
    const z = P.zoom();
    zRange.value = z; zOut.textContent = Math.round(z * 100) + '%';
    zRange.disabled = !has;
  }
  function syncText() {
    segT.querySelectorAll('button').forEach(b => { const on = b.dataset.k === sel; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    for (const [f] of T.fields) { const v = T.get(sel, f); ranges[f].value = v; outs[f].textContent = v; }
    const cur = T.fonts(sel).find(f => f.id === T.font(sel)) || T.fonts(sel)[0];
    fontName.textContent = cur.label;
    styleFont(fontName, cur, sel, 17);
    if (!sheet.hidden) fillSheet();
    resetOne.textContent = '重設' + label(sel);
    tipT.textContent = T.has(sel) ? '可以直接在卡上拖動文字' : (T.emptyTip ? T.emptyTip(sel) : '未輸入' + label(sel) + '，先在上面填寫');
  }
  // 用字體資料設定預覽樣式（加粗字款用描邊模擬卡上效果）
  function styleFont(el, f, k, px) {
    if (!f || !f.fam) { el.style.fontFamily = ''; el.style.fontWeight = ''; el.style.webkitTextStroke = ''; return; }
    el.style.fontFamily = `"${f.fam}",${f.fallback || '"PingFang TC","Noto Sans TC",sans-serif'}`;
    el.style.fontWeight = f.w || 400;
    el.style.webkitTextStroke = f.bold ? (f.bold * px).toFixed(2) + 'px currentColor' : '';
  }
  function fillSheet(load) {
    const list = T.fonts(sel), sample = (T.sample && T.sample(sel)) || '範例文字 Abc 123', curId = T.font(sel);
    sheetList.replaceChildren(...list.map(f => {
      const on = f.id === curId;
      const s = h('span', {class:'s', text:sample}); styleFont(s, f, sel, 26);
      return h('button', {type:'button', role:'option', 'aria-selected':String(on), class:'qg-fs-item'+(on?' on':''), 'data-id':f.id},
        h('span', {class:'n', text:(on ? '✓ ' : '') + f.label}), s);
    }));
    if (load) for (const f of list) {
      if (!f.fam) continue;
      // 中日文字體（Google Fonts）要先加 CSS，之後瀏覽器只下載用到的字
      (f.gcss && typeof loadFontCss === 'function' ? loadFontCss(f.gcss) : Promise.resolve())
        .then(() => document.fonts?.load(`${f.w || 400} 26px "${f.fam}"`, sample)).catch(() => {});
    }
  }
  function syncMode() {
    segM.querySelectorAll('button').forEach(b => { const on = b.dataset.m === mode; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    paneP.hidden = mode !== 'photo'; paneT.hidden = mode !== 'text';
    pv.style.cursor = mode === 'photo' && !P.has() ? '' : 'grab';
  }
  function summary() {
    const s = cfg.summary; if (!s) return;
    const changed = T.changed();
    s.textContent = (P.has() ? '相片：已選' : '相片：未選') + '｜' + (changed ? '文字：已微調' : '文字：原本位置');
    s.classList.toggle('on', P.has() || changed);
  }
  function sync() { syncPhoto(); syncText(); syncMode(); summary(); }
  // 每格最多重畫一次，拖動時唔會卡
  function touch() { dirty = true; if (!opened) flush(); }
  function flush() { dirty = false; cfg.still(); summary(); }

  // ---------- 預覽 ----------
  const pctx = pv.getContext('2d');
  function size() {
    if (!opened) return;
    const src = cfg.canvas, aspect = src.width / src.height;
    const aw = view.clientWidth - 16, ah = view.clientHeight - 16;
    if (aw <= 0 || ah <= 0) return;
    const cw = Math.min(aw, ah * aspect), ch = cw / aspect;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    pv.style.width = cw + 'px'; pv.style.height = ch + 'px';
    pv.width = Math.round(cw * dpr); pv.height = Math.round(ch * dpr);
  }
  // 相片／文字控制區高度唔同：預覽範圍一變就重新計尺寸
  if (window.ResizeObserver) new ResizeObserver(() => size()).observe(view);
  function paint() {
    if (!opened) return;
    if (dirty) flush();
    const src = cfg.canvas;
    if (pv.width) {
      pctx.setTransform(1,0,0,1,0,0);
      pctx.imageSmoothingEnabled = true; pctx.imageSmoothingQuality = 'high';
      pctx.drawImage(src, 0, 0, pv.width, pv.height);
      const b = mode === 'text' && !cfg.playing() ? T.bounds(sel) : null;
      if (b) {
        // 選中的文字加虛線框（只在預覽顯示，不會出現在圖片或影片）
        const s = pv.width / src.width, u = Math.min(window.devicePixelRatio || 1, 3) / s, p = 10;
        pctx.save(); pctx.setTransform(s,0,0,s,0,0);
        pctx.lineWidth = 2*u; pctx.setLineDash([7*u, 5*u]);
        pctx.strokeStyle = 'rgba(0,0,0,.6)'; pctx.strokeRect(b.x-p, b.y-p, b.w+p*2, b.h+p*2);
        pctx.lineDashOffset = 6*u; pctx.strokeStyle = '#f2d48a'; pctx.strokeRect(b.x-p, b.y-p, b.w+p*2, b.h+p*2);
        pctx.restore();
      }
    }
    raf = requestAnimationFrame(paint);
  }

  // ---------- 開關 ----------
  function open(m) {
    if (cfg.busy()) return;
    if (current && current !== api) current.close();
    mode = m || 'photo';
    if (!T.has(sel)) sel = (T.items.find(([k]) => T.has(k)) || T.items[0])[0];
    opened = true; current = api;
    el.hidden = false;
    document.body.style.overflow = 'hidden';
    sync();
    requestAnimationFrame(() => { size(); cancelAnimationFrame(raf); paint(); });
  }
  function close() {
    if (!opened) return;
    sheet.hidden = true;
    opened = false; if (current === api) current = null;
    el.hidden = true;
    cancelAnimationFrame(raf);
    document.body.style.overflow = '';
    if (dirty) flush();
    cfg.save?.(); summary(); cfg.still();
  }

  // ---------- 事件 ----------
  play.onclick = () => cfg.play();
  done.onclick = close; exit.onclick = close;
  segM.onclick = e => { const m = e.target.closest('[data-m]'); if (m) { mode = m.dataset.m; syncMode(); } };
  segT.onclick = e => { const b = e.target.closest('[data-k]'); if (b) { sel = b.dataset.k; syncText(); } };
  zRange.oninput = () => { P.setZoom(+zRange.value); zOut.textContent = Math.round(P.zoom()*100) + '%'; touch(); };
  fileIn.onchange = () => { const f = fileIn.files && fileIn.files[0]; fileIn.value = ''; if (f) P.load(f); };
  resetPos.onclick = () => { P.reset(); syncPhoto(); touch(); };
  rows.addEventListener('input', e => { const f = e.target.dataset.f; if (!f) return; T.set(sel, f, +e.target.value); outs[f].textContent = T.get(sel, f); touch(); });
  font.onclick = () => {
    fillSheet(true); sheet.hidden = false;
    sheetList.querySelector('.on')?.scrollIntoView({block:'center'});
  };
  sheetDone.onclick = () => { sheet.hidden = true; font.focus(); };
  sheet.onclick = e => { if (e.target === sheet) sheet.hidden = true; };
  sheetList.onclick = e => {
    const b = e.target.closest('[data-id]'); if (!b) return;
    T.setFont(sel, b.dataset.id); touch(); syncText();
  };
  resetOne.onclick = () => { T.reset([sel]); syncText(); touch(); };
  resetAll.onclick = () => { T.reset(T.items.map(i => i[0])); syncText(); touch(); };
  // − / ＋：按一下調 1（縮放 5%），按住會連續調
  {
    let rep = null;
    const stop = () => { if (rep) { clearTimeout(rep.t); clearInterval(rep.i); rep = null; } };
    const bump = b => {
      if (b.dataset.z) { if (!P.has()) return; P.setZoom(P.zoom() + 0.05 * (+b.dataset.z)); syncPhoto(); }
      else { const f = b.dataset.f; T.set(sel, f, T.get(sel, f) + (+b.dataset.d)); ranges[f].value = T.get(sel, f); outs[f].textContent = T.get(sel, f); }
      touch();
    };
    const box = el.querySelector('.ed-ctrl');
    box.addEventListener('pointerdown', e => {
      const b = e.target.closest('.step'); if (!b) return;
      e.preventDefault(); stop(); bump(b);
      rep = {t: setTimeout(() => { rep.i = setInterval(() => bump(b), 60); }, 400)};
    });
    ['pointerup','pointercancel','pointerleave'].forEach(ev => box.addEventListener(ev, stop));
    box.addEventListener('click', e => { const b = e.target.closest('.step'); if (b && e.detail === 0) bump(b); }); // 鍵盤
  }
  // 在預覽上：相片模式拖相片／兩指縮放；文字模式點選並拖動文字
  {
    const pts = new Map(); let pinch = null, drag = null;
    const scale = () => cfg.canvas.width / (pv.getBoundingClientRect().width || 1);
    const toCard = e => { const r = pv.getBoundingClientRect(), k = cfg.canvas.width / r.width; return {x:(e.clientX - r.left)*k, y:(e.clientY - r.top)*k}; };
    pv.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (mode === 'photo' && !P.has()) return;
      if (mode === 'text' && pts.size === 0) {
        // 揀最接近手指的文字（40 卡片像素內）
        const p = toCard(e); let hit = null, best = 40;
        for (const [k] of T.items) {
          const b = T.bounds(k); if (!b) continue;
          const d = Math.hypot(Math.max(b.x - p.x, 0, p.x - b.x - b.w), Math.max(b.y - p.y, 0, p.y - b.y - b.h)) + Math.abs(p.y - (b.y + b.h/2))/1000;
          if (d < best) { best = d; hit = k; }
        }
        if (hit && hit !== sel) { sel = hit; syncText(); }
        if (!T.has(sel)) return;
        drag = {x:e.clientX, y:e.clientY, dx:T.get(sel,'dx'), dy:T.get(sel,'dy')};
      }
      try { pv.setPointerCapture(e.pointerId); } catch {}
      pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
      if (mode === 'photo' && pts.size === 2) { const [a, b] = [...pts.values()]; pinch = {d: Math.hypot(a.x-b.x, a.y-b.y) || 1, z: P.zoom()}; }
      pv.style.cursor = 'grabbing';
    });
    pv.addEventListener('pointermove', e => {
      const prev = pts.get(e.pointerId); if (!prev) return;
      pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
      const k = scale();
      if (mode === 'text') {
        if (!drag) return;
        T.set(sel, 'dx', drag.dx + (e.clientX - drag.x)*k);
        T.set(sel, 'dy', drag.dy + (e.clientY - drag.y)*k);
        if (ranges.dx) { ranges.dx.value = outs.dx.textContent = T.get(sel,'dx'); }
        if (ranges.dy) { ranges.dy.value = outs.dy.textContent = T.get(sel,'dy'); }
      } else if (pts.size >= 2 && pinch) {
        const [a, b] = [...pts.values()];
        P.setZoom(pinch.z * Math.hypot(a.x-b.x, a.y-b.y) / pinch.d);
        zRange.value = P.zoom(); zOut.textContent = Math.round(P.zoom()*100) + '%';
      } else if (pts.size === 1) {
        P.pan((e.clientX - prev.x)*k, (e.clientY - prev.y)*k);
      }
      touch();
    });
    const end = e => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (!pts.size) { drag = null; pv.style.cursor = mode === 'photo' && !P.has() ? '' : 'grab'; cfg.save?.(); }
    };
    ['pointerup','pointercancel','lostpointercapture'].forEach(ev => pv.addEventListener(ev, end));
  }

  // 細預覽、「調整相片位置」、「文字微調」
  cfg.thumb?.addEventListener('click', () => open('photo'));
  cfg.openPhoto?.addEventListener('click', () => open('photo'));
  cfg.openText?.addEventListener('click', () => open('text'));

  const api = {open, close, sync, el, size, isOpen: () => opened, summary};
  editors[cfg.key] = api;
  summary();
  return api;
}

const resize = () => current?.size();
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !current) return;
  const fs = current.el.querySelector('.qg-fs:not([hidden])');
  if (fs) fs.hidden = true; else current.close();
});

window.qgEditor = {
  register,
  sync(key) { const e = editors[key]; if (e) { e.isOpen() ? e.sync() : e.summary(); } },
  get(key) { return editors[key]; },
};
// 各分頁的程式先載入，把設定放在 window.qgCards
for (const cfg of Object.values(window.qgCards || {})) register(cfg);
})();
