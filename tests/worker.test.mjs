import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { planSync } from '../worker/lib/roster.js';
import { hashPassword, verifyPassword } from '../worker/lib/auth.js';
import { inspectImage, hasExif, sniff } from '../worker/lib/media.js';
import { renderTemplate, validateConfig, defaultConfig } from '../worker/lib/config.js';
import { _resetTokenCache, SHEET_RANGE } from '../worker/lib/sheets.js';
import { makeD1, makeR2, makeServiceAccount, fakeGoogle, req, makePng } from './helpers.mjs';

const PASSWORD = 'test-password-for-ci';
let env, google, HASH, SA;
const call = r => worker.fetch(r, env, { waitUntil() {} });
const data = async r => { const res = await call(r); return { status: res.status, body: await res.json().catch(() => null), res }; };

async function loginCookie() {
  const res = await call(req('/api/admin/login', { method: 'POST', body: { password: PASSWORD, name: '測試管理員' } }));
  assert.equal(res.status, 200);
  return res.headers.get('set-cookie').split(';')[0];
}

beforeEach(async () => {
  HASH ??= await hashPassword(PASSWORD, 20000);
  SA ??= await makeServiceAccount();
  _resetTokenCache();
  google = { rows: [['大Sakura', '@Sakura_maidsan'], ['小豆', '@rinnkaunn'], ['小魚', '@Fish_Cwy']] };
  globalThis.fetch = fakeGoogle(google);
  env = {
    DB: makeD1(), MEDIA: makeR2(), SHEET_ID: '1LOLGOskQi2lpahGrCdcpo8E4b3d2s78pA6eairtpHb4',
    ADMIN_PASSWORD_HASH: HASH, GOOGLE_SERVICE_ACCOUNT_JSON: SA,
    ASSETS: { fetch: () => new Response('static') },
  };
});

const ids = rows => Object.fromEntries(rows.map(r => [r.name, r.id]));

// ------------------------------------------------------------- Google Sheets
test('sync returns only name and IG, requesting only columns B:C', async () => {
  const { status, body } = await data(req('/api/public/residents'));
  assert.equal(status, 200);
  assert.deepEqual(body.residents.map(r => [r.name, r.ig, r.category]),
    [['大Sakura', '@Sakura_maidsan', 'regular'], ['小豆', '@rinnkaunn', 'regular'], ['小魚', '@Fish_Cwy', 'regular']]);
  const text = JSON.stringify(body);
  for (const secret of ['98765432', 'salary', 'private note']) assert.ok(!text.includes(secret));
  const sheetCall = google.calls.find(u => u.includes('sheets.googleapis.com'));
  assert.ok(sheetCall.includes(encodeURIComponent(SHEET_RANGE)));
  assert.equal(SHEET_RANGE, "'表格回應 1'!B2:C");
  assert.ok(body.syncedAt);
  // Nothing private reached D1 either.
  const dump = JSON.stringify(env.DB.raw.prepare('SELECT * FROM residents').all());
  assert.ok(!dump.includes('salary'));
});

test('cached for 5 minutes; name change syncs and keeps id + photo', async () => {
  const first = (await data(req('/api/public/residents'))).body;
  const before = ids(first.residents);
  const n = google.calls.length;
  await data(req('/api/public/residents'));
  assert.equal(google.calls.length, n, 'second load within 5 minutes uses cache');
  env.DB.raw.prepare(`UPDATE residents SET photo_asset_id = 'PHOTO1' WHERE resident_id = ?`).run(before['小豆']);
  google.rows[1] = ['小豆豆', '@rinnkaunn'];
  env.DB.raw.prepare(`UPDATE sync_state SET last_success_at = '2000-01-01T00:00:00Z', last_attempt_at = '2000-01-01T00:00:00Z'`).run();
  const after = (await data(req('/api/public/residents'))).body.residents;
  const renamed = after.find(r => r.name === '小豆豆');
  assert.equal(renamed.id, before['小豆']);
  assert.equal(renamed.photo, '/media/PHOTO1');
});

test('Google failure keeps the last good roster', async () => {
  const ok = (await data(req('/api/public/residents'))).body;
  google.down = true;
  env.DB.raw.prepare(`UPDATE sync_state SET last_success_at = '2000-01-01T00:00:00Z', last_attempt_at = '2000-01-01T00:00:00Z'`).run();
  const res = await data(req('/api/public/residents'));
  assert.equal(res.status, 200);
  assert.equal(res.body.residents.length, ok.residents.length);
  assert.equal(res.body.stale, true);
  const st = env.DB.raw.prepare('SELECT last_error FROM sync_state').get();
  assert.match(st.last_error, /_503$/);
  assert.ok(!JSON.stringify(res.body).includes('boom secret'));
});

test('missing credentials: public API still answers with configured=false', async () => {
  delete env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const res = await data(req('/api/public/residents'));
  assert.equal(res.status, 200);
  assert.equal(res.body.configured, false);
  assert.deepEqual(res.body.residents, []);
});

// ------------------------------------------------------------- matching rules
test('planSync: IG change is queued, never merged automatically', () => {
  const residents = [{ resident_id: 'A', sheet_name: '幽月', ig: '@old', ig_norm: 'old', sync_status: 'active' }];
  const p = planSync([{ name: '幽月', ig: '@new' }], residents);
  assert.equal(p.creates.length, 0);
  assert.equal(p.updates.length, 0);
  assert.equal(p.queue[0].reason, 'ig_changed');
  assert.deepEqual(p.queue[0].candidate_ids, ['A']);
  assert.deepEqual(p.missing, [], 'candidate stays visible while queued');
});

test('planSync: duplicate IG and missing data go to the queue', () => {
  const p = planSync([{ name: 'A', ig: '@same' }, { name: 'B', ig: '@SAME' }, { name: '', ig: '' }, { name: 'C', ig: '' }], []);
  assert.deepEqual(p.queue.map(q => q.reason).sort(), ['duplicate_ig', 'missing_data']);
  assert.equal(p.creates.length, 0);
});

test('planSync: IG normalisation and removed residents marked missing (not deleted)', () => {
  const residents = [
    { resident_id: 'A', sheet_name: 'A', ig: '@Fish_Cwy', ig_norm: 'fish_cwy', sync_status: 'active' },
    { resident_id: 'B', sheet_name: 'B', ig: '@gone', ig_norm: 'gone', sync_status: 'active' },
  ];
  const p = planSync([{ name: 'A', ig: 'https://instagram.com/fish_cwy/' }], residents);
  assert.deepEqual(p.missing, ['B']);
  assert.equal(p.updates.length, 1); // display IG normalised
});

test('planSync: recorded decisions are not re-queued', () => {
  const first = planSync([{ name: 'A', ig: '@x' }, { name: 'B', ig: '@x' }], []);
  const again = planSync([{ name: 'A', ig: '@x' }, { name: 'B', ig: '@x' }], [], new Set(first.queue.map(q => q.key)));
  assert.equal(again.queue.length, 0);
});

test('queue: admin resolves an IG change by merging, photo stays with the resident', async () => {
  const cookie = await loginCookie();
  const r1 = (await data(req('/api/public/residents'))).body.residents;
  const fish = r1.find(r => r.name === '小魚');
  env.DB.raw.prepare(`UPDATE residents SET photo_asset_id = 'P' WHERE resident_id = ?`).run(fish.id);
  google.rows[2] = ['小魚', '@fish_new'];
  await data(req('/api/admin/sync', { method: 'POST', cookie }));
  const admin = (await data(req('/api/admin/residents', { cookie }))).body;
  assert.equal(admin.queue.length, 1);
  assert.equal(admin.queue[0].reason, 'ig_changed');
  const res = await data(req(`/api/admin/queue/${admin.queue[0].queue_id}`, { method: 'POST', cookie, body: { action: 'merge', residentId: fish.id } }));
  assert.equal(res.status, 200);
  const row = env.DB.raw.prepare('SELECT ig, photo_asset_id FROM residents WHERE resident_id = ?').get(fish.id);
  assert.equal(row.ig, '@fish_new');
  assert.equal(row.photo_asset_id, 'P');
});

// ------------------------------------------------------------- auth
test('password hash verifies; wrong password rejected', async () => {
  assert.ok(await verifyPassword(PASSWORD, HASH));
  assert.ok(!(await verifyPassword('nope', HASH)));
  assert.ok(!HASH.includes(PASSWORD));
});

test('admin API needs a session; /admin page itself grants nothing', async () => {
  assert.equal((await data(req('/api/admin/residents'))).status, 401);
  assert.equal((await data(req('/api/admin/config/publish', { method: 'POST', body: {} }))).status, 401);
  const forged = await data(req('/api/admin/residents', { cookie: 'qg_admin=forged' }));
  assert.equal(forged.status, 401);
});

test('legacy daily copy default is upgraded to the new grouped template', async () => {
  const { defaultConfig, upgradeConfig } = await import('../worker/lib/config.js');
  const cfg = defaultConfig();
  assert.equal(cfg.copy.daily.enabled, true);
  assert.match(cfg.copy.daily.template, /🕯️ 異世界居民每日出沒啟示錄 🕯️/);
  const legacy = structuredClone(cfg);
  legacy.copy.daily = { enabled: false, template: '✧ 異世界居民每日出沒啟示錄 ✧\n📜 {{DATE}}\n🌙 {{TIME}}\n\n{{RESIDENT_LIST}}\n\n📍 旺角・西洋菜街 遠景大廈 3 樓 H2 室\n歡迎 DM 預約 🫶🏻' };
  assert.deepEqual(upgradeConfig(legacy).copy.daily, cfg.copy.daily);
  const edited = structuredClone(cfg); edited.copy.daily = { enabled: false, template: '自訂' };
  assert.deepEqual(upgradeConfig(edited).copy.daily, { enabled: false, template: '自訂' });
});

test('plain ADMIN_PASSWORD secret also works', async () => {
  delete env.ADMIN_PASSWORD_HASH;
  env.ADMIN_PASSWORD = 'plain-pass';
  assert.equal((await data(req('/api/admin/login', { method: 'POST', body: { password: 'wrong' } }))).status, 401);
  assert.equal((await data(req('/api/admin/login', { method: 'POST', body: { password: 'plain-pass' } }))).status, 200);
  delete env.ADMIN_PASSWORD;
  env.ADMIN_PASSWORD_HASH = 'plain-pass';
  assert.equal((await data(req('/api/admin/login', { method: 'POST', body: { password: 'plain-pass' } }))).status, 200);
  delete env.ADMIN_PASSWORD_HASH;
  assert.equal((await data(req('/api/admin/login', { method: 'POST', body: { password: 'plain-pass' } }))).status, 503);
});

test('login lockout after 5 failures; CSRF header and origin enforced', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await data(req('/api/admin/login', { method: 'POST', body: { password: 'x' } }))).status, 401);
  assert.equal((await data(req('/api/admin/login', { method: 'POST', body: { password: PASSWORD } }))).status, 429);
  env.DB.raw.prepare('DELETE FROM rate_limit').run();
  const cookie = await loginCookie();
  const noHeader = await data(req('/api/admin/sync', { method: 'POST', cookie, headers: { 'x-qg-admin': '0' } }));
  assert.equal(noHeader.status, 403);
  const r = req('/api/admin/sync', { method: 'POST', cookie });
  const evil = new Request(r, { headers: new Headers([...r.headers].filter(([k]) => k !== 'origin').concat([['origin', 'https://evil.test']])) });
  assert.equal((await call(evil)).status, 403);
});

test('session cookie is HttpOnly, Secure, SameSite=Strict, scoped to admin API', async () => {
  const res = await call(req('/api/admin/login', { method: 'POST', body: { password: PASSWORD } }));
  const c = res.headers.get('set-cookie');
  for (const part of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/api/admin']) assert.ok(c.includes(part), part);
  const row = env.DB.raw.prepare('SELECT token_hash FROM admin_sessions').get();
  assert.ok(!c.includes(row.token_hash), 'raw token is not stored');
});

// ------------------------------------------------------------- photos & media
test('photo upload strips EXIF, versions, restores and serves', async () => {
  const cookie = await loginCookie();
  const resident = (await data(req('/api/public/residents'))).body.residents[0];
  const ver = () => env.DB.raw.prepare('SELECT version FROM residents WHERE resident_id = ?').get(resident.id).version;
  const png = makePng(300, 400, { exif: true });
  assert.ok(hasExif(png));
  const up1 = await data(req(`/api/admin/residents/${resident.id}/photo?version=${ver()}`, { method: 'POST', cookie, raw: png, headers: { 'content-type': 'image/png' } }));
  assert.equal(up1.status, 200, JSON.stringify(up1.body));
  const stored = env.MEDIA.store.get(`a/${up1.body.assetId}`);
  assert.ok(!hasExif(stored.bytes), 'EXIF removed');
  const up2 = await data(req(`/api/admin/residents/${resident.id}/photo?version=${ver()}`, { method: 'POST', cookie, raw: makePng(300, 400), headers: { 'content-type': 'image/png' } }));
  assert.equal(up2.status, 200);
  // Stale version → conflict
  const stale = await data(req(`/api/admin/residents/${resident.id}/photo?version=1`, { method: 'POST', cookie, raw: makePng(300, 400) }));
  assert.equal(stale.status, 409);
  // Public sees newest; restore the first one.
  let pub = (await data(req('/api/public/residents'))).body.residents.find(r => r.id === resident.id);
  assert.equal(pub.photo, `/media/${up2.body.assetId}`);
  const restore = await data(req(`/api/admin/residents/${resident.id}/photo/restore`, { method: 'POST', cookie, body: { assetId: up1.body.assetId, version: ver() } }));
  assert.equal(restore.status, 200);
  pub = (await data(req('/api/public/residents'))).body.residents.find(r => r.id === resident.id);
  assert.equal(pub.photo, `/media/${up1.body.assetId}`);
  // Other residents untouched.
  const others = (await data(req('/api/public/residents'))).body.residents.filter(r => r.id !== resident.id);
  assert.ok(others.every(r => r.photo === null));
  const media = await call(req(pub.photo));
  assert.equal(media.status, 200);
  assert.equal(media.headers.get('content-type'), 'image/png');
});

test('upload rejects fake images and wrong types', async () => {
  const cookie = await loginCookie();
  const resident = (await data(req('/api/public/residents'))).body.residents[0];
  const fake = new TextEncoder().encode('<svg onload=alert(1)>');
  const r = await data(req(`/api/admin/residents/${resident.id}/photo?version=1`, { method: 'POST', cookie, raw: fake, headers: { 'content-type': 'image/png' } }));
  assert.equal(r.status, 415);
  const tiny = await data(req(`/api/admin/residents/${resident.id}/photo?version=1`, { method: 'POST', cookie, raw: makePng(20, 20) }));
  assert.equal(tiny.status, 422);
  assert.equal(sniff(makePng(2, 2)), 'image/png');
  assert.equal(inspectImage(makePng(10, 10, { alpha: true }), 'image').alpha, true);
});

test('font upload requires licence confirmation', async () => {
  const cookie = await loginCookie();
  const woff2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 1, 0, 0, 0, 0, 0, 0]);
  const no = await data(req('/api/admin/assets?kind=font&license=OFL', { method: 'POST', cookie, raw: woff2 }));
  assert.equal(no.status, 422);
  const yes = await data(req('/api/admin/assets?kind=font&license=SIL%20OFL&confirmed=1', { method: 'POST', cookie, raw: woff2 }));
  assert.equal(yes.status, 200);
});

// ------------------------------------------------------------- settings versions
test('draft does not affect public; publish does; restore works; conflicts detected', async () => {
  const cookie = await loginCookie();
  const pub0 = (await data(req('/api/public/config'))).body;
  assert.ok(pub0.config.copy.promo.template.includes('{{NAME}}'));
  const admin = (await data(req('/api/admin/config', { cookie }))).body;
  assert.equal(admin.published.version_id, 1);
  const body = structuredClone(admin.published.body);
  body.pages.promo.text.name = { font: 'yujis', size: 6 };
  body.copy.promo.template = '🔮 {{NAME}}｜{{IG}}\n✦ {{DATE}}';
  const save = await data(req('/api/admin/config/draft', { method: 'PUT', cookie, body: { body, summary: '改名字字體' } }));
  assert.equal(save.status, 200, JSON.stringify(save.body));
  assert.equal((await data(req('/api/public/config'))).body.version, 1, 'draft is not public');
  // Second save with stale rev → 409
  const stale = await data(req('/api/admin/config/draft', { method: 'PUT', cookie, body: { body, rev: 'old' } }));
  assert.equal(stale.status, 409);
  const pub = await data(req('/api/admin/config/publish', { method: 'POST', cookie, body: { rev: save.body.draft.rev } }));
  assert.equal(pub.status, 200);
  const live = (await data(req('/api/public/config'))).body;
  assert.equal(live.config.pages.promo.text.name.font, 'yujis');
  assert.equal(live.config.copy.promo.template, '🔮 {{NAME}}｜{{IG}}\n✦ {{DATE}}');
  const restore = await data(req('/api/admin/config/restore', { method: 'POST', cookie, body: { versionId: 1, currentId: live.version } }));
  assert.equal(restore.status, 200);
  const back = (await data(req('/api/public/config'))).body;
  assert.deepEqual(back.config.pages.promo.text, {});
  const versions = (await data(req('/api/admin/config', { cookie }))).body.versions;
  assert.equal(versions.length, 3);
  assert.ok(versions[0].published_by === '測試管理員');
});

test('config validation rejects unknown fields, bad assets and unlicensed fonts', () => {
  const base = defaultConfig();
  const bad = structuredClone(base); bad.copy.promo.template = '{{NAME}} {{SALARY}}';
  assert.throws(() => validateConfig(bad), /SALARY/);
  const asset = structuredClone(base); asset.assets['promo/bg'] = 'NOPE';
  assert.throws(() => validateConfig(asset), /素材不存在/);
  const font = structuredClone(base);
  font.fonts.push({ id: 'c_x', family: 'X', assetId: 'F', roles: ['name'], license: { name: 'x', confirmed: false } });
  assert.throws(() => validateConfig(font, { assetKinds: new Map([['F', 'font']]) }), /授權/);
  const layout = structuredClone(base); layout.pages.daily.layouts = { 3: { k: 1, c: [[1, 2]] } };
  assert.throws(() => validateConfig(layout), /3 人版型/);
  assert.ok(validateConfig(base));
});

test('templates: plain text, emoji kept, missing and unknown fields reported', () => {
  const r = renderTemplate('👑 {{NAME}} <b>{{IG}}</b>\n𝑸 {{DATE}} {{OOPS}}', { NAME: '<img src=x>', IG: '@a', DATE: '' });
  assert.equal(r.text, '👑 <img src=x> <b>@a</b>\n𝑸 {{DATE}} {{OOPS}}');
  assert.deepEqual(r.missing, ['DATE']);
  assert.deepEqual(r.unknown, ['OOPS']);
});

test('migrated copy matches the original promo text exactly', () => {
  const cfg = defaultConfig();
  const out = renderTemplate(cfg.copy.promo.template, { NAME: '幽月', IG: '@yy', DATE: '20 Nov 2026' }).text;
  assert.ok(out.startsWith('🔮《異世界一日限定降臨》🔮\n𝑶𝒏𝒆-𝑫𝒂𝒚'));
  assert.ok(out.includes('📜 降臨日期｜20 Nov 2026\n👑 限定居民｜幽月 @yy'));
  const sh = renderTemplate(cfg.copy.shadow.template, { NAME: 'Kiko', IG: '@k', DATE: '1 Dec 2026' }).text;
  assert.ok(sh.startsWith('～\n🌙✦ 影子精靈出沒中 ✦🌙'));
  assert.ok(sh.includes('🧚 影子精靈｜Kiko @k'));
});

test('static files still go to assets; unknown API is 404', async () => {
  assert.equal(await (await call(req('/index.html'))).text(), 'static');
  assert.equal((await call(req('/api/nope'))).status, 404);
  assert.equal((await call(req('/media/not-an-id'))).status, 404);
});
