// End-to-end check against `wrangler dev` (local D1/R2). Usage:
//   node tests/e2e_admin.mjs [chromium|webkit] [baseURL]
// Requires seeded local residents (see docs/phase5-plan.md, 測試).
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { chromium, webkit, devices } = createRequire(import.meta.url)('playwright');
const which = process.argv[2] || 'chromium';
const BASE = process.argv[3] || 'http://127.0.0.1:8787';
const PASSWORD = process.env.QG_ADMIN_PASSWORD || 'local-dev-pass';

function png(w, h) {
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td) >>> 0); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const rows = []; for (let y = 0; y < h; y++) { const r = Buffer.alloc(1 + w * 3); for (let x = 0; x < w; x++) { r[1 + x * 3] = 200; r[2 + x * 3] = (y * 255 / h) | 0; r[3 + x * 3] = 120; } rows.push(r); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ih), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

const dir = mkdtempSync(join(tmpdir(), 'qg-e2e-'));
const photo = join(dir, 'resident.png'); writeFileSync(photo, png(600, 800));
const browserType = which === 'webkit' ? webkit : chromium;
const browser = await browserType.launch();
const context = await browser.newContext({ ...devices['iPhone 13'], ...(which === 'chromium' ? { isMobile: false, hasTouch: true } : {}) });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) errors.push(m.text()); });
page.on('dialog', d => d.accept(d.type() === 'prompt' ? 'E2E 測試發佈' : undefined));
const step = s => console.log(`[${which}] ${s}`);

// ---------- admin ----------
step('admin login');
await page.goto(BASE + '/admin/');
await page.fill('#pw', 'wrong');
await page.click('#loginForm button');
await page.waitForSelector('#loginMsg.err');
await page.fill('#pw', PASSWORD);
await page.fill('#actor', 'E2E');
await page.click('#loginForm button');
await page.waitForSelector('#app:not([hidden]) .res');
assert.equal(await page.locator('.res').count(), 2);

step('upload resident photo');
await page.locator('.res', { hasText: '幽月' }).getByRole('button', { name: '照片' }).click();
await page.setInputFiles('#modalBody input[type=file]', photo);
await page.click('#modalBody .btn.primary');
await page.waitForSelector('#modalBody .msg.ok');
await page.click('#modalClose');
await page.waitForSelector('.res:has-text("幽月") img');

step('change category');
await page.locator('.res', { hasText: '幽月' }).locator('select').selectOption('shadow');
await page.waitForSelector('#barMsg.ok');

step('page preset draft → not public');
await page.click('.nav button[data-v=pages]');
await page.locator('#v-pages select').first().selectOption('yujis');
await page.click('#saveDraft');
await page.waitForSelector('#barMsg.ok');
let pub = await (await page.request.get(BASE + '/api/public/config')).json();
assert.notEqual(pub.config.pages.promo.text.name?.font, 'yujis', 'draft must not be public');

step('edit copy template and publish');
await page.click('.nav button[data-v=copy]');
await page.fill('#v-copy textarea', '🔮 {{NAME}} {{IG}}\n✦ {{DATE}}｜{{CATEGORY}}\n𝑸𝒖𝒆𝒆𝒏’𝒔 𝑮𝒂𝒓𝒅𝒆𝒏');
assert.match(await page.textContent('#v-copy .copy-out'), /🔮 幽月 @yuzuki_qg/);
await page.click('#publish');
await page.waitForFunction(() => /已發佈/.test(document.querySelector('#barMsg').textContent));
pub = await (await page.request.get(BASE + '/api/public/config')).json();
assert.equal(pub.config.pages.promo.text.name.font, 'yujis');
assert.match(pub.config.copy.promo.template, /^🔮 \{\{NAME\}\}/);

// ---------- public maker ----------
step('public promo: pick resident');
const pub2 = await context.newPage();
pub2.on('pageerror', e => errors.push(e.message));
pub2.on('dialog', d => d.accept());
await pub2.goto(BASE + '/');
await pub2.waitForFunction(() => window.qgPresets && window.qgPromoView);
await pub2.waitForFunction(() => window.qgPromoView.state.font.name === 'yujis', null, { timeout: 8000 });
await pub2.click('#tab-promo .qgp-pick');
await pub2.locator('.qgp-item', { hasText: '幽月' }).click();
await pub2.waitForFunction(() => !!window.qgPromoView.state.photo, null, { timeout: 8000 });
assert.equal(await pub2.inputValue('#name'), '幽月');
assert.equal(await pub2.inputValue('#ig'), '@yuzuki_qg');
assert.equal(await pub2.inputValue('#tab-promo .qgp-cat'), 'shadow');
await pub2.selectOption('#tab-promo .qgp-cat', 'limited');

step('manual edit is not overwritten by background roster refresh');
await pub2.fill('#name', '幽月（今次）');
await pub2.evaluate(() => window.qgPresets.loadRoster(true));
assert.equal(await pub2.inputValue('#name'), '幽月（今次）');

step('download PNG → templated copy');
await pub2.fill('#date', '2026-11-20');
await pub2.dispatchEvent('#date', 'change');
const dl = pub2.waitForEvent('download', { timeout: 15000 }).catch(() => null);
await pub2.click('#png');
await pub2.waitForSelector('#promo:not([hidden])', { timeout: 15000 });
await dl;
const text = await pub2.textContent('#promoText');
assert.equal(text, '🔮 幽月（今次） @yuzuki_qg\n✦ 20 Nov 2026｜限定\n𝑸𝒖𝒆𝒆𝒏’𝒔 𝑮𝒂𝒓𝒅𝒆𝒏');
await pub2.click('#promoClose');
assert.match(await pub2.textContent('#qg-last-caption-promo .qg-caption-body'), /幽月（今次）/);
const def = await (await pub2.request.get(BASE + '/api/public/residents')).json();
assert.equal(def.residents.find(r => r.name === '幽月').category, 'shadow', 'temporary category does not change the default');

step('shadow + weekly pickers present');
await pub2.click('#tabBtnShadow');
assert.equal(await pub2.locator('#tab-shadow .qgp-pick').count(), 1);
await pub2.click('#tabBtnWeekly');
assert.equal(await pub2.locator('#tab-weekly .qgp-pick').count(), 1);

step('daily: per-resident picker');
await pub2.click('#tabBtnDaily');
await pub2.waitForSelector('#dyList .qgp-dy');
await pub2.locator('#dyList .qgp-dy').first().click();
await pub2.locator('.qgp-item', { hasText: '小豆' }).click();
await pub2.waitForFunction(() => window.qgDaily.state.res[0].name === '小豆');
assert.equal(await pub2.evaluate(() => window.qgDaily.state.res[0].cat), 'limited');
await pub2.locator('#dyList .qgp-dy').nth(1).click();
await pub2.locator('.qgp-item', { hasText: '幽月' }).click();
await pub2.waitForFunction(() => !!window.qgDaily.state.res[1].photo, null, { timeout: 8000 });

step('admin: restore version 1');
await page.click('.nav button[data-v=versions]');
await page.locator('.ver', { has: page.locator('b', { hasText: /^v1$/ }) }).getByRole('button', { name: '還原' }).click();
await page.waitForFunction(() => /已還原/.test(document.querySelector('#barMsg').textContent));
pub = await (await page.request.get(BASE + '/api/public/config')).json();
assert.equal(pub.config.pages.promo.text.name?.font, undefined);

step('admin: replace a daily asset + enable daily copy, publish');
const bow = join(dir, 'bow.png'); writeFileSync(bow, png(120, 90));
await page.click('.nav button[data-v=assets]');
const slot = page.locator('.slot', { hasText: 'daily/bow.webp' });
await slot.locator('input[type=file]').setInputFiles(bow);
await page.waitForSelector('.slot.changed:has-text("daily/bow.webp")');
await page.click('.nav button[data-v=copy]');
await page.locator('#v-copy .chips').first().getByRole('button', { name: /每日更表/ }).click();
await page.locator('#v-copy input[type=checkbox]').check();
await page.click('#publish');
await page.waitForFunction(() => /已發佈/.test(document.querySelector('#barMsg').textContent));
pub = await (await page.request.get(BASE + '/api/public/config')).json();
assert.match(pub.config.assets['daily/bow.webp'], /^[0-9A-Z]{26}$/);

step('public daily uses replacement asset and shows copy with resident list');
const pub3 = await context.newPage();
pub3.on('pageerror', e => errors.push(e.message));
const media = [];
pub3.on('request', r => { if (r.url().includes('/media/')) media.push(r.url()); });
await pub3.goto(BASE + '/#daily');
await pub3.waitForFunction(() => window.qgDaily && document.querySelectorAll('#dyList .qgp-dy').length >= 2);
await pub3.waitForFunction(id => performance.getEntriesByType('resource').some(e => e.name.includes('/media/' + id)), pub.config.assets['daily/bow.webp'], { timeout: 8000 });
await pub3.locator('#dyList .qgp-dy').first().click();
await pub3.locator('.qgp-item', { hasText: '小豆' }).click();
await pub3.waitForFunction(() => window.qgDaily.state.res[0].name === '小豆');
await pub3.locator('#dyList .dy-res[data-i="1"] input[type=file]').setInputFiles(photo);
await pub3.waitForFunction(() => !!window.qgDaily.state.res[1].photo);
await pub3.locator('#dyList .dy-res[data-i="1"] input[type=text]').fill('雪織');
// 小豆 has no default photo: upload one for this poster only (does not touch the site default)
await pub3.locator('#dyList .dy-res[data-i="0"] input[type=file]').setInputFiles(photo);
await pub3.waitForFunction(() => !!window.qgDaily.state.res[0].photo);
await pub3.fill('#dyDate', '2026-11-19'); await pub3.dispatchEvent('#dyDate', 'change');
await Promise.all([pub3.waitForEvent('download', { timeout: 20000 }).catch(() => null), pub3.click('#dyPng')]);
await pub3.waitForSelector('#promo:not([hidden])', { timeout: 15000 });
const dtext = await pub3.textContent('#promoText');
assert.match(dtext, /19 Nov 2026/);
assert.match(dtext, /【限定】小豆 @rinnkaunn\n雪織/);
assert.match(dtext, /6:00pm ─ 10:00pm/);

assert.deepEqual(errors, [], 'no page errors');
step('PASS');
await browser.close();
