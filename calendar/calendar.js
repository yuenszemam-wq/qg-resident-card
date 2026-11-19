(() => {
  // 香港公眾假期（一般假日），來源：香港政府 1823 公眾假期資料（www.1823.gov.hk/common/ical/tc.json），2026-11-19 取得。
  // 其他年份或臨時假期可在管理中心「頁面設定 → QG 月曆」加入。
  const HK_HOLIDAYS = {
    2025:{'01-01':'一月一日','01-29':'農曆年初一','01-30':'農曆年初二','01-31':'農曆年初三','04-04':'清明節','04-18':'耶穌受難節','04-19':'耶穌受難節翌日','04-21':'復活節星期一','05-01':'勞動節','05-05':'佛誕','05-31':'端午節','07-01':'香港特別行政區成立紀念日','10-01':'國慶日','10-07':'中秋節翌日','10-29':'重陽節','12-25':'聖誕節','12-26':'聖誕節後第一個周日'},
    2026:{'01-01':'一月一日','02-17':'農曆年初一','02-18':'農曆年初二','02-19':'農曆年初三','04-03':'耶穌受難節','04-04':'耶穌受難節翌日','04-06':'清明節翌日','04-07':'復活節星期一翌日','05-01':'勞動節','05-25':'佛誕翌日','06-19':'端午節','07-01':'香港特別行政區成立紀念日','09-26':'中秋節翌日','10-01':'國慶日','10-19':'重陽節翌日','12-25':'聖誕節','12-26':'聖誕節後第一個周日'},
    2027:{'01-01':'一月一日','02-06':'農曆年初一','02-08':'農曆年初三','02-09':'農曆年初四','03-26':'耶穌受難節','03-27':'耶穌受難節翌日','03-29':'復活節星期一','04-05':'清明節','05-01':'勞動節','05-13':'佛誕','06-09':'端午節','07-01':'香港特別行政區成立紀念日','09-16':'中秋節翌日','10-01':'國慶日','10-08':'重陽節','12-25':'聖誕節','12-27':'聖誕節後第一個周日'}
  };
  // 月曆文字預設（管理中心可覆蓋；沒有設定的部分維持模板原圖）
  const CAL_DEFAULT = {
    title:'{{MONTH}} {{YEAR}}', titleColor:'#c799b3', titleSize:0, titleDy:0,
    weekdays:null,
    colors:{weekday:'#ffffff', weekend:'#c294af', holiday:'#e88fb4', marked:'#33202c', other:'#494149'},
    showHolidays:true, extraHolidays:{}, offHolidays:[], lines:{},
  };
  // 模板上可改寫的文字位置（1080×1350 座標）：box = 用背景色覆蓋的範圍；x/y = 文字左邊及第一行中線
  const CAL_SLOTS = {
    legend:{box:[505,960,632,990], x:511, y:975, size:21, color:'#eedbe5'},
    addrTitle:{box:[163,1037,512,1069], x:167, y:1053, size:26, color:'#c096ac'},
    addr:{box:[164,1078,534,1107], x:168, y:1093, size:24, color:'#ffffff'},
    hoursTitle:{box:[164,1127,362,1158], x:168, y:1143, size:26, color:'#c195ac'},
    hours:{box:[161,1168,515,1200], x:165, y:1184, size:24, color:'#ffffff'},
    hoursNote:{box:[117,1203,507,1228], x:122, y:1216, size:17, color:'#ffffff'},
    note1:{box:[600,1067,870,1118], x:606, y:1082, size:23, color:'#c096ac', lh:30},
    note2:{box:[598,1127,883,1228], x:602, y:1143, size:21, color:'#c096ac', lh:27},
  };
  const MONTH_ZH = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
  const calConfig = () => {
    const c = window.qgPresets?.config?.pages?.calendar?.cal || {};
    return {...CAL_DEFAULT, ...c, colors:{...CAL_DEFAULT.colors, ...(c.colors || {})}, lines:{...(c.lines || {})}};
  };
  function holidaysOf(cfg, y, m) {
    const out = new Map();
    if (cfg.showHolidays === false) return out;
    const mm = String(m).padStart(2,'0'), off = new Set(cfg.offHolidays || []);
    for (const [md, name] of Object.entries(HK_HOLIDAYS[y] || {})) if (md.startsWith(mm + '-') && !off.has(y + '-' + md)) out.set(+md.slice(3), name);
    for (const [d, name] of Object.entries(cfg.extraHolidays || {})) if (d.startsWith(y + '-' + mm + '-')) out.set(+d.slice(8), name || '假期');
    return out;
  }
  const field = name => document.getElementById('cal-' + name);
  const year = field('year'), month = field('month'), grid = field('grid');
  const canvas = field('preview'), ctx = canvas.getContext('2d');
  const storageKey = 'qg.calendar.crowns.v1';
  const monthName = new Intl.DateTimeFormat('en', {month:'long', timeZone:'UTC'});
  const current = new Intl.DateTimeFormat('en', {year:'numeric',month:'numeric',timeZone:'Asia/Hong_Kong'}).formatToParts(new Date());
  year.value = current.find(p => p.type === 'year').value;
  for (let m = 1; m <= 12; m++) month.add(new Option(m + ' 月', m));
  month.value = current.find(p => p.type === 'month').value;
  const selected = () => year.value + '-' + month.value.padStart(2,'0');
  const message = value => { field('status').textContent = value; };
  function validate(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw Error('皇冠記錄格式錯誤');
    for (const [key, days] of Object.entries(record)) {
      if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(key)) throw Error('備份年月無效');
      const [y,m] = key.split('-').map(Number);
      const last = new Date(Date.UTC(y,m,0)).getUTCDate();
      if (!Array.isArray(days) || !days.every(d => Number.isInteger(d) && d >= 1 && d <= last)) throw Error('備份日期無效');
    }
    return record;
  }
  const read = () => validate(JSON.parse(localStorage.getItem(storageKey) ?? '{}'));
  const persist = record => localStorage.setItem(storageKey,JSON.stringify(record));
  function loadImage(url) {
    return new Promise((resolve,reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(Error('素材未能載入，請重新整理'));
      img.src = url;
    });
  }
  let template, crown, tplPixels = null;
  // 取覆蓋範圍四邊的模板顏色中位數作為背景色，蓋住原有文字
  function bgOf([x0,y0,x1,y1]) {
    if (!tplPixels) {
      const c = document.createElement('canvas'); c.width = template.width; c.height = template.height;
      const g = c.getContext('2d', {willReadFrequently:true}); g.drawImage(template,0,0);
      tplPixels = g.getImageData(0,0,c.width,c.height);
    }
    const W = tplPixels.width, d = tplPixels.data, px = [];
    const at = (x,y) => { const i = (Math.round(y)*W + Math.round(x))*4; px.push([d[i],d[i+1],d[i+2]]); };
    for (let x = x0; x <= x1; x += 2) { at(x,y0); at(x,y1); }
    for (let y = y0; y <= y1; y += 2) { at(x0,y); at(x1,y); }
    px.sort((a,b) => (a[0]+a[1]+a[2]) - (b[0]+b[1]+b[2]));
    const [r,g,b] = px[Math.floor(px.length/2)];
    return `rgb(${r},${g},${b})`;
  }
  function cover(box) {
    const [x0,y0,x1,y1] = box;
    ctx.fillStyle = bgOf(box);
    ctx.fillRect(x0,y0,x1-x0,y1-y0);
  }
  function drawSlot(slot, text, color) {
    const [x0,,x1,y1] = slot.box;
    cover(slot.box);
    ctx.save();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = /^#[0-9a-f]{6}$/i.test(color || '') ? color : slot.color;
    const lines = text.split('\n'), lh = slot.lh || slot.size + 6;
    // 太長時縮細，不會超出覆蓋範圍
    let size = slot.size;
    const fit = () => { ctx.font = `bold ${size}px "PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif`; return Math.max(...lines.map(l => ctx.measureText(l).width)); };
    while (size > 10 && (fit() > x1 - slot.x - 2 || slot.y + (lines.length-1)*lh*size/slot.size + size/2 > y1 + 2)) size--;
    const k = size/slot.size;
    lines.forEach((l,i) => ctx.fillText(l, slot.x, slot.y + i*lh*k));
    ctx.restore();
  }
  function render() {
    field('save').disabled = true;
    grid.replaceChildren();
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if (!template) return;
    try {
      if (!/^[1-9]\d{3}$/.test(year.value)) throw Error('請輸入四位年份');
      const y = Number(year.value), m = Number(month.value);
      const days = read()[selected()] || [];
      const first = new Date(Date.UTC(y,m-1,1));
      const offset = first.getUTCDay();
      ctx.drawImage(template,0,0);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const cfg = calConfig(), hols = holidaysOf(cfg, y, m);
      ctx.font = `bold ${Math.max(40, 106 + (+cfg.titleSize || 0))}px Georgia, serif`;
      ctx.fillStyle = cfg.titleColor;
      ctx.strokeStyle = '#100b10';
      ctx.lineWidth = 7;
      ctx.lineJoin = 'round';
      const title = String(cfg.title || CAL_DEFAULT.title).replace(/\{\{\s*(MONTH|MONTH_ZH|M|YEAR)\s*\}\}/g,
        (_, k) => ({MONTH:monthName.format(first), MONTH_ZH:MONTH_ZH[m-1], M:String(m), YEAR:String(y)})[k]);
      const ty = 305 + (+cfg.titleDy || 0);
      ctx.strokeText(title,540,ty,790);
      ctx.fillText(title,540,ty,790);
      if (Array.isArray(cfg.weekdays) && cfg.weekdays.length === 7) {
        // 自訂星期：逐格用背景色蓋住原有字樣再重寫
        ctx.font = 'bold 40px Georgia, serif';
        cfg.weekdays.forEach((label, col) => {
          const x = 118 + (col + 0.5)*120;
          cover([x-56, 482, x+56, 528]);
          ctx.fillStyle = col === 0 || col === 6 ? cfg.colors.weekend : '#fff';
          ctx.fillText(String(label), x, 518, 108);
        });
      } else {
        // The supplied clean frame spells Friday “Fir”. Retain the surrounding original artwork.
        ctx.drawImage(template,724,478,23,47,747,478,71,47);
        ctx.font = 'bold 40px Georgia, serif';
        ctx.fillStyle = '#fff';
        ctx.fillText('Fri',778,518);
      }
      for (const [key, slot] of Object.entries(CAL_SLOTS)) {
        const v = cfg.lines[key];
        if (v == null || v === '') continue;
        drawSlot(slot, String(v), cfg.lines[key + 'Color']);
      }
      ctx.textAlign = 'center';
      ctx.font = 'bold 40px Georgia, serif';
      ctx.textBaseline = 'middle';
      for (let index = 0; index < 42; index++) {
        const date = new Date(Date.UTC(y,m-1,1 + index-offset));
        const day = date.getUTCDate(), col = index % 7;
        const active = date.getUTCMonth() === m-1;
        const marked = active && days.includes(day);
        const x = 118 + (col + 0.5)*120, top = 527 + Math.floor(index/7)*69;
        const holiday = active ? hols.get(day) : null;
        if (marked) ctx.drawImage(crown,x-44,top+2,88,64);
        // 公眾假期：粉紅色（有皇冠時仍用皇冠上的深色字，保持清楚）
        ctx.fillStyle = !active ? cfg.colors.other : marked ? (col === 0 || col === 6 ? cfg.colors.weekend : cfg.colors.marked)
          : holiday ? cfg.colors.holiday : col === 0 || col === 6 ? cfg.colors.weekend : cfg.colors.weekday;
        ctx.fillText(day,x,top+39);
        const btn = document.createElement('button');
        btn.disabled = !active;
        btn.setAttribute('aria-label', (date.getUTCMonth()+1)+'月'+day+'日' + (holiday ? '（' + holiday + '）' : ''));
        if (holiday) btn.title = holiday;
        btn.setAttribute('aria-pressed',String(marked));
        btn.onclick = () => {
          try {
            const record = read(), key = selected(), values = new Set(record[key] || []);
            if (values.has(day)) values.delete(day); else values.add(day);
            record[key] = [...values].sort((a,b)=>a-b);
            persist(record);
            render();
            grid.children[index].focus({preventScroll:true});
          } catch (error) { message(error.message); }
        };
        grid.append(btn);
      }
      message('');
      const note = field('holidays');
      if (note) note.textContent = hols.size ? '本月公眾假期（粉紅色）：' + [...hols].sort((a,b)=>a[0]-b[0]).map(([d,n]) => m + '/' + d + ' ' + n).join('、') : '';
      field('save').disabled = false;
    } catch (error) { message(error.message); }
  }
  field('save').onclick = async () => {
    const filename = 'QG-Calendar-' + selected() + '.png';
    const selectedMonth = selected(), days = (read()[selectedMonth] || []).slice();
    window.qgWorkflow?.progress('calendar',5,'正在生成月曆');
    try {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw Error('月曆圖片未能產生，請再試一次');
      window.qgWorkflow?.progress('calendar',85,'準備下載 PNG');
      // Store the generated calendar state before invoking browser download/share.
      window.qgWorkflow?.record('calendar',{year:year.value,month:month.value,days},canvas);
      const ok = await saveBlob(blob, filename, message);
      if(ok)window.qgWorkflow?.finish('calendar',true,'月曆已準備好');
      else window.qgWorkflow?.fail('calendar','已取消下載');
    } catch (error) { message(error.message); window.qgWorkflow?.fail('calendar','圖片產生失敗'); }
  };
  field('export').onclick = async () => {
    try {
      const blob = new Blob([JSON.stringify({version:1,months:read()},null,2)],{type:'application/json'});
      await saveBlob(blob, 'QG-Calendar-Backup.json', message);
    } catch (error) { message(error.message); }
  };
  field('import').onchange = async event => {
    const input = event.target;
    if (!input.files.length) return;
    try {
      const backup = JSON.parse(await input.files[0].text());
      if (backup.version !== 1) throw Error('不支援此備份版本');
      const incoming = validate(backup.months), record = read();
      for (const [key,days] of Object.entries(incoming))
        record[key] = [...new Set([...(record[key] || []),...days])].sort((a,b)=>a-b);
      persist(record); render(); message('已合併皇冠記錄');
    } catch (error) { message(error.message); }
    finally { input.value = ''; }
  };
  year.oninput = month.onchange = render;
  window.addEventListener('storage',event => { if (event.key === storageKey) render(); });
  // 管理中心設定（已發佈或即時預覽）更新時重畫
  window.qgCalendar = {refresh:() => render(), HK_HOLIDAYS, SLOTS:CAL_SLOTS, DEFAULT:CAL_DEFAULT};
  Promise.all([loadImage('calendar/template.jpg'),loadImage('calendar/crown.png'),document.fonts.ready])
    .then(images => { [template,crown] = images; render(); return window.qgPresets?.ready; })
    .then(() => render()).catch(error=>message(error.message));
})();
