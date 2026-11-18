(() => {
  const field = id => document.getElementById('sh-' + id);
  const canvas = field('preview'), ctx = canvas.getContext('2d');
  const status = text => { field('status').textContent = text; };
  const positions = [[0,0],[219,105],[325,280],[285,14],[129,227],[115,245],[234,1220],[63,938],[679,314]];
  const adj = Object.fromEntries(['name','ig','date'].map(key => [key,{dx:0,dy:0,size:0,sp:0}]));
  const model = {adj, font:{name:'default',ig:'default',date:'default'}, photo:null, zoom:1, dx:0, dy:0};
  const layout = rememberLayout('shadow', model);
  let images, loading, busy = false, pending, upload = 0;
  const panel = document.getElementById('tab-shadow');
  function details() {
    const raw = field('date').value;
    const date = raw && new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(raw+'T12:00:00Z'));
    const ig = field('ig').value.trim().replace(/^[@＠\s]+/,'');
    return {name:field('name').value.trim(), ig:ig ? '@'+ig : '', date};
  }
  function caption(s) {
    return `～
🌙✦ 影子精靈出沒中 ✦🌙

傳說中，只有在夜幕降臨後——
異世界的「影子精靈」才會悄悄現身於庭園之中。

她們會躲在燈火後方、花叢之間，偷偷觀察每一位踏入 Queen’s Garden 的旅人。🕯️

✧༺━━━━━━━━━━━━━━༻✧
⌛️ 出沒日期｜${s.date}
🧚 影子精靈｜${s.name} ${s.ig}
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
  }
  // 動畫時序對照 Canva 原片逐格量度（30fps）
  const NAME_FONT='900 {size}px "Chiron GoRound TC","PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif';
  function chosenFont(k,size){
    const id=model.font?.[k]||'default';
    if(id==='zen')return 'bold '+size+'px "Zen Kurenaido","PingFang TC",sans-serif';
    if(id==='chiron')return '900 '+size+'px "Chiron GoRound TC","PingFang TC",sans-serif';
    if(id==='hand')return 'bold '+size+'px '+FONT_HAND;
    if(id==='serif')return 'bold '+size+'px Georgia,"Times New Roman",serif';
    return k==='name'?NAME_FONT.replace('{size}',size):'bold '+size+'px '+FONT_HAND;
  }
  const BANNER_PARTS=[[0,66,.55],[94,149,.67],[153,209,.8],[215,267,.93],[294,361,1.03]];
  const ease=x=>1-Math.pow(1-x,3);
  const pop=x=>x>=1?1:1+2.2*Math.pow(x-1,3)+1.2*Math.pow(x-1,2);
  function draw(t=5, s=details()) {
    if (!images) return;
    const progress = (start,duration) => Math.max(0,Math.min(1,(t-start)/duration));
    function layer(id, opacity=1, y=0, scale=1, blur=0) {
      if (opacity<=0) return;
      const im=images[id], [x0,y0]=positions[id];
      ctx.save();
      ctx.globalAlpha = opacity;
      if (blur>.05) ctx.filter='blur('+blur+'px)';
      if (scale!==1) {
        const cx=x0+im.width/2, cy=y0+im.height/2;
        ctx.translate(cx,cy+y); ctx.scale(scale,scale);
        ctx.drawImage(im,-im.width/2,-im.height/2);
      } else ctx.drawImage(im,x0,y0+y);
      ctx.restore();
    }
    layer(0);
    // 相片：連相框一齊出現，先很模糊、約 1.4 秒變清
    const shown = progress(.58,.45);
    if (model.photo && shown) {
      ctx.save();
      ctx.beginPath(); ctx.ellipse(506,704,301,373,0,0,2*Math.PI); ctx.clip();
      const p = model.photo, scale = Math.max(602/p.width,746/p.height)*model.zoom;
      const w=p.width*scale, h=p.height*scale;
      const blur = 28*(1-ease(progress(.85,.75)));
      ctx.globalAlpha = shown;
      if (blur>.05) ctx.filter = 'blur('+blur+'px)';
      ctx.drawImage(p,506-w/2+model.dx*(w-602)/200,704-h/2+model.dy*(h-746)/200,w,h);
      ctx.restore();
    }
    // 相框由細變大、由模糊變清
    const frame=progress(.28,.36);
    layer(5,Math.min(1,frame*1.6),0,.45+.55*ease(frame),8*(1-frame));
    layer(4,progress(.3,.25));
    layer(3,progress(.3,.25),-10*(1-ease(progress(.3,.25))));
    layer(1,progress(0,.4));
    // 心心及「出沒中」逐個彈出
    const im2=images[2], [bx,by]=positions[2];
    for (const [a,b,at] of BANNER_PARTS) {
      const k=progress(at,.14); if (!k) continue;
      const sc=.35+.65*pop(k), cx=bx+(a+b)/2, cy=by+im2.height/2;
      ctx.save(); ctx.globalAlpha=Math.min(1,k*2);
      ctx.translate(cx,cy); ctx.scale(sc,sc);
      ctx.drawImage(im2,a,0,b-a,im2.height,-(b-a)/2,-im2.height/2,b-a,im2.height);
      ctx.restore();
    }
    layer(8,progress(.25,.25),-8*Math.sin(t*2));
    layer(7,progress(.85,.3),8*Math.sin(t*2));
    // Queen's Garden 由模糊淡入
    const qg=progress(1,.35);
    layer(6,qg,0,1,6*(1-qg));
    // 文字逐字彈出（白→淡紫漸變、黑色粗邊）
    function line(key,value,y,size,start,span,font,stroke) {
      if (!value) return;
      const a=adj[key], chars=[...value], n=chars.length, sz=size+a.size;
      const step=Math.min(span/Math.max(1,n-1), .1);
      ctx.save();
      ctx.font=chosenFont(key,sz);
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.lineJoin='round';
      const total=ctx.measureText(value).width+Math.max(0,n-1)*a.sp, squeeze=Math.min(1,820/total);
      ctx.translate(506+a.dx,y+a.dy); ctx.scale(squeeze,1);
      const grad=ctx.createLinearGradient(0,-sz*.42,0,sz*.42);
      grad.addColorStop(0,'#fcf4fc'); grad.addColorStop(1,'#d9a3e4');
      ctx.lineWidth=stroke; ctx.strokeStyle='#120814'; ctx.fillStyle=grad;
      const glyphs=[];
      let before='';
      chars.forEach((ch,i)=>{
        const cw=ctx.measureText(ch).width, x=ctx.measureText(before).width+i*a.sp-total/2+cw/2;
        before+=ch;
        const k=progress(start+i*step,.12);
        if (k && ch.trim()) glyphs.push([ch,x,.3+.7*pop(k),Math.min(1,k*2.5)]);
      });
      for (const pass of ['stroke','fill']) for (const [ch,x,sc,al] of glyphs) {
        ctx.save(); ctx.globalAlpha=al; ctx.translate(x,0); ctx.scale(sc,sc);
        pass==='stroke'?ctx.strokeText(ch,0,0):ctx.fillText(ch,0,0);
        ctx.restore();
      }
      ctx.restore();
    }
    const hand='bold {size}px '+FONT_HAND;
    line('name',s.name,1045,120,.8,.1,NAME_FONT,22);
    line('ig',s.ig,1132,43,.97,.9,hand,10);
    line('date',s.date && 'Date: '+s.date,1187,50,1,1.23,hand,10);
    ctx.globalAlpha=1;
  }
  async function start() {
    if (images) return;
    try {
      loading ??= Promise.all(positions.map((_,i)=>loadImg('shadow/'+(i?i+'.webp':'background.jpg'))));
      images=await loading; draw();
      document.fonts.load(NAME_FONT.replace('{size}',120),field('name').value||'影').then(()=>{if(!busy)draw();},()=>{});
    } catch { loading=null; status('素材載入失敗，請重新整理。'); }
  }
  function invalidate() { pending=null; field('save').hidden=true; if (!busy) draw(); }
  function sliders(container, settings, target) {
    const box=field(container); box.replaceChildren();
    for (const [key,label,min,max,step] of settings) {
      const wrap=document.createElement('label'), input=document.createElement('input');
      wrap.textContent=label; input.type='range'; input.min=min; input.max=max;
      input.step=step||1; input.value=target[key];
      input.oninput=()=>{target[key]=+input.value; invalidate();};
      wrap.append(input); box.append(wrap);
    }
  }
  function crop() { sliders('crop',[['zoom','縮放',1,3,.01],['dx','左右',-100,100],['dy','上下',-100,100]],model); }
  function adjust() { sliders('adjust',[['dx','左右',-200,200],['dy','上下',-120,120],['size','大小',-18,40]],adj[field('target').value]); }
  function refreshControls(){ crop(); adjust(); }
  function redraw(){if (!busy) draw(5);}
  crop(); adjust(); field('target').onchange=adjust;
  field('form').oninput=()=>{invalidate(); document.fonts.load(NAME_FONT.replace('{size}',120),field('name').value||'影').then(()=>{if(!busy)draw();},()=>{});};
  field('photo').onchange=async e=>{
    const file=e.target.files[0]; if (!file) return;
    const token=++upload, url=URL.createObjectURL(file);
    model.photo=null; invalidate();
    try {
      const im=await loadImg(url); if (token!==upload) return;
      const thumb=document.createElement('canvas'), scale=Math.min(1,2000/Math.max(im.width,im.height));
      thumb.width=Math.max(1,Math.round(im.width*scale)); thumb.height=Math.max(1,Math.round(im.height*scale));
      thumb.getContext('2d').drawImage(im,0,0,thumb.width,thumb.height);
      model.photo=thumb; layout.restorePhoto(); crop(); draw(); status('');
    } catch { status('相片讀取失敗，請重新選擇。'); }
    finally { URL.revokeObjectURL(url); }
  };
  function animate(s,onProgress) {
    return new Promise(resolve=>{
      const begin=performance.now();
      function frame(now) {
        const t=(now-begin)/1000; draw(t,s||details());if(onProgress)onProgress(t);
        if (t<5) requestAnimationFrame(frame); else resolve();
      }
      requestAnimationFrame(frame);
    });
  }
  function lock(value) {
    busy=value;
    // Only disable export actions while encoding; keep fields and photo controls responsive.
    ['png','video','save'].forEach(id=>{const el=field(id);if(el)el.disabled=value;});
  }
  async function run(mode) {
    if (busy) return;
    const s=details();
    if (mode!=='play' && (!model.photo || !s.name || !s.ig || !s.date)) {status('請先選擇相片，並填寫名字、IG 和日期。');return;}
    if(mode!=='play'){
      lock(true);window.qgWorkflow?.progress('shadow',3,'準備匯出');
    }
    let stream, recorder;
    try {
      await start(); if (!images) return;
      await Promise.all([document.fonts.load(NAME_FONT.replace('{size}',120),s.name||'影'),document.fonts.load('bold 50px '+FONT_HAND,'Date '+s.ig)]);
      const filename='影子精靈_'+s.name.replace(/[^\p{L}\p{N}_.-]/gu,'_');
      if (mode==='play') { await animate(); return; }
      if (mode==='png') {
        draw(5,s);
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
        window.qgWorkflow?.progress('shadow',85,'準備儲存圖片');
        if (await saveBlob(blob,filename+'.png',status)){
          window.qgWorkflow?.finish('shadow',true,'圖片已準備好');
          openPromo(s,caption(s));
          window.qgWorkflow?.record('shadow',{name:field('name').value,ig:field('ig').value,date:field('date').value,zoom:model.zoom,dx:model.dx,dy:model.dy,adj:model.adj,font:model.font},canvas,model.photo);
        }else window.qgWorkflow?.fail('shadow','已取消下載');
        return;
      }
      const mime=pickMime();
      if (mime===null || !canvas.captureStream) throw Error('這個瀏覽器不支援錄影。');
      pending=null; field('save').hidden=true;
      draw(0,s); stream=canvas.captureStream(30);
      recorder=new MediaRecorder(stream,mime?{mimeType:mime,videoBitsPerSecond:8000000}:undefined);
      const chunks=[]; recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      const finished=new Promise((resolve,reject)=>{recorder.onstop=resolve; recorder.onerror=()=>reject(Error('錄影中斷，請再試一次。'));});
      recorder.start(); status('錄影中…約 5 秒');
      await Promise.all([animate(s,t=>window.qgWorkflow?.progress('shadow',Math.min(90,Math.round(5+85*t/5)),'正在錄製影片')).then(()=>{if(recorder.state==='recording')recorder.stop();}),finished]);
      const type=recorder.mimeType || chunks[0]?.type;
      if (!chunks.length || !type) throw Error('影片未能產生，請再試一次。');
      const ext=type.includes('mp4')?'mp4':'webm';
      pending={blob:new Blob(chunks,{type:type.split(';')[0]}),filename:filename+'.'+ext,s};
      field('save').hidden=false; status('影片已準備好（'+ext.toUpperCase()+'）');
      window.qgWorkflow?.progress('shadow',95,'影片已錄好，請儲存');
    } catch(err) { status(err.message || '匯出失敗，請再試一次。');if(mode!=='play')window.qgWorkflow?.fail('shadow','匯出失敗'); }
    finally { stream?.getTracks().forEach(track=>track.stop()); if(mode!=='play')lock(false); draw(); }
  }
  field('play').onclick=()=>run('play');
  field('png').onclick=()=>run('png');
  field('form').onsubmit=e=>{e.preventDefault();run('video');};
  field('video').onclick=()=>run('video');
  field('save').onclick=async()=>{
    const v=pending;
    if(v && await saveBlob(v.blob,v.filename,status)){
      window.qgWorkflow?.finish('shadow',true,'影片已儲存');
      openPromo(v.s,caption(v.s));
      window.qgWorkflow?.record('shadow',{name:field('name').value,ig:field('ig').value,date:field('date').value,zoom:model.zoom,dx:model.dx,dy:model.dy,adj:model.adj,font:model.font},canvas,model.photo);
    }else window.qgWorkflow?.fail('shadow','已取消儲存');
  };
  window.qgShadow={start,draw,busy:()=>busy,model,redraw,refreshControls,saveLayout:layout.save};
  if(!panel.hidden) start();
})();
