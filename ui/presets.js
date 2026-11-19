/* Queen's Garden：公開製作器與管理後台設定的橋接。
   - 已發佈設定（字體、文字預設、相框版型、素材、文案）及居民名冊
   - 優先順序：當次手動修改 ＞ 最近製作記錄／已記住的微調 ＞ 已發佈預設 ＞ 程式內建
   - 任何網絡錯誤都只會退回內建設定，不影響製作器原有功能 */
(() => {
'use strict';
const CFG_KEY = 'qg.config.cache.v1', ROSTER_KEY = 'qg.roster.cache.v1', APPLIED_KEY = 'qg.presets.applied.v1';
const PAGES = ['promo', 'shadow', 'weekly', 'daily'];
const CAT_LABEL = {regular:'常駐', limited:'限定', shadow:'影子', trial:'試煉', none:'無分類'};
const DAILY_CAT = {regular:'resident', none:'resident', limited:'limited', shadow:'shadow', trial:'trial'};
const FIELDS = ['size', 'sp', 'dx', 'dy'];
const $ = id => document.getElementById(id);
const read = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const params = new URLSearchParams(location.search);
const previewDraft = params.get('qgPreview') === 'draft';
// 管理後台「頁面設定」內嵌的即時預覽：設定由後台 postMessage 傳入，製作器上的修改亦會傳回後台
const previewLive = params.get('qgPreview') === 'live' && window.parent !== window;
let liveResolve;
const liveFirst = new Promise(r => { liveResolve = r; });

let cached = read(CFG_KEY);
let config = cached && cached.config || null;
let version = cached && cached.version || 0;
const applied = read(APPLIED_KEY) || {};

// ---------- 已發佈設定（預覽模式讀管理員草稿，不寫入快取） ----------
function timeout(ms) { return new Promise(r => setTimeout(r, ms)); }
async function fetchConfig() {
  if (previewLive) return liveFirst;   // 等後台傳入設定（包括草稿的素材替換）
  if (previewDraft) {
    const r = await fetch('/api/admin/config/draft', {credentials:'same-origin'});
    if (!r.ok) throw new Error('draft');
    const d = await r.json();
    if (!d.draft) throw new Error('nodraft');
    return {version:'draft', config:d.draft.body};
  }
  const r = await fetch('/api/public/config', {credentials:'omit'});
  if (!r.ok) throw new Error('config');
  return r.json();
}
const fresh = fetchConfig().then(d => {
  const changed = d.version !== version;
  config = d.config; version = d.version;
  if (!previewDraft && !previewLive) write(CFG_KEY, {version, config, at:Date.now()});
  if (changed) registerFonts();
  return true;
}).catch(() => false);
// 素材替換要等設定：最多等 1.5 秒，否則用快取或內建素材
const ready = Promise.race([fresh, timeout(1500)]);

// ---------- 素材替換 ----------
function assetUrl(key) {
  const id = config && config.assets && config.assets[key];
  return id && /^[0-9A-Z]{26}$/.test(id) ? '/media/' + id : null;
}

// ---------- 上載的字體 ----------
const registered = new Set();
let fontLists = null;
function registerFonts() {
  if (!config || !Array.isArray(config.fonts) || !window.FontFace) return;
  for (const f of config.fonts) {
    if (!f || registered.has(f.id) || !/^[0-9A-Z]{26}$/.test(f.assetId)) continue;
    try {
      const face = new FontFace(f.family, `url(/media/${f.assetId})`, {weight:String(f.weight || 400), display:'swap'});
      document.fonts.add(face);
      registered.add(f.id);
    } catch {}
    if (fontLists) addToLists(f);
  }
}
function addToLists(f) {
  const entry = {id:f.id, label:f.label + '（自訂）', fam:f.family, w:f.weight || 400, bold:0};
  if (f.roles.includes('name') && !fontLists.name.some(x => x.id === f.id)) fontLists.name.push(entry);
  if (f.roles.includes('hand') && !fontLists.hand.some(x => x.id === f.id)) fontLists.hand.push(entry);
}
/** index.html 定義字體清單後立即呼叫（在每日更表建立清單之前）。 */
function extendFonts(nameFonts, handFonts) {
  fontLists = {name:nameFonts, hand:handFonts};
  registerFonts();
  if (config && config.fonts) config.fonts.forEach(addToLists);
}

// ---------- 文字預設 ----------
function cardSnapshot(card) {
  const T = card.text, out = {};
  for (const [k] of T.items) {
    out[k] = {font:T.font(k)};
    for (const f of FIELDS) out[k][f] = T.get(k, f);
  }
  return JSON.stringify(out);
}
function applyCard(page, force = false) {
  const card = window.qgCards && window.qgCards[page];
  const preset = config && config.pages && config.pages[page] && config.pages[page].text;
  if (!card || !card.text || !preset) return;
  const T = card.text;
  // 使用者自己改過（或從記錄還原）就不覆蓋；只在仍是內建值或上次自動套用的預設時更新
  const now = cardSnapshot(card);
  if (!force && T.changed() && applied[page] !== now) return;
  const keys = T.items.map(([k]) => k);
  T.reset(keys);
  for (const k of keys) {
    const p = preset[k]; if (!p) continue;
    if (p.font && T.fonts(k).some(f => f.id === p.font)) T.setFont(k, p.font);
    for (const f of FIELDS) if (typeof p[f] === 'number') T.set(k, f, p[f]);
  }
  applied[page] = cardSnapshot(card);
  if (!previewLive) write(APPLIED_KEY, applied);
  card.still && card.still();
  window.qgEditor?.sync(page);
}
let dailyApplied = false;
function applyDaily(force = false) {
  const D = window.qgDaily, P = config && config.pages && config.pages.daily;
  if (!D || !P || (dailyApplied && !force)) return;
  dailyApplied = true;
  for (const [n, l] of Object.entries(P.layouts || {})) {
    if (D.LAYOUTS[n] && Array.isArray(l.c) && l.c.length === +n) { D.LAYOUTS[n].k = l.k; D.LAYOUTS[n].c = l.c.map(p => [p[0], p[1]]); }
  }
  const t = P.text || {};
  if (t.date?.font) D.state.font.date = t.date.font;
  if (t.name?.font) D.state.font.name = t.name.font;
  for (const k of ['date', 'time']) for (const f of FIELDS) if (typeof t[k]?.[f] === 'number') D.state.adj[k][f] = t[k][f];
  if (force) {
    for (const k of ['date', 'time']) for (const f of FIELDS) D.state.adj[k][f] = typeof t[k]?.[f] === 'number' ? t[k][f] : 0;
    if (!t.date?.font) D.state.font.date = 'leckerli';
    if (!t.name?.font) D.state.font.name = 'chiron';
    if (P.times) { D.state.start = P.times.start; D.state.end = P.times.end; }
    return;
  }
  if (P.times && !D.started?.()) { D.state.start = P.times.start; D.state.end = P.times.end; }
}

// ---------- 後台即時預覽 ----------
function liveText(page) {
  if (page === 'daily') {
    const D = window.qgDaily; if (!D) return null;
    const out = {};
    for (const k of ['date', 'time']) { out[k] = {}; for (const f of FIELDS) out[k][f] = D.state.adj[k][f] || 0; }
    out.date.font = D.state.font.date; out.name = {font:D.state.font.name};
    return out;
  }
  const card = window.qgCards && window.qgCards[page];
  return card && card.text ? JSON.parse(cardSnapshot(card)) : null;
}
function liveRefresh(page) {
  if (page === 'daily') {
    const D = window.qgDaily; if (!D) return;
    applyDaily(true);
    for (const n of Object.keys(D.LAYOUTS)) {
      const l = config.pages.daily.layouts?.[n];
      if (l) { D.LAYOUTS[n].k = l.k; D.LAYOUTS[n].c = l.c.map(p => [p[0], p[1]]); }
    }
    D.state.res?.forEach(r => { r.pos = null; });
    try { D.renderList?.(); } catch {}
    D.still?.();
    if (document.fonts) document.fonts.ready.then(() => D.still?.());
  } else applyCard(page, true);
}
let liveBaseline = () => {};
function setupLive() {
  let page = null, last = '';
  liveBaseline = () => {
    if (!page) return;
    if (page === 'daily' && !last) try { liveRefresh('daily'); } catch {}
    last = JSON.stringify(liveText(page));
  };
  const post = msg => window.parent.postMessage(msg, location.origin);
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || e.source !== window.parent || !e.data || e.data.type !== 'qg-live-config') return;
    page = e.data.page;
    if (liveResolve) {   // 第一次：作為製作器的「已發佈設定」，素材及預設照常套用
      const r = liveResolve; liveResolve = null;
      document.documentElement.classList.add('qgp-live');
      r({version:'live', config:e.data.config});
      return;
    }
    config = e.data.config;
    registerFonts();
    try { liveRefresh(page); } catch {}   // 素材未載入完成時畫面稍後會自行重畫
    liveBaseline();
  });
  // 製作器上的修改（拖動文字、微調、字體）傳回後台
  setInterval(() => {
    if (!page || !config || liveResolve || !last) return;
    const now = liveText(page); if (!now) return;
    const s = JSON.stringify(now);
    if (s !== last) { last = s; post({type:'qg-live-text', page, text:now}); }
  }, 400);
  post({type:'qg-live-ready'});
}
if (previewLive) setupLive();

// ---------- 文案 ----------
const COPY_FIELDS = ['NAME', 'IG', 'DATE', 'TIME', 'CATEGORY', 'RESIDENT_LIST', 'START_DATE', 'END_DATE'];
const FIELD_LABEL = {NAME:'名字', IG:'IG', DATE:'日期', TIME:'開放時間', CATEGORY:'分類', RESIDENT_LIST:'居民名單', START_DATE:'開始日期', END_DATE:'結束日期'};
function render(template, values) {
  const missing = new Set(), unknown = new Set();
  const text = String(template).replace(/\{\{\s*([^}]*?)\s*\}\}/g, (m, key) => {
    if (!COPY_FIELDS.includes(key)) { unknown.add(key); return m; }
    const v = values[key];
    if (v == null || v === '') { missing.add(key); return m; }
    return String(v);
  });
  return {text, missing:[...missing], unknown:[...unknown]};
}
/** 回傳 null 表示用程式內建文案；{enabled:false} 表示管理員已停用。 */
function copyFor(page, snap = {}) {
  const c = config && config.copy && config.copy[page];
  if (!c) return null;
  if (!c.enabled || !c.template) return {enabled:false};
  const cat = picked[page] && picked[page].category;
  const values = {
    NAME:snap.name, IG:snap.ig, DATE:snap.date, TIME:snap.time || config.general?.openTime,
    CATEGORY:snap.category || (cat ? CAT_LABEL[cat] : ''), RESIDENT_LIST:snap.residentList,
    START_DATE:snap.startDate, END_DATE:snap.endDate,
  };
  const r = render(c.template, values);
  const notes = [];
  if (r.missing.length) notes.push('未填寫：' + r.missing.map(k => FIELD_LABEL[k]).join('、') + '（文案中保留了 {{欄位}}，請手動修改）');
  if (r.unknown.length) notes.push('未知欄位：' + r.unknown.join('、'));
  return {enabled:true, text:r.text, note:notes.join('；')};
}
const fmtDate = v => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  return new Intl.DateTimeFormat('en-GB', {day:'numeric', month:'short', year:'numeric', timeZone:'UTC'}).format(d);
};
const fmtTime = v => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v || ''); if (!m) return '';
  const h = +m[1]; return `${h % 12 || 12}:${m[2]}${h < 12 ? 'am' : 'pm'}`;
};
// 每日文案：日期「13 / 7 𝕸𝖔𝖓」（星期用粗體哥德字母）
const fraktur = t => [...t].map(c => {
  const n = c.charCodeAt(0);
  if (n >= 65 && n <= 90) return String.fromCodePoint(0x1D56C + n - 65);
  if (n >= 97 && n <= 122) return String.fromCodePoint(0x1D586 + n - 97);
  return c;
}).join('');
const dailyDate = v => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); if (!m) return '';
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)).getUTCDay()];
  return `${+m[3]} / ${+m[2]} ${fraktur(dow)}`;
};
// 居民名單：按分類分組，每行加分類符號；沒有的分類不顯示。IG 未有就按名字從名冊配對
const DAILY_GROUPS = [['resident', '⚜', '出沒居民'], ['limited', '♦️', '限定居民'], ['shadow', '♣️', '影子精靈'], ['trial', '🔰', '試煉者']];
const norm = v => String(v || '').trim().toLowerCase();
function igFor(r) {
  if (r.ig) return r.ig;
  const hit = (roster.residents || []).find(x => norm(x.name) === norm(r.name));
  return hit && hit.ig || '';
}
function dailyList(list) {
  const out = [];
  for (const [cat, sym, title] of DAILY_GROUPS) {
    const rows = list.filter(r => r && r.name && (r.cat || 'resident') === cat);
    if (!rows.length) continue;
    out.push(`${sym} ${title}`);
    for (const r of rows) { const ig = igFor(r); out.push(`${sym} ${r.name}${ig ? ' ' + ig : ''}`); }
  }
  return out.join('\n');
}
// 每週／每日更表：下載成功後彈出文案（由 qgWorkflow.finish 觸發，不改動繪圖引擎）
const DONE = new Set(['圖片已準備好', '影片已完成並儲存', '影片已儲存']);
function afterDownload(page, label) {
  if (!DONE.has(label) || typeof openPromo !== 'function') return;
  const c = config && config.copy && config.copy[page];
  if (!c || !c.enabled) return;
  let snap;
  if (page === 'weekly') snap = {startDate:fmtDate($('wkStart')?.value), endDate:fmtDate($('wkEnd')?.value)};
  else if (page === 'daily') {
    const S = window.qgDaily?.state; if (!S) return;
    snap = {date:dailyDate(S.date), time:[fmtTime(S.start), fmtTime(S.end)].filter(Boolean).join(' ─ '),
      residentList:dailyList(S.res.slice(0, S.count))};
  } else return;
  openPromo(snap, null, {page});
}

// ---------- 居民名冊 ----------
let roster = read(ROSTER_KEY) || {residents:[], syncedAt:null};
const picked = {};
const listeners = new Set();
async function loadRoster(refresh) {
  try {
    const r = await fetch('/api/public/residents' + (refresh ? '?refresh=1' : ''), {credentials:'omit'});
    if (!r.ok) throw new Error('roster');
    const d = await r.json();
    roster = {residents:d.residents || [], syncedAt:d.syncedAt, stale:d.stale, configured:d.configured, offline:false};
    write(ROSTER_KEY, {residents:roster.residents, syncedAt:roster.syncedAt});
  } catch {
    roster = {...roster, offline:true};
  }
  listeners.forEach(fn => fn(roster));
  return roster;
}
function syncText() {
  if (!roster.syncedAt) return roster.configured === false ? '名冊同步尚未設定' : roster.offline ? '未能連線，暫時沒有名冊' : '名冊載入中…';
  const d = new Date(roster.syncedAt);
  const t = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return (roster.offline || roster.stale ? '使用最後成功同步的名單 · ' : '最近同步 ') + t;
}
async function photoBlob(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('photo');
  return r.blob();
}

// 揀居民面板（底部彈出，可搜尋）
let sheet, sheetList, sheetSearch, sheetStatus, onPick;
function buildSheet() {
  sheet = document.createElement('div');
  sheet.className = 'qgp-sheet'; sheet.hidden = true;
  sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', '選擇居民');
  sheet.innerHTML = '<div class="qgp-box"><div class="qgp-head"><strong>選擇居民</strong>' +
    '<button type="button" class="qgp-refresh" aria-label="重新整理名冊">↻</button><button type="button" class="qgp-x" aria-label="關閉">×</button></div>' +
    '<input type="search" class="qgp-search" placeholder="搜尋名字或 IG" autocomplete="off" autocapitalize="off" spellcheck="false">' +
    '<div class="qgp-status" role="status"></div><div class="qgp-list" role="listbox"></div></div>';
  document.body.append(sheet);
  sheetList = sheet.querySelector('.qgp-list'); sheetSearch = sheet.querySelector('.qgp-search'); sheetStatus = sheet.querySelector('.qgp-status');
  sheet.querySelector('.qgp-x').onclick = closeSheet;
  sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
  sheet.querySelector('.qgp-refresh').onclick = async () => { sheetStatus.textContent = '重新整理中…'; await loadRoster(true); fill(); };
  sheetSearch.oninput = fill;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });
}
function fill() {
  const q = sheetSearch.value.trim().toLowerCase().replace(/^@/, '');
  const rows = roster.residents.filter(r => !q || r.name.toLowerCase().includes(q) || r.ig.toLowerCase().replace(/^@/, '').includes(q));
  sheetStatus.textContent = syncText() + (q ? `｜${rows.length} 位符合` : `｜共 ${roster.residents.length} 位`);
  sheetList.replaceChildren(...rows.map(r => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'qgp-item'; b.setAttribute('role', 'option');
    const ph = document.createElement(r.photo ? 'img' : 'span'); ph.className = 'qgp-ph';
    if (r.photo) { ph.src = r.photo; ph.alt = ''; ph.loading = 'lazy'; } else ph.textContent = '👤';
    const t = document.createElement('span'); t.className = 'qgp-t';
    const n = document.createElement('b'); n.textContent = r.name || '（未命名）';
    const s = document.createElement('small'); s.textContent = [r.ig, CAT_LABEL[r.category]].filter(Boolean).join(' · ');
    t.append(n, s); b.append(ph, t);
    b.onclick = () => { const fn = onPick; closeSheet(); fn && fn(r); };
    return b;
  }));
  if (!rows.length) {
    const e = document.createElement('div'); e.className = 'qgp-empty';
    e.textContent = roster.residents.length ? '找不到符合的居民' : '暫時沒有名冊資料，仍可自行輸入名字及上載相片';
    sheetList.append(e);
  }
}
function openSheet(cb) {
  if (!sheet) buildSheet();
  onPick = cb; sheetSearch.value = ''; fill();
  sheet.hidden = false; document.body.style.overflow = 'hidden';
  setTimeout(() => sheetSearch.focus({preventScroll:true}), 50);
}
function closeSheet() { sheet.hidden = true; document.body.style.overflow = ''; onPick = null; }

// 每日更表：每位居民一個「👤」按鈕（清單重繪後自動補回）
function mountDaily() {
  const list = $('dyList'); if (!list || !window.qgDaily) return;
  const decorate = () => {
    list.querySelectorAll('.dy-res').forEach(row => {
      if (row.querySelector('.qgp-dy')) return;
      const i = +row.dataset.i;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'small qgp-dy'; b.textContent = '👤';
      b.setAttribute('aria-label', `從名冊選擇居民 ${i + 1}`);
      b.onclick = () => openSheet(async r => {
        const D = window.qgDaily, res = D.state.res[i]; if (!res) return;
        res.name = r.name; res.cat = DAILY_CAT[r.category] || 'resident'; res.ig = r.ig;
        if (r.photo) {
          try { await D.loadPhoto(res, await photoBlob(r.photo)); } catch { $('dyStatus').textContent = '預設相片載入失敗，可以自行選擇相片'; }
        }
        D.renderList(); D.still();
        $('dyStatus').textContent = `已載入 ${r.name}（只影響今次製作）`;
      });
      // 放在名字欄旁邊，不擠壓分類選單
      const name = row.querySelector('.dy-mid input[type=text]');
      const wrap = document.createElement('div'); wrap.className = 'qgp-dyrow';
      name.replaceWith(wrap); wrap.append(name, b);
    });
  };
  new MutationObserver(decorate).observe(list, {childList:true});
  decorate();
}

// ---------- 啟動 ----------
function boot() {
  mountDaily();
  loadRoster(false);
  // 包住 qgWorkflow.finish：每週／每日更表下載成功後彈出文案
  const wf = window.qgWorkflow;
  if (wf && !wf.__qgPresets) {
    const orig = wf.finish;
    wf.finish = (template, ok, label) => { orig(template, ok, label); if (ok) try { afterDownload(template, label); } catch {} };
    wf.__qgPresets = true;
  }
  // 每日更表：開始前套用版型、字體及預設時間
  const D = window.qgDaily;
  if (D && !D.__qgPresets) {
    const start = D.start;
    D.start = () => { applyDaily(); start(); liveBaseline(); };
    D.__qgPresets = true;
  }
  ready.then(() => {
    for (const p of ['promo', 'shadow', 'weekly']) try { applyCard(p); } catch {}
    liveBaseline();
    if (previewDraft) showPreviewBanner();
  });
}
function showPreviewBanner() {
  const b = document.createElement('div'); b.className = 'qgp-preview';
  b.textContent = version === 'draft' ? '預覽模式：正在使用管理員草稿（只在此瀏覽器，不影響公開網站）' : '預覽模式：未能載入草稿，正在使用正式設定';
  document.body.prepend(b);
}

window.qgPresets = {ready, assetUrl, extendFonts, copyFor, renderTemplate:render, loadRoster, get config() { return config; }, get version() { return version; }};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
})();
