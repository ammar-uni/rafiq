// Mounted into /app by CI; never included in the production image.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Store } from './src/store.mjs';
import { assertReviewedContent } from './src/content-review.mjs';

assert.notEqual(process.getuid(), 0);
for (const path of ['.env', '.git', 'output', 'test', 'data']) assert.equal(existsSync('/app/' + path), false);
assert.ok(existsSync('/app/assets/rafiq-banner-v2.webp'));
assertReviewedContent();
const filename = '/data/ci.enc';
const store = new Store(filename, { encryptionKey: 'ab'.repeat(32) }); // Synthetic test key.
try {
  if (process.argv[2] === 'seed') store.subscribe('123456789012345678', '234567890123456789');
  else assert.equal(store.isSubscribed('123456789012345678', '234567890123456789'), true);
} finally { store.close(); }
assert.equal(readFileSync(filename).includes(Buffer.from('123456789012345678')), false);
assert.equal(readFileSync(filename + '.guard').length, 0);
console.log('Image runs without root or credentials and preserves encrypted state.');
