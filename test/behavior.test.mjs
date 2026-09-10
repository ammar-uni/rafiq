import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, DAY, MINUTE } from '../src/store.mjs';
import { SerialQueue } from '../src/serial.mjs';
import { ReminderEngine, LEAVE_GRACE } from '../src/reminders.mjs';
import { RafiqApp } from '../src/app.mjs';
import { FLAGS } from '../src/messages.mjs';

function harness(t, send) {
  let clock = 1_800_000_000_000;
  let online = true;
  const store = new Store(':memory:');
  t.after(() => store.close());
  const queue = new SerialQueue();
  const sent = [];
  const sendDM = send || (async (userId, payload, nonce) => sent.push({ userId, payload, nonce }));
  const engine = new ReminderEngine({ store, queue, sendDM, now: () => clock, canSend: () => online });
  const app = new RafiqApp({ store, queue, sendDM, now: () => clock, cancelUser: userId => engine.cancelUser(userId), cancelGuild: (userId, guildId) => engine.discard(userId, guildId) });
  const act = (action, values = [], userId = '1', guildId = '10') => app.handle({ userId, guildId, action, values });
  const enter = (options = {}) => engine.join({ userId: '1', guildId: '10', channelId: '100', hasCompany: true, ...options });
  const leave = (options = {}) => engine.leave({ userId: '1', guildId: '10', ...options });
  return { store, queue, engine, app, sent, act, enter, leave, now: () => clock, advance: ms => { clock += ms; }, offline: () => { online = false; }, online: () => { online = true; } };
}

test('browsing creates no user record and preferences never subscribe implicitly', async t => {
  const h = harness(t);
  await h.act('home'); await h.act('library'); await h.act('idea');
  assert.equal(h.store.db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
  await h.act('delivery', ['normal']);
  assert.equal(h.store.getUser('1').enabled, false);
  assert.deepEqual(h.store.subscriptions('1'), []);
  await h.act('enable', [], '1', null);
  assert.equal(h.store.getUser('1').enabled, false);
});

test('unsubscribed, solo and short sessions never notify', async t => {
  const h = harness(t);
  h.enter(); h.advance(10 * MINUTE); h.leave(); h.advance(LEAVE_GRACE); await h.engine.tick();
  await h.act('enable');
  h.enter({ hasCompany: false }); h.advance(10 * MINUTE); h.leave(); h.advance(LEAVE_GRACE); await h.engine.tick();
  h.enter(); h.advance(MINUTE); h.leave(); h.advance(LEAVE_GRACE); await h.engine.tick();
  assert.equal(h.sent.length, 0);
});

test('unsubscribing one server cancels its pending farewell but preserves other servers and a timer', async t => {
  const h = harness(t);
  await h.act('enable'); await h.act('enable', [], '1', '20');
  await h.act('break_30'); const deadline = h.store.getUser('1').breakAt;
  h.enter(); h.advance(5 * MINUTE); h.leave();
  assert.equal(h.engine.pending.size, 1);
  await h.act('unsubscribe_here');
  assert.equal(h.engine.pending.size, 0);
  assert.deepEqual(h.store.subscriptions('1'), ['20']);
  assert.equal(h.store.getUser('1').enabled, true);
  assert.equal(h.store.getUser('1').breakAt, deadline);
  // Re-enabling before the old deadline must not resurrect that farewell.
  await h.act('enable'); h.advance(LEAVE_GRACE); await h.engine.tick();
  assert.equal(h.sent.length, 0);
  await h.act('unsubscribe_here'); await h.act('unsubscribe_here', [], '1', '20');
  assert.equal(h.store.getUser('1').enabled, false);
  h.advance(30 * MINUTE - (5 * MINUTE + LEAVE_GRACE)); await h.engine.tick();
  assert.equal(h.sent.length, 1);
  assert.match(JSON.stringify(h.sent[0].payload), /حان وقت الاستراحة/);
});

test('server opt-out from a DM does not change subscriptions; only a guild view offers it', async t => {
  const h = harness(t); await h.act('enable');
  assert.match(JSON.stringify(await h.act('settings')), /unsubscribe_here/);
  assert.doesNotMatch(JSON.stringify(await h.act('settings', [], '1', null)), /unsubscribe_here/);
  await h.act('unsubscribe_here', [], '1', null);
  assert.deepEqual(h.store.subscriptions('1'), ['10']);
});

test('extending a timer cancels its old delivery deadline and emits exactly once at the new one', async t => {
  const h = harness(t); await h.act('break_15');
  h.advance(10 * MINUTE); await h.act('break_extend_15');
  h.advance(5 * MINUTE); await h.engine.tick(); assert.equal(h.sent.length, 0);
  h.advance(15 * MINUTE); await h.engine.tick(); await h.engine.tick();
  assert.equal(h.sent.length, 1);
  assert.equal(h.store.getUser('1').breakAt, null);
  assert.match(JSON.stringify(h.sent[0].payload), /ذكّرني بعد ١٥ دقيقة/);
});

test('an existing subscriber can opt in from a second server without disabling the first', async t => {
  const h = harness(t);
  await h.act('enable');
  const home = await h.act('home', [], '1', '20');
  const settings = await h.act('settings', [], '1', '20');
  assert.match(JSON.stringify(home), /فعّل تذكير المجلس/);
  assert.match(JSON.stringify(settings), /فعّل في هذا السيرفر/);
  assert.equal(h.store.isSubscribed('1', '20'), false);
  await h.act('enable', [], '1', '20');
  assert.equal(h.store.isSubscribed('1', '10'), true);
  assert.equal(h.store.isSubscribed('1', '20'), true);
});

test('a shared session delivers one silent DM after the grace period', async t => {
  const h = harness(t);
  await h.act('enable'); h.enter(); h.advance(5 * MINUTE); h.leave();
  h.advance(LEAVE_GRACE - 1); await h.engine.tick(); assert.equal(h.sent.length, 0);
  h.advance(1); await Promise.all([h.engine.tick(), h.engine.tick()]);
  assert.equal(h.sent.length, 1);
  assert.ok(h.sent[0].payload.flags & FLAGS.silent);
  assert.ok(!(h.sent[0].payload.flags & FLAGS.ephemeral));
  assert.deepEqual(h.sent[0].payload.allowed_mentions.parse, []);
});

test('channel moves, mute-like repeated joins and reconnects preserve one session', async t => {
  const h = harness(t);
  await h.act('enable'); h.enter(); h.advance(3 * MINUTE);
  h.enter({ channelId: '101', hasCompany: false }); h.advance(2 * MINUTE); h.leave();
  h.advance(20_000); h.enter({ channelId: '101', hasCompany: false });
  h.advance(LEAVE_GRACE); await h.engine.tick(); assert.equal(h.sent.length, 0);
  h.leave(); h.advance(LEAVE_GRACE); await h.engine.tick(); assert.equal(h.sent.length, 1);
});

test('an initially solo member becomes eligible when company joins', async t => {
  const h = harness(t);
  await h.act('enable'); h.enter({ hasCompany: false });
  h.engine.markCompany('10', '100'); h.advance(5 * MINUTE); h.leave(); h.advance(LEAVE_GRACE);
  await h.engine.tick(); assert.equal(h.sent.length, 1);
});

test('joining another server cancels a pending reminder even without a subscription there', async t => {
  const h = harness(t);
  await h.act('enable'); h.enter(); h.advance(5 * MINUTE); h.leave();
  h.enter({ guildId: '20', channelId: '200' }); h.advance(LEAVE_GRACE);
  await h.engine.tick(); assert.equal(h.sent.length, 0);
});

test('daily and session limits apply across all subscribed servers and count failed attempts', t => {
  const h = harness(t);
  h.store.subscribe('1', '10'); h.store.subscribe('1', '20');
  assert.ok(h.store.claimReminder('1', '10', h.now()));
  assert.equal(h.store.claimReminder('1', '20', h.now()), null);
  h.advance(DAY - 1); assert.equal(h.store.claimReminder('1', '20', h.now()), null);
  h.advance(1); assert.ok(h.store.claimReminder('1', '20', h.now()));
  h.store.updateUser('1', { frequency: 'session' });
  h.advance(120 * MINUTE); assert.ok(h.store.claimReminder('1', '10', h.now()));
  h.advance(120 * MINUTE); assert.ok(h.store.claimReminder('1', '20', h.now()));
  h.advance(120 * MINUTE); assert.equal(h.store.claimReminder('1', '10', h.now()), null);
});

test('pause, disable and deletion cancel pending reminders and one-shot timers', async t => {
  const h = harness(t);
  for (const action of ['pause_today', 'disable', 'forget_confirm']) {
    await h.act('enable'); await h.act('break_15'); h.enter(); h.advance(5 * MINUTE); h.leave();
    await h.act(action); h.advance(20 * MINUTE); await h.engine.tick();
    assert.equal(h.sent.length, 0); assert.equal(h.store.getUser('1').breakAt, null);
  }
  assert.equal(h.store.db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
  assert.equal(h.store.db.prepare('SELECT count(*) AS n FROM subscriptions').get().n, 0);
});

test('pause lasts exactly 24 hours and saving settings does not re-enable a disabled user', async t => {
  const h = harness(t);
  await h.act('enable'); await h.act('pause_today'); h.advance(DAY - 1);
  assert.equal(h.app.state('1').paused, true); h.advance(1); assert.equal(h.app.state('1').paused, false);
  await h.act('disable'); await h.act('frequency', ['session']); await h.act('resume');
  assert.equal(h.store.getUser('1').enabled, false);
});

test('closed DMs suspend attempts without a public fallback', async t => {
  let attempts = 0;
  const h = harness(t, async () => { attempts++; throw Object.assign(new Error('DM blocked'), { code: 50007 }); });
  await h.act('enable'); h.enter(); h.advance(5 * MINUTE); h.leave(); h.advance(LEAVE_GRACE); await h.engine.tick();
  assert.equal(h.store.getUser('1').dmBlocked, true);
  h.advance(DAY); h.enter(); h.advance(5 * MINUTE); h.leave(); h.advance(LEAVE_GRACE); await h.engine.tick();
  assert.equal(attempts, 1);
});

test('ambiguous send failure reserves the cooldown and does not retry', async t => {
  let attempts = 0;
  const h = harness(t, async () => { attempts++; throw new Error('timeout'); });
  await h.act('enable'); h.enter(); h.advance(5 * MINUTE); h.leave(); h.advance(LEAVE_GRACE); await h.engine.tick();
  h.enter(); h.advance(5 * MINUTE); h.leave(); h.advance(LEAVE_GRACE); await h.engine.tick();
  assert.equal(attempts, 1);
});

test('re-enabling a blocked DM subscription explains suspension until a successful explicit test', async t => {
  const h = harness(t);
  h.store.updateUser('1', { dmBlocked: true });
  const response = await h.act('enable');
  assert.match(JSON.stringify(response), /الإرسال معلّق/);
  assert.equal(h.store.getUser('1').dmBlocked, true);
  await h.act('test_dm');
  assert.equal(h.store.getUser('1').dmBlocked, false);
});

test('a gateway observation of a user still in voice suppresses the farewell', async t => {
  const h = harness(t);
  await h.act('enable'); h.enter(); h.advance(5 * MINUTE); h.leave(); h.advance(LEAVE_GRACE);
  h.engine.isInVoice = () => true;
  await h.engine.tick();
  assert.equal(h.sent.length, 0);
});

test('timer replacement sends once and expired downtime timers are discarded', async t => {
  const h = harness(t);
  await h.act('break_15'); await h.act('break_30');
  h.advance(15 * MINUTE); await h.engine.tick(); assert.equal(h.sent.length, 0);
  h.advance(15 * MINUTE); await h.engine.tick(); await h.engine.tick(); assert.equal(h.sent.length, 1);
  await h.act('break_15'); h.advance(21 * MINUTE); await h.engine.tick(); assert.equal(h.sent.length, 1);
  assert.equal(h.store.getUser('1').enabled, false);
});

test('offline gateway and discarded voice sessions cannot emit stale farewells', async t => {
  const h = harness(t);
  await h.act('enable'); h.enter(); h.advance(5 * MINUTE); h.leave(); h.advance(LEAVE_GRACE);
  h.offline(); await h.engine.tick(); assert.equal(h.sent.length, 0);
  h.engine.clearVoice(); h.online(); await h.engine.tick(); assert.equal(h.sent.length, 0);
});

test('favorites and selection changes belong only to the acting user', async t => {
  const h = harness(t);
  await h.act('favorite_guidance'); await h.act('frequency', ['session']);
  assert.deepEqual(h.store.favorites('1'), ['guidance']); assert.deepEqual(h.store.favorites('2'), []);
  assert.equal(h.store.getUser('2').frequency, 'daily');
  await h.act('frequency', ['injected']); assert.equal(h.store.getUser('1').frequency, 'session');
  await h.act('favorite_guidance'); assert.deepEqual(h.store.favorites('1'), []);
});

test('DM test is explicitly requested, rate-limited and does not enable reminders', async t => {
  const h = harness(t);
  await h.act('test_dm'); await h.act('test_dm');
  assert.equal(h.sent.length, 1); assert.equal(h.store.getUser('1').enabled, false);
  h.advance(MINUTE); await h.act('test_dm'); assert.equal(h.sent.length, 2);
});

test('queued opt-out prevents a subsequent queued send', async t => {
  const h = harness(t);
  await h.act('enable'); h.enter(); h.advance(5 * MINUTE); h.leave(); h.advance(LEAVE_GRACE);
  let release;
  const blocker = h.queue.run('1', () => new Promise(resolve => { release = resolve; }));
  await Promise.resolve();
  const disable = h.act('disable'); const tick = h.engine.tick();
  release(); await Promise.all([blocker, disable, tick]);
  assert.equal(h.sent.length, 0);
});

test('preferences, subscriptions, timers, favorites and rate limits survive reopening encrypted storage', () => {
  const folder = mkdtempSync(join(tmpdir(), 'rafiq-test-'));
  const filename = join(folder, 'state.enc');
  const encryptionKey = 'ab'.repeat(32);
  let store;
  try {
    store = new Store(filename, { encryptionKey });
    store.subscribe('1', '10'); store.updateUser('1', { delivery: 'normal', breakAt: 1_800_000_900_000 });
    store.toggleFavorite('1', 'hawqala'); store.claimReminder('1', '10', 1_800_000_000_000);
    store.close(); store = new Store(filename, { encryptionKey });
    assert.equal(store.getUser('1').delivery, 'normal'); assert.equal(store.getUser('1').breakAt, 1_800_000_900_000);
    assert.deepEqual(store.favorites('1'), ['hawqala']); assert.equal(store.isSubscribed('1', '10'), true);
    assert.equal(store.claimReminder('1', '10', 1_800_000_000_001), null);
    store.forget('1');
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM reminder_attempts').get().n, 0);
  } finally {
    store?.close();
    for (const suffix of ['', '.guard', '-wal', '-shm']) rmSync(filename + suffix, { force: true });
    rmdirSync(folder);
  }
});
