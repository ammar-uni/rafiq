import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, Collection, MessagePayload, ModalBuilder, PermissionsBitField, PermissionFlagsBits as P } from 'discord.js';
import { FeedbackApp, feedbackCard, feedbackReviewMessage } from '../src/feedback.mjs';
import { resolveFeedbackChannel, makeSendFeedback, makeFeedbackRetention } from '../src/feedback-discord.mjs';
import { Store } from '../src/store.mjs';
import { SerialQueue } from '../src/serial.mjs';
import { RafiqApp } from '../src/app.mjs';
import { readConfig } from '../src/config.mjs';
import { DHIKR_CARDS, GOOD_DEEDS, PUBLIC_POSTS, DAILY_DHIKR, SEASONAL_CARDS, OCCASION_CARDS } from '../src/content.mjs';

const string = payload => JSON.stringify(payload);
const REPORTER = { id: '123456789012345678', username: 'reporter_account' };
function fixture(send) {
  let clock = 1_800_000_000_000, count = 0;
  const messages = [];
  const app = new FeedbackApp({ now: () => clock, token: () => (++count).toString(16).padStart(24, '0'), send: send || (async (payload, ticket) => messages.push({ payload, ticket })) });
  const open = (userId = REPORTER.id, action = 'feedback_form_report_majlis') => app.modal({ userId, username: REPORTER.username, action }).custom_id.slice(9);
  const submit = (action, values = ['ملاحظة تجريبية للمراجعة', ''], userId = REPORTER.id) => app.submit({ userId, action, values });
  return { app, messages, open, submit, advance: ms => { clock += ms; } };
}

test('reports and suggestions only send on submit, with validated context and disclosed account identity', async () => {
  const f = fixture(), action = f.open();
  assert.equal(f.messages.length, 0);
  assert.match(string(await f.submit(action)), /وصلت ملاحظتك/);
  assert.equal(f.messages.length, 1);
  assert.match(f.messages[0].payload.content, /majlis/);
  assert.match(f.messages[0].payload.content, /https:\/\/sunnah.com\/abudawud:4859/);
  assert.ok(string(f.messages).includes(REPORTER.id));
  assert.ok(string(f.messages).includes(REPORTER.username));
  const suggestion = f.open('223456789012345678', 'feedback_form_suggestion');
  await f.submit(suggestion, ['تحسين بسيط للشاشة الرئيسية'], '223456789012345678');
  assert.match(f.messages[1].payload.content, /اقتراح لرفيق/);
  assert.ok(!f.messages[1].payload.content.includes('majlis'));
});

test('sender identity is required at form opening and cannot be replaced by submission fields', async () => {
  const f = fixture();
  for (const identity of [{ userId: REPORTER.id }, { userId: 'not-an-account', username: REPORTER.username }, { userId: REPORTER.id, username: 'x'.repeat(33) }]) {
    assert.equal(f.app.modal({ ...identity, action: 'feedback_form_report' }), null);
  }
  const modal = f.app.modal({ userId: REPORTER.id, username: REPORTER.username, action: 'feedback_form_suggestion' });
  assert.equal(f.messages.length, 0);
  await f.app.submit({ userId: REPORTER.id, action: modal.custom_id.slice(9), values: ['ملاحظة للمراجعة كاملة'], reporter: { id: '999', username: 'forged_sender' } });
  assert.equal(f.messages.length, 1);
  assert.ok(f.messages[0].payload.content.includes('معرّف الحساب: `' + REPORTER.id + '`'));
  assert.ok(!f.messages[0].payload.content.includes('forged_sender'));
  assert.deepEqual(f.messages[0].payload.allowedMentions.parse, []);
});

test('another user, an expired form, an abandoned form and a replay cannot send', async () => {
  const f = fixture(), action = f.open();
  await f.submit(action, ['ملاحظة من مستخدم مختلف', ''], 'wrong-user');
  assert.equal(f.messages.length, 0);
  await f.submit(action); await f.submit(action);
  assert.equal(f.messages.length, 1);
  f.advance(10 * 60_000);
  const abandoned = f.open(), newer = f.open();
  await f.submit(abandoned); assert.equal(f.messages.length, 1);
  f.advance(15 * 60_000); await f.submit(newer);
  assert.equal(f.messages.length, 1);
  assert.equal(f.app.pending.size, 0);
});

test('duplicate concurrent submits reserve one send before waiting on Discord', async () => {
  let complete, sends = 0;
  const f = fixture(async () => { sends++; await new Promise(resolve => { complete = resolve; }); });
  const action = f.open(), first = f.submit(action);
  await f.submit(action); assert.equal(sends, 1);
  complete(); await first; assert.equal(sends, 1);
});

test('native Discord modal serialization accepts every content context and the optional source field', () => {
  const f = fixture();
  const cards = [...DHIKR_CARDS, ...GOOD_DEEDS, ...PUBLIC_POSTS, ...DAILY_DHIKR, ...Object.values(SEASONAL_CARDS), ...Object.values(OCCASION_CARDS)];
  for (const action of ['feedback_form_suggestion', 'feedback_form_report', ...cards.map(card => `feedback_form_report_${card.id}`)]) {
    const modal = new ModalBuilder(f.app.modal({ userId: '1', username: REPORTER.username, action })).toJSON();
    assert.ok(modal.custom_id.length <= 100);
    assert.equal(modal.components[0].type, 18);
    assert.equal(modal.components[0].component.style, 2);
    assert.match(modal.components[0].description, /يُرفق اسم حسابك ومعرّفه/);
    if (modal.components[1]) assert.equal(modal.components[1].component.required, false);
  }
});

test('bad content and unsafe source links are rejected before a send', async () => {
  const f = fixture();
  for (const values of [['قصير', ''], ['x'.repeat(1001), ''], ['ملاحظة للمراجعة كاملة', 'javascript:alert(1)'], ['ملاحظة للمراجعة كاملة', 'https://user:secret@site.test/'], ['ملاحظة للمراجعة كاملة', 'https://site.test/<>'], ['ملاحظة للمراجعة كاملة', 'x'.repeat(251)], ['ملاحظة للمراجعة كاملة', '', 'extra']]) await f.submit(f.open(), values);
  assert.equal(f.messages.length, 0);
  assert.equal(f.app.modal({ userId: '1', username: REPORTER.username, action: 'feedback_form_report_forged-post' }), null);
  assert.equal(f.app.modal({ userId: '1', username: REPORTER.username, action: 'feedback_form_suggestion_extra' }), null);
  const result = await f.submit(f.open(), ['ملاحظة للمراجعة كاملة', 'https://sunnah.com/muslim:2694']);
  assert.match(string(result), /وصلت ملاحظتك/);
});

test('per-user and global quotas bound submissions, and memory is pruned', async () => {
  const f = fixture();
  await f.submit(f.open()); await f.submit(f.open()); assert.equal(f.messages.length, 1);
  for (let i = 0; i < 2; i++) { f.advance(10 * 60_000); await f.submit(f.open()); }
  f.advance(10 * 60_000); await f.submit(f.open()); assert.equal(f.messages.length, 3);
  f.advance(86_400_000); f.app.prune(); assert.equal(f.app.attempts.size, 0);
  for (let i = 0; i < 31; i++) { const userId = String(100 + i); await f.submit(f.open(userId), ['ملاحظة للمراجعة كاملة', ''], userId); }
  assert.equal(f.messages.length, 33);
  f.advance(86_400_000); f.app.prune();
  assert.equal(f.app.pending.size, 0); assert.equal(f.app.globalAttempts.length, 0);
});

test('network uncertainty never claims delivery or retries automatically', async () => {
  let sends = 0, errors = 0;
  const f = fixture(async () => { sends++; throw Object.assign(new Error('sensitive-text-not-to-be-displayed'), { code: 50013 }); });
  f.app.onError = () => { errors++; };
  const action = f.open(), result = await f.submit(action);
  assert.match(string(result), /تعذّر تأكيد/);
  assert.ok(!string(result).includes('sensitive-text'));
  assert.ok(!string(result).includes('وصلت ملاحظتك'));
  await f.submit(action); assert.equal(sends, 1); assert.equal(errors, 1);
});

test('every reviewed card has a resolvable context, and review messages fit Discord without mentions', async t => {
  const cards = [...DHIKR_CARDS, ...GOOD_DEEDS, ...PUBLIC_POSTS, ...DAILY_DHIKR, ...Object.values(SEASONAL_CARDS), ...Object.values(OCCASION_CARDS)];
  const client = new Client({ intents: [] }); t.after(() => client.destroy());
  for (const card of cards) {
    assert.equal(feedbackCard(card.id), card);
    const payload = feedbackReviewMessage({ ticket: 'a'.repeat(24), kind: 'report', card, body: '@everyone ```' + 'x'.repeat(980), sourceURL: 'https://site.test/' + 'x'.repeat(232), reporter: { id: '12345678901234567890', username: '🌿'.repeat(32) } });
    assert.ok(payload.content.length <= 2000);
    const resolved = MessagePayload.create({ client }, payload).resolveBody().body;
    assert.deepEqual(resolved.allowed_mentions, { parse: [], users: [], roles: [], replied_user: false });
    assert.equal(resolved.flags, 4);
    assert.equal((payload.content.match(/```/g) || []).length, 2);
  }
});

test('opening/submitting feedback preserves all legacy preferences and creates no new subscriber', async t => {
  const store = new Store(':memory:'); t.after(() => store.close());
  store.subscribe('1', '10'); store.updateUser('1', { delivery: 'silent', frequency: 'session5', seasonalAt: 0 });
  store.toggleFavorite('1', 'majlis'); store.toggleIdeaFavorite('1', 'parents');
  const tables = () => store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({ name }) => [name, store.db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]);
  const before = tables(), f = fixture();
  const app = new RafiqApp({ store, queue: new SerialQueue(), feedback: f.app, sendDM: () => assert.fail('no DMs') });
  for (const userId of ['1', '2']) {
    for (const action of ['support', 'feedback_suggestion', 'report_majlis', `report_${PUBLIC_POSTS[0].id}`]) await app.handle({ userId, action });
    const modal = f.app.modal({ userId, username: REPORTER.username, action: 'feedback_form_suggestion' });
    await app.handle({ userId, action: modal.custom_id.slice(9), values: ['تحسين بسيط على المساعدة'] });
  }
  assert.deepEqual(tables(), before);
});

function channelFixture() {
  const config = { feedbackGuildId: '10', feedbackChannelId: '100' }, sends = [];
  const overwrite = (id, type, allow = 0n, deny = 0n) => ({ id, type, allow: new PermissionsBitField(allow), deny: new PermissionsBitField(deny) });
  const permissions = new PermissionsBitField(P.ViewChannel | P.SendMessages);
  const channel = { id: '100', guildId: '10', type: 0, permissionOverwrites: { cache: new Collection([['10', overwrite('10', 0, 0n, P.ViewChannel)], ['owner', overwrite('owner', 1, P.ViewChannel)], ['bot', overwrite('bot', 1, P.ViewChannel)]]) }, permissionsFor: () => permissions, send: async payload => { sends.push(payload); return { id: 'message' }; } };
  const roles = new Collection([['10', { permissions: new PermissionsBitField(0n) }]]);
  const guild = { id: '10', ownerId: 'owner', available: true, channels: { fetch: async () => channel }, roles: { fetch: async () => roles }, members: { fetchMe: async () => ({ id: 'bot' }) } };
  const client = { guilds: { fetch: async () => guild } };
  return { config, client, channel, guild, roles, permissions, sends, overwrite };
}

test('fixed private channel is checked before every send, with no new permissions required', async () => {
  const f = channelFixture();
  assert.equal(await resolveFeedbackChannel(f.client, f.config), f.channel);
  const send = makeSendFeedback(f.client, f.config), payload = feedbackReviewMessage({ ticket: 'b'.repeat(24), kind: 'suggestion', body: 'ملاحظة تشغيل تجريبية', reporter: REPORTER });
  await send(payload, 'b'.repeat(24)); assert.equal(f.sends.length, 1);
  assert.equal(f.sends[0].enforceNonce, true);
  f.channel.permissionOverwrites.cache.get('10').deny.remove(P.ViewChannel);
  await assert.rejects(send(payload, 'c'.repeat(24)), { code: 'RAF_FEEDBACK_TARGET' });
  assert.equal(f.sends.length, 1);
});

test('public channels, extra readers, administrators, wrong targets and lost permissions fail closed', async () => {
  const changes = [
    f => { f.channel.id = 'other'; },
    f => { f.channel.guildId = 'other'; }, f => { f.channel.type = 2; }, f => { f.guild.available = false; },
    f => f.channel.permissionOverwrites.cache.get('10').allow.add(P.ViewChannel),
    f => f.channel.permissionOverwrites.cache.set('reader', f.overwrite('reader', 1, P.ViewChannel)),
    f => f.channel.permissionOverwrites.cache.set('role', f.overwrite('role', 0, P.ViewChannel)),
    f => f.roles.set('admin', { permissions: new PermissionsBitField(P.Administrator) }),
    f => f.permissions.remove(P.SendMessages)
  ];
  for (const change of changes) { const f = channelFixture(); change(f); await assert.rejects(resolveFeedbackChannel(f.client, f.config), { code: 'RAF_FEEDBACK_TARGET' }); }
  assert.equal(makeSendFeedback({}, {}), null);
});

test('retention requires the private destination and history access, without manage-messages permission', async () => {
  const f = channelFixture(), errors = [];
  f.client.user = { id: 'bot' };
  let fetched = 0;
  f.channel.messages = { fetch: async () => { fetched++; return new Collection(); } };
  const options = { onError: error => errors.push(error.code) };
  assert.deepEqual(await makeFeedbackRetention(f.client, f.config, options).tick(), { ok: false });
  assert.equal(fetched, 0);
  f.permissions.add(P.ReadMessageHistory);
  assert.equal(f.permissions.has(P.ManageMessages), false);
  assert.equal((await makeFeedbackRetention(f.client, f.config, options).tick()).ok, true);
  assert.equal(fetched, 1);
  f.channel.permissionOverwrites.cache.get('10').deny.remove(P.ViewChannel);
  assert.deepEqual(await makeFeedbackRetention(f.client, f.config, options).tick(), { ok: false });
  assert.equal(fetched, 1);
  assert.equal(makeFeedbackRetention({}, {}).enabled, false);
});

test('configuration uses a complete optional destination pair and never exposes values on error', () => {
  const env = { DISCORD_APPLICATION_ID: '123456789012345678', DISCORD_TOKEN: 'private-test-token' };
  assert.equal(readConfig(env).feedbackChannelId, null);
  assert.equal(readConfig({ ...env, RAFIQ_FEEDBACK_GUILD_ID: '123456789012345678', RAFIQ_FEEDBACK_CHANNEL_ID: '223456789012345678' }).feedbackChannelId, '223456789012345678');
  for (const fields of [{ RAFIQ_FEEDBACK_GUILD_ID: '123456789012345678' }, { RAFIQ_FEEDBACK_CHANNEL_ID: '123456789012345678' }, { RAFIQ_FEEDBACK_GUILD_ID: 'secret-value', RAFIQ_FEEDBACK_CHANNEL_ID: 'secret-value' }]) assert.throws(() => readConfig({ ...env, ...fields }), error => error.code === 'RAF_CONFIG' && !error.message.includes('secret-value') && !error.message.includes('private-test-token'));
});
