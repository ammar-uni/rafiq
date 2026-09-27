import { createHash } from 'node:crypto';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { toDiscord } from './discord-adapter.mjs';
import { serverId } from './server-config.mjs';

const serverSendPermissions = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages;
const targetFailure = message => Object.assign(new Error(message), { code: 'RAF_SERVER_TARGET' });
export async function resolveServerTarget(client, { guildId, userId, preferences: p }) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild?.available) throw Object.assign(new Error('Server temporarily unavailable'), { code: 'RAF_SERVER_UNAVAILABLE' });
  if (!p.channelId) throw targetFailure('اختر القناة أولًا ثم اختر المنشن.');
  const channel = await guild.channels.fetch(p.channelId, { force: true });
  if (!channel || channel.guildId !== guildId || channel.type !== ChannelType.GuildText) throw targetFailure('اختر قناة نصية عادية داخل هذا السيرفر.');
  const me = await guild.members.fetchMe({ force: true });
  const permissions = channel.permissionsFor(me);
  if (!permissions?.has(serverSendPermissions)) throw targetFailure('اسمح لرفيق بعرض القناة وإرسال الرسائل فيها.');
  if (p.mentionEveryone && !permissions.has(PermissionFlagsBits.MentionEveryone)) throw targetFailure('لا يملك رفيق صلاحية «ذكر الجميع» في هذه القناة. امنحها له من إعدادات القناة أو اختر منشنًا آخر.');
  if (userId) {
    const member = await guild.members.fetch({ user: userId, force: true });
    if (!member.permissions.has(PermissionFlagsBits.ManageGuild) || !channel.permissionsFor(member)?.has(serverSendPermissions)) throw targetFailure('تحتاج صلاحية إدارة السيرفر، وعرض القناة وإرسال الرسائل فيها.');
    if (p.mentionEveryone && !channel.permissionsFor(member).has(PermissionFlagsBits.MentionEveryone)) throw targetFailure('تحتاج أنت أيضًا صلاحية «ذكر الجميع» في هذه القناة لاختيار @everyone.');
  }
  if (p.roleId) {
    const role = await guild.roles.fetch(p.roleId, { force: true });
    if (!role || role.guild.id !== guildId || role.id === guildId || role.managed) throw targetFailure('اختر رتبة عادية داخل السيرفر، وليس رتبة الجميع أو رتبة بوت.');
    if (!role.mentionable && !permissions.has(PermissionFlagsBits.MentionEveryone)) throw targetFailure('هذه الرتبة غير قابلة للمنشن. اسمح بذكر الرتبة من إعدادات ديسكورد أو اختر بدون منشن.');
  }
  return channel;
}
export function makeCheckServerTarget(client) {
  return async input => {
    try { await resolveServerTarget(client, input); return null; }
    catch (error) {
      if (error.code === 'RAF_SERVER_TARGET') return error.message;
      if ([50001, 50013, 10003, 10004, 10007, 10011].includes(Number(error.code))) return 'تعذّر الوصول إلى القناة أو الرتبة. راجع الاختيار والصلاحيات.';
      throw error;
    }
  };
}
export function toServerDiscord(payload, roleId = null, mentionEveryone = false) {
  if (roleId !== null && !serverId(roleId)) throw new RangeError('Invalid mention role');
  if (typeof mentionEveryone !== 'boolean' || (mentionEveryone && roleId !== null)) throw new RangeError('Invalid server mention');
  if (typeof payload.content !== 'string' || (roleId && !payload.content.startsWith(`<@&${roleId}>\n`))) throw new RangeError('Invalid server post');
  if (mentionEveryone && (!payload.content.startsWith('@everyone\n') || /@(?:everyone|here)/.test(payload.content.slice(10)))) throw new RangeError('Invalid everyone post');
  return { ...toDiscord(payload), allowedMentions: { parse: mentionEveryone ? ['everyone'] : [], roles: roleId ? [roleId] : [], users: [], repliedUser: false } };
}
export function makeSendServer(client) {
  return async (guildId, preferences, payload, key) => {
    const channel = await resolveServerTarget(client, { guildId, preferences });
    const nonce = createHash('sha256').update(key).digest('hex').slice(0, 24);
    return channel.send({ ...toServerDiscord(payload, preferences.roleId, preferences.mentionEveryone), nonce, enforceNonce: true });
  };
}
