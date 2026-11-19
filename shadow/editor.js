(() => {
  const field = id => document.getElementById('sh-' + id);
  const canvas = field('preview'), ctx = canvas.getContext('2d');
  const status = text => { field('status').textContent = text; };
  const positions = [[0,0],[219,105],[325,280],[285,14],[129,227],[115,245],[234,1220],[63,938],[679,314]];
  const adj = Object.fromEntries(['name','ig','date'].map(key => [key,{dx:0,dy:0,size:0,sp:0}]));
  const model = {adj, font:{name:'default',ig:'default',date:'default'}, photo:null, zoom:1, dx:0, dy:0};
  const layout = rememberLayout('shadow', model);
  // 字體：沿用限定宣傳的字體清單（名字 12 款、IG／日期 17 款），另加「原本字體」。舊版選項自動換成對應字體
  const LEGACY_FONT = {zen:'zenk', hand:'kalam7', serif:'default'};
  const fontChoices = k => k==='name' ? NAME_FONTS : HAND_FONTS;
  for (const k of ['name','ig','date']) {
    const id = model.font[k];
    if (id!=='default' && !fontChoices(k).some(f=>f.id===id)) model.font[k] = LEGACY_FONT[id] && (LEGACY_FONT[id]==='default' || fontChoices(k).some(f=>f.id===LEGACY_FONT[id])) ? LEGACY_FONT[id] : 'default';
  }
  let images, loading, busy = false, pending, upload = 0, previewing = false, playToken = 0;
  const bounds = {};
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
    const f=id!=='default' && fontChoices(k).find(x=>x.id===id);
    if(f) return k==='name' ? `${f.w} ${size}px "${f.fam}",${NAME_FALLBACK}` : `${f.w} ${size}px "${f.fam}",${FONT_HAND}`;
    return k==='name'?NAME_FONT.replace('{size}',size):'bold '+size+'px '+FONT_HAND;
  }
  // 畫之前先載入揀咗嘅字體（最多等 6 秒）
  function ensureFonts(s=details()) {
    const text={name:s.name||'影',ig:s.ig||'@',date:'Date: '+(s.date||'0123456789')};
    const loads=['name','ig','date'].map(k=>{
      const f=fontChoices(k).find(x=>x.id===model.font?.[k]);
      return (k==='name'&&f?loadFontCss(f.css):Promise.resolve()).then(()=>document.fonts.load(chosenFont(k,100),text[k]));
    });
    return Promise.race([Promise.all(loads).catch(()=>{}), new Promise(r=>setTimeout(r,6000))]);
  }
  const still=()=>{ if(!busy && !previewing) draw(); };
  const BANNER_PARTS=[[0,66,.55],[94,149,.67],[153,209,.8],[215,267,.93],[294,361,1.03]];
  const ease=x=>1-Math.pow(1-x,3);
  const pop=x=>x>=1?1:1+2.2*Math.pow(x-1,3)+1.2*Math.pow(x-1,2);
  // 對照 Canva 原片逐格量度：
  // 「影子精靈」標題不停放大縮細（約 0.9 秒一次，約 0.86～1.11 倍），4.6 秒起模糊淡出
  const TITLE_PULSE=[[0,1.107],[.15,1.02],[.25,.96],[.35,.91],[.45,.877],[.55,.86],[.65,.91],[.75,1],[.85,1.105],[.9,1.107]];
  // 兩隻小幽靈：左右、上下飄動及左右擺（卡片像素、度）
  const GHOST_R=[[.4,8,8,0],[.7,11,6,-6],[.95,11,-6,-5],[1.15,11,-7,3],[1.35,4,2,8],[1.6,-4,7,8],[1.9,7,7,8],[2.15,7,11,1],[2.4,7,7,-2],[2.6,7,7,4],[2.8,7,-4,8],[3.1,7,-15,8],[3.3,-7,-7,10],[3.55,-19,0,10],[3.8,-11,-7,8],[4,-4,-11,4],[4.25,-4,-7,-6],[4.4,-11,-4,-6],[4.5,-15,-4,-2],[5,-15,-4,-2]];
  const GHOST_L=[[.6,-56,0,-2],[.75,-25,-4,0],[.9,4,-8,2],[1.05,11,-7,8],[1.2,4,0,12],[1.4,-8,11,12],[1.6,-4,11,10],[1.8,8,-4,10],[1.95,11,-8,4],[2.1,8,-4,-2],[2.3,-8,8,0],[2.5,-8,8,8],[2.7,4,-4,10],[2.9,8,-8,2],[3.1,0,-11,-4],[3.3,-8,-15,0],[3.5,-8,-8,8],[3.75,-15,13,6],[3.9,-11,11,0],[4.1,4,-4,-2],[4.3,15,-11,-6],[4.45,8,-11,-8],[4.65,-9,-11,-4],[4.85,-11,-11,4],[5,-11,-8,10]];
  const smooth=(keys,t,i)=>{
    if (t<=keys[0][0]) return keys[0][i];
    for (let k=1;k<keys.length;k++) if (t<=keys[k][0]) {
      const a=keys[k-1], b=keys[k], p=(t-a[0])/(b[0]-a[0]), q=p*p*(3-2*p);
      return a[i]+(b[i]-a[i])*q;
    }
    return keys[keys.length-1][i];
  };
  const titleScale=t=>{ const p=(((t-1.05)%.9)+.9)%.9; return smooth(TITLE_PULSE,p,1); };
  function draw(t=5, s=details(), noBg=false) {
    if (!images) return;
    // t>=5 = 靜態完成圖（PNG、細預覽）：標題唔縮放、唔淡出，小幽靈位置同以前一樣
    const finalFrame=t>=5;
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
    // 影片：卡片背景由 1080×1920 全畫面背景取代（ui/video.js）
    if (noBg) { ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,canvas.width,canvas.height); } else layer(0);
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
    if (finalFrame) layer(1);
    else {
      const out=progress(4.6,.18);
      layer(1,progress(0,.4)*(1-out),0,titleScale(t),10*out);
    }
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
    function ghost(id,opacity,dx,dy,rot,blur){
      if (opacity<=0) return;
      const im=images[id], [x0,y0]=positions[id];
      ctx.save(); ctx.globalAlpha=opacity;
      if (blur>.05) ctx.filter='blur('+blur+'px)';
      ctx.translate(x0+im.width/2+dx,y0+im.height/2+dy); ctx.rotate(rot*Math.PI/180);
      ctx.drawImage(im,-im.width/2,-im.height/2);
      ctx.restore();
    }
    if (finalFrame) { layer(8,1,-8*Math.sin(10)); layer(7,1,8*Math.sin(10)); }
    else {
      const gr=progress(.15,.3), gl=progress(.55,.3);
      ghost(8,gr,smooth(GHOST_R,t,1),smooth(GHOST_R,t,2),smooth(GHOST_R,t,3),8*(1-gr));
      ghost(7,gl,smooth(GHOST_L,t,1),smooth(GHOST_L,t,2),smooth(GHOST_L,t,3),8*(1-gl));
    }
    // Queen's Garden 由模糊淡入
    const qg=progress(1,.35);
    layer(6,qg,0,1,6*(1-qg));
    // 文字逐字彈出（白→淡紫漸變、黑色粗邊）
    function line(key,value,y,size,start,span,font,stroke) {
      delete bounds[key];
      if (!value) return;
      const a=adj[key], chars=[...value], n=chars.length, sz=size+a.size;
      const step=Math.min(span/Math.max(1,n-1), .1);
      ctx.save();
      ctx.font=chosenFont(key,sz);
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.lineJoin='round';
      const total=ctx.measureText(value).width+Math.max(0,n-1)*a.sp, squeeze=Math.min(1,820/total);
      bounds[key]={x:506+a.dx-total*squeeze/2, y:y+a.dy-sz*.6, w:total*squeeze, h:sz*1.2};
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
  function invalidate() { pending=null; field('saveBox').classList.remove('on'); still(); }
  function refreshControls(){ window.qgEditor?.sync('shadow'); }
  function redraw(){ still(); }
  field('form').oninput=()=>{invalidate(); ensureFonts().then(still);};
  async function loadPhoto(file){
    const token=++upload, url=URL.createObjectURL(file);
    model.photo=null; invalidate();
    try {
      const im=await loadImg(url); if (token!==upload) return;
      const thumb=document.createElement('canvas'), scale=Math.min(1,2000/Math.max(im.width,im.height));
      thumb.width=Math.max(1,Math.round(im.width*scale)); thumb.height=Math.max(1,Math.round(im.height*scale));
      thumb.getContext('2d').drawImage(im,0,0,thumb.width,thumb.height);
      model.photo=thumb; layout.restorePhoto(); still(); status(''); refreshControls();
    } catch { status('相片讀取失敗，請重新選擇。'); }
    finally { URL.revokeObjectURL(url); }
  }
  field('photo').onchange=e=>{ const file=e.target.files[0]; e.target.value=''; if (file) loadPhoto(file); };
  // 預覽動畫唔會鎖住其他操作：播放期間可以繼續改字、換相、調位置；再按會重新開始；按下載會先停止預覽
  function animate() {
    const token=++playToken;
    previewing=true;
    return new Promise(resolve=>{
      const begin=performance.now();
      function frame(now) {
        if (token!==playToken) { resolve(false); return; }
        const t=(now-begin)/1000; draw(Math.min(t,5),details());
        if (t<5) requestAnimationFrame(frame); else { previewing=false; resolve(true); }
      }
      requestAnimationFrame(frame);
    });
  }
  function stopPreview(){ if (previewing) { playToken++; previewing=false; } }
  async function preview(){
    if (busy) return;
    await start(); if (!images) return;
    await ensureFonts();
    if (await animate()) draw();
  }
  function lock(value) {
    busy=value;
    // Only disable export actions while encoding; keep fields and photo controls responsive.
    ['png','video','save','play'].forEach(id=>{const el=field(id);if(el)el.disabled=value;});
  }
  async function run(mode) {
    if (busy) return;
    const s=details();
    if (!model.photo || !s.name || !s.ig || !s.date) {status('請先選擇相片，並填寫名字、IG 和日期。');return;}
    stopPreview();
    lock(true);window.qgWorkflow?.progress('shadow',3,'準備匯出');
    const rec=()=>window.qgWorkflow?.record('shadow',{name:field('name').value,ig:field('ig').value,date:field('date').value,zoom:model.zoom,dx:model.dx,dy:model.dy,adj:model.adj,font:model.font},canvas,model.photo);
    try {
      await start(); if (!images) throw Error('素材載入失敗，請重新整理。');
      await Promise.all([document.fonts.load(NAME_FONT.replace('{size}',120),s.name||'影'),document.fonts.load('bold 50px '+FONT_HAND,'Date '+s.ig),ensureFonts(s)]);
      const filename='影子精靈_'+s.name.replace(/[^\p{L}\p{N}_.-]/gu,'_');
      if (mode==='png') {
        draw(5,s);
        window.qgWorkflow?.progress('shadow',50,'正在編碼 PNG');
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
        if (!blob) throw Error('圖片生成失敗，請再試一次。');
        window.qgWorkflow?.progress('shadow',75,'儲存本機記錄');
        await rec();
        window.qgWorkflow?.progress('shadow',85,'準備儲存圖片');
        if (await saveBlob(blob,filename+'.png',status)){
          window.qgWorkflow?.finish('shadow',true,'圖片已準備好');
          openPromo(s,caption(s));
        }else window.qgWorkflow?.fail('shadow','已取消下載');
        return;
      }
      pending=null; field('saveBox').classList.remove('on');
      field('rec').classList.add('on'); status('影片製作中…請稍等');
      const out=await window.qgVideo.record({
        bg:'video/shadow-bg.jpg', card:canvas, cardBg:images[0], duration:5, hold:0,
        frame:t=>draw(t,s,true),
        progress:p=>window.qgWorkflow?.progress('shadow',Math.min(90,Math.round(5+85*p)),'正在製作影片'),
      });
      pending={blob:out.blob,filename:filename+'.'+out.ext,s};
      window.qgWorkflow?.progress('shadow',92,'儲存本機記錄');
      await rec();
      const webm=out.ext==='webm'?'（這個瀏覽器只能錄成 WebM 格式）':'';
      // 可以自動儲存就自動儲存；iPhone 要親手按「儲存影片」先可以存入相簿
      const saved=await window.qgVideo.autoSave(out.blob,pending.filename);
      field('saveBox').classList.add('on');
      if(saved==='saved'){ status('影片已自動儲存：'+pending.filename+webm); window.qgWorkflow?.finish('shadow',true,'影片已完成並儲存'); openPromo(s,caption(s)); }
      else { status('影片已製作好！按下面「儲存影片」存入相簿'+webm); window.qgWorkflow?.finish('shadow',true,'影片已完成，請按「儲存影片」'); }
    } catch(err) { status(err.message || '匯出失敗，請再試一次。');window.qgWorkflow?.fail('shadow','匯出失敗'); }
    finally { field('rec').classList.remove('on'); lock(false); draw(); }
  }
  field('play').onclick=preview;
  field('png').onclick=()=>run('png');
  field('video').onclick=()=>run('video');
  field('save').onclick=async()=>{
    const v=pending;
    if(v && await saveBlob(v.blob,v.filename,status)){
      window.qgWorkflow?.finish('shadow',true,'影片已儲存');
      openPromo(v.s,caption(v.s));
    }else window.qgWorkflow?.fail('shadow','已取消儲存');
  };
  window.qgShadow={start,draw,busy:()=>busy,model,redraw,refreshControls,saveLayout:layout.save};
  // 共用「預覽及調整」編輯器（ui/editor.js）
  const PHOTO_W=602, PHOTO_H=746;
  const FIELDS=[['size','大小',-18,40],['sp','字距',-20,60],['dx','左右',-200,200],['dy','上下',-120,120]];
  const RANGE=Object.fromEntries(FIELDS.map(([f,,a,b])=>[f,[a,b]]));
  const clampN=(v,a,b)=>Math.max(a,Math.min(b,v));
  const ITEMS=[['name','名字'],['ig','IG'],['date','日期']];
  window.qgCards=window.qgCards||{};
  window.qgCards.shadow={
    key:'shadow', id:'shEd', panel, canvas, thumb:field('thumb'),
    openPhoto:document.getElementById('shOpenPhoto'), openText:document.getElementById('shOpenText'), summary:document.getElementById('shSum'),
    still, play:preview, playing:()=>previewing, busy:()=>busy, save:()=>layout.save(),
    photo:{
      has:()=>!!model.photo, zoom:()=>model.zoom,
      setZoom(z){ model.zoom=clampN(z,1,3); },
      // model.dx/dy 以 ±100 表示相片可移動範圍
      pan(x,y){
        const p=model.photo; if (!p) return;
        const sc=Math.max(PHOTO_W/p.width,PHOTO_H/p.height)*model.zoom, ox=p.width*sc-PHOTO_W, oy=p.height*sc-PHOTO_H;
        if (ox>0.01) model.dx=clampN(model.dx+x*200/ox,-100,100);
        if (oy>0.01) model.dy=clampN(model.dy+y*200/oy,-100,100);
      },
      reset(){ model.zoom=1; model.dx=0; model.dy=0; },
      load:loadPhoto,
    },
    text:{
      items:ITEMS, fields:FIELDS,
      fonts:k=>[
        k==='name' ? {id:'default',label:'原本字體（預設）',fam:'Chiron GoRound TC',w:900,fallback:NAME_FALLBACK}
                   : {id:'default',label:'原本字體（預設）',fam:'Kalam',w:700,fallback:FONT_HAND},
        ...fontChoices(k).map(f=>({id:f.id,label:f.label.replace('（預設）',''),fam:f.fam,w:f.w,gcss:f.css,
          bold:typeof f.bold==='object'?(f.bold[k]||0):(f.bold||0),fallback:k==='name'?NAME_FALLBACK:FONT_HAND}))],
      sample:k=>{ const d=details(); return k==='date' ? (d.date ? 'Date: '+d.date : '') : d[k]; },
      font:k=>model.font[k]||'default',
      setFont(k,id){ model.font[k]=id; ensureFonts().then(still); },
      get:(k,f)=>adj[k][f],
      set(k,f,v){ adj[k][f]=clampN(Math.round(v),...RANGE[f]); },
      reset(keys){ for (const k of keys){ for (const [f] of FIELDS) adj[k][f]=0; model.font[k]='default'; } ensureFonts().then(still); },
      has:k=>!!details()[k], bounds:k=>bounds[k],
      changed:()=>ITEMS.some(([k])=>FIELDS.some(([f])=>adj[k][f]!==0) || (model.font[k]||'default')!=='default'),
    },
  };
  if(!panel.hidden) start();
})();
