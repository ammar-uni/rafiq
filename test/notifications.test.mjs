import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, MessagePayload, MessageFlags } from 'discord.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { makeSendDM, toDiscord } from '../src/discord-adapter.mjs';
import { reminderPayload, breakReminderPayload, prayerReminderPayload, prayerTestPayload, occasionReminderPayload, settingsPayload, FLAGS } from '../src/messages.mjs';
import { DHIKR_CARDS, OCCASION_CARDS } from '../src/content.mjs';
import { DEFAULT_PRAYER } from '../src/prayer-config.mjs';
import { Store, DEFAULT_USER } from '../src/store.mjs';
import { RafiqApp } from '../src/app.mjs';
import { PrayerApp } from '../src/prayer-app.mjs';
import { SerialQueue } from '../src/serial.mjs';

const p = { ...DEFAULT_PRAYER, city: { label: 'مكة المكرمة، السعودية', timezone: 'Asia/Riyadh' } };
const event = { label: 'الظهر', at: Date.UTC(2026, 8, 18, 9, 20) };

test('new subscribers default to three reminders with notifications; saved quiet choices survive restart', t => {
  const directory = mkdtempSync(join(tmpdir(), 'rafiq-defaults-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'state.enc'), options = { encryptionKey: randomBytes(32).toString('hex') };
  let store = new Store(path, options);
  try {
    assert.equal(store.getUser('1').enabled, false);
    assert.equal(store.getPrayer('1').enabled, false);
    store.subscribe('1', '10');
    assert.equal(store.getUser('1').delivery, 'normal');
    assert.equal(store.getUser('1').frequency, 'session');
    assert.equal(store.getPrayer('1').delivery, 'normal');
    const start = 1_800_000_000_000;
    for (let i = 0; i < 3; i++) {
      assert.ok(store.claimReminder('1', '10', start + i * 7_200_000));
      assert.equal(store.claimReminder('1', '10', start + (i + 1) * 7_200_000 - 1), null);
    }
    assert.equal(store.claimReminder('1', '10', start + 3 * 7_200_000), null);
    store.updateUser('1', { delivery: 'silent', frequency: 'daily' });
    store.setPrayer('1', { ...structuredClone(DEFAULT_PRAYER), delivery: 'silent' });
    store.close(); store = new Store(path, options);
    assert.equal(store.getUser('1').delivery, 'silent');
    assert.equal(store.getUser('1').frequency, 'daily');
    assert.equal(store.getPrayer('1').delivery, 'silent');
    store.subscribe('2', '10');
    assert.equal(store.getUser('2').delivery, 'normal');
    assert.equal(store.getUser('2').frequency, 'session');
    const select = settingsPayload().components[0].components.flatMap(item => item.components || []).find(item => item.custom_id === 'rafiq:v1:frequency');
    assert.equal(select.options[0].value, 'session');
    assert.equal(select.options[0].default, true);
  } finally { store.close(); }
});

test('all reminder DMs deliver readable content through discord.js with working classic buttons and no mentions', async t => {
  const client = new Client({ intents: [] }); t.after(() => client.destroy());
  for (const silent of [true, false]) {
    const preferences = { ...p, delivery: silent ? 'silent' : 'normal' };
    const samples = [reminderPayload({ silent }), breakReminderPayload({ silent }), prayerReminderPayload(preferences, event), prayerTestPayload(preferences),
      ...['fridayPrayer', 'fridayDua', 'qada30', 'qada15'].map(key => occasionReminderPayload(preferences, { key, days: key === 'qada30' ? 30 : 15, referenceAt: event.at }))];
    for (const payload of samples) {
      let sent;
      const dmClient = { users: { fetch: async id => { assert.equal(id, '123'); return { send: async options => { sent = options; } }; } } };
      await makeSendDM(dmClient)('123', payload, 'test-event');
      const body = MessagePayload.create({ client }, sent).resolveBody().body;
      assert.equal(body.content, payload.content, 'the adapter must not discard notification text');
      assert.ok(body.content.length > 20 && body.content.length <= 2000);
      assert.equal(body.flags & MessageFlags.IsComponentsV2, 0, 'V2 disables standard content');
      assert.equal(body.flags & MessageFlags.Ephemeral, 0);
      assert.equal(Boolean(body.flags & MessageFlags.SuppressNotifications), silent);
      assert.deepEqual(body.allowed_mentions, { parse: [], replied_user: false });
      assert.ok(body.components.length && body.components.every(row => row.type === 1 && row.components.every(button => button.type === 2 && button.custom_id.startsWith('rafiq:v1:'))));
      assert.equal(body.enforce_nonce, true);
      assert.equal(body.nonce.length, 24);
    }
  }
  const majlis = reminderPayload().content;
  assert.equal(majlis.split('\n')[0], `كفارة المجلس: ${DHIKR_CARDS[0].text.replaceAll('\n', ' ')}`);
  assert.ok(majlis.includes(DHIKR_CARDS[0].source.reference));
  assert.match(prayerReminderPayload(p, event).content.split('\n')[0], /الظهر.*مكة المكرمة.*12:20/);
  for (const key of Object.keys(OCCASION_CARDS)) assert.ok(occasionReminderPayload(p, { key, days: 30, referenceAt: event.at }).content.includes(OCCASION_CARDS[key].body));
  assert.ok(reminderPayload({ preview: true }).flags & FLAGS.componentsV2, 'private V2 panels remain editable');
});

test('prayer notifications keep their readable content when an optional audio attachment is serialized', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'rafiq-notification-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const sound = { id: 'soft', filename: 'soft.mp3', label: 'تنبيه هادئ', path: join(directory, 'soft.mp3') };
  writeFileSync(sound.path, Buffer.from('test attachment'));
  const client = new Client({ intents: [] }); t.after(() => client.destroy());
  for (const payload of [prayerReminderPayload(p, event, sound), prayerTestPayload(p, sound)]) {
    const message = MessagePayload.create({ client }, toDiscord(payload, { sounds: [sound] })).resolveBody();
    await message.resolveFiles();
    assert.equal(message.body.content, payload.content);
    assert.equal(message.files.length, 1);
    assert.equal(message.files[0].name, sound.filename);
    assert.equal(message.body.attachments.length, 1);
    assert.equal(message.body.flags & FLAGS.componentsV2, 0);
    assert.deepEqual(message.body.allowed_mentions.parse, []);
  }
});

test('notification help never subscribes or sends, and enabling phone notifications preserves independent preferences', async t => {
  const store = new Store(':memory:'); t.after(() => store.close());
  const sent = [];
  const sendDM = async (...args) => sent.push(args);
  const prayers = new PrayerApp({ store, sendDM });
  const app = new RafiqApp({ store, queue: new SerialQueue(), sendDM, prayers });
  const act = (action, values = []) => app.handle({ userId: '1', guildId: '10', action, values });
  const help = await act('notification_help');
  assert.match(JSON.stringify(help), /معاينة النص/);
  assert.deepEqual(store.getUser('1'), DEFAULT_USER);
  assert.deepEqual(store.getPrayer('1'), DEFAULT_PRAYER);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
  await act('prayer_delivery', ['silent']);
  await act('delivery', ['normal']);
  assert.equal(store.getPrayer('1').delivery, 'silent');
  await act('prayer_delivery', ['normal']);
  await act('delivery', ['silent']);
  assert.equal(store.getPrayer('1').delivery, 'normal');
  assert.equal(store.getUser('1').enabled, false);
  assert.equal(store.getPrayer('1').enabled, false);
  assert.deepEqual(store.subscriptions('1'), []);
  assert.deepEqual(sent, []);
});
