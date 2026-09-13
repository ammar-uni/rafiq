import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Store } from '../src/store.mjs';
import { EncryptedSnapshot } from '../src/encrypted-snapshot.mjs';
import { SerialQueue } from '../src/serial.mjs';
import { RafiqApp } from '../src/app.mjs';
import { ReminderEngine } from '../src/reminders.mjs';
import { PrayerApp } from '../src/prayer-app.mjs';
import { PrayerScheduler } from '../src/prayer-scheduler.mjs';
import { DEFAULT_PRAYER, DEFAULT_OCCASIONS, validatePrayer } from '../src/prayer-config.mjs';
import { prayerDate, prayerSchedule } from '../src/prayer-times.mjs';
import { nextRamadan, occasionEvents, reminderWindow, nextFridayReminders } from '../src/occasion-times.mjs';
import { occasionReminderPayload, occasionsPayload, FLAGS } from '../src/messages.mjs';
import { PreviewStore } from '../design/preview-store.mjs';

const city = { label: 'برلين، ألمانيا', latitude: 52.524, longitude: 13.411, timezone: 'Europe/Berlin' };
const start = Date.parse('2026-09-18T00:00:00Z'), day = '2026-09-18';
const p = (patch = {}) => ({ ...structuredClone(DEFAULT_PRAYER), city, ...patch });
const active = (patch = {}) => p({ occasions: { fridayPrayer: start, fridayDua: start, qada: start }, ...patch });
const events = (prefs = p(), date = day) => occasionEvents(prefs, prayerSchedule(prefs, date));
function fixture(t, store = new Store(':memory:')) {
  t.after(() => store.close?.());
  let now = start, online = true;
  const sent = [], queue = new SerialQueue(), sendDM = async (...args) => { sent.push(args); };
  const prayers = new PrayerApp({ store, now: () => now, lookup: async () => [city], sendDM });
  const engine = new ReminderEngine({ store, queue, sendDM, now: () => now, canSend: () => online });
  engine.prayers = new PrayerScheduler({ store, queue, now: () => now, canSend: () => online, deliver: (...args) => engine.deliver(...args) });
  const app = new RafiqApp({ store, queue, prayers, sendDM, now: () => now, cancelUser: id => engine.cancelUser(id) });
  return { store, prayers, engine, sent, act: (action, values = []) => app.handle({ userId: '1', guildId: '10', action, values }),
    clock: at => { now = at; }, online: value => { online = value; } };
}
function temp(t) {
  const directory = mkdtempSync(join(tmpdir(), 'rafiq-occasions-'));
  t.after(() => { for (const name of readdirSync(directory)) unlinkSync(join(directory, name)); rmdirSync(directory); });
  return directory;
}

test('new reminders default off; browsing and incomplete activation do not create stored users', async t => {
  const h = fixture(t);
  for (const action of ['prayer_occasions', 'prayer_occasion_sources', 'prayer_occasion_qada', 'prayer_occasion_fridayPrayer', 'prayer_occasion_off_qada']) await h.act(action);
  assert.deepEqual(h.store.getPrayer('1').occasions, DEFAULT_OCCASIONS);
  assert.equal(h.store.db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
  for (const occasions of [{ qada: start }, { ...DEFAULT_OCCASIONS, qada: -1 }, { ...DEFAULT_OCCASIONS, extra: 0 }, { ...DEFAULT_OCCASIONS, qada: true }]) assert.throws(() => validatePrayer(p({ occasions })));
  assert.throws(() => validatePrayer({ ...structuredClone(DEFAULT_PRAYER), occasions: { ...DEFAULT_OCCASIONS, qada: start } }), /Incomplete/);
});

test('three independent opt-ins work without daily prayer or majlis; explicit stop stays stopped on repeated clicks', async t => {
  const h = fixture(t); h.store.setPrayer('1', p());
  for (const key of ['fridayPrayer', 'fridayDua', 'qada']) {
    await h.act(`prayer_occasion_${key}`);
    assert.equal(h.store.getPrayer('1').occasions[key], start);
  }
  assert.equal(h.store.getPrayer('1').enabled, false); assert.equal(h.store.getUser('1').enabled, false);
  assert.deepEqual(h.store.subscriptions('1'), []);
  await h.act('prayer_occasion_off_qada'); await h.act('prayer_occasion_off_qada');
  assert.equal(h.store.getPrayer('1').occasions.qada, 0);
  assert.equal(h.store.getPrayer('1').occasions.fridayPrayer, start);
  await h.act('prayer_disable'); assert.equal(h.store.getPrayer('1').occasions.fridayDua, start);
  await h.act('disable'); assert.deepEqual(h.store.getPrayer('1').occasions, DEFAULT_OCCASIONS);
});

test('Friday offsets follow local Dhuhr and Maghrib across DST, seasons and the date line', () => {
  for (const place of [city, { label: 'مكة', latitude: 21.427, longitude: 39.828, timezone: 'Asia/Riyadh' }, { label: 'كيريتيماتي', latitude: 1.872, longitude: -157.427, timezone: 'Pacific/Kiritimati' }]) {
    for (const date of ['2026-03-27', '2026-04-03', '2026-10-23', '2026-10-30', '2026-12-25']) {
      const prefs = p({ city: place }), times = prayerSchedule(prefs, date), reminders = events(prefs, date);
      assert.equal(reminders.length, 2);
      assert.equal(reminders[0].at, times[1].at - 45 * 60000);
      assert.equal(reminders[1].at, Math.max(times[2].at, times[3].at - 3600000));
      assert.equal(prayerDate(reminders[0].at, place.timezone), date);
      assert.equal(prayerDate(reminders[1].at, place.timezone), date);
    }
  }
  const prefs = p({ city: { label: 'كيريتيماتي', latitude: 1.872, longitude: -157.427, timezone: 'Pacific/Kiritimati' } });
  assert.equal(new Date(events(prefs)[0].at).getUTCDay(), 4, 'a local Friday can be Thursday in UTC');
  assert.deepEqual(events(p(), '2026-09-17'), []);
  assert.deepEqual(events(p(), '2026-09-19'), []);
  const next = nextFridayReminders(p(), events()[0].at + 1);
  assert.equal(next.find(e => e.key === 'fridayDua').day, day);
  assert.equal(next.find(e => e.key === 'fridayPrayer').day, '2026-09-25');
});

test('dua never starts before Asr, and unavailable polar schedules produce no invented reminders', () => {
  const times = prayerSchedule(p(), day);
  times[2].at = times[3].at - 30 * 60000;
  assert.equal(occasionEvents(p(), times)[1].at, times[2].at);
  assert.deepEqual(occasionEvents(active(), times.slice(1)), []);
  const polar = active({ city: { label: 'ترومسو', latitude: 69.649, longitude: 18.955, timezone: 'Europe/Oslo' } });
  assert.deepEqual(reminderWindow(polar, Date.parse('2026-06-19T12:00Z')), []);
});

test('qada has exactly two forecast dates, 30 and 15 civil days before Ramadan, at local Dhuhr', () => {
  assert.deepEqual(nextRamadan('2027-01-09'), { day: '2027-02-08', year: 1448, days: 30 });
  assert.equal(nextRamadan('2027-01-24').days, 15);
  assert.equal(nextRamadan('2027-02-08').days, 0);
  assert.ok(nextRamadan('2027-02-09').days > 300);
  assert.throws(() => nextRamadan('2026-02-31'), /Invalid/);
  assert.throws(() => nextRamadan('garbage'), /Invalid/);
  const prefs = active(), selected = [];
  for (let offset = 0; offset < 61; offset++) {
    const date = new Date(Date.parse('2026-12-25T12:00Z') + offset * 86400000).toISOString().slice(0, 10);
    const reminders = events(prefs, date).filter(e => e.key.startsWith('qada'));
    for (const event of reminders) {
      selected.push([event.day, event.key]);
      assert.equal(event.at, prayerSchedule(prefs, date)[1].at);
      assert.equal((Date.parse(event.ramadanDay) - Date.parse(event.day)) / 86400000, event.days);
    }
  }
  assert.deepEqual(selected, [['2027-01-09', 'qada30'], ['2027-01-24', 'qada15']]);
  assert.deepEqual(events(p(), '2027-01-09'), []);
});

test('scheduler sends only opted-in occasions, once per event, using the chosen notification setting', async t => {
  const h = fixture(t); h.store.setPrayer('1', active({ delivery: 'normal' }));
  for (const date of [day, '2027-01-09', '2027-01-24']) {
    for (const event of reminderWindow(h.store.getPrayer('1'), Date.parse(date + 'T12:00Z')).filter(e => e.day === date)) {
      h.clock(event.at - 1); await h.engine.tick();
      h.clock(event.at); await h.engine.tick(); await h.engine.tick();
    }
  }
  assert.equal(h.sent.length, 4);
  assert.ok(h.sent.every(([, payload]) => !(payload.flags & FLAGS.silent)));
  assert.match(JSON.stringify(h.sent[2][1]), /٣٠/); assert.match(JSON.stringify(h.sent[3][1]), /١٥/);
  assert.ok(h.sent.every(([, , nonce]) => /:(fridayPrayer|fridayDua|qada30|qada15)$/.test(nonce)));
});

test('no backlog after late activation, offline time, pause or blocked DM recovery', async t => {
  const h = fixture(t), event = events()[0]; h.store.setPrayer('1', p());
  h.clock(event.at + 1); await h.act('prayer_occasion_fridayPrayer'); await h.engine.tick(); assert.equal(h.sent.length, 0);
  h.store.setPrayer('1', active()); h.clock(event.at); h.online(false); await h.engine.tick();
  h.clock(event.at + 120001); h.online(true); await h.engine.tick(); assert.equal(h.sent.length, 0);
  const dua = events()[1]; h.clock(dua.at - 1); await h.act('pause_today');
  h.clock(dua.at + 1); await h.act('resume'); await h.engine.tick(); assert.equal(h.sent.length, 0);
  h.store.setPrayer('1', active()); h.store.updateUser('1', { dmBlocked: true });
  await h.engine.tick(); assert.equal(h.sent.length, 0);
  await h.act('test_dm'); await h.engine.tick(); assert.equal(h.sent.length, 1, 'only the requested test DM');
  assert.equal(h.store.getPrayer('1').occasions.fridayDua, dua.at + 1);
});

test('paused or blocked activation is refused; city/calculation edits disable all affected reminders', async t => {
  const h = fixture(t); h.store.setPrayer('1', p());
  h.store.updateUser('1', { pausedUntil: start + 1000 }); await h.act('prayer_occasion_qada');
  assert.equal(h.store.getPrayer('1').occasions.qada, 0);
  h.store.updateUser('1', { pausedUntil: 0, dmBlocked: true }); await h.act('prayer_occasion_qada');
  assert.equal(h.store.getPrayer('1').occasions.qada, 0);
  h.store.updateUser('1', { dmBlocked: false });
  for (const [action, values] of [['prayer_adjust', ['1','0','0','0','0']], ['prayer_method', ['MuslimWorldLeague']], ['prayer_highLatitude', ['SeventhOfTheNight']], ['prayer_ramadan', []]]) {
    h.store.setPrayer('1', active({ enabled: true, activatedAt: start }));
    await h.act(action, values); assert.deepEqual(h.store.getPrayer('1').occasions, DEFAULT_OCCASIONS); assert.equal(h.store.getPrayer('1').enabled, false);
  }
  h.store.setPrayer('1', active()); await h.act('prayer_search', ['Berlin']);
  await h.act(`prayer_city_${h.prayers.searches.get('1').token}`, ['0']);
  assert.deepEqual(h.store.getPrayer('1').occasions, DEFAULT_OCCASIONS);
});

test('encrypted v3 migration preserves old choices, new choices stay private, dedup survives restart and travel', t => {
  const folder = temp(t), file = join(folder, 'state.enc'), encryptionKey = randomBytes(32).toString('hex');
  let store = new Store(file, { encryptionKey }); store.setPrayer('1', p({ enabled: true, activatedAt: start })); store.toggleFavorite('1', 'majlis'); store.close();
  const snapshot = new EncryptedSnapshot(file, encryptionKey), legacy = snapshot.read(); legacy.version = 3;
  const settings = JSON.parse(legacy.tables.prayer_settings[0][1]); delete settings.occasions;
  legacy.tables.prayer_settings[0][1] = JSON.stringify(settings); snapshot.write(legacy); snapshot.close();
  store = new Store(file, { encryptionKey });
  assert.equal(store.getPrayer('1').enabled, true); assert.deepEqual(store.getPrayer('1').occasions, DEFAULT_OCCASIONS); assert.deepEqual(store.favorites('1'), ['majlis']);
  const prefs = active(), event = events(prefs)[0]; store.setPrayer('1', prefs); assert.ok(store.claimPrayer('1', prefs, event, event.at)); store.close();
  for (const value of [city.label, city.timezone, 'qada', 'fridayPrayer']) assert.equal(readFileSync(file).includes(Buffer.from(value)), false);
  store = new Store(file, { encryptionKey }); t.after(() => store.close());
  assert.deepEqual(store.getPrayer('1'), prefs); assert.equal(store.claimPrayer('1', prefs, event, event.at + 5000), null);
  assert.equal(store.claimPrayer('1', prefs, { ...event, day: '2026-09-19', at: event.at + 3600000 }, event.at + 3600000), null);
  const write = store.snapshot.write; store.snapshot.write = () => { throw new Error('disk unavailable'); };
  const dua = events(prefs)[1]; assert.throws(() => store.claimPrayer('1', prefs, dua, dua.at), /disk unavailable/);
  store.snapshot.write = write; assert.ok(store.claimPrayer('1', prefs, dua, dua.at));
  store.prune(dua.at + 7 * 86400000); assert.equal(store.db.prepare('SELECT count(*) AS n FROM prayer_attempts').get().n, 0);
  store.forget('1'); store.close(); store = new Store(file, { encryptionKey });
  assert.deepEqual(store.getPrayer('1'), DEFAULT_PRAYER);
  store.close();
});

test('ambiguous occasion sends are not retried; an explicit global stop wins a queued reminder', async t => {
  const h = fixture(t); h.store.setPrayer('1', active()); let calls = 0;
  h.engine.sendDM = async () => { calls++; throw Object.assign(new Error('network'), { code: 'ETIMEDOUT' }); };
  h.clock(events()[0].at); await h.engine.tick(); await h.engine.tick(); assert.equal(calls, 1);
  h.clock(events()[1].at); await Promise.all([h.act('disable'), h.engine.tick()]); assert.equal(calls, 1);
});

test('preview matches the real menus, uses explicit switches and distinguishes calculation from religious evidence', async t => {
  const a = fixture(t), b = fixture(t, new PreviewStore());
  a.store.setPrayer('1', p()); b.store.setPrayer('1', p());
  for (const action of ['prayer_occasions', 'prayer_occasion_sources', 'prayer_occasion_fridayPrayer', 'prayer_occasion_fridayDua', 'prayer_occasion_qada', 'prayer_occasion_off_qada', 'prayer_disable', 'pause_today', 'resume', 'disable']) {
    assert.deepEqual(await a.act(action), await b.act(action), action);
  }
  const qada = occasionReminderPayload(active(), events(active(), '2027-01-09')[0]);
  assert.match(JSON.stringify(qada), /المتوقع بتقويم أم القرى/); assert.match(JSON.stringify(qada), /prayer_occasion_off_qada/);
  assert.ok(qada.flags & FLAGS.silent); assert.ok(!(qada.flags & FLAGS.ephemeral));
  assert.match(JSON.stringify(occasionsPayload()), /ابدأ باختيار مدينتك/);
});
