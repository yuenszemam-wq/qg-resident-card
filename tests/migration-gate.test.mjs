import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

test('migration gate denies assets, APIs and media before touching any binding', async () => {
  for (const path of ['/', '/admin/', '/api/public/residents', '/media/01M7T0K5Y3KPGFQBZMZEQF5Y5B']) {
    for (const key of ['', 'wrong']) {
      const response = await worker.fetch(new Request('https://candidate.test' + path, { headers: { 'x-qg-migration-key': key } }), { MIGRATION_LOCKED: 'true', MIGRATION_ACCESS_KEY: 'test-key' }, {});
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
  }
  const missingSecret = await worker.fetch(new Request('https://candidate.test/', { headers: { 'x-qg-migration-key': 'test-key' } }), { MIGRATION_LOCKED: 'true' }, {});
  assert.equal(missingSecret.status, 503);
  const permitted = await worker.fetch(new Request('https://candidate.test/', { headers: { 'x-qg-migration-key': 'test-key' } }), { MIGRATION_LOCKED: 'true', MIGRATION_ACCESS_KEY: 'test-key', ASSETS: { fetch: () => new Response('verified') } }, {});
  assert.equal(await permitted.text(), 'verified');
});
