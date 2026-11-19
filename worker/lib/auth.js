// Admin authentication: one shared password, kept in a Cloudflare secret — either
// ADMIN_PASSWORD (plain text, simplest to set in the dashboard) or ADMIN_PASSWORD_HASH
// (PBKDF2, from `npm run hash-password`). Sessions are random tokens; D1 stores their SHA-256 only.
import { HttpError, clientIp } from './http.js';
import { b64urlEncode, b64Decode, safeEqual, sha256Hex, nowIso } from './util.js';

export const COOKIE = 'qg_admin';
const SESSION_HOURS = 12;
const LOGIN_WINDOW_MIN = 15;
const LOGIN_MAX_FAILS = 5;
const ITERATIONS = 100000; // Workers' PBKDF2 maximum

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

/** Produce the value to store in the ADMIN_PASSWORD_HASH secret. */
export async function hashPassword(password, iterations = ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${b64urlEncode(salt)}$${b64urlEncode(hash)}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 10000 || iterations > ITERATIONS) return false;
  const hash = await pbkdf2(String(password), b64Decode(parts[2]), iterations);
  return safeEqual(b64urlEncode(hash), parts[3]);
}

/** Check against whichever secret is configured. A non-PBKDF2 value in
 *  ADMIN_PASSWORD_HASH is treated as the plain password. */
export async function checkPassword(password, env) {
  const hash = String(env.ADMIN_PASSWORD_HASH || '');
  if (hash.startsWith('pbkdf2-sha256$')) return verifyPassword(password, hash);
  const plain = String(env.ADMIN_PASSWORD || hash);
  if (!plain) return false;
  return safeEqual(await sha256Hex(String(password ?? '')), await sha256Hex(plain));
}

function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return '';
}

export function sessionCookie(token, maxAge) {
  return `${COOKIE}=${token}; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

/** Fixed-window counter in D1. Returns the count after increment. */
export async function hit(db, bucket, windowSec) {
  const now = Math.floor(Date.now() / 1000);
  const key = `${bucket}:${Math.floor(now / windowSec)}`;
  await db.prepare('DELETE FROM rate_limit WHERE expires_at < ?').bind(now).run();
  const row = await db.prepare(
    `INSERT INTO rate_limit (bucket, count, expires_at) VALUES (?, 1, ?)
     ON CONFLICT(bucket) DO UPDATE SET count = count + 1 RETURNING count`
  ).bind(key, now + windowSec).first();
  return row ? row.count : 1;
}

export async function peek(db, bucket, windowSec) {
  const now = Math.floor(Date.now() / 1000);
  const row = await db.prepare('SELECT count FROM rate_limit WHERE bucket = ?')
    .bind(`${bucket}:${Math.floor(now / windowSec)}`).first();
  return row ? row.count : 0;
}

export async function login(request, env, body) {
  if (!env.ADMIN_PASSWORD && !env.ADMIN_PASSWORD_HASH) throw new HttpError(503, 'not_configured', '管理密碼尚未設定');
  const ip = clientIp(request);
  const windowSec = LOGIN_WINDOW_MIN * 60;
  if (await peek(env.DB, `loginfail:${ip}`, windowSec) >= LOGIN_MAX_FAILS) {
    throw new HttpError(429, 'locked', `嘗試次數過多，請 ${LOGIN_WINDOW_MIN} 分鐘後再試`);
  }
  const ok = await checkPassword(body && body.password, env);
  if (!ok) {
    await hit(env.DB, `loginfail:${ip}`, windowSec);
    throw new HttpError(401, 'bad_password', '密碼不正確');
  }
  const token = b64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const name = String((body && body.name) || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 30) || '管理員';
  const expires = new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString();
  await env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').bind(nowIso()).run();
  await env.DB.prepare('INSERT INTO admin_sessions (token_hash, actor, created_at, expires_at, ip) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256Hex(token), name, nowIso(), expires, ip).run();
  return { token, actor: name, expires, maxAge: SESSION_HOURS * 3600 };
}

export async function logout(request, env) {
  const token = readCookie(request, COOKIE);
  if (token) await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
}

/** Server-side authorisation for every /api/admin/* call except login. */
export async function requireAdmin(request, env) {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    // CSRF: same-origin only, plus a custom header that forms cannot send.
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, 'bad_origin', '來源不符');
    if (request.headers.get('x-qg-admin') !== '1') throw new HttpError(403, 'missing_header', '請求格式不正確');
  }
  const token = readCookie(request, COOKIE);
  if (!token) throw new HttpError(401, 'login_required', '請先登入');
  const row = await env.DB.prepare('SELECT actor, expires_at FROM admin_sessions WHERE token_hash = ?')
    .bind(await sha256Hex(token)).first();
  if (!row || row.expires_at < nowIso()) throw new HttpError(401, 'login_required', '登入已過期，請重新登入');
  // General admin API rate limit: 300 requests per 5 minutes per session.
  if (await hit(env.DB, `admin:${row.actor}:${token.slice(0, 8)}`, 300) > 300) {
    throw new HttpError(429, 'rate_limited', '操作太頻密，請稍後再試');
  }
  return { actor: row.actor };
}

export async function audit(env, actor, action, target, detail = {}) {
  await env.DB.prepare('INSERT INTO audit_log (at, actor, action, target, detail) VALUES (?, ?, ?, ?, ?)')
    .bind(nowIso(), actor, action, target || null, JSON.stringify(detail)).run();
}
