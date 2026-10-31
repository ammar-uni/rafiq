import { ApplicationCommandOptionType, ChannelType, PermissionFlagsBits } from 'discord.js';

export const INSTALL_PERMISSIONS = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages | PermissionFlagsBits.AttachFiles | PermissionFlagsBits.ReadMessageHistory;
export const APP_DESCRIPTION = 'أضف رفيق إلى سيرفرك، وذكّر أصدقاءك بالخير 🌿\nلإعداده: أنشئ قناة مثل «رفيق الخير»، واكتب فيها /rafiq-setup لإظهار البطاقة. اضغط «إعداد سيرفرك» واختر قناة مثل «تذكيرات» للمنشورات. الأسماء أمثلة فقط؛ اختر ما يناسبك.\nللأعضاء: «ابدأ مع رفيق» أو /rafiq لفتح إعداداتك الخاصة.';
export const COMMANDS = [
  {
    name: 'rafiq', description: 'مساحتك للذكر الموثّق وفكرة الخير وتنظيم التذكير',
    contexts: [0, 1], integration_types: [0],
    options: [{ type: ApplicationCommandOptionType.String, name: 'section', description: 'افتح ما تحتاجه مباشرة',
      choices: [
        { name: 'الرئيسية', value: 'home' }, { name: 'تذكيراتي', value: 'reminders' }, { name: 'أقرأ الآن', value: 'explore' },
        { name: 'فكرة خير', value: 'idea' }, { name: 'محفوظاتي', value: 'favorites' },
        { name: 'مؤقّت استراحة', value: 'break' }, { name: 'إعداد تذكير المجلس', value: 'settings' },
        { name: 'مواقيت الصلاة', value: 'prayer' },
        { name: 'مكتبة الأذكار', value: 'library' }, { name: 'بياناتي وخصوصيتي', value: 'privacy' }, { name: 'المصادر والمنهج', value: 'methodology' },
        { name: 'دليل الاستخدام', value: 'help' }, { name: 'دليل إعداد السيرفر', value: 'server_guide' }, { name: 'تواصل وإبلاغ', value: 'support' }
      ] }]
  },
  {
    name: 'rafiq-setup', description: 'إظهار بطاقة رفيق هنا، ثم إعداد قناة التذكيرات',
    default_member_permissions: PermissionFlagsBits.ManageGuild.toString(), contexts: [0], integration_types: [0],
    options: [{ type: ApplicationCommandOptionType.Channel, name: 'channel', description: 'قناة أخرى للبطاقة (الافتراضي: القناة الحالية)', required: false, channel_types: [ChannelType.GuildText] }]
  },
  {
    name: 'rafiq-server', description: 'إعداد منشورات السيرفر: القناة والتذكيرات والمواعيد والمنشن',
    default_member_permissions: PermissionFlagsBits.ManageGuild.toString(), contexts: [0], integration_types: [0]
  },
  {
    name: 'rafiq-status', description: 'حالة إعداد رفيق في السيرفر للمشرف',
    default_member_permissions: PermissionFlagsBits.ManageGuild.toString(), contexts: [0], integration_types: [0]
  }
];

export function inviteURL(applicationId) {
  const url = new URL('https://discord.com/oauth2/authorize');
  url.search = new URLSearchParams({ client_id: applicationId, scope: 'bot applications.commands', permissions: INSTALL_PERMISSIONS.toString(), integration_type: '0' }).toString();
  return url.href;
}
