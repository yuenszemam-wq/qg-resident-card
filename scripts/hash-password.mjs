// Usage: node scripts/hash-password.mjs   (prompts; nothing is written to disk)
// Prints the value for the ADMIN_PASSWORD_HASH Cloudflare secret.
import { createInterface } from 'node:readline';
import { hashPassword } from '../worker/lib/auth.js';

const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
rl.stdoutMuted = true;
rl._writeToOutput = s => { if (!rl.stdoutMuted) process.stderr.write(s); };
process.stderr.write('管理密碼：');
rl.question('', async pw => {
  rl.close();
  process.stderr.write('\n');
  if (!pw) { console.error('未輸入密碼'); process.exit(1); }
  console.log(await hashPassword(pw));
});
