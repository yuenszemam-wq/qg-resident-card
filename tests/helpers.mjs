// Test doubles: D1 over node:sqlite, R2 over a Map, and a fake Google API.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

class Stmt {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new Stmt(this.db, this.sql, args.map(a => (a === undefined ? null : typeof a === 'boolean' ? Number(a) : a))); }
  _s() { return this.db.prepare(this.sql); }
  async first() {
    const s = this._s();
    return /\bRETURNING\b/i.test(this.sql) || /^\s*SELECT/i.test(this.sql) ? (s.get(...this.args) ?? null) : (s.run(...this.args), null);
  }
  async all() { return { results: this._s().all(...this.args) }; }
  async run() { const r = this._s().run(...this.args); return { meta: { changes: Number(r.changes) } }; }
}

export function makeD1() {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  return {
    raw: db,
    prepare: sql => new Stmt(db, sql),
    async batch(stmts) {
      db.exec('BEGIN');
      try { const out = []; for (const s of stmts) out.push(await s.run()); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}

export function makeR2() {
  const store = new Map();
  return {
    store,
    async put(key, bytes, opts = {}) { store.set(key, { bytes: new Uint8Array(bytes), contentType: opts.httpMetadata?.contentType }); },
    async get(key) {
      const v = store.get(key);
      return v ? { body: v.bytes, httpMetadata: { contentType: v.contentType }, httpEtag: '"x"' } : null;
    },
    async delete(key) { store.delete(key); },
  };
}

export async function makeServiceAccount() {
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const der = Buffer.from(await crypto.subtle.exportKey('pkcs8', kp.privateKey)).toString('base64');
  const pem = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
  return JSON.stringify({ client_email: 'qg-reader@example.iam.gserviceaccount.com', private_key: pem });
}

/** Fake Google: rows include extra private columns to prove the whitelist. */
export function fakeGoogle(state) {
  state.calls = [];
  return async (url, init = {}) => {
    url = String(url);
    state.calls.push(url);
    if (state.down) return new Response('{"error":"boom secret"}', { status: 503 });
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      return Response.json({ access_token: 'tok', expires_in: 3600 });
    }
    if (url.startsWith('https://www.googleapis.com/drive/v3/files') || url.startsWith('https://lh3.googleusercontent.com/')) {
      if (init.headers?.Authorization !== 'Bearer tok') return new Response('', { status: 401 });
      return fakeDrive(state, url);
    }
    if (url.startsWith('https://sheets.googleapis.com/')) {
      if (init.headers?.Authorization !== 'Bearer tok') return new Response('', { status: 401 });
      return Response.json({ values: state.rows.map(r => [...r, '98765432', 'salary 5000', 'private note']) });
    }
    return new Response('', { status: 404 });
  };
}

export const ORIGIN = 'https://qg.test';
export function req(path, { method = 'GET', body, headers = {}, cookie, raw } = {}) {
  const h = new Headers(headers);
  if (cookie) h.set('cookie', cookie);
  if (method !== 'GET') { h.set('origin', ORIGIN); if (!h.has('x-qg-admin')) h.set('x-qg-admin', '1'); }
  let payload = raw;
  if (body !== undefined) { h.set('content-type', 'application/json'); payload = JSON.stringify(body); }
  return new Request(ORIGIN + path, { method, headers: h, body: payload });
}

// Minimal valid PNG (1 colour, w×h) with optional eXIf chunk.
import { deflateSync, crc32 } from 'node:zlib';
export function makePng(w, h, { exif = false, alpha = false } = {}) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2;
  const bpp = alpha ? 4 : 3, rows = [];
  for (let y = 0; y < h; y++) rows.push(Buffer.concat([Buffer.from([0]), Buffer.alloc(w * bpp, 0x80)]));
  return new Uint8Array(Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...(exif ? [chunk('eXIf', Buffer.from('MM\0*GPS 22.3,114.1'))] : []),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

/** Fake Drive: state.drive = { folder, files: [{ id, name, mimeType, parents, trashed?, bytes, size? }], denied? } */
function fakeDrive(state, url) {
  const d = state.drive || { files: [] };
  if (d.denied) return new Response('{"error":"forbidden"}', { status: 403 });
  if (d.apiDisabled) return new Response(JSON.stringify({ error: { code: 403, message: 'secret upstream text', status: 'PERMISSION_DENIED',
    errors: [{ reason: 'accessNotConfigured' }], details: [{ reason: 'SERVICE_DISABLED' }] } }), { status: 403 });
  const u = new URL(url);
  if (u.hostname === 'lh3.googleusercontent.com') {
    const f = d.files.find(x => u.pathname.includes(x.id));
    return f ? new Response(new Uint8Array([0xff, 0xd8, 0xff, 1]), { headers: { 'content-type': 'image/jpeg' } }) : new Response('', { status: 404 });
  }
  const m = u.pathname.match(/\/files\/([^/]+)$/);
  if (!m) {
    const q = u.searchParams.get('q') || '';
    const folder = (q.match(/^'([^']+)' in parents/) || [])[1];
    d.lastQuery = q;
    const files = d.files.filter(f => f.parents.includes(folder) && !f.trashed && f.mimeType.startsWith('image/'))
      .map(({ id, name, mimeType, size, bytes }) => ({ id, name, mimeType, size: String(size ?? bytes.length), createdTime: '2026-11-19T00:00:00Z', secret: 'owner-email' }));
    return Response.json({ files });
  }
  const f = d.files.find(x => x.id === m[1]);
  if (!f) return new Response('', { status: 404 });
  if (u.searchParams.get('alt') === 'media') return new Response(f.bytes, { headers: { 'content-type': f.mimeType } });
  return Response.json({ id: f.id, mimeType: f.mimeType, size: String(f.size ?? f.bytes.length), parents: f.parents, trashed: !!f.trashed,
    thumbnailLink: d.noThumbs ? undefined : `https://lh3.googleusercontent.com/drive-storage/${f.id}=s220` });
}
