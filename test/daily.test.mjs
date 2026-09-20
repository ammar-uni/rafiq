import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.mjs';
import { EncryptedSnapshot } from '../src/encrypted-snapshot.mjs';
import { DEFAULT_PRAYER, DEFAULT_DAILY, renewPrayerActivation } from '../src/prayer-config.mjs';
import { prayerSchedule } from '../src/prayer-times.mjs';
import { dailyEvents, localClockInstant } from '../src/daily-times.mjs';
import { reminderWindow } from '../src/occasion-times.mjs';
import { PrayerScheduler } from '../src/prayer-scheduler.mjs';
import { PrayerApp } from '../src/prayer-app.mjs';
import { RafiqApp } from '../src/app.mjs';
import { PreviewStore } from '../design/preview-store.mjs';
import { SerialQueue } from '../src/serial.mjs';
import { DAILY_DHIKR } from '../src/content.mjs';
import { appModal, dailyReminderPayload, MODAL_ACTIONS, FLAGS } from '../src/messages.mjs';
import { toDiscord } from '../src/discord-adapter.mjs';

const day = '2026-09-20', start = Date.parse(day + 'T00:00Z');
const city = { label: 'مكة المكرمة، السعودية', latitude: 21.426, longitude: 39.826, timezone: 'Asia/Riyadh' };
const prefs = () => ({ ...structuredClone(DEFAULT_PRAYER), city, daily: { morning: { activatedAt: start, iqamaMinutes: 20 }, evening: { activatedAt: start, iqamaMinutes: 10 }, quran: { activatedAt: start, time: '20:30' } } });
function harness(t, store = new Store(':memory:')) {
  if (store.close) t.after(() => store.close());
  let now = start, online = true;
  const sent = [], queue = new SerialQueue(), sendDM = async (...args) => { sent.push(args); };
  const prayers = new PrayerApp({ store, now: () => now, lookup: async () => [city], sendDM });
  const app = new RafiqApp({ store, prayers, queue, now: () => now, sendDM });
  const scheduler = new PrayerScheduler({ store, queue, now: () => now, canSend: () => online, deliver: sendDM });
  return { store, prayers, scheduler, sent, clock: at => { now = at; }, online: value => { online = value; }, act: (action, values = []) => app.handle({ userId: '1', guildId: '10', action, values }) };
}

test('guided setup saves the chosen city, remains opt-in, and explicitly tests without enabling reminders', async t => {
  const h = harness(t);
  for (const action of ['home', 'setup', 'today', 'daily', 'daily_morning_read', 'daily_sources']) await h.act(action);
  assert.equal(h.store.db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
  await h.act('setup_prayer_search', ['مكة']);
  await h.act(`setup_prayer_city_${h.prayers.searches.get('1').token}`, ['0']);
  assert.deepEqual(h.store.getPrayer('1').city, city);
  assert.equal(h.store.getPrayer('1').enabled, false);
  assert.deepEqual(h.store.getPrayer('1').daily, DEFAULT_DAILY);
  await h.act('setup_choices'); await h.act('setup_test');
  assert.equal(h.sent.length, 0);
  const settings = JSON.stringify(await h.act('setup_daily'));
  assert.doesNotMatch(settings, /daily_(morning|evening)_modal|بين الأذان والإقامة/);
  assert.match(settings, /daily_quran_modal/);
  assert.ok(!MODAL_ACTIONS.includes('daily_morning_modal'));
  assert.throws(() => appModal('setup_daily_morning_modal'), RangeError);
  assert.equal(appModal('setup_daily_quran_modal').custom_id, 'rafiq:v1:setup_daily_time_quran');
  await h.act('setup_daily_enable_morning');
  assert.equal(h.store.getPrayer('1').daily.morning.activatedAt, start);
  assert.equal(h.store.getPrayer('1').daily.evening.activatedAt, 0);
  assert.equal(h.store.getPrayer('1').daily.quran.activatedAt, 0);
  await h.act('setup_send_test'); await h.act('setup_send_test');
  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0][1].content, /رسالة اختبار/);
  assert.equal(h.store.getUser('1').enabled, false);
  assert.match(JSON.stringify(await h.act('today')), /أذكار الصباح/);
});

test('adhkar use a fixed thirty minutes after adhan regardless of legacy iqama values; Quran follows DST', () => {
  const p = prefs(), schedule = prayerSchedule(p, day), events = dailyEvents(p, schedule, start);
  assert.equal(events.find(e => e.key === 'morning').at, schedule[0].at + 30 * 60000);
  assert.equal(events.find(e => e.key === 'evening').at, schedule[3].at + 30 * 60000);
  for (const iqamaMinutes of [null, 0, 90]) {
    const changed = structuredClone(p);
    changed.daily.morning.iqamaMinutes = iqamaMinutes;
    changed.daily.evening.iqamaMinutes = iqamaMinutes;
    assert.deepEqual(dailyEvents(changed, schedule, start), events);
  }
  assert.equal(events.find(e => e.key === 'quran' && e.day === day).at, Date.parse(day + 'T17:30Z'));
  const late = { ...schedule[3], at: Date.parse(day + 'T23:55Z') };
  assert.equal(dailyEvents(p, [late], start).find(e => e.key === 'evening').day, day);
  assert.equal(dailyEvents(p, [late], start).find(e => e.key === 'evening').at, Date.parse('2026-09-21T00:25Z'));
  assert.equal(localClockInstant('2026-03-29', '02:30', 'Europe/Berlin'), null);
  assert.equal(localClockInstant('2026-10-25', '02:30', 'Europe/Berlin'), Date.parse('2026-10-25T00:30Z'));
  assert.equal(localClockInstant('2026-03-28', '20:30', 'Europe/Berlin'), Date.parse('2026-03-28T19:30Z'));
  assert.equal(localClockInstant('2026-03-29', '20:30', 'Europe/Berlin'), Date.parse('2026-03-29T18:30Z'));
  assert.equal(localClockInstant(day, '20:30', 'Asia/Kathmandu'), Date.parse(day + 'T14:45Z'));
});

test('daily scheduler sends three selected reminders independently of prayers and never duplicates them', async t => {
  const h = harness(t); h.store.setPrayer('1', prefs());
  for (const event of reminderWindow(prefs(), start).filter(e => e.day === day)) {
    h.clock(event.at); await h.scheduler.tick(); await h.scheduler.tick();
  }
  assert.equal(h.sent.length, 3);
  assert.ok(h.sent.every(([, payload]) => !(payload.flags & (FLAGS.silent | FLAGS.componentsV2))));
  assert.deepEqual(h.sent.map(([, , key]) => key.split(':').at(-1)), ['morning', 'evening', 'quran']);
  assert.equal(h.store.getPrayer('1').enabled, false);
  const next = new PrayerScheduler({ store: h.store, queue: new SerialQueue(), now: () => Date.parse(day + 'T17:30Z'), deliver: async (...args) => h.sent.push(args) });
  await next.tick(); assert.equal(h.sent.length, 3);
});

test('late activation, downtime, pause, blocked DMs and failures cannot create daily catch-up bursts', async t => {
  const h = harness(t), p = prefs();
  const event = reminderWindow(p, start).find(e => e.key === 'morning' && e.day === day);
  h.store.setPrayer('1', { ...p, daily: { ...p.daily, morning: { ...p.daily.morning, activatedAt: event.at + 1 } } });
  h.clock(event.at + 1); await h.scheduler.tick(); assert.equal(h.sent.length, 0);
  h.store.setPrayer('1', p); h.online(false); h.clock(event.at); await h.scheduler.tick();
  h.clock(event.at + 120001); h.online(true); await h.scheduler.tick(); assert.equal(h.sent.length, 0);
  h.clock(event.at); h.store.updateUser('1', { dmBlocked: true }); await h.scheduler.tick(); assert.equal(h.sent.length, 0);
  h.store.updateUser('1', { dmBlocked: false, pausedUntil: event.at + 1 }); await h.scheduler.tick(); assert.equal(h.sent.length, 0);
  h.clock(event.at + 1); await h.act('resume'); await h.scheduler.tick(); assert.equal(h.sent.length, 0);
  assert.equal(h.store.getPrayer('1').daily.morning.activatedAt, event.at + 1);
  h.store.setPrayer('1', p); h.store.updateUser('1', { pausedUntil: 0 }); h.clock(event.at);
  let calls = 0; h.scheduler.deliver = async () => { calls++; throw new Error('ambiguous delivery'); };
  await assert.rejects(h.scheduler.tick()); await h.scheduler.tick(); assert.equal(calls, 1);
  await h.act('disable');
  assert.ok(Object.values(h.store.getPrayer('1').daily).every(item => item.activatedAt === 0));
});

test('editing schedules requires fresh opt-in; invalid inputs and ordinary navigation preserve choices', async t => {
  const h = harness(t); h.store.setPrayer('1', prefs());
  const before = h.store.getPrayer('1');
  for (const [action, value] of [['daily_time_morning', '30'], ['daily_time_evening', '10'], ['daily_time_quran', '24:00'], ['daily_time_quran', '8:30'], ['daily_morning_modal', ''], ['setup_daily_evening_modal', '']]) await h.act(action, [value]);
  assert.deepEqual(h.store.getPrayer('1'), before);
  await h.act('daily_time_quran', ['٢١:٣٠']);
  assert.equal(h.store.getPrayer('1').daily.quran.time, '21:30');
  assert.equal(h.store.getPrayer('1').daily.quran.activatedAt, 0);
  assert.equal(h.store.getPrayer('1').daily.morning.activatedAt, start);
  assert.equal(h.store.getPrayer('1').daily.evening.activatedAt, start);
  await h.act('daily_off_quran'); assert.equal(h.store.getPrayer('1').daily.quran.activatedAt, 0);
  h.store.setPrayer('1', prefs()); await h.act('prayer_search', ['مكة']);
  await h.act(`prayer_city_${h.prayers.searches.get('1').token}`, ['0']);
  assert.ok(Object.values(h.store.getPrayer('1').daily).every(item => item.activatedAt === 0));
  assert.equal(h.store.getPrayer('1').daily.quran.time, '20:30');
});

test('v4 migration preserves old preferences, keeps additions off and persists encrypted v5 with dedupe', t => {
  const folder = mkdtempSync(join(tmpdir(), 'rafiq-daily-')); t.after(() => rmSync(folder, { recursive: true }));
  const file = join(folder, 'state.enc'), encryptionKey = randomBytes(32).toString('hex');
  let store = new Store(file, { encryptionKey });
  store.subscribe('1', '10'); store.updateUser('1', { delivery: 'silent', frequency: 'daily' }); store.toggleFavorite('1', 'majlis');
  store.setPrayer('1', { ...prefs(), enabled: true, activatedAt: start, delivery: 'silent' }); store.close();
  const snapshot = new EncryptedSnapshot(file, encryptionKey), legacy = snapshot.read(); legacy.version = 4;
  const p = JSON.parse(legacy.tables.prayer_settings[0][1]); delete p.daily;
  legacy.tables.prayer_settings[0][1] = JSON.stringify(p); snapshot.write(legacy); snapshot.close();
  store = new Store(file, { encryptionKey });
  assert.deepEqual(store.getPrayer('1'), { ...p, daily: DEFAULT_DAILY });
  assert.equal(store.getUser('1').delivery, 'silent'); assert.equal(store.getUser('1').frequency, 'daily');
  assert.deepEqual(store.favorites('1'), ['majlis']); assert.deepEqual(store.subscriptions('1'), ['10']);
  store.setPrayer('1', prefs());
  const event = reminderWindow(prefs(), start).find(e => e.key === 'morning' && e.day === day);
  assert.ok(store.claimPrayer('1', prefs(), event, event.at)); store.close();
  store = new Store(file, { encryptionKey }); t.after(() => store.close());
  assert.equal(store.claimPrayer('1', prefs(), event, event.at + 1000), null);
  for (const value of [city.label, 'iqamaMinutes', '20:30']) assert.equal(readFileSync(file).includes(Buffer.from(value)), false);
  assert.equal(store.snapshot.read().version, 5);
  store.forget('1'); store.close(); store = new Store(file, { encryptionKey });
  assert.deepEqual(store.getPrayer('1'), DEFAULT_PRAYER); store.close();
});

test('three short source-reviewed adhkar serialize as readable notification text with optional suppression', () => {
  assert.equal(DAILY_DHIKR.length, 3);
  for (const key of ['morning', 'evening', 'quran']) for (const delivery of ['normal', 'silent']) {
    const payload = dailyReminderPayload({ ...prefs(), delivery }, { key }), wire = toDiscord(payload);
    assert.ok(wire.content.length < 2000); assert.deepEqual(wire.allowedMentions.parse, []);
    assert.equal(Boolean(wire.flags & FLAGS.silent), delivery === 'silent');
    assert.equal(Boolean(wire.flags & FLAGS.componentsV2), false);
    if (key !== 'quran') for (const card of DAILY_DHIKR) assert.ok(wire.content.includes(card.text || card[key]));
  }
});

test('preview and real app agree on onboarding, reading and explicit activation', async t => {
  const a = harness(t), b = harness(t, new PreviewStore());
  for (const h of [a, b]) h.store.setPrayer('1', { ...structuredClone(DEFAULT_PRAYER), city });
  for (const [action, values = []] of [['setup'], ['setup_choices'], ['daily'], ['daily_enable_morning'], ['daily_enable_evening'], ['daily_time_quran', ['20:30']], ['daily_enable_quran'], ['today'], ['daily_morning_read'], ['daily_evening_read'], ['daily_sources'], ['setup_test'], ['setup_send_test'], ['daily_off_quran'], ['disable']]) {
    assert.deepEqual(await a.act(action, values), await b.act(action, values), action);
  }
});

test('My Day includes the nearest timer, next Friday and seasonal reminder without enabling anything', async t => {
  const h = harness(t); h.store.setPrayer('1', prefs());
  h.store.updateUser('1', { breakAt: start + 60000 });
  assert.match(JSON.stringify(await h.act('today')), /التذكير المجدول القادم: \*\*الاستراحة/);
  h.store.updateUser('1', { breakAt: null });
  h.store.setPrayer('1', { ...structuredClone(DEFAULT_PRAYER), city, occasions: { fridayPrayer: start, fridayDua: 0, qada: 0 } });
  assert.match(JSON.stringify(await h.act('today')), /التذكير المجدول القادم: \*\*الاستعداد للجمعة/);
  h.store.setPrayer('1', { ...structuredClone(DEFAULT_PRAYER), city, occasions: { fridayPrayer: 0, fridayDua: 0, qada: start } });
  assert.match(JSON.stringify(await h.act('today')), /التذكير المجدول القادم: \*\*قضاء رمضان/);
  assert.equal(h.sent.length, 0);
});
