// Read-only Google Drive access for the weekly schedule photo picker.
// Only image files directly inside DRIVE_FOLDER_ID are ever listed or served;
// "archived" is our own D1 flag — nothing in Drive is moved, renamed or deleted.
import { HttpError } from './http.js';
import { parseServiceAccount, accessToken, clearToken } from './sheets.js';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const API = 'https://www.googleapis.com/drive/v3/files';
const ID_RE = /^[A-Za-z0-9_-]{10,200}$/;
export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
// Formats every browser can draw on a canvas; anything else (HEIC…) is served via Drive's JPEG rendition.
const WEB_SAFE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export const isDriveId = id => ID_RE.test(String(id || ''));

export function driveConfig(env) {
  const sa = parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const folder = String(env.DRIVE_FOLDER_ID || '');
  return { sa, folder: isDriveId(folder) ? folder : '', email: sa ? sa.email : null };
}

function requireConfig(env) {
  const cfg = driveConfig(env);
  if (!cfg.sa) throw new HttpError(503, 'not_configured', '尚未設定 Google 服務帳戶');
  if (!cfg.folder) throw new HttpError(503, 'not_configured', '尚未設定 Google Drive 資料夾');
  return cfg;
}

async function driveFetch(env, cfg, url, fetchImpl) {
  const token = await accessToken(cfg.sa, fetchImpl, DRIVE_SCOPE);
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) clearToken(DRIVE_SCOPE);
  return res;
}

function upstreamError(status, cfg) {
  if (status === 403 || status === 404) {
    return new HttpError(502, 'drive_no_access', `讀取不到 Google Drive 資料夾，請確認已把資料夾分享給服務帳戶 ${cfg.email}（檢視者即可）`);
  }
  return new HttpError(502, 'drive_error', `Google Drive 暫時未能回應（${status}），請稍後再試`);
}

/** All image files directly in the folder, newest first. Only whitelisted fields are returned. */
export async function listPhotos(env, fetchImpl = fetch) {
  const cfg = requireConfig(env);
  const q = `'${cfg.folder}' in parents and trashed = false and mimeType contains 'image/'`;
  const out = [];
  let pageToken = '';
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({
      q, orderBy: 'createdTime desc', pageSize: '200', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
      fields: 'nextPageToken,files(id,name,mimeType,size,createdTime,imageMediaMetadata(width,height))',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await driveFetch(env, cfg, `${API}?${params}`, fetchImpl);
    if (!res.ok) throw upstreamError(res.status, cfg);
    const data = await res.json();
    for (const f of data.files || []) {
      if (!isDriveId(f.id)) continue;
      out.push({
        id: f.id, name: String(f.name || '').slice(0, 120), mime: String(f.mimeType || ''),
        size: Number(f.size) || null, createdTime: f.createdTime || null,
        width: f.imageMediaMetadata?.width ?? null, height: f.imageMediaMetadata?.height ?? null,
      });
    }
    pageToken = data.nextPageToken || '';
    if (!pageToken) break;
  }
  return { photos: out, email: cfg.email };
}

/** Metadata for one file, refusing anything that is not an image directly in the folder. */
async function photoMeta(env, cfg, id, fetchImpl) {
  if (!isDriveId(id)) throw new HttpError(404, 'not_found', '找不到相片');
  const params = new URLSearchParams({ fields: 'id,mimeType,size,parents,trashed,thumbnailLink', supportsAllDrives: 'true' });
  const res = await driveFetch(env, cfg, `${API}/${id}?${params}`, fetchImpl);
  if (res.status === 404) throw new HttpError(404, 'not_found', '找不到相片');
  if (!res.ok) throw upstreamError(res.status, cfg);
  const f = await res.json();
  if (f.trashed || !Array.isArray(f.parents) || !f.parents.includes(cfg.folder) || !String(f.mimeType || '').startsWith('image/')) {
    throw new HttpError(404, 'not_found', '找不到相片');
  }
  return f;
}

const imageHeaders = (type, maxAge) => ({
  'Content-Type': type, 'Cache-Control': `private, max-age=${maxAge}`,
  'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'",
});

async function fetchThumb(env, cfg, f, size, fetchImpl) {
  if (!f.thumbnailLink || !/^https:\/\/[a-z0-9.-]+\.(googleusercontent|google)\.com\//.test(f.thumbnailLink)) return null;
  const link = f.thumbnailLink.replace(/=s\d+$/, '') + `=s${size}`;
  const res = await driveFetch(env, cfg, link, fetchImpl);
  const type = res.headers.get('content-type') || '';
  return res.ok && type.startsWith('image/') ? new Response(res.body, { headers: imageHeaders(type, 3600) }) : null;
}

async function fetchOriginal(env, cfg, f, fetchImpl) {
  if (Number(f.size) > MAX_PHOTO_BYTES) throw new HttpError(413, 'too_large', '相片太大（上限 25 MB）');
  const res = await driveFetch(env, cfg, `${API}/${f.id}?alt=media&supportsAllDrives=true`, fetchImpl);
  if (!res.ok) throw upstreamError(res.status, cfg);
  return new Response(res.body, { headers: imageHeaders(f.mimeType, 3600) });
}

/** Small preview for the picker grid. */
export async function photoThumb(env, id, fetchImpl = fetch) {
  const cfg = requireConfig(env);
  const f = await photoMeta(env, cfg, id, fetchImpl);
  const t = await fetchThumb(env, cfg, f, 400, fetchImpl);
  if (t) return t;
  if (WEB_SAFE.has(f.mimeType)) return fetchOriginal(env, cfg, f, fetchImpl);
  throw new HttpError(415, 'no_preview', '這張相片暫時未有預覽');
}

/** Full image for the editor: the original when the browser can decode it, else a large JPEG rendition. */
export async function photoContent(env, id, fetchImpl = fetch) {
  const cfg = requireConfig(env);
  const f = await photoMeta(env, cfg, id, fetchImpl);
  if (WEB_SAFE.has(f.mimeType)) return fetchOriginal(env, cfg, f, fetchImpl);
  const t = await fetchThumb(env, cfg, f, 2000, fetchImpl);
  if (t) return t;
  throw new HttpError(415, 'unsupported', '這個相片格式未能讀取，請改用 JPEG 或 PNG');
}
