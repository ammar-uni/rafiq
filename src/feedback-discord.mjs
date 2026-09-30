import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { FeedbackRetention } from './feedback-retention.mjs';

const failure = () => Object.assign(new Error('Feedback destination unavailable or not private'), { code: 'RAF_FEEDBACK_TARGET' });

export async function resolveFeedbackChannel(client, { feedbackGuildId, feedbackChannelId }) {
  if (!feedbackGuildId || !feedbackChannelId) throw failure();
  const guild = await client.guilds.fetch({ guild: feedbackGuildId, force: true });
  if (!guild?.available || guild.id !== feedbackGuildId) throw failure();
  const channel = await guild.channels.fetch(feedbackChannelId, { force: true });
  if (!channel || channel.id !== feedbackChannelId || channel.guildId !== feedbackGuildId || channel.type !== ChannelType.GuildText) throw failure();
  const roles = await guild.roles.fetch();
  const me = await guild.members.fetchMe({ force: true });
  const allowed = new Set([guild.ownerId, me.id]);
  const everyone = channel.permissionOverwrites.cache.get(guild.id);
  if (!everyone?.deny.has(PermissionFlagsBits.ViewChannel) || everyone.allow.has(PermissionFlagsBits.ViewChannel)) throw failure();
  // A newly added reader or administrator stops delivery until the operator reviews it.
  if (roles.some(role => role.permissions.has(PermissionFlagsBits.Administrator))) throw failure();
  for (const overwrite of channel.permissionOverwrites.cache.values()) {
    if (overwrite.allow.has(PermissionFlagsBits.ViewChannel) && (overwrite.type !== 1 || !allowed.has(overwrite.id))) throw failure();
  }
  if (!channel.permissionsFor(me)?.has(PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages)) throw failure();
  return channel;
}

export function makeSendFeedback(client, config) {
  if (!config.feedbackGuildId || !config.feedbackChannelId) return null;
  return async (payload, ticket) => {
    const channel = await resolveFeedbackChannel(client, config);
    return channel.send({ ...payload, nonce: ticket, enforceNonce: true });
  };
}

export function makeFeedbackRetention(client, config, options = {}) {
  return new FeedbackRetention({ ...options, botId: () => client.user?.id,
    resolveChannel: config.feedbackGuildId && config.feedbackChannelId ? async () => {
      const channel = await resolveFeedbackChannel(client, config);
      if (!channel.permissionsFor(client.user)?.has(PermissionFlagsBits.ReadMessageHistory)) throw failure();
      return channel;
    } : null
  });
}
