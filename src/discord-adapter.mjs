import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { BRAND, FLAGS, noticePayload, welcomePayload } from './messages.mjs';
import { INSTALL_PERMISSIONS } from './commands.mjs';

export function toDiscord(payload, { forEdit = false } = {}) {
  const result = {
    flags: forEdit ? payload.flags & ~FLAGS.ephemeral & ~FLAGS.silent : payload.flags,
    components: structuredClone(payload.components),
    allowedMentions: { parse: [], repliedUser: false }
  };
  if (payload.attachments?.length) {
    if (payload.attachments.length !== 1 || payload.attachments[0].filename !== BRAND.banner) throw new Error('Unknown attachment');
    result.files = [{ attachment: fileURLToPath(new URL(`../assets/${BRAND.banner}`, import.meta.url)), name: BRAND.banner, description: 'غلاف رفيق' }];
    result.attachments = [];
  }
  return result;
}

export function makeSendDM(client) {
  return async (userId, payload, key) => {
    const user = await client.users.fetch(userId);
    // No message content or authentication values are logged.
    const nonce = createHash('sha256').update(key).digest('hex').slice(0, 24);
    return user.send({ ...toDiscord(payload), nonce, enforceNonce: true });
  };
}

export async function acknowledgePrivate(interaction) {
  const isPrivateMessage = interaction.isMessageComponent() && interaction.message.flags.has(MessageFlags.Ephemeral);
  if (isPrivateMessage) await interaction.deferUpdate();
  else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
}

export function canManageGuild(interaction) {
  return Boolean(interaction.inGuild() && interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild));
}

export async function setupPanel({ interaction, store }) {
  if (!canManageGuild(interaction)) return noticePayload('هذا الإعداد للمشرف', 'تحتاج صلاحية إدارة السيرفر لنشر بطاقة رفيق.');
  const channel = interaction.options.getChannel('channel', true);
  if (channel.guildId !== interaction.guildId || channel.type !== 0) return noticePayload('اختر قناة نصية', 'اختر قناة نصية عادية داخل هذا السيرفر.');
  const me = interaction.guild.members.me || await interaction.guild.members.fetchMe();
  if (!channel.permissionsFor(me)?.has(INSTALL_PERMISSIONS)) return noticePayload('أحتاج صلاحيات القناة', 'اسمح لرفيق بعرض القناة، وإرسال الرسائل، وإرفاق الملفات، وقراءة سجل الرسائل، ثم أعد الأمر.');
  const previous = store.getPanel(interaction.guildId);
  let oldMessage = null;
  if (previous) {
    try {
      const oldChannel = await interaction.guild.channels.fetch(previous.channel_id);
      if (oldChannel?.isTextBased()) oldMessage = await oldChannel.messages.fetch(previous.message_id);
    } catch (error) {
      if (![10003, 10008].includes(Number(error.code))) return noticePayload('تعذّر تحديث البطاقة', 'لم أتمكن من الوصول إلى البطاقة السابقة. راجع صلاحيات قناتها قبل نشر بطاقة أخرى.');
    }
  }
  if (oldMessage && oldMessage.channelId !== channel.id) return noticePayload('للسيرفر بطاقة موجودة', `لتغيير القناة، احذف بطاقة رفيق القديمة ثم أعد الأمر.\n[افتح البطاقة](https://discord.com/channels/${interaction.guildId}/${previous.channel_id}/${previous.message_id})`);
  const payload = toDiscord(welcomePayload(), { forEdit: Boolean(oldMessage) });
  const message = oldMessage ? await oldMessage.edit(payload) : await channel.send(payload);
  store.setPanel(interaction.guildId, channel.id, message.id);
  return noticePayload(oldMessage ? 'تحدّثت بطاقة رفيق' : 'بطاقة رفيق جاهزة', `يمكن للأعضاء فتح مساحتهم منها، والتفعيل اختياري لكل عضو. يمكنك تثبيتها يدويًا.\n[افتح البطاقة](${message.url})`);
}

export function statusPayload(interaction, store) {
  if (!canManageGuild(interaction)) return noticePayload('هذا الإعداد للمشرف', 'تحتاج صلاحية إدارة السيرفر.');
  const panel = store.getPanel(interaction.guildId);
  return noticePayload('رفيق في هذا السيرفر', [
    panel ? `[بطاقة الترحيب](https://discord.com/channels/${interaction.guildId}/${panel.channel_id}/${panel.message_id})` : 'لم تُنشر بطاقة بعد. استخدم /rafiq-setup.',
    'التفعيل اختياري. المجالس المشتركة من ٥ دقائق؛ مهلة خروج نحو ٤٥ ثانية. البداية: رسالة صامتة كل ٢٤ ساعة كحد أقصى.',
    'لا توجد رسائل عامة مجدولة أو قراءة لمحتوى المحادثات. يجب أن يستطيع البوت رؤية القناة الصوتية حتى تصله أحداثها.'
  ].join('\n'));
}
