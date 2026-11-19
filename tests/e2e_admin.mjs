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

step('archive a resident (hidden from public, restorable)');
await page.locator('.res', { hasText: '小豆' }).getByRole('button', { name: '刪除' }).click();
await page.waitForSelector('details.arch .res:has-text("小豆")', { state: 'attached' });
assert.equal(await page.locator('#v-residents > .card .res-list').first().locator('.res').count(), 1);
let roster = await (await page.request.get(BASE + '/api/public/residents')).json();
assert.ok(!roster.residents.some(r => r.name === '小豆'), 'archived resident hidden from public');
await page.locator('details.arch summary').click();
await page.locator('details.arch .res', { hasText: '小豆' }).getByRole('button', { name: '還原' }).click();
await page.waitForFunction(() => document.querySelectorAll('#v-residents .res:not(.archived)').length === 2);
roster = await (await page.request.get(BASE + '/api/public/residents')).json();
assert.ok(roster.residents.some(r => r.name === '小豆'));

step('change category');
await page.locator('.res', { hasText: '幽月' }).locator('select').selectOption('shadow');
await page.waitForSelector('#barMsg.ok');

step('page preset draft → not public');
await page.click('.nav button[data-v=pages]');
await page.locator('#v-pages select').first().selectOption('yujis');

step('live preview follows admin changes and syncs edits back');
const lf = page.frameLocator('#v-pages iframe.live-frame');
const lfr = () => page.frames().find(f => f.url().includes('qgPreview=live'));
await page.waitForFunction(() => {
  const f = document.querySelector('#v-pages iframe.live-frame');
  return f && f.contentWindow.qgCards?.promo?.text?.font('name') === 'yujis';
}, null, { timeout: 15000 });
assert.equal(await lf.locator('nav.tabs').isVisible(), false, 'maker tabs hidden in live preview');
// 預覽只顯示成品圖：文字微調編輯器已打開，但標題列及控制區隱藏；示範名字已填入
await lf.locator('#promoEd canvas').waitFor({ state: 'visible', timeout: 10000 });
assert.equal(await lf.locator('#promoEd .ed-ctrl').isVisible(), false, 'editor controls hidden in live preview');
assert.equal(await lf.locator('#png').isVisible(), false, 'download buttons hidden in live preview');
assert.ok(await lfr().evaluate(() => document.getElementById('name').value.length > 0), 'sample name filled');
// 在預覽中修改文字大小 → 後台數值同步
await lfr().evaluate(() => { const T = window.qgCards.promo.text; T.set('name', 'size', 12); });
await page.waitForFunction(() => document.querySelector('#v-pages .tw-row output').textContent === '12', null, { timeout: 5000 });
// 後台改數值（文字微調版面：滑桿及 −／＋）→ 預覽即時更新
const num = page.locator('#v-pages .tw-row input[type=range]').first();
await num.fill('-5');
await page.waitForFunction(() => document.querySelector('#v-pages iframe.live-frame').contentWindow.qgCards.promo.text.get('name', 'size') === -5);
await page.locator('#v-pages .tw-row').first().getByRole('button', { name: '大小增加' }).click();
await page.waitForFunction(() => document.querySelector('#v-pages iframe.live-frame').contentWindow.qgCards.promo.text.get('name', 'size') === -4);
await num.fill('0');
// IG 分頁
await page.locator('#v-pages .tw-seg').getByRole('tab', { name: 'IG' }).click();
await page.waitForSelector('#v-pages .tw-seg button.on:has-text("IG")');
await page.waitForFunction(() => document.querySelector('#v-pages iframe.live-frame').contentDocument.querySelector('#promoEd [data-pane=text] .seg button.on')?.dataset.k === 'ig', null, { timeout: 5000 });
await page.click('#saveDraft');
await page.waitForSelector('#barMsg.ok');
let pub = await (await page.request.get(BASE + '/api/public/config')).json();
assert.notEqual(pub.config.pages.promo.text.name?.font, 'yujis', 'draft must not be public');

step('calendar: custom title, holiday colour, template text in live preview');
await page.locator('#v-pages .page-seg').getByRole('tab', { name: 'QG 月曆' }).click();
await page.waitForFunction(() => document.querySelector('#v-pages iframe.live-frame')?.contentWindow?.qgCalendar, null, { timeout: 15000 });
await page.waitForSelector('#v-pages .hol', { timeout: 8000 });
await page.fill('#v-pages .tw-panel input[type=text]', '{{YEAR}}年{{M}}月');
await page.locator('#v-pages .cal-line', { hasText: '開放時間備註' }).locator('textarea').fill('（部份日子為特別開放時間，詳情請留意公告）');
await page.waitForFunction(() => document.querySelector('#v-pages iframe.live-frame').contentWindow.qgPresets.config.pages.calendar.cal?.lines?.hoursNote);
await page.waitForTimeout(500);
const holColor = await lfr().evaluate(() => {
  document.getElementById('cal-year').value = '2026'; document.getElementById('cal-month').value = '12';
  window.qgCalendar.refresh();
  return document.getElementById('cal-holidays').textContent;
});
assert.match(holColor, /12\/25 聖誕節/);
await page.click('#saveDraft');
await page.waitForSelector('#barMsg.ok');
await page.locator('#v-pages .page-seg').getByRole('tab', { name: '限定宣傳' }).click();

step('edit copy template and publish');
await page.click('.nav button[data-v=copy]');
await page.fill('#v-copy textarea', '🔮 {{NAME}} {{IG}}\n✦ {{DATE}}\n𝑸𝒖𝒆𝒆𝒏’𝒔 𝑮𝒂𝒓𝒅𝒆𝒏');
assert.match(await page.textContent('#v-copy .copy-out'), /🔮 幽月 @yuzuki_qg/);
await page.click('#publish');
await page.waitForFunction(() => /已發佈/.test(document.querySelector('#barMsg').textContent));
pub = await (await page.request.get(BASE + '/api/public/config')).json();
assert.equal(pub.config.pages.promo.text.name.font, 'yujis');
assert.match(pub.config.copy.promo.template, /^🔮 \{\{NAME\}\}/);

// ---------- public maker ----------
step('public promo: no resident picker, manual entry');
const pub2 = await context.newPage();
pub2.on('pageerror', e => errors.push(e.message));
pub2.on('dialog', d => d.accept());
await pub2.goto(BASE + '/');
await pub2.waitForFunction(() => window.qgPresets && window.qgPromoView);
await pub2.waitForFunction(() => window.qgPromoView.state.font.name === 'yujis', null, { timeout: 8000 });
assert.equal(await pub2.locator('.qgp-pick').count(), 0);
await pub2.fill('#name', '幽月');
await pub2.fill('#ig', '@yuzuki_qg');
await pub2.setInputFiles('#photo', photo);
await pub2.waitForFunction(() => !!window.qgPromoView.state.photo, null, { timeout: 8000 });

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
assert.equal(text, '🔮 幽月（今次） @yuzuki_qg\n✦ 20 Nov 2026\n𝑸𝒖𝒆𝒆𝒏’𝒔 𝑮𝒂𝒓𝒅𝒆𝒏');
await pub2.click('#promoClose');
assert.match(await pub2.textContent('#qg-last-caption-promo .qg-caption-body'), /幽月（今次）/);
const def = await (await pub2.request.get(BASE + '/api/public/residents')).json();
assert.equal(def.residents.find(r => r.name === '幽月').category, 'shadow', 'temporary category does not change the default');

step('shadow + weekly have no resident picker');
await pub2.click('#tabBtnShadow');
assert.equal(await pub2.locator('#tab-shadow .qgp-pick').count(), 0);
await pub2.click('#tabBtnWeekly');
assert.equal(await pub2.locator('#tab-weekly .qgp-pick').count(), 0);

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

step('admin: promo originals have thumbnails');
await page.click('.nav button[data-v=assets]');
await page.waitForFunction(() => { const i = [...document.querySelectorAll('.slot')].find(s => s.textContent.includes('promo/crown'))?.querySelector('img'); return i && i.complete && i.naturalWidth === 218; });

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
// 手動輸入名字：文案按名字從名冊配對 IG
await pub3.locator('#dyList .dy-res[data-i="1"] input[type=text]').fill('幽月');
// 小豆 has no default photo: upload one for this poster only (does not touch the site default)
await pub3.locator('#dyList .dy-res[data-i="0"] input[type=file]').setInputFiles(photo);
await pub3.waitForFunction(() => !!window.qgDaily.state.res[0].photo);
await pub3.fill('#dyDate', '2026-11-19'); await pub3.dispatchEvent('#dyDate', 'change');
await Promise.all([pub3.waitForEvent('download', { timeout: 20000 }).catch(() => null), pub3.click('#dyPng')]);
await pub3.waitForSelector('#promo:not([hidden])', { timeout: 15000 });
const dtext = await pub3.textContent('#promoText');
assert.match(dtext, /🗓 19 \/ 11 𝕿𝖍𝖚/);
assert.match(dtext, /⏰ 6:00pm ─ 10:00pm/);
assert.match(dtext, /⚜ 出沒居民\n⚜ 幽月 @yuzuki_qg\n♦️ 限定居民\n♦️ 小豆 @rinnkaunn\n/);
assert.doesNotMatch(dtext, /影子精靈|試煉者/);

assert.deepEqual(errors, [], 'no page errors');
step('PASS');
await browser.close();
