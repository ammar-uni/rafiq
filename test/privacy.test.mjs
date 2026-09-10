import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Store, DAY } from '../src/store.mjs';
import { readConfig } from '../src/config.mjs';
import { RafiqApp } from '../src/app.mjs';
import { SerialQueue } from '../src/serial.mjs';

function storage(t) {
  const folder = mkdtempSync(join(tmpdir(), 'rafiq-private-'));
  const filename = join(folder, 'data.enc');
  const options = { encryptionKey: randomBytes(32).toString('hex') };
  const opened = [];
  const open = () => { const store = new Store(filename, options); opened.push(store); return store; };
  t.after(() => {
    for (const store of opened) store.close();
    for (const file of readdirSync(folder)) rmSync(join(folder, file));
    rmdirSync(folder);
  });
  return { filename, folder, options, open };
}

test('all user and server data is encrypted on disk; the coordination file is empty', t => {
  const h = storage(t); const store = h.open();
  const userId = '123456789012345678';
  store.subscribe(userId, '234567890123456789');
  store.toggleFavorite(userId, 'hawqala');
  store.setPanel('234567890123456789', '345678901234567890', '456789012345678901');
  store.close();
  const bytes = readFileSync(h.filename);
  for (const value of [userId, '234567890123456789', '345678901234567890', '456789012345678901', 'hawqala', 'SQLite format', h.options.encryptionKey]) {
    assert.equal(bytes.includes(Buffer.from(value)), false);
  }
  assert.deepEqual(readdirSync(h.folder), ['data.enc', 'data.enc.guard']);
  assert.equal(readFileSync(h.filename + '.guard').length, 0);
  assert.deepEqual({ ...h.open().getPanel('234567890123456789') }, { channel_id: '345678901234567890', message_id: '456789012345678901' });
});

test('wrong keys and tampering fail closed without replacing stored data', t => {
  const h = storage(t); const store = h.open();
  store.subscribe('1', '10'); store.close();
  const original = readFileSync(h.filename);
  assert.throws(() => new Store(h.filename, { encryptionKey: randomBytes(32).toString('hex') }), /Cannot decrypt/);
  assert.deepEqual(readFileSync(h.filename), original);
  const changed = Buffer.from(original); changed[changed.length - 1] ^= 1;
  writeFileSync(h.filename, changed);
  assert.throws(() => h.open(), /Cannot decrypt/);
  assert.deepEqual(readFileSync(h.filename), changed);
});

test('a second process cannot open the same storage file; persistent storage requires a key', t => {
  const h = storage(t); h.open();
  assert.throws(() => h.open(), /Cannot lock/);
  assert.throws(() => new Store(join(h.folder, 'unprotected.enc')), /RAFIQ_DATA_KEY/);
});

test('legacy plaintext databases are rejected without modifying or replacing them', t => {
  const h = storage(t);
  const original = Buffer.from('SQLite format 3\0' + 'private data'.repeat(5));
  writeFileSync(h.filename, original);
  assert.throws(() => h.open(), /not a supported encrypted/);
  assert.deepEqual(readFileSync(h.filename), original);
});

test('failed persistence rolls back changes and cannot reserve a send only in memory', t => {
  const h = storage(t); const store = h.open();
  store.subscribe('1', '10');
  const original = readFileSync(h.filename);
  const write = store.snapshot.write;
  store.snapshot.write = () => { throw new Error('disk unavailable'); };
  assert.throws(() => store.claimReminder('1', '10', 1800000000000), /disk unavailable/);
  assert.throws(() => store.updateUser('1', { enabled: false }), /disk unavailable/);
  assert.equal(store.getUser('1').enabled, true);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM reminder_attempts').get().n, 0);
  assert.deepEqual(readFileSync(h.filename), original);
  store.snapshot.write = write;
  assert.ok(store.claimReminder('1', '10', 1800000000000));
});

test('deletion and retention cleanup persist across restart', t => {
  const h = storage(t); let store = h.open();
  store.subscribe('1', '10'); store.toggleFavorite('1', 'guidance');
  store.claimReminder('1', '10', 1800000000000);
  store.prune(1800000000000 + 2 * DAY); store.close(); store = h.open();
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM reminder_attempts').get().n, 0);
  store.forget('1'); store.close(); store = h.open();
  for (const table of ['users', 'subscriptions', 'favorites', 'reminder_attempts']) {
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM ' + table).get().n, 0);
  }
});

test('v1 snapshots preserve old dhikr plus new idea bookmarks and delete both on request', t => {
  const h = storage(t); let store = h.open();
  store.subscribe('1', '10'); store.subscribe('1', '20'); store.toggleFavorite('1', 'guidance');
  store.close(); store = h.open();
  store.toggleIdeaFavorite('1', 'parents'); store.unsubscribe('1', '10');
  store.close(); store = h.open();
  assert.deepEqual(store.favorites('1'), ['guidance']);
  assert.deepEqual(store.savedIdeas('1'), ['parents']);
  assert.deepEqual(store.subscriptions('1'), ['20']);
  assert.equal(readFileSync(h.filename).includes(Buffer.from('idea:parents')), false);
  const original = readFileSync(h.filename);
  const write = store.snapshot.write;
  store.snapshot.write = () => { throw new Error('disk unavailable'); };
  assert.throws(() => store.toggleIdeaFavorite('1', 'parents'), /disk unavailable/);
  assert.throws(() => store.unsubscribe('1', '20'), /disk unavailable/);
  assert.deepEqual(store.savedIdeas('1'), ['parents']);
  assert.deepEqual(store.subscriptions('1'), ['20']);
  assert.deepEqual(readFileSync(h.filename), original);
  store.snapshot.write = write;
  store.forget('1'); store.close(); store = h.open();
  assert.deepEqual(store.bookmarks('1'), []);
});

test('live runtime requires a key and real policy/support links while invite generation does not', () => {
  const env = { DISCORD_APPLICATION_ID: '123456789012345678', DISCORD_TOKEN: 'private-test-token' };
  assert.doesNotThrow(() => readConfig(env));
  assert.throws(() => readConfig(env, { requireRuntime: true }), error => error.message.includes('RAFIQ_DATA_KEY') && error.message.includes('RAFIQ_PRIVACY_URL') && error.message.includes('RAFIQ_SUPPORT_URL') && !error.message.includes(env.DISCORD_TOKEN));
  const complete = { ...env, RAFIQ_DATA_KEY: randomBytes(32).toString('hex'), RAFIQ_PRIVACY_URL: 'https://rafiq.test/privacy', RAFIQ_SUPPORT_URL: 'https://rafiq.test/support' };
  assert.doesNotThrow(() => readConfig(complete, { requireRuntime: true }));
  for (const url of ['http://rafiq.test/privacy', 'https://example.com/privacy', 'https://localhost/privacy', 'https://name:password@rafiq.test/privacy']) {
    assert.throws(() => readConfig({ ...complete, RAFIQ_PRIVACY_URL: url }, { requireRuntime: true }), /RAFIQ_PRIVACY_URL/);
  }
});

test('startup reconciliation removes only servers that no longer contain the bot', t => {
  const h = storage(t); let store = h.open();
  store.subscribe('1', '10'); store.subscribe('1', '20');
  store.setPanel('10', '100', '1000'); store.setPanel('20', '200', '2000');
  store.reconcileGuilds(['20']); store.close(); store = h.open();
  assert.equal(store.isSubscribed('1', '10'), false);
  assert.equal(store.getPanel('10'), undefined);
  assert.equal(store.isSubscribed('1', '20'), true);
  assert.equal(store.getPanel('20').message_id, '2000');
});

test('privacy and issue reporting are available without creating a user record or sending a message', async t => {
  const store = new Store(':memory:'); t.after(() => store.close());
  const app = new RafiqApp({ store, queue: new SerialQueue(), sendDM: () => assert.fail('no unsolicited contact'), privacyURL: 'https://rafiq.test/privacy', supportURL: 'https://rafiq.test/support' });
  const privacy = await app.handle({ userId: '1', action: 'privacy' });
  const support = await app.handle({ userId: '1', action: 'support' });
  assert.ok(JSON.stringify(privacy).includes('https://rafiq.test/privacy'));
  assert.ok(JSON.stringify(support).includes('https://rafiq.test/support'));
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
});
