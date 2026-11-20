import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyBackup } from '../scripts/verify-d1-backup.mjs';

test('backup restores exact data, detects corruption, and refuses an existing destination', () => {
  const root = mkdtempSync(join(tmpdir(), 'qg-backup-test-'));
  try {
    const sql = join(root, 'export.sql');
    writeFileSync(sql, "CREATE TABLE residents(id INTEGER PRIMARY KEY, name TEXT); INSERT INTO residents VALUES(1, '測試居民');");
    const out = join(root, 'restore');
    const result = verifyBackup(sql, out);
    assert.equal(result.tables.residents.rows, 1);
    assert.equal(result.integrity, 'ok');
    const before = readFileSync(join(out, 'restored.sqlite'));
    assert.throws(() => verifyBackup(sql, out), { code: 'EEXIST' });
    assert.deepEqual(readFileSync(join(out, 'restored.sqlite')), before);
    writeFileSync(sql, 'THIS IS NOT A DATABASE EXPORT;');
    assert.throws(() => verifyBackup(sql, join(root, 'invalid')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
