// Shared helpers for the Queen's Garden Worker. No external dependencies.

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Time-sortable random id (ULID layout). Never derived from a sheet row. */
export function ulid(now = Date.now()) {
  let t = now, time = '';
  for (let i = 0; i < 10; i++) { time = CROCKFORD[t % 32] + time; t = Math.floor(t / 32); }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let rand = '';
  for (let i = 0; i < 16; i++) rand += CROCKFORD[bytes[i] % 32];
  return time + rand;
}

export const nowIso = () => new Date().toISOString();

export function hex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return hex(await crypto.subtle.digest('SHA-256', bytes));
}

export function b64urlEncode(bytes) {
  if (typeof bytes === 'string') bytes = new TextEncoder().encode(bytes);
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64Decode(text) {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Constant-time comparison of two equal-purpose strings. */
export function safeEqual(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** Normalise an Instagram handle for matching: no @, no URL, lower case. */
export function normIg(raw) {
  let s = String(raw || '').trim().normalize('NFKC');
  s = s.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '');
  s = s.replace(/^[@＠\s]+/, '').replace(/\s+/g, '');
  return s.toLowerCase();
}

/** Display form of a handle: one leading @, no spaces. */
export function displayIg(raw) {
  const s = String(raw || '').trim().normalize('NFKC')
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '')
    .replace(/^[@＠\s]+/, '').replace(/\s+/g, '');
  return s ? '@' + s : '';
}

export const cleanName = raw => String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 60);

export const CATEGORIES = ['regular', 'limited', 'shadow', 'trial', 'none'];
