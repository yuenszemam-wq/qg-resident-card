import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { forward } from '../worker/legacy-gateway.js';
import { makeD1 } from './helpers.mjs';

test('handoff rejects all admin access before bindings and cached roster does not write', async () => {
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    const r = await worker.fetch(new Request('https://old.test/api/admin/residents', { method }), { MIGRATION_READ_ONLY: 'true' }, {});
    assert.equal(r.status, 503);
  }
  const db = makeD1();
  const readonly = { prepare(sql) {
    assert.match(sql.trim(), /^SELECT/i);
    return db.prepare(sql);
  }};
  const r = await worker.fetch(new Request('https://old.test/api/public/residents?refresh=1'), { MIGRATION_READ_ONLY: 'true', DB: readonly }, {});
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).residents, []);
  db.raw.close();
});

test('gateway preserves body, cookies and same-origin CSRF without following redirects', async () => {
  const req = new Request('https://old.test/api/admin/login?test=1', { method: 'POST', headers: { origin: 'https://old.test', cookie: 'qg_admin=test', 'x-qg-migration-key': 'untrusted' }, body: 'payload' });
  const r = await forward(req, { GATEWAY_ENABLED: 'true', MIGRATION_ACCESS_KEY: 'private' }, async upstream => {
    assert.equal(upstream.url, 'https://qg-resident-card-prod.queenxsgarden.workers.dev/api/admin/login?test=1');
    assert.equal(upstream.headers.get('origin'), 'https://qg-resident-card-prod.queenxsgarden.workers.dev');
    assert.equal(upstream.headers.get('cookie'), 'qg_admin=test');
    assert.equal(upstream.headers.get('x-qg-migration-key'), 'private');
    assert.equal(upstream.redirect, 'manual');
    assert.equal(await upstream.text(), 'payload');
    return new Response(null, { status: 302, headers: { location: 'https://qg-resident-card-prod.queenxsgarden.workers.dev/admin/', 'set-cookie': 'qg_admin=new; Path=/api/admin; Secure; HttpOnly' } });
  });
  assert.equal(r.headers.get('location'), 'https://old.test/admin/');
  assert.match(r.headers.get('set-cookie'), /HttpOnly/);
});

test('gateway fails closed and does not bless cross-origin requests', async () => {
  const fail = () => { throw Error('must not fetch'); };
  assert.equal((await forward(new Request('https://old.test/'), {}, fail)).status, 503);
  assert.equal((await forward(new Request('https://old.test/api/admin/login', { headers: { origin: 'https://qg-resident-card-prod.queenxsgarden.workers.dev' } }), { GATEWAY_ENABLED: 'true' }, fail)).status, 403);
  await forward(new Request('https://old.test/api/admin/login', { headers: { origin: 'https://evil.test', 'x-qg-migration-key': 'injected' } }), { GATEWAY_ENABLED: 'true' }, async req => {
    assert.equal(req.headers.get('origin'), 'https://evil.test');
    assert.equal(req.headers.get('x-qg-migration-key'), null);
    return new Response('denied', { status: 403 });
  });
});
