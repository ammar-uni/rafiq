import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.mjs';
import { SerialQueue } from '../src/serial.mjs';
import { RafiqApp } from '../src/app.mjs';
import { PrayerApp } from '../src/prayer-app.mjs';
import { FLAGS } from '../src/messages.mjs';
import { DEFAULT_PRAYER } from '../src/prayer-config.mjs';
import { COMMANDS } from '../src/commands.mjs';

const now = Date.parse('2026-09-23T09:00:00Z');
const city = { label: 'مكة المكرمة، السعودية', latitude: 21.426, longitude: 39.826, timezone: 'Asia/Riyadh' };
function menus(t) {
  const store = new Store(':memory:'); t.after(() => store.close());
  const sent = [], sendDM = async (...args) => sent.push(args);
  const prayers = new PrayerApp({ store, sendDM, now: () => now, lookup: async () => [city] });
  const app = new RafiqApp({store, prayers, queue: new SerialQueue(), sendDM, now: () => now});
  return { store, sent, act: (action, values = []) => app.handle({userId:'1',guildId:'10',action,values}) };
}
function controls(payload) {
  const result = new Map();
  function visit(item) {
    if (item.custom_id) result.set(item.custom_id.slice(9), item);
    item.components?.forEach(visit);
    if (item.accessory) visit(item.accessory);
  }
  payload.components.forEach(visit);
  return result;
}
async function back(h, payload) {
  const choices = [...controls(payload)].filter(([, item]) => item.label === 'رجوع');
  assert.equal(choices.length, 1, 'Each submenu has one unambiguous Back button');
  return h.act(choices[0][0]);
}

test('back walks up the reminder menus without undoing saved times or activating anything', async t => {
  const h = menus(t);
  h.store.setPrayer('1', {...structuredClone(DEFAULT_PRAYER), city});
  const user = h.store.getUser('1');
  const saved = await h.act('daily_offset_morning_after', ['٢٥']);
  const preferences = h.store.getPrayer('1');
  const times = await h.act('daily_offset_morning');
  assert.deepEqual(await back(h, times), await h.act('daily_morning'));
  const daily = await back(h, saved);
  assert.deepEqual(daily, await h.act('daily'));
  const reminders = await back(h, daily);
  assert.deepEqual(reminders, await h.act('reminders'));
  assert.deepEqual(await back(h, reminders), await h.act('home'));
  for (const action of ['prayer','prayer_calculation','prayer_location','prayer_audio','prayer_occasions','prayer_occasion_sources','settings','preview','reminder_intro','daily_quran','explore','library','favorites','saved_dhikr','saved_ideas','idea','help','notification_help','support','privacy','forget','today','break']) {
    const parent = await back(h, await h.act(action));
    assert.ok(parent.flags & FLAGS.ephemeral, action);
    assert.doesNotMatch(JSON.stringify(parent), /هذا الخيار لم يعد متاحًا|اختيار غير صالح/, action);
  }
  assert.deepEqual(h.store.getPrayer('1'), preferences);
  assert.deepEqual(h.store.getUser('1'), user);
  assert.deepEqual(h.store.subscriptions('1'), []);
  assert.deepEqual(h.sent, []);
});

test('back from sources restores the selected reading or saved card', async t => {
  const h = menus(t);
  for (const period of ['morning','evening']) {
    const reading = await h.act(`daily_${period}_read`);
    const source = [...controls(reading)].find(([, item]) => item.label === 'المصادر والتوضيح');
    assert.ok(source);
    assert.deepEqual(await back(h, await h.act(source[0])), reading);
  }
  await h.act('favorite_guidance');
  assert.deepEqual(await back(h, await h.act('source_guidance_saved')), await h.act('card_guidance_saved'));
  assert.deepEqual(await back(h, await h.act('saved_dhikr')), await h.act('favorites'));
  assert.deepEqual(h.store.favorites('1'), ['guidance']);
  assert.deepEqual(h.sent, []);
});

test('back inside guided setup returns to the correct step without leaving setup or opting in', async t => {
  const h = menus(t);
  h.store.setPrayer('1', {...structuredClone(DEFAULT_PRAYER), city});
  const preferences = h.store.getPrayer('1');
  for (const [from, to] of [['setup_test','setup_choices'], ['setup_choices','setup'], ['setup','home'], ['setup_daily_offset_evening','setup_daily_evening'], ['setup_daily_evening','setup_daily'], ['setup_daily','setup_choices'], ['setup_prayer','setup_choices'], ['setup_prayer_calculation','setup_prayer'], ['setup_reminder_intro','setup_choices'], ['setup_daily_quran','setup_choices']]) {
    assert.deepEqual(await back(h, await h.act(from)), await h.act(to), from);
  }
  assert.deepEqual(h.store.getPrayer('1'), preferences);
  assert.deepEqual(h.store.subscriptions('1'), []);
  assert.deepEqual(h.sent, []);
});

test('new-user menus and reading are private and do not opt in or send anything', async t => {
  const h = menus(t);
  const home = controls(await h.act('home'));
  for (const action of ['setup_start','reminders','explore','idea']) assert.ok(home.has(action));
  for (const action of ['enable','daily_enable_morning','prayer_enable']) assert.ok(!home.has(action));
  for (const action of ['reminders','explore','help','daily','daily_morning','daily_evening','daily_quran','daily_morning_read','daily_evening_read','setup_reminders','setup_daily_morning','setup_daily_quran']) {
    const payload = await h.act(action);
    assert.ok(payload.flags & FLAGS.ephemeral, action);
    assert.doesNotMatch(JSON.stringify(payload), /لم يعد متاحًا|اختيار غير صالح/);
  }
  assert.deepEqual(h.sent, []);
  assert.deepEqual(h.store.subscriptions('1'), []);
  assert.deepEqual(h.store.getPrayer('1'), DEFAULT_PRAYER);
  assert.equal(h.store.db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
});

test('returning users see their saved city and active choices with working navigation', async t => {
  const h = menus(t);
  h.store.setPrayer('1', {...structuredClone(DEFAULT_PRAYER), city});
  await h.act('daily_enable_morning');
  const before = h.store.getPrayer('1');
  const home = await h.act('home'), list = await h.act('reminders');
  assert.ok(controls(home).has('today'));
  assert.ok(controls(home).has('setup_start'), 'An existing city does not hide the disclosed seasonal start');
  assert.ok(!controls(home).has('setup'));
  assert.match(JSON.stringify(home), /مكة المكرمة/);
  assert.match(JSON.stringify(list), /١ من ٢ مفعّل/);
  for (const action of ['daily','daily_morning','daily_evening','daily_quran','today','explore','help','home']) await h.act(action);
  assert.deepEqual(h.store.getPrayer('1'), before);
  assert.deepEqual(h.sent, []);
});

test('every slash-command destination opens a working private screen without side effects', async t => {
  const h = menus(t);
  for (const {value} of COMMANDS.find(command => command.name === 'rafiq').options[0].choices) {
    const page = await h.act(value);
    assert.ok(page.flags & FLAGS.ephemeral, value);
    assert.doesNotMatch(JSON.stringify(page), /هذا الخيار لم يعد متاحًا/);
  }
  assert.deepEqual(h.sent, []);
  assert.deepEqual(h.store.getPrayer('1'), DEFAULT_PRAYER);
  assert.equal(h.store.db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
});

test('detail screens explain prerequisites and never enable an incomplete reminder', async t => {
  const h = menus(t);
  for (const period of ['morning','evening','quran']) {
    const page = await h.act(`daily_${period}`);
    assert.equal(controls(page).get(`daily_enable_${period}`).disabled, true);
    assert.ok(controls(page).has('prayer_location'));
    await h.act(`daily_enable_${period}`);
    assert.equal(h.store.getPrayer('1').daily[period].activatedAt, 0);
  }
  h.store.setPrayer('1', {...structuredClone(DEFAULT_PRAYER), city});
  assert.equal(controls(await h.act('daily_morning')).get('daily_enable_morning').disabled, false);
  assert.equal(controls(await h.act('daily_quran')).get('daily_enable_quran').disabled, true);
  const saved = await h.act('daily_time_quran', ['٢٠:٣٠']);
  assert.equal(controls(saved).get('daily_enable_quran').disabled, false);
  assert.equal(h.store.getPrayer('1').daily.quran.activatedAt, 0);
  assert.deepEqual(h.sent, []);
});

test('timing changes and toggles return to the right reminder and preserve other periods', async t => {
  const h = menus(t);
  h.store.setPrayer('1', {...structuredClone(DEFAULT_PRAYER), city});
  const other = h.store.getPrayer('1').daily.evening;
  const saved = await h.act('daily_offset_morning_after', ['٢٥']);
  assert.ok(controls(saved).has('daily_offset_morning'));
  assert.ok(!controls(saved).has('daily_offset_evening'));
  assert.equal(h.store.getPrayer('1').daily.morning.offsetMinutes, 25);
  assert.deepEqual(h.store.getPrayer('1').daily.evening, other);
  const enabled = await h.act('daily_enable_morning');
  assert.ok(controls(enabled).has('daily_off_morning'));
  const stopped = await h.act('daily_off_morning');
  assert.ok(controls(stopped).has('daily_enable_morning'));
  assert.equal(h.store.getPrayer('1').daily.morning.offsetMinutes, 25);
  assert.equal(h.store.getPrayer('1').daily.morning.activatedAt, 0);
  assert.deepEqual(h.sent, []);
});

test('onboarding can enter nested menus and return to its next step without writes', async t => {
  const h = menus(t);
  h.store.setPrayer('1', {...structuredClone(DEFAULT_PRAYER), city});
  const before = h.store.getPrayer('1');
  for (const action of ['setup_reminders','setup_daily','setup_daily_morning','setup_daily_offset_morning','setup_daily_quran','setup_explore','setup_help']) {
    const page = await h.act(action), buttons = controls(page);
    assert.ok(buttons.has('setup_continue'), action);
    for (const id of buttons.keys()) assert.ok(id.startsWith('setup_'), id);
    const next = await h.act('setup_continue');
    assert.ok(controls(next).has('setup_test'));
  }
  assert.deepEqual(h.store.getPrayer('1'), before);
  assert.deepEqual(h.sent, []);
});

test('blocked or paused detail screens provide recovery and still permit turning reminders off', async t => {
  const h = menus(t);
  h.store.setPrayer('1', {...structuredClone(DEFAULT_PRAYER), city});
  await h.act('daily_enable_morning');
  for (const patch of [{dmBlocked:true,pausedUntil:0}, {dmBlocked:false,pausedUntil:now+3600000}]) {
    h.store.updateUser('1',patch);
    const active = controls(await h.act('daily_morning'));
    assert.equal(active.get('daily_off_morning').disabled, false);
    assert.ok(active.has(patch.dmBlocked ? 'test_dm' : 'resume'));
    assert.equal(controls(await h.act('daily_evening')).get('daily_enable_evening').disabled, true);
  }
  assert.deepEqual(h.sent, []);
});
