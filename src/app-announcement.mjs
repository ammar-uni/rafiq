import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Routes } from 'discord.js';
import { appLaunchPayload, welcomePayload, FLAGS } from './messages.mjs';

const snowflake = value => typeof value === 'string' && /^\d{17,20}$/.test(value);
export function validateAnnouncementPlan(value) {
  if (!Array.isArray(value) || value.length > 500) throw new TypeError('Invalid card-channel plan');
  const channels = new Set();
  for (const panel of value) {
    if (!panel || Object.keys(panel).sort().join(',') !== 'channelId,guildId,messageId' ||
        ![panel.guildId, panel.channelId, panel.messageId].every(snowflake) || channels.has(panel.channelId)) throw new TypeError('Invalid or duplicate card channel');
    channels.add(panel.channelId);
  }
  return value;
}

async function messageOptions(payload, { edit = false, nonce } = {}) {
  const files = await Promise.all((payload.attachments || []).map(async file => ({
    name: file.filename, data: await readFile(new URL(`../assets/${file.filename}`, import.meta.url))
  })));
  return { body: { ...payload, flags: edit ? payload.flags & ~FLAGS.ephemeral & ~FLAGS.silent : payload.flags,
    ...(nonce ? { nonce, enforce_nonce: true } : {}) }, files };
}

/** Operator-invoked only. Uses existing public card channels, never DMs or subscriber settings. */
export async function publishAppAnnouncement({ rest, applicationId, panels, ledger, save, campaign = 'windows-store-launch-2026-10-31' }) {
  validateAnnouncementPlan(panels);
  if (!snowflake(applicationId) || ledger.campaign !== campaign || !ledger.channels || typeof ledger.channels !== 'object' || Array.isArray(ledger.channels)) throw new TypeError('Invalid publication identity or journal');
  const identity = await rest.get(Routes.currentApplication());
  if (identity.id !== applicationId) throw new Error('Application identity mismatch');
  const result = { cardsUpdated: 0, announced: 0, alreadyAnnounced: 0, failed: 0, uncertain: 0 };
  for (const panel of panels) {
    const prior = ledger.channels[panel.channelId];
    if (prior?.status === 'sending' || prior?.status === 'uncertain') { result.uncertain++; continue; }
    let sending = false;
    try {
      const channel = await rest.get(Routes.channel(panel.channelId));
      if (channel.type !== 0 || channel.guild_id !== panel.guildId) throw new Error('Target must be the saved guild text channel');
      const card = await rest.get(Routes.channelMessage(panel.channelId, panel.messageId));
      if (card.author?.id !== applicationId) throw new Error('Saved card is not owned by Rafiq');
      await rest.patch(Routes.channelMessage(panel.channelId, panel.messageId), await messageOptions(welcomePayload(), { edit: true }));
      result.cardsUpdated++;
      if (prior?.status === 'sent') { result.alreadyAnnounced++; continue; }
      const nonce = createHash('sha256').update(`${campaign}:${applicationId}:${panel.channelId}`).digest('hex').slice(0, 24);
      ledger.channels[panel.channelId] = { ...panel, status: 'sending', nonce };
      await save(ledger);
      sending = true;
      const message = await rest.post(Routes.channelMessages(panel.channelId), await messageOptions(appLaunchPayload(), { nonce }));
      if (!snowflake(message.id) || message.author?.id !== applicationId) throw new Error('Unconfirmed announcement response');
      ledger.channels[panel.channelId] = { ...panel, status: 'sent', nonce, announcementMessageId: message.id };
      await save(ledger);
      result.announced++;
    } catch (error) {
      if (sending) {
        ledger.channels[panel.channelId] = { ...ledger.channels[panel.channelId], status: 'uncertain' };
        await save(ledger);
        result.uncertain++;
      } else result.failed++;
    }
  }
  return result;
}
