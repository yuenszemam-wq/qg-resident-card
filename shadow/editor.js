(() => {
  const field = id => document.getElementById('sh-' + id);
  const canvas = field('preview'), ctx = canvas.getContext('2d');
  const status = text => { field('status').textContent = text; };
  const positions = [[0,0],[219,105],[325,280],[285,14],[129,227],[115,245],[234,1220],[63,938],[679,314]];
  const adj = Object.fromEntries(['name','ig','date'].map(key => [key,{dx:0,dy:0,size:0}]));
  const model = {adj, photo:null, zoom:1, dx:0, dy:0};
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
  function draw(t=5, s=details()) {
    if (!images) return;
    const progress = (start,duration) => Math.max(0,Math.min(1,(t-start)/duration));
    function layer(id, opacity=1, y=0) {
      ctx.globalAlpha = opacity;
      ctx.drawImage(images[id],positions[id][0],positions[id][1]+y);
    }
    layer(0);
    const reveal = progress(.45,.92);
    if (model.photo && reveal) {
      ctx.save();
      ctx.beginPath(); ctx.ellipse(506,704,301,373,0,0,2*Math.PI); ctx.clip();
      const p = model.photo, scale = Math.max(602/p.width,746/p.height)*model.zoom;
      const w=p.width*scale, h=p.height*scale;
      ctx.globalAlpha = reveal;
      ctx.filter = reveal<1 ? 'blur('+((1-reveal)*18)+'px)' : 'none';
      ctx.drawImage(p,506-w/2+model.dx*(w-602)/200,704-h/2+model.dy*(h-746)/200,w,h);
      ctx.restore();
    }
    layer(5,progress(.14,.64));
    layer(3,progress(0,.42),-12*(1-progress(0,.42)));
    layer(1,progress(0,.48));
    layer(4,progress(.18,.62));
    layer(2,progress(.3,.55));
    layer(7,progress(.45,.74),8*Math.sin(t*2));
    layer(8,progress(.26,.7),-8*Math.sin(t*2));
    layer(6,progress(.92,.65),12*(1-progress(.92,.65)));
    function line(key,value,y,size,start) {
      if (!value) return;
      const a=adj[key], shown=progress(start,.48);
      ctx.globalAlpha=shown;
      ctx.font='bold '+(size+a.size)+'px '+(key==='name'?FONT_NAME:FONT_HAND);
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.lineJoin='round';
      ctx.lineWidth=key==='name'?18:10; ctx.strokeStyle='#180d20'; ctx.fillStyle='#f4d9fa';
      const x=506+a.dx, top=y+a.dy+16*(1-shown);
      ctx.strokeText(value,x,top,820); ctx.fillText(value,x,top,820);
    }
    line('name',s.name,1040,100,.54); line('ig',s.ig,1132,43,.85);
    line('date',s.date && 'Date: '+s.date,1187,50,1.05);
    ctx.globalAlpha=1;
  }
  async function start() {
    if (images) return;
    try {
      loading ??= Promise.all(positions.map((_,i)=>loadImg('shadow/'+(i?i+'.webp':'background.jpg'))));
      images=await loading; draw();
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
  field('form').oninput=invalidate;
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
  function animate(s) {
    return new Promise(resolve=>{
      const begin=performance.now();
      function frame(now) {
        const t=(now-begin)/1000; draw(t,s);
        if (t<5) requestAnimationFrame(frame); else resolve();
      }
      requestAnimationFrame(frame);
    });
  }
  function lock(value) {
    busy=value;
    panel.querySelectorAll('input,select,button').forEach(el=>el.disabled=value);
  }
  async function run(mode) {
    if (busy) return;
    const s=details();
    if (mode!=='play' && (!model.photo || !s.name || !s.ig || !s.date)) {status('請先選擇相片，並填寫名字、IG 和日期。');return;}
    lock(true);
    let stream, recorder;
    try {
      await start(); if (!images) return;
      await Promise.all([document.fonts.load('bold 100px '+FONT_NAME,s.name||'影'),document.fonts.load('bold 50px '+FONT_HAND,'Date '+s.ig)]);
      const filename='影子精靈_'+s.name.replace(/[^\p{L}\p{N}_.-]/gu,'_');
      if (mode==='play') { await animate(s); return; }
      if (mode==='png') {
        draw(5,s);
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
        if (await saveBlob(blob,filename+'.png',status)) openPromo(s,caption(s));
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
      await Promise.all([animate(s).then(()=>{if(recorder.state==='recording')recorder.stop();}),finished]);
      const type=recorder.mimeType || chunks[0]?.type;
      if (!chunks.length || !type) throw Error('影片未能產生，請再試一次。');
      const ext=type.includes('mp4')?'mp4':'webm';
      pending={blob:new Blob(chunks,{type:type.split(';')[0]}),filename:filename+'.'+ext,s};
      field('save').hidden=false; status('影片已準備好（'+ext.toUpperCase()+'）');
    } catch(err) { status(err.message || '匯出失敗，請再試一次。'); }
    finally { stream?.getTracks().forEach(track=>track.stop()); lock(false); draw(); }
  }
  field('play').onclick=()=>run('play');
  field('png').onclick=()=>run('png');
  field('form').onsubmit=e=>{e.preventDefault();run('video');};
  field('video').onclick=()=>run('video');
  field('save').onclick=async()=>{
    const v=pending;
    if(v && await saveBlob(v.blob,v.filename,status)) openPromo(v.s,caption(v.s));
  };
  window.qgShadow={start,busy:()=>busy,model,redraw,refreshControls,saveLayout:layout.save};
  if(!panel.hidden) start();
})();
