// Restore a trusted D1 SQL export into a NEW local directory, never a live DB.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const hash = value => createHash('sha256').update(value).digest('hex');
const quote = name => '"' + name.replaceAll('"', '""') + '"';
const encode = value => JSON.stringify(value, (_, v) =>
  typeof v === 'bigint' ? { integer: String(v) } :
    v instanceof Uint8Array ? { blob: Buffer.from(v).toString('base64') } : v);

export function verifyBackup(sqlPath, outputDirectory) {
  const sql = readFileSync(sqlPath);
  // EEXIST deliberately aborts: a restore check must never overwrite data.
  mkdirSync(outputDirectory, { recursive: false, mode: 0o700 });
  const db = new DatabaseSync(join(outputDirectory, 'restored.sqlite'));
  try {
    db.exec(sql.toString('utf8'));
    const integrity = db.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') throw new Error('SQLite integrity check failed');
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Foreign key check failed');
    const tables = {};
    for (const { name, sql: schema } of db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) {
      const query = db.prepare(`SELECT * FROM ${quote(name)}`);
      query.setReadBigInts(true);
      const rows = query.all().map(row => encode(Object.fromEntries(Object.keys(row).sort().map(k => [k, row[k]])))).sort();
      tables[name] = { rows: rows.length, schemaSha256: hash(schema || ''), contentSha256: hash(rows.join('\n')) };
    }
    const manifest = { format: 1, sqlSha256: hash(sql), sqlBytes: sql.length, integrity: 'ok', foreignKeys: 'ok', tables };
    writeFileSync(join(outputDirectory, 'verification.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return manifest;
  } finally { db.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: node scripts/verify-d1-backup.mjs <trusted-export.sql> <new-private-directory>');
  console.log(JSON.stringify(verifyBackup(resolve(input), resolve(output)), null, 2));
}
