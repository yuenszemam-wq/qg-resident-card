(() => {
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
  let template, crown;
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
      ctx.font = 'bold 106px Georgia, serif';
      ctx.fillStyle = '#c799b3';
      ctx.strokeStyle = '#100b10';
      ctx.lineWidth = 7;
      ctx.lineJoin = 'round';
      const title = monthName.format(first) + ' ' + y;
      ctx.strokeText(title,540,305,790);
      ctx.fillText(title,540,305,790);
      // The supplied clean frame spells Friday “Fir”. Retain the surrounding original artwork.
      ctx.drawImage(template,724,478,23,47,747,478,71,47);
      ctx.font = 'bold 40px Georgia, serif';
      ctx.fillStyle = '#fff';
      ctx.fillText('Fri',778,518);
      ctx.textBaseline = 'middle';
      for (let index = 0; index < 42; index++) {
        const date = new Date(Date.UTC(y,m-1,1 + index-offset));
        const day = date.getUTCDate(), col = index % 7;
        const active = date.getUTCMonth() === m-1;
        const marked = active && days.includes(day);
        const x = 118 + (col + 0.5)*120, top = 527 + Math.floor(index/7)*69;
        if (marked) ctx.drawImage(crown,x-44,top+2,88,64);
        ctx.fillStyle = !active ? '#494149' : col === 0 || col === 6 ? '#c294af' : marked ? '#33202c' : '#fff';
        ctx.fillText(day,x,top+39);
        const btn = document.createElement('button');
        btn.disabled = !active;
        btn.setAttribute('aria-label', (date.getUTCMonth()+1)+'月'+day+'日');
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
      const ok = await saveBlob(blob, filename, message);
      if(ok){
        window.qgWorkflow?.finish('calendar',true,'月曆已準備好');
        await window.qgWorkflow?.record('calendar',{year:year.value,month:month.value,days},canvas);
      }else window.qgWorkflow?.fail('calendar','已取消下載');
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
  Promise.all([loadImage('calendar/template.jpg'),loadImage('calendar/crown.png'),document.fonts.ready])
    .then(images => { [template,crown] = images; render(); }).catch(error=>message(error.message));
})();
