// Site-wide published settings: schema, defaults and validation.
// Text presets are offsets on top of each maker's built-in values (the same
// size/sp/dx/dy model the existing editors use), so drawing engines stay intact.
import { HttpError } from './http.js';

export const SCHEMA_VERSION = 1;
export const KEEP_VERSIONS = 10;

export const PAGES = {
  promo: { label: '限定宣傳', text: ['name', 'ig', 'date'] },
  shadow: { label: '影子精靈', text: ['name', 'ig', 'date'] },
  weekly: { label: '每週更表', text: ['date'] },
  daily: { label: '每日更表', text: ['date', 'time', 'name'] },
  calendar: { label: 'QG 月曆', text: [] },
};

// Replaceable image slots. Keys match what each maker passes to loadImg().
export const ASSET_SLOTS = {
  ...Object.fromEntries(['bg', 'lace', 'crown', 'bow', 'keyR', 'keyL', 'pearl', 'lm', 'qg'].map(k => [`promo/${k}`, '限定宣傳'])),
  ...Object.fromEntries(['background.jpg', ...[1, 2, 3, 4, 5, 6, 7, 8].map(n => `${n}.webp`)].map(k => [`shadow/${k}`, '影子精靈'])),
  ...Object.fromEntries(['bg.jpg', 'lace.webp', 'pearl.webp', 'emblem.webp', 'keyL.webp', 'keyR.webp', 'ribbon.webp', 'crown.webp', 'qg.webp', 'yisj.webp']
    .map(k => [`weekly/${k}`, '每週更表'])),
  ...Object.fromEntries(['bg.jpg', 'title.webp', 'qg.webp', 'bow.webp', 'keyL.webp', 'keyR.webp', 'sparkL.webp', 'sparkR.webp', 'ribbon.webp',
    'banner.webp', 'tagLimited.webp', 'tagShadow.webp', 'tagTrial.webp'].map(k => [`daily/${k}`, '每日更表'])),
  ...Object.fromEntries(['promo-bg.jpg', 'shadow-bg.jpg', 'weekly-bg.jpg', 'daily-bg.jpg'].map(k => [`video/${k}`, '影片背景'])),
};

export const COPY_FIELDS = ['NAME', 'IG', 'DATE', 'TIME', 'CATEGORY', 'RESIDENT_LIST', 'START_DATE', 'END_DATE'];

// Migrated verbatim from index.html promoText() and shadow/editor.js caption().
const PROMO_COPY = [
  '🔮《異世界一日限定降臨》🔮',
  '𝑶𝒏𝒆-𝑫𝒂𝒚 𝑳𝒊𝒎𝒊𝒕𝒆𝒅 𝑹𝒆𝒔𝒊𝒅𝒆𝒏𝒕',
  '女王之門傳來短暫的魔力波動——',
  '1位來自異界的限定居民將於 𝑸𝒖𝒆𝒆𝒏’𝒔 𝑮𝒂𝒓𝒅𝒆𝒏 現身。',
  '✧༺━━━━━━━━━━━━━━༻✧',
  '📜 降臨日期｜{{DATE}}',
  '👑 限定居民｜{{NAME}} {{IG}}',
  '✧༺━━━━━━━━━━━━━━༻✧',
  '✦✧✦✧✦✧✦✧✦✧✦✧✦',
  '🌙 Queen’s Garden｜異世界開放時間',
  '星期一至日',
  '6:00pm ─ 10:00pm',
  '✦ 最低消費為一個套餐',
  '✦ 開放時間或因異世界狀態變動，請以《異世界居民出沒啟示錄》為準',
  '✦✧✦✧✦✧✦✧✦✧✦',
  '📍 Queen’s Garden｜異世界入口',
  '旺角・西洋菜街 遠景大廈 3 樓 H2 室',
  '（歡迎 Walk-in）',
  '⚠️ 冒險者注意事項',
  '由於空間結構不穩，女王之門於特定日子可能無法通往異世界。',
  '實際開放狀態請留意最新冒險公告。',
  '✨ 如希望確保順利進入異世界，',
  '歡迎 DM 預約 🫶🏻',
  '✦✧✦✧✦✧✦✧✦✧✦✧✦',
].join('\n');

const SHADOW_COPY = `～
🌙✦ 影子精靈出沒中 ✦🌙

傳說中，只有在夜幕降臨後——
異世界的「影子精靈」才會悄悄現身於庭園之中。

她們會躲在燈火後方、花叢之間，偷偷觀察每一位踏入 Queen’s Garden 的旅人。🕯️

✧༺━━━━━━━━━━━━━━༻✧
⌛️ 出沒日期｜{{DATE}}
🧚 影子精靈｜{{NAME}} {{IG}}
✧༺━━━━━━━━━━━━━━༻✧

🌙 Queen’s Garden｜異世界開放時間
星期一至日
6:00pm ─ 10:00pm

✦ 最低消費為一個套餐
✦ 開放時間或因異世界狀態變動，請以《異世界居民出沒啟示錄》為準

✦✧✦✧✦✧✦✧✦✧✦✧✦

📍 Queen’s Garden｜異世界入口
旺角・西洋菜街 遠景大廈 3 樓 H2 室
（歡迎 Walk-in）

⚠️ 冒險者注意事項
由於空間結構不穩，女王之門於特定日子可能無法通往異世界。
實際開放狀態請留意最新冒險公告。

✨ 如希望確保順利進入異世界，
歡迎 DM 預約 🫶🏻

✦✧✦✧✦✧✦✧✦✧✦✧✦`;

const WEEKLY_COPY = `👑 Queen’s Garden 每週更表 👑
📅 {{START_DATE}} ～ {{END_DATE}}

🌙 異世界開放時間
{{TIME}}

📍 旺角・西洋菜街 遠景大廈 3 樓 H2 室
歡迎 DM 預約 🫶🏻`;

// Phase 5 初版的每日文案預設（未啟用）；仍是這個預設的設定會自動升級為新版文案
const LEGACY_DAILY_COPY = `✧ 異世界居民每日出沒啟示錄 ✧
📜 {{DATE}}
🌙 {{TIME}}

{{RESIDENT_LIST}}

📍 旺角・西洋菜街 遠景大廈 3 樓 H2 室
歡迎 DM 預約 🫶🏻`;

// {{DATE}} = 13 / 7 𝕸𝖔𝖓；{{RESIDENT_LIST}} 按分類分組（⚜ 出沒居民、♦️ 限定居民、♣️ 影子精靈、🔰 試煉者），沒有的分類不顯示
const DAILY_COPY = `~
🕯️ 異世界居民每日出沒啟示錄 🕯️

🗓 {{DATE}}
⏰ {{TIME}}
{{RESIDENT_LIST}}

✦ 全新菜單已經登場 ，快來一起冒險吧！✦
✦ 最低消費為一個日常套餐 $88 魔力✦
✦ 出沒居民以當日實際情況為準 ✦

📍 Queen’s Garden｜異世界入口
旺角・西洋菜街 遠景大廈 3 樓 H2 室
（歡迎 Walk-in）`;

/** 把仍使用舊預設的設定升級（只改未經管理員修改的部分）。 */
export function upgradeConfig(body) {
  const d = body && body.copy && body.copy.daily;
  if (d && !d.enabled && d.template === LEGACY_DAILY_COPY) body.copy.daily = { enabled: true, template: DAILY_COPY };
  return body;
}

export function defaultConfig() {
  return {
    schema: SCHEMA_VERSION,
    fonts: [],
    pages: {
      promo: { text: {} },
      shadow: { text: {} },
      weekly: { text: {} },
      daily: { text: {}, layouts: {}, times: { start: '18:00', end: '22:00' } },
      calendar: { text: {} },
    },
    assets: {},
    copy: {
      promo: { enabled: true, template: PROMO_COPY },
      shadow: { enabled: true, template: SHADOW_COPY },
      weekly: { enabled: false, template: WEEKLY_COPY },
      daily: { enabled: true, template: DAILY_COPY },
      calendar: { enabled: false, template: '' },
    },
    general: { openTime: '6:00pm ─ 10:00pm' },
  };
}

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const fail = msg => { throw new HttpError(422, 'invalid_config', msg); };
const num = (v, lo, hi, path) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) fail(`${path} 必須是 ${lo} 至 ${hi} 之間的數字`);
  return Math.round(v * 100) / 100;
};
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const TEXT_FIELDS = { size: [-60, 80], sp: [-30, 80], dx: [-400, 400], dy: [-400, 400] };

/**
 * Validate and normalise a config body. `ctx.assetKinds` maps asset_id → kind
 * for every asset that exists, so references can be checked.
 */
export function validateConfig(body, ctx = { assetKinds: new Map() }) {
  if (!isObj(body)) fail('設定格式錯誤');
  if (body.schema !== SCHEMA_VERSION) fail('設定版本不符');
  const out = defaultConfig();
  out.copy = {};

  // Fonts: uploaded, licensed font files.
  if (!Array.isArray(body.fonts) || body.fonts.length > 40) fail('fonts 格式錯誤');
  const fontIds = new Set();
  out.fonts = body.fonts.map((f, i) => {
    if (!isObj(f)) fail(`fonts[${i}] 格式錯誤`);
    if (!ID_RE.test(f.id || '') || !String(f.id).startsWith('c_')) fail(`fonts[${i}].id 無效`);
    if (fontIds.has(f.id)) fail(`字體 id 重複：${f.id}`);
    fontIds.add(f.id);
    if (ctx.assetKinds.get(f.assetId) !== 'font') fail(`字體檔不存在：${f.label || f.id}`);
    const family = String(f.family || '').trim();
    if (!/^[A-Za-z0-9 _-]{1,40}$/.test(family)) fail(`fonts[${i}].family 只可用英文、數字、空格`);
    const roles = Array.isArray(f.roles) ? f.roles.filter(r => r === 'name' || r === 'hand') : [];
    if (!roles.length) fail(`字體「${f.label || family}」最少要選一個用途`);
    if (!f.license || f.license.confirmed !== true || !String(f.license.name || '').trim()) {
      fail(`字體「${f.label || family}」必須填寫授權並確認可網頁嵌入及圖片輸出`);
    }
    return {
      id: f.id, family, label: String(f.label || family).slice(0, 40), assetId: f.assetId,
      weight: [100, 200, 300, 400, 500, 600, 700, 800, 900].includes(f.weight) ? f.weight : 400,
      roles,
      fallback: String(f.fallback || '').replace(/[^A-Za-z0-9 ,"'_-]/g, '').slice(0, 120),
      license: { name: String(f.license.name).slice(0, 80), source: String(f.license.source || '').slice(0, 200), confirmed: true },
    };
  });

  // Page presets.
  if (!isObj(body.pages)) fail('pages 格式錯誤');
  for (const [page, def] of Object.entries(PAGES)) {
    const src = isObj(body.pages[page]) ? body.pages[page] : {};
    const text = {};
    for (const [key, v] of Object.entries(isObj(src.text) ? src.text : {})) {
      if (!def.text.includes(key)) fail(`${page}.text.${key} 不是有效的文字區塊`);
      if (!isObj(v)) fail(`${page}.text.${key} 格式錯誤`);
      const t = {};
      if (v.font != null) {
        if (!ID_RE.test(String(v.font))) fail(`${page}.text.${key}.font 無效`);
        if (String(v.font).startsWith('c_') && !fontIds.has(v.font)) fail(`${page}.text.${key} 使用的字體不存在`);
        t.font = String(v.font);
      }
      for (const [f, [lo, hi]] of Object.entries(TEXT_FIELDS)) if (v[f] != null) t[f] = num(v[f], lo, hi, `${page}.text.${key}.${f}`);
      text[key] = t;
    }
    out.pages[page] = { text };
    if (page === 'daily') {
      const layouts = {};
      for (const [n, l] of Object.entries(isObj(src.layouts) ? src.layouts : {})) {
        const count = Number(n);
        if (!Number.isInteger(count) || count < 1 || count > 6) fail(`daily.layouts.${n} 人數無效`);
        if (!isObj(l) || !Array.isArray(l.c) || l.c.length !== count) fail(`${count} 人版型需要 ${count} 個相框位置`);
        layouts[count] = {
          k: num(l.k, 0.5, 2, `daily.layouts.${count}.k`),
          c: l.c.map((p, i) => {
            if (!Array.isArray(p) || p.length !== 2) fail(`daily.layouts.${count}.c[${i}] 格式錯誤`);
            return [num(p[0], 0, 1012, `相框 ${i + 1} X`), num(p[1], 0, 1350, `相框 ${i + 1} Y`)];
          }),
        };
      }
      const times = isObj(src.times) ? src.times : {};
      const start = times.start ?? '18:00', end = times.end ?? '22:00';
      if (!TIME_RE.test(start) || !TIME_RE.test(end)) fail('預設開放時間格式應為 HH:MM');
      out.pages.daily = { text, layouts, times: { start, end } };
    }
    if (page === 'calendar' && src.cal != null) out.pages.calendar = { text, cal: validateCalendar(src.cal) };
  }

  // Asset replacements.
  if (!isObj(body.assets)) fail('assets 格式錯誤');
  out.assets = {};
  for (const [slot, id] of Object.entries(body.assets)) {
    if (!ASSET_SLOTS[slot]) fail(`未知的素材位置：${slot}`);
    if (id == null || id === '') continue;
    if (ctx.assetKinds.get(id) !== 'image') fail(`素材不存在：${slot}`);
    out.assets[slot] = id;
  }

  // Copy templates (plain text only; rendering is textContent on the client).
  if (!isObj(body.copy)) fail('copy 格式錯誤');
  for (const page of Object.keys(PAGES)) {
    const c = isObj(body.copy[page]) ? body.copy[page] : { enabled: false, template: '' };
    const template = String(c.template ?? '').replace(/\r\n?/g, '\n');
    if (template.length > 6000) fail(`${PAGES[page].label}文案太長`);
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(template)) fail(`${PAGES[page].label}文案包含無效控制字元`);
    const unknown = [...template.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)].map(m => m[1]).filter(f => !COPY_FIELDS.includes(f));
    if (unknown.length) fail(`${PAGES[page].label}文案有未知欄位：${[...new Set(unknown)].join('、')}`);
    if (c.enabled && !template.trim()) fail(`${PAGES[page].label}文案已啟用但內容空白`);
    out.copy[page] = { enabled: !!c.enabled, template };
  }

  const g = isObj(body.general) ? body.general : {};
  out.general = { openTime: String(g.openTime ?? '6:00pm ─ 10:00pm').slice(0, 60) };
  return out;
}

// QG 月曆：標題、星期、模板文字覆蓋、日期顏色、公眾假期（calendar/calendar.js 繪畫）
export const CALENDAR_LINES = ['legend', 'addrTitle', 'addr', 'hoursTitle', 'hours', 'hoursNote', 'note1', 'note2'];
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const DATE_RE = /^[1-9]\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const plain = (v, max, path) => {
  const t = String(v ?? '').replace(/\r\n?/g, '\n');
  if (t.length > max) fail(`${path} 太長（最多 ${max} 字）`);
  if (/[\u0000-\u0009\u000b-\u001f]/.test(t)) fail(`${path} 包含無效控制字元`);
  return t;
};
function validateCalendar(c) {
  if (!isObj(c)) fail('calendar.cal 格式錯誤');
  const out = {};
  if (c.title != null) {
    const t = plain(c.title, 60, '月曆標題');
    const bad = [...t.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)].map(m => m[1]).filter(k => !['MONTH', 'MONTH_ZH', 'M', 'YEAR'].includes(k));
    if (bad.length) fail(`月曆標題有未知欄位：${bad.join('、')}`);
    if (t.includes('\n')) fail('月曆標題只可一行');
    out.title = t;
  }
  if (c.titleColor != null) { if (!COLOR_RE.test(c.titleColor)) fail('月曆標題顏色無效'); out.titleColor = c.titleColor; }
  if (c.titleSize != null) out.titleSize = num(c.titleSize, -60, 40, '月曆標題大小');
  if (c.titleDy != null) out.titleDy = num(c.titleDy, -120, 120, '月曆標題上下');
  if (c.weekdays != null) {
    if (!Array.isArray(c.weekdays) || c.weekdays.length !== 7) fail('星期必須有 7 個');
    out.weekdays = c.weekdays.map((w, i) => { const t = plain(w, 8, `星期 ${i + 1}`); if (t.includes('\n')) fail('星期只可一行'); return t; });
  }
  if (c.colors != null) {
    if (!isObj(c.colors)) fail('月曆顏色格式錯誤');
    out.colors = {};
    for (const k of ['weekday', 'weekend', 'holiday', 'marked', 'other']) if (c.colors[k] != null) {
      if (!COLOR_RE.test(c.colors[k])) fail(`月曆顏色 ${k} 無效`);
      out.colors[k] = c.colors[k];
    }
  }
  if (c.showHolidays != null) out.showHolidays = !!c.showHolidays;
  if (c.extraHolidays != null) {
    if (!isObj(c.extraHolidays) || Object.keys(c.extraHolidays).length > 200) fail('自訂假期格式錯誤');
    out.extraHolidays = {};
    for (const [d, n] of Object.entries(c.extraHolidays)) {
      if (!DATE_RE.test(d)) fail(`假期日期無效：${d}`);
      out.extraHolidays[d] = plain(n, 30, `假期名稱 ${d}`).replace(/\n/g, ' ');
    }
  }
  if (c.offHolidays != null) {
    if (!Array.isArray(c.offHolidays) || c.offHolidays.length > 200 || !c.offHolidays.every(d => DATE_RE.test(d))) fail('停用假期格式錯誤');
    out.offHolidays = [...new Set(c.offHolidays)];
  }
  if (c.lines != null) {
    if (!isObj(c.lines)) fail('月曆文字格式錯誤');
    out.lines = {};
    for (const [k, v] of Object.entries(c.lines)) {
      const base = k.endsWith('Color') ? k.slice(0, -5) : k;
      if (!CALENDAR_LINES.includes(base)) fail(`未知的月曆文字位置：${k}`);
      if (k.endsWith('Color')) { if (v != null && v !== '') { if (!COLOR_RE.test(v)) fail(`月曆文字顏色無效：${base}`); out.lines[k] = v; } }
      else if (v != null && v !== '') out.lines[k] = plain(v, 120, `月曆文字 ${k}`);
    }
  }
  return out;
}

/** Plain-text template rendering (mirrors ui/presets.js). */
export function renderTemplate(template, values) {
  const missing = new Set(), unknown = new Set();
  const text = String(template).replace(/\{\{\s*([^}]*?)\s*\}\}/g, (m, key) => {
    if (!COPY_FIELDS.includes(key)) { unknown.add(key); return m; }
    const v = values[key];
    if (v == null || v === '') { missing.add(key); return m; }
    return String(v);
  });
  return { text, missing: [...missing], unknown: [...unknown] };
}
