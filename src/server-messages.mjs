import { PUBLIC_POSTS, SEASONAL_CARDS } from './content.mjs';
import { FLAGS, BRAND, seasonalReminderPayload } from './messages.mjs';
import { DEFAULT_SERVER, SERVER_ZONES, serverId } from './server-config.mjs';

const serverText = content => ({ type: 10, content });
const serverRow = (...components) => ({ type: 1, components });
const serverButton = (label, action, style = 2) => ({ type: 2, label, style, custom_id: `rafiq:v1:server_${action}` });
const serverPersonalHome = () => ({ type: 2, style: 2, label: 'الرئيسية', custom_id: 'rafiq:v1:home' });
const serverSection = (content, accessory) => ({ type: 9, components: [serverText(content)], accessory });
const serverEnvelope = components => ({ flags: FLAGS.componentsV2 | FLAGS.ephemeral, allowed_mentions: { parse: [], replied_user: false }, components: [{ type: 17, accent_color: BRAND.accent, components }] });
const serverDivider = () => ({ type: 14, divider: true, spacing: 1 });
const serverSelect = (action, placeholder, options) => serverRow({ type: 3, custom_id: `rafiq:v1:server_${action}`, placeholder, min_values: 1, max_values: 1, options });
const serverFrequency = count => ['متوقفة', 'تذكير واحد يوميًا', 'تذكيران يوميًا', '٣ تذكيرات يوميًا'][count];
const serverZoneLabel = zone => SERVER_ZONES.find(([key]) => key === zone)?.[1] || zone;
const serverScheduleLabel = p => `${p.times.join(' · ')}\nبتوقيت ${serverZoneLabel(p.timezone)}`;
const serverMentionLabel = p => p.mentionEveryone ? '@everyone · جميع أعضاء القناة' : p.roleId ? `<@&${p.roleId}>` : 'بدون منشن';
export const SERVER_GENERAL_CARDS = Object.freeze(PUBLIC_POSTS.map(card => Object.freeze({ ...card, action: `post_source_${card.id}` })));
export function serverCardForEvent(event) {
  const index = Math.floor(Date.parse(event.day + 'T00:00:00Z') / 86400000) * 3 + event.slot;
  return SERVER_GENERAL_CARDS[((index % SERVER_GENERAL_CARDS.length) + SERVER_GENERAL_CARDS.length) % SERVER_GENERAL_CARDS.length];
}
export function serverPostPayload(event, roleId = null, mentionEveryone = false) {
  if (roleId !== null && !serverId(roleId)) throw new RangeError('Invalid mention role');
  if (typeof mentionEveryone !== 'boolean' || (mentionEveryone && roleId !== null)) throw new RangeError('Invalid server mention');
  const card = event.kind === 'seasonal' ? SEASONAL_CARDS[event.campaign?.key] : serverCardForEvent(event);
  if (!card) throw new RangeError('Unknown server content');
  const body = event.kind === 'seasonal' ? seasonalReminderPayload(event.campaign).content : `**${card.title}**\n${card.body}\n${card.source.reference}`;
  const action = event.kind === 'seasonal' ? `seasonal_source_${event.campaign.key}` : card.action;
  return { content: (mentionEveryone ? '@everyone\n' : roleId ? `<@&${roleId}>\n` : '') + body, flags: 0,
    allowed_mentions: { parse: mentionEveryone ? ['everyone'] : [], roles: roleId ? [roleId] : [], users: [], replied_user: false },
    components: [serverRow({ type: 2, style: 2, label: 'المصدر والتوضيح', custom_id: `rafiq:v1:${action}` }, { type: 2, style: 2, label: 'مساحتي مع رفيق', custom_id: 'rafiq:v1:home' })] };
}
export function serverHomePayload(p = DEFAULT_SERVER, notice = '') {
  return serverEnvelope([
    serverText(`-# إعدادات المشرف · تظهر لك وحدك\n## رفيق في سيرفرك\nتذكيرات قصيرة يختار محتواها رفيق من أربعين منشورًا معتمدًا بأحاديث من الصحيحين.`),
    ...(notice ? [serverText(notice)] : []),
    serverText(`**النشر ${p.enabled ? 'مفعّل' : 'متوقف'}**${p.issue ? '\n' + (p.issue === 'permissions' ? 'توقف النشر بسبب صلاحيات القناة أو المنشن. راجعها ثم أعد التفعيل.' : 'تعذّر إرسال أحد المنشورات؛ لن نكرر محاولة إرساله.') : ''}`),
    serverDivider(),
    serverText(`**القناة:** ${p.channelId ? `<#${p.channelId}>` : 'لم تُحدّد بعد'}\n**اليومية:** ${serverFrequency(p.dailyCount)}\n**مواسم الخير:** ${p.seasonal ? 'مختارة' : 'متوقفة'}\n**المنشن:** ${serverMentionLabel(p)}`),
    ...(p.channelId ? [serverText(`**مواعيد النشر**\n${serverScheduleLabel(p)}`)] : []),
    serverRow(serverButton(p.channelId ? 'تعديل الإعدادات' : 'ابدأ إعداد النشر', 'begin', 3), ...(p.enabled ? [serverButton('إيقاف كل المنشورات', 'pause', 4)] : [])),
    serverRow(serverButton('دليل إعداد السيرفر', 'guide'), serverPersonalHome()),
    serverText('-# مواسم الخير: رسالة قبل عشر ذي الحجة ورسالة قبل عرفة، كل منهما قبل يومين حسب تقويم السعودية. إعدادات القناة مستقلة عن تذكيرات الأعضاء في الخاص.')
  ]);
}
export function serverGuidePayload(canManage = false) {
  return serverEnvelope([
    serverText('-# دليل المشرف\n## رفيق، في مكان واضح\nابدأ بقناة واحدة ومحتوى قليل يناسب أهل سيرفرك.'),
    serverText('**١ · أنشئ قناة نصية**\nسمّها مثلًا «رفيق الخير». اسمح للأعضاء بقراءتها، ويمكنك تخصيص الكتابة للبوت والمشرفين.'),
    serverText('**٢ · انشر بطاقة البداية**\nاستخدم `/rafiq-setup` واختر القناة، ثم ثبّت البطاقة. منها يفتح كل عضو مساحته وتذكيراته الخاصة.'),
    serverText('**٣ · اختر منشورات القناة**\nمن الرئيسية داخل السيرفر، افتح «إعدادات هذا السيرفر»، أو استخدم `/rafiq-server`. اختر القناة، ثم ١ أو ٢ أو ٣ تذكيرات يوميًا، أو مواسم الخير وحدها. راجع التوقيت والمعاينة ثم احفظ.'),
    serverText('**٤ · المنشن اختياري**\nاختر بدون منشن، أو رتبة للراغبين بالتذكير، أو @everyone لتنبيه جميع من يستطيعون رؤية القناة. خيار الجميع يحتاج صلاحية «ذكر الجميع» لك وللبوت. لا يحتاج رفيق صلاحية «مسؤول». التنبيهات تخضع أيضًا لإعدادات كل عضو في ديسكورد.'),
    serverText('**تحكّم واضح**\nيمكنك تعديل المواعيد أو إيقاف المنشورات من إعدادات السيرفر. هذه الإعدادات تخص القناة؛ تذكيرات الأعضاء في الخاص مستقلة. التذكير داخل القنوات الصوتية غير متاح في هذه المرحلة.'),
    ...(!canManage ? [serverText('-# إعدادات النشر لمن يملك صلاحية إدارة السيرفر. افتح رفيق داخل السيرفر المطلوب لتظهر أدوات إدارته إن كانت لديك الصلاحية.')] : []),
    serverRow(...(canManage ? [serverButton('إعدادات هذا السيرفر', 'home', 3)] : []), serverPersonalHome())
  ]);
}
export function serverNoticePayload(title, body, action = 'home') {
  return serverEnvelope([serverText(`## ${title}\n${body}`), serverRow(serverButton('رجوع', action))]);
}
export function serverDraftPayload(p, token, notice = '') {
  const a = action => `${token}_${action}`;
  return serverEnvelope([
    serverText('-# ١ من ٢ · إعداد المنشورات\n## خيرٌ يجمع أهل السيرفر\nاختر ما يناسب قناتك. لن يبدأ النشر حتى تراجع الإعدادات وتحفظها.'),
    ...(notice ? [serverText(notice)] : []),
    serverRow({ type: 8, custom_id: `rafiq:v1:server_${a('channel')}`, channel_types: [0], placeholder: 'اختر قناة المنشورات، مثل رفيق-الخير', min_values: 1, max_values: 1, ...(p.channelId ? { default_values: [{ id: p.channelId, type: 'channel' }] } : {}) }),
    serverSelect(a('count'), 'التذكيرات اليومية', [0, 1, 2, 3].map(count => ({ label: serverFrequency(count), value: String(count), default: p.dailyCount === count, ...(count === 0 ? { description: 'يمكنك الاكتفاء بمواسم الخير' } : {}) }))),
    serverSection(`**مواسم الخير · ${p.seasonal ? 'مفعّلة' : 'متوقفة'}**\nتذكيرات قليلة في السنة.`, serverButton(p.seasonal ? 'إيقاف المواسم' : 'تفعيل المواسم', a('seasonal'))),
    serverSection(`**مواعيد النشر**\n${serverScheduleLabel(p)}`, serverButton('تعديل المواعيد', a('schedule'))),
    serverSection(`**المنشن · ${serverMentionLabel(p)}**\nبدون منشن، أو رتبة، أو الجميع.`, serverButton('اختيار المنشن', a('mention'))),
    serverDivider(),
    serverRow(serverButton('التالي: المراجعة', a('review'), 3), serverButton('إلغاء', 'home'))
  ]);
}
export function serverSchedulePayload(p, token, notice = '') {
  const zones = SERVER_ZONES.map(([value, label]) => ({ value, label, default: value === p.timezone }));
  if (!zones.some(option => option.default)) zones.push({ value: p.timezone, label: p.timezone, default: true });
  return serverEnvelope([
    serverText(`## متى ينشر رفيق؟\n${p.dailyCount ? serverFrequency(p.dailyCount) : 'موعد رسالة الموسم فقط؛ اليومية متوقفة'}. استخدم توقيتًا واحدًا يناسب أغلب أعضاء السيرفر.`),
    ...(notice ? [serverText(notice)] : []),
    serverSelect(`${token}_zone`, 'التوقيت المستخدم', zones),
    serverText(`**المواعيد الحالية**\n${serverScheduleLabel(p)}\n-# المواعيد لتنظيم الإرسال وليست أوقاتًا شرعية مخصّصة لهذه الأذكار.`),
    serverRow(serverButton('تعديل الساعات', `${token}_time_modal`, 3), serverButton('توقيت آخر', `${token}_zone_modal`)),
    serverRow(serverButton('رجوع', `${token}_edit`))
  ]);
}
export function serverMentionPayload(p, token, notice = '') {
  return serverEnvelope([
    serverText(`## من تريد تنبيهه؟\nالحالي: ${serverMentionLabel(p)}\nاختر بدون منشن، أو الجميع، أو رتبة مخصّصة للراغبين بالتذكير.`),
    ...(notice ? [serverText(notice)] : []),
    serverRow(serverButton('بدون منشن', `${token}_no_role`, !p.roleId && !p.mentionEveryone ? 3 : 2), serverButton('@everyone · الجميع', `${token}_everyone`, p.mentionEveryone ? 3 : 2)),
    serverText('-# @everyone ينبه جميع من يستطيعون رؤية القناة، حسب إعدادات إشعاراتهم. يحتاج صلاحية «ذكر الجميع» لك ولرفيق. لا يُرسل منشن أثناء الإعداد أو المعاينة.'),
    serverDivider(),
    serverText('### أو منشن رتبة محددة\nاختر الرتبة من القائمة أدناه. يبقى المنشور في القناة، ويخص المنشن أصحاب هذه الرتبة.'),
    serverRow({ type: 6, custom_id: `rafiq:v1:server_${token}_role`, placeholder: 'اختر رتبة للمنشن', min_values: 1, max_values: 1, ...(p.roleId ? { default_values: [{ id: p.roleId, type: 'role' }] } : {}) }),
    serverText('-# يجب أن تكون الرتبة قابلة للمنشن أو يملك رفيق الإذن المناسب. يمكن للأعضاء كتم تنبيهات القناة من ديسكورد.'),
    serverRow(serverButton('رجوع', `${token}_edit`))
  ]);
}
export function serverReviewPayload(p, token, event, notice = '') {
  const post = event ? serverPostPayload(event, p.roleId, p.mentionEveryone) : null;
  return serverEnvelope([
    serverText('-# ٢ من ٢ · المراجعة\n## جاهز للنشر التلقائي؟'),
    ...(notice ? [serverText(notice)] : []),
    serverText(`**القناة:** <#${p.channelId}>\n**اليومية:** ${serverFrequency(p.dailyCount)}\n**مواسم الخير:** ${p.seasonal ? 'مفعّلة' : 'متوقفة'}\n**المنشن:** ${serverMentionLabel(p)}\n**المواعيد:** ${serverScheduleLabel(p)}`),
    serverText(p.seasonal ? '-# تذكير الموسم يحلّ محل أول تذكير يومي في يومه. إذا أوقفت اليومية يبقى للموسم موعد واحد. التواريخ تقديرية بحسب السعودية ما لم يثبت الإعلان.' : '-# يتناوب رفيق على محتوى موثّق. لا يقرأ محادثات الأعضاء لاختيار المنشورات.'),
    serverDivider(),
    serverText(post ? `**نموذج للرسالة · معاينة لك وحدك**\n${post.content}` : 'النوعان متوقفان؛ لن تُرسل منشورات.'),
    ...(post ? [serverRow({ type: 2, style: 5, label: 'افتح المصدر', url: event.kind === 'seasonal' ? SEASONAL_CARDS[event.campaign.key].source.url : serverCardForEvent(event).source.citations[0].url })] : []),
    serverRow(serverButton(p.dailyCount || p.seasonal ? 'حفظ وتفعيل النشر' : 'حفظ وإيقاف النشر', `${token}_save`, 3), serverButton('رجوع', `${token}_edit`)),
    serverText('-# لن تُرسل رسالة تجريبية في القناة؛ يبدأ النشر في المواعيد القادمة بعد الحفظ. المعاينة لا ترسل أي منشن.')
  ]);
}
export function serverModal(p, token, kind) {
  const zone = kind === 'zone';
  const fields = zone ? [{ id: 'zone', label: 'اسم التوقيت، مثل Asia/Riyadh', value: p.timezone, max: 64 }] : p.times.map((time, i) => ({ id: `time${i}`, label: `الوقت ${i + 1} · 24 ساعة، مثل 20:00`, value: time, max: 5 }));
  return { custom_id: `rafiq:v1:server_${token}_${zone ? 'zone_save' : 'time_save'}`, title: zone ? 'توقيت السيرفر' : 'مواعيد النشر', components: fields.map(field => ({ type: 18, label: field.label, component: { type: 4, custom_id: field.id, style: 1, required: true, value: field.value, placeholder: zone ? 'Asia/Riyadh' : '20:00', max_length: field.max } })) };
}
