// 每週更表：從 Google Drive 資料夾揀相片。
// 需要先登入管理中心（相片經 /api/admin/drive/* 讀取，資料夾內容不公開）。
// 「封存」只記錄在本系統（D1），不會移動或刪除 Google Drive 上的檔案。
(function(){
const API = '/api/admin/drive/photos';
const AUTO_KEY = 'qg-weekly-drive-auto';
const PAGE = 48; // 每次顯示的相片數（縮圖經管理 API 讀取，避免一次過太多請求）
const $ = id => document.getElementById(id);
const btn = $('wkDrive');
if(!btn) return;

function h(tag, attrs={}, ...kids){
  const el = document.createElement(tag);
  for(const [k,v] of Object.entries(attrs)){
    if(v==null || v===false) continue;
    if(k==='text') el.textContent = v;
    else if(k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v===true ? '' : v);
  }
  kids.flat().forEach(c=>c!=null && el.append(c));
  return el;
}
function readAuto(){ try{ return localStorage.getItem(AUTO_KEY)!=='0'; }catch(e){ return true; } }
function writeAuto(v){ try{ localStorage.setItem(AUTO_KEY, v?'1':'0'); }catch(e){} }

async function api(path, opts={}){
  const init = { credentials:'same-origin', ...opts, headers:{ ...(opts.headers||{}) } };
  if(opts.body!==undefined){ init.method = init.method||'POST'; init.headers['Content-Type']='application/json'; init.headers['X-QG-Admin']='1'; init.body = JSON.stringify(opts.body); }
  const res = await fetch(API+path, init);
  if(!res.ok){
    let msg = '';
    try{ msg = (await res.json()).message || ''; }catch(e){}
    const err = new Error(msg || ('讀取失敗（'+res.status+'）')); err.status = res.status; throw err;
  }
  return res;
}

// ---------- 彈窗 ----------
let view = 'new', photos = [], shown = PAGE, loading = false;
const title = h('h2', {id:'wkdTitle', text:'☁️ Google Drive 相片'});
const close = h('button', {class:'xbtn', type:'button', 'aria-label':'關閉', text:'×', onclick:()=>hide()});
const refresh = h('button', {class:'small', type:'button', text:'↻ 重新整理', onclick:()=>load()});
const segNew = h('button', {type:'button', class:'on', 'aria-pressed':'true', onclick:()=>setView('new')});
const segArc = h('button', {type:'button', 'aria-pressed':'false', onclick:()=>setView('archived')});
const autoBox = h('input', {type:'checkbox', id:'wkdAuto'});
autoBox.checked = readAuto();
autoBox.addEventListener('change', ()=>writeAuto(autoBox.checked));
const msg = h('div', {class:'wkd-msg', 'aria-live':'polite'});
const grid = h('div', {class:'wkd-grid'});
const more = h('button', {class:'small wkd-more', type:'button', hidden:true, text:'顯示更多', onclick:()=>{ shown += PAGE; draw(); }});
const modal = h('div', {class:'modal wkd', id:'wkDriveModal', hidden:true, role:'dialog', 'aria-modal':'true', 'aria-labelledby':'wkdTitle'},
  h('div', {class:'sheet'},
    h('div', {class:'sheet-head'}, title, close),
    h('div', {class:'wkd-bar'},
      h('div', {class:'seg two'}, segNew, segArc),
      h('div', {class:'wkd-row'},
        h('label', {class:'wkd-auto', for:'wkdAuto'}, autoBox, h('span', {text:'下載更表後自動封存相片'})),
        refresh)),
    h('div', {class:'wkd-body'}, msg, grid, more)));
document.body.append(modal);
modal.addEventListener('click', e=>{ if(e.target===modal) hide(); });
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && !modal.hidden) hide(); });

function show(){ modal.hidden = false; document.body.classList.add('wkd-open'); load(); close.focus(); }
function hide(){ modal.hidden = true; document.body.classList.remove('wkd-open'); btn.focus(); }
btn.addEventListener('click', ()=>{ if(!window.qgWeekly?.isBusy()) show(); });

function setView(v){
  view = v; shown = PAGE;
  segNew.classList.toggle('on', v==='new'); segNew.setAttribute('aria-pressed', v==='new');
  segArc.classList.toggle('on', v==='archived'); segArc.setAttribute('aria-pressed', v==='archived');
  draw();
}
function counts(){
  const arc = photos.filter(p=>p.archived).length;
  segNew.textContent = `未使用（${photos.length-arc}）`;
  segArc.textContent = `已封存（${arc}）`;
}
function say(text, link){
  msg.replaceChildren(text ? h('span', {text}) : '', link ? h('a', {href:link.href, target:'_blank', rel:'noopener', text:link.text}) : '');
}

async function load(){
  if(loading) return;
  loading = true; refresh.disabled = true;
  say('載入中…'); grid.replaceChildren(); more.hidden = true;
  try{
    const data = await (await api('')).json();
    if(!data.configured){
      photos = []; counts();
      say('Google Drive 資料夾尚未設定。請在 Cloudflare 設定 DRIVE_FOLDER_ID 及 GOOGLE_SERVICE_ACCOUNT_JSON。');
      return;
    }
    photos = data.photos || [];
    counts(); draw();
  }catch(err){
    photos = []; counts();
    if(err.status===401) say('要先登入管理中心先可以讀取 Drive 相片。登入後回來按「↻ 重新整理」。 ', {href:'/admin/', text:'前往管理中心登入 ›'});
    else say(err.message || '讀取失敗，請稍後再試');
  }finally{ loading = false; refresh.disabled = false; }
}

const fmtDate = iso => { if(!iso) return ''; const d = new Date(iso); return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`; };
function draw(){
  const list = photos.filter(p=>view==='archived' ? p.archived : !p.archived);
  if(!list.length){
    say(view==='archived' ? '未有封存相片。' : (photos.length ? '全部相片已封存。可以在「已封存」還原。' : '資料夾內未有相片。'));
  }else say(view==='archived' ? '已封存的相片不會出現在「未使用」。按「還原」可以放返出嚟。' : '按相片載入到更表。');
  grid.replaceChildren(...list.slice(0, shown).map(card));
  more.hidden = list.length <= shown;
}
function card(p){
  const note = p.archived
    ? (p.archiveReason==='auto' ? '下載後自動封存' : '手動封存') + (p.archivedAt ? ' · '+fmtDate(p.archivedAt) : '')
    : (p.useCount ? `已用 ${p.useCount} 次` : fmtDate(p.createdTime));
  const pick = h('button', {type:'button', class:'wkd-pick', 'aria-label':'載入 '+p.name, onclick:()=>pickPhoto(p, pick)},
    h('img', {src:`${API}/${encodeURIComponent(p.id)}/thumb`, alt:'', loading:'lazy', decoding:'async'}),
    h('span', {class:'n', text:p.name}), h('span', {class:'w', text:note}));
  const arc = h('button', {type:'button', class:'small wkd-arc', text:p.archived ? '↩︎ 還原' : '📦 封存',
    'aria-label':(p.archived ? '還原 ' : '封存 ')+p.name, onclick:()=>setArchived(p, !p.archived, arc)});
  return h('div', {class:'wkd-item'+(window.qgWeekly?.state.driveId===p.id ? ' cur' : '')}, pick, arc);
}

async function setArchived(p, archived, el){
  el.disabled = true;
  try{
    await api(`/${encodeURIComponent(p.id)}/archive`, {body:{archived}});
    p.archived = archived; p.archiveReason = archived ? 'manual' : ''; p.archivedAt = archived ? new Date().toISOString() : null;
    counts(); draw();
  }catch(err){ el.disabled = false; say(err.status===401 ? '登入已過期，請重新登入管理中心' : (err.message || '未能更新，請再試')); }
}

async function pickPhoto(p, el){
  if(window.qgWeekly?.isBusy()) return;
  el.classList.add('busy'); say('下載相片中…');
  try{
    const blob = await (await api(`/${encodeURIComponent(p.id)}/content`)).blob();
    const ok = await window.qgWeekly.loadPhoto(blob, p.id);
    if(!ok){ say('相片讀取失敗，請換一張再試'); return; }
    hide();
    window.qgWeekly.say('已載入 Drive 相片：'+p.name+(readAuto() ? '（下載更表後會自動封存）' : ''));
  }catch(err){ say(err.status===401 ? '登入已過期，請重新登入管理中心' : (err.message || '相片下載失敗，請再試')); }
  finally{ el.classList.remove('busy'); }
}

// 由 index.html 在圖片或影片下載成功後呼叫
async function used(id){
  const auto = readAuto();
  try{
    const r = await (await api(`/${encodeURIComponent(id)}/used`, {body:{autoArchive:auto}})).json();
    const p = photos.find(x=>x.id===id);
    if(p){ p.useCount = r.useCount; if(r.archived && !p.archived){ p.archived = true; p.archiveReason = 'auto'; p.archivedAt = new Date().toISOString(); } }
    const st = $('wkStatus');
    if(auto && r.archived && st && !st.textContent.includes('Drive 相片已封存')){
      st.textContent = (st.textContent ? st.textContent+' · ' : '')+'Drive 相片已封存（可在「已封存」還原）';
    }
  }catch(err){ /* 記錄失敗不影響已完成的下載 */ }
}
window.qgWeeklyDrive = { used, open:show };
})();
