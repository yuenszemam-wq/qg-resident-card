// Each template remembers layout only. Photos and publication details stay in their own workflow.
function rememberLayout(template, state) {
  const key = 'qg.layout.' + template + '.v1';
  // 管理後台內嵌的即時預覽（?qgPreview=live）：唔讀亦唔寫這部裝置記住的位置
  const live = new URLSearchParams(location.search).get('qgPreview') === 'live' && window.parent !== window;
  let saved = {};
  if (!live) try { saved = JSON.parse(localStorage.getItem(key)) || {}; } catch {}
  function restore(target, source) {
    for (const field of Object.keys(target)) {
      const value = source?.[field];
      if (target[field] && typeof target[field] === 'object') restore(target[field], value);
      else if (typeof value === typeof target[field] && (typeof value === 'string' || Number.isFinite(value))) target[field] = value;
    }
  }
  restore(state.adj, saved.adj);
  if (typeof state.font === 'object') restore(state.font, saved.font);
  else if (typeof saved.font === 'string') state.font = saved.font;
  function restorePhoto() {
    state.zoom = Math.min(3, Math.max(1, Number(saved.zoom) || 1));
    state.dx = Number(saved.dx) || 0;
    state.dy = Number(saved.dy) || 0;
  }
  function save() {
    if (live) return;
    const next = {...saved, adj:state.adj, font:state.font};
    if (state.photo) Object.assign(next, {zoom:state.zoom, dx:state.dx, dy:state.dy});
    saved = next;
    try {
      const json = JSON.stringify(next);
      if (localStorage.getItem(key) !== json) localStorage.setItem(key, json);
    } catch {}
  }
  const panel = document.getElementById('tab-' + template);
  for (const event of ['input','change','click','pointerup','pointercancel']) panel.addEventListener(event, save);
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  return {restorePhoto, save};
}
