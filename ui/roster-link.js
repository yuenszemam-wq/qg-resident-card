// 連結 QG 異世界居民報更系統（排更結果）：
// - 每日更表：自動整理當日當值居民（名字、IG、分類、相片；相片優先用居民自行上傳，否則用管理中心設定的照片）
// - 每週更表：按排更產生《異世界居民出沒啟示錄》每週文案
// - QG 月曆：按排更產生《居民召喚月曆》文案，並可把活動日加入皇冠
// - 限定宣傳／影子精靈：從排更選擇未宣傳的居民，自動填入相片、名字、IG 及日期；下載／複製文案後可設為「已宣傳」
// 排更資料經 /api/admin/roster 讀取（需要先登入管理中心），不會公開。不改動任何繪圖引擎。
(function () {
'use strict';
const $ = id => document.getElementById(id);
const API = '/api/admin/roster';

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') el.textContent = v;
    else if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach(c => c != null && el.append(c));
  return el;
}

async function api(path, body) {
  const init = { credentials: 'same-origin', headers: {} };
  if (body !== undefined) {
    init.method = 'POST'; init.headers['Content-Type'] = 'application/json'; init.headers['X-QG-Admin'] = '1'; init.body = JSON.stringify(body);
  }
  const res = await fetch(path, init);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error((data && data.message) || `讀取失敗（${res.status}）`); err.status = res.status; throw err;
  }
  return data;
}
const loginHint = err => err.status === 401 ? '要先登入管理中心先可以讀取排更（⚙️ 管理中心 → 登入後返回再試）' : (err.message || '未能讀取排更');

// ---------- 日期及文字格式 ----------
const pad = n => String(n).padStart(2, '0');
function hkToday() {
  const p = new Intl.DateTimeFormat('en', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Hong_Kong' }).formatToParts(new Date());
  const g = t => p.find(x => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
function addDays(date, n) { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fraktur = t => [...t].map(c => {
  const n = c.charCodeAt(0);
  if (n >= 65 && n <= 90) return String.fromCodePoint(0x1D56C + n - 65);
  if (n >= 97 && n <= 122) return String.fromCodePoint(0x1D586 + n - 97);
  return c;
}).join('');
const dowOf = date => DOW[new Date(date + 'T12:00:00Z').getUTCDay()];
const dm = date => `${+date.slice(8)} / ${+date.slice(5, 7)}`;
const cnDate = date => `${+date.slice(5, 7)}月${+date.slice(8)}日（星期${'日一二三四五六'[new Date(date + 'T12:00:00Z').getUTCDay()]}）`;
/** 18:00 → 6:00pm */
function clock(v) { const m = /^(\d{1,2}):(\d{2})$/.exec(v || ''); if (!m) return ''; const hh = +m[1]; return `${hh % 12 || 12}:${m[2]}${hh < 12 ? 'am' : 'pm'}`; }
/** 18:00–22:00 → 6-10 PM（分鐘不是 00 時保留） */
function shortRange(s, e) {
  const one = v => { const m = /^(\d{1,2}):(\d{2})$/.exec(v || ''); if (!m) return ''; const hh = +m[1] % 12 || 12; return m[2] === '00' ? String(hh) : `${hh}:${m[2]}`; };
  const a = one(s), b = one(e);
  return a && b ? `${a}-${b} PM` : '';
}
const GROUPS = [['常駐', '⚜', '出沒居民'], ['限定', '♦️', '限定居民'], ['影子', '♣️', '影子精靈'], ['試工', '🔰', '試煉者']];
const withIg = a => a.name + (a.ig ? ' ' + a.ig : '');

// ---------- 讀取排更（同一範圍 60 秒內重用） ----------
const cache = new Map();
async function roster(from, to, force) {
  const key = from + '|' + to, hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < 60000) return hit.data;
  const data = await api(`${API}?from=${from}&to=${to}`);
  cache.set(key, { at: Date.now(), data });
  return data;
}
const byDate = (data, date) => data.assignments.filter(a => a.date === date);

// ---------- 文案 ----------
const WEEKLY_FOOT = `🌙 Queen’s Garden｜異世界開放時間
星期一至日
6:00pm ─ 10:00pm

✦ 全新餐單已經登場
✦ 日常最低消費套餐更新為$88魔力（包含永恆回憶卷軸及 精靈秘藥）
✦ 魔法道具買10送1買20送4
✦ 最低消費為一個套餐
✦ 開放時間或因異世界狀態變動，請以《異世界居民出沒啟示錄》為準

📜 卷軸收集獎賞
🎀 即日起，只要同一天內
將 5 張魔法卷軸交予同一位異世界居民，即可免費獲贈該居民手機合照 2 張 🎀

✦✧✦✧✦✧✦✧✦✧✦✧✦

📍 Queen’s Garden｜異世界入口
旺角・西洋菜街 遠景大廈 3 樓 H2 室
（歡迎 Walk-in）`;

function weeklyText(data, from, to) {
  const blocks = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const day = data.days.find(x => x.date === d) || { start: '18:00', end: '22:00', event: '' };
    const list = byDate(data, d);
    const lines = [`🗓 ${dm(d)} ${fraktur(dowOf(d))}`];
    if (day.event) lines.push(`🎀 ${day.event} 🎀`);
    lines.push(`⏰ ${clock(day.start)} ─ ${clock(day.end)}`);
    if (!list.length) lines.push('⚠️ 名單待公布');
    for (const [kind, sym, title] of GROUPS) {
      const rows = list.filter(a => a.kind === kind);
      if (!rows.length) continue;
      lines.push(`${sym} ${title}`, ...rows.map(a => `${sym} ${withIg(a)}`));
    }
    lines.push('⋆ ─ ─ ─ ─ ─ ─ ─ ⋆');
    blocks.push(lines.join('\n'));
  }
  return `～
✦✧✦✧✦✧✦✧✦✧✦
🌹 Queen’s Garden 🌹
🔱 《異世界居民出沒啟示錄》 🔱
✦✧✦✧✦✧✦✧✦✧✦

${blocks.join('\n\n')}

${WEEKLY_FOOT}`;
}

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function calendarText(data, month) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const events = data.days.filter(d => d.event);
  const out = [`🕰️《居民召喚月曆｜${MONTHS_EN[m - 1]} ${y}》🕰️`, ''];
  if (events.length) {
    out.push('🎀 特別活動日 🎀', ...events.map(d => `${dm(d.date)} ${fraktur(dowOf(d.date))}｜${d.event}`), '', '⋆ ─ ─ ─ ─ ─ ─ ─ ⋆', '');
  }
  for (let i = 1; i <= last; i++) {
    const date = `${month}-${pad(i)}`;
    const day = data.days.find(x => x.date === date) || { start: '18:00', end: '22:00', event: '' };
    const list = byDate(data, date);
    const lines = [`🗓 ${dm(date)} ${fraktur(dowOf(date))}｜🕰️${shortRange(day.start, day.end)}`];
    if (day.event) lines.push(`🎀 ${day.event} 🎀`);
    if (!list.length) lines.push('⚠️ 名單待公布');
    for (const [kind, sym] of GROUPS) {
      const rows = list.filter(a => a.kind === kind);
      if (rows.length) lines.push(`${sym} ${rows.map(a => a.name).join('｜')}`);
    }
    out.push(lines.join('\n'), '');
  }
  out.push('⋆ ─ ─ ─ ─ ─ ─ ─ ⋆', '', '📍 旺角・西洋菜街 遠景大廈 3F H2室', '✦ 最低消費為一個套餐 $88 起', '⚠ 部份日子為特殊開放時間，請留意公告');
  return out.join('\n');
}

// ---------- 共用：面板 ----------
function panel(id, title, ...kids) {
  return h('div', { class: 'panel qgr-panel', id }, h('div', { class: 'qgr-title', text: title }), ...kids);
}
function status(el, text, err) { el.textContent = text || ''; el.classList.toggle('err', !!err); }

// ================= 每日更表 =================
const DAILY_CAT = { 常駐: 'resident', 限定: 'limited', 影子: 'shadow', 試工: 'trial' };
let dailyAuto = false;      // 目前的居民是否由排更自動載入（是的話換日期會自動重新載入）
let dailyLoading = 0;
function mountDaily() {
  const tab = $('tab-daily'), D = window.qgDaily; if (!tab || !D) return;
  const msg = h('div', { class: 'qgr-msg', role: 'status' });
  const btn = h('button', { type: 'button', class: 'btn primary qgr-btn', text: '🗓 從排更載入當日居民' });
  const anchor = $('dyDate').closest('.panel');
  anchor.after(panel('qgrDaily', '排更系統', h('p', { class: 'qgr-note', text: '選擇日期後會自動整理當日當值居民（名字、IG、分類及相片）。相片優先使用居民自行上傳的宣傳照片，沒有就用管理中心設定的照片。' }), btn, msg));
  btn.onclick = () => loadDaily(true);
  const hasData = () => D.state.res.slice(0, D.state.count).some(r => r.name || r.photo);
  $('dyDate').addEventListener('change', () => { if (dailyAuto || !hasData()) loadDaily(false); });
  // 手動修改居民之後不再自動覆蓋
  $('dyList').addEventListener('input', () => { dailyAuto = false; });

  async function loadDaily(manual) {
    const date = $('dyDate').value; if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    if (manual && hasData() && !dailyAuto && !confirm('載入排更會取代目前填寫的居民資料，確定？')) return;
    const token = ++dailyLoading;
    btn.disabled = true; status(msg, '讀取排更中…');
    try {
      const data = await roster(date, date, manual);
      if (token !== dailyLoading) return;
      const list = byDate(data, date), day = data.days[0];
      if (day) {
        $('dyStart').value = day.start; $('dyEnd').value = day.end;
        $('dyStart').dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (!list.length) { status(msg, `${cnDate(date)}排更未有已安排居民`, true); return; }
      const use = list.slice(0, 6);
      D.setCount(use.length, `已按排更載入 ${use.length} 位居民`);
      let photos = 0, missing = [];
      await Promise.all(use.map(async (a, i) => {
        const r = D.state.res[i];
        r.name = a.name; r.ig = a.ig || ''; r.cat = DAILY_CAT[a.kind] || 'resident';
        r.photo = null; r.photoBlob = null; r.zoom = 1; r.px = 0; r.py = 0;
        if (a.photo) {
          try {
            const res = await fetch(a.photo, { credentials: 'same-origin' });
            if (!res.ok) throw new Error();
            await D.loadPhoto(r, await res.blob()); photos++;
          } catch { missing.push(a.name); }
        } else missing.push(a.name);
      }));
      if (token !== dailyLoading) return;
      dailyAuto = true;
      D.renderList(); D.still();
      const extra = list.length > 6 ? `；當日共 ${list.length} 位，只載入前 6 位` : '';
      status(msg, `已載入 ${cnDate(date)} ${use.length} 位居民，相片 ${photos}/${use.length}${missing.length ? '（未有相片：' + missing.join('、') + '，請自行選擇）' : ''}${extra}`, !!missing.length || list.length > 6);
    } catch (err) { status(msg, loginHint(err), true); }
    finally { if (token === dailyLoading) btn.disabled = false; }
  }
  // 第一次打開每日更表時自動載入
  const start = D.start;
  D.start = (...args) => { const r = start.apply(D, args); setTimeout(() => { if (!hasData()) loadDaily(false); }, 0); return r; };
}

// ================= 每週更表 =================
function mountWeekly() {
  const tab = $('tab-weekly'); if (!tab) return;
  const msg = h('div', { class: 'qgr-msg', role: 'status' });
  const btn = h('button', { type: 'button', class: 'btn primary qgr-btn', text: '📋 按排更產生每週文案' });
  $('wkOut').closest('.panel').after(panel('qgrWeekly', '排更系統', h('p', { class: 'qgr-note', text: '按開始至結束日期的排更產生《異世界居民出沒啟示錄》文案；下載圖片或影片後亦會自動彈出。' }), btn, msg));
  btn.onclick = () => showWeekly(true);
  async function showWeekly(force) {
    const from = $('wkStart').value, to = $('wkEnd').value;
    if (!from || !to || to < from) { status(msg, '請先選擇開始及結束日期', true); return false; }
    btn.disabled = true; status(msg, '讀取排更中…');
    try {
      const data = await roster(from, to, force);
      window.qgShowCopy('weekly', weeklyText(data, from, to));
      status(msg, `已產生 ${dm(from)} – ${dm(to)} 文案（${data.assignments.length} 個當值）`);
      return true;
    } catch (err) { status(msg, loginHint(err), true); return false; }
    finally { btn.disabled = false; }
  }
  return showWeekly;
}

// ================= QG 月曆 =================
function mountCalendar() {
  const tab = $('tab-calendar'); if (!tab) return;
  const msg = h('div', { class: 'qgr-msg', role: 'status' });
  const gen = h('button', { type: 'button', class: 'btn primary qgr-btn', text: '📜 按排更產生月曆文案' });
  const crowns = h('button', { type: 'button', class: 'btn qgr-btn', text: '👑 把排更活動日加入皇冠' });
  $('cal-save').before(panel('qgrCalendar', '排更系統', h('p', { class: 'qgr-note', text: '按所選年月的排更產生《居民召喚月曆》文案（特別活動日、每日時間及居民）。' }), h('div', { class: 'qgr-row' }, gen, crowns), msg));
  const month = () => `${$('cal-year').value}-${pad($('cal-month').value)}`;
  async function load(force) {
    const mo = month(); if (!/^\d{4}-\d{2}$/.test(mo)) throw new Error('請選擇年月');
    const [y, m] = mo.split('-').map(Number);
    return roster(`${mo}-01`, `${mo}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`, force);
  }
  gen.onclick = async () => {
    gen.disabled = true; status(msg, '讀取排更中…');
    try { const data = await load(true); window.qgShowCopy('calendar', calendarText(data, month())); status(msg, `已產生 ${month()} 月曆文案`); }
    catch (err) { status(msg, loginHint(err), true); }
    finally { gen.disabled = false; }
  };
  crowns.onclick = async () => {
    crowns.disabled = true;
    try {
      const data = await load(false), mo = month();
      const days = data.days.filter(d => d.event).map(d => +d.date.slice(8));
      if (!days.length) { status(msg, '此月份排更未有活動日', true); return; }
      const key = 'qg.calendar.crowns.v1';
      let rec = {}; try { rec = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch {}
      rec[mo] = [...new Set([...(rec[mo] || []), ...days])].sort((a, b) => a - b);
      localStorage.setItem(key, JSON.stringify(rec));
      $('cal-month').dispatchEvent(new Event('change', { bubbles: true }));
      status(msg, `已加入 ${days.length} 個活動日皇冠：${days.join('、')} 日`);
    } catch (err) { status(msg, loginHint(err), true); }
    finally { crowns.disabled = false; }
  };
}

// ================= 限定宣傳／影子精靈 =================
const PROMO_PAGES = {
  promo: { tab: 'tab-promo', kind: '限定', label: '限定居民', name: 'name', ig: 'ig', date: 'date', photo: 'photo', status: 'status' },
  shadow: { tab: 'tab-shadow', kind: '影子', label: '影子精靈', name: 'sh-name', ig: 'sh-ig', date: 'sh-date', photo: 'sh-photo', status: 'sh-status' },
};
const picked = {};      // page → 已選的排更（assignment）
let sheet, sheetList, sheetMsg, showDone, sheetPage;

function buildSheet() {
  showDone = h('input', { type: 'checkbox', id: 'qgrShowDone' });
  sheetList = h('div', { class: 'qgp-list', role: 'listbox' });
  sheetMsg = h('div', { class: 'qgp-status', role: 'status' });
  const close = h('button', { type: 'button', class: 'qgp-x', 'aria-label': '關閉', text: '×', onclick: () => hideSheet() });
  const refresh = h('button', { type: 'button', 'aria-label': '重新讀取', text: '↻', onclick: () => fill(true) });
  sheet = h('div', { class: 'qgp-sheet', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-label': '從排更選擇' },
    h('div', { class: 'qgp-box' },
      h('div', { class: 'qgp-head' }, h('strong', { id: 'qgrSheetTitle', text: '從排更選擇' }), refresh, close),
      h('label', { class: 'qgr-check', for: 'qgrShowDone' }, showDone, h('span', { text: '顯示已宣傳' })),
      sheetMsg, sheetList));
  showDone.onchange = () => fill(false);
  sheet.addEventListener('click', e => { if (e.target === sheet) hideSheet(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet && !sheet.hidden) hideSheet(); });
  document.body.append(sheet);
}
function hideSheet() { sheet.hidden = true; document.body.style.overflow = ''; }
function openSheet(page) {
  if (!sheet) buildSheet();
  sheetPage = page;
  $('qgrSheetTitle').textContent = `從排更選擇${PROMO_PAGES[page].label}`;
  sheet.hidden = false; document.body.style.overflow = 'hidden';
  fill(false);
}
async function fill(force) {
  const cfg = PROMO_PAGES[sheetPage], today = hkToday();
  sheetMsg.textContent = '讀取排更中…'; sheetList.replaceChildren();
  try {
    const data = await roster(today, addDays(today, 60), force);
    const all = data.assignments.filter(a => a.kind === cfg.kind);
    const list = all.filter(a => showDone.checked || !a.promotedAt);
    sheetMsg.textContent = `今日起 60 日內：${cfg.label} ${all.length} 位，未宣傳 ${all.filter(a => !a.promotedAt).length} 位`;
    if (!list.length) sheetList.append(h('div', { class: 'qgp-empty', text: all.length ? '全部已宣傳 🎉（可勾選「顯示已宣傳」）' : `未有已安排的${cfg.label}` }));
    for (const a of list) {
      const ph = a.photo ? h('img', { class: 'qgp-ph', src: a.photo, alt: '', loading: 'lazy' }) : h('span', { class: 'qgp-ph', text: '👤' });
      sheetList.append(h('button', { type: 'button', class: 'qgp-item' + (a.promotedAt ? ' qgr-done' : ''), role: 'option', onclick: () => { hideSheet(); pick(sheetPage, a); } },
        ph, h('span', { class: 'qgp-t' }, h('b', { text: `${cnDate(a.date)} ${a.name}` }),
          h('small', { text: [a.ig, a.start && a.end ? `${a.start}–${a.end}` : '', a.promotedAt ? '✓ 已宣傳' : '未宣傳', a.photo ? '' : '未有相片'].filter(Boolean).join(' · ') }))));
    }
  } catch (err) { sheetMsg.textContent = loginHint(err); }
}
function setField(id, value) {
  const el = $(id); if (!el) return;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
async function pick(page, a) {
  const cfg = PROMO_PAGES[page], bar = $('qgr-' + page);
  setField(cfg.name, a.name); setField(cfg.ig, a.ig || ''); setField(cfg.date, a.date);
  picked[page] = a;
  renderBar(page, a.photo ? '載入相片中…' : '此居民未有宣傳照片，請自行選擇相片');
  if (a.photo) {
    try {
      const res = await fetch(a.photo, { credentials: 'same-origin' });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const dt = new DataTransfer();
      dt.items.add(new File([blob], `${a.name}.jpg`, { type: blob.type || 'image/jpeg' }));
      const input = $(cfg.photo); input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      renderBar(page, '已自動填入相片、名字、IG 及日期');
    } catch { renderBar(page, '相片載入失敗，請自行選擇相片'); }
  }
  bar && bar.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function renderBar(page, note) {
  const box = $('qgr-' + page); if (!box) return;
  const a = picked[page];
  const info = box.querySelector('.qgr-picked'), btn = box.querySelector('.qgr-mark');
  if (!a) { info.textContent = ''; btn.hidden = true; return; }
  info.textContent = `已選：${cnDate(a.date)} ${a.name} ${a.ig || ''}${a.promotedAt ? '（已宣傳）' : ''}${note ? ' · ' + note : ''}`;
  btn.hidden = false; btn.textContent = a.promotedAt ? '↩ 改為未宣傳' : '✓ 設為已宣傳';
}
async function markPromoted(page, promoted) {
  const a = picked[page]; if (!a) return false;
  try {
    const r = await api(`${API}/promo`, { assignmentId: a.id, promoted });
    a.promotedAt = r.promotedAt || null;
    cache.clear();
    renderBar(page, promoted ? '已設為已宣傳，之後不會在選擇清單出現' : '已改為未宣傳');
    return true;
  } catch (err) { renderBar(page, loginHint(err)); return false; }
}
function mountPromo(page) {
  const cfg = PROMO_PAGES[page], tab = $(cfg.tab); if (!tab) return;
  const choose = h('button', { type: 'button', class: 'btn primary qgr-btn', text: `🗓 從排更選擇${cfg.label}`, onclick: () => openSheet(page) });
  const mark = h('button', { type: 'button', class: 'btn qgr-mark', hidden: true, onclick: () => markPromoted(page, !picked[page].promotedAt) });
  const box = panel('qgr-' + page, '排更系統', h('p', { class: 'qgr-note', text: `選擇未宣傳的${cfg.label}，會自動填入相片、名字、IG 及當值日期。下載後在文案視窗按「設為已宣傳」，之後就不會再出現在清單。` }),
    h('div', { class: 'qgr-row' }, choose, mark), h('div', { class: 'qgr-picked qgr-msg', role: 'status' }));
  const fields = tab.querySelector('.qg-fields');
  fields.before(box);
  // 手動改名字或日期後，不再視為同一筆排更
  [cfg.name, cfg.date].forEach(id => $(id).addEventListener('input', e => {
    const a = picked[page]; if (!a || !e.isTrusted) return;
    const same = $(cfg.name).value.trim() === a.name && $(cfg.date).value === a.date;
    if (!same) { picked[page] = null; renderBar(page); }
  }));
}
// 文案視窗：加入「設為已宣傳」
function mountCopyButton() {
  const modal = $('promo'); if (!modal) return;
  const btn = h('button', { type: 'button', class: 'btn qgr-modal-mark', hidden: true });
  const msg = h('div', { class: 'qgr-msg' });
  (modal.querySelector('.sheet-foot') || modal.querySelector('.sheet')).append(btn, msg);
  const sync = () => {
    const page = modal.dataset.page, a = PROMO_PAGES[page] && picked[page];
    btn.hidden = !a || modal.hidden; msg.textContent = '';
    if (a) btn.textContent = a.promotedAt ? `✓ ${a.name} 已宣傳` : `✓ 設為已宣傳（${a.name} ${dm(a.date)}）`;
    btn.disabled = !!(a && a.promotedAt);
  };
  btn.onclick = async () => {
    const page = modal.dataset.page; btn.disabled = true;
    const ok = await markPromoted(page, true);
    msg.textContent = ok ? '已設為已宣傳，製作清單之後會隱藏此居民' : '未能更新，請先登入管理中心';
    sync(); if (!ok) btn.disabled = false;
  };
  new MutationObserver(sync).observe(modal, { attributes: true, attributeFilter: ['hidden', 'data-page'] });
}

// ---------- 啟動 ----------
function boot() {
  try { mountDaily(); } catch (e) { console.error(e); }
  let showWeekly = null;
  try { showWeekly = mountWeekly(); } catch (e) { console.error(e); }
  try { mountCalendar(); } catch (e) { console.error(e); }
  for (const p of Object.keys(PROMO_PAGES)) try { mountPromo(p); } catch (e) { console.error(e); }
  try { mountCopyButton(); } catch (e) { console.error(e); }
  // 每週更表下載成功後自動彈出排更文案
  const wf = window.qgWorkflow;
  if (wf && !wf.__qgRoster && showWeekly) {
    const orig = wf.finish;
    wf.finish = (template, ok, label) => {
      orig(template, ok, label);
      if (ok && template === 'weekly' && /圖片已準備好|影片已完成並儲存|影片已儲存/.test(label || '')) setTimeout(() => showWeekly(false), 50);
    };
    wf.__qgRoster = true;
  }
}
window.qgRosterLink = { weeklyText, calendarText, shortRange, clock };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0)); else setTimeout(boot, 0);
})();
