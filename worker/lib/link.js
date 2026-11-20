// 與 QG 異世界居民報更系統（qg-shift-system）的連結。
// - 報更系統 → 本系統：/api/link/assets（上傳、讀取、刪除居民相片、限定宣傳照片、收據等），檔案存放於本系統 R2。
// - 本系統 → 報更系統：讀取排更（每日／每週更表、月曆文案、限定／影子選擇）、設定已宣傳、讀取居民交相。
// 兩邊以 Cloudflare Secret「QG_LINK_SECRET」互相驗證；只在伺服器之間傳送，不會出現在瀏覽器。
import { HttpError } from './http.js';

export const LINK_PURPOSES = ['profile', 'duty', 'promo', 'activity', 'receipt'];

function safeEqual(a, b) {
  const x = new TextEncoder().encode(String(a || '')), y = new TextEncoder().encode(String(b || ''));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

export function linkConfigured(env) {
  return !!(env.QG_LINK_SECRET && env.QG_LINK_SECRET.length >= 32 && env.SHIFT_SYSTEM_URL);
}

/** 報更系統呼叫本系統：檢查共用密鑰 */
export function requireLink(request, env) {
  if (!env.QG_LINK_SECRET || env.QG_LINK_SECRET.length < 32 || !safeEqual(request.headers.get('x-qg-link'), env.QG_LINK_SECRET)) {
    throw new HttpError(401, 'link_unauthorized', '連結驗證失敗');
  }
}

/** 本系統呼叫報更系統 */
export async function shiftApi(env, path, init = {}, fetchImpl = fetch) {
  if (!linkConfigured(env)) throw new HttpError(503, 'link_not_configured', '未連接報更系統（QG_LINK_SECRET／SHIFT_SYSTEM_URL 未設定）');
  const url = env.SHIFT_SYSTEM_URL.replace(/\/+$/, '') + path;
  let res;
  try {
    res = await fetchImpl(url, { ...init, headers: { ...(init.headers || {}), 'X-QG-Link': env.QG_LINK_SECRET } });
  } catch {
    throw new HttpError(502, 'shift_unreachable', '暫時未能連接報更系統，請稍後再試');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new HttpError(res.status === 400 || res.status === 404 ? res.status : 502, 'shift_error', (data && data.message) || '報更系統暫時未能回應');
  return data;
}

// 排更身份 → 每日更表分類（resident-card residents.default_category 亦用相同英文代號）
export const KIND_TO_CATEGORY = { 常駐: 'regular', 限定: 'limited', 影子: 'shadow', 試工: 'trial' };
