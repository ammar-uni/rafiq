import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection } from 'discord.js';
import { FeedbackRetention, FEEDBACK_RETENTION_MS } from '../src/feedback-retention.mjs';
import { feedbackReviewMessage } from '../src/feedback.mjs';

const NOW = Date.UTC(2026, 8, 30, 12);
const BOT = '123456789012345678', CHANNEL = '223456789012345678', GUILD = '323456789012345678';
const idAt = (at, sequence = 0) => ((BigInt(at - 1_420_070_400_000) << 22n) + BigInt(sequence)).toString();
function message(at, overrides = {}) {
  return { id: idAt(at), channelId: CHANNEL, guildId: GUILD, author: { id: BOT }, type: 0,
    content: feedbackReviewMessage({ ticket: 'a'.repeat(24), kind: 'report', body: 'ملاحظة اختبار الحذف', reporter: { id: '9', username: 'test_sender' } }).content,
    ...overrides };
}
function fixture(items = [], options = {}) {
  let clock = NOW, connected = true;
  const records = new Map(items.map(item => [item.id, item])), deleted = [], queries = [], errors = [], results = [];
  const channel = { id: CHANNEL, guildId: GUILD, messages: {
    fetch: async query => {
      queries.push(query);
      assert.equal(query.cache, false);
      return new Collection([...records.values()].filter(item => BigInt(item.id) < BigInt(query.before))
        .sort((a, b) => BigInt(a.id) > BigInt(b.id) ? -1 : 1).slice(0, query.limit).map(item => [item.id, item]));
    },
    delete: async id => { deleted.push(id); records.delete(id); }
  } };
  const app = new FeedbackRetention({ resolveChannel: async () => channel, botId: () => BOT,
    now: () => clock, canRun: () => connected, onError: error => errors.push(error.code), onResult: result => results.push(result), ...options });
  return { app, records, deleted, queries, errors, results, channel, advance: ms => { clock += ms; }, connect: value => { connected = value; } };
}

test('only old bot feedback is deleted, including legacy anonymous feedback and pinned feedback', async () => {
  const cutoff = NOW - FEEDBACK_RETENTION_MS;
  const old = message(cutoff - 100), legacy = message(cutoff - 200, { content: message(cutoff - 200).content.replace(/المرسل:.*\nمعرّف الحساب:.*\n/, ''), pinned: true });
  const boundary = message(cutoff), recent = message(NOW - 1000);
  const unrelated = message(cutoff - 300, { content: 'تعليمات قناة المراجعة' });
  const otherAuthor = message(cutoff - 400, { author: { id: 'another-bot' } });
  const webhook = message(cutoff - 500, { webhookId: 'webhook' });
  const f = fixture([old, legacy, boundary, recent, unrelated, otherAuthor, webhook]);
  assert.deepEqual(await f.app.tick(), { ok: true, deleted: 2, inspected: 5, complete: true });
  assert.deepEqual(f.deleted, [old.id, legacy.id]);
  for (const item of [boundary, recent, unrelated, otherAuthor, webhook]) assert.ok(f.records.has(item.id));
  assert.equal(f.app.before, null);
  assert.ok(!JSON.stringify(f.results).includes('test_sender'));
  assert.ok(!JSON.stringify(f.results).includes(old.content));
  await f.app.tick(); assert.equal(f.queries.length, 1);
  f.advance(3_600_000); await f.app.tick(); assert.ok(f.deleted.includes(boundary.id));
});

test('the published ninety-day period is enforced at the actual calendar boundary', async () => {
  const expired = message(Date.UTC(2026, 6, 2, 11, 59, 59));
  const boundary = message(Date.UTC(2026, 6, 2, 12));
  const newer = message(Date.UTC(2026, 6, 2, 12, 0, 1));
  const f = fixture([expired, boundary, newer]);
  await f.app.tick();
  assert.deepEqual(f.deleted, [expired.id]);
  assert.equal(f.records.size, 2);
});

test('bounded pagination progresses past unrelated messages and catches all expired reports', async () => {
  const cutoff = NOW - FEEDBACK_RETENTION_MS;
  const items = Array.from({ length: 145 }, (_, i) => message(cutoff - 1000 - i, i < 105 ? { content: 'قواعد القناة' } : {}));
  const f = fixture(items);
  assert.deepEqual(await f.app.tick(), { ok: true, deleted: 0, inspected: 100, complete: false });
  f.advance(60_000);
  assert.deepEqual(await f.app.tick(), { ok: true, deleted: 20, inspected: 25, complete: false });
  f.advance(60_000);
  assert.deepEqual(await f.app.tick(), { ok: true, deleted: 20, inspected: 20, complete: true });
  assert.equal(f.deleted.length, 40);
  assert.equal(f.records.size, 105);
});

test('failed deletes are retried without skipping the failed message, and missing messages are harmless', async () => {
  const cutoff = NOW - FEEDBACK_RETENTION_MS;
  const items = [message(cutoff - 100), message(cutoff - 200), message(cutoff - 300)];
  const f = fixture(items); let calls = 0;
  const remove = f.channel.messages.delete;
  f.channel.messages.delete = async id => {
    calls++;
    if (calls === 2) throw Object.assign(new Error('private report content'), { code: 50013 });
    if (id === items[2].id) { f.records.delete(id); throw Object.assign(new Error('gone'), { code: 10008 }); }
    await remove(id);
  };
  assert.deepEqual(await f.app.tick(), { ok: false });
  assert.deepEqual(f.deleted, [items[0].id]);
  assert.equal(f.app.before, items[0].id);
  f.advance(60_000);
  assert.deepEqual(await f.app.tick(), { ok: true, deleted: 1, inspected: 2, complete: true });
  assert.equal(f.records.size, 0);
  assert.deepEqual(f.errors, [50013]);
});

test('disabled, disconnected and overlapping sweeps do not make duplicate requests', async () => {
  assert.equal(await new FeedbackRetention().tick(), null);
  const f = fixture([message(NOW - FEEDBACK_RETENTION_MS - 100)]);
  f.connect(false); assert.equal(await f.app.tick(), null); assert.equal(f.queries.length, 0);
  f.connect(true);
  let release;
  const fetch = f.channel.messages.fetch;
  f.channel.messages.fetch = async query => { await new Promise(resolve => { release = resolve; }); return fetch(query); };
  const first = f.app.tick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await f.app.tick(), null);
  release(); await first; await f.app.drain();
  assert.equal(f.deleted.length, 1);
  assert.equal(f.queries.length, 1);
});

test('shutdown and time budgets stop a batch, while a fresh process recovers remaining work', async () => {
  const items = Array.from({ length: 3 }, (_, i) => message(NOW - FEEDBACK_RETENTION_MS - 100 - i));
  const f = fixture(items), remove = f.channel.messages.delete;
  f.channel.messages.delete = async id => { await remove(id); f.connect(false); };
  await f.app.tick(); assert.equal(f.deleted.length, 1);
  const restarted = fixture([...f.records.values()]);
  restarted.channel.messages.delete = async id => { restarted.deleted.push(id); restarted.records.delete(id); restarted.advance(15_000); };
  await restarted.app.tick(); assert.equal(restarted.deleted.length, 1);
  restarted.advance(60_000); await restarted.app.tick(); assert.equal(restarted.records.size, 0);
});

test('malformed or wrong-channel pages fail closed before any deletion', async () => {
  for (const override of [{ id: 'invalid' }, { channelId: 'other' }, { guildId: 'other' }, { id: idAt(NOW) }]) {
    const f = fixture();
    const item = message(NOW - FEEDBACK_RETENTION_MS - 100, override);
    f.channel.messages.fetch = async () => new Collection([[item.id, item]]);
    assert.deepEqual(await f.app.tick(), { ok: false });
    assert.equal(f.deleted.length, 0);
    assert.deepEqual(f.errors, ['RAF_RETENTION_PAGE']);
  }
});
