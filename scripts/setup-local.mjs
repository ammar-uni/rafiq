import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
const samplePath = fileURLToPath(new URL('../.env.example', import.meta.url));
let settings = readFileSync(existsSync(envPath) ? envPath : samplePath, 'utf8');
for (const field of ['RAFIQ_DATA_KEY', 'RAFIQ_PRIVACY_URL', 'RAFIQ_SUPPORT_URL']) {
  if (!new RegExp('^' + field + '=', 'm').test(settings)) settings += '\n' + field + '=\n';
}
if (/^RAFIQ_DATA_KEY=\s*$/m.test(settings)) {
  settings = settings.replace(/^RAFIQ_DATA_KEY=[ \t]*\r?$/m, 'RAFIQ_DATA_KEY=' + randomBytes(32).toString('hex'));
}
const legacyPath = fileURLToPath(new URL('../data/rafiq.sqlite', import.meta.url));
if (!existsSync(legacyPath)) settings = settings.replace(/^RAFIQ_DATABASE_PATH=data\/rafiq\.sqlite\r?$/m, 'RAFIQ_DATABASE_PATH=data/rafiq.enc');
writeFileSync(envPath, settings, { mode: 0o600 });
console.log('Local settings prepared. Existing credentials were preserved; no secret values were printed.');
console.log('Keep .env private and store any recovery copy separately from encrypted data backups.');
