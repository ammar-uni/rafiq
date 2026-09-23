import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Store, DAY, MINUTE } from '../src/store.mjs';
import { SerialQueue } from '../src/serial.mjs';
import { RafiqApp } from '../src/app.mjs';
import { PrayerApp } from '../src/prayer-app.mjs';
import { ReminderEngine } from '../src/reminders.mjs';
import { SeasonalScheduler } from '../src/seasonal-scheduler.mjs';
import { seasonalYearEvents, seasonalWindow, seasonalHijriParts, seasonalCivilDay } from '../src/seasonal-times.mjs';
import { SEASONAL_CARDS } from '../src/content.mjs';
import { welcomePayload, seasonalReminderPayload, seasonalSourcePayload, FLAGS } from '../src/messages.mjs';
import { DEFAULT_PRAYER } from '../src/prayer-config.mjs';
import { EncryptedSnapshot } from '../src/encrypted-snapshot.mjs';
import { PreviewStore } from '../design/preview-store.mjs';
import { toDiscord } from '../src/discord-adapter.mjs';

const events = seasonalYearEvents(1448);
const city = { label: 'مكة المكرمة، السعودية', latitude: 21.426, longitude: 39.826, timezone: 'Asia/Riyadh' };
function fixture(t) {
  let now = events[0].at - DAY, connected = true;
  const store = new Store(':memory:'); t.after(() => store.close());
  const queue = new SerialQueue(), sent = [], errors = [];
  const sendDM = async (...args) => sent.push(args);
  const engine = new ReminderEngine({ store, queue, sendDM, now: () => now, canSend: () => connected, onError: error => errors.push(error) });
  engine.seasonal = new SeasonalScheduler({ store, queue, now: () => now, canSend: engine.canSend, deliver: (...args) => engine.deliver(...args), onError: error => errors.push(error) });
  const prayers = new PrayerApp({ store, sendDM, now: () => now, lookup: async () => [city] });
  const app = new RafiqApp({ store, queue, sendDM, prayers, now: () => now });
  return { store, sent, errors, engine, app, prayers, clock: value => { now = value; }, online: value => { connected = value; },
    act: (action, values = []) => app.handle({ userId: '1', guildId: '10', action, values }) };
}
function persistent(t) {
  const folder = mkdtempSync(join(tmpdir(), 'rafiq-seasonal-')), file = join(folder, 'state.enc');
  const options = { encryptionKey: randomBytes(32).toString('hex') }, opened = [];
  t.after(() => { opened.forEach(s => s.close()); readdirSync(folder).forEach(name => rmSync(join(folder, name))); rmdirSync(folder); });
  return { file, options, open: () => { const s = new Store(file, options); opened.push(s); return s; } };
}

test('exactly one notice per season, two Saudi civil days early, independent of city', () => {
  for (const year of [1356, 1447, 1448, 1449, 1450, 1499]) {
    const all = seasonalYearEvents(year);
    assert.equal(all.length, 2); assert.equal(new Set(all.map(e => e.id)).size, 2);
    for (const e of all) {
      assert.equal(e.days, 2); assert.equal(e.confirmed, false);
      const referenceAt = seasonalCivilDay(e.referenceDay);
      assert.equal(referenceAt - e.at, 2 * DAY);
      assert.equal(new Date(e.at).getUTCHours(), 9); // 12:00 Saudi, DST independent.
      assert.deepEqual(seasonalHijriParts(referenceAt), { year, month: 12, day: e.key === 'arafah' ? 9 : 1 });
    }
    assert.equal(all[1].at - all[0].at, 8 * DAY);
  }
  const nearYearEnd = Date.parse('2027-06-05T21:01:00Z');
  assert.ok(seasonalWindow(nearYearEnd).some(e => e.year === 1449));
  assert.throws(() => seasonalCivilDay('2027-02-30'), RangeError);
  assert.throws(() => seasonalYearEvents(1501), RangeError);
});

test('date confirmation corrects the Saudi month start without changing campaign identities', () => {
  const day = new Date(seasonalCivilDay(events[0].referenceDay) + DAY).toISOString().slice(0, 10);
  // Synthetic operator record, never shipped or advertised as a real announcement.
  const record = { year: 1448, day, checkedOn: events[0].referenceDay, sourceURL: 'https://www.spa.gov.sa/test-fixture' };
  const corrected = seasonalYearEvents(1448, [record]);
  assert.deepEqual(corrected.map(e => e.id), events.map(e => e.id));
  corrected.forEach((e, i) => { assert.equal(e.at, events[i].at + DAY); assert.equal(e.confirmed, true); });
  assert.throws(() => seasonalYearEvents(1448, [record, record]), /Duplicate/);
  assert.throws(() => seasonalYearEvents(1448, [{ ...record, sourceURL: 'https://example.com/unverified' }]), /Invalid/);
});

test('browsing and old buttons never opt in; disclosed start enables without a city and preserves opt-outs', async t => {
  const h = fixture(t);
  const home = JSON.stringify(await h.act('home'));
  assert.match(home, /عند البدء تتفعّل/); assert.match(home, /setup_start/);
  for (const action of ['setup', 'reminders', 'seasonal', 'seasonal_preview', 'seasonal_preview_arafah', 'seasonal_preview_dhul-hijjah', 'seasonal_source_arafah', 'seasonal_source_dhul-hijjah', 'help', 'today']) await h.act(action);
  assert.equal(h.store.db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
  await h.act('enable'); assert.equal(h.store.getUser('1').seasonalAt, null);
  await h.act('setup_start'); assert.ok(h.store.getUser('1').seasonalAt > 0);
  assert.equal(h.store.getPrayer('1').city, null); assert.deepEqual(h.sent, []);
  await h.act('seasonal_off');
  for (const action of ['setup_start', 'enable', 'resume', 'setup_choices', 'home']) await h.act(action);
  assert.equal(h.store.getUser('1').seasonalAt, 0);
  await h.act('prayer_search', ['مكة']); await h.act(`prayer_city_${h.prayers.searches.get('1').token}`, ['0']);
  assert.equal(h.store.getUser('1').seasonalAt, 0);
  await h.act('seasonal_on'); await h.act('seasonal_on');
  assert.ok(h.store.getUser('1').seasonalAt > 0);
});

test('welcome starts seasons by default with no city; an initial opt-out survives every start entry', async t => {
  const welcome = welcomePayload();
  const entry = welcome.components[0].components.find(item => item.type === 1).components.find(item => item.label === 'ابدأ مع رفيق');
  assert.ok(entry, 'The main welcome offers the disclosed start, without an extra seasonal activation');
  assert.match(JSON.stringify(welcome), /مواسم الخير.*تلقائيًا.*الخاص/);
  const action = entry.custom_id.slice('rafiq:v1:'.length);
  for (const optedOut of [false, true]) {
    const h = fixture(t);
    const initial = JSON.stringify(await h.act('seasonal'));
    assert.match(initial, /مفعّلة تلقائيًا عند البدء/);
    assert.match(initial, /seasonal_off/);
    assert.doesNotMatch(initial, /seasonal_on/);
    for (const page of ['reminders', 'today', 'setup_choices']) assert.match(JSON.stringify(await h.act(page)), /مفعّلة تلقائيًا عند البدء/, page);
    if (optedOut) await h.act('seasonal_off');
    await h.act(action);
    const activated = h.store.getUser('1').seasonalAt;
    assert.equal(activated > 0, !optedOut);
    assert.equal(h.store.getPrayer('1').city, null);
    await h.act('setup_choices'); // Skipping the city does not skip seasonal defaults.
    h.clock(events[0].at - MINUTE);
    await h.act(action); // Repeated onboarding must not change either decision.
    assert.equal(h.store.getUser('1').seasonalAt, activated);
    assert.deepEqual(h.sent, []);
    h.clock(events[0].at); await h.engine.tick();
    assert.equal(h.sent.length, optedOut ? 0 : 1);
    assert.doesNotMatch(JSON.stringify(await h.act('seasonal')), /مفعّلة تلقائيًا عند البدء/);
  }
});

test('one notification per campaign even on concurrent ticks, and one for the following Hijri year', async t => {
  const h = fixture(t); await h.act('setup_start');
  h.store.ensureUser('2'); // A different user has not consented.
  for (const event of events) {
    h.clock(event.at - 1); await h.engine.tick();
    const before = h.sent.length;
    h.clock(event.at); await Promise.all([h.engine.tick(), h.engine.tick()]); await h.engine.tick();
    assert.equal(h.sent.length, before + 1);
    assert.equal(h.sent.at(-1)[0], '1');
    assert.equal(h.sent.at(-1)[1].flags & FLAGS.silent, 0);
  }
  assert.equal(h.sent.length, 2);
  h.clock(seasonalYearEvents(1449)[0].at); await h.engine.tick();
  assert.equal(h.sent.length, 3); assert.deepEqual(h.errors, []);
});

test('late activation, downtime, pause and global stop cannot produce a backlog', async t => {
  for (const mode of ['late', 'offline', 'pause', 'stop', 'blocked']) {
    const h = fixture(t); await h.act('seasonal_on');
    if (mode === 'late') { await h.act('seasonal_off'); h.clock(events[0].at + 1000); await h.act('seasonal_on'); }
    if (mode === 'offline') { h.clock(events[0].at); h.online(false); await h.engine.tick(); h.online(true); h.clock(events[0].at + 3 * MINUTE); }
    if (mode === 'pause') { h.clock(events[0].at - MINUTE); await h.act('pause_today'); h.clock(events[0].at + 1000); await h.act('resume'); }
    if (mode === 'stop') { await h.act('disable'); h.clock(events[0].at); await h.act('setup_start'); }
    if (mode === 'blocked') { h.store.updateUser('1', { dmBlocked: true }); h.clock(events[0].at); }
    await h.engine.tick(); assert.equal(h.sent.length, 0, mode);
  }
});

test('DM recovery skips past seasonal events; silent preference is respected for future sends', async t => {
  for (const action of ['test_dm', 'prayer_test', 'setup_send_test']) {
    const h = fixture(t); await h.act('seasonal_on');
    h.store.updateUser('1', { dmBlocked: true, delivery: 'silent' });
    h.clock(events[0].at + 1000); await h.act(action); await h.engine.tick();
    assert.equal(h.sent.length, 1); // Only the explicitly requested test.
    h.clock(events[1].at); await h.engine.tick(); assert.equal(h.sent.length, 2);
    assert.ok(h.sent[1][1].flags & FLAGS.silent);
  }
});

test('ambiguous sends are not retried; blocked DMs stop later campaigns and queued cancellation wins', async t => {
  for (const code of ['ETIMEDOUT', 50007]) {
    const h = fixture(t); await h.act('seasonal_on'); let attempts = 0;
    h.engine.sendDM = async () => { attempts++; throw Object.assign(new Error('synthetic failure'), { code }); };
    h.clock(events[0].at); await h.engine.tick(); await h.engine.tick(); assert.equal(attempts, 1);
    h.clock(events[1].at); await h.engine.tick(); assert.equal(attempts, code === 50007 ? 1 : 2);
  }
  const h = fixture(t); await h.act('seasonal_on'); h.clock(events[0].at);
  await Promise.all([h.act('seasonal_off'), h.engine.tick()]); assert.equal(h.sent.length, 0);
});

test('encrypted v6 migration preserves every existing field and leaves seasonal subscription unchosen', t => {
  const p = persistent(t); let s = p.open();
  s.subscribe('1', '10'); s.updateUser('1', { delivery: 'silent', frequency: 'session5', pausedUntil: events[0].at });
  s.toggleFavorite('1', 'majlis'); s.setPrayer('1', { ...structuredClone(DEFAULT_PRAYER), city }); s.close();
  const snapshot = new EncryptedSnapshot(p.file, p.options.encryptionKey), legacy = snapshot.read();
  legacy.version = 6; delete legacy.tables.seasonal_attempts; legacy.tables.users.forEach(row => row.pop());
  snapshot.write(legacy); snapshot.close();
  const unchanged = readFileSync(p.file);
  s = p.open(); assert.equal(s.getUser('1').seasonalAt, null); assert.deepEqual(readFileSync(p.file), unchanged);
  s.persist(); const saved = s.snapshot.read(); assert.equal(saved.version, 7);
  for (const [name, rows] of Object.entries(legacy.tables)) assert.deepEqual(name === 'users' ? saved.tables.users.map(row => row.slice(0, -1)) : saved.tables[name], rows);
  assert.deepEqual(saved.tables.seasonal_attempts, []);
  s.close(); s = p.open(); assert.equal(s.getUser('1').seasonalAt, null);
});

test('claim persistence, correction dedupe, opt-out, deletion and retention survive restarts', t => {
  const p = persistent(t); let s = p.open(); const e = events[0];
  s.updateUser('1', { seasonalAt: e.at - DAY });
  const oldWrite = s.snapshot.write;
  s.snapshot.write = () => { throw new Error('disk unavailable'); };
  assert.throws(() => s.claimSeasonal('1', e, e.at), /disk unavailable/);
  assert.equal(s.db.prepare('SELECT count(*) AS n FROM seasonal_attempts').get().n, 0);
  s.snapshot.write = oldWrite;
  assert.ok(s.claimSeasonal('1', e, e.at)); s.close(); s = p.open();
  assert.equal(s.claimSeasonal('1', e, e.at + 1000), null);
  assert.equal(s.claimSeasonal('1', { ...e, at: e.at + DAY }, e.at + DAY), null);
  assert.equal(readFileSync(p.file).includes(Buffer.from(e.id)), false);
  s.updateUser('1', { seasonalAt: 0 }); s.close(); s = p.open(); assert.equal(s.getUser('1').seasonalAt, 0);
  s.prune(e.at + 399 * DAY); assert.equal(s.db.prepare('SELECT count(*) AS n FROM seasonal_attempts').get().n, 1);
  s.prune(e.at + 400 * DAY); assert.equal(s.db.prepare('SELECT count(*) AS n FROM seasonal_attempts').get().n, 0);
  s.updateUser('1', { seasonalAt: e.at - DAY }); assert.ok(s.claimSeasonal('1', e, e.at));
  s.forget('1'); s.close(); s = p.open(); assert.deepEqual(s.seasonalUsers(), []);
  assert.equal(s.db.prepare('SELECT count(*) AS n FROM seasonal_attempts').get().n, 0);
});

test('notification text is short, qualified and sourced; preview never creates a DM', () => {
  for (const event of events) {
    const message = seasonalReminderPayload(event), native = toDiscord(message);
    assert.ok(native.content.length < 700); assert.ok(native.content.includes(SEASONAL_CARDS[event.key].text));
    assert.match(native.content, /الموعد المتوقع في السعودية/); assert.doesNotMatch(native.content, /غدًا|بعد غد/);
    assert.deepEqual(native.allowedMentions.parse, []);
    assert.match(JSON.stringify(message.components), /seasonal_off/);
    const preview = seasonalReminderPayload(event, { preview: true }); assert.ok(preview.flags & FLAGS.ephemeral);
    assert.doesNotMatch(JSON.stringify(preview), /seasonal_on/);
    assert.ok(toDiscord(seasonalSourcePayload(event.key)));
  }
  assert.match(seasonalReminderPayload(events[1]).content, /لغير الحاج/);
  assert.match(SEASONAL_CARDS['dhul-hijjah'].source.reference, /البخاري، واللفظ لأبي داود/);
});

test('memory-only preview matches persisted consent, cancellation, sources and guided navigation', async t => {
  const real = new Store(':memory:'); t.after(() => real.close());
  const stores = [real, new PreviewStore()]; let now = events[0].at - DAY;
  const apps = stores.map(store => new RafiqApp({ store, queue: new SerialQueue(), sendDM: async () => { throw new Error('Unexpected DM'); }, now: () => now }));
  for (const action of ['home', 'seasonal', 'seasonal_preview', 'seasonal_source_dhul-hijjah', 'setup_start', 'setup_choices', 'setup_seasonal', 'setup_seasonal_off', 'setup_start', 'seasonal_on', 'today', 'pause_today', 'resume', 'disable', 'home', 'forget_confirm', 'home']) {
    const input = { userId: '1', guildId: '10', action };
    assert.deepEqual(await apps[0].handle(input), await apps[1].handle(input), action);
    now += 1000;
  }
});
