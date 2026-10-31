import test from 'node:test';
import assert from 'node:assert/strict';
import { Routes } from 'discord.js';
import { publishAppAnnouncement, validateAnnouncementPlan } from '../src/app-announcement.mjs';

const applicationId = '10000000000000000';
const panel = { guildId: '10000000000000001', channelId: '10000000000000002', messageId: '10000000000000003' };
function fixture() {
  const writes = [], saved = [], ledger = { campaign: 'windows-store-launch-2026-10-31', channels: {} };
  const rest = {
    get: async route => route === Routes.currentApplication() ? { id: applicationId } : route === Routes.channel(panel.channelId) ? { type: 0, guild_id: panel.guildId } : { author: { id: applicationId } },
    patch: async (...args) => { writes.push(['patch', ...args]); return {}; },
    post: async (...args) => { writes.push(['post', ...args]); return { id: '10000000000000004', author: { id: applicationId } }; }
  };
  const input = { rest, applicationId, panels: [panel], ledger, save: async value => { saved.push(structuredClone(value)); } };
  return { input, rest, writes, saved, ledger };
}

test('publication refreshes the saved card, announces once without mentions, and reruns never send a second announcement', async () => {
  const h = fixture();
  assert.deepEqual(await publishAppAnnouncement(h.input), { cardsUpdated: 1, announced: 1, alreadyAnnounced: 0, failed: 0, uncertain: 0 });
  assert.equal(h.saved[0].channels[panel.channelId].status, 'sending');
  assert.equal(h.saved[1].channels[panel.channelId].status, 'sent');
  for (const [,route,options] of h.writes) {
    assert.ok(route.startsWith(`/channels/${panel.channelId}/messages`));
    assert.deepEqual(options.body.allowed_mentions, { parse: [], replied_user: false });
    assert.equal(options.files.length, 1);
  }
  assert.equal(h.writes.find(([method]) => method === 'post')[2].body.enforce_nonce, true);
  assert.equal((await publishAppAnnouncement(h.input)).alreadyAnnounced, 1);
  assert.equal(h.writes.filter(([method]) => method === 'post').length, 1);
});

test('a DM, another guild or another author cannot receive a launch announcement', async () => {
  for (const invalid of [{ type: 1, guild_id: panel.guildId }, { type: 0, guild_id: '99999999999999999' }, null]) {
    const h = fixture(), original = h.rest.get;
    h.rest.get = async route => route === Routes.channel(panel.channelId) ? invalid || { type: 0, guild_id: panel.guildId } : invalid === null && route === Routes.channelMessage(panel.channelId, panel.messageId) ? { author: { id: '99999999999999999' } } : original(route);
    assert.equal((await publishAppAnnouncement(h.input)).failed, 1);
    assert.deepEqual(h.writes, []);
  }
});

test('uncertain deliveries stay journaled for review and are never automatically retried', async () => {
  const h = fixture(); h.rest.post = async () => { throw new Error('Timeout after upload'); };
  assert.equal((await publishAppAnnouncement(h.input)).uncertain, 1);
  assert.equal(h.ledger.channels[panel.channelId].status, 'uncertain');
  h.rest.get = async () => assert.fail('Uncertain delivery must be reviewed first');
  h.rest.get = async route => { assert.equal(route, Routes.currentApplication()); return { id: applicationId }; };
  assert.equal((await publishAppAnnouncement(h.input)).uncertain, 1);
});

test('identity mismatches and duplicate or malformed plans fail before any message writes', async () => {
  const h = fixture(); h.rest.get = async () => ({ id: '99999999999999999' });
  await assert.rejects(publishAppAnnouncement(h.input), /identity mismatch/);
  assert.deepEqual(h.writes, []);
  for (const invalid of [[panel, panel], [{ ...panel, channelId: '../private' }], [{ ...panel, userId: '123' }], {}]) assert.throws(() => validateAnnouncementPlan(invalid));
});
