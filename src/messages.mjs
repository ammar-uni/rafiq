import { DHIKR_CARDS, GOOD_DEEDS, OCCASION_CARDS, DAILY_DHIKR, SEASONAL_CARDS, IDEA_CATEGORIES, dhikrById, ideaById } from './content.mjs';
import { DEFAULT_PRAYER, DAILY_REMINDERS, DEFAULT_ADHKAR_OFFSET_MINUTES, OCCASIONS, PRAYERS, PRAYER_METHODS, PRAYER_HIGH_LATITUDE } from './prayer-config.mjs';
import { prayerClock } from './prayer-times.mjs';
/** Native Discord REST payloads. Rendering only; these functions never send messages. */
export const FLAGS = Object.freeze({ componentsV2: 32768, ephemeral: 64, silent: 4096 });
export const BRAND = Object.freeze({ name: 'رفيق', accent: 0x65ac89, gold: 0xcab17a, blue: 0x8aaec4, banner: 'rafiq-banner-v3.webp' });
export const SOURCE = DHIKR_CARDS[0].source.citations[0].url;
export const COPY = Object.freeze({
  welcomeTitle: 'خيرٌ خفيف، في وقته.',
  welcomeBody: 'تذكيرات تختارها، وأذكار تقرؤها، وأفكار خير تطبّقها. ابدأ بخطوة صغيرة تناسبك.',
  welcomeDetail: 'عند البدء تتفعّل «مواسم الخير» تلقائيًا: رسائل قليلة في الخاص، ويمكنك إيقافها. إعداداتك تظهر لك وحدك.',
  dhikr: DHIKR_CARDS[0].text,
  reminderTitle: 'كفارة المجلس',
  ideas: GOOD_DEEDS
});
const text = content => ({ type: 10, content });
const separator = () => ({ type: 14, divider: true, spacing: 1 });
const button = (label, action, style = 2) => ({ type: 2, label, style, custom_id: `rafiq:v1:${action}` });
// Back opens a parent screen; it never replays a setting change or send action.
const backButton = action => button('رجوع', action);
const linkButton = (label, url) => ({ type: 2, label, style: 5, url });
const row = (...components) => ({ type: 1, components });
const section = (content, accessory) => ({ type: 9, components: [text(content)], accessory });
const arabicNumber = number => String(number).replace(/\d/g, digit => '٠١٢٣٤٥٦٧٨٩'[Number(digit)]);
const quotation = value => value.split('\n').map(line => `> ${line}`).join('\n');
const sourceDetails = source => source.citations.map(ref => `[${ref.book} (${arabicNumber(ref.number.replace(/[a-z]$/, ''))})](${ref.url}) · ${ref.narrator} رضي الله ${ref.narrator === 'عائشة' ? 'عنها' : 'عنه'}.`).join('\n');
const container = (components, accent = BRAND.accent) => ({ type: 17, accent_color: accent, components });
const envelope = (components, { ephemeral = false, silent = false, accent = BRAND.accent } = {}) => ({
  flags: FLAGS.componentsV2 | (ephemeral ? FLAGS.ephemeral : 0) | (silent ? FLAGS.silent : 0),
  allowed_mentions: { parse: [], replied_user: false },
  components: [container(components, accent)]
});
// Keep reminder text in content for notification previews; V2 disables content.
const notification = (content, components, { silent = false } = {}) => ({
  content,
  flags: silent ? FLAGS.silent : 0,
  allowed_mentions: { parse: [], replied_user: false },
  components
});
export function welcomePayload() {
  return {
    ...envelope([
      { type: 12, items: [{ media: { url: `attachment://${BRAND.banner}` }, description: 'رفيق — خيرٌ يرافقك. نبتة في رمز محادثة عاجي، وحديقة هادئة يضيئها الفجر.' }] },
      text(`## ${COPY.welcomeTitle}\n${COPY.welcomeBody}`),
      text(`-# ${COPY.welcomeDetail}`),
      separator(),
      row(button('ابدأ مع رفيق', 'setup_start', 3), button('أقرأ الآن', 'explore'))
    ], { silent: true }),
    attachments: [{ id: '0', filename: BRAND.banner, description: 'غلاف رفيق' }]
  };
}

const prayerSelect = (action, placeholder, choices, selected) => row({ type: 3, custom_id: `rafiq:v1:${action}`, placeholder,
  min_values: 1, max_values: 1, options: choices.map(([value, label]) => ({ value, label, default: value === selected })) });
const cityReminderDisclosure = p => p.city
  ? 'تغيير المدينة يحافظ على اختيارات الجمعة والقضاء؛ ما أوقفته يبقى متوقفًا. تتوقف الصلوات والأذكار والقراءة حتى تراجع المواقيت وتعيد تفعيلها.'
  : 'باختيار مدينتك لأول مرة، تفعّل تلقائيًا تذكير دعاء الجمعة وقضاء قبل رمضان في الخاص، عند توفر مواقيت مكتملة. يمكنك إيقاف أي منهما من «الجمعة والقضاء».';

export function prayerPayload({ preferences: p = DEFAULT_PRAYER, today = [], next = null, day = '', notice = '', paused = false, dmBlocked = false } = {}) {
  const ready = Boolean(p.city && p.method && today.length === 5);
  return envelope([
    text(`## 🕰️ مواقيت صلاتك${notice ? `\n${notice}` : ''}`),
    text(p.city ? `**${p.city.label}**\n-# ${p.city.timezone} · ${day}` : 'اختر مدينتك أولًا. لن نطلب عنوان منزلك أو نكتشف موقعك تلقائيًا.'),
    ...(today.length ? [text(today.map(event => `**${event.label}**　${prayerClock(event.at, p.city.timezone)}`).join('\n'))] : []),
    ...(next ? [text(`الصلاة القادمة: **${next.label}** <t:${Math.floor(next.at / 1000)}:R>.`)] : []),
    text(`-# ${p.method ? PRAYER_METHODS.find(([id]) => id === p.method)[1] : 'اختر طريقة الحساب'} · ${p.enabled ? 'تذكير الصلوات الخمس مفعّل' : 'تذكير الصلوات الخمس غير مفعّل'}${paused ? ' · متوقف مؤقتًا' : ''}${dmBlocked ? ' · الخاص مغلق؛ اختبره من الإعدادات' : ''}`),
    ...(p.city && p.method && !today.length ? [text('تعذّر حساب جدول كامل لهذا اليوم. لن يُرسل تذكير لهذا الجدول. راجع مواقيت الجهة المعتمدة محليًا، خاصة في المناطق القطبية.')] : []),
    text('-# راجع الجدول مع مسجدك قبل التفعيل. تحديث المدينة عند السفر يضبط جميع تذكيراتك المرتبطة بالمواقيت.'),
    ...(!p.enabled ? [text('-# تفعيل الصلوات يشمل تذكير صلاة الجمعة قبل الظهر بـ٤٥ دقيقة. يمكنك إيقاف الجمعة وحدها من «الجمعة والقضاء».')] : []),
    separator(),
    row(button(p.city ? 'تغيير المدينة' : 'اختر مدينتي', 'prayer_location', p.city ? 2 : 3), button('ضبط الحساب', 'prayer_calculation')),
    row({ ...button(p.enabled ? 'إيقاف تذكير الصلاة' : 'تفعيل الصلاة والجمعة', p.enabled ? 'prayer_disable' : 'prayer_enable_friday', p.enabled ? 2 : 3), disabled: !p.enabled && !ready }, button('ضبط الإشعار', 'prayer_audio')),
    row(button('الجمعة والقضاء', 'prayer_occasions')),
    ...(paused || dmBlocked ? [row(button(dmBlocked ? 'اختبر الخاص' : 'استئناف التنبيهات', dmBlocked ? 'test_dm' : 'resume'))] : []),
    row(backButton('reminders'), button('الرئيسية', 'home'))
  ], { ephemeral: true, accent: BRAND.blue });
}

export function occasionsPayload({ preferences: p = DEFAULT_PRAYER, next = [], ready = false, notice = '', paused = false, dmBlocked = false } = {}) {
  const descriptions = {
    fridayPrayer: 'قبل موعد الظهر يوم الجمعة بـ٤٥ دقيقة؛ موعد خطبة مسجدك قد يختلف.',
    fridayDua: 'في الساعة الأخيرة قبل المغرب يوم الجمعة، بعد العصر.',
    qada: 'لمن عليه قضاء: تنبيهان فقط كل سنة، قبل رمضان المتوقع بـ٣٠ يومًا ثم بـ١٥ يومًا، وقت الظهر.'
  };
  return envelope([
    text(`## الجمعة وقضاء رمضان${notice ? `\n${notice}` : ''}\nدعاء الجمعة وقضاء رمضان يتفعّلان عند اختيار المدينة لأول مرة. تفعيل الصلوات يشمل تذكير صلاة الجمعة. يمكنك إيقاف أي تذكير على حدة.`),
    section(p.city ? `**مدينتك: ${p.city.label}**${!ready ? '\nتعذّر حساب جدول كامل؛ راجع مواقيت مدينتك.' : ''}${paused ? '\nالتنبيهات متوقفة مؤقتًا من إعداداتك العامة.' : ''}${dmBlocked ? '\nوصول الخاص معلّق؛ اختبره من إعداداتك العامة.' : ''}` : 'ابدأ باختيار مدينتك. لا تحتاج إلى تفعيل الصلوات الخمس لاستخدام هذه التذكيرات.', button(p.city ? 'مواقيت مدينتي' : 'اختر مدينتي', p.city ? 'prayer' : 'prayer_location', 3)),
    ...OCCASIONS.map(([key, label]) => {
      const event = next.find(item => item.key === key);
      return section(`### ${label} · ${p.occasions[key] ? 'مفعّل' : 'متوقف'}\n${descriptions[key]}${event ? `\n${p.occasions[key] ? 'التنبيه القادم' : 'الموعد عند التفعيل'}: **${prayerClock(event.at, p.city.timezone)}** بتوقيت مدينتك · <t:${Math.floor(event.at / 1000)}:R>.` : ''}`,
        { ...button(p.occasions[key] ? `إيقاف ${label}` : `تفعيل ${label}`, `prayer_occasion_${key}`, p.occasions[key] ? 2 : 3), disabled: !p.occasions[key] && (!ready || paused || dmBlocked) });
    }),
    text('-# مواعيد الجمعة بحسب جدول مدينتك. رمضان متوقع بتقويم أم القرى؛ ثبوته بإعلان بلدك. ساعة الدعاء وقت تُرجى فيه الإجابة، وليست وعدًا بإجابة محددة.'),
    row(button('الإشعار', 'prayer_audio'), button('المصادر', 'prayer_occasion_sources')),
    row(backButton('reminders'), button('الرئيسية', 'home'))
  ], { ephemeral: true, accent: BRAND.blue });
}

export function occasionSourcesPayload() {
  return envelope([
    text('## مصادر تذكيراتك\nرسائل التذكير من صياغة رفيق، وليست نقلًا لألفاظ الأحاديث.'),
    ...Object.values(OCCASION_CARDS).flatMap(card => [text(`### ${card.title}\n${sourceDetails(card.source)}\n${card.source.note}`), row(linkButton('افتح المصدر', card.source.url))]),
    row(backButton('prayer_occasions'))
  ], { ephemeral: true, accent: BRAND.blue });
}

export function occasionReminderPayload(p, event) {
  const key = event.key.startsWith('qada') ? 'qada' : event.key;
  const card = OCCASION_CARDS[key];
  const timing = key === 'qada' ? `بقي نحو **${arabicNumber(event.days)} يومًا** على رمضان المتوقع بتقويم أم القرى. ثبوت الشهر بإعلان بلدك.`
    : key === 'fridayPrayer' ? `موعد الظهر المحسوب: **${prayerClock(event.referenceAt, p.city.timezone)}**؛ يأتي هذا التذكير قبله بـ٤٥ دقيقة.`
    : `موعد المغرب المحسوب: **${prayerClock(event.referenceAt, p.city.timezone)}**.`;
  return notification(`${card.title}\n${card.body}\n\n${timing.replaceAll('**', '')}\n${p.city.label}`, [
    row(button('تذكيراتي', 'prayer_occasions'), button('المصدر', 'prayer_occasion_sources'), button('إيقاف هذا التذكير', `prayer_occasion_off_${key}`))
  ], { silent: p.delivery === 'silent' });
}

// The initial choice is on; delivery begins with the disclosed start action.
// Zero is an explicit opt-out, never an unset default.
const seasonalStatus = user => user.seasonalAt == null ? 'مفعّلة تلقائيًا عند البدء' : user.seasonalAt > 0 ? 'مفعّلة' : 'متوقفة';
export function seasonalPayload(user = {}, notice = '') {
  const active = user.seasonalAt > 0;
  const defaultOn = user.seasonalAt !== 0;
  return envelope([
    text(`-# تذكيراتي / مواسم الخير\n## مواسم الخير 🌿\n**${seasonalStatus(user)}**${active && (user.paused || user.dmBlocked) ? ' · الإرسال معلّق' : ''}${notice ? `\n${notice}` : ''}`),
    text('حديث ثابت، في وقته. تذكير واحد لكل موسم، قبل موعده بيومين تقريبًا؛ رسائل قليلة خلال السنة.'),
    text('-# تعمل دون مدينة. نعتمد تقويم السعودية، مع توضيح أن الموعد متوقع حتى تثبيته، وقد يختلف في بلدك.'),
    ...(user.seasonalAt == null ? [section('تبدأ رسائل المواسم في الخاص مع بداية استخدامك لرفيق، دون تفعيل منفصل. يمكنك إيقافها الآن أو لاحقًا.', button('ابدأ مع رفيق', 'setup_start', 3))] : []),
    separator(),
    row(button(defaultOn ? 'إيقاف مواسم الخير' : 'تفعيل مواسم الخير', defaultOn ? 'seasonal_off' : 'seasonal_on', defaultOn ? 2 : 3)),
    row(button('شاهد نموذج رسالة', 'seasonal_preview')),
    text(`-# الإشعار: ${user.delivery === 'silent' ? 'في الخاص بلا تنبيه' : 'الجوال وسطح المكتب حسب إعدادات جهازك'}. يتبع اختيار إشعار المجلس والمؤقّت.`),
    ...(user.paused || user.dmBlocked ? [section(user.dmBlocked ? 'اختبر الخاص لاستئناف وصول الرسائل.' : 'الإيقاف المؤقت يشمل مواسم الخير.', button(user.dmBlocked ? 'اختبر الخاص' : 'استئناف التنبيهات', user.dmBlocked ? 'test_dm' : 'resume'))] : []),
    row(backButton('reminders'), button('الرئيسية', 'home'))
  ], { ephemeral: true, accent: BRAND.gold });
}

export function seasonalReminderPayload(event, { silent = false, preview = false } = {}) {
  const card = SEASONAL_CARDS[event.key];
  if (!card) throw new RangeError('Unknown seasonal reminder');
  const date = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(event.referenceDay + 'T09:00:00Z'));
  const content = [card.title, card.context, `«${card.text}»`, card.source.reference,
    ...(card.qualifier ? [card.qualifier] : []),
    `\n${event.confirmed ? 'الموعد في السعودية' : 'الموعد المتوقع في السعودية'}: ${date}. قد يختلف في بلدك.`].join('\n');
  if (preview) return envelope([
    text(`-# نموذج فقط · لا تُرسل رسالة ولا يتفعّل اشتراك\n## ${card.title}\n${content.split('\n').slice(1).join('\n')}`),
    row(button('المصدر والتوضيح', `seasonal_source_${event.key}`), button('نموذج آخر', `seasonal_preview_${event.key === 'arafah' ? 'dhul-hijjah' : 'arafah'}`)),
    row(backButton('seasonal'))
  ], { ephemeral: true, accent: BRAND.gold });
  return notification(content, [row(button('المصدر والتوضيح', `seasonal_source_${event.key}`), button('إيقاف مواسم الخير', 'seasonal_off'))], { silent });
}

export function seasonalSourcePayload(key) {
  const card = SEASONAL_CARDS[key];
  if (!card) throw new RangeError('Unknown seasonal source');
  return envelope([
    text(`## مصدر التذكير\n${card.title}\n${sourceDetails(card.source)}`),
    text(card.source.note),
    text('-# العنوان والتاريخ وتقديم الاقتباس من صياغة رفيق. الإرسال قبل يومين تنظيم للتذكير، وليس توقيتًا تعبديًا. تقويم السعودية مرجع للتنبيه المبكر، وقد يختلف إعلان بلدك.'),
    row(linkButton('افتح المصدر', card.source.url), button('ملاحظة على المحتوى', 'support')),
    row(backButton('seasonal'), button('الرئيسية', 'home'))
  ], { ephemeral: true, accent: BRAND.gold });
}

export function prayerLocationPayload(notice = '', p = DEFAULT_PRAYER) {
  return envelope([
    text(`## أي مدينة تريد مواقيتها؟${notice ? `\n${notice}` : ''}\nاكتب المدينة بالعربية أو بلغتها، وأضف الدولة لتمييز المدن المتشابهة. مثال: **مكة المكرمة، السعودية**. ثم اختر النتيجة الصحيحة بنفسك.`),
    text(cityReminderDisclosure(p)),
    text('عند الحاجة للبحث عبر الإنترنت، يُرسل اسم المدينة والدولة إلى Open-Meteo، دون معرّف حسابك في ديسكورد. نحفظ المدينة المختارة ومنطقتها الزمنية وإحداثيات مركزها ضمن بيانات البوت المشفّرة.'),
    text('-# لا نحتاج عنوانك أو موقعك الدقيق. يمكنك حذف اختيارك من الخصوصية. بيانات المدن: [GeoNames](https://www.geonames.org/) و[Open-Meteo](https://open-meteo.com/en/docs/geocoding-api).'),
    row(button('ابحث عن مدينة', 'prayer_city_modal', 3)),
    row(backButton('prayer'), button('الرئيسية', 'home'))
  ], { ephemeral: true, accent: BRAND.blue });
}

export function prayerCitiesPayload(cities, token, p = DEFAULT_PRAYER) {
  return envelope([
    text('## اختر المدينة الصحيحة\nراجع الدولة والمنطقة قبل الحفظ.'),
    text(cityReminderDisclosure(p)),
    prayerSelect(`prayer_city_${token}`, p.city ? 'نتائج البحث — غيّر مدينتك' : 'اختر مدينتك وفعّل دعاء الجمعة والقضاء', cities.map((city, i) => [String(i), city.label]), null),
    text('-# بيانات المدن: [GeoNames](https://www.geonames.org/) و[Open-Meteo](https://open-meteo.com/en/docs/geocoding-api). تنتهي هذه النتائج بعد ١٠ دقائق.'),
    row(backButton('prayer_location'), button('بحث جديد', 'prayer_city_modal'))
  ], { ephemeral: true, accent: BRAND.blue });
}

export function prayerCalculationPayload(p = DEFAULT_PRAYER, notice = '') {
  return envelope([
    text(`## ضبط الحساب${notice ? `\n${notice}` : ''}\nاختر الطريقة التي تطابق الجدول المعتمد عندك. تغيير الحساب يوقف تذكيرات الصلاة والجمعة والقضاء والأذكار والقراءة؛ راجع الجدول ثم أعد تفعيل ما تحتاجه.`),
    prayerSelect('prayer_method', 'طريقة الحساب', [['none', 'اختر طريقة الحساب'], ...PRAYER_METHODS], p.method || 'none'),
    text('-# حساب العصر معتمد عند بلوغ ظل الشيء مثله، بعد استثناء ظل الزوال.'),
    text('**تقدير الفجر والعشاء عند قِصر الليل**\nاختر التقدير المعتمد محليًا. هذه خيارات حسابية، وليست فتوى في الترجيح بينها. لا نضع جدولًا بديلًا لليل أو نهار قطبي متصل.'),
    prayerSelect('prayer_highLatitude', 'تقدير المواقيت عند قِصر الليل', PRAYER_HIGH_LATITUDE, p.highLatitude),
    text(`التعديل بالدقائق: ${PRAYERS.map(([, label], i) => `${label} ${p.adjustments[i] > 0 ? '+' : ''}${p.adjustments[i]}`).join(' · ')}`),
    ...(p.method === 'UmmAlQura' ? [text(`العشاء في هذا الحساب: ${p.ramadanIsha ? '١٢٠' : '٩٠'} دقيقة بعد الغروب، قبل تعديلك. اختر ١٢٠ في رمضان إذا وافق جدولك المحلي، وأعدها إلى ٩٠ بعده.`), row(button(p.ramadanIsha ? 'العشاء: ٩٠ دقيقة' : 'العشاء: ١٢٠ دقيقة', 'prayer_ramadan'))] : []),
    row(button('تعديل الدقائق', 'prayer_adjust_modal')),
    row(backButton('prayer'), button('الرئيسية', 'home'))
  ], { ephemeral: true, accent: BRAND.blue });
}

export function prayerAudioPayload(p = DEFAULT_PRAYER, sounds = []) {
  return envelope([
    text('## الإشعار والصوت\nاختر كيف تصلك تذكيرات الصلاة والجمعة والقضاء والأذكار والقراءة. لقراءة التذكير من إشعار الهاتف، اختر «إشعار الجوال وسطح المكتب» واسمح بمعاينة الرسائل في إعدادات جهازك.'),
    prayerSelect('prayer_delivery', 'كيف يصلك التذكير؟', [['normal', 'إشعار الجوال وسطح المكتب'], ['silent', 'في الخاص، بلا تنبيه']], p.delivery),
    text('-# «بلا تنبيه» يمنع إشعار الدفع، ولا يعني إشعارًا بلا صوت. ظهور الإشعار وطول المعاينة والصوت تتبع إعدادات ديسكورد وجهازك.'),
    text('**الصوت المخصص للصلوات الخمس**\nيمكن إضافة ملفات صوتية هنا لاحقًا. اختيار ملف يرفقه بتذكير الصلاة لتشغيله بيدك؛ لا يبدأ تلقائيًا ولا يُسمع لبقية القناة. تشغيل صوت خاص تلقائيًا أثناء اللعب يحتاج تطبيقًا مرافقًا على جهازك؛ هذه الإمكانية لم تُضف بعد.'),
    ...(sounds.length ? [prayerSelect('prayer_sound', 'ملف صوتي اختياري', [['none', 'دون ملف صوتي'], ...sounds.map(sound => [sound.id, sound.label])], sounds.some(s => s.id === p.soundId) ? p.soundId : 'none')] : [text('-# لم تُضف ملفات صوتية بعد. الإشعار المعتاد متاح الآن، ولا يتجاوز الكتم أو وضع عدم الإزعاج.')]),
    row(button('اختبر الإشعار', 'prayer_test'), button('مساعدة إشعار الجوال', 'notification_help')),
    row(backButton('reminders'), button('الرئيسية', 'home'))
  ], { ephemeral: true, accent: BRAND.blue });
}

export function prayerReminderPayload(p, event, sound = null) {
  const payload = notification([
    `حان موعد ${event.label} بحسب جدولك المحسوب — ${p.city.label} · ${prayerClock(event.at, p.city.timezone)}`,
    `${PRAYER_METHODS.find(([id]) => id === p.method)[1]} · ${p.city.timezone}`,
    ...(sound ? [`ملف اختياري: ${sound.label} — اضغط لتنزيله أو تشغيله، ولا يبدأ تلقائيًا.`] : [])
  ].join('\n'), [
    row(button('مواقيتي وإعداداتي', 'prayer'), button('إيقاف تذكير الصلاة', 'prayer_disable'))
  ], { silent: p.delivery === 'silent' });
  if (sound) payload.attachments = [{ id: '0', filename: sound.filename, soundId: sound.id }];
  return payload;
}

export function prayerTestPayload(p = DEFAULT_PRAYER, sound = null) {
  const payload = notification([
    'تجربة إشعار رفيق — هذه رسالة اختبار طلبتها الآن، وليست إعلانًا عن دخول وقت صلاة.',
    p.delivery === 'silent' ? 'اخترت «في الخاص، بلا تنبيه»؛ لا يُطلب إشعار دفع لهذه الرسالة.' : 'اخترت إشعار الجوال وسطح المكتب. ظهوره ومعاينة النص يعتمدان على إعدادات ديسكورد وجهازك.',
    ...(sound ? [`ملف اختياري: ${sound.label} — لا يبدأ تلقائيًا.`] : [])
  ].join('\n'), [
    row(button('إعدادات إشعاري', 'prayer_audio'), button('مساعدة إشعار الجوال', 'notification_help'))
  ], { silent: p.delivery === 'silent' });
  if (sound) payload.attachments = [{ id: '0', filename: sound.filename, soundId: sound.id }];
  return payload;
}

export function prayerModal(action, p = DEFAULT_PRAYER) {
  const field = (id, label, value, placeholder, maxLength) => ({ type: 18, label, component: { type: 4, custom_id: id, style: 1, required: true, max_length: maxLength, ...(value !== null ? { value } : {}), placeholder } });
  if (action === 'prayer_city_modal') return { custom_id: 'rafiq:v1:prayer_search', title: 'اختر مدينتك', components: [field('city', 'اسم المدينة، الدولة', null, 'مثال: مكة المكرمة، السعودية', 80)] };
  if (action === 'prayer_adjust_modal') return { custom_id: 'rafiq:v1:prayer_adjust', title: 'تعديل المواقيت بالدقائق', components: PRAYERS.map(([id, label], i) => field(id, label, String(p.adjustments[i]), 'بين -60 و60؛ مثل +2 أو -3', 3)) };
  throw new RangeError('Unknown modal');
}
export const MODAL_ACTIONS = Object.freeze(['prayer_city_modal', 'prayer_adjust_modal', 'daily_quran_modal', ...['morning', 'evening'].flatMap(key => ['before', 'after'].map(direction => `daily_offset_${key}_${direction}_modal`))]);
export function appModal(action, p = DEFAULT_PRAYER) {
  const setup = action.startsWith('setup_');
  const raw = setup ? action.slice(6) : action;
  let modal;
  if (raw.startsWith('prayer_')) modal = prayerModal(raw, p);
  else if (/^daily_offset_(morning|evening)_(before|after)_modal$/.test(raw)) {
    const [, key, direction] = /^daily_offset_(morning|evening)_(before|after)_modal$/.exec(raw);
    const before = direction === 'before', offset = p.daily[key].offsetMinutes;
    modal = { custom_id: `rafiq:v1:daily_offset_${key}_${direction}`, title: `موعد أذكار ${key === 'morning' ? 'الصباح' : 'المساء'}`, components: [{ type: 18,
      label: `${before ? 'قبل' : 'بعد'} أذان ${key === 'morning' ? 'الفجر' : 'المغرب'} بكم دقيقة؟ (١–٦٠)`,
      component: { type: 4, custom_id: 'minutes', style: 1, required: true, max_length: 2, placeholder: 'مثال: 10',
        value: String(offset && (offset < 0) === before ? Math.abs(offset) : Math.abs(DEFAULT_ADHKAR_OFFSET_MINUTES)) } }] };
  }
  else {
    if (raw !== 'daily_quran_modal') throw new RangeError('Unknown modal');
    const value = p.daily.quran.time;
    modal = { custom_id: 'rafiq:v1:daily_time_quran', title: 'موعد قراءة القرآن', components: [{ type: 18,
      label: 'الساعة بتوقيت مدينتك — 24 ساعة',
      component: { type: 4, custom_id: 'time', style: 1, required: true, max_length: 5,
        placeholder: 'مثال: 20:30', ...(value !== null ? { value } : {}) } }] };
  }
  if (setup) modal.custom_id = modal.custom_id.replace('rafiq:v1:', 'rafiq:v1:setup_');
  return modal;
}

export function setupStartPayload(p = DEFAULT_PRAYER, user = {}) {
  return envelope([
    text('## أهلًا بك في رفيق 🌿\nنضبط مساحتك في ثلاث خطوات بسيطة.'),
    text('**١ · مدينتك** → ٢ · تذكيراتك → ٣ · تجربة الإشعار'),
    section(`**مواسم الخير · ${seasonalStatus(user)}**\n${user.seasonalAt == null ? 'مع البدء تصلك رسائل موسمية قليلة في الخاص، ويمكنك إيقافها.' : user.seasonalAt > 0 ? 'تذكير واحد لكل موسم، دون الحاجة إلى مدينة أو تفعيل منفصل.' : 'أوقفتها سابقًا؛ اختيارك محفوظ.'}`, button(user.seasonalAt == null ? 'ابدأ مع رفيق' : 'إدارة مواسم الخير', user.seasonalAt == null ? 'setup_start' : 'setup_seasonal', user.seasonalAt == null ? 3 : 2)),
    text(p.city ? `مدينتك المحفوظة: **${p.city.label}**\nتستخدم التذكيرات هذا التوقيت. يمكنك إبقاء المدينة أو تغييرها.` : 'ابدأ باختيار مدينتك لتظهر المواقيت والتذكيرات بتوقيتك. نحتاج اسم المدينة فقط، ولا نطلب عنوانك.'),
    text(cityReminderDisclosure(p)),
    text('-# عند الحاجة للبحث عبر الإنترنت، يُرسل اسم المدينة إلى Open-Meteo دون معرّف حسابك.'),
    row(button(p.city ? 'غيّر المدينة' : 'اختر مدينتي', 'setup_prayer_city_modal', p.city ? 2 : 3), ...(p.city ? [button('التالي: تذكيراتي', 'setup_choices', 3)] : [])),
    ...(!p.city ? [row(button('أختار المدينة لاحقًا', 'setup_choices'))] : []),
    row(backButton('home'))
  ], { ephemeral: true });
}

export function setupChoicesPayload(p, user) {
  const status = active => active ? 'مفعّل' : 'غير مفعّل';
  return envelope([
    text(`## اختر ما ينفعك\n١ · مدينتك${p.city ? ' ✓' : ''} → **٢ · تذكيراتك** → ٣ · تجربة الإشعار\n${p.city?.label || 'يمكنك اختيار المدينة لاحقًا'}`),
    section(`**كفارة المجلس** · ${status(user.enabled && user.subscribedHere)}`, button('ضبط المجلس', 'setup_reminder_intro')),
    section(`**الصلوات الخمس** · ${status(p.enabled)}`, button('راجع المواقيت', 'setup_prayer')),
    section(`**الصباح والمساء** · ${status(p.daily.morning.activatedAt || p.daily.evening.activatedAt)}\nثلاثة أذكار في رسالة واحدة لكل وقت تفعّله.`, button('اختيار الأذكار', 'setup_daily')),
    section(`**قراءة القرآن** · ${status(p.daily.quran.activatedAt)}\nتذكير اختياري بموعد تحدده بنفسك.`, button('موعد القراءة', 'setup_daily_quran')),
    section(`**الجمعة وقضاء رمضان**\n${OCCASIONS.map(([key, label]) => `${label}: ${status(p.occasions[key])}`).join(' · ')}`, button('عرض الخيارات', 'setup_prayer_occasions')),
    section(`**مواسم الخير** · ${seasonalStatus(user)}\nتذكير واحد لكل موسم؛ لا يحتاج مدينة.`, button('مواسم الخير', 'setup_seasonal')),
    text('-# اختياراتك تُحفظ فورًا. يمكنك إيقاف أي تذكير أو تعديله لاحقًا من «يومي».'),
    row(backButton('setup'), button('التالي: تجربة الإشعار', 'setup_test', 3))
  ], { ephemeral: true });
}

export function setupTestPayload(p, user, notice = '') {
  return envelope([
    text(`## جرّب وصول الإشعار\n١ · مدينتك${p.city ? ' ✓' : ''} → ٢ · تذكيراتك → **٣ · تجربة الإشعار**${notice ? `\n${notice}` : ''}`),
    text(`إشعار الصلاة والأذكار والقرآن: **${p.delivery === 'normal' ? 'الجوال وسطح المكتب' : 'في الخاص بلا تنبيه'}**.\nإشعار المجلس والمؤقّت ومواسم الخير: **${user.delivery === 'normal' ? 'الجوال وسطح المكتب' : 'في الخاص بلا تنبيه'}**.`),
    text('نرسل التجربة فقط عند ضغط الزر. وصول الرسالة لا يثبت ظهور إشعار على هاتفك؛ تأكد بنفسك من إعدادات ديسكورد والجهاز.'),
    row(button('أرسل تجربة', 'setup_send_test', 3), button('ضبط الإشعار', 'setup_prayer_audio')),
    row(backButton('setup_choices'), button('انتهيت — يومي', 'today', 3))
  ], { ephemeral: true });
}

// Keep the existing, tested settings screens inside the onboarding journey.
export function setupWrapPayload(payload) {
  const wrapped = structuredClone(payload);
  // Keep local controls while the final button returns to the guided journey.
  for (const block of wrapped.components) {
    block.components = block.components.filter(item => {
      if (item.type !== 1) return true;
      item.components = item.components.filter(child => child.label === 'رجوع' || !['rafiq:v1:home', 'rafiq:v1:reminders'].includes(child.custom_id));
      return item.components.length > 0;
    });
  }
  const visit = item => {
    if (item.custom_id?.startsWith('rafiq:v1:') && !item.custom_id.startsWith('rafiq:v1:setup_')) {
      const action = item.custom_id.slice(9);
      item.custom_id = ['home', 'cancel', 'reminders'].includes(action) ? 'rafiq:v1:setup_choices' : `rafiq:v1:setup_${action}`;
    }
    item.components?.forEach(visit);
    if (item.accessory) visit(item.accessory);
  };
  wrapped.components.forEach(visit);
  wrapped.components[0].components.push(row(button('متابعة الإعداد', 'setup_continue', 3)));
  return wrapped;
}

function dailyOffsetDescription(p, key) {
  const offset = p.daily[key].offsetMinutes, prayer = key === 'morning' ? 'الفجر' : 'المغرب';
  const minutes = Math.abs(offset), unit = minutes >= 3 && minutes <= 10 ? 'دقائق' : 'دقيقة';
  return offset === 0 ? `عند أذان ${prayer} حسب مواقيت مدينتك.` : `${offset < 0 ? 'قبل' : 'بعد'} أذان ${prayer} بـ${arabicNumber(minutes)} ${unit} حسب مواقيت مدينتك.`;
}
export function dailyOffsetPayload(p, key, notice = '') {
  if (!['morning', 'evening'].includes(key)) throw new RangeError('Unknown adhkar period');
  return envelope([
    text(`-# تذكيراتي / الأذكار / الموعد\n## موعد أذكار ${key === 'morning' ? 'الصباح' : 'المساء'}${notice ? `\n${notice}` : ''}\nالموعد الحالي: **${dailyOffsetDescription(p, key)}**`),
    text('اختر قبل الأذان أو بعده، ثم أدخل عدد الدقائق من ١ إلى ٦٠. يمكنك أيضًا اختيار وقت الأذان نفسه.\nاختيارك لهذه الفترة فقط؛ موعد الفترة الأخرى يبقى كما هو.'),
    row(button('قبل الأذان', `daily_offset_${key}_before_modal`), button('عند الأذان', `daily_offset_${key}_at`), button('بعد الأذان', `daily_offset_${key}_after_modal`)),
    text('-# التوقيت لتنظيم التنبيه؛ الاختيار المبكر تذكير مسبق. لا يحدد رفيق وقتًا شرعيًا للذكر ولا يحتاج وقت الإقامة.'),
    row(button('إعادة إلى قبل الأذان بـ١٠ دقائق', `daily_offset_${key}_reset`)),
    row(backButton(`daily_${key}`), button('الرئيسية', 'home'))
  ], { ephemeral: true });
}

export function dailySettingsPayload(p = DEFAULT_PRAYER, { notice = '', events = [], paused = false, dmBlocked = false } = {}) {
  return envelope([
    text(`-# تذكيراتي / الأذكار\n## أذكار الصباح والمساء${notice ? `\n${notice}` : ''}\nثلاثة أذكار في رسالة واحدة لكل فترة تفعّلها.`),
    ...(!p.city ? [section('**اختر مدينتك أولًا**\nلنحدد وقت الفجر والمغرب عندك.', button('اختر مدينتي', 'prayer_location', 3))] : [text(`-# ${p.city.label}`)]),
    ...['morning', 'evening'].flatMap(key => [separator(), section(`### ${key === 'morning' ? 'أذكار الصباح' : 'أذكار المساء'}\n**${reminderStatus(p.daily[key].activatedAt)}**\n${dailyOffsetDescription(p, key)}`, button(key === 'morning' ? 'ضبط الصباح' : 'ضبط المساء', `daily_${key}`))]),
    ...(dmBlocked || paused ? [text(dmBlocked ? 'الإرسال معلّق: اختبر الخاص من الإعدادات.' : 'التذكيرات متوقفة مؤقتًا من إعداداتك.')] : []),
    separator(),
    row(button('تذكير القراءة', 'daily_quran'), button('أقرأ الآن', 'explore')),
    row(backButton('reminders'), button('الرئيسية', 'home'))
  ], { ephemeral: true });
}

export function dailyDetailPayload(p = DEFAULT_PRAYER, key, { notice = '', events = [], paused = false, dmBlocked = false } = {}) {
  const title = DAILY_REMINDERS.find(([id]) => id === key)?.[1];
  if (!title) throw new RangeError('Unknown daily reminder');
  const item = p.daily[key], isQuran = key === 'quran', active = Boolean(item.activatedAt);
  const next = active && !paused && !dmBlocked ? events.find(e => e.key === key) : null;
  const timing = isQuran ? item.time ? `كل يوم عند **${item.time}** بتوقيت مدينتك.` : 'لم تختَر موعدًا بعد.' : dailyOffsetDescription(p, key);
  return envelope([
    text(`-# تذكيراتي / ${isQuran ? 'قراءة القرآن' : 'الأذكار'}\n## ${title}\n**${reminderStatus(active)}**${active && (paused || dmBlocked) ? ' · الإرسال معلّق' : ''}${notice ? `\n\n${notice}` : ''}`),
    text(isQuran ? 'رسالة يومية تذكّرك بقراءة ما تيسّر، في موعد تختاره.' : 'ثلاثة أذكار مختارة تصلك معًا في رسالة خاصة واحدة.'),
    separator(),
    section(`**موعد التذكير**\n${timing}${p.city ? `\n-# ${p.city.label}` : ''}`, button(isQuran ? 'ضبط الموعد' : 'تعديل الموعد', isQuran ? 'daily_quran_modal' : `daily_offset_${key}`)),
    ...(next ? [text(`-# التذكير القادم: <t:${Math.floor(next.at / 1000)}:f>`)] : []),
    ...(!p.city ? [section('**المدينة مطلوبة للتفعيل**\nاحفظ مدينتك ثم عد إلى هذا التذكير.', button('اختر مدينتي', 'prayer_location', 3))]
      : dmBlocked ? [section('**تعذّر وصول الخاص**\nاختبره قبل استئناف الإرسال.', button('اختبر الخاص', 'test_dm', 3))]
      : paused ? [section('**التذكيرات متوقفة مؤقتًا**', button('استئناف التنبيهات', 'resume', 3))] : []),
    row({ ...button(active ? 'إيقاف هذا التذكير' : 'تفعيل هذا التذكير', `daily_${active ? 'off' : 'enable'}_${key}`, active ? 2 : 3), disabled: !active && (!p.city || !p.method || (isQuran && !item.time) || paused || dmBlocked) }, ...(!isQuran ? [button('اقرأ الأذكار الآن', `daily_${key}_read`)] : [])),
    text(`-# ${active ? 'يمكنك إيقافه مع بقاء الموعد محفوظًا.' : 'حفظ الموعد وحده لا يفعّل التذكير.'}${!isQuran && item.offsetMinutes < 0 ? ' هذا موعد تنبيه مبكر قبل الأذان.' : ''}`),
    row(button('ضبط الإشعار', 'prayer_audio')),
    separator(), row(backButton(isQuran ? 'reminders' : 'daily'), button('الرئيسية', 'home'))
  ], { ephemeral: true });
}

const dailyText = period => DAILY_DHIKR.map((card, i) => `${arabicNumber(i + 1)} · ${card.title}${card.repeat ? ` — ${arabicNumber(card.repeat)} مرات` : ''}\n${card.text || card[period]}\n${card.source.reference}`).join('\n\n');
export function dailyReadingPayload(period) {
  if (!['morning', 'evening'].includes(period)) throw new RangeError('Unknown period');
  return envelope([text(`## أذكار ${period === 'morning' ? 'الصباح' : 'المساء'}\nثلاثة أذكار مختارة\n\n${dailyText(period)}`),
    row(button('المصادر والتوضيح', `daily_sources_${period}`), button('ضبط تذكيري', `daily_${period}`)),
    row(backButton('explore'), button('الرئيسية', 'home'))], { ephemeral: true });
}
export function dailySourcesPayload(period = null) {
  if (period !== null && !['morning', 'evening'].includes(period)) throw new RangeError('Unknown period');
  return envelope([
    text('## مصادر الأذكار المختارة'),
    ...DAILY_DHIKR.map(card => text(`**${card.title}**\n${sourceDetails(card.source)}\n${card.source.note}`)),
    text('الثلاثة اختصار للمحتوى، وليست حصرًا للأذكار المشروعة. توقيت الإشعار الذي تختاره تنظيم للتذكير، وليس وقتًا شرعيًا مخصوصًا للذكر. [بيان وقت أذكار الصباح والمساء — ابن باز](https://binbaz.org.sa/fatwas/14478/وقت-اذكار-الصباح-والمساء).'),
    row(button('تذكير الأذكار', 'daily')),
    row(backButton(period ? `daily_${period}_read` : 'explore'), button('الرئيسية', 'home'))
  ], { ephemeral: true });
}
export function dailyReminderPayload(p, event) {
  if (event.key === 'quran') return notification('حان الموعد الذي اخترته لقراءة القرآن 🌿\nافتح مصحفك واقرأ ما تيسر لك.', [row(button('تعديل الموعد', 'daily'), button('إيقاف تذكير القراءة', 'daily_off_quran'))], { silent: p.delivery === 'silent' });
  if (!['morning', 'evening'].includes(event.key)) throw new RangeError('Unknown daily reminder');
  return notification(`${p.daily[event.key].offsetMinutes < 0 ? 'تذكير مبكر حسب اختيارك: ' : ''}أذكار ${event.key === 'morning' ? 'الصباح' : 'المساء'} — ثلاثة أذكار مختارة\n\n${dailyText(event.key)}`, [row(button('المصادر', 'daily_sources'), button('تذكيري', 'daily'), button('إيقاف هذا التذكير', `daily_off_${event.key}`))], { silent: p.delivery === 'silent' });
}

export function todayPayload({ p = DEFAULT_PRAYER, user = {}, now = Date.now(), nextPrayer = null, next = null, subscribed = false } = {}) {
  const blocked = user.dmBlocked || user.pausedUntil > now;
  const labels = { seasonal: 'مواسم الخير', break: 'الاستراحة', morning: 'أذكار الصباح', evening: 'أذكار المساء', quran: 'قراءة القرآن', fridayPrayer: 'الاستعداد للجمعة', fridayDua: 'دعاء الجمعة', qada30: 'قضاء رمضان', qada15: 'قضاء رمضان', ...Object.fromEntries(PRAYERS) };
  return envelope([
    text(`## يومي مع رفيق 🌿\n${p.city ? p.city.label : 'اختر مدينتك لتظهر مواقيتك هنا.'}`),
    text(nextPrayer ? `الصلاة القادمة: **${nextPrayer.label}** <t:${Math.floor(nextPrayer.at / 1000)}:R> · ${prayerClock(nextPrayer.at, p.city.timezone)}` : 'لم يظهر جدول الصلاة بعد؛ اختر المدينة وراجع المواقيت.'),
    text(blocked ? user.dmBlocked ? 'الإرسال معلّق: اختبر الخاص من إعداداتك.' : 'التنبيهات متوقفة مؤقتًا.' : next ? `التذكير المجدول القادم: **${labels[next.key]}** <t:${Math.floor(next.at / 1000)}:f>.` : 'لا يوجد موعد قادم متاح للتذكيرات المختارة. راجع الخيارات والمواقيت أدناه.'),
    section(`**المجلس** · ${user.enabled && subscribed ? 'مفعّل؛ بعد مغادرة مجلس مؤهل' : 'غير مفعّل'}`, button('المجلس', 'settings')),
    section(`**الصلوات الخمس** · ${p.enabled ? 'مفعّلة' : 'غير مفعّلة'}`, button('مواقيتي', 'prayer')),
    section(DAILY_REMINDERS.map(([key, label]) => `**${label}** · ${p.daily[key].activatedAt ? 'مفعّل' : 'غير مفعّل'}`).join('\n'), button('أذكاري وقراءتي', 'daily')),
    section(OCCASIONS.map(([key, label]) => `**${label}** · ${p.occasions[key] ? 'مفعّل' : 'غير مفعّل'}`).join('\n'), button('الجمعة والقضاء', 'prayer_occasions')),
    section(`**مواسم الخير** · ${seasonalStatus(user)}\nتعمل دون مدينة.`, button('مواسم الخير', 'seasonal')),
    ...(user.breakAt > now ? [text(`مؤقّت الاستراحة: <t:${Math.floor(user.breakAt / 1000)}:R>.`)] : []),
    row(backButton('home'), button('تحديث', 'today'), button('كل التذكيرات', 'reminders'))
  ], { ephemeral: true });
}
export function reminderPayload({ silent = false, preview = false, enabled = true, paused = false } = {}) {
  if (!preview) return notification(`كفارة المجلس: ${COPY.dhikr.replaceAll('\n', ' ')}\n${DHIKR_CARDS[0].source.reference}`, [
    row(button('المصدر والتوضيح', 'source_majlis'), button('تذكيري', 'settings'), button(paused ? 'استئناف التذكير' : 'إيقاف ٢٤ ساعة', paused ? 'resume' : 'pause_today'))
  ], { silent });
  return envelope([
    text(`### 🌿 ${COPY.reminderTitle}\n${quotation(COPY.dhikr)}`),
    text(`-# ${DHIKR_CARDS[0].source.reference}`),
    separator(),
    row(button('المصدر والتوضيح', 'source_majlis')),
    preview && !enabled
      ? row(button('فعّل تذكيري', 'enable', 3))
      : row(button('تذكيري', 'settings'), button(paused ? 'استئناف التذكير' : 'إيقاف ٢٤ ساعة', paused ? 'resume' : 'pause_today')),
    row(backButton('reminder_intro'), button('الرئيسية', 'home'))
  ], { silent, ephemeral: preview });
}
const frequencyDescription = frequency => frequency === 'daily'
  ? 'مرة كل ٢٤ ساعة كحد أقصى'
  : `بفاصل ساعتين على الأقل، وحتى ${frequency === 'session5' ? '٥' : '٣'} مرات خلال ٢٤ ساعة`;
export function reminderIntroPayload({ enabled = false, subscribedHere = true, frequency = 'session', delivery = 'normal' } = {}) {
  return envelope([
    text('## تذكير المجلس، باختيارك 🌿\nشاهد شكل الرسالة أولًا، ثم قرّر إن كنت تريد وصولها في الخاص.'),
    text('بعد مجلس صوتي مشترك مدته ٥ دقائق أو أكثر، ينتظر رفيق دقيقة بعد خروجك لاحتمال عودتك.'),
    text(`اختيارك الحالي: ${frequencyDescription(frequency)} · ${delivery === 'normal' ? 'بتنبيه عادي حسب إعدادات ديسكورد' : 'في الخاص بلا تنبيه دفع أو سطح مكتب'}.`),
    text('-# الذكر عند القيام من المجلس؛ مهلة الإرسال لتنظيم التنبيه. يمكنك إيقاف التذكير متى شئت.'),
    separator(), row(button('شاهد نموذج الرسالة', 'preview'), button(enabled && subscribedHere ? 'ضبط تذكيري' : 'فعّل تذكير المجلس', enabled && subscribedHere ? 'settings' : 'enable', 3)),
    row(backButton('reminders'), button('الرئيسية', 'home'))
  ], { ephemeral: true });
}
export function enabledPayload({ frequency = 'session' } = {}) {
  return envelope([
    text('## تذكيرك جاهز 🌿\nأذكّرك في الخاص بعد خروجك من الصوت، إذا استمرت جلستك ٥ دقائق على الأقل وحضر معك شخص آخر.'),
    text(`-# ${frequencyDescription(frequency)} · ننتظر دقيقة لاحتمال عودتك`),
    separator(),
    row(button('اختبر الخاص', 'test_dm'), button('ضبط التذكير', 'settings')),
    row(backButton('reminders'), button('الرئيسية', 'home'))
  ], { ephemeral: true });
}
export function settingsPayload({ frequency = 'session', delivery = 'normal', enabled = false, subscribedHere = true, inGuild = false, paused = false, pausedUntil = 0, dmBlocked = false, notice = '' } = {}) {
  if (!['daily', 'session', 'session5'].includes(frequency) || !['normal', 'silent'].includes(delivery)) throw new RangeError('Invalid reminder preference');
  const select = (id, placeholder, options, selected) => row({
    type: 3, custom_id: `rafiq:v1:${id}`, placeholder, min_values: 1, max_values: 1,
    options: options.map(([value, label, description]) => ({ value, label, description, default: value === selected }))
  });
  return envelope([
    text(`-# تذكيراتي / كفارة المجلس\n## تذكير كفارة المجلس${notice ? `\n${notice}` : ''}\n${dmBlocked ? 'تعذّر الوصول إلى الخاص؛ اختبره لاستئناف الإرسال' : paused ? 'جميع التنبيهات متوقفة مؤقتًا' : !enabled ? 'غير مفعّل' : !subscribedHere ? 'غير مفعّل في هذا السيرفر' : inGuild ? 'مفعّل في هذا السيرفر' : 'مفعّل'}`),
    ...(paused && pausedUntil ? [text(`ينتهي الإيقاف <t:${Math.floor(pausedUntil / 1000)}:R>.`)] : []),
    select('frequency', 'كم مرة؟', [
      ['session', 'بعد المجالس — حتى ٣ مرات', 'فاصل ساعتين؛ حتى ٣ مرات خلال ٢٤ ساعة'],
      ['daily', 'مرة كل ٢٤ ساعة كحد أقصى', 'خيار أخف لتقليل تكرار الرسائل'],
      ['session5', 'بعد المجالس — حتى ٥ مرات', 'فاصل ساعتين؛ حتى ٥ مرات خلال ٢٤ ساعة']
    ], frequency),
    select('delivery', 'كيف تصلك الرسالة؟', [
      ['normal', 'إشعار الجوال وسطح المكتب', 'نص التذكير في الإشعار، حسب إعدادات جهازك'],
      ['silent', 'في الخاص، بلا تنبيه', 'دون إشعار دفع أو تنبيه سطح المكتب']
    ], delivery),
    text('-# اختياراتك تُحفظ فورًا. ظهور الإشعار ومعاينة النص يتبعان إعدادات جهازك.'),
    separator(),
    text('-# التكرار للمجلس، وطريقة الإشعار للمجلس والمؤقّت ومواسم الخير. بقية التذكيرات لها إعداد إشعار مستقل.'),
    row(button(paused ? 'استئناف التنبيهات' : !subscribedHere ? 'فعّل في هذا السيرفر' : enabled ? 'إيقاف ٢٤ ساعة' : 'فعّل تذكيري', paused ? 'resume' : !enabled || !subscribedHere ? 'enable' : 'pause_today'), button('اختبر الخاص', 'test_dm')),
    ...(inGuild && subscribedHere ? [row(button('إلغاء تذكير هذا السيرفر', 'unsubscribe_here'))] : []),
    ...(!paused && (!enabled || !subscribedHere) ? [row(button('إيقاف جميع التنبيهات ٢٤ ساعة', 'pause_today'))] : []),
    row(button('مساعدة إشعار الجوال', 'notification_help')),
    row(button('إيقاف كل التنبيهات', 'disable')),
    row(backButton('reminders'), button('الرئيسية', 'home'))
  ], { ephemeral: true });
}
export function ideaPayload(index = 0, { category = 'all', favorites = [] } = {}) {
  if (!Number.isInteger(index) || index < 0) throw new RangeError('Idea index must be a nonnegative integer');
  if (category !== 'saved' && !IDEA_CATEGORIES.some(item => item.id === category)) throw new RangeError('Unknown idea category');
  const ideas = COPY.ideas.filter(item => category === 'saved' ? favorites.includes(item.id) : category === 'all' || item.category === category);
  if (!ideas.length) return noticePayload('أفكارك المحفوظة تنتظرك', 'حين تعجبك فكرة، اضغط «حفظ الفكرة» لتعود إليها بسهولة.', [backButton('favorites'), button('تصفّح الأفكار', 'idea', 3)]);
  const idea = ideas.find(item => item === COPY.ideas[index]) || ideas[0];
  const position = ideas.indexOf(idea);
  const actionAt = offset => `idea_${category}_${COPY.ideas.indexOf(ideas[(position + offset + ideas.length) % ideas.length])}`;
  return envelope([
    text(`-# 🌱 ${category === 'saved' ? 'أفكاري المحفوظة' : 'فكرة لعمل خير'} · ${arabicNumber(position + 1)} من ${arabicNumber(ideas.length)}\n## ${idea.title}\n${idea.body}`),
    text('-# صياغة تطبيقية من رفيق؛ الحديث ومصدره في «الدليل والتوضيح».'),
    row({ type: 3, custom_id: 'rafiq:v1:idea_category', placeholder: 'فكرة تناسب موقفك', min_values: 1, max_values: 1,
      options: [...IDEA_CATEGORIES, { id: 'saved', label: 'أفكاري المحفوظة', description: 'الأفكار التي اخترت حفظها للرجوع إليها' }].map(item => ({ label: item.label, description: item.description, value: item.id, default: item.id === category })) }),
    separator(),
    ...(ideas.length > 1 ? [row(...(ideas.length > 2 ? [button('الفكرة السابقة', actionAt(-1))] : []), button('فكرة أخرى', actionAt(1), 3))] : []),
    row(button(favorites.includes(idea.id) ? 'إزالة من المحفوظات' : 'حفظ الفكرة', `idea_save_${idea.id}_${category}`), button('الدليل والتوضيح', `idea_source_${idea.id}_${category}`)),
    row(backButton(category === 'saved' ? 'favorites' : 'home'), ...(category === 'saved' ? [button('الرئيسية', 'home')] : [button('محفوظاتي', 'favorites')]))
  ], { ephemeral: true, accent: BRAND.gold });
}
export function ideaSourcePayload(id, { category = 'all' } = {}) {
  const idea = ideaById(id);
  if (!idea || (category !== 'saved' && !IDEA_CATEGORIES.some(item => item.id === category))) throw new RangeError('Unknown idea');
  return envelope([
    text(`## دليل الفكرة\n${idea.title}\n${idea.evidence}`),
    text(sourceDetails(idea.source)), text(idea.source.note),
    text(`-# طابَقنا المادة مع المصادر بتاريخ ${idea.source.checkedOn}.`),
    separator(), row(backButton(`idea_${category}_${GOOD_DEEDS.indexOf(idea)}`), button('ملاحظة على المحتوى', `report_${id}`))
  ], { ephemeral: true, accent: BRAND.gold });
}
export function pausedPayload() {
  return envelope([
    text('## على راحتك 🌿\nتوقفت التنبيهات لمدة ٢٤ ساعة، وأُلغي مؤقّت الاستراحة إن وجد. يعود تذكير المجلس بعدها مع إعداداتك نفسها.'),
    separator(), row(button('استئناف الآن','resume',3),button('عرض الذكر','preview')),
    row(backButton('settings'), button('الرئيسية', 'home'))
  ], {ephemeral:true});
}
export function disabledPayload() {
  return envelope([
    text('## توقفت كل التنبيهات\nأُوقفت جميع التذكيرات، ومنها مواسم الخير، وأُلغي مؤقّت الاستراحة. مواعيدك ومحفوظاتك باقية، ويمكنك التصفّح متى أحببت.'),
    separator(), row(button('إعادة التفعيل','enable',3),button('عرض الذكر','preview')),
    row(backButton('settings'), button('الرئيسية', 'home'))
  ], {ephemeral:true});
}

function reminderCount(p, user = {}) {
  return Number(Boolean(user.enabled && user.subscribedHere)) + Number(p.enabled)
    + DAILY_REMINDERS.filter(([key]) => p.daily[key].activatedAt).length
    + OCCASIONS.filter(([key]) => p.occasions[key]).length + Number(user.seasonalAt > 0);
}
const reminderStatus = active => active ? 'مفعّل' : 'غير مفعّل';
export function homePayload({ preferences: p = DEFAULT_PRAYER, enabled = false, subscribedHere = true, paused = false, dmBlocked = false, breakAt = null, favoriteCount = 0, seasonalAt = null, now = Date.now() } = {}) {
  const count = reminderCount(p, { enabled, subscribedHere, seasonalAt });
  const timerActive = breakAt > now;
  return envelope([
    text('-# رفيق / الرئيسية\n## خيرٌ يرافقك. 🌿\nمساحة صغيرة لذكرٍ وخيرٍ في يومك.'),
    ...(dmBlocked ? [section('**تعذّر وصول رسائل التذكير**\nاختبر الخاص لتستأنف الرسائل.', button('إصلاح وصول الخاص', 'settings', 3))]
      : paused ? [section('**التذكيرات متوقفة مؤقتًا**\nاختياراتك محفوظة.', button('استئناف التنبيهات', 'resume', 3))] : []),
    section(p.city ? `**${p.city.label}**\nمواقيتك والتذكير القادم في «يومي».` : `**أول مرة هنا؟ أهلًا بك**\n${seasonalAt === null ? 'عند البدء تتفعّل «مواسم الخير» تلقائيًا: تذكيرات قليلة في الخاص، ويمكنك إيقافها. اختيار المدينة لاحقًا متاح.' : 'تابع إعداد مدينتك وتذكيراتك. يبقى اختيارك لمواسم الخير محفوظًا.'}`, button(p.city ? 'يومي' : seasonalAt === null ? 'ابدأ مع رفيق' : 'متابعة الإعداد', p.city ? 'today' : seasonalAt === null ? 'setup_start' : 'setup', 3)),
    ...(p.city && seasonalAt === null ? [section('**مواسم الخير · مفعّلة تلقائيًا عند البدء**\nمع البدء تصلك رسائل موسمية قليلة في الخاص، ويمكنك إيقافها.', button('ابدأ مع رفيق', 'setup_start', 3))] : []),
    separator(),
    section(`### تذكيراتي\n${count ? `لديك ${arabicNumber(count)} من التذكيرات المفعّلة${paused || dmBlocked ? '؛ الإرسال معلّق' : ''}.` : 'الصلاة، الأذكار، المجلس، والجمعة.'}`, button('تذكيراتي', 'reminders')),
    section('### أقرأ الآن\nأذكار الصباح والمساء، وأدعية موثّقة.', button('أقرأ الآن', 'explore')),
    section('### أفكار الخير\nخطوات بسيطة مع أهلك وأصحابك.', button('فكرة خير', 'idea')),
    separator(),
    ...(timerActive ? [text(`-# مؤقّت الاستراحة يعمل · <t:${Math.floor(breakAt / 1000)}:R>`)] : []),
    row(button(timerActive ? 'إدارة المؤقّت' : 'مؤقّت استراحة', 'break'), button(favoriteCount ? `محفوظاتي · ${arabicNumber(favoriteCount)}` : 'محفوظاتي', 'favorites')),
    row(button('المساعدة', 'help'), button('بياناتي وخصوصيتي', 'privacy'))
  ], { ephemeral: true });
}

export function remindersMenuPayload(p = DEFAULT_PRAYER, user = {}) {
  const dailyCount = ['morning', 'evening'].filter(key => p.daily[key].activatedAt).length;
  const occasionCount = OCCASIONS.filter(([key]) => p.occasions[key]).length;
  return envelope([
    text('-# الرئيسية / تذكيراتي\n## بماذا أذكّرك؟\nراجع تذكيراتك وعدّل ما يناسبك.'),
    section(p.city ? `**مدينتك: ${p.city.label}**` : '**اختر مدينتك للمواقيت والأذكار**\nالمجلس والمؤقّت ومواسم الخير تعمل دون مدينة.', button(p.city ? 'تغيير المدينة' : 'اختر مدينتي', 'prayer_location', p.city ? 2 : 3)),
    ...(user.paused || user.dmBlocked ? [section(user.dmBlocked ? '**الإرسال معلّق** · اختبر وصول الخاص.' : '**الإرسال متوقف مؤقتًا** · اختياراتك باقية.', button(user.dmBlocked ? 'اختبر الخاص' : 'استئناف التنبيهات', user.dmBlocked ? 'test_dm' : 'resume', 3))] : []),
    separator(),
    section(`**كفارة المجلس** · ${reminderStatus(user.enabled && user.subscribedHere)}\nبعد مغادرة المحادثة الصوتية.`, button('تذكير المجلس', user.enabled && user.subscribedHere ? 'settings' : 'reminder_intro')),
    section(`**الصلوات الخمس** · ${reminderStatus(p.enabled)}\nعند الأذان بحسب مدينتك.`, button('مواقيت الصلاة', 'prayer')),
    section(`**أذكار الصباح والمساء** · ${dailyCount ? `${arabicNumber(dailyCount)} من ٢ مفعّل` : 'غير مفعّلة'}\nاختر وقت كل فترة على حدة.`, button('تذكير الأذكار', 'daily')),
    section(`**قراءة القرآن** · ${reminderStatus(p.daily.quran.activatedAt)}\nموعد يومي تختاره أنت.`, button('تذكير القراءة', 'daily_quran')),
    section(`**الجمعة وقضاء رمضان** · ${occasionCount ? `${arabicNumber(occasionCount)} من ٣ مفعّل` : 'غير مفعّلة'}\nالاستعداد للجمعة، الدعاء، وقضاء الصيام.`, button('الجمعة والقضاء', 'prayer_occasions')),
    section(`**مواسم الخير** · ${seasonalStatus(user)}\nتنبيه واحد قبل كل موسم بيومين تقريبًا.`, button('مواسم الخير', 'seasonal')),
    separator(), row(backButton('home'), button('يومي', 'today'))
  ], { ephemeral: true });
}

export function explorePayload() {
  return envelope([
    text('-# الرئيسية / أقرأ الآن\n## وقفة مع الذكر 🌿\nاختر ما تريد قراءته الآن، دون تفعيل تذكير.'),
    section('**أذكار الصباح**\nثلاثة أذكار مختارة مع مصادرها.', button('قراءة الصباح', 'daily_morning_read', 3)),
    section('**أذكار المساء**\nثلاثة أذكار مختارة مع مصادرها.', button('قراءة المساء', 'daily_evening_read')),
    separator(),
    section('**أذكار وأدعية**\nكفارة المجلس وأدعية لمواقف مختلفة.', button('تصفّح المكتبة', 'library')),
    row(button('محفوظاتي', 'favorites'), button('المصادر والمنهج', 'methodology')),
    row(backButton('home'))
  ], { ephemeral: true });
}

export function helpMenuPayload() {
  return envelope([
    text('-# الرئيسية / المساعدة\n## كيف أستخدم رفيق؟'),
    text('**مواسم الخير**\nمفعّلة تلقائيًا مع «ابدأ مع رفيق»: رسائل قليلة في الخاص، دون مدينة أو تفعيل منفصل. يمكن إيقافها من تذكيراتي، ويبقى الإيقاف محفوظًا. التصفح وحده لا يبدأ الرسائل.'),
    text('**١ · اضبط مدينتك**\nاختيارها لأول مرة يفعّل دعاء الجمعة وقضاء قبل رمضان في الخاص. راجع مواقيتها، وأوقف أي تذكير لا تحتاجه من «الجمعة والقضاء».\n\n**٢ · اختر بقية تذكيراتك**\nزر «تفعيل الصلاة والجمعة» يشغّلهما معًا. الأذكار والقراءة والمجلس تحتاج تفعيلًا مستقلًا؛ حفظ موعدها وحده لا يفعّلها.\n\n**٣ · جرّب الإشعار**\nالتذكيرات تصل في الخاص. ظهورها على هاتفك يتبع إعدادات ديسكورد والجهاز.'),
    row(button('ابدأ مع رفيق', 'setup_start', 3), button('مساعدة الإشعارات', 'notification_help')),
    separator(),
    row(button('المصادر والمنهج', 'methodology'), button('تواصل وإبلاغ', 'support')),
    row(backButton('home'), button('بياناتي وخصوصيتي', 'privacy'))
  ], { ephemeral: true });
}

export function favoritesPayload({ dhikrCount = 0, ideaCount = 0 } = {}) {
  return envelope([
    text('## أشياء تحب أن تعود إليها 🌿\nأذكارك وأفكارك المحفوظة، في مكان واحد.'),
    separator(),
    section(`### أذكار وأدعية\n${dhikrCount ? `عدد المحفوظات: ${arabicNumber(dhikrCount)}.` : 'احفظ ذكرًا من المكتبة ليظهر هنا.'}`, button('أذكاري المحفوظة', 'saved_dhikr', 3)),
    section(`### أفكار لعمل الخير\n${ideaCount ? `عدد المحفوظات: ${arabicNumber(ideaCount)}.` : 'احفظ فكرة تناسبك من صفحة الأفكار.'}`, button('أفكاري المحفوظة', 'saved_ideas')),
    text('-# علامات مرجعية خاصة بك؛ لا نسجّل إن كنت قد عملت بها.'),
    separator(), row(backButton('home'), button('تصفّح الأذكار', 'library'), button('تصفّح الأفكار', 'idea'))
  ], { ephemeral: true });
}

export function libraryPayload({ selectedId = 'majlis', favorites = [], onlyFavorites = false } = {}) {
  const cards = onlyFavorites ? DHIKR_CARDS.filter(card => favorites.includes(card.id)) : DHIKR_CARDS;
  if (!cards.length) return noticePayload('محفوظاتك تنتظرك', 'احفظ ذكرًا للوصول إليه بسهولة. الحفظ علامة مرجعية خاصة بك.', [backButton('favorites'), button('تصفّح الأذكار', 'library', 3), button('الرئيسية', 'home')]);
  const card = cards.find(item => item.id === selectedId) || cards[0];
  const position = cards.indexOf(card);
  const suffix = onlyFavorites ? '_saved' : '';
  return envelope([
    text(`-# ${onlyFavorites ? 'محفوظاتي' : 'أذكار موثّقة'} · ${card.category} · ${arabicNumber(position + 1)} / ${arabicNumber(cards.length)}\n## ${card.title}\n${quotation(card.text)}`),
    text(`-# ${card.source.reference}`),
    ...(cards.length > 1 ? [row({ type: 3, custom_id: `rafiq:v1:${onlyFavorites ? 'favorite_select' : 'dhikr_select'}`, placeholder: 'اختر ذكرًا', min_values: 1, max_values: 1,
      options: cards.map(item => ({ label: item.title, value: item.id, description: item.category, default: item.id === card.id })) })] : []),
    separator(),
    ...(cards.length > 1 ? [row(...(cards.length > 2 ? [button('الذكر السابق', `card_${cards[(position - 1 + cards.length) % cards.length].id}${suffix}`)] : []), button('الذكر التالي', `card_${cards[(position + 1) % cards.length].id}${suffix}`))] : []),
    row(button('المصدر والتوضيح', `source_${card.id}${suffix}`), button(favorites.includes(card.id) ? 'إزالة من المحفوظات' : 'حفظ الذكر', `favorite_${card.id}${suffix}`)),
    row(backButton(onlyFavorites ? 'favorites' : 'explore'), button('الرئيسية', 'home'))
  ], { ephemeral: true });
}

export function sourcePayload(id, { onlyFavorites = false } = {}) {
  const card = dhikrById(id);
  if (!card) throw new RangeError('Unknown dhikr');
  return envelope([
    text(`## مصدر ${card.title}\n${card.source.reference}`), text(sourceDetails(card.source)), text(card.source.note),
    text(`[شرح الشيخ ابن باز](${card.source.url})\n-# طابَقنا المادة مع المصادر بتاريخ ${card.source.checkedOn}.`),
    row(button('منهج المحتوى', 'methodology'), button('ملاحظة على المحتوى', `report_${id}`)),
    separator(), row(backButton(`card_${id}${onlyFavorites ? '_saved' : ''}`), button('الرئيسية', 'home'))
  ], { ephemeral: true });
}

export function methodologyPayload() {
  return envelope([
    text('## ذكرٌ تعرف مصدره\nنعتمد القرآن والسنة الثابتة، مع العناية بفهم السلف، ونرجع إلى شروح أهل العلم الموثوقين، ومنها شروح الشيخ ابن باز.'),
    text('نذكر مخرّج الحديث على البطاقة، وتفاصيل الرواية والحكم في «المصدر والتوضيح»، بالرجوع إلى كتب أئمة الحديث. اقتراحات رفيق العملية مميّزة عن النصوص الشرعية. لا نخصّص ذكرًا بعدد أو وقت تعبدي بلا دليل، ولا يولّد البوت فتاوى.'),
    text('-# المحفوظات للوصول السريع. لا نقاط للحسنات، ولا ترتيب للأعضاء بحسب العبادة.'),
    row(button('تصفّح الأذكار', 'library', 3)),
    separator(), row(backButton('explore'), button('الرئيسية', 'home'))
  ], { ephemeral: true });
}

export function breakPayload({ breakAt = null, notice = '', paused = false, dmBlocked = false, delivery = 'normal' } = {}) {
  return envelope([
    text(`${notice ? `${notice}\n` : ''}## وقت لاستراحة\n${breakAt ? `مؤقّتك مضبوط: <t:${Math.floor(breakAt / 1000)}:R>.` : 'اختر متى أذكّرك باستراحة من الجلسة.'}`),
    ...(paused || dmBlocked ? [text(paused ? 'التنبيهات متوقفة مؤقتًا. استأنفها من إعداداتك قبل ضبط المؤقّت.' : 'وصول الخاص معلّق. افتح إعداداتك واختبر الخاص أولًا.'), row(button('إعدادات التنبيه', 'settings'))] : []),
    text(`-# رسالة واحدة في الخاص، ${delivery === 'silent' ? 'بلا تنبيه دفع أو سطح مكتب' : 'بتنبيه حسب إعدادات ديسكورد'}. لا تتكرر تلقائيًا. تغيير المدة يستبدل المؤقّت السابق.`),
    row(button('١٥ دقيقة', 'break_15'), button('٣٠ دقيقة', 'break_30'), button('٦٠ دقيقة', 'break_60'), button('٩٠ دقيقة', 'break_90')),
    ...(breakAt ? [row(button('أضف ١٥ دقيقة', 'break_extend_15'), button('إلغاء المؤقّت', 'break_cancel'))] : []),
    row(backButton('home'))
  ], { ephemeral: true, accent: BRAND.blue });
}

export function breakReminderPayload({ silent = false } = {}) {
  return notification('حان وقت الاستراحة 🌱\nهذا هو التذكير الذي طلبته. خذ استراحتك، وراجع ما تحتاج أن تفرغ له الآن.\nانتهى المؤقّت. لن يتكرر تلقائيًا.', [
    row(button('ذكّرني بعد ١٥ دقيقة', 'break_15'), button('فكرة خير', 'idea'), button('الرئيسية', 'home'))
  ], { silent });
}

export function notificationHelpPayload() {
  return envelope([
    text('## اقرأ التذكير من إشعار جوالك\n١. في إعدادات التذكير، اختر «إشعار الجوال وسطح المكتب». للصلاة والجمعة والقضاء والأذكار والقراءة اختيار مستقل عن المجلس والمؤقّت ومواسم الخير.\n٢. في إعدادات هاتفك ← الإشعارات ← Discord، اسمح بالإشعارات ومعاينة النص في الموضع الذي يناسب خصوصيتك. تأكد من السماح بإشعارات الرسائل الخاصة ومن عدم كتم محادثة رفيق.\n٣. جرّب «اختبر الخاص» للمجلس أو «اختبر الإشعار» للصلاة.'),
    text('يرسل رفيق النص داخل الرسالة، لتتمكن من قراءته من الإشعار عندما يسمح جهازك. قد تختصر الشاشة النص أو تخفيه، وقد يمنع الكتم أو عدم الإزعاج التنبيه. وصول الرسالة للخاص لا يثبت ظهور إشعار على الهاتف.'),
    row(linkButton('إعدادات إشعارات ديسكورد', 'https://support.discord.com/hc/en-us/articles/218892547--Mobile-Notifications-Settings-101')),
    row(button('إعدادات المجلس', 'settings'), button('إشعار الصلاة والجمعة', 'prayer_audio')),
    row(backButton('help'), button('الرئيسية', 'home'))
  ], { ephemeral: true });
}

export function privacyPayload({ privacyURL, supportURL } = {}) {
  return envelope([
    text('## بياناتك واختياراتك\nنحفظ معرّفك في ديسكورد، واختياراتك، والسيرفرات التي فعّلت فيها التذكير، ومحفوظاتك ومؤقّتك. عند إعداد الصلاة نحفظ المدينة التي تختارها وإحداثيات مركزها ومنطقتها الزمنية وطريقة الحساب والتعديلات واختيار الإشعار والصوت. نحفظ أيضًا التذكيرات الاختيارية للجمعة والقضاء والأذكار والقرآن، ووقت تفعيلها ومواعيدها، ومنها الدقائق التي تختارها قبل الأذان أو بعده للأذكار؛ لا نسأل عن عدد أيام القضاء أو سببه، ولا نسجّل أداء عبادتك.'),
    text('لا نقرأ محتوى المحادثات ولا نسجّل الصوت. توقيت المجلس يبقى في الذاكرة أثناء التشغيل، وتُحفظ أوقات محاولات التذكير مؤقتًا لمنع التكرار. حذف بياناتك يوقف التنبيهات ويمحو سجلك من قاعدة البوت؛ الرسائل الموجودة في ديسكورد تبقى عندك.'),
    text('مواسم الخير لا تحتاج مدينة. نحفظ اختيار الاشتراك ووقت تفعيله، ومعرّف الموسم والسنة ووقت محاولة الإرسال مدة تصل إلى ٤٠٠ يوم لمنع التكرار السنوي، بما فيه بعد تصحيح التاريخ. لا نسجّل الصيام أو عملك بالمناسبة. الإيقاف العام والحذف يشملانها.'),
    text('-# بيانات التشغيل المحفوظة مشفّرة. ننظّف محاولات المجلس والمؤقّت بعد ٤٨ ساعة، ومحاولات الصلاة والجمعة والقضاء بعد ٧ أيام، ومحاولات مواسم الخير بعد ٤٠٠ يوم، ونزيل اشتراك السيرفر إذا أُزيل منه البوت.'),
    ...(privacyURL ? [row(linkButton('سياسة الخصوصية', privacyURL), ...(supportURL ? [linkButton('المساعدة والإبلاغ', supportURL)] : []))] : []),
    separator(), row(backButton('home'), button('حذف بياناتي', 'forget'))
  ], { ephemeral: true });
}

export function supportPayload({ supportURL, reportCard = null } = {}) {
  return envelope([
    text('## مساعدة وإبلاغ\nللإبلاغ عن خلل، أو محتوى يحتاج مراجعة، أو مشكلة خصوصية، تواصل مع مشغّل رفيق من الرابط أدناه.'),
    text('اذكر الخيار الذي واجهت فيه المشكلة وما حدث. لا ترسل كلمات مرور أو رموز دخول أو معلومات خاصة عن غيرك. يمكنك تعديل اختياراتك أو حذف بياناتك من «بياناتي».'),
    ...(reportCard ? [text(`ملاحظتك عن: ${reportCard.title}\nانسخ اسم المادة مع ملاحظتك ورابط الدليل إن توفر. فتح هذه الصفحة لا يرسل بلاغًا تلقائيًا.`)] : []),
    ...(supportURL ? [row(linkButton('تواصل مع مشغّل رفيق', supportURL))] : [text('-# المعاينة فقط: يضبط المشغّل رابط الدعم قبل تشغيل البوت.')]),
    row(button('بياناتي', 'privacy')),
    separator(), row(backButton('help'), button('الرئيسية', 'home'))
  ], { ephemeral: true });
}

export function forgetPromptPayload() {
  return noticePayload('حذف بياناتك؟', 'سيتوقف التذكير، ويُلغى المؤقّت، وتُحذف تفضيلاتك ومحفوظاتك من قاعدة البوت.', [backButton('privacy'), button('احذف بياناتي', 'forget_confirm', 4)]);
}

export function noticePayload(title, body, buttons = [backButton('home')]) {
  return envelope([text(`## ${title}\n${body}`), separator(), row(...buttons)], { ephemeral: true });
}
