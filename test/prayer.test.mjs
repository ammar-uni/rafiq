import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Store, DEFAULT_USER } from '../src/store.mjs';
import { EncryptedSnapshot } from '../src/encrypted-snapshot.mjs';
import { SerialQueue } from '../src/serial.mjs';
import { RafiqApp } from '../src/app.mjs';
import { ReminderEngine } from '../src/reminders.mjs';
import { PrayerApp } from '../src/prayer-app.mjs';
import { PrayerScheduler } from '../src/prayer-scheduler.mjs';
import { DEFAULT_PRAYER, validatePrayer } from '../src/prayer-config.mjs';
import { prayerDate, prayerSchedule, prayerWindow } from '../src/prayer-times.mjs';
import { findPrayerCities } from '../src/prayer-geocoding.mjs';
import { loadPrayerSounds } from '../src/prayer-sounds.mjs';
import { prayerModal, prayerReminderPayload, FLAGS } from '../src/messages.mjs';
import { toDiscord } from '../src/discord-adapter.mjs';
import { PreviewStore } from '../design/preview-store.mjs';
import { ModalBuilder } from 'discord.js';

const berlin = { label: 'برلين، ألمانيا', latitude: 52.524, longitude: 13.411, timezone: 'Europe/Berlin' };
const makkah = { label: 'مكة', latitude: 21.427009, longitude: 39.828685, timezone: 'Asia/Riyadh' };
const preferences = (patch = {}) => ({ ...structuredClone(DEFAULT_PRAYER), city: berlin, method: 'MuslimWorldLeague', ...patch });
const day = '2026-09-09';
const start = Date.parse('2026-09-09T00:00:00Z');
function fixture(t, { store = new Store(':memory:'), lookup = async () => [berlin, makkah] } = {}) {
  t.after(() => store.close?.());
  let at = start, online = true;
  const sent = [], errors = [], queue = new SerialQueue();
  const sendDM = async (...args) => { sent.push(args); };
  const prayers = new PrayerApp({ store, lookup, sendDM, now: () => at });
  const engine = new ReminderEngine({ store, queue, sendDM, now: () => at, canSend: () => online, onError: error => errors.push(error) });
  engine.prayers = new PrayerScheduler({ store, queue, now: () => at, canSend: () => online, deliver: (...args) => engine.deliver(...args) });
  const app = new RafiqApp({ store, queue, prayers, sendDM, now: () => at, cancelUser: id => engine.cancelUser(id) });
  const act = (action, values = [], userId = '1') => app.handle({ action, values, userId, guildId: '10' });
  return { store, app, prayers, engine, sent, errors, act, clock: value => { at = value; }, online: value => { online = value; } };
}
function temp(t) {
  const directory = mkdtempSync(join(tmpdir(), 'rafiq-prayer-'));
  t.after(() => { for (const name of readdirSync(directory)) unlinkSync(join(directory, name)); rmdirSync(directory); });
  return directory;
}

test('calculation matches the published Adhan Makkah reference fixture (2016-01-05)', () => {
  // https://github.com/batoulapps/adhan-js/blob/develop/Shared/Times/Makkah-UmmAlQura.json
  const events = prayerSchedule(preferences({ city: makkah, method: 'UmmAlQura' }), '2016-01-05');
  const format = at => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
  assert.deepEqual(events.map(event => format(event.at)), ['05:38', '12:26', '15:31', '17:52', '19:22']);
});

test('civil date follows the city, includes DST, and handles the international date line', () => {
  const now = Date.parse('2026-09-09T23:30:00Z');
  assert.equal(prayerDate(now, 'Asia/Tokyo'), '2026-09-10');
  assert.equal(prayerDate(now, 'America/New_York'), '2026-09-09');
  for (const city of [berlin, { label: 'كيريتيماتي', latitude: 1.872, longitude: -157.427, timezone: 'Pacific/Kiritimati' }, { label: 'أبيا', latitude: -13.833, longitude: -171.767, timezone: 'Pacific/Apia' }]) {
    for (const date of ['2026-03-29', '2026-10-25']) {
      const times = prayerSchedule(preferences({ city }), date);
      assert.equal(times.length, 5);
      assert.equal(prayerDate(times[1].at, city.timezone), date);
    }
  }
  const before = prayerSchedule(preferences(), '2026-03-28')[1].at;
  const after = prayerSchedule(preferences(), '2026-03-29')[1].at;
  assert.ok(Math.abs((after - before) - 86400000) < 120000);
  const hour = at => Number(new Intl.DateTimeFormat('en-GB', { timeZone: berlin.timezone, hour: '2-digit', hourCycle: 'h23' }).format(at));
  assert.equal(hour(after) - hour(before), 1);
});

test('host time zone does not change calculated instants', () => {
  const script = `import {prayerSchedule} from './src/prayer-times.mjs'; console.log(JSON.stringify(prayerSchedule(${JSON.stringify(preferences())},'2026-03-29')));`;
  const results = ['UTC', 'America/Los_Angeles', 'Asia/Tokyo'].map(TZ => execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: new URL('..', import.meta.url), env: { ...process.env, TZ }, encoding: 'utf8' }));
  assert.equal(results[0], results[1]); assert.equal(results[1], results[2]);
});

test('Asr is fixed, while explicit Ramadan interval and per-prayer adjustments alter the intended times', () => {
  const p = preferences({ city: makkah, method: 'UmmAlQura' });
  const basic = prayerSchedule(p, day);
  const adjusted = prayerSchedule({ ...p, adjustments: [2, -3, 4, 0, 1] }, day);
  assert.deepEqual(adjusted.map((event, i) => (event.at - basic[i].at) / 60000), [2, -3, 4, 0, 1]);
  assert.equal(prayerSchedule({ ...p, ramadanIsha: true }, day)[4].at - basic[4].at, 30 * 60000);
  assert.throws(() => prayerSchedule({ ...p, asr: 'Hanafi' }, day), /Invalid calculation setting/);
});

test('polar daylight produces no invented schedule; malformed configurations fail closed', () => {
  assert.deepEqual(prayerSchedule(preferences({ city: { label: 'ترومسو', latitude: 69.649, longitude: 18.955, timezone: 'Europe/Oslo' } }), '2026-06-21'), []);
  for (const patch of [{ method: 'made-up' }, { adjustments: [0, 0, 0, 0, 61] }, { city: { ...berlin, timezone: 'invalid' } }, { soundId: '../../secret' }]) assert.throws(() => validatePrayer(preferences(patch)));
});

test('prayer browsing writes nothing; explicit city, method and reviewed enable are independent of majlis', async t => {
  const h = fixture(t);
  for (const action of ['prayer', 'prayer_location', 'prayer_calculation', 'prayer_audio', 'prayer_enable', 'prayer_disable']) await h.act(action);
  assert.equal(h.store.db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
  await h.act('prayer_search', ['Berlin, Germany']);
  assert.deepEqual(h.store.getPrayer('1'), DEFAULT_PRAYER);
  const token = h.prayers.searches.get('1').token;
  await h.act(`prayer_city_${token}`, ['0']);
  assert.equal(h.store.getPrayer('1').enabled, false);
  assert.equal(h.store.getPrayer('1').method, 'UmmAlQura');
  assert.equal(h.store.getPrayer('1').asr, 'Shafi');
  assert.deepEqual(h.store.getPrayer('1').city, berlin);
  const settings = await h.act('prayer_calculation');
  assert.doesNotMatch(JSON.stringify(settings), /prayer_asr|مثليه|الحنفية/);
  await h.act('prayer_asr', ['Hanafi']);
  assert.equal(h.store.getPrayer('1').asr, 'Shafi');
  await h.act('prayer_method', ['MuslimWorldLeague']); await h.act('prayer_enable');
  assert.equal(h.store.getPrayer('1').enabled, true);
  assert.equal(h.store.getUser('1').enabled, false); assert.deepEqual(h.store.subscriptions('1'), []);
  await h.act('prayer_adjust', ['٢', '-٣', '0', '0', '1']);
  assert.equal(h.store.getPrayer('1').enabled, false);
  assert.deepEqual(h.store.getPrayer('1').adjustments, [2, -3, 0, 0, 1]);
  assert.equal(h.sent.length, 0);
});

test('city choices are scoped to the requester, expire and preserve old settings on lookup failure', async t => {
  const h = fixture(t); h.store.setPrayer('1', preferences());
  await h.act('prayer_search', ['Berlin']);
  const token = h.prayers.searches.get('1').token;
  await h.act(`prayer_city_${token}`, ['1'], '2');
  assert.equal(h.store.getPrayer('2').city, null);
  h.clock(start + 600001); await h.act(`prayer_city_${token}`, ['1']);
  assert.deepEqual(h.store.getPrayer('1').city, berlin);
  h.prayers.lookup = async () => { throw new Error('unavailable'); };
  await h.act('prayer_search', ['Makkah']); assert.deepEqual(h.store.getPrayer('1').city, berlin);
});

test('five opt-in prayer reminders send once each, use own delivery setting, and work while in voice', async t => {
  const h = fixture(t); h.store.setPrayer('1', preferences({ enabled: true, activatedAt: start, delivery: 'normal' }));
  h.engine.isInVoice = () => true;
  for (const event of prayerSchedule(preferences(), day)) {
    h.clock(event.at - 1); await h.engine.tick();
    h.clock(event.at); await h.engine.tick(); await h.engine.tick();
  }
  assert.equal(h.sent.length, 5); assert.equal(new Set(h.sent.map(args => args[2])).size, 5);
  assert.ok(h.sent.every(([, payload]) => !(payload.flags & FLAGS.silent)));
  assert.ok(h.sent.every(([userId]) => userId === '1'));
});

test('offline, paused, blocked and late prayers are skipped with no backlog', async t => {
  const h = fixture(t), event = prayerSchedule(preferences(), day)[0];
  h.store.setPrayer('1', preferences({ enabled: true, activatedAt: start }));
  h.clock(event.at); h.online(false); await h.engine.tick();
  h.clock(event.at + 120001); h.online(true); await h.engine.tick();
  assert.equal(h.sent.length, 0);
  const next = prayerSchedule(preferences(), day)[1];
  h.store.updateUser('1', { pausedUntil: next.at + 30000 });
  h.clock(next.at); await h.engine.tick(); h.clock(next.at + 31000); await h.engine.tick();
  assert.equal(h.sent.length, 0);
  const asr = prayerSchedule(preferences(), day)[2];
  h.store.updateUser('1', { pausedUntil: 0, dmBlocked: true }); h.clock(asr.at); await h.engine.tick();
  assert.equal(h.sent.length, 0);
});

test('explicit opt-in after a time, schedule edits and repeated enables do not replay prayer alerts', async t => {
  const h = fixture(t), event = prayerSchedule(preferences(), day)[0];
  h.store.setPrayer('1', preferences()); h.clock(event.at + 1000); await h.act('prayer_enable'); await h.engine.tick();
  assert.equal(h.sent.length, 0);
  const next = prayerSchedule(preferences(), day)[1]; h.clock(next.at); await h.engine.tick();
  assert.equal(h.sent.length, 1);
  await h.act('prayer_enable'); await h.engine.tick(); assert.equal(h.sent.length, 1);
  const changed = { ...h.store.getPrayer('1'), adjustments: [0, 1, 0, 0, 0] };
  h.store.setPrayer('1', changed); h.clock(next.at + 60000); await h.engine.tick(); assert.equal(h.sent.length, 1);
});

test('ambiguous send failures reserve the attempt; blocked DMs suspend future prayer sends', async t => {
  const h = fixture(t); h.store.setPrayer('1', preferences({ enabled: true, activatedAt: start }));
  let calls = 0;
  h.engine.sendDM = async () => { calls++; throw Object.assign(new Error('network'), { code: calls === 1 ? 'ETIMEDOUT' : 50007 }); };
  const times = prayerSchedule(preferences(), day);
  h.clock(times[0].at); await h.engine.tick(); await h.engine.tick(); assert.equal(calls, 1);
  h.clock(times[1].at); await h.engine.tick(); assert.equal(h.store.getUser('1').dmBlocked, true);
  h.clock(times[2].at); await h.engine.tick(); assert.equal(calls, 2);
});

test('global stop and deletion include prayers, with queued stop preventing an imminent send', async t => {
  const h = fixture(t); h.store.setPrayer('1', preferences({ enabled: true, activatedAt: start }));
  h.clock(prayerSchedule(preferences(), day)[0].at);
  await Promise.all([h.act('disable'), h.engine.tick()]); assert.equal(h.sent.length, 0);
  assert.equal(h.store.getPrayer('1').enabled, false);
  await h.act('prayer_search', ['Berlin']); await h.act('forget_confirm');
  assert.equal(h.prayers.searches.size, 0); assert.equal(h.engine.prayers.cache.size, 0);
  assert.deepEqual(h.store.getUser('1'), DEFAULT_USER); assert.deepEqual(h.store.getPrayer('1'), DEFAULT_PRAYER);
});

test('prayer notification test is explicit, labelled as a test, respects selected delivery and is rate limited', async t => {
  const h = fixture(t); await h.act('prayer_delivery', ['normal']);
  await h.act('prayer_test'); await h.act('prayer_test');
  assert.equal(h.sent.length, 1); assert.ok(!(h.sent[0][1].flags & FLAGS.silent));
  assert.match(JSON.stringify(h.sent[0][1]), /ليست إعلانًا/);
  assert.equal(h.store.getPrayer('1').enabled, false);
});

test('v1 snapshots migrate without losing data; prayer settings and dedupe persist encrypted across restarts', t => {
  const folder = temp(t), path = join(folder, 'state.enc'), encryptionKey = randomBytes(32).toString('hex');
  const old = new EncryptedSnapshot(path, encryptionKey);
  old.write({ version: 1, tables: { users: [['1', 1, 'daily', 'silent', 0, 0, null, null]], subscriptions: [['1', '10']], favorites: [['1', 'idea:parents']], reminder_attempts: [], guild_panels: [] } }); old.close();
  let store = new Store(path, { encryptionKey });
  assert.deepEqual(store.savedIdeas('1'), ['parents']); assert.deepEqual(store.subscriptions('1'), ['10']);
  const p = preferences({ enabled: true, activatedAt: start }), event = prayerSchedule(p, day)[0];
  store.setPrayer('1', p); assert.ok(store.claimPrayer('1', p, event, event.at)); store.close();
  const bytes = readFileSync(path); for (const value of [berlin.label, berlin.timezone, 'prayer_settings']) assert.equal(bytes.includes(Buffer.from(value)), false);
  store = new Store(path, { encryptionKey }); t.after(() => store.close());
  assert.deepEqual(store.getPrayer('1'), p); assert.equal(store.claimPrayer('1', p, event, event.at + 5000), null);
  const write = store.snapshot.write; store.snapshot.write = () => { throw new Error('disk unavailable'); };
  assert.throws(() => store.setPrayer('1', { ...p, enabled: false }), /disk unavailable/); assert.equal(store.getPrayer('1').enabled, true);
  const next = prayerSchedule(p, day)[1]; assert.throws(() => store.claimPrayer('1', p, next, next.at), /disk unavailable/);
  store.snapshot.write = write; assert.ok(store.claimPrayer('1', p, next, next.at));
  store.forget('1'); store.close(); store = new Store(path, { encryptionKey });
  assert.deepEqual(store.getPrayer('1'), DEFAULT_PRAYER); assert.equal(store.db.prepare('SELECT count(*) AS n FROM prayer_attempts').get().n, 0);
  store.close();
});

test('legacy later-Asr preferences load with fixed Asr and require re-enabling after review', t => {
  const folder = temp(t), path = join(folder, 'state.enc'), encryptionKey = randomBytes(32).toString('hex');
  let store = new Store(path, { encryptionKey });
  store.setPrayer('1', preferences({ enabled: true, activatedAt: start }));
  store.toggleFavorite('1', 'guidance');
  store.close();
  const snapshot = new EncryptedSnapshot(path, encryptionKey);
  const old = snapshot.read();
  const oldSettings = JSON.parse(old.tables.prayer_settings[0][1]);
  old.tables.prayer_settings[0][1] = JSON.stringify({ ...oldSettings, asr: 'Hanafi' });
  snapshot.write(old); snapshot.close();
  store = new Store(path, { encryptionKey });
  t.after(() => store.close());
  assert.equal(store.getPrayer('1').asr, 'Shafi');
  assert.equal(store.getPrayer('1').enabled, false);
  assert.deepEqual(store.getPrayer('1').city, berlin);
  assert.deepEqual(store.favorites('1'), ['guidance']);
  assert.throws(() => store.setPrayer('1', { ...oldSettings, asr: 'Hanafi' }), /Invalid calculation setting/);
  store.setPrayer('1', { ...store.getPrayer('1'), enabled: true, activatedAt: start });
  store.close();
  store = new Store(path, { encryptionKey });
  assert.equal(store.getPrayer('1').asr, 'Shafi');
  assert.equal(store.getPrayer('1').enabled, true);
  store.close();
});

test('city lookup uses only public query parameters and filters invalid geographic responses', async () => {
  let requested;
  const fetchImpl = async (url, options) => {
    requested = { url, options };
    return { ok: true, text: async () => JSON.stringify({ results: [
      { name: 'Berlin', country: 'Germany', latitude: 52.52437, longitude: 13.41053, timezone: 'Europe/Berlin', feature_code: 'PPLC' },
      { name: 'invalid', latitude: 999, longitude: 2, timezone: 'UTC', feature_code: 'PPL' },
      { name: 'region', latitude: 2, longitude: 2, timezone: 'UTC', feature_code: 'ADM1' }
    ] }) };
  };
  const cities = await findPrayerCities('Berlin, Germany', { fetchImpl }); assert.equal(cities.length, 1);
  assert.equal(cities[0].latitude, 52.524);
  assert.equal(requested.url.origin, 'https://geocoding-api.open-meteo.com');
  assert.deepEqual([...requested.url.searchParams.keys()].sort(), ['count', 'format', 'language', 'name']);
  assert.deepEqual(requested.options.headers, { Accept: 'application/json' }); assert.equal(requested.options.redirect, 'error');
  await assert.rejects(findPrayerCities('x', { fetchImpl }), /Invalid city query/);
});

test('optional audio is allowlisted, default-off and rejects unsafe files or unknown attachments', t => {
  const directory = temp(t); const manifest = join(directory, 'catalog.json');
  writeFileSync(manifest, '[]'); assert.deepEqual(loadPrayerSounds(directory), []);
  const wav = Buffer.alloc(46); wav.write('RIFF'); wav.writeUInt32LE(38, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(2, 40);
  writeFileSync(join(directory, 'soft.wav'), wav);
  const item = { id: 'soft', label: 'تنبيه هادئ', filename: 'soft.wav' }; writeFileSync(manifest, JSON.stringify([item]));
  const sounds = loadPrayerSounds(directory), p = preferences({ soundId: 'soft' });
  const payload = prayerReminderPayload(p, prayerSchedule(p, day)[0], sounds[0]);
  assert.equal(toDiscord(payload, { sounds }).files[0].attachment, join(directory, 'soft.wav'));
  assert.throws(() => toDiscord(payload), /Unknown attachment/);
  assert.equal(prayerReminderPayload(preferences(), prayerSchedule(p, day)[0]).attachments, undefined);
  for (const filename of ['../secret.wav', 'soft.exe']) { writeFileSync(manifest, JSON.stringify([{ ...item, filename }])); assert.throws(() => loadPrayerSounds(directory)); }
});

test('preview and persisted prayer flows agree and modals preserve prayer field order', async t => {
  const stores = [new Store(':memory:'), new PreviewStore()]; t.after(() => stores[0].close());
  const apps = stores.map(store => new PrayerApp({ store, now: () => start }));
  for (const store of stores) store.setPrayer('1', preferences());
  for (const [action, values = []] of [['prayer'], ['prayer_calculation'], ['prayer_enable'], ['prayer_audio'], ['prayer_delivery', ['normal']], ['prayer_asr', ['Hanafi']], ['prayer_adjust', ['1', '2', '0', '-3', '0']], ['prayer_enable'], ['prayer_disable']]) {
    assert.deepEqual(await apps[0].route('1', action, values), await apps[1].route('1', action, values), action);
  }
  assert.deepEqual(prayerModal('prayer_adjust_modal').components.map(label => label.component.custom_id), ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']);
  assert.equal(prayerModal('prayer_city_modal').components[0].component.max_length, 80);
  for (const action of ['prayer_adjust_modal', 'prayer_city_modal']) assert.deepEqual(new ModalBuilder(prayerModal(action)).toJSON(), prayerModal(action));
});
