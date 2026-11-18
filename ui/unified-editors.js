/* QG editors: consistent full-card photo controls and promo-style text tuning.
   Media templates, saved transforms and export engine remain in their own modules. */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const node=(tag,cls,txt)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(txt)el.textContent=txt;return el;};
const btn=(txt,id,cls='small')=>{const b=node('button',cls,txt);b.type='button';b.id=id;return b;};
const modal=(id,title,source,play)=>{
  const el=node('div','editor qg-unified-editor');el.id=id;el.hidden=true;
  el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label',title);
  el.innerHTML='<div class="ed-head"><h2></h2><button type="button" class="small qg-editor-play">▶ 播放</button><button type="button" class="ed-done qg-editor-done">完成</button></div><div class="ed-view"><canvas width="1012" height="1350" aria-label="卡片即時預覽"></canvas></div><div class="ed-ctrl"><div class="qg-unified-controls"></div></div>';
  el.querySelector('h2').textContent=title;
  document.body.append(el);
  const e={el,canvas:el.querySelector('canvas'),view:el.querySelector('.ed-view'),controls:el.querySelector('.qg-unified-controls'),source,timer:0,opened:false,resize:null,onclose:null};
  e.resize=()=>{
    if(!e.opened)return;
    const w=e.view.clientWidth-16,h=e.view.clientHeight-16;
    if(w<1||h<1)return;
    const cw=Math.min(w,h*1012/1350);
    e.canvas.style.width=cw+'px';e.canvas.style.height=(cw*1350/1012)+'px';
  };
  e.paint=()=>{
    if(!e.opened)return;
    if(source){
      const cx=e.canvas.getContext('2d');
      cx.clearRect(0,0,e.canvas.width,e.canvas.height);
      cx.drawImage(source,0,0,1012,1350);
    }
    e.timer=requestAnimationFrame(e.paint);
  };
  el.querySelector('.qg-editor-play').onclick=()=>play?.();
  el.querySelector('.qg-editor-done').onclick=()=>hide(e);
  return e;
};
let savedOverflow=null;
const all=[];
function show(e){
  for(const other of all){if(other!==e&&other.opened)hide(other);}
  if(!all.some(x=>x.opened)) savedOverflow=document.body.style.overflow;
  e.el.hidden=false;e.opened=true;
  document.body.style.overflow='hidden';
  requestAnimationFrame(()=>{e.resize();e.paint()});
}
function hide(e){
  if(!e.opened)return;
  e.opened=false;e.el.hidden=true;
  cancelAnimationFrame(e.timer);
  if(!all.some(x=>x.opened))document.body.style.overflow=savedOverflow||'';
  e.onclose?.();
}
window.addEventListener('resize',()=>all.forEach(e=>e.resize()));
window.visualViewport?.addEventListener('resize',()=>all.forEach(e=>e.resize()));
document.addEventListener('keydown',ev=>{if(ev.key==='Escape')all.forEach(e=>hide(e));});
function gestures(cv,move,pinch){
  const active=new Map();
  let last=0;
  cv.style.touchAction='none';
  cv.addEventListener('pointerdown',ev=>{
    ev.preventDefault();cv.setPointerCapture(ev.pointerId);
    active.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
    if(active.size===2){const [a,b]=[...active.values()];last=Math.hypot(a.x-b.x,a.y-b.y);}
  });
  cv.addEventListener('pointermove',ev=>{
    const old=active.get(ev.pointerId);if(!old)return;
    active.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
    if(active.size===2&&pinch){
      const [a,b]=[...active.values()],now=Math.hypot(a.x-b.x,a.y-b.y);
      if(last>0)pinch(now/last);
      last=now;
    }else if(active.size===1){
      const w=cv.getBoundingClientRect().width;
      if(w>0)move((ev.clientX-old.x)*1012/w,(ev.clientY-old.y)*1350/cv.getBoundingClientRect().height);
    }
  });
  function end(ev){active.delete(ev.pointerId);if(active.size<2)last=0;}
  cv.addEventListener('pointerup',end);cv.addEventListener('pointercancel',end);cv.addEventListener('lostpointercapture',end);
}
function photoControls(e,input,model,change,reset){
  const row=node('div','qg-photo-actions');
  const choose=btn('📷 更換照片',e.el.id+'Choose','btn');
  choose.onclick=()=>input?.click();
  const resetBtn=btn('重設位置',e.el.id+'Reset','small');
  resetBtn.onclick=()=>{reset();range.value=model.zoom||1;change();};
  row.append(choose,resetBtn);
  const hint=node('p','ed-tip','用手指拖動照片；雙指縮放，或使用下方滑桿調整');
  const label=node('label','qg-photo-zoom','縮放');
  const range=node('input');range.type='range';range.min=1;range.max=3;range.step='.01';
  range.value=model.zoom||1;range.setAttribute('aria-label','照片縮放');
  range.oninput=()=>{model.zoom=+range.value;change();};
  label.append(range);e.controls.append(row,hint,label);
  e.sync=()=>{range.value=model.zoom||1;};
}
const sh=window.qgShadow, promo=window.qgPromoView;
if(sh&&$('tab-shadow')){
  const tools=$('tab-shadow .promo-tools')||$('tab-shadow').querySelector('.promo-tools');
  const legacy=[...tools.querySelectorAll('details')];
  // Keep legacy sliders mounted for their original initialization/persistence; do not show duplicated controls.
  legacy.forEach(d=>{d.hidden=true;d.classList.add('qg-legacy-controls')});
  $('shOpenPhoto')?.remove();
  const preview=$('sh-preview');
  const photo=modal('shPhotoEditor','影子精靈｜相片調整',preview,()=>{$('sh-play')?.click();});
  all.push(photo);
  const update=()=>{sh.redraw();sh.saveLayout()};
  photoControls(photo,$('sh-photo'),sh.model,update,()=>{
    sh.model.zoom=1;sh.model.dx=0;sh.model.dy=0;sh.refreshControls();
  });
  gestures(photo.canvas,(x,y)=>{
    const p=sh.model.photo;if(!p)return;
    const scale=Math.max(602/p.width,746/p.height)*sh.model.zoom;
    const overflowX=p.width*scale-602,overflowY=p.height*scale-746;
    if(overflowX>0.01)sh.model.dx=clamp(sh.model.dx+x*200/overflowX,-100,100);
    if(overflowY>0.01)sh.model.dy=clamp(sh.model.dy+y*200/overflowY,-100,100);
    update();
  },factor=>{sh.model.zoom=clamp(sh.model.zoom*factor,1,3);photo.sync();update();});
  const stage=preview?.closest('.stage');
  if(stage){stage.setAttribute('role','button');stage.setAttribute('tabindex','0');stage.setAttribute('aria-label','按下以放大及調整相片');
    stage.addEventListener('click',()=>{if(!sh.busy()){photo.sync();show(photo);}});
    stage.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();photo.sync();show(photo);}});
  }
  // Shadow text controls use the same segmented header, font selector, step buttons
  // and reset actions as the limited resident card's editor.
  const text=modal('shEditor','文字微調',preview,()=>{$('sh-play')?.click();});
  all.push(text);
  const tip=node('p','ed-tip','可以直接在卡上拖動所選文字');
  const seg=node('div','seg');
  seg.setAttribute('role','tablist');
  const keys=[['name','名字'],['ig','IG'],['date','日期']];
  for(const [k,label]of keys){
    const b=btn(label,'shSeg'+k,'');b.dataset.k=k;b.setAttribute('role','tab');seg.append(b);
  }
  const fontRow=node('label','ed-font');fontRow.append(node('span',null,'字體'));
  const font=node('select');font.id='shEditorFont';fontRow.append(font);
  const rows=node('div');rows.id='shEditorRows';
  const fields=[['size','大小',-18,40],['dx','左右',-200,200],['dy','上下',-120,120]];
  for(const [key,label,min,max] of fields){
    const row=node('div','ed-row');row.append(node('span',null,label));
    const down=btn('−',null,'step');down.dataset.delta='-1';down.dataset.key=key;down.setAttribute('aria-label',label+'減少');
    const range=node('input');range.type='range';range.id='shRange'+key;range.dataset.key=key;range.min=min;range.max=max;range.step=1;
    const up=btn('+',null,'step');up.dataset.delta='1';up.dataset.key=key;up.setAttribute('aria-label',label+'增加');
    const output=node('output');output.id='shOutput'+key;
    row.append(down,range,up,output);rows.append(row);
  }
  const foot=node('div','ed-foot'),reset=btn('重設名字',null,'small'),resetAll=btn('全部重設',null,'small');
  foot.append(reset,resetAll);text.controls.append(tip,seg,fontRow,rows,foot);
  const fonts=[
    ['default','原本字體（預設）'],
    ['zen','Zen Kurenaido'],
    ['chiron','Chiron GoRound TC'],
    ['hand','Kalam 手寫'],
    ['serif','Georgia 古典']
  ];
  for(const [v,label]of fonts){const opt=node('option',null,label);opt.value=v;font.append(opt);}
  let selected='name';
  if(!sh.model.font)sh.model.font={name:'default',ig:'default',date:'default'};
  function updateText(){
    for(const [k]of keys){const b=$('shSeg'+k);b.classList.toggle('on',selected===k);b.setAttribute('aria-selected',String(selected===k));}
    const item=sh.model.adj[selected];for(const [k]of fields){$('shRange'+k).value=item[k];$('shOutput'+k).textContent=item[k];}
    reset.textContent='重設'+keys.find(x=>x[0]===selected)[1];
    font.value=sh.model.font[selected]||'default';
    tip.textContent=($('sh-'+selected)?.value||'').trim()?'可以直接在卡上拖動所選文字':'未輸入文字，先在下方欄位填寫';
  }
  seg.onclick=e=>{const b=e.target.closest('[data-k]');if(b){selected=b.dataset.k;updateText();}};
  rows.addEventListener('input',e=>{const k=e.target.dataset.key;if(!k)return;sh.model.adj[selected][k]=+e.target.value;updateText();update();});
  rows.addEventListener('click',e=>{const b=e.target.closest('[data-delta]');if(!b)return;const k=b.dataset.key,range=$('shRange'+k),item=sh.model.adj[selected];
    item[k]=clamp(item[k]+Number(b.dataset.delta),Number(range.min),Number(range.max));updateText();update();
  });
  font.onchange=()=>{sh.model.font[selected]=font.value;update();};
  reset.onclick=()=>{for(const [k]of fields)sh.model.adj[selected][k]=0;sh.model.font[selected]='default';updateText();update();};
  resetAll.onclick=()=>{for(const [k]of keys){for(const [f]of fields)sh.model.adj[k][f]=0;sh.model.font[k]='default';}updateText();update();};
  gestures(text.canvas,(x,y)=>{
    const a=sh.model.adj[selected];a.dx=clamp(Math.round(a.dx+x),-200,200);a.dy=clamp(Math.round(a.dy+y),-120,120);updateText();update();
  });
  const textBtn=$('shOpenText')||btn('✏️ 文字微調','shOpenText','adj-open');
  if(!textBtn.isConnected)tools.insertBefore(textBtn,$('sh-play'));
  textBtn.onclick=()=>{updateText();show(text)};
  text.onclose=()=>{$('shSum')?.classList.toggle('on',Object.values(sh.model.adj).some(a=>Object.values(a).some(v=>v)));};
  // Ensure photo resets and font edits remain saved on the existing v1 key.
  const summary=()=>{const changed=Object.values(sh.model.adj).filter(a=>Object.values(a).some(v=>v!==0)).length;const el=$('shSum');if(el)el.textContent=changed?'已調整 '+changed+' 個文字區塊':'未調整（原本位置）';};
  text.controls.addEventListener('input',summary);summary();
}
if(promo&&$('tab-promo')){
  const preview=$('cv'),tools=$('tab-promo').querySelector('.promo-tools');
  // Remove redundant photo-location entry; photo itself opens the same editing flow as weekly.
  const extra=$('promoPhotoExpand');extra?.remove();
  const oldDetails=tools?.querySelector('details');
  if(oldDetails){oldDetails.hidden=true;oldDetails.classList.add('qg-legacy-controls');}
  const photo=modal('promoPhotoEditor','限定居民宣傳｜相片調整',preview,()=>{$('play')?.click()});
  all.push(photo);
  const update=()=>{promo.clampPos();promo.render(0,true)};
  photoControls(photo,$('photo'),promo.state,update,()=>{
    promo.state.zoom=1;promo.state.dx=0;promo.state.dy=0;const z=$('zoom');if(z)z.value=1;
  });
  gestures(photo.canvas,(x,y)=>{promo.state.dx+=x;promo.state.dy+=y;update()},factor=>{
    promo.state.zoom=clamp(promo.state.zoom*factor,1,3);
    const z=$('zoom');if(z)z.value=promo.state.zoom;
    photo.sync();update();
  });
  const stage=$('stage');
  if(stage){stage.setAttribute('role','button');stage.setAttribute('tabindex','0');stage.setAttribute('aria-label','按下以放大及調整相片');
    stage.addEventListener('click',()=>{if(!promo.busy?.()){photo.sync();show(photo)}});
    stage.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();photo.sync();show(photo)}});
  }
  // Keep the limited card's original editor; hide its zoom-only button and add play.
  const oldZoom=$('edZoom');if(oldZoom)oldZoom.hidden=true;
  const header=$('editor')?.querySelector('.ed-head');
  if(header){
    const play=btn('▶ 播放','promoEditorPlay','small');header.insertBefore(play,$('edDone'));
    play.onclick=()=>{$('play')?.click()};
  }
  const title=$('#tab-promo h1');if(title)title.textContent='限定居民宣傳';
}
const wk=$('wkEd');
if(wk){
  // Weekly already has a play button; photo editor retains its enlarge control.
  const seg=$('wkEdSeg'),zoom=$('wkEdZoom');
  const updateZoom=()=>{if(zoom){const text=seg?.querySelector('[data-m=text]')?.classList.contains('on');zoom.hidden=Boolean(text);}};
  seg?.addEventListener('click',()=>requestAnimationFrame(updateZoom));
  updateZoom();
}
})();
