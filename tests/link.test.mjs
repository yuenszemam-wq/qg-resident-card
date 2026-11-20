// 報更系統連結：檔案上傳／讀取／刪除、/media 不公開居民相片、排更代理及文案格式
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { hashPassword } from '../worker/lib/auth.js';
import { makeD1, makeR2, req, makePng } from './helpers.mjs';

const PASSWORD = 'test-password-for-ci';
const SECRET = 'x'.repeat(40);
let env, HASH, shiftCalls;
const call = r => worker.fetch(r, env, { waitUntil() {} });
const data = async r => { const res = await call(r); return { status: res.status, body: await res.json().catch(() => null), res }; };
const link = (path, opts = {}) => req(path, { ...opts, headers: { 'x-qg-link': SECRET, ...(opts.headers || {}) } });

async function loginCookie() {
  const res = await call(req('/api/admin/login', { method: 'POST', body: { password: PASSWORD, name: '測試' } }));
  return res.headers.get('set-cookie').split(';')[0];
}

const ROSTER = {
  from: '2026-11-07', to: '2026-11-07', publishedMonths: ['2026-11'],
  days: [{ date: '2026-11-07', weekday: '六', event: '天使惡魔日', start: '18:00', end: '22:00', redDay: false, holiday: '' }],
  assignments: [
    { id: 11, date: '2026-11-07', kind: '常駐', name: '悅夢', ig: '@moondreamovo', start: '18:00', end: '22:00', duties: [], photoAsset: null, promoAsset: null, promotedAt: null },
    { id: 12, date: '2026-11-07', kind: '限定', name: '朱古力', ig: '@choco', start: '19:00', end: '22:00', duties: [], photoAsset: 'A'.repeat(26), promoAsset: 'A'.repeat(26), promotedAt: null },
  ],
};

beforeEach(async () => {
  HASH ??= await hashPassword(PASSWORD, 20000);
  shiftCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    shiftCalls.push({ url, init });
    if (init.headers?.['X-QG-Link'] !== SECRET) return Response.json({ message: 'no' }, { status: 401 });
    if (url.startsWith('https://shift.test/api/link/roster')) return Response.json(ROSTER);
    if (url === 'https://shift.test/api/link/promo') return Response.json({ assignmentId: 12, promotedAt: '2026-11-20T00:00:00.000Z' });
    if (url === 'https://shift.test/api/link/duty-photos') return Response.json({ photos: [] });
    return new Response('', { status: 404 });
  };
  env = { DB: makeD1(), MEDIA: makeR2(), ADMIN_PASSWORD_HASH: HASH, QG_LINK_SECRET: SECRET, SHIFT_SYSTEM_URL: 'https://shift.test', ASSETS: { fetch: () => new Response('static') } };
});

test('link API needs the shared secret', async () => {
  const bad = await data(req('/api/link/assets?purpose=profile&owner=x', { method: 'POST', raw: makePng(10, 10), headers: { 'x-qg-link': 'wrong' } }));
  assert.equal(bad.status, 401);
  env.QG_LINK_SECRET = 'short';
  const weak = await data(link('/api/link/assets?purpose=profile&owner=x', { method: 'POST', raw: makePng(10, 10) }));
  assert.equal(weak.status, 401, 'secrets shorter than 32 characters are refused');
});

test('upload, private read, hidden from /media, delete', async () => {
  const up = await data(link('/api/link/assets?purpose=duty&owner=shift:test:r1', { method: 'POST', raw: makePng(220, 300, { exif: true }) }));
  assert.equal(up.status, 201);
  assert.match(up.body.assetId, /^[0-9A-Z]{26}$/);
  assert.equal(up.body.width, 220);
  const id = up.body.assetId;
  const row = env.DB.raw.prepare('SELECT purpose, owner_id FROM assets WHERE asset_id = ?').get(id);
  assert.deepEqual({ ...row }, { purpose: 'link.duty', owner_id: 'shift:test:r1' });
  assert.equal((await call(req(`/media/${id}`))).status, 404, 'resident photos are not public');
  const got = await call(link(`/api/link/assets/${id}`));
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('content-type'), 'image/png');
  // admin can read it for the weekly picker
  const cookie = await loginCookie();
  assert.equal((await call(req(`/api/admin/drive/photos/${id}/content`, { cookie }))).status, 200);
  const del = await data(link(`/api/link/assets/${id}`, { method: 'DELETE' }));
  assert.equal(del.status, 200);
  assert.equal(env.MEDIA.store.size, 0);
  assert.equal((await call(link(`/api/link/assets/${id}`))).status, 404);
});

test('bad purpose and non-image uploads are rejected', async () => {
  assert.equal((await data(link('/api/link/assets?purpose=evil&owner=x', { method: 'POST', raw: makePng(220, 220) }))).status, 422);
  assert.equal((await data(link('/api/link/assets?purpose=profile&owner=x', { method: 'POST', raw: new TextEncoder().encode('<svg/>') }))).status, 415);
  assert.equal((await data(link('/api/link/assets?purpose=profile&owner=x', { method: 'POST', raw: makePng(50, 50) }))).status, 422, 'too small');
});

test('admin roster proxy adds photo urls and categories; promo marks through the link', async () => {
  const cookie = await loginCookie();
  assert.equal((await data(req('/api/admin/roster?from=2026-11-07&to=2026-11-07'))).status, 401);
  env.DB.raw.prepare(`INSERT INTO residents (resident_id, sheet_name, ig, ig_norm, photo_asset_id, created_at, updated_at) VALUES ('R1', '悅夢', '@moondreamovo', 'moondreamovo', ?, 'x', 'x')`).run('P'.repeat(26));
  const r = await data(req('/api/admin/roster?from=2026-11-07&to=2026-11-07', { cookie }));
  assert.equal(r.status, 200);
  const [a, b] = r.body.assignments;
  assert.equal(a.category, 'regular');
  assert.equal(a.photo, '/media/' + 'P'.repeat(26), 'falls back to the admin photo matched by IG');
  assert.equal(a.photoSource, 'admin');
  assert.equal(b.category, 'limited');
  assert.equal(b.photo, '/api/admin/roster/photo/' + 'A'.repeat(26));
  assert.equal(b.photoSource, 'promo');
  const p = await data(req('/api/admin/roster/promo', { method: 'POST', cookie, body: { assignmentId: 12, promoted: true } }));
  assert.equal(p.status, 200);
  const sent = JSON.parse(shiftCalls.find(c => c.url.endsWith('/api/link/promo')).init.body);
  assert.deepEqual(sent, { assignmentId: 12, promoted: true, actor: '測試' });
});

test('weekly and calendar copy follow the templates', async () => {
  globalThis.window = globalThis; globalThis.document = { readyState: 'complete', getElementById: () => null };
  globalThis.setTimeout = fn => 0;
  await import('../ui/roster-link.js?t=' + Date.now());
  const L = globalThis.qgRosterLink;
  const week = L.weeklyText(ROSTER, '2026-11-07', '2026-11-08');
  assert.ok(week.startsWith('～\n✦✧✦✧✦✧✦✧✦✧✦\n🌹 Queen’s Garden 🌹\n🔱 《異世界居民出沒啟示錄》 🔱'));
  assert.ok(week.includes('🗓 7 / 11 𝕾𝖆𝖙\n🎀 天使惡魔日 🎀\n⏰ 6:00pm ─ 10:00pm\n⚜ 出沒居民\n⚜ 悅夢 @moondreamovo\n♦️ 限定居民\n♦️ 朱古力 @choco\n⋆ ─ ─ ─ ─ ─ ─ ─ ⋆'));
  assert.ok(week.includes('🗓 8 / 11 𝕾𝖚𝖓\n⏰ 6:00pm ─ 10:00pm\n⚠️ 名單待公布'));
  assert.ok(week.includes('📍 Queen’s Garden｜異世界入口'));
  const cal = L.calendarText(ROSTER, '2026-11');
  assert.ok(cal.startsWith('🕰️《居民召喚月曆｜November 2026》🕰️\n\n🎀 特別活動日 🎀\n7 / 11 𝕾𝖆𝖙｜天使惡魔日'));
  assert.ok(cal.includes('🗓 7 / 11 𝕾𝖆𝖙｜🕰️6-10 PM\n🎀 天使惡魔日 🎀\n⚜ 悅夢\n♦️ 朱古力'));
  assert.ok(cal.includes('🗓 30 / 11 𝕸𝖔𝖓｜🕰️6-10 PM\n⚠️ 名單待公布'));
  assert.equal(L.shortRange('18:30', '21:30'), '6:30-9:30 PM');
});
