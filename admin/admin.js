/* Queen's Garden 管理中心。所有資料經 /api/admin/*，權限由伺服器檢查；
   這個頁面本身不代表任何權限。使用者內容一律以 textContent 顯示。 */
(() => {
'use strict';
const $ = id => document.getElementById(id);
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const clone = o => JSON.parse(JSON.stringify(o));
const fmt = iso => { if (!iso) return '—'; const d = new Date(iso); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

// ---------------------------------------------------------------- API
class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
async function api(path, { method = 'GET', body, raw, headers = {} } = {}) {
  const hd = { ...headers };
  if (body !== undefined) hd['Content-Type'] = 'application/json';
  if (method !== 'GET') hd['X-QG-Admin'] = '1';
  const res = await fetch('/api/admin/' + path, { method, headers: hd, credentials: 'same-origin', body: body !== undefined ? JSON.stringify(body) : raw });
  let data = null; try { data = await res.json(); } catch {}
  if (res.status === 401 && path !== 'login') { showLogin(); throw new ApiError(401, '請重新登入'); }
  if (!res.ok) throw new ApiError(res.status, (data && data.message) || '操作失敗（' + res.status + '）');
  return data;
}
const say = (msg, cls = '') => { const el = $('barMsg'); el.textContent = msg || ''; el.className = 'msg ' + cls; };
const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { if (e.status !== 401) say(e.message || '操作失敗', 'err'); } };

// ---------------------------------------------------------------- built-in reference data
const NAME_FONTS = [["zenk","Zen Kurenaido 加粗（預設）"],["zenk0","Zen Kurenaido"],["yujis","Yuji Syuku"],["yujisb","Yuji Syuku 加粗"],["yujib","Yuji Boku 加粗"],["yusei","Yusei Magic"],["yuseib","Yusei Magic 加粗"],["mochiy","Mochiy Pop One"],["kiwi","Kiwi Maru 加粗"],["daruma","Darumadrop One"],["hachi","Hachi Maru Pop 加粗"],["chiron","Chiron GoRound TC（舊版圓體）"]];
const HAND_FONTS = [["kalam","Kalam（預設）"],["kalam7","Kalam 粗"],["mali5","Mali"],["mali7","Mali 粗"],["itim","Itim"],["patrick","Patrick Hand"],["gochi","Gochi Hand"],["gaegu","Gaegu 粗"],["sriracha","Sriracha"],["short","Short Stack"],["delius","Delius"],["chilanka","Chilanka"],["comic","Comic Neue 粗"],["sniglet","Sniglet"],["andika","Andika 粗"],["playpen5","Playpen Sans"],["playpen6","Playpen Sans 粗"]];
const strip = l => l.map(([id, label]) => [id, label.replace('（預設）', '')]);
const PAGE_TEXT = {
  promo: { label: '限定宣傳', blocks: {
    name: { label: '居民名字', role: 'name', fonts: NAME_FONTS, def: 'zenk', range: { size: [-30, 40], sp: [-20, 60], dx: [-200, 200], dy: [-120, 120] } },
    ig: { label: 'IG', role: 'hand', fonts: HAND_FONTS, def: 'kalam', range: { size: [-30, 40], sp: [-20, 60], dx: [-200, 200], dy: [-120, 120] } },
    date: { label: '日期', role: 'hand', fonts: HAND_FONTS, def: 'kalam', range: { size: [-30, 40], sp: [-20, 60], dx: [-200, 200], dy: [-120, 120] } } } },
  shadow: { label: '影子精靈', blocks: {
    name: { label: '居民名字', role: 'name', fonts: [['default', '原本字體（Chiron GoRound TC）'], ...strip(NAME_FONTS)], def: 'default', range: { size: [-18, 40], sp: [-20, 60], dx: [-200, 200], dy: [-120, 120] } },
    ig: { label: 'IG', role: 'hand', fonts: [['default', '原本字體（Kalam 粗）'], ...strip(HAND_FONTS)], def: 'default', range: { size: [-18, 40], sp: [-20, 60], dx: [-200, 200], dy: [-120, 120] } },
    date: { label: '日期', role: 'hand', fonts: [['default', '原本字體（Kalam 粗）'], ...strip(HAND_FONTS)], def: 'default', range: { size: [-18, 40], sp: [-20, 60], dx: [-200, 200], dy: [-120, 120] } } } },
  weekly: { label: '每週更表', blocks: {
    date: { label: '日期區間', role: 'hand', fonts: strip(HAND_FONTS).map(([i, l]) => [i, i === 'gochi' ? l + '（預設）' : l]), def: 'gochi', range: { size: [-20, 20], sp: [-10, 30], dx: [-200, 200], dy: [-60, 120] } } } },
  daily: { label: '每日更表', blocks: {
    date: { label: '日期', role: 'hand', fonts: [['leckerli', 'Leckerli One（預設）'], ...strip(HAND_FONTS)], def: 'leckerli', range: { size: [-20, 30], sp: [-10, 30], dx: [-300, 300], dy: [-200, 200] } },
    time: { label: '開放時間', role: null, fonts: null, range: { size: [-20, 30], sp: [-10, 30], dx: [-300, 300], dy: [-200, 200] } },
    name: { label: '居民名字（字體）', role: 'name', fonts: [['chiron', 'Chiron GoRound TC（預設）'], ...strip(NAME_FONTS).filter(([i]) => i !== 'chiron')], def: 'chiron', range: null } } },
};
const FIELD_LABEL = { size: '大小', sp: '字距', dx: '左右', dy: '上下' };
const CAT_LABEL = { regular: '常駐', limited: '限定', shadow: '影子', trial: '試煉', none: '無分類' };
const DAILY_LAYOUTS = {
  1: { k: 1.35, c: [[506, 690]] }, 2: { k: 1, c: [[272, 655.5], [668.5, 827]] },
  3: { k: 1, c: [[275, 611.5], [691.5, 621], [493.5, 937.5]] }, 4: { k: 1, c: [[327, 614.5], [660.5, 614.5], [301.5, 941.5], [668.5, 941]] },
  5: { k: 1, c: [[205, 644.5], [511.5, 645], [818.5, 645], [335, 987.5], [668.5, 987.5]] },
  6: { k: 1, c: [[205, 644.5], [511.5, 645], [818.5, 645], [205, 987.5], [502.5, 987.5], [818, 987.5]] },
};
const FW = 233.7, FH = 231.9;
const COPY_PAGES = { promo: '限定宣傳', shadow: '影子精靈', weekly: '每週更表', daily: '每日更表', calendar: 'QG 月曆' };
const FIELD_INFO = { NAME: '居民名字', IG: 'Instagram', DATE: '日期', TIME: '開放時間', CATEGORY: '居民分類', RESIDENT_LIST: '多位居民', START_DATE: '開始日期', END_DATE: '結束日期' };
const SAMPLE = { NAME: '幽月', IG: '@yuzuki_qg', DATE: '20 Nov 2026', TIME: '6:00pm ─ 10:00pm', CATEGORY: '常駐', RESIDENT_LIST: '⚜ 出沒居民\n⚜ 幽月 @yuzuki_qg\n♦️ 限定居民\n♦️ 小豆 @rinnkaunn', START_DATE: '17 Nov 2026', END_DATE: '23 Nov 2026' };

// ---------------------------------------------------------------- state
const S = { published: null, draft: null, versions: [], work: null, rev: null, dirty: false, residents: [], queue: [], sync: null, fonts: [], images: [], view: 'residents', page: 'promo', textSel: {}, copyPage: 'promo', layoutN: 2, preview: null };
function markDirty() { S.dirty = true; renderBar(); if (S.view === 'pages') livePost(); }
window.addEventListener('beforeunload', e => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

// ---------------------------------------------------------------- login
function showLogin() { $('app').hidden = true; $('login').hidden = false; $('who').textContent = ''; }
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('loginMsg'); msg.textContent = '登入中…'; msg.className = 'msg';
  try {
    const r = await api('login', { method: 'POST', body: { password: $('pw').value, name: $('actor').value } });
    $('pw').value = '';
    try { localStorage.setItem('qg.admin.actor', $('actor').value); } catch {}
    msg.textContent = ''; await start(r.actor);
  } catch (err) { msg.textContent = err.message; msg.className = 'msg err'; }
});
try { $('actor').value = localStorage.getItem('qg.admin.actor') || ''; } catch {}
$('logout').onclick = guard(async () => {
  if (S.dirty && !confirm('草稿有未儲存修改，仍要登出？')) return;
  await api('logout', { method: 'POST', body: {} }); S.dirty = false; showLogin();
});

async function start(actor) {
  $('login').hidden = true; $('app').hidden = false; $('who').textContent = actor;
  await Promise.all([loadConfig(), loadResidents(), loadAssets()]);
  show(S.view);
}

// ---------------------------------------------------------------- settings draft bar
async function loadConfig() {
  const d = await api('config');
  S.published = d.published; S.draft = d.draft; S.versions = d.versions; S.meta = d.meta;
  S.work = clone(d.draft ? d.draft.body : d.published.body);
  S.rev = d.draft ? d.draft.rev : null; S.dirty = false;
  renderBar();
}
function renderBar() {
  const p = S.published;
  const info = $('barInfo'); info.replaceChildren(
    '正式版本 ', h('b', { text: 'v' + p.version_id }), `（${fmt(p.published_at)} · ${p.published_by || '—'}）　`,
    S.draft ? h('span', {}, '草稿：', h('b', { text: '已儲存' }), `（${fmt(S.draft.created_at)} · ${S.draft.created_by}）`) : '草稿：沒有',
    S.dirty ? h('span', { class: 'dirty', text: '　● 有未儲存修改' }) : '');
  $('preview').disabled = !S.draft && !S.dirty;
  $('publish').disabled = !S.draft && !S.dirty;
  $('discard').disabled = !S.draft && !S.dirty;
}
async function saveDraft(summary) {
  const r = await api('config/draft', { method: 'PUT', body: { body: S.work, rev: S.rev, summary: summary ?? (S.draft && S.draft.summary) ?? '' } });
  S.draft = r.draft; S.rev = r.draft.rev; S.work = clone(r.draft.body); S.dirty = false; renderBar();
}
$('saveDraft').onclick = guard(async () => { await saveDraft(); say('草稿已儲存（公開製作器未受影響）', 'ok'); });
$('preview').onclick = guard(async () => {
  if (S.dirty || !S.draft) await saveDraft();
  window.open('/?qgPreview=draft#' + (PAGE_TEXT[S.page] || S.page === 'calendar' ? S.page : 'promo'), '_blank', 'noopener');
  say('已在新分頁開啟草稿預覽（只在這部裝置，公開網站未受影響）', 'ok');
});
$('publish').onclick = guard(async () => {
  const summary = prompt('修改摘要（會記錄在版本紀錄）', (S.draft && S.draft.summary) || '');
  if (summary === null) return;
  await saveDraft(summary);
  await api('config/publish', { method: 'POST', body: { rev: S.rev, summary } });
  await loadConfig(); say('已發佈！公開製作器重新開始製作時會套用新設定', 'ok'); show(S.view);
});
$('discard').onclick = guard(async () => {
  if (!confirm('捨棄草稿？未發佈的修改會被移除（舊草稿仍保留在版本紀錄）')) return;
  if (S.draft) await api('config/discard', { method: 'POST', body: { rev: S.rev } });
  await loadConfig(); say('已捨棄草稿', 'ok'); show(S.view);
});

// ---------------------------------------------------------------- navigation
document.querySelectorAll('.nav button').forEach(b => b.onclick = () => show(b.dataset.v));
function show(v) {
  S.view = v;
  document.querySelectorAll('.nav button').forEach(b => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  document.querySelectorAll('.view').forEach(s => { s.hidden = s.id !== 'v-' + v; });
  ({ residents: viewResidents, pages: viewPages, fonts: viewFonts, assets: viewAssets, copy: viewCopy, versions: viewVersions })[v]();
}

// ---------------------------------------------------------------- modal
function modal(title, body) {
  $('modalTitle').textContent = title; $('modalBody').replaceChildren(body);
  $('modal').hidden = false; document.body.style.overflow = 'hidden';
}
function closeModal() { $('modal').hidden = true; document.body.style.overflow = ''; }
$('modalClose').onclick = closeModal;
$('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });

// ================================================================ 居民管理
async function loadResidents() {
  const d = await api('residents');
  S.residents = d.residents; S.queue = d.queue; S.sync = d.sync;
}
const resName = id => (S.residents.find(r => r.id === id) || {}).name || id;
const REASON = { duplicate_ig: '多於一列使用同一個 IG', ig_changed: '同名居民的 IG 有變（可能改了帳號）', missing_data: '名稱或 IG 缺失', name_conflict: '名稱衝突' };
let resQuery = '';
function viewResidents() {
  const root = $('v-residents');
  const st = S.sync || {};
  const syncCard = h('div', { class: 'card' },
    h('h2', { text: 'Google Sheets 名冊同步' }),
    h('p', { class: 'muted' }, `最近成功同步：${fmt(st.last_success_at)}　共 ${st.row_count ?? '—'} 列`,
      st.last_error ? h('span', { class: 'badge bad', text: ' 最近一次失敗：' + st.last_error }) : ''),
    h('p', { class: 'muted', text: '只讀取「表格回應 1」的 B 欄（更表名稱）及 C 欄（IG 帳號），不會修改試算表。公開頁面每 5 分鐘最多自動同步一次。' }),
    h('button', { class: 'btn', type: 'button', onclick: guard(async () => {
      say('同步中…');
      const r = await api('sync', { method: 'POST', body: {} });
      await loadResidents(); viewResidents();
      say(r.synced ? '同步完成' : '同步失敗：' + (r.error === 'not_configured' ? 'Google 服務帳戶尚未設定' : r.error) + '（已保留原有名單）', r.synced ? 'ok' : 'err');
    }) }, '立即同步'));
  const queue = S.queue.length ? h('div', { class: 'card' }, h('h2', { text: `待確認配對（${S.queue.length}）` }),
    h('p', { class: 'muted', text: '系統不會自動把照片轉到其他居民。請逐項確認。' }),
    S.queue.map(q => {
      const sel = h('select', { 'aria-label': '合併到哪位居民' },
        h('option', { value: '', text: '選擇現有居民…' }),
        [...q.candidate_ids.map(id => S.residents.find(r => r.id === id)).filter(Boolean),
          ...S.residents.filter(r => !q.candidate_ids.includes(r.id))].map(r => h('option', { value: r.id, text: `${r.name} ${r.ig}${q.candidate_ids.includes(r.id) ? '（建議）' : ''}` })));
      if (q.candidate_ids.length === 1) sel.value = q.candidate_ids[0];
      const act = (action, extra = {}) => guard(async () => {
        await api('queue/' + q.queue_id, { method: 'POST', body: { action, ...extra } });
        await loadResidents(); viewResidents(); say('已處理', 'ok');
      });
      return h('div', { class: 'q' },
        h('b', { text: `${q.sheet_name || '（沒有名稱）'}  ${q.ig || '（沒有 IG）'}` }),
        h('div', { class: 'muted', text: REASON[q.reason] + (q.candidate_ids.length ? '｜相關居民：' + q.candidate_ids.map(resName).join('、') : '') }),
        h('div', { class: 'row' }, h('div', { class: 'grow' }, sel),
          h('button', { class: 'btn small', type: 'button', onclick: () => sel.value ? act('merge', { residentId: sel.value })() : say('請先選擇居民', 'err') }, '合併'),
          h('button', { class: 'btn small', type: 'button', onclick: act('create') }, '建立新居民'),
          h('button', { class: 'btn small ghost', type: 'button', onclick: act('ignore') }, '忽略')));
    })) : '';
  const search = h('input', { type: 'search', placeholder: '搜尋名字或 IG', value: resQuery, 'aria-label': '搜尋居民' });
  const list = h('div', { class: 'res-list' });
  const archList = h('div', { class: 'res-list' });
  const active = S.residents.filter(r => !r.archived), archived = S.residents.filter(r => r.archived);
  const setArchived = (r, on) => guard(async () => {
    if (on && !confirm(`封存「${r.name}」？\n公開製作器的居民選單不會再顯示這位居民。\nGoogle Sheets、照片及分類全部保留，可隨時在「已封存居民」還原。`)) return;
    await api(`residents/${r.id}/archive`, { method: 'POST', body: { archived: on } });
    await loadResidents(); viewResidents();
    say(on ? `已封存「${r.name}」（公開選單即時隱藏）` : `已還原「${r.name}」到公開選單`, 'ok');
  });
  const row = r => {
    const cat = h('select', { 'aria-label': r.name + ' 預設分類' }, Object.entries(CAT_LABEL).map(([k, v]) => h('option', { value: k, text: v })));
    cat.value = r.category;
    cat.onchange = guard(async () => {
      try { await api('residents/' + r.id, { method: 'PATCH', body: { category: cat.value, version: r.version } }); }
      catch (e) { cat.value = r.category; throw e; }
      r.category = cat.value; r.version++; say(`${r.name} 的預設分類已改為「${CAT_LABEL[cat.value]}」（即時生效）`, 'ok');
    });
    return h('div', { class: 'res' + (r.archived ? ' archived' : '') },
      r.photo ? h('img', { src: r.photo, alt: '', loading: 'lazy' }) : h('span', { class: 'ph', text: '👤' }),
      h('div', { class: 't' }, h('b', { text: r.name || '（未命名）' }),
        h('small', { text: `${r.ig || '沒有 IG'} · 更新 ${fmt(r.updatedAt)}` }),
        r.archived ? h('span', { class: 'badge', text: `封存於 ${fmt(r.archivedAt)}${r.archivedBy ? ' · ' + r.archivedBy : ''}` }) : '',
        r.status === 'missing' ? h('span', { class: 'badge warn', text: '已不在名冊' }) : r.status === 'manual' ? h('span', { class: 'badge', text: '人工建立' }) : '',
        !r.photo ? h('span', { class: 'badge', text: '未有照片' }) : ''),
      h('div', { class: 'res-act' },
        r.archived ? '' : cat,
        h('div', { class: 'row' },
          h('button', { class: 'btn small', type: 'button', onclick: () => photoEditor(r) }, '照片'),
          r.archived
            ? h('button', { class: 'btn small primary', type: 'button', onclick: setArchived(r, false) }, '還原')
            : h('button', { class: 'btn small danger', type: 'button', onclick: setArchived(r, true) }, '刪除'))));
  };
  const match = r => { const q = resQuery.toLowerCase().replace(/^@/, ''); return !q || r.name.toLowerCase().includes(q) || r.ig.toLowerCase().includes(q); };
  const draw = () => {
    const rows = active.filter(match);
    list.replaceChildren(...rows.map(row));
    if (!rows.length) list.append(h('p', { class: 'muted', text: active.length ? '找不到符合的居民' : S.residents.length ? '所有居民都已封存' : '未有居民資料。請先完成 Google 服務帳戶設定並按「立即同步」。' }));
    const arows = archived.filter(match);
    archList.replaceChildren(...arows.map(row));
    if (!arows.length) archList.append(h('p', { class: 'muted', text: archived.length ? '找不到符合的已封存居民' : '未有已封存的居民' }));
  };
  search.oninput = () => { resQuery = search.value.trim(); draw(); };
  draw();
  root.replaceChildren(syncCard, queue, h('div', { class: 'card' }, h('h2', { text: `居民（${active.length}）` }),
    h('p', { class: 'muted', text: '名字及 IG 來自 Google Sheets；預設分類及照片在這裡設定，修改後公開製作器即時使用。「刪除」只會封存：公開製作器的選單不再顯示，不會改動 Google Sheets，照片亦會保留。' }), search, list),
    h('details', { class: 'card arch', open: !!archived.length && !!resQuery },
      h('summary', {}, h('h2', { text: `🗄️ 已封存居民（${archived.length}）` })),
      h('p', { class: 'muted', text: '這些居民仍會跟 Google Sheets 同步，但不會在公開製作器出現。按「還原」即可放回選單。' }), archList));
}

// 照片：裁切（3:4）、縮放、保存、版本還原
function photoEditor(r) {
  const cv = h('canvas', { width: 600, height: 800 });
  const ctx = cv.getContext('2d');
  const zoom = h('input', { type: 'range', min: 1, max: 4, step: 0.01, value: 1, 'aria-label': '縮放' });
  const msg = h('p', { class: 'msg', role: 'status' });
  const hist = h('div', { class: 'hist' });
  const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' });
  const save = h('button', { class: 'btn primary', type: 'button', disabled: true }, '保存為預設照片');
  let img = null, z = 1, ox = 0, oy = 0;
  const base = () => Math.max(600 / img.width, 800 / img.height);
  const clampPos = () => {
    const s = base() * z, mx = Math.max(0, (img.width * s - 600) / 2), my = Math.max(0, (img.height * s - 800) / 2);
    ox = Math.max(-mx, Math.min(mx, ox)); oy = Math.max(-my, Math.min(my, oy));
  };
  const draw = () => {
    ctx.fillStyle = '#120c1a'; ctx.fillRect(0, 0, 600, 800);
    if (!img) { ctx.fillStyle = '#b7a6c9'; ctx.font = '28px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(r.photo ? '載入中…' : '請選擇相片', 300, 400); return; }
    const s = base() * z, w = img.width * s, hh = img.height * s;
    ctx.drawImage(img, 300 - w / 2 + ox, 400 - hh / 2 + oy, w, hh);
  };
  const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  if (r.photo) load(r.photo).then(i => { if (!img) { img = i; draw(); } }).catch(() => {});
  draw();
  file.onchange = async () => {
    const f = file.files[0]; if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { msg.textContent = '只接受 JPEG、PNG 或 WebP'; msg.className = 'msg err'; return; }
    if (f.size > 25 * 1024 * 1024) { msg.textContent = '檔案太大'; msg.className = 'msg err'; return; }
    const u = URL.createObjectURL(f);
    try { img = await load(u); } catch { msg.textContent = '無法讀取這張相片'; msg.className = 'msg err'; return; } finally { URL.revokeObjectURL(u); }
    if (img.width < 200 || img.height < 200) { msg.textContent = '相片太細（最少 200px）'; msg.className = 'msg err'; img = null; draw(); return; }
    z = 1; ox = 0; oy = 0; zoom.value = 1; save.disabled = false; msg.textContent = '拖動調整位置，用滑桿或兩指縮放'; msg.className = 'msg'; draw();
  };
  zoom.oninput = () => { if (!img) return; z = +zoom.value; clampPos(); draw(); save.disabled = false; };
  // 拖動及兩指縮放
  const pts = new Map(); let pinch = null;
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); });
  cv.addEventListener('pointermove', e => {
    if (!img || !pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    const k = 600 / cv.getBoundingClientRect().width;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) { z = Math.max(1, Math.min(4, z * d / pinch)); zoom.value = z; }
      pinch = d;
    } else { ox += (e.clientX - prev[0]) * k; oy += (e.clientY - prev[1]) * k; }
    clampPos(); draw(); save.disabled = false;
  });
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  save.onclick = guard(async () => {
    if (!img) return;
    save.disabled = true; msg.textContent = '處理及上載中…'; msg.className = 'msg';
    // 輸出 3:4，不放大超過原相解像度；重新編碼會移除 EXIF（含 GPS）
    const s = base() * z, outW = Math.max(300, Math.min(1200, Math.round(600 / s))), outH = Math.round(outW * 4 / 3);
    const out = h('canvas', { width: outW, height: outH }), c = out.getContext('2d'), k = outW / 600;
    c.imageSmoothingQuality = 'high';
    const w = img.width * s * k, hh = img.height * s * k;
    c.drawImage(img, outW / 2 - w / 2 + ox * k, outH / 2 - hh / 2 + oy * k, w, hh);
    let blob = await new Promise(res => out.toBlob(res, 'image/webp', 0.9));
    if (!blob || blob.type !== 'image/webp') blob = await new Promise(res => out.toBlob(res, 'image/jpeg', 0.9));
    try {
      await api(`residents/${r.id}/photo?version=${r.version}`, { method: 'POST', raw: blob, headers: { 'Content-Type': blob.type, 'X-QG-Meta': JSON.stringify({ crop: { zoom: z, x: Math.round(ox), y: Math.round(oy) } }) } });
    } catch (e) { msg.textContent = e.message; msg.className = 'msg err'; save.disabled = false; return; }
    await loadResidents(); const fresh = S.residents.find(x => x.id === r.id); if (fresh) Object.assign(r, fresh);
    msg.textContent = '已保存！公開製作器選擇這位居民時會使用新照片。上一版本已保留，可隨時還原。'; msg.className = 'msg ok';
    file.value = ''; loadHist(); viewResidents();
  });
  async function loadHist() {
    const d = await api(`residents/${r.id}/photos`);
    hist.replaceChildren(...d.photos.map(p => {
      const cur = r.photo === p.url;
      return h('figure', { class: cur ? 'cur' : '' }, h('img', { src: p.url, alt: '' }),
        h('figcaption', { text: fmt(p.created_at) }),
        cur ? h('span', { class: 'badge', text: '目前' }) : h('button', { class: 'btn small', type: 'button', onclick: guard(async () => {
          if (!confirm('還原為這張照片？')) return;
          await api(`residents/${r.id}/photo/restore`, { method: 'POST', body: { assetId: p.asset_id, version: r.version } });
          await loadResidents(); Object.assign(r, S.residents.find(x => x.id === r.id)); loadHist(); viewResidents();
          img = await load(r.photo); z = 1; ox = 0; oy = 0; zoom.value = 1; draw();
          msg.textContent = '已還原'; msg.className = 'msg ok';
        }) }, '還原'));
    }));
    if (!d.photos.length) hist.append(h('span', { class: 'muted', text: '未有照片紀錄' }));
  }
  loadHist().catch(() => {});
  modal(`${r.name} 的預設照片`, h('div', {},
    h('p', { class: 'muted', text: `${r.ig || ''}　照片與固定居民 ID 綁定，不會因名冊改名而配錯。` }),
    h('label', {}, '選擇新相片', file),
    h('div', { class: 'crop' }, cv),
    h('div', { class: 'field' }, h('span', { text: '縮放' }), zoom, h('span')),
    save, msg, h('h3', { text: '照片版本' }), hist));
}

// ================================================================ 頁面設定
const pageText = (page, key) => ((S.work.pages[page] ||= { text: {} }).text ||= {})[key] ||= {};
function customFonts(role) { return (S.work.fonts || []).filter(f => f.roles.includes(role)).map(f => [f.id, f.label + '（自訂）']); }
// 即時預覽：內嵌公開製作器（?qgPreview=live），設定以 postMessage 傳入，不經伺服器
const SERVER_RANGE = { size: [-60, 80], sp: [-30, 80], dx: [-400, 400], dy: [-400, 400] };
let live = null;   // {page, frame, ready}
function liveFrame(page) {
  if (live && live.page === page) return live.frame;
  const frame = h('iframe', { class: 'live-frame', title: '即時預覽', src: '/?qgPreview=live#' + page });
  live = { page, frame, ready: false };
  return frame;
}
function livePost() {
  if (!live || !live.ready || !live.frame.contentWindow) return;
  live.frame.contentWindow.postMessage({ type: 'qg-live-config', page: live.page, config: S.work }, location.origin);
}
window.addEventListener('message', e => {
  if (e.origin !== location.origin || !live || e.source !== live.frame.contentWindow || !e.data) return;
  if (e.data.type === 'qg-live-ready') {
    live.ready = true; livePost();
    // 月曆的內建公眾假期由預覽頁提供，載入後重畫設定面板
    if (live.page === 'calendar') setTimeout(() => { if (S.view === 'pages' && S.page === 'calendar') renderPageControls(); }, 800);
    return;
  }
  if (e.data.type !== 'qg-live-text' || e.data.page !== live.page || !S.work) return;
  const def = PAGE_TEXT[live.page]; if (!def) return;
  let changed = false;
  for (const [key, b] of Object.entries(def.blocks)) {
    const src = e.data.text[key]; if (!src) continue;
    const before = JSON.stringify((S.work.pages[live.page]?.text || {})[key] || {});
    const t = {};
    if (b.fonts && src.font && src.font !== b.def) t.font = String(src.font);
    if (b.range) for (const [f, [lo, hi]] of Object.entries(SERVER_RANGE)) {
      const v = Math.max(lo, Math.min(hi, Math.round(+src[f] || 0)));
      if (v) t[f] = v;
    }
    if (JSON.stringify(t) !== before) {
      changed = true;
      const all = ((S.work.pages[live.page] ||= { text: {} }).text ||= {});
      if (Object.keys(t).length) all[key] = t; else delete all[key];
    }
  }
  if (changed) { S.dirty = true; renderBar(); renderPageControls(); }
});
let renderPageControls = () => {};

const PAGE_CHIPS = { ...Object.fromEntries(Object.entries(PAGE_TEXT).map(([k, p]) => [k, p.label])), calendar: 'QG 月曆' };
function viewPages() {
  const root = $('v-pages');
  const frame = liveFrame(S.page);
  const controls = h('div', { class: 'live-controls' });
  renderPageControls = () => controls.replaceChildren(...(S.page === 'calendar' ? calendarControls() : pageControls()));
  renderPageControls();
  root.replaceChildren(
    h('div', { class: 'card' }, h('h2', { text: '頁面預設設定' }),
      h('div', { class: 'chips big' }, Object.entries(PAGE_CHIPS).map(([k, l]) =>
        h('button', { type: 'button', class: S.page === k ? 'on' : '', onclick: () => { S.page = k; viewPages(); } }, l))),
      h('p', { class: 'muted', text: S.page === 'calendar'
        ? '上方（電腦為左邊）是即時預覽。可改月份標題、星期、模板上的文字、日期顏色及公眾假期。所有修改只存在草稿，發佈後才會套用到公開網站。'
        : '上方（電腦為左邊）是即時預覽，可以直接拖動文字；下面的「文字微調」與公開製作器相同，兩邊會同步。所有修改只存在草稿，發佈後才會套用到公開網站。' }),
      h('div', { class: 'live-wrap' }, h('div', { class: 'live-pane' }, frame), controls)));
  if (live.ready) livePost();
}
// 與公開製作器「文字微調」相同的一行：標籤、−、滑桿、＋、數值
function tweakRow(label, [lo, hi], value, onChange) {
  const range = h('input', { type: 'range', min: lo, max: hi, step: 1, value: value ?? 0, 'aria-label': label });
  const out = h('output', { text: String(value ?? 0) });
  const set = v => { v = Math.max(lo, Math.min(hi, Math.round(+v || 0))); range.value = v; out.textContent = v; onChange(v); };
  const step = d => h('button', { class: 'step', type: 'button', 'aria-label': label + (d < 0 ? '減少' : '增加'), text: d < 0 ? '−' : '+', onclick: () => set(+range.value + d) });
  range.oninput = () => set(range.value);
  return h('div', { class: 'tw-row' }, h('span', { text: label }), step(-1), range, step(1), out);
}
function pageControls() {
  const def = PAGE_TEXT[S.page];
  const keys = Object.keys(def.blocks);
  const sel = keys.includes(S.textSel[S.page]) ? S.textSel[S.page] : keys[0];
  const b = def.blocks[sel];
  const cur = (S.work.pages[S.page]?.text || {})[sel] || {};
  const seg = h('div', { class: 'tw-seg', role: 'tablist', style: `grid-template-columns:repeat(${keys.length},1fr)` },
    keys.map(k => h('button', { type: 'button', role: 'tab', class: k === sel ? 'on' : '', 'aria-selected': String(k === sel),
      onclick: () => { S.textSel[S.page] = k; renderPageControls(); } }, def.blocks[k].label.replace('（字體）', ''))));
  const parts = [seg];
  if (b.fonts) {
    const fsel = h('select', { 'aria-label': b.label + '字體' },
      h('option', { value: '', text: '（沿用程式內建預設）' }),
      b.fonts.map(([id, label]) => h('option', { value: id, text: label })),
      customFonts(b.role).map(([id, label]) => h('option', { value: id, text: label })));
    fsel.value = cur.font || '';
    fsel.onchange = () => { const t = pageText(S.page, sel); if (fsel.value) t.font = fsel.value; else delete t.font; markDirty(); };
    parts.push(h('div', { class: 'tw-font' }, h('span', { text: '字體' }), fsel));
  }
  if (b.range) for (const f of ['size', 'sp', 'dx', 'dy']) {
    parts.push(tweakRow(FIELD_LABEL[f], b.range[f], cur[f], v => { const t = pageText(S.page, sel); if (v) t[f] = v; else delete t[f]; markDirty(); }));
  } else parts.push(h('p', { class: 'muted', text: '這一項只設定字體，位置跟隨版型。' }));
  const resetKeys = ks => { const t = S.work.pages[S.page].text || {}; ks.forEach(k => delete t[k]); markDirty(); renderPageControls(); };
  parts.push(h('div', { class: 'tw-foot' },
    h('button', { class: 'btn', type: 'button', onclick: () => resetKeys([sel]) }, '重設' + b.label.replace('（字體）', '')),
    h('button', { class: 'btn', type: 'button', onclick: () => resetKeys(keys) }, '全部重設')));
  const extra = [];
  if (S.page === 'daily') {
    const t = S.work.pages.daily.times ||= { start: '18:00', end: '22:00' };
    const st = h('input', { type: 'time', value: t.start, step: 300 }), en = h('input', { type: 'time', value: t.end, step: 300 });
    st.onchange = () => { t.start = st.value || '18:00'; markDirty(); }; en.onchange = () => { t.end = en.value || '22:00'; markDirty(); };
    extra.push(h('div', { class: 'tw-panel' }, h('h3', { text: '預設開放時間' }), h('div', { class: 'grid2' }, h('label', {}, '開始', st), h('label', {}, '結束', en)),
      h('p', { class: 'muted', text: '日期仍然使用原生日期選擇器；這裡只改預設值，不改日期邏輯。' })));
  }
  const g = S.work.general ||= { openTime: '6:00pm ─ 10:00pm' };
  const ot = h('input', { type: 'text', value: g.openTime, maxlength: 60 });
  ot.oninput = () => { g.openTime = ot.value; markDirty(); };
  return [
    h('div', { class: 'tw-panel' }, h('h3', { text: '✏️ 文字微調' }), ...parts,
      h('p', { class: 'muted', text: '數值是相對程式內建位置的微調。只影響新開始的製作；使用者已手動調整或從記錄還原的內容不會被覆蓋。' })),
    ...extra,
    h('div', { class: 'tw-panel' }, h('h3', { text: '文案 {{TIME}} 預設開放時間' }), ot),
    h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn', type: 'button', onclick: () => $('preview').click() }, '儲存草稿並在新分頁預覽'))];
}

// ---------------------------------------------------------------- QG 月曆
const CAL_LINES = [['legend', '皇冠圖例（特別活動日）'], ['addrTitle', '入口標題'], ['addr', '地址'], ['hoursTitle', '開放時間標題'],
  ['hours', '開放時間'], ['hoursNote', '開放時間備註'], ['note1', '右邊第一項（可換行）'], ['note2', '右邊第二項（可換行）']];
const CAL_TEMPLATE_TEXT = { legend: '特別活動日', addrTitle: "Queen's Garden | 異世界入口", addr: '旺角•西洋菜街 遠景大廈3樓H2室', hoursTitle: '異世界開放時間',
  hours: '星期一至日 6:00pm ── 10:00pm', hoursNote: '（部份日子為特別開放時間，詳情請留意公告）', note1: '日常最低消費為一個冒險\n套餐 88魔力',
  note2: '開放時間和出沒居民或\n因異世界狀態變動，\n請以《異世界居民出沒啟示錄》\n公告為準' };
const CAL_COLORS = [['weekday', '平日日期', '#ffffff'], ['weekend', '星期六、日', '#c294af'], ['holiday', '公眾假期', '#e88fb4'], ['marked', '皇冠上的日期', '#33202c']];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function calendarControls() {
  const P = S.work.pages.calendar ||= { text: {} };
  const cal = P.cal ||= {};
  const tidy = () => { for (const k of ['colors', 'lines', 'extraHolidays']) if (cal[k] && !Object.keys(cal[k]).length) delete cal[k]; if (cal.offHolidays && !cal.offHolidays.length) delete cal.offHolidays; markDirty(); };
  const color = (value, def, onChange) => {
    const c = h('input', { type: 'color', value: value || def });
    c.oninput = () => onChange(c.value.toLowerCase() === def ? null : c.value);
    return c;
  };
  // 標題
  const title = h('input', { type: 'text', value: cal.title ?? '', placeholder: '{{MONTH}} {{YEAR}}（預設，例如 November 2026）', maxlength: 60 });
  title.oninput = () => { if (title.value.trim()) cal.title = title.value; else delete cal.title; tidy(); };
  const titlePanel = h('div', { class: 'tw-panel' }, h('h3', { text: '月份標題' }),
    h('label', {}, '標題文字（{{MONTH}} 英文月份、{{MONTH_ZH}} 中文月份、{{M}} 數字月份、{{YEAR}} 年份）', title),
    h('div', { class: 'chips' }, ['{{MONTH}} {{YEAR}}', '{{YEAR}}年{{M}}月', '{{MONTH_ZH}} {{YEAR}}'].map(t =>
      h('button', { type: 'button', onclick: () => { title.value = t; title.oninput(); } }, t))),
    h('div', { class: 'tw-font' }, h('span', { text: '顏色' }), color(cal.titleColor, '#c799b3', v => { if (v) cal.titleColor = v; else delete cal.titleColor; tidy(); })),
    tweakRow('大小', [-60, 40], cal.titleSize, v => { if (v) cal.titleSize = v; else delete cal.titleSize; tidy(); }),
    tweakRow('上下', [-120, 120], cal.titleDy, v => { if (v) cal.titleDy = v; else delete cal.titleDy; tidy(); }));
  // 星期
  const wdOn = h('input', { type: 'checkbox', checked: Array.isArray(cal.weekdays) });
  const wdInputs = WEEKDAYS.map((d, i) => {
    const inp = h('input', { type: 'text', value: (cal.weekdays || WEEKDAYS)[i], maxlength: 8, 'aria-label': d, disabled: !cal.weekdays });
    inp.oninput = () => { if (cal.weekdays) { cal.weekdays[i] = inp.value; tidy(); } };
    return inp;
  });
  wdOn.onchange = () => { if (wdOn.checked) cal.weekdays = wdInputs.map((x, i) => x.value || WEEKDAYS[i]); else delete cal.weekdays; wdInputs.forEach(x => { x.disabled = !wdOn.checked; }); tidy(); };
  const wdPanel = h('div', { class: 'tw-panel' }, h('h3', { text: '星期' }),
    h('label', { class: 'row' }, wdOn, ' 自訂星期名稱（不勾選＝保留模板原圖字樣）'), h('div', { class: 'wd-grid' }, wdInputs));
  // 模板文字
  const lines = () => (cal.lines ||= {});
  const linePanel = h('div', { class: 'tw-panel' }, h('h3', { text: '模板上的文字' }),
    h('p', { class: 'muted', text: '留空＝保留模板原圖。填寫後會先用背景色蓋住原有文字再寫上新文字；太長會自動縮細。按 Enter 換行。' }),
    CAL_LINES.map(([k, label]) => {
      const ta = h('textarea', { class: 'short', rows: CAL_TEMPLATE_TEXT[k].includes('\n') ? 3 : 1, placeholder: CAL_TEMPLATE_TEXT[k], maxlength: 120 });
      ta.value = lines()[k] || '';
      ta.oninput = () => { if (ta.value.trim()) lines()[k] = ta.value; else delete lines()[k]; tidy(); };
      const c = color(lines()[k + 'Color'], '#ffffff', v => { if (v) lines()[k + 'Color'] = v; else delete lines()[k + 'Color']; tidy(); });
      return h('div', { class: 'cal-line' }, h('div', { class: 'row' }, h('span', { class: 'grow muted', text: label }),
        h('button', { class: 'btn small ghost', type: 'button', onclick: () => { ta.value = CAL_TEMPLATE_TEXT[k]; ta.oninput(); ta.focus(); } }, '填入原文'),
        h('label', { class: 'row', style: 'margin:0' }, '顏色', c)), ta);
    }));
  // 顏色
  const colors = () => (cal.colors ||= {});
  const colorPanel = h('div', { class: 'tw-panel' }, h('h3', { text: '日期顏色' }),
    h('div', { class: 'grid2' }, CAL_COLORS.map(([k, label, def]) => h('div', { class: 'tw-font' }, h('span', { text: label }),
      color(colors()[k], def, v => { if (v) colors()[k] = v; else delete colors()[k]; tidy(); })))),
    h('button', { class: 'btn small ghost', type: 'button', onclick: () => { delete cal.colors; tidy(); renderPageControls(); } }, '恢復預設顏色'));
  // 公眾假期
  const showH = h('input', { type: 'checkbox', checked: cal.showHolidays !== false });
  showH.onchange = () => { if (showH.checked) delete cal.showHolidays; else cal.showHolidays = false; tidy(); };
  const yearSel = h('select', { 'aria-label': '年份' });
  const builtIn = live && live.frame.contentWindow && live.frame.contentWindow.qgCalendar ? live.frame.contentWindow.qgCalendar.HK_HOLIDAYS : null;
  const years = [...new Set([...Object.keys(builtIn || {}), ...Object.keys(cal.extraHolidays || {}).map(d => d.slice(0, 4)), String(new Date().getFullYear())])].sort();
  years.forEach(y => yearSel.append(h('option', { value: y, text: y + ' 年' })));
  yearSel.value = S.calYear && years.includes(S.calYear) ? S.calYear : String(new Date().getFullYear());
  const hList = h('div', { class: 'hol-list' });
  const drawH = () => {
    S.calYear = yearSel.value;
    const y = yearSel.value, off = new Set(cal.offHolidays || []);
    const rows = [...Object.entries((builtIn || {})[y] || {}).map(([md, n]) => [`${y}-${md}`, n, 'gov']),
      ...Object.entries(cal.extraHolidays || {}).filter(([d]) => d.startsWith(y + '-')).map(([d, n]) => [d, n, 'custom'])].sort((a, b) => a[0].localeCompare(b[0]));
    hList.replaceChildren(...rows.map(([d, n, kind]) => {
      const on = kind === 'custom' || !off.has(d);
      return h('div', { class: 'hol' + (on ? '' : ' off') }, h('b', { text: d.slice(5).replace('-', '/') }), h('span', { class: 'grow', text: n }),
        h('span', { class: 'badge', text: kind === 'gov' ? '政府公佈' : '自訂' }),
        kind === 'gov'
          ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => {
            const s2 = new Set(cal.offHolidays || []); on ? s2.add(d) : s2.delete(d); cal.offHolidays = [...s2].sort(); tidy(); drawH();
          } }, on ? '停用' : '啟用')
          : h('button', { class: 'btn small danger', type: 'button', onclick: () => { if (cal.extraHolidays) delete cal.extraHolidays[d]; tidy(); drawH(); } }, '移除'));
    }));
    if (!rows.length) hList.append(h('p', { class: 'muted', text: builtIn ? '這一年未有內建假期，可以在下面自行加入。' : '預覽載入後會顯示內建假期。' }));
  };
  yearSel.onchange = drawH; drawH();
  const nd = h('input', { type: 'date' }), nn = h('input', { type: 'text', placeholder: '名稱，例如 店休／颱風假', maxlength: 30 });
  const addH = h('button', { class: 'btn small', type: 'button', onclick: () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nd.value)) { say('請先選擇日期', 'err'); return; }
    (cal.extraHolidays ||= {})[nd.value] = nn.value.trim() || '假期'; yearSel.value = nd.value.slice(0, 4);
    if (![...yearSel.options].some(o => o.value === yearSel.value)) { yearSel.append(h('option', { value: nd.value.slice(0, 4), text: nd.value.slice(0, 4) + ' 年' })); yearSel.value = nd.value.slice(0, 4); }
    nd.value = ''; nn.value = ''; tidy(); drawH();
  } }, '加入');
  const holPanel = h('div', { class: 'tw-panel' }, h('h3', { text: '公眾假期（粉紅色）' }),
    h('label', { class: 'row' }, showH, ' 公眾假期日期用「公眾假期」顏色顯示'),
    h('p', { class: 'muted', text: '內建 2025–2027 年香港政府公佈的一般假日（資料來源：1823）。可停用個別日子，或加入自訂假期。' }),
    h('div', { class: 'tw-font' }, h('span', { text: '年份' }), yearSel), hList,
    h('div', { class: 'grid2' }, h('label', {}, '日期', nd), h('label', {}, '名稱', nn)), addH);
  return [titlePanel, colorPanel, holPanel, wdPanel, linePanel,
    h('div', { class: 'row', style: 'margin-top:10px' },
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { if (confirm('清除所有月曆設定，回復模板原貌？')) { delete P.cal; markDirty(); renderPageControls(); } } }, '全部重設月曆'),
      h('button', { class: 'btn', type: 'button', onclick: () => $('preview').click() }, '儲存草稿並在新分頁預覽'))];
}

// ================================================================ 字體及文字
function registerPreviewFont(f) {
  try { const face = new FontFace(f.family, `url(/media/${f.assetId})`, { weight: String(f.weight) }); document.fonts.add(face); face.load().catch(() => {}); } catch {}
}
async function loadAssets() {
  const [fonts, images] = await Promise.all([api('assets?kind=font'), api('assets?kind=image')]);
  S.fonts = fonts.assets; S.images = images.assets;
}
function viewFonts() {
  const root = $('v-fonts');
  const list = (S.work.fonts || []).map((f, i) => {
    registerPreviewFont(f);
    return h('div', { class: 'block' },
      h('div', { class: 'row' }, h('b', { class: 'grow', text: `${f.label}（${f.family} ${f.weight}）` }),
        h('span', { class: 'badge', text: f.roles.map(r => r === 'name' ? '名字' : 'IG／日期').join('、') }),
        h('button', { class: 'btn small danger', type: 'button', onclick: () => {
          if (!confirm(`從設定移除「${f.label}」？（字體檔仍會保留，可再加回）`)) return;
          S.work.fonts.splice(i, 1);
          for (const p of Object.values(S.work.pages)) for (const t of Object.values(p.text || {})) if (t.font === f.id) delete t.font;
          markDirty(); viewFonts();
        } }, '移除')),
      h('div', { class: 'fontpv', style: `font-family:"${f.family}",sans-serif;font-weight:${f.weight}`, text: '幽月 豆漿 Queen’s Garden @qg_2026 0123456789' }),
      h('p', { class: 'muted', text: `授權：${f.license.name}${f.license.source ? '｜來源：' + f.license.source : ''}` }));
  });
  const file = h('input', { type: 'file', accept: '.woff2,.woff,.ttf,.otf' });
  const fam = h('input', { type: 'text', placeholder: '英文名稱，例如 QG Round', maxlength: 40 });
  const label = h('input', { type: 'text', placeholder: '顯示名稱，例如 圓體（粗）', maxlength: 40 });
  const weight = h('select', {}, [400, 500, 600, 700, 800, 900].map(w => h('option', { value: w, text: w })));
  const roleName = h('input', { type: 'checkbox', checked: true }), roleHand = h('input', { type: 'checkbox' });
  const lic = h('input', { type: 'text', placeholder: '例如 SIL Open Font License 1.1', maxlength: 80 });
  const src = h('input', { type: 'url', placeholder: '下載來源網址（建議填寫）', maxlength: 200 });
  const ok = h('input', { type: 'checkbox' });
  const msg = h('p', { class: 'msg', role: 'status' });
  const upload = h('button', { class: 'btn primary', type: 'button', onclick: guard(async () => {
    const f = file.files[0];
    const family = fam.value.trim();
    const err = !f ? '請選擇字體檔' : f.size > 5 * 1024 * 1024 ? '字體檔不可大於 5 MB' : !/^[A-Za-z0-9 _-]{1,40}$/.test(family) ? '英文名稱只可用英文、數字、空格' :
      !roleName.checked && !roleHand.checked ? '最少選一個用途' : !lic.value.trim() || !ok.checked ? '必須填寫授權並確認可網頁嵌入及圖片輸出' :
      /canva/i.test(family + lic.value) ? '不可上載 Canva 專屬字體' : '';
    if (err) { msg.textContent = err; msg.className = 'msg err'; return; }
    msg.textContent = '上載中…'; msg.className = 'msg';
    const q = new URLSearchParams({ kind: 'font', license: lic.value.trim(), source: src.value.trim(), confirmed: '1', filename: f.name });
    const r = await api('assets?' + q, { method: 'POST', raw: f, headers: { 'Content-Type': 'application/octet-stream' } });
    const entry = { id: 'c_' + r.assetId.slice(-10).toLowerCase(), family, label: label.value.trim() || family, assetId: r.assetId, weight: +weight.value,
      roles: [roleName.checked && 'name', roleHand.checked && 'hand'].filter(Boolean), fallback: '', license: { name: lic.value.trim(), source: src.value.trim(), confirmed: true } };
    (S.work.fonts ||= []).push(entry); markDirty(); await loadAssets(); viewFonts();
    say('字體已上載並加入草稿；發佈後製作器會出現這款字體', 'ok');
  }) }, '上載並加入草稿');
  root.replaceChildren(
    h('div', { class: 'card' }, h('h2', { text: '自訂字體' }),
      h('p', { class: 'muted', text: '只上載具網頁嵌入及圖片輸出授權的字體（例如 SIL OFL）。不可上載 Canva 專屬字體。預覽、PNG 及影片都用同一個字體檔繪製。' }),
      list.length ? list : h('p', { class: 'muted', text: '未有自訂字體。內建字體已包括 Zen Kurenaido、Chiron GoRound TC、Kalam 等。' })),
    h('div', { class: 'card' }, h('h2', { text: '上載字體' }), h('label', {}, '字體檔（WOFF2／WOFF／TTF／OTF）', file),
      h('div', { class: 'grid2' }, h('label', {}, '英文名稱（font-family）', fam), h('label', {}, '顯示名稱', label)),
      h('label', {}, '粗幼', weight),
      h('label', {}, '用途'), h('div', { class: 'row' }, h('label', { class: 'row' }, roleName, ' 居民名字'), h('label', { class: 'row' }, roleHand, ' IG／日期')),
      h('label', {}, '授權名稱', lic), h('label', {}, '來源', src),
      h('label', { class: 'row' }, ok, ' 我確認這款字體可用於網頁嵌入及圖片／影片輸出'),
      upload, msg),
    h('div', { class: 'card' }, h('h2', { text: '恢復原始預設字體' }),
      h('p', { class: 'muted', text: '移除所有頁面的預設字體設定（位置、大小等其他微調保留）。' }),
      h('button', { class: 'btn', type: 'button', onclick: () => {
        for (const p of Object.values(S.work.pages)) for (const t of Object.values(p.text || {})) delete t.font;
        markDirty(); say('已在草稿中恢復各頁原始字體', 'ok');
      } }, '恢復各頁原始預設字體')));
}

// ================================================================ 相框及素材
const SLOT_GROUPS = () => {
  const g = {};
  for (const [slot, label] of Object.entries(S.meta.slots)) (g[label] ||= []).push(slot);
  return g;
};
function viewAssets() {
  const root = $('v-assets');
  root.replaceChildren(layoutCard(), h('div', { class: 'card' }, h('h2', { text: '圖片素材' }),
    h('p', { class: 'muted', text: '更換後先存入草稿，發佈後才生效。原圖（包括 Canva 拆件）一直保留，可隨時「恢復原圖」；舊替換圖保留在版本紀錄中，不會刪除使用者的製作記錄。限定宣傳可直接上載 Canva 逐層匯出的 1012×1350 透明圖層，製作器會自動按圖層內容定位。' }),
    Object.entries(SLOT_GROUPS()).map(([label, slots]) => h('div', { class: 'block' }, h('h3', { text: label }),
      h('div', { class: 'slots' }, slots.map(slotCard))))));
}
const SLOT_NAMES = { 'promo/bg': '背景', 'promo/lace': '圓形蕾絲', 'promo/crown': '皇冠', 'promo/bow': '蝴蝶結徽章', 'promo/keyR': '右鑰匙',
  'promo/keyL': '左鑰匙', 'promo/pearl': '珍珠相框', 'promo/lm': '「限定居民」字樣', 'promo/qg': 'Queen’s Garden 字樣' };
function slotCard(slot) {
  const id = S.work.assets[slot];
  const promo = slot.startsWith('promo/');
  const original = promo ? '/' + slot + (slot === 'promo/bg' ? '.jpg' : '.png') : '/' + slot;
  const pv = h('div', { class: 'pv' }, h('img', { src: id ? '/media/' + id : original, alt: '', loading: 'lazy' }));
  const file = h('input', { type: 'file', accept: 'image/png,image/webp,image/jpeg', hidden: true });
  const msg = h('div', { class: 'muted' });
  file.onchange = guard(async () => {
    const f = file.files[0]; file.value = ''; if (!f) return;
    if (f.size > 10 * 1024 * 1024) { msg.textContent = '檔案不可大於 10 MB'; return; }
    const url = URL.createObjectURL(f);
    const im = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
    URL.revokeObjectURL(url);
    if (!im) { msg.textContent = '無法讀取圖片'; return; }
    if (original) {
      const o = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = original; });
      // 限定宣傳：可上載整張 1012×1350 透明圖層（Canva 逐層匯出），製作器會自動找出位置
      const fullLayer = promo && slot !== 'promo/bg' && im.naturalWidth === 1012 && im.naturalHeight === 1350;
      if (o && !fullLayer && (o.naturalWidth !== im.naturalWidth || o.naturalHeight !== im.naturalHeight) &&
        !confirm(`尺寸不同：原圖 ${o.naturalWidth}×${o.naturalHeight}，新圖 ${im.naturalWidth}×${im.naturalHeight}。製作器會按原圖位置繪畫，仍要使用？`)) return;
    }
    msg.textContent = '上載中…';
    const r = await api(`assets?kind=image&slot=${encodeURIComponent(slot)}&label=${encodeURIComponent(f.name)}`, { method: 'POST', raw: f, headers: { 'Content-Type': f.type || 'application/octet-stream' } });
    if ((/\.(png|webp)$/.test(slot) || (promo && slot !== 'promo/bg')) && !r.alpha && !confirm('新圖沒有透明背景，原圖是透明圖層。仍要使用？')) { msg.textContent = '已取消（圖片已上載但未套用）'; return; }
    S.work.assets[slot] = r.assetId; markDirty(); viewAssets();
  });
  return h('div', { class: 'slot' + (id ? ' changed' : '') }, pv, h('div', { text: (SLOT_NAMES[slot] ? SLOT_NAMES[slot] + ' · ' : '') + slot }),
    id ? h('span', { class: 'badge warn', text: '已替換（草稿）' }) : '', msg,
    h('div', { class: 'row', style: 'margin-top:6px' },
      h('button', { class: 'btn small', type: 'button', onclick: () => file.click() }, '更換'),
      id ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => { delete S.work.assets[slot]; markDirty(); viewAssets(); } }, '恢復原圖') : ''),
    file);
}
// 每日更表 1–6 人版型：拖動相框位置、調整大小
function layoutCard() {
  const n = S.layoutN;
  const layouts = S.work.pages.daily.layouts ||= {};
  const cur = layouts[n] ? clone(layouts[n]) : clone(DAILY_LAYOUTS[n]);
  const cv = h('canvas', { class: 'layout-cv', width: 506, height: 675 });
  const c = cv.getContext('2d'), sc = 0.5;
  const bg = new Image(); bg.src = '/daily/bg.jpg'; bg.onload = () => draw();
  const draw = () => {
    c.clearRect(0, 0, 506, 675);
    if (bg.complete && bg.naturalWidth) c.drawImage(bg, 0, 0, 506, 675); else { c.fillStyle = '#2a1f38'; c.fillRect(0, 0, 506, 675); }
    cur.c.forEach(([x, y], i) => {
      const w = FW * cur.k * sc, hh = FH * cur.k * sc;
      c.fillStyle = 'rgba(205,168,94,.35)'; c.strokeStyle = '#cda85e'; c.lineWidth = 2;
      c.fillRect(x * sc - w / 2, y * sc - hh / 2, w, hh); c.strokeRect(x * sc - w / 2, y * sc - hh / 2, w, hh);
      c.fillStyle = '#fff'; c.font = 'bold 22px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(i + 1), x * sc, y * sc);
    });
  };
  const commit = () => { layouts[n] = { k: Math.round(cur.k * 100) / 100, c: cur.c.map(([x, y]) => [Math.round(x * 2) / 2, Math.round(y * 2) / 2]) }; markDirty(); };
  let drag = -1;
  const at = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 1012, (e.clientY - r.top) / r.height * 1350]; };
  cv.addEventListener('pointerdown', e => {
    const [x, y] = at(e);
    drag = cur.c.findIndex(([cx, cy]) => Math.abs(cx - x) < FW * cur.k / 2 && Math.abs(cy - y) < FH * cur.k / 2);
    if (drag >= 0) cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', e => { if (drag < 0) return; const [x, y] = at(e); cur.c[drag] = [Math.max(0, Math.min(1012, x)), Math.max(0, Math.min(1350, y))]; draw(); });
  const end = () => { if (drag >= 0) { drag = -1; commit(); } };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  const k = h('input', { type: 'range', min: 0.5, max: 2, step: 0.01, value: cur.k, 'aria-label': '相框大小' });
  k.oninput = () => { cur.k = +k.value; draw(); }; k.onchange = commit;
  draw();
  return h('div', { class: 'card' }, h('h2', { text: '每日更表相框版型' }),
    h('p', { class: 'muted', text: '每個人數的版型互不影響。拖動編號相框調整預設位置，用滑桿調整預設大小。' }),
    h('div', { class: 'chips' }, [1, 2, 3, 4, 5, 6].map(i => h('button', { type: 'button', style: i === n ? 'background:var(--gold);color:#1a1020' : '', onclick: () => { S.layoutN = i; viewAssets(); } },
      `${i} 人${layouts[i] ? ' ●' : ''}`))),
    cv, h('div', { class: 'field' }, h('span', { text: '大小' }), k, h('span')),
    h('button', { class: 'btn small ghost', type: 'button', onclick: () => { delete layouts[n]; markDirty(); viewAssets(); } }, `恢復 ${n} 人內建版型`));
}

// ================================================================ 宣傳文案
function renderTpl(t, v) {
  const missing = new Set(), unknown = new Set();
  const text = t.replace(/\{\{\s*([^}]*?)\s*\}\}/g, (m, k) => {
    if (!(k in FIELD_INFO)) { unknown.add(k); return m; }
    if (!v[k]) { missing.add(k); return m; }
    return v[k];
  });
  return { text, missing: [...missing], unknown: [...unknown] };
}
function viewCopy() {
  const root = $('v-copy');
  const page = S.copyPage, c = S.work.copy[page] ||= { enabled: false, template: '' };
  const ta = h('textarea', { 'aria-label': '文案內容', spellcheck: false });
  ta.value = c.template;
  const out = h('div', { class: 'copy-out', 'aria-live': 'polite' });
  const warn = h('p', { class: 'msg' });
  const sample = { ...SAMPLE };
  const update = () => {
    const r = renderTpl(ta.value, sample);
    out.textContent = r.text;
    const w = [];
    if (r.unknown.length) w.push('未知欄位（發佈時會被拒絕）：' + r.unknown.join('、'));
    if (r.missing.length) w.push('以下欄位未有示範資料：' + r.missing.join('、'));
    warn.textContent = w.join('；'); warn.className = 'msg' + (r.unknown.length ? ' err' : '');
  };
  ta.oninput = () => { c.template = ta.value; markDirty(); update(); };
  const en = h('input', { type: 'checkbox', checked: c.enabled });
  en.onchange = () => { c.enabled = en.checked; markDirty(); };
  const insert = key => () => {
    const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? s, tok = `{{${key}}}`;
    ta.value = ta.value.slice(0, s) + tok + ta.value.slice(e); ta.focus(); ta.setSelectionRange(s + tok.length, s + tok.length); ta.oninput();
  };
  const samples = Object.keys(FIELD_INFO).map(k => {
    const inp = h(k === 'RESIDENT_LIST' ? 'textarea' : 'input', { 'aria-label': FIELD_INFO[k] + '示範', style: k === 'RESIDENT_LIST' ? 'min-height:60px' : '' });
    inp.value = sample[k]; inp.oninput = () => { sample[k] = inp.value; update(); };
    return h('label', {}, `${FIELD_INFO[k]} {{${k}}}`, inp);
  });
  const prevVersion = S.versions.find(v => v.version_id !== S.published.version_id && v.status !== 'draft');
  root.replaceChildren(h('div', { class: 'card' },
    h('h2', { text: '宣傳文案模板' }),
    h('div', { class: 'chips' }, Object.entries(COPY_PAGES).map(([k, l]) =>
      h('button', { type: 'button', style: k === page ? 'background:var(--gold);color:#1a1020' : '', onclick: () => { S.copyPage = k; viewCopy(); } }, l + (S.work.copy[k]?.enabled ? '' : '（停用）')))),
    h('label', { class: 'row' }, en, ' 啟用：下載成功後彈出這份文案'),
    h('p', { class: 'muted', text: '欄位只會以純文字代入，不會執行 HTML。Emoji、特殊字元及換行都會原樣保留。按下面按鈕在游標位置插入欄位：' }),
    h('div', { class: 'chips' }, Object.entries(FIELD_INFO).map(([k, l]) => h('button', { type: 'button', title: l, onclick: insert(k) }, `{{${k}}}`))),
    h('div', { class: 'copy-wrap' }, h('div', {}, h('label', {}, '模板'), ta), h('div', {}, h('label', {}, '即時預覽（示範資料）'), out)),
    warn,
    prevVersion ? h('button', { class: 'btn small ghost', type: 'button', onclick: guard(async () => {
      const v = await api('config/versions/' + prevVersion.version_id);
      const t = v.body.copy?.[page];
      if (!t) { say('上一版本沒有這份文案', 'err'); return; }
      if (!confirm(`用版本 v${prevVersion.version_id} 的文案取代目前草稿內容？`)) return;
      Object.assign(c, clone(t)); markDirty(); viewCopy();
    }) }, `載入上一版本（v${prevVersion.version_id}）的文案`) : ''),
    h('details', { class: 'card' }, h('summary', { text: '修改示範資料' }), samples));
  update();
}

// ================================================================ 版本紀錄
function flatten(o, p = '', out = new Map()) {
  if (o && typeof o === 'object' && !Array.isArray(o)) { for (const [k, v] of Object.entries(o)) flatten(v, p ? p + '.' + k : k, out); }
  else if (Array.isArray(o) && o.length && typeof o[0] === 'object' && !Array.isArray(o[0])) o.forEach((v, i) => flatten(v, `${p}[${i}]`, out));
  else out.set(p, JSON.stringify(o));
  return out;
}
function diffView(a, b) {
  const A = flatten(a), B = flatten(b), keys = [...new Set([...A.keys(), ...B.keys()])].sort();
  const lines = keys.filter(k => A.get(k) !== B.get(k));
  const box = h('div', { class: 'diff' });
  if (!lines.length) box.textContent = '沒有差異';
  for (const k of lines) {
    const cut = s => s === undefined ? '（沒有）' : s.length > 300 ? s.slice(0, 300) + '…' : s;
    box.append(h('div', {}, h('b', { text: k })), h('div', { class: 'a', text: '－ ' + cut(A.get(k)) }), h('div', { class: 'b', text: '＋ ' + cut(B.get(k)) }));
  }
  return box;
}
async function viewVersions() {
  const root = $('v-versions');
  const draftDiff = S.dirty || S.draft ? h('div', { class: 'card' }, h('h2', { text: '草稿與正式版本的差異' }), diffView(S.published.body, S.work)) : '';
  const list = S.versions.map(v => h('div', { class: 'ver' },
    h('div', { class: 't' }, h('b', { text: `v${v.version_id}` }), ' ',
      h('span', { class: 'badge' + (v.status === 'published' ? ' warn' : ''), text: v.status === 'published' ? '正式版本' : '舊版本' }),
      h('div', { text: v.summary || '（沒有摘要）' }),
      h('div', { class: 'muted', text: `發佈：${fmt(v.published_at)} · ${v.published_by || v.created_by}` })),
    h('div', { class: 'row' },
      h('button', { class: 'btn small', type: 'button', onclick: guard(async () => {
        const d = await api('config/versions/' + v.version_id);
        modal(`v${v.version_id} → 目前正式版本 v${S.published.version_id} 的差異`, diffView(d.body, S.published.body));
      }) }, '差異'),
      v.status !== 'published' ? h('button', { class: 'btn small', type: 'button', onclick: guard(async () => {
        if (!confirm(`還原至 v${v.version_id}？會建立一個新的正式版本，公開製作器隨即使用。`)) return;
        await api('config/restore', { method: 'POST', body: { versionId: v.version_id, currentId: S.published.version_id } });
        await loadConfig(); say(`已還原至 v${v.version_id}`, 'ok'); viewVersions();
      }) }, '還原') : '')));
  const log = h('div', { class: 'diff' }, '載入中…');
  root.replaceChildren(draftDiff, h('div', { class: 'card' }, h('h2', { text: '設定版本（最近 30 個）' }), list),
    h('details', { class: 'card' }, h('summary', { text: '操作日誌（最近 100 項）' }), log));
  try {
    const d = await api('audit');
    log.replaceChildren(...d.log.map(l => h('div', { text: `${fmt(l.at)}  ${l.actor}  ${l.action}${l.target ? '  ' + l.target : ''}` })));
  } catch { log.textContent = '未能載入'; }
}

// ---------------------------------------------------------------- boot
(async () => {
  try { const me = await api('me'); await start(me.actor); }
  catch (e) { if (e.status !== 401) { showLogin(); $('loginMsg').textContent = e.message; } }
})();
})();
