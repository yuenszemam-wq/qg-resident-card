// Upload validation: detect the real format from file bytes (not the name or
// header), read dimensions and alpha, and strip EXIF/XMP/text metadata.
import { HttpError } from './http.js';

export const LIMITS = {
  photo: 8 * 1024 * 1024,
  image: 10 * 1024 * 1024,
  font: 5 * 1024 * 1024,
};
const MAX_SIDE = 6000;

const u32be = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const u32le = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const u24le = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
const ascii = (b, o, n) => String.fromCharCode(...b.subarray(o, o + n));

export function sniff(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a) return 'image/png';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'image/webp';
  if (b.length >= 4) {
    const sig = ascii(b, 0, 4);
    if (sig === 'wOF2') return 'font/woff2';
    if (sig === 'wOFF') return 'font/woff';
    if (sig === 'OTTO') return 'font/otf';
    if (sig === 'true' || (b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0)) return 'font/ttf';
  }
  return null;
}

function pngInfo(b) {
  if (ascii(b, 12, 4) !== 'IHDR') throw new HttpError(422, 'bad_image', 'PNG 檔案損壞');
  const width = u32be(b, 16), height = u32be(b, 20), colorType = b[25];
  let alpha = colorType === 4 || colorType === 6;
  const keep = [b.subarray(0, 8)];
  let o = 8, stripped = false;
  while (o + 12 <= b.length) {
    const len = u32be(b, o), type = ascii(b, o + 4, 4), end = o + 12 + len;
    if (end > b.length) throw new HttpError(422, 'bad_image', 'PNG 檔案損壞');
    if (type === 'tRNS') alpha = true;
    if (type === 'acTL') throw new HttpError(422, 'animated', '不支援動態圖片');
    if (['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME'].includes(type)) stripped = true;
    else keep.push(b.subarray(o, end));
    o = end;
    if (type === 'IEND') break;
  }
  return { width, height, alpha, bytes: stripped ? concat(keep) : b };
}

function webpInfo(b) {
  let width = 0, height = 0, alpha = false, o = 12, vp8x = -1;
  const chunks = [];
  while (o + 8 <= b.length) {
    const type = ascii(b, o, 4), len = u32le(b, o + 4), end = o + 8 + len + (len & 1);
    if (o + 8 + len > b.length) throw new HttpError(422, 'bad_image', 'WebP 檔案損壞');
    chunks.push({ type, start: o, end: Math.min(end, b.length) });
    if (type === 'VP8X') {
      vp8x = o;
      const flags = b[o + 8];
      if (flags & 0x02) throw new HttpError(422, 'animated', '不支援動態圖片');
      if (flags & 0x10) alpha = true;
      width = u24le(b, o + 12) + 1; height = u24le(b, o + 15) + 1;
    } else if (type === 'VP8 ' && !width) {
      width = (b[o + 14] | (b[o + 15] << 8)) & 0x3fff; height = (b[o + 16] | (b[o + 17] << 8)) & 0x3fff;
    } else if (type === 'VP8L' && !width) {
      const bits = u32le(b, o + 9);
      width = (bits & 0x3fff) + 1; height = ((bits >> 14) & 0x3fff) + 1; alpha = alpha || !!((bits >> 28) & 1);
    } else if (type === 'ALPH') alpha = true;
    else if (type === 'ANIM' || type === 'ANMF') throw new HttpError(422, 'animated', '不支援動態圖片');
    o = end;
  }
  const meta = chunks.filter(c => c.type === 'EXIF' || c.type === 'XMP ');
  if (!meta.length) return { width, height, alpha, bytes: b };
  const parts = [b.subarray(0, 12), ...chunks.filter(c => !meta.includes(c)).map(c => b.subarray(c.start, c.end))];
  const out = concat(parts);
  if (vp8x >= 0) {
    const shift = chunks.filter(c => meta.includes(c) && c.start < vp8x).reduce((s, c) => s + (c.end - c.start), 0);
    out[vp8x - shift + 8] &= ~(0x08 | 0x04); // clear EXIF + XMP flags
  }
  const size = out.length - 8;
  out[4] = size & 255; out[5] = (size >> 8) & 255; out[6] = (size >> 16) & 255; out[7] = (size >>> 24) & 255;
  return { width, height, alpha, bytes: out };
}

function jpegInfo(b) {
  const keep = [b.subarray(0, 2)];
  let o = 2, width = 0, height = 0, stripped = false;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) throw new HttpError(422, 'bad_image', 'JPEG 檔案損壞');
    const marker = b[o + 1];
    if (marker === 0xda) { keep.push(b.subarray(o)); break; } // start of scan: rest is image data
    const len = (b[o + 2] << 8) | b[o + 3], end = o + 2 + len;
    if (end > b.length) throw new HttpError(422, 'bad_image', 'JPEG 檔案損壞');
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      height = (b[o + 5] << 8) | b[o + 6]; width = (b[o + 7] << 8) | b[o + 8];
    }
    if (marker === 0xe1 || marker === 0xed || marker === 0xfe) stripped = true; // EXIF/XMP, IPTC, comments
    else keep.push(b.subarray(o, end));
    o = end;
  }
  return { width, height, alpha: false, bytes: stripped ? concat(keep) : b };
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function hasExif(b) {
  const type = sniff(b);
  if (type === 'image/png') return /eXIf/.test(ascii(b, 0, Math.min(b.length, 1 << 20)));
  if (type === 'image/webp') return webpInfo(b).bytes !== b;
  if (type === 'image/jpeg') return jpegInfo(b).bytes !== b;
  return false;
}

/** Validate an image upload. kind: 'photo' | 'image'. */
export function inspectImage(bytes, kind) {
  const limit = LIMITS[kind];
  if (bytes.length > limit) throw new HttpError(413, 'too_large', `檔案不可大於 ${Math.round(limit / 1048576)} MB`);
  const mime = sniff(bytes);
  const allowed = kind === 'photo' ? ['image/jpeg', 'image/png', 'image/webp'] : ['image/png', 'image/webp'];
  if (!allowed.includes(mime)) {
    throw new HttpError(415, 'bad_type', kind === 'photo' ? '只接受 JPEG、PNG 或 WebP 圖片' : '素材只接受 PNG 或 WebP');
  }
  const info = mime === 'image/png' ? pngInfo(bytes) : mime === 'image/webp' ? webpInfo(bytes) : jpegInfo(bytes);
  if (!info.width || !info.height || info.width > MAX_SIDE || info.height > MAX_SIDE) {
    throw new HttpError(422, 'bad_dimensions', `圖片尺寸無效（最大 ${MAX_SIDE}px）`);
  }
  if (kind === 'photo' && (info.width < 200 || info.height < 200)) throw new HttpError(422, 'too_small', '相片太細（最少 200px）');
  return { mime, width: info.width, height: info.height, alpha: info.alpha, bytes: info.bytes };
}

export function inspectFont(bytes) {
  if (bytes.length > LIMITS.font) throw new HttpError(413, 'too_large', '字體檔不可大於 5 MB');
  const mime = sniff(bytes);
  if (!mime || !mime.startsWith('font/')) throw new HttpError(415, 'bad_type', '只接受 WOFF2、WOFF、TTF 或 OTF 字體');
  return { mime, bytes };
}

export const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'font/woff2': 'woff2', 'font/woff': 'woff', 'font/ttf': 'ttf', 'font/otf': 'otf' };
