import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];
if (!['development', 'production'].includes(target)) throw new Error('Choose development or production explicitly');
const config = JSON.parse(readFileSync(resolve(root, 'wrangler.production.jsonc'), 'utf8'));
if (target === 'development') {
  const id = process.env.QG_DEVELOPMENT_D1_ID || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id) ||
      [config.d1_databases[0].database_id, 'e6156c2f-ec9f-4142-8ca4-a79147deebe3'].includes(id)) {
    throw new Error('QG_DEVELOPMENT_D1_ID must identify a verified, separate development database; the original production DB is forbidden');
  }
  config.name = 'qg-resident-card-dev';
  config.account_id = '978af1b48255f53f5bad01111775f5e8';
  config.d1_databases = [{ binding: 'DB', database_name: 'qg-resident-card-dev-db', database_id: id, migrations_dir: 'migrations' }];
  config.r2_buckets = [{ binding: 'MEDIA', bucket_name: 'qg-resident-card-dev-media' }];
  config.vars = { SHEET_ID: process.env.QG_TEST_SHEET_ID || '', DRIVE_FOLDER_ID: process.env.QG_TEST_DRIVE_FOLDER_ID || '' };
  config.assets.run_worker_first = ['/api/*', '/media/*'];
  config.keep_vars = false;
}
if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_ACCOUNT_ID !== config.account_id) {
  throw new Error('CLOUDFLARE_ACCOUNT_ID conflicts with the selected environment');
}
config.main = resolve(root, config.main);
config.assets.directory = root;
config.$schema = resolve(root, config.$schema);
for (const binding of config.d1_databases) binding.migrations_dir = resolve(root, binding.migrations_dir);
mkdirSync(resolve(root, '.deployment'), { recursive: true });
writeFileSync(resolve(root, '.deployment', `${target}.json`), JSON.stringify(config, null, 2) + '\n');
console.log(`Prepared ${target}: ${config.name} in account ${config.account_id}`);
