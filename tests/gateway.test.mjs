import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forward, targetPath, TARGET } from '../worker/gateway.js';

test('paths map to /card on the shift system', () => {
  assert.equal(targetPath('/'), '/card/');
  assert.equal(targetPath('/daily/bg.jpg'), '/card/daily/bg.jpg');
  assert.equal(targetPath('/card/api/public/config'), '/card/api/public/config');
  assert.equal(targetPath('/api/public/residents'), '/card/api/public/residents');
});

test('forwards GET without cookies and keeps the old origin on redirects', async () => {
  const req = new Request('https://old.test/ui/presets.js?x=1', { headers: { cookie: 'qg_admin=secret', accept: '*/*' } });
  const res = await forward(req, async up => {
    assert.equal(up.url, TARGET + '/card/ui/presets.js?x=1');
    assert.equal(up.headers.get('cookie'), null);
    assert.equal(up.redirect, 'manual');
    return new Response(null, { status: 301, headers: { location: '/card/daily/', 'set-cookie': 'x=1' } });
  });
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), '/card/daily/');
  assert.equal(res.headers.get('set-cookie'), null);
  assert.equal(res.headers.get('x-qg-backend'), 'qg-shift-system');
});

test('admin goes to the new site; writes are refused', async () => {
  const never = () => { throw new Error('must not fetch'); };
  for (const p of ['/admin/', '/admin', '/card/admin/', '/card/admin']) {
    const r = await forward(new Request('https://old.test' + p), never);
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), TARGET + '/card/admin/');
  }
  const post = await forward(new Request('https://old.test/api/admin/login', { method: 'POST', body: '{}' }), never);
  assert.equal(post.status, 405);
});
