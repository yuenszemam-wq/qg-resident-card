/* 影片匯出（三個分頁共用）：1080 × 1920，全畫面換上分頁專用背景，
   卡片元素（不含卡片自己的背景）按原本位置及動畫縮放到 1080 闊、上下置中。
   PNG 不經這裡，維持 1012 × 1350 原樣。

   做法：
   1. 優先逐格編碼（WebCodecs VideoEncoder + mp4-muxer，iPhone Safari 16.4 起支援）：
      每一格按準確時間畫好先編碼，唔受手機速度影響，唔會甩格或者「跳」。
   2. 瀏覽器唔支援時，退回即時錄影（MediaRecorder）。 */
(() => {
'use strict';
const OUT_W = 1080, OUT_H = 1920, FPS = 30;
const cache = {};
function loadBg(src) {
  return cache[src] ??= new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => { delete cache[src]; reject(Error('影片背景載入失敗，請檢查網絡後再試')); };
    im.src = src;
  });
}
let muxerP = null;
function loadMuxer() {
  if (window.Mp4Muxer) return Promise.resolve(window.Mp4Muxer);
  return muxerP ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'ui/vendor/mp4-muxer.js';
    s.onload = () => window.Mp4Muxer ? resolve(window.Mp4Muxer) : reject(Error('mp4-muxer'));
    s.onerror = () => { muxerP = null; reject(Error('mp4-muxer')); };
    document.head.append(s);
  });
}
function pickMime() {
  if (!window.MediaRecorder) return null;
  const list = ['video/mp4;codecs=avc1.42E01E','video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  return list.find(m => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } }) || '';
}
const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
const yieldUI = () => new Promise(r => setTimeout(r, 0));
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

// 合成一格：背景 + 卡片（卡片畫布暫時唔畫自己的背景）
async function compositor({bg, card, cardBg, frame}) {
  const bgImg = await loadBg(bg);
  const out = document.createElement('canvas');
  out.width = OUT_W; out.height = OUT_H;
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
  return {out, draw};
}

// ---------- 1. 逐格編碼 ----------
const CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.640032', 'avc1.42e032'];
async function encoderConfig() {
  if (!window.VideoEncoder || !window.VideoFrame) return null;
  for (const codec of CODECS) {
    const cfg = {codec, width: OUT_W, height: OUT_H, bitrate: 10_000_000, framerate: FPS, avc: {format: 'avc'}};
    try { const r = await VideoEncoder.isConfigSupported(cfg); if (r.supported) return r.config || cfg; } catch {}
  }
  return null;
}
async function encodeOffline(opts, cfg) {
  const M = await loadMuxer();
  const {out, draw} = await compositor(opts);
  const target = new M.ArrayBufferTarget();
  const muxer = new M.Muxer({target, video: {codec: 'avc', width: OUT_W, height: OUT_H, frameRate: FPS}, fastStart: 'in-memory'});
  let failed = null;
  const enc = new VideoEncoder({output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => { failed = e; }});
  try {
    enc.configure(cfg);
    const total = Math.round(opts.duration * FPS);
    for (let n = 0; n < total; n++) {
      if (failed) throw failed;
      draw(Math.min(n / FPS, opts.duration));
      const vf = new VideoFrame(out, {timestamp: Math.round(n * 1e6 / FPS), duration: Math.round(1e6 / FPS)});
      enc.encode(vf, {keyFrame: n % FPS === 0});
      vf.close();
      opts.progress?.((n + 1) / total);
      // 唔好令編碼排隊太長，同時俾畫面更新進度條
      while (enc.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 4));
      if (n % 2 === 0) await yieldUI();
    }
    await enc.flush();
    if (failed) throw failed;
    muxer.finalize();
    return {blob: new Blob([target.buffer], {type: 'video/mp4'}), ext: 'mp4'};
  } finally {
    try { if (enc.state !== 'closed') enc.close(); } catch {}
    out.remove();
  }
}

// ---------- 2. 即時錄影（後備） ----------
async function recordRealtime(opts) {
  const mime = pickMime();
  if (mime === null || !HTMLCanvasElement.prototype.captureStream) throw Error('這個瀏覽器不支援錄影，請改用 iPhone Safari 或電腦版 Chrome');
  const {out, draw} = await compositor(opts);
  const {duration = 5, hold = 0, progress} = opts;
  let stream, rec;
  try {
    draw(0);
    stream = out.captureStream(FPS);
    const o = {videoBitsPerSecond: 10_000_000};
    try { rec = new MediaRecorder(stream, mime ? {...o, mimeType: mime} : o); }
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

/* bg：影片背景路徑；card：卡片畫布；cardBg：卡片原本背景（補回細預覽用）；
   frame(t)：把 t 秒的卡片畫到 card（不畫背景）；hold：即時錄影開頭停留秒數 */
async function record(opts) {
  opts = {duration: 5, hold: 0, ...opts};
  const cfg = await encoderConfig();
  if (cfg) {
    try { return await encodeOffline(opts, cfg); }
    catch (err) { console.warn('逐格編碼失敗，改用即時錄影', err); }
  }
  return recordRealtime(opts);
}

/* 錄好後自動儲存：
   - 電腦／可直接下載的瀏覽器：自動下載。
   - iPhone／Android 用「分享」存入相簿：瀏覽器規定一定要用戶親手按掣先可以打開分享，
     錄影需時幾秒，已超過「按掣」的有效時間，所以會回傳 'tap'，由頁面顯示「儲存影片」掣。 */
async function autoSave(blob, filename) {
  const file = new File([blob], filename, {type: blob.type});
  const mobileShare = navigator.canShare && navigator.canShare({files: [file]}) && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (mobileShare) {
    if (navigator.userActivation && !navigator.userActivation.isActive) return 'tap';
    try { await navigator.share({files: [file]}); return 'saved'; }
    catch (err) { return err && err.name === 'AbortError' ? 'cancelled' : 'tap'; }
  }
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    return 'saved';
  } catch { return 'tap'; }
}

window.qgVideo = {record, autoSave, pickMime, size: [OUT_W, OUT_H]};
})();
