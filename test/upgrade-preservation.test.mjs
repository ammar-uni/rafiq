import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { EncryptedSnapshot } from '../src/encrypted-snapshot.mjs';
import { Store, DAY, MINUTE } from '../src/store.mjs';
import { SerialQueue } from '../src/serial.mjs';
import { RafiqApp } from '../src/app.mjs';
import { PrayerApp } from '../src/prayer-app.mjs';
import { ServerApp } from '../src/server-app.mjs';
import { ReminderEngine } from '../src/reminders.mjs';
import { PrayerScheduler } from '../src/prayer-scheduler.mjs';
import { SeasonalScheduler } from '../src/seasonal-scheduler.mjs';
import { ServerScheduler } from '../src/server-scheduler.mjs';
import { DEFAULT_SERVER, serverEvents } from '../src/server-config.mjs';
import { seasonalYearEvents } from '../src/seasonal-times.mjs';

const start = Date.parse('2026-09-25T08:00:00Z');
const token = '0123456789abcdef';

// Synthetic v7 data, defined independently of current defaults and Store writers.
// Every pre-existing table is populated. No production file or key is used.
function v7Fixture() {
  const prayer = {
    city: { label: 'مكة المكرمة، السعودية', latitude: 21.426, longitude: 39.826, timezone: 'Asia/Riyadh' },
    method: 'UmmAlQura', asr: 'Shafi', highLatitude: 'MiddleOfTheNight',
    adjustments: [0, 0, 0, 0, 0], ramadanIsha: false, enabled: true,
    activatedAt: start - 3 * DAY, delivery: 'normal', soundId: null,
    occasions: { fridayPrayer: start - DAY, fridayDua: 0, qada: start - DAY },
    daily: {
      morning: { activatedAt: start - DAY, offsetMinutes: 30 },
      evening: { activatedAt: 0, offsetMinutes: -45 },
      quran: { activatedAt: start - DAY, time: '21:35' }
    }
  };
  return { version: 7, tables: {
    users: [
      ['1', 1, 'daily', 'silent', 0, 0, start + 15 * MINUTE, start - MINUTE, 0],
      ['2', 1, 'session5', 'normal', start + DAY, 0, null, null, start - 2 * DAY],
      ['3', 0, 'session', 'silent', 0, 1, start + 30 * MINUTE, null, 0],
      ['4', 1, 'session', 'normal', 0, 0, null, null, null],
      ['5', 0, 'daily', 'normal', 0, 0, null, null, start - 2 * DAY],
      ['6', 1, 'session5', 'silent', 0, 0, null, start - 4 * MINUTE, start - 2 * DAY]
    ],
    subscriptions: [['1', '10'], ['1', '20'], ['2', '10'], ['3', '10'], ['4', '10'], ['6', '20']],
    favorites: [['1', 'majlis'], ['1', 'idea:parents'], ['2', 'guidance'], ['3', 'idea:calm'], ['6', 'two-words']],
    reminder_attempts: [['1', start - MINUTE], ['2', start - 3 * MINUTE], ['6', start - 4 * MINUTE]],
    guild_panels: [['10', '101', '1001'], ['20', '102', '1002']],
    prayer_settings: [
      ['1', JSON.stringify({ ...prayer, method: 'Egyptian', adjustments: [2, -3, 4, -5, 6], ramadanIsha: true, delivery: 'silent', soundId: 'soft' })],
      ['2', JSON.stringify({ ...prayer, city: { label: 'برلين، ألمانيا', latitude: 52.52, longitude: 13.405, timezone: 'Europe/Berlin' }, method: 'MuslimWorldLeague', highLatitude: 'SeventhOfTheNight', enabled: false })],
      ['3', JSON.stringify({ ...prayer, city: null, enabled: false, activatedAt: 0,
        occasions: { fridayPrayer: 0, fridayDua: 0, qada: 0 },
        daily: { morning: { activatedAt: 0, offsetMinutes: 60 }, evening: { activatedAt: 0, offsetMinutes: -60 }, quran: { activatedAt: 0, time: '04:20' } } })],
      ['4', JSON.stringify({ ...prayer, daily: { ...prayer.daily, morning: { activatedAt: 0, offsetMinutes: -10 } } })],
      ['6', JSON.stringify({ ...prayer, delivery: 'silent', daily: { ...prayer.daily, evening: { activatedAt: start - DAY, offsetMinutes: 0 } } })]
    ],
    prayer_attempts: [['1', '2026-09-25', 'fajr', start - MINUTE], ['2', '2026-09-25', 'morning', start - MINUTE], ['6', '2026-09-25', 'quran', start - MINUTE]],
    seasonal_attempts: [['2', '1448:dhul-hijjah:2', start - DAY], ['6', '1448:arafah:2', start - DAY]]
  } };
}

function persistentV7(t) {
  const dir = mkdtempSync(join(tmpdir(), 'rafiq-upgrade-')), file = join(dir, 'state.enc');
  const encryptionKey = randomBytes(32).toString('hex'), legacy = v7Fixture(), opened = [];
  const snapshot = new EncryptedSnapshot(file, encryptionKey);
  snapshot.write(legacy); snapshot.close();
  t.after(() => { opened.forEach(store => store.close()); readdirSync(dir).forEach(name => rmSync(join(dir, name))); rmdirSync(dir); });
  return { file, legacy, open() { const store = new Store(file, { encryptionKey }); opened.push(store); return store; } };
}

function oldTables(store, legacy) {
  return Object.fromEntries(Object.keys(legacy.tables).map(table => [table,
    store.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => Object.values(row))]));
}

function assertPreserved(store, legacy, label) {
  assert.deepEqual(oldTables(store, legacy), legacy.tables, label);
}

test('v7 upgrade preserves every old table, all user choices and deduplication across failed saves and restarts', t => {
  const h = persistentV7(t), original = readFileSync(h.file);
  let store = h.open();
  assert.deepEqual(readFileSync(h.file), original, 'Opening v7 must not rewrite the file');
  assertPreserved(store, h.legacy, 'Every original row survives loading');
  assert.deepEqual(store.postingGuilds(), []);
  for (const guildId of ['10', '20']) assert.equal(store.getServer(guildId).enabled, false);
  store.reconcileGuilds(['10', '20']);
  assertPreserved(store, h.legacy, 'Normal startup does not change members of retained servers');

  const write = store.snapshot.write;
  store.snapshot.write = () => { throw new Error('Synthetic disk failure'); };
  try {
    assert.throws(() => store.setServer('10', { ...structuredClone(DEFAULT_SERVER), channelId: '101' }), /disk failure/);
  } finally { store.snapshot.write = write; }
  assert.deepEqual(readFileSync(h.file), original, 'Failed first v8 save leaves the encrypted v7 file intact');
  assert.deepEqual(store.postingGuilds(), []);
  assertPreserved(store, h.legacy, 'Failed migration write also rolls back memory');

  store.persist();
  const migrated = store.snapshot.read();
  assert.equal(migrated.version, 8);
  for (const [table, rows] of Object.entries(h.legacy.tables)) assert.deepEqual(migrated.tables[table], rows, table);
  assert.deepEqual(migrated.tables.server_settings, []);
  assert.deepEqual(migrated.tables.server_attempts, []);
  store.close(); store = h.open();
  assertPreserved(store, h.legacy, 'Restart after migration preserves every row');

  // Previously attempted notifications stay reserved, even after an upgrade.
  assert.equal(store.claimReminder('1', '10', start), null);
  assert.equal(store.claimPrayer('1', store.getPrayer('1'), { key: 'fajr', day: '2026-09-25', at: start }, start), null);
  assert.equal(store.claimSeasonal('6', { id: '1448:arafah:2', at: start }, start), null);
  assertPreserved(store, h.legacy, 'Upgrade never resets private notification budgets');
});

test('server setup, all mention choices, sending, failures and pause never write existing personal settings', async t => {
  const h = persistentV7(t); let store = h.open(), now = start;
  const queue = new SerialQueue();
  const server = new ServerApp({ store, now: () => now, token: () => token, checkTarget: async () => null });
  const act = (action, values = []) => queue.run('guild:10', () => server.handle({ guildId: '10', userId: '9', canManage: true,
    action: action.startsWith('server_') ? action : `server_${token}_${action}`, values }));
  for (const [action, values] of [
    ['server_guide'], ['server_home'], ['server_begin'], ['channel', ['101']], ['count', ['3']],
    ['schedule'], ['time_save', ['09:00', '15:00', '20:00']], ['zone', ['Europe/Berlin']],
    ['mention'], ['everyone'], ['role', ['201']], ['no_role'], ['everyone'], ['review'], ['save']
  ]) {
    await act(action, values);
    assertPreserved(store, h.legacy, `Personal data changed at ${action}`);
  }
  assert.equal(store.getServer('10').enabled, true);
  assert.equal(store.getServer('20').enabled, false);
  assert.equal(store.db.prepare("SELECT count(*) AS n FROM users WHERE user_id = '9'").get().n, 0, 'Admin setup does not enroll anyone in private reminders');

  const personal = new RafiqApp({ store, queue, now: () => now,
    prayers: new PrayerApp({ store, now: () => now, sendDM: async () => assert.fail('No DM requested') }),
    sendDM: async () => assert.fail('No DM requested') });
  for (const [userId] of h.legacy.tables.users) {
    for (const action of ['home', 'server_guide', 'reminders', 'settings', 'prayer', 'daily', 'seasonal', 'favorites', 'source_majlis']) {
      await personal.handle({ userId, guildId: '10', action, canManageServer: userId === '1' });
      assertPreserved(store, h.legacy, `Browsing ${action} must preserve user ${userId}'s preferences`);
    }
  }

  const events = serverEvents(store.getServer('10'), start).filter(event => event.day === '2026-09-25' && event.at > start);
  assert.ok(events.length >= 2);
  const sent = [], errors = [];
  const scheduler = new ServerScheduler({ store, queue, now: () => now, onError: error => errors.push(error), send: async (...args) => sent.push(args) });
  now = events[0].at; await scheduler.tick(); assert.equal(sent.length, 1);
  assertPreserved(store, h.legacy, 'Public sending does not consume private limits');
  scheduler.send = async () => { throw Object.assign(new Error('Synthetic missing permission'), { code: 50013 }); };
  now = events[1].at; await scheduler.tick();
  assert.equal(errors.length, 1); assert.equal(store.getServer('10').enabled, false);
  assertPreserved(store, h.legacy, 'A public permission failure does not pause private reminders');
  await act('server_pause');
  assertPreserved(store, h.legacy, 'Pausing public posts leaves private reminders unchanged');
  store.close(); store = h.open();
  assertPreserved(store, h.legacy, 'All changes remain isolated after restarting');
});

test('private reminder delivery is identical with public posting disabled or failing', async t => {
  async function simulate(publicPosting) {
    const h = persistentV7(t), store = h.open(), queue = new SerialQueue(), sent = [], errors = [];
    let now = start;
    const engine = new ReminderEngine({ store, queue, now: () => now, sendDM: async (...args) => sent.push(args) });
    const shared = { store, queue, now: () => now, deliver: (...args) => engine.deliver(...args) };
    engine.prayers = new PrayerScheduler({ ...shared, calculate: () => ['fajr', 'morning', 'quran', 'fridayPrayer'].map((key, i) => ({
      key, day: '2026-09-25', at: start + (6 + i) * MINUTE, referenceAt: start + 54 * MINUTE
    })) });
    engine.seasonal = new SeasonalScheduler({ ...shared, calculate: () => [{ ...seasonalYearEvents(1448)[1], at: start + 6 * MINUTE }] });
    if (publicPosting) store.setServer('10', { ...structuredClone(DEFAULT_SERVER), enabled: true, channelId: '101', mentionEveryone: true, activatedAt: start });
    engine.servers = new ServerScheduler({ store, queue, now: () => now, onError: error => errors.push(error),
      calculate: () => [{ id: 'daily:2026-09-25:0', kind: 'daily', day: '2026-09-25', slot: 0, at: start + 6 * MINUTE }],
      send: async () => { throw Object.assign(new Error('Synthetic public send failure'), { code: 50013 }); } });
    engine.join({ userId: '4', guildId: '10', channelId: '301', hasCompany: true });
    now = start + 5 * MINUTE; engine.leave({ userId: '4', guildId: '10' });
    for (const minutes of [6, 7, 8, 9, 15, 30]) { now = start + minutes * MINUTE; await engine.tick(); }
    assert.equal(errors.length, Number(publicPosting));
    assert.equal(engine.running, false);
    return { sent, tables: oldTables(store, h.legacy) };
  }
  const withoutPublic = await simulate(false), withPublic = await simulate(true);
  for (const prefix of ['majlis:', 'break:', 'prayer:', 'seasonal:']) assert.ok(withoutPublic.sent.some(([, , nonce]) => nonce.startsWith(prefix)), `Missing ${prefix} coverage`);
  assert.deepEqual(withPublic, withoutPublic, 'Public failure must not change personal delivery, settings or history');
  assert.ok(withPublic.sent.every(([id]) => !['2', '3'].includes(id)), 'Paused and blocked users remain excluded');
});
