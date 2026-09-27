import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Client, MessagePayload, PermissionsBitField, PermissionFlagsBits as P } from 'discord.js';
import { Store, DAY } from '../src/store.mjs';
import { EncryptedSnapshot } from '../src/encrypted-snapshot.mjs';
import { PreviewStore } from '../design/preview-store.mjs';
import { SerialQueue } from '../src/serial.mjs';
import { DEFAULT_SERVER, validateServer, serverTimesForCount, serverEvents } from '../src/server-config.mjs';
import { ServerApp } from '../src/server-app.mjs';
import { RafiqApp } from '../src/app.mjs';
import { ServerScheduler } from '../src/server-scheduler.mjs';
import { serverPostPayload, serverReviewPayload, SERVER_GENERAL_CARDS, serverCardForEvent } from '../src/server-messages.mjs';
import { toDiscord } from '../src/discord-adapter.mjs';
import { makeSendServer, makeCheckServerTarget, toServerDiscord, resolveServerTarget } from '../src/server-discord.mjs';
import { seasonalYearEvents } from '../src/seasonal-times.mjs';
import { PUBLIC_POSTS } from '../src/content.mjs';

const start = Date.parse('2026-09-25T00:00:00Z'), token = '0123456789abcdef';
const preferences = (patch = {}) => ({ ...structuredClone(DEFAULT_SERVER), channelId: '101', enabled: true, activatedAt: start, ...patch });
const input = (action, values = [], rest = {}) => ({ guildId: '10', userId: '1', canManage: true, action: action.startsWith('server_') ? action : `server_${token}_${action}`, values, ...rest });
function fixture(t, options = {}) {
  const store = new Store(':memory:'); t.after(() => store.close());
  const queue = new SerialQueue(), sent = [], errors = [];
  let now = start;
  const app = new ServerApp({ store, now: () => now, token: () => token, checkTarget: async () => null, ...options });
  const scheduler = new ServerScheduler({ store, queue, now: () => now, send: async (...args) => sent.push(args), onError: error => errors.push(error) });
  return { store, queue, app, scheduler, sent, errors, clock: at => { now = at; }, act: (action, values, rest) => queue.run(`guild:${rest?.guildId || '10'}`, () => app.handle(input(action, values, rest))) };
}
async function prepare(h, count = 1) {
  await h.act('server_begin'); await h.act('channel', ['101']); await h.act('count', [String(count)]);
}

test('public posting stays off until an authorized administrator reviews and saves; guide is read-only', async t => {
  const h = fixture(t);
  assert.equal(h.store.getServer('10').enabled, false);
  const guide = await h.act('server_guide', [], { canManage: false, guildId: null });
  assert.match(JSON.stringify(guide), /rafiq-setup/);
  assert.deepEqual(h.store.postingGuilds(), []);
  for (const action of ['server_begin', 'server_pause', `server_${token}_save`]) {
    const result = await h.act(action, [], { canManage: false });
    assert.match(JSON.stringify(result), /للمشرف/);
  }
  await prepare(h);
  await h.act('save'); assert.deepEqual(h.store.postingGuilds(), []);
  await h.act('review'); assert.deepEqual(h.store.postingGuilds(), []);
  await h.act('save'); assert.equal(h.store.getServer('10').enabled, true);
  assert.equal(h.sent.length, 0);
  await h.act('server_pause'); assert.equal(h.store.getServer('10').enabled, false);
  await h.act('save'); assert.equal(h.store.getServer('10').enabled, false);
});

test('drafts are bound to their owner and guild, expire, and reject stale or altered confirmations', async t => {
  const h = fixture(t); await prepare(h);
  for (const rest of [{ userId: '2' }, { guildId: '20' }, { canManage: false }]) {
    await h.act('count', ['3'], rest);
    assert.equal(h.app.drafts.get(token).p.dailyCount, 1);
    assert.equal(h.app.modal(input('time_modal', [], rest)), null);
  }
  await h.act('review'); await h.act('count', ['2']); await h.act('save');
  assert.equal(h.store.getServer('10').enabled, false);
  await h.act('review'); h.store.setServer('10', preferences({ channelId: '102' }));
  assert.match(JSON.stringify(await h.act('save')), /تغيّرت/);
  assert.equal(h.store.getServer('10').channelId, '102');
  await h.act('server_begin'); h.clock(start + 15 * 60000);
  assert.match(JSON.stringify(await h.act('review')), /انتهت/);
  await h.act('server_begin'); await h.act('server_home');
  assert.match(JSON.stringify(await h.act('review')), /انتهت/);
});

test('a permission change between review and save prevents activating public posts', async t => {
  let denied = false;
  const h = fixture(t, { checkTarget: async () => denied ? 'صلاحية القناة تغيّرت.' : null });
  await prepare(h); await h.act('review'); denied = true;
  const result = await h.act('save'); assert.match(JSON.stringify(result), /صلاحية القناة/);
  assert.deepEqual(h.store.postingGuilds(), []); assert.deepEqual(h.sent, []);
});

test('losing manage-server permission rejects old controls and hides stored channel settings', async t => {
  const h = fixture(t);
  h.store.setServer('10', preferences());
  await prepare(h, 3); await h.act('review');
  const before = h.store.getServer('10');
  for (const action of ['server_home', 'server_begin', 'server_pause', `server_${token}_save`]) {
    const denied = await h.act(action, [], {canManage:false});
    assert.match(JSON.stringify(denied), /هذه الإعدادات للمشرف/);
    assert.doesNotMatch(JSON.stringify(denied), /<#101>/);
    assert.deepEqual(h.store.getServer('10'), before);
  }
  const outside = await h.act('server_home', [], {guildId:null});
  assert.match(JSON.stringify(outside), /هذه الإعدادات للمشرف/);
  assert.deepEqual(h.store.getServer('10'), before);
  assert.deepEqual(h.sent, []);
});

test('removal or draft expiry during a permission check cannot activate public posting', async t => {
  for (const interruption of ['removed', 'expired']) {
    let duringCheck = () => {};
    const h = fixture(t, {checkTarget:async()=>{ duringCheck(); return null; }});
    await prepare(h); await h.act('review');
    duringCheck = () => {
      if (interruption === 'removed') { h.app.forgetGuild('10'); h.store.removeGuild('10'); }
      else h.clock(start + 15 * 60000);
    };
    const result = await h.act('save');
    assert.deepEqual(h.store.postingGuilds(), [], interruption);
    assert.match(JSON.stringify(result), /انتهت هذه المعاينة/);
    assert.deepEqual(h.sent, []);
  }
});

test('every public post opens its verified source privately without subscribing readers', async t => {
  const h = fixture(t);
  const app = new RafiqApp({ store: h.store, queue: h.queue, sendDM: async () => assert.fail('No DM requested') });
  const events = Array.from({ length: 10 }, (_, i) => ({ kind: 'daily', day: `2026-09-${String(i + 10)}`, slot: 0 }));
  events.push(...seasonalYearEvents(1448).map(campaign => ({ kind: 'seasonal', campaign })));
  for (const event of events) {
    const post = serverPostPayload(event);
    for (const button of post.components[0].components) {
      const result = await app.handle({ userId: '1', guildId: '10', action: button.custom_id.slice(9) });
      assert.ok(result.flags & 64);
      assert.doesNotMatch(JSON.stringify(result), /هذا الخيار لم يعد متاحًا/);
    }
  }
  assert.equal(h.store.db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
});

test('daily quantity, optional seasons, independent role selection and exact local times are validated', async t => {
  const h = fixture(t); await prepare(h, 3);
  const modal = h.app.modal(input('time_modal')); assert.equal(modal.components.length, 3);
  await h.act('time_save', ['٠٨:٠٠', '١٤:٠٠', '٢٠:٠٠']);
  assert.deepEqual(h.app.drafts.get(token).p.times, ['08:00', '14:00', '20:00']);
  for (const bad of [['08:00', '08:15', '20:00'], ['20:00', '14:00', '08:00'], ['29:00', '14:00', '20:00'], ['08:00']]) {
    await h.act('time_save', bad); assert.deepEqual(h.app.drafts.get(token).p.times, ['08:00', '14:00', '20:00']);
  }
  await h.act('zone_save', ['Europe/Berlin']); await h.act('zone_save', ['Mars/Olympus']);
  assert.equal(h.app.drafts.get(token).p.timezone, 'Europe/Berlin');
  await h.act('role', ['10']); assert.equal(h.app.drafts.get(token).p.roleId, null);
  await h.act('role', ['201']); await h.act('count', ['0']);
  await h.act('review'); await h.act('save');
  const p = h.store.getServer('10'); assert.equal(p.dailyCount, 0); assert.equal(p.seasonal, true); assert.equal(p.roleId, '201'); assert.equal(p.enabled, true);
  await h.act('server_begin'); await h.act('seasonal'); await h.act('no_role'); await h.act('review'); await h.act('save');
  assert.equal(h.store.getServer('10').enabled, false);
  assert.throws(() => validateServer(preferences({ dailyCount: 4 })), /frequency/);
  assert.throws(() => validateServer(preferences({ times: ['20:00', '20:30'], dailyCount: 2 })), /hour apart/);
});

test('everyone is explicit, permission-checked and mutually exclusive with role or no mention', async t => {
  let permitted = false;
  const h = fixture(t, {checkTarget:async({preferences:p})=>p.mentionEveryone && !permitted ? 'تحتاج صلاحية ذكر الجميع.' : null});
  await prepare(h); await h.act('role', ['201']);
  assert.equal(h.store.getServer('10').mentionEveryone, false);
  assert.match(JSON.stringify(await h.act('everyone')), /تحتاج صلاحية/);
  assert.equal(h.app.drafts.get(token).p.mentionEveryone, false);
  assert.equal(h.app.drafts.get(token).p.roleId, '201');
  permitted = true; await h.act('everyone');
  assert.equal(h.app.drafts.get(token).p.mentionEveryone, true);
  assert.equal(h.app.drafts.get(token).p.roleId, null);
  assert.equal(h.store.getServer('10').mentionEveryone, false, 'The selection is still a private draft');
  const review = await h.act('review');
  assert.match(JSON.stringify(review), /@everyone/);
  assert.deepEqual(toDiscord(review).allowedMentions, {parse:[],repliedUser:false});
  permitted = false; await h.act('save');
  assert.equal(h.store.getServer('10').enabled, false, 'Permission is checked again at save');
  permitted = true; await h.act('review'); await h.act('save');
  assert.equal(h.store.getServer('10').mentionEveryone, true);
  await h.act('server_begin'); await h.act('role', ['201']);
  assert.equal(h.app.drafts.get(token).p.mentionEveryone, false);
  await h.act('everyone'); await h.act('no_role');
  assert.equal(h.app.drafts.get(token).p.mentionEveryone, false);
  assert.equal(h.app.drafts.get(token).p.roleId, null);
  assert.deepEqual(h.sent, []);
  assert.throws(()=>validateServer(preferences({roleId:'201',mentionEveryone:true})), /mention/);
  assert.throws(()=>validateServer(preferences({mentionEveryone:'true'})), /mention/);
});

test('back from server submenus keeps the draft, while cancel leaves saved posting unchanged', async t => {
  const h = fixture(t), saved = preferences(); h.store.setServer('10', saved);
  await prepare(h, 3); await h.act('everyone');
  const draft = structuredClone(h.app.drafts.get(token).p);
  const buttons = page => page.components[0].components.flatMap(item=>item.type===1?item.components:[]);
  for (const action of ['schedule','mention','review']) {
    const page = await h.act(action), back = buttons(page).find(item=>item.label==='رجوع');
    assert.ok(back, action);
    const returned = await h.act(back.custom_id.slice(9));
    assert.ok(buttons(returned).some(item=>item.label==='التالي: المراجعة'));
    assert.deepEqual(h.app.drafts.get(token).p, draft);
    assert.deepEqual(h.store.getServer('10'), saved);
  }
  const cancel = buttons(await h.act('edit')).find(item=>item.label==='إلغاء');
  const home = await h.act(cancel.custom_id.slice(9));
  assert.ok(buttons(home).some(item=>item.label==='الرئيسية'));
  assert.deepEqual(h.store.getServer('10'), saved);
  assert.equal(h.app.drafts.size, 0);
  assert.deepEqual(h.sent, []);
});

test('the local preview and encrypted-store app use the same admin flows without messages', async t => {
  const real = new Store(':memory:'); t.after(() => real.close());
  const apps = [real, new PreviewStore()].map(store => new ServerApp({ store, token: () => token, now: () => start, checkTarget: async () => null }));
  for (const [action, values = []] of [['server_guide'], ['server_home'], ['server_begin'], ['channel', ['101']], ['count', ['3']], ['schedule'], ['zone', ['Europe/Berlin']], ['time_save', ['08:00', '14:00', '20:00']], ['mention'], ['role', ['201']], ['everyone'], ['no_role'], ['everyone'], ['edit'], ['review'], ['save'], ['server_pause']]) {
    assert.deepEqual(await apps[0].handle(input(action, values)), await apps[1].handle(input(action, values)), action);
  }
});

test('daily schedules deliver 0/1/2/3 posts with seasonal substitution and no unrelated content', async t => {
  for (const count of [0, 1, 2, 3]) {
    const h = fixture(t); const p = preferences({ dailyCount: count, times: serverTimesForCount(count) }); h.store.setServer('10', p);
    const events = serverEvents(p, start).filter(e => e.day === '2026-09-25'); assert.equal(events.length, count);
    for (const event of events) {
      h.clock(event.at); await Promise.all([h.scheduler.tick(), h.scheduler.tick()]); await h.scheduler.tick();
    }
    assert.equal(h.sent.length, count); assert.deepEqual(h.errors, []);
    if (count) assert.equal(new Set(events.map(event => serverCardForEvent(event).id)).size, count);
  }
  const campaign = seasonalYearEvents(1448)[0], now = campaign.at;
  for (const count of [0, 1, 2, 3]) {
    const p = preferences({ dailyCount: count, times: serverTimesForCount(count) });
    const events = serverEvents(p, now, [campaign]).filter(e => e.day === new Date(now).toISOString().slice(0, 10));
    assert.equal(events.length, Math.max(1, count)); assert.equal(events[0].kind, 'seasonal');
    assert.equal(events.filter(e => e.kind === 'daily').length, Math.max(0, count - 1));
    assert.match(serverPostPayload(events[0]).content, /الموعد المتوقع في السعودية/);
  }
  for (const card of SERVER_GENERAL_CARDS) {
    const original = PUBLIC_POSTS.find(item => card.id === item.id);
    assert.equal(card.source, original.source);
    assert.equal(card.body, original.body);
    assert.notEqual(original.id, 'majlis');
  }
});

test('civil-time scheduling handles DST, half-hour offsets, and local date boundaries', () => {
  const p = preferences({ times: ['02:30'], timezone: 'Europe/Berlin' });
  assert.equal(serverEvents(p, Date.parse('2026-03-29T12:00:00Z'), []).filter(e => e.day === '2026-03-29').length, 0);
  assert.equal(serverEvents(p, Date.parse('2026-10-25T12:00:00Z'), []).find(e => e.day === '2026-10-25').at, Date.parse('2026-10-25T00:30:00Z'));
  assert.equal(serverEvents({ ...p, times: ['00:05'], timezone: 'Asia/Kolkata' }, start, []).find(e => e.day === '2026-09-25').at, Date.parse('2026-09-24T18:35:00Z'));
  assert.equal(serverEvents({ ...p, times: ['20:00'], timezone: 'America/Los_Angeles' }, start, []).find(e => e.day === '2026-09-24').at, Date.parse('2026-09-25T03:00:00Z'));
});

test('downtime, activation, stopping, or removing the bot never cause catch-up posts', async t => {
  const h = fixture(t), p = preferences(); h.store.setServer('10', p);
  const event = serverEvents(p, start).find(e => e.day === '2026-09-25');
  h.clock(event.at + 120001); await h.scheduler.tick(); assert.equal(h.sent.length, 0);
  h.store.setServer('10', { ...p, activatedAt: event.at + 1 }); h.clock(event.at + 1000); await h.scheduler.tick(); assert.equal(h.sent.length, 0);
  h.store.setServer('10', p); await Promise.all([h.act('server_pause'), h.scheduler.tick()]); assert.equal(h.sent.length, 0);
  h.store.setServer('10', p); h.store.removeGuild('10'); await h.scheduler.tick(); assert.equal(h.sent.length, 0);
  assert.deepEqual(h.store.postingGuilds(), []);
});

test('changing times, roles, channels or zones cannot repeat a slot or exceed three attempts in 24 hours', t => {
  const h = fixture(t), p = preferences({ dailyCount: 3, times: ['08:00', '14:00', '20:00'] }); h.store.setServer('10', p);
  const events = serverEvents(p, start, []).filter(e => e.day === '2026-09-25');
  for (const event of events) assert.ok(h.store.claimServer('10', p, event, event.at));
  const changed = { ...p, roleId: '201', channelId: '102', timezone: 'Asia/Dubai', times: ['01:00', '07:00', '13:00'] }; h.store.setServer('10', changed);
  const fourth = { kind: 'daily', id: 'daily:2026-09-26:0', day: '2026-09-26', slot: 0, at: events[2].at + 4 * 3600000 };
  assert.equal(h.store.claimServer('10', changed, fourth, fourth.at), null);
  assert.equal(h.store.claimServer('10', changed, { ...events[0], at: events[2].at + 7200000 }, events[2].at + 7200000), null);
  const everyone = {...changed,roleId:null,mentionEveryone:true}; h.store.setServer('10',everyone);
  assert.equal(h.store.claimServer('10', everyone, fourth, fourth.at), null, 'Everyone does not reset the daily budget');
});

test('scheduled everyone posts carry the saved choice and changing it never repeats a message', async t => {
  const h = fixture(t), p = preferences({mentionEveryone:true}); h.store.setServer('10',p);
  const event = serverEvents(p,start).find(e=>e.day==='2026-09-25');
  h.clock(event.at); await h.scheduler.tick();
  assert.equal(h.sent.length,1);
  assert.match(h.sent[0][2].content,/^@everyone\n/);
  assert.deepEqual(h.sent[0][2].allowed_mentions.parse,['everyone']);
  h.store.setServer('10',{...p,mentionEveryone:false,roleId:'201'});
  await h.scheduler.tick(); assert.equal(h.sent.length,1);
});

test('ambiguous sends are not retried; lost permissions pause postings while other servers continue', async t => {
  for (const code of ['ETIMEDOUT', 50013]) {
    const h = fixture(t), p = preferences(); h.store.setServer('10', p); h.store.setServer('20', p);
    let tries = 0;
    h.scheduler.send = async guildId => { if (guildId === '10') { tries++; throw Object.assign(new Error('Synthetic send failure'), { code }); } h.sent.push(guildId); };
    h.clock(serverEvents(p, start).find(e => e.day === '2026-09-25').at);
    await h.scheduler.tick(); await h.scheduler.tick();
    assert.equal(tries, 1); assert.deepEqual(h.sent, ['20']);
    assert.equal(h.store.getServer('10').enabled, code !== 50013);
    assert.equal(h.store.getServer('10').issue, code === 50013 ? 'permissions' : 'delivery');
  }
});

test('removing the bot during an in-flight failed send does not recreate server data', async t => {
  const h = fixture(t), p = preferences(); h.store.setServer('10', p);
  h.scheduler.send = async () => { h.store.removeGuild('10'); throw Object.assign(new Error('Guild removed during send'), { code: 50013 }); };
  h.clock(serverEvents(p, start).find(e => e.day === '2026-09-25').at);
  await h.scheduler.tick();
  assert.deepEqual(h.store.postingGuilds(), []);
  assert.equal(h.store.db.prepare('SELECT count(*) AS n FROM server_attempts').get().n, 0);
});

test('a seasonal campaign is sent at most once despite date corrections and unrelated daily changes', t => {
  const h = fixture(t), campaign = seasonalYearEvents(1448)[0];
  const p = preferences({ dailyCount: 0, times: ['12:00'], activatedAt: campaign.at - DAY });
  h.store.setServer('10', p);
  const event = serverEvents(p, campaign.at, [campaign]).find(e => e.kind === 'seasonal');
  assert.ok(h.store.claimServer('10', p, event, event.at));
  const next = { ...p, dailyCount: 3, times: ['12:00', '16:00', '20:00'] }; h.store.setServer('10', next);
  const moved = { ...campaign, at: campaign.at + DAY };
  const corrected = serverEvents(next, moved.at, [moved]).find(e => e.kind === 'seasonal');
  assert.equal(h.store.claimServer('10', next, corrected, corrected.at), null);
  assert.equal(h.store.claimServer('10', next, { ...event, kind: 'daily', id: `daily:${event.day}:0`, at: event.at + 2 * 3600000 }, event.at + 2 * 3600000), null);
  h.store.prune(event.at + 399 * DAY); assert.equal(h.store.db.prepare('SELECT count(*) AS n FROM server_attempts').get().n, 1);
  h.store.prune(event.at + 400 * DAY); assert.equal(h.store.db.prepare('SELECT count(*) AS n FROM server_attempts').get().n, 0);
});

function fakeClient() {
  const calls = [], me = { id: '900' }, member = { id: '1', permissions: new PermissionsBitField([P.ManageGuild]) };
  const botPermissions = new PermissionsBitField([P.ViewChannel, P.SendMessages]);
  const memberPermissions = new PermissionsBitField([P.ViewChannel, P.SendMessages]);
  const channel = { id: '101', guildId: '10', type: 0, permissionsFor: who => who === me ? botPermissions : memberPermissions, send: async value => { calls.push(value); return { id: '1001' }; } };
  const role = { id: '201', guild: { id: '10' }, managed: false, mentionable: true };
  const guild = { available: true, channels: { fetch: async id => id === channel.id ? channel : null }, roles: { fetch: async id => id === role.id ? role : null }, members: { fetchMe: async () => me, fetch: async () => member } };
  return { client: { guilds: { cache: new Map([['10', guild]]) } }, channel, role, member, botPermissions, memberPermissions, calls };
}
test('permissions are rechecked and only the explicitly selected role can be mentioned', async t => {
  const f = fakeClient(), p = preferences({ roleId: '201' }), ctx = { guildId: '10', userId: '1', preferences: p };
  assert.equal(await resolveServerTarget(f.client, ctx), f.channel);
  f.channel.guildId = '20'; await assert.rejects(resolveServerTarget(f.client, ctx), /نصية/); f.channel.guildId = '10';
  f.channel.type = 2; await assert.rejects(resolveServerTarget(f.client, ctx), /نصية/); f.channel.type = 0;
  f.role.guild.id = '20'; await assert.rejects(resolveServerTarget(f.client, ctx), /رتبة/); f.role.guild.id = '10';
  f.role.mentionable = false; await assert.rejects(resolveServerTarget(f.client, ctx), /قابلة/);
  f.botPermissions.add(P.MentionEveryone); assert.equal(await resolveServerTarget(f.client, ctx), f.channel);
  f.member.permissions.remove(P.ManageGuild); await assert.rejects(resolveServerTarget(f.client, ctx), /إدارة السيرفر/); f.member.permissions.add(P.ManageGuild);
  f.memberPermissions.remove(P.ViewChannel); await assert.rejects(resolveServerTarget(f.client, ctx), /إدارة السيرفر/); f.memberPermissions.add(P.ViewChannel);
  const payload = serverPostPayload({ kind: 'daily', day: '2026-09-25', slot: 0 }, '201');
  const client = new Client({ intents: [] }); t.after(() => client.destroy());
  const body = MessagePayload.create({ client }, toServerDiscord(payload, '201')).resolveBody().body;
  assert.deepEqual(body.allowed_mentions, { parse: [], roles: ['201'], users: [], replied_user: false });
  assert.equal(body.flags, 0); assert.match(body.content, /^<@&201>/);
  assert.deepEqual(toDiscord(payload).allowedMentions, { parse: [], repliedUser: false });
  const review = serverReviewPayload(p, token, { kind: 'daily', day: '2026-09-25', slot: 0 });
  assert.deepEqual(toDiscord(review).allowedMentions.parse, []);
  await makeSendServer(f.client)('10', p, payload, 'public:sample');
  assert.equal(f.calls[0].enforceNonce, true); assert.ok(f.calls[0].nonce.length <= 25);
  f.botPermissions.remove(P.SendMessages);
  await assert.rejects(makeSendServer(f.client)('10', p, payload, 'public:next'), /إرسال/); assert.equal(f.calls.length, 1);
  assert.match(await makeCheckServerTarget(f.client)(ctx), /إرسال/);
});

test('everyone delivery requires current permissions and allows no role, user or here pings', async t => {
  const f = fakeClient(), p = preferences({mentionEveryone:true}), ctx = {guildId:'10',userId:'1',preferences:p};
  await assert.rejects(resolveServerTarget(f.client,ctx), /لا يملك رفيق/);
  f.botPermissions.add(P.MentionEveryone);
  await assert.rejects(resolveServerTarget(f.client,ctx), /تحتاج أنت أيضًا/);
  f.memberPermissions.add(P.MentionEveryone);
  assert.equal(await resolveServerTarget(f.client,ctx),f.channel);
  const client = new Client({intents:[]}); t.after(()=>client.destroy());
  const events = [{kind:'daily',day:'2026-09-25',slot:0},...seasonalYearEvents(1448).map(campaign=>({kind:'seasonal',campaign}))];
  for (const event of events) {
    const payload = serverPostPayload(event,null,true);
    const body = MessagePayload.create({client},toServerDiscord(payload,null,true)).resolveBody().body;
    assert.deepEqual(body.allowed_mentions,{parse:['everyone'],roles:[],users:[],replied_user:false});
    assert.match(body.content,/^@everyone\n/);
    assert.deepEqual(toDiscord(payload).allowedMentions,{parse:[],repliedUser:false});
    assert.deepEqual(toServerDiscord(payload).allowedMentions.parse,[], 'Text alone cannot enable everyone');
    assert.throws(()=>toServerDiscord({...payload,content:payload.content+' @here'},null,true), /everyone post/);
    assert.throws(()=>toServerDiscord({...payload,content:payload.content+' @everyone'},null,true), /everyone post/);
  }
  const payload = serverPostPayload(events[0],null,true);
  assert.throws(()=>serverPostPayload(events[0],'201',true), /mention/);
  assert.throws(()=>toServerDiscord(payload,'201',true), /mention/);
  await makeSendServer(f.client)('10',p,payload,'public:everyone');
  assert.equal(f.calls.length,1);
  assert.deepEqual(f.calls[0].allowedMentions,{parse:['everyone'],roles:[],users:[],repliedUser:false});
  f.botPermissions.remove(P.MentionEveryone);
  await assert.rejects(makeSendServer(f.client)('10',p,payload,'public:next'), /لا يملك رفيق/);
  assert.equal(f.calls.length,1);
});

test('server settings and reservations are encrypted, migrate from v7, and survive restart', t => {
  const dir = mkdtempSync(join(tmpdir(), 'rafiq-server-')), file = join(dir, 'state.enc'), encryptionKey = randomBytes(32).toString('hex');
  const opened = [], open = () => { const store = new Store(file, { encryptionKey }); opened.push(store); return store; };
  t.after(() => { opened.forEach(s => s.close()); readdirSync(dir).forEach(name => rmSync(join(dir, name))); rmdirSync(dir); });
  let s = open(); s.subscribe('1', '10'); s.updateUser('1', { seasonalAt: start, delivery: 'silent', frequency: 'session5' }); s.toggleFavorite('1', 'majlis'); s.setPanel('10', '101', '1001'); s.close();
  const snap = new EncryptedSnapshot(file, encryptionKey), legacy = snap.read();
  legacy.version = 7; delete legacy.tables.server_settings; delete legacy.tables.server_attempts; snap.write(legacy); snap.close();
  const before = readFileSync(file); s = open(); assert.deepEqual(readFileSync(file), before); assert.deepEqual(s.postingGuilds(), []); s.persist();
  const saved = s.snapshot.read(); assert.equal(saved.version, 8);
  for (const [table, rows] of Object.entries(legacy.tables)) assert.deepEqual(saved.tables[table], rows);
  const p = preferences({ roleId: '234567890123456789' }), event = serverEvents(p, start).find(e => e.day === '2026-09-25'); s.setServer('10', p);
  const write = s.snapshot.write; s.snapshot.write = () => { throw new Error('disk failed'); };
  assert.throws(() => s.claimServer('10', p, event, event.at), /disk failed/); s.snapshot.write = write;
  assert.ok(s.claimServer('10', p, event, event.at)); s.close(); s = open();
  assert.deepEqual(s.getServer('10'), p); assert.equal(s.claimServer('10', p, event, event.at), null);
  assert.equal(readFileSync(file).includes(Buffer.from(p.roleId)), false);
  const oldPreview = s.snapshot.read();
  const oldSettings = JSON.parse(oldPreview.tables.server_settings[0][1]); delete oldSettings.mentionEveryone;
  oldPreview.tables.server_settings[0][1] = JSON.stringify(oldSettings); s.close();
  const oldSnap = new EncryptedSnapshot(file,encryptionKey); oldSnap.write(oldPreview); oldSnap.close();
  s = open(); assert.deepEqual(s.getServer('10'),p, 'Role-only previews retain the old choice without enabling everyone');
  const everyone = {...p,roleId:null,mentionEveryone:true}; s.setServer('10',everyone); s.close(); s = open();
  assert.deepEqual(s.getServer('10'),everyone, 'The explicit everyone choice survives restart');
  assert.equal(s.claimServer('10',everyone,event,event.at),null, 'Changing mention type keeps previous reservations');
  s.forget('1'); assert.equal(s.getServer('10').enabled, true);
  s.reconcileGuilds([]); assert.deepEqual(s.postingGuilds(), []); assert.equal(s.db.prepare('SELECT count(*) AS n FROM server_attempts').get().n, 0);
});
