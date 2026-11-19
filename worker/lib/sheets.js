// Read-only Google Sheets proxy. Only columns B (更表名稱) and C (IG帳號) of
// '表格回應 1' are ever requested; the range is a constant, never user input.
import { b64urlEncode } from './util.js';

export const SHEET_RANGE = "'表格回應 1'!B2:C";
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

let cachedToken = null; // { token, exp, email }

function pemToPkcs8(pem) {
  const body = String(pem).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export function parseServiceAccount(raw) {
  if (!raw) return null;
  let sa;
  try { sa = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  if (!sa || !sa.client_email || !sa.private_key) return null;
  return { email: String(sa.client_email), key: String(sa.private_key) };
}

async function accessToken(sa, fetchImpl) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.email === sa.email && cachedToken.exp - 60 > now) return cachedToken.token;
  const header = b64urlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64urlEncode(JSON.stringify({ iss: sa.email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const key = await crypto.subtle.importKey('pkcs8', pemToPkcs8(sa.key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  const assertion = `${header}.${claims}.${b64urlEncode(sig)}`;
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${assertion}`,
  });
  if (!res.ok) throw new SheetsError(`token_${res.status}`);
  const data = await res.json();
  cachedToken = { token: data.access_token, exp: now + (Number(data.expires_in) || 3600), email: sa.email };
  return cachedToken.token;
}

export class SheetsError extends Error {}

/**
 * Fetch the roster. Returns [{ name, ig }] with only the two whitelisted columns.
 * Upstream bodies are never logged or returned; errors carry a status code only.
 */
export async function fetchRoster(env, fetchImpl = fetch) {
  const sa = parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (!sa) throw new SheetsError('not_configured');
  if (!env.SHEET_ID || !/^[A-Za-z0-9_-]{20,80}$/.test(env.SHEET_ID)) throw new SheetsError('bad_sheet_id');
  const token = await accessToken(sa, fetchImpl);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/${encodeURIComponent(SHEET_RANGE)}` +
    '?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE&fields=values';
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    if (res.status === 401) cachedToken = null;
    throw new SheetsError(`sheets_${res.status}`);
  }
  const data = await res.json();
  const values = Array.isArray(data.values) ? data.values : [];
  // Defensive whitelist: keep only the first two cells of each row (B, C).
  return values.map(row => ({ name: String((row && row[0]) ?? ''), ig: String((row && row[1]) ?? '') }));
}

export function _resetTokenCache() { cachedToken = null; }
