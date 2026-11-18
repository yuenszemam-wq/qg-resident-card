/* Queen's Garden unified editor controls, 2026-11-19. No data migration. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const clamp = (v,a,b) => Math.min(b,Math.max(a,v));
  const make = (tag, cls, txt) => {
    const e=document.createElement(tag);
    if(cls) e.className=cls;
    if(txt) e.textContent=txt;
    return e;
  };
  function button(label, id, cls='adj-open') {
    const b=make('button',cls,label);b.type='button';b.id=id;return b;
  }
  function modal(prefix,title) {
    const e=make('div','editor qg-unified-editor');e.id=prefix+'Editor';e.hidden=true;
    e.setAttribute('role','dialog');e.setAttribute('aria-modal','true');e.setAttribute('aria-label',title);
    e.innerHTML='<div class="ed-head"><h2>'+title+'</h2>'+
      '<button class="small" type="button" data-toggle-zoom>🔍 放大</button>'+
      '<button class="ed-done" type="button" data-close>✕ 退出</button></div>'+
      '<div class="ed-view qg-large-view"><canvas aria-label="放大即時預覽" width="1012" height="1350"></canvas></div>'+
      '<div class="ed-ctrl"><div class="qg-unified-controls"></div></div>';
    document.body.append(e);
    return {el:e, cv:e.querySelector('canvas'), view:e.querySelector('.ed-view'),
      control:e.querySelector('.qg-unified-controls')};
  }
  function showEditor(ed) {
    ed.el.hidden=false;
    ed.el.dataset.restoreOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    ed.el.classList.remove('qg-zoomed');
    const resize=()=>{
      if(ed.el.hidden) return;
      const aw=ed.view.clientWidth-16, ah=ed.view.clientHeight-16;
      const cw=Math.min(aw,ah*1012/1350);
      ed.cv.style.width=cw+'px';ed.cv.style.height=(cw*1350/1012)+'px';
    };
    ed.resize=resize;
    requestAnimationFrame(resize);
    ed.el.querySelector('[data-toggle-zoom]').textContent='🔍 放大';
    ed.el.querySelector('[data-toggle-zoom]').onclick=()=>{
      const on=ed.el.classList.toggle('qg-zoomed');
      ed.el.querySelector('[data-toggle-zoom]').textContent=on?'🔍 看全卡':'🔍 放大';
    };
    ed.el.querySelector('[data-close]').onclick=()=>hideEditor(ed);
  }
  function hideEditor(ed) {
    ed.el.hidden=true;
    ed.el.classList.remove('qg-zoomed');
    document.body.style.overflow=ed.el.dataset.restoreOverflow||'';
    if(ed.onclose)ed.onclose();
  }
  const editing=[];
  window.addEventListener('resize',()=>editing.forEach(ed=>ed.resize?.()));
  window.visualViewport?.addEventListener('resize',()=>editing.forEach(ed=>ed.resize?.()));
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape') editing.forEach(ed=>{if(!ed.el.hidden)hideEditor(ed)});
  });
  function mirror(ed,source) {
    const ctx=ed.cv.getContext('2d');
    const draw=()=> {
      if(ed.el.hidden)return;
      if(source) {
        ctx.clearRect(0,0,1012,1350);
        ctx.drawImage(source,0,0,1012,1350);
      }
      ed.timer=requestAnimationFrame(draw);
    };
    cancelAnimationFrame(ed.timer);
    ed.timer=requestAnimationFrame(draw);
  }
  function dragCanvas(cv,onDrag,onPinch) {
    const pts=new Map();
    let lastGap=0;
    cv.style.touchAction='none';
    cv.addEventListener('pointerdown',e=>{
      cv.setPointerCapture(e.pointerId);
      pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pts.size===2){
        const [a,b]=[...pts.values()];
        lastGap=Math.hypot(a.x-b.x,a.y-b.y);
      }
    });
    cv.addEventListener('pointermove',e=>{
      if(!pts.has(e.pointerId))return;
      const old=pts.get(e.pointerId);
      pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pts.size===2&&onPinch){
        const [a,b]=[...pts.values()],gap=Math.hypot(a.x-b.x,a.y-b.y);
        if(lastGap>0) onPinch(gap/lastGap);
        lastGap=gap;
      }else if(pts.size===1){
        const k=1012/cv.getBoundingClientRect().width;
        onDrag((e.clientX-old.x)*k,(e.clientY-old.y)*k);
      }
    });
    function end(e){
      pts.delete(e.pointerId);
      if(pts.size<2)lastGap=0;
    }
    cv.addEventListener('pointerup',end);
    cv.addEventListener('pointercancel',end);
  }
  // Shadow uses its existing image render/state/slider controls; moving these
  // controls does not reset existing localStorage layout settings.
  const sh=window.qgShadow;
  if(sh && $('tab-shadow')) {
    const panel=$('tab-shadow'), tools=panel.querySelector('.promo-tools');
    const details=[...tools.querySelectorAll('details')];
    const photoDetails=details[0],textDetails=details[1];
    const shEd=modal('sh','影子精靈｜放大預覽及調整');editing.push(shEd);
    const seg=make('div','seg two');
    seg.innerHTML='<button type="button" data-m="photo" class="on">相片</button>'+
      '<button type="button" data-m="text">文字</button>';
    shEd.control.append(seg);
    const photoBox=make('div','qg-editor-group');
    const textBox=make('div','qg-editor-group');
    shEd.control.append(photoBox,textBox);
    if(photoDetails){
      const crop=$('sh-crop');
      if(crop)photoBox.append(crop);
      photoDetails.remove();
    }
    if(textDetails){
      const select=$('sh-target'), adjust=$('sh-adjust');
      if(select){const label=make('label',null,'調整文字');label.append(select);textBox.append(label);}
      if(adjust)textBox.append(adjust);
      textDetails.remove();
    }
    const resetPhoto=button('重設照片位置','shResetPhoto','small');
    photoBox.append(resetPhoto);
    resetPhoto.onclick=()=>{
      sh.model.zoom=1;sh.model.dx=0;sh.model.dy=0;
      sh.refreshControls();sh.redraw();sh.saveLayout();
    };
    let mode='photo';
    function chooseMode(m) {
      mode=m;photoBox.hidden=m!=='photo';textBox.hidden=m!=='text';
      seg.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.m===m));
    }
    seg.onclick=e=>{const b=e.target.closest('[data-m]');if(b)chooseMode(b.dataset.m);};
    chooseMode('photo');
    const openPhoto=button('🖼️ 調整相片位置','shOpenPhoto');
    const openText=button('✏️ 文字微調','shOpenText');
    const sum=make('div','adj-sum');sum.id='shSum';
    const oldPlay=$('sh-play');
    if(oldPlay){oldPlay.classList.add('full');tools.insertBefore(openPhoto,oldPlay);tools.insertBefore(openText,oldPlay);tools.insertBefore(sum,oldPlay);}
    function summarize() {
      const count=Object.values(sh.model.adj).filter(v=>Object.values(v).some(n=>n!==0)).length;
      sum.textContent=count?'已調整 '+count+' 個文字區塊':'未調整（原本位置）';
      sum.classList.toggle('on',count>0);
    }
    const oldForm=$('sh-form');
    if(oldForm){
      oldForm.classList.add('qg-shadow-fields');
      const img=$('sh-png'),video=$('sh-video'),save=$('sh-save');
      const buttons=make('div','btns qg-shadow-buttons');
      oldForm.after(buttons);
      [img,video].forEach(x=>{if(x){x.type='button';x.classList.add('primary');buttons.append(x);}});
      if(img)img.textContent='下載圖片 PNG';
      if(video)video.textContent='下載影片（5 秒）';
      if(save){save.classList.add('full');buttons.after(save);}
      const date=$('sh-date');
      date?.setAttribute('aria-label','出沒日期（點選日曆）');
    }
    const preview=$('sh-preview');
    preview?.closest('.stage')?.addEventListener('click',()=>{
      if(!sh.busy())open('photo');
    });
    function open(m) {
      if(sh.busy())return;
      chooseMode(m);showEditor(shEd);mirror(shEd,preview);
      shEd.onclose=()=>{cancelAnimationFrame(shEd.timer);sh.saveLayout();summarize();};
    }
    openPhoto.onclick=()=>open('photo');
    openText.onclick=()=>open('text');
    dragCanvas(shEd.cv,(dx,dy)=>{
      if(mode==='photo'){
        sh.model.dx=clamp(sh.model.dx+dx/5,-100,100);
        sh.model.dy=clamp(sh.model.dy+dy/5,-100,100);
      }else{
        const a=sh.model.adj[$('sh-target').value];
        a.dx=clamp(Math.round(a.dx+dx),-200,200);
        a.dy=clamp(Math.round(a.dy+dy),-120,120);
      }
      sh.refreshControls();sh.redraw();sh.saveLayout();summarize();
    },ratio=>{
      if(mode!=='photo')return;
      sh.model.zoom=clamp(sh.model.zoom*ratio,1,3);
      sh.refreshControls();sh.redraw();sh.saveLayout();
    });
    panel.addEventListener('input',summarize);
    shEd.el.addEventListener('input',()=>{sh.saveLayout();summarize();});
    summarize();
  }
  // The limited card already has a text editor. Give it a matching full-card
  // photo editor without replacing its Canvas drawing/position data.
  const promo=window.qgPromoView;
  if(promo && $('tab-promo')) {
    const tools=$('tab-promo').querySelector('.promo-tools');
    const photoBtn=button('🖼️ 放大調整相片','promoPhotoExpand');
    tools?.insertBefore(photoBtn,$('adjOpen'));
    const ed=modal('promoPhoto','限定宣傳｜放大調整相片');editing.push(ed);
    const tip=make('p','ed-tip','拖動照片調整位置，雙指或滑桿放大縮小');
    const range=make('input');range.type='range';range.min='1';range.max='3';range.step='.01';range.value=promo.state.zoom||1;
    range.setAttribute('aria-label','照片縮放');
    range.className='qg-editor-range';
    const reset=button('重設位置','promoPhotoReset','small');
    ed.control.append(tip,range,reset);
    range.oninput=()=>{
      promo.state.zoom=+range.value;promo.clampPos();
      $('zoom').value=range.value;promo.render(0,true);
    };
    reset.onclick=()=>{
      promo.state.zoom=1;promo.state.dx=0;promo.state.dy=0;
      $('zoom').value=1;range.value=1;promo.render(0,true);
    };
    photoBtn.onclick=()=>{
      if(promo.busy?.())return;
      range.value=promo.state.zoom;
      showEditor(ed);mirror(ed,promo.canvas);
    };
    ed.onclose=()=>{cancelAnimationFrame(ed.timer);promo.render(0,true);};
    dragCanvas(ed.cv,(dx,dy)=>{
      promo.state.dx+=dx;promo.state.dy+=dy;
      promo.clampPos();promo.render(0,true);
    },ratio=>{
      promo.state.zoom=clamp(promo.state.zoom*ratio,1,3);
      promo.clampPos();range.value=promo.state.zoom;
      $('zoom').value=promo.state.zoom;promo.render(0,true);
    });
    promo.canvas?.closest('#stage')?.addEventListener('dblclick',()=>photoBtn.click());
  }
  // Weekly editor: ensure visible exit control and optional enlarged canvas.
  const wk=$('wkEd');
  if(wk) {
    const header=wk.querySelector('.ed-head');
    const zoom=button('🔍 放大預覽','wkEdZoom','small');
    const exit=button('✕ 退出','wkEdExit','ed-done');
    const done=$('wkEdDone');
    header?.insertBefore(zoom,done);
    if(done){done.textContent='完成';done.after(exit);}
    zoom.onclick=()=>{
      const on=wk.classList.toggle('qg-zoomed');
      zoom.textContent=on?'🔍 看全卡':'🔍 放大預覽';
    };
    exit.onclick=()=>done?.click();
    const obs=new MutationObserver(()=>{
      if(wk.hidden){wk.classList.remove('qg-zoomed');zoom.textContent='🔍 放大預覽';}
    });
    obs.observe(wk,{attributes:true,attributeFilter:['hidden']});
  }
})();
