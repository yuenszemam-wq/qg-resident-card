/* QG local export history and visible progress — no remote storage or new Cloudflare resource. */
(() => {
'use strict';
const MAX=10, dbName='qg-card-history-v1', storeName='records', calendarKey='qg.calendar.recent.v1';
const $=id=>document.getElementById(id);
let dbPromise;
function db(){
  if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
    try{
      const request=indexedDB.open(dbName,1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(storeName))request.result.createObjectStore(storeName,{keyPath:'id'});};
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(Error('資料庫使用中'));
    }catch(err){reject(err)}
  }).catch(err=>{dbPromise=null;throw err});
  return dbPromise;
}
async function transaction(mode,fn){
  const d=await db();
  return new Promise((resolve,reject)=>{
    const tx=d.transaction(storeName,mode),store=tx.objectStore(storeName);
    let value,requestError=null;const req=fn(store);
    if(req){
      req.onsuccess=()=>{value=req.result};
      req.onerror=()=>{requestError=req.error||new Error('IDB request failed')};
    }
    tx.oncomplete=()=>resolve(value);
    tx.onerror=()=>{requestError=tx.error||requestError||new Error('IDB transaction error')};
    tx.onabort=()=>reject(tx.error||requestError||new Error('IDB transaction aborted'));
  });
}
const all=()=>transaction('readonly',s=>s.getAll());
const asBlob=(canvas,type='image/jpeg',quality=.85)=>new Promise(resolve=>{if(!canvas){resolve(null);return;}canvas.toBlob(resolve,type,quality);});
const binary=async blob=>blob?await blob.arrayBuffer():null;
const imageBytes=value=>value instanceof Blob?value:(value?new Blob([value],{type:'image/jpeg'}):null);
async function thumb(canvas){
  if(!canvas)return null;
  const target=document.createElement('canvas');
  target.width=176;target.height=235;
  target.getContext('2d').drawImage(canvas,0,0,target.width,target.height);
  return asBlob(target,'image/jpeg',.76);
}
const names={promo:'限定居民宣傳',shadow:'影子精靈',calendar:'QG 月曆'};
const ids={promo:'tab-promo',shadow:'tab-shadow',calendar:'tab-calendar'};
const containers={};
const urls=new Map();
function status(template,message){
  const el=containers[template]?.querySelector('.qg-hist-status');
  if(el)el.textContent=message||'';
}
function card(template){
  const root=$(ids[template]);if(!root)return;
  const panel=document.createElement('section');panel.className='panel qg-card-history';
  // 同每週更表一樣的「最近 10 次記錄」格仔
  panel.innerHTML='<label>最近 10 次記錄</label><div class="qg-hist-list"></div><div class="adj-sum qg-hist-status" role="status"></div>';
  const anchor=template==='promo'?$('saveBox'):template==='shadow'?$('sh-saveBox'):$('cal-save');
  if(anchor)anchor.insertAdjacentElement('afterend',panel);else root.append(panel);
  containers[template]=panel;
}
function layoutProgress(template){
  const root=$(ids[template]||'tab-'+template);
  if(!root)return;
  const node=document.createElement('div');
  node.id='qg-progress-'+template;node.className='qg-export-progress';node.hidden=true;
  node.setAttribute('role','status');node.setAttribute('aria-live','polite');
  node.innerHTML='<div class="qg-progress-label">準備中</div><progress max="100" value="0"></progress><span class="qg-progress-value">0%</span>';
  // 進度條放在下載按鈕下面
  const target=template==='calendar'?$('cal-status'):root.querySelector('.wk-btns');
  if(target)target.insertAdjacentElement('afterend',node);else root.append(node);
}
function progress(template,value,label){
  const el=$('qg-progress-'+template);if(!el)return;
  el.hidden=false;
  const v=Math.round(Math.min(100,Math.max(0,value)));
  el.querySelector('progress').value=v;
  el.querySelector('.qg-progress-value').textContent=v+'%';
  el.querySelector('.qg-progress-label').textContent=label||'處理中';
}
function finish(template,ok=true,label){
  progress(template,100,label||(ok?'已完成，可以繼續操作':'已停止'));
  const el=$('qg-progress-'+template);if(el)el.dataset.status=ok?'done':'error';
}
function fail(template,message){finish(template,false,message||'處理失敗');}
async function record(template,data,canvas,photo){
  if(!names[template])return;
  try{
    // The calendar has no uploaded photo: keep its compact ten-entry history
    // synchronously in localStorage, including a small thumbnail, so export
    // and iPhone share-sheet navigation cannot interrupt IndexedDB writes.
    if(template==='calendar'){
      const miniature=document.createElement('canvas');miniature.width=176;miniature.height=220;
      if(canvas)miniature.getContext('2d').drawImage(canvas,0,0,176,220);
      const item={id:'calendar:'+Date.now()+':'+Math.random().toString(36).slice(2,7),template,ts:Date.now(),data:JSON.parse(JSON.stringify(data)),thumbUrl:canvas?miniature.toDataURL('image/jpeg',.73):null};
      const saved=JSON.parse(localStorage.getItem(calendarKey)||'[]');
      saved.unshift(item);localStorage.setItem(calendarKey,JSON.stringify(saved.slice(0,MAX)));
      await display('calendar');return;
    }
    const entry={id:template+':'+Date.now()+':'+Math.random().toString(36).slice(2,8),template,ts:Date.now(),
      data:typeof structuredClone==='function'?structuredClone(data):JSON.parse(JSON.stringify(data)),
      thumb:await binary(await thumb(canvas)),photo:await binary(await asBlob(photo,'image/jpeg',.9))};
    await transaction('readwrite',s=>s.put(entry));
    const entries=(await all()).filter(e=>e.template===template).sort((a,b)=>b.ts-a.ts);
    if(entries.length>MAX)await transaction('readwrite',s=>{for(const old of entries.slice(MAX))s.delete(old.id);});
    await display(template);
  }catch(err){status(template,'未能儲存記錄：'+(err?.name||'Error')+' '+(err?.message||'請檢查儲存空間'));}
}
function imageFromBlob(blob){
  return new Promise((resolve,reject)=>{
    if(!blob){resolve(null);return;}
    const url=URL.createObjectURL(imageBytes(blob)),img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);const cv=document.createElement('canvas');cv.width=img.naturalWidth;cv.height=img.naturalHeight;cv.getContext('2d').drawImage(img,0,0);resolve(cv);};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('相片無法讀取'))};img.src=url;
  });
}
function inputValue(id,value){
  const el=$(id);if(!el)return;
  el.value=value??'';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
}
function mergeObject(target,values){
  if(!target||!values)return;
  for(const [k,v]of Object.entries(values)){
    if(target[k]&&typeof target[k]==='object'&&v&&typeof v==='object'&&!Array.isArray(v))mergeObject(target[k],v);
    else if(typeof target[k]===typeof v)target[k]=v;
  }
}
async function restore(entry){
  const {template,data}=entry,photo=await imageFromBlob(entry.photo);
  if(template==='promo'){
    inputValue('name',data.name);inputValue('ig',data.ig);inputValue('date',data.date);
    const p=window.qgPromoView;if(p){
      if(photo){
        p.state.photo=photo;
        const blur=document.createElement('canvas');
        blur.width=Math.max(8,Math.round(photo.width/22));blur.height=Math.max(8,Math.round(photo.height/22));
        blur.getContext('2d').drawImage(photo,0,0,blur.width,blur.height);
        p.state.blur=blur;
      }
      mergeObject(p.state.adj,data.adj);mergeObject(p.state.font,data.font);
      p.state.zoom=data.zoom??1;p.state.dx=data.dx??0;p.state.dy=data.dy??0;
      p.clampPos();
      p.render(0,true);
      p.saveLayout?.();
    }
  }else if(template==='shadow'){
    inputValue('sh-name',data.name);inputValue('sh-ig',data.ig);inputValue('sh-date',data.date);
    const sh=window.qgShadow;if(sh){
      if(photo)sh.model.photo=photo;
      mergeObject(sh.model.adj,data.adj);mergeObject(sh.model.font,data.font);
      sh.model.zoom=data.zoom??1;sh.model.dx=data.dx??0;sh.model.dy=data.dy??0;
      sh.refreshControls();sh.redraw();sh.saveLayout();
    }
  }else if(template==='calendar'){
    inputValue('cal-year',data.year);inputValue('cal-month',data.month);
    const key=data.year+'-'+String(data.month).padStart(2,'0');
    const storage='qg.calendar.crowns.v1';
    const values=JSON.parse(localStorage.getItem(storage)||'{}');
    values[key]=Array.isArray(data.days)?data.days:[];
    localStorage.setItem(storage,JSON.stringify(values));
    $('cal-month')?.dispatchEvent(new Event('change',{bubbles:true}));
  }
  window.qgEditor?.sync(template);
  status(template,'已載入記錄；可以繼續調整後重新下載');
  $(ids[template])?.scrollIntoView({behavior:'smooth',block:'start'});
}
async function display(template){
  const panel=containers[template];if(!panel)return;
  const list=panel.querySelector('.qg-hist-list');
  try{
    const entries=(template==='calendar'?JSON.parse(localStorage.getItem(calendarKey)||'[]'):(await all()).filter(e=>e.template===template)).sort((a,b)=>b.ts-a.ts).slice(0,MAX);
    for(const u of urls.get(template)||[])URL.revokeObjectURL(u);
    const fresh=[];urls.set(template,fresh);
    list.replaceChildren();
    if(!entries.length){status(template,'未有記錄。下載圖片或影片後會自動記錄最近 10 次。');return;}
    status(template,'按記錄可以重新載入當時的內容及微調，按 × 刪除');
    for(const entry of entries){
      const row=document.createElement('div');row.className='qg-hist-row';
      const load=document.createElement('button');load.type='button';load.className='qg-hist-load';
      if(entry.thumb||entry.thumbUrl){const img=document.createElement('img');if(entry.thumb){const u=URL.createObjectURL(imageBytes(entry.thumb));fresh.push(u);img.src=u;}else img.src=entry.thumbUrl;img.alt='';load.append(img);}
      const title=document.createElement('span');title.className='d';title.textContent=entry.template==='calendar'?entry.data.year+'-'+String(entry.data.month).padStart(2,'0'):(entry.data.name||'未命名');
      const d=new Date(entry.ts),when=document.createElement('span');when.className='w';
      when.textContent=d.getDate()+'/'+(d.getMonth()+1)+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+' 儲存';
      load.append(title,when);
      load.onclick=()=>restore(entry).catch(()=>status(template,'無法載入此記錄'));
      const del=document.createElement('button');del.type='button';del.className='qg-hist-delete';del.textContent='×';del.setAttribute('aria-label','刪除這次記錄');
      del.onclick=async()=>{
        // Confirmation protects against accidental deletion on narrow screens.
        if(!confirm('刪除這筆本機記錄？'))return;
        try{if(template==='calendar'){
          const values=JSON.parse(localStorage.getItem(calendarKey)||'[]').filter(x=>x.id!==entry.id);
          localStorage.setItem(calendarKey,JSON.stringify(values));
        }else await transaction('readwrite',s=>s.delete(entry.id));
        await display(template);}catch{status(template,'刪除失敗');}
      };
      row.append(load,del);list.append(row);
    }
  }catch(err){status(template,'此瀏覽器未能讀取本機紀錄（例如私密瀏覽模式）');}
}
function caption(template,title,text){
  const id='qg-last-caption-'+template,root=$(ids[template]);if(!root||!text)return;
  let block=$(id);
  if(!block){
    block=document.createElement('section');block.className='panel qg-saved-caption';block.id=id;
    const h=document.createElement('strong');h.className='qg-caption-title';
    const p=document.createElement('pre');p.className='qg-caption-body';
    const copy=document.createElement('button');copy.className='btn primary';copy.type='button';copy.textContent='複製宣傳文案';
    const msg=document.createElement('span');msg.className='qg-caption-msg';
    copy.onclick=async()=>{
      const content=p.textContent;
      let ok=false;
      try{await navigator.clipboard.writeText(content);ok=true;}catch{}
      if(!ok&&typeof legacyCopy==='function')ok=legacyCopy(content);
      if(ok){copy.textContent='✓ 已複製';msg.textContent='已複製完整文案，可以直接貼上';setTimeout(()=>{copy.textContent='複製宣傳文案';},2500);}
      else{const r=document.createRange();r.selectNodeContents(p);const s=getSelection();s.removeAllRanges();s.addRange(r);msg.textContent='未能自動複製，已幫你選取文字，請長按後選「拷貝」';}
    };
    block.append(h,p,copy,msg);
    const after=containers[template];if(after)after.insertAdjacentElement('beforebegin',block);else root.append(block);
  }
  block.querySelector('.qg-caption-title').textContent=title;
  block.querySelector('.qg-caption-body').textContent=text;
}
window.qgWorkflow={progress,finish,fail,record,caption,refresh:display,restore};
for(const name of ['promo','shadow','calendar'])card(name);
for(const name of ['promo','shadow','calendar','weekly','daily'])layoutProgress(name);
for(const name of ['promo','shadow','calendar'])display(name);
})();