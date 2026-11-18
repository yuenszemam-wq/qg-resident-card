/* 影片匯出（三個分頁共用）：1080 × 1920，全畫面換上分頁專用背景，
   卡片元素（不含卡片自己的背景）按原本位置及動畫縮放到 1080 闊、上下置中。
   PNG 不經這裡，維持 1012 × 1350 原樣。 */
(() => {
'use strict';
const OUT_W = 1080, OUT_H = 1920;
const cache = {};
function loadBg(src) {
  return cache[src] ??= new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => { delete cache[src]; reject(Error('影片背景載入失敗，請檢查網絡後再試')); };
    im.src = src;
  });
}
function pickMime() {
  if (!window.MediaRecorder) return null;
  const list = ['video/mp4;codecs=avc1.42E01E','video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  return list.find(m => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } }) || '';
}
const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
let host = null;
function mount(canvas) {
  if (!host) {
    host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none;z-index:-1';
    document.body.append(host);
  }
  canvas.style.cssText = 'width:2px;height:2px;display:block';
  host.append(canvas);
}
/* bg：影片背景路徑；card：卡片畫布；cardBg：卡片原本背景（錄影期間補回細預覽用）；
   frame(t)：把 t 秒的卡片畫到 card（不畫背景）；hold：開頭停留秒數 */
async function record({bg, card, cardBg, frame, duration = 5, hold = 0, progress}) {
  const mime = pickMime();
  const out = document.createElement('canvas');
  out.width = OUT_W; out.height = OUT_H;
  if (mime === null || !out.captureStream) throw Error('這個瀏覽器不支援錄影，請改用 iPhone Safari 或電腦版 Chrome');
  const bgImg = await loadBg(bg);
  mount(out);
  const o = out.getContext('2d');
  const CW = card.width, CH = card.height;
  const sh = CH * OUT_W / CW, sy = (OUT_H - sh) / 2;
  const s = Math.max(OUT_W / bgImg.width, OUT_H / bgImg.height);
  const bw = bgImg.width * s, bh = bgImg.height * s, bx = (OUT_W - bw) / 2, by = (OUT_H - bh) / 2;
  const cardCtx = card.getContext('2d');
  const draw = t => {
    frame(t);
    o.setTransform(1,0,0,1,0,0); o.globalAlpha = 1; o.globalCompositeOperation = 'source-over';
    o.imageSmoothingEnabled = true; o.imageSmoothingQuality = 'high';
    o.drawImage(bgImg, bx, by, bw, bh);
    o.drawImage(card, 0, 0, CW, CH, 0, sy, OUT_W, sh);
    // 細預覽仍然顯示卡片原本背景
    if (cardBg) {
      cardCtx.save();
      cardCtx.setTransform(1,0,0,1,0,0); cardCtx.globalAlpha = 1; cardCtx.filter = 'none';
      cardCtx.globalCompositeOperation = 'destination-over';
      cardCtx.drawImage(cardBg, 0, 0, CW, CH);
      cardCtx.restore();
    }
  };
  let stream, rec;
  try {
    draw(0);
    stream = out.captureStream(30);
    const opts = {videoBitsPerSecond: 12_000_000};
    try { rec = new MediaRecorder(stream, mime ? {...opts, mimeType: mime} : opts); }
    catch { rec = new MediaRecorder(stream); }
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise((resolve, reject) => { rec.onstop = resolve; rec.onerror = () => reject(Error('錄影中斷，請再試一次')); });
    await nextFrame();
    rec.start(100);
    const holdEnd = performance.now() + hold * 1000;
    while (performance.now() < holdEnd) { draw(0); await new Promise(r => requestAnimationFrame(r)); }
    const t0 = performance.now();
    await new Promise(resolve => {
      (function step() {
        const t = (performance.now() - t0) / 1000;
        draw(Math.min(t, duration));
        progress?.(Math.min(1, t / duration));
        if (t < duration) requestAnimationFrame(step); else resolve();
      })();
    });
    // 最後停留一點點，確保最後一格被錄到
    await new Promise(r => setTimeout(r, 150));
    rec.stop(); await stopped;
    const type = rec.mimeType || mime || chunks[0]?.type || 'video/webm';
    if (!chunks.length) throw Error('影片未能產生，請再試一次');
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    return {blob: new Blob(chunks, {type: type.split(';')[0]}), ext};
  } finally {
    stream?.getTracks().forEach(t => t.stop());
    out.remove();
  }
}
window.qgVideo = {record, pickMime, size: [OUT_W, OUT_H]};
})();
