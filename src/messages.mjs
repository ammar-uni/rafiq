import { DHIKR_CARDS, GOOD_DEEDS, OCCASION_CARDS, DAILY_DHIKR, IDEA_CATEGORIES, dhikrById, ideaById } from './content.mjs';
import { DEFAULT_PRAYER, DAILY_REMINDERS, ADHKAR_DELAY_MINUTES, OCCASIONS, PRAYERS, PRAYER_METHODS, PRAYER_HIGH_LATITUDE } from './prayer-config.mjs';
import { prayerClock } from './prayer-times.mjs';
/** Native Discord REST payloads. Rendering only; these functions never send messages. */
export const FLAGS = Object.freeze({ componentsV2: 32768, ephemeral: 64, silent: 4096 });
export const BRAND = Object.freeze({ name: 'رفيق', accent: 0x65ac89, gold: 0xcab17a, blue: 0x8aaec4, banner: 'rafiq-banner-v3.webp' });
export const SOURCE = DHIKR_CARDS[0].source.citations[0].url;
export const COPY = Object.freeze({
  welcomeTitle: 'خيرٌ خفيف، في وقته.',
  welcomeBody: 'ذكرٌ موثّق، وفكرة خير، ومواقيت صلاة، واستراحة في وقت تختاره. افتح مساحتك واختر ما ينفعك.',
  welcomeDetail: 'يظهر لك وحدك · التذكير بعد المجلس باختيارك · بلا منشن جماعي',
  dhikr: DHIKR_CARDS[0].text,
  reminderTitle: 'كفارة المجلس',
  ideas: GOOD_DEEDS
});
const text = content => ({ type: 10, content });
const separator = () => ({ type: 14, divider: true, spacing: 1 });
const button = (label, action, style = 2) => ({ type: 2, label, style, custom_id: `rafiq:v1:${action}` });
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
      row(button('مساحتي مع رفيق', 'home', 3), button('أذكار موثّقة', 'library'), button('فكرة خير', 'idea'))
    ], { silent: true }),
    attachments: [{ id: '0', filename: BRAND.banner, description: 'غلاف رفيق' }]
  };
}

const prayerSelect = (action, placeholder, choices, selected) => row({ type: 3, custom_id: `rafiq:v1:${action}`, placeholder,
  min_values: 1, max_values: 1, options: choices.map(([value, label]) => ({ value, label, default: value === selected })) });

export function prayerPayload({ preferences: p = DEFAULT_PRAYER, today = [], next = null, day = '', notice = '', paused = false, dmBlocked = false } = {}) {
  const ready = Boolean(p.city && p.method && today.length === 5);
  return envelope([
    text(`## 🕰️ مواقيت صلاتك${notice ? `\n${notice}` : ''}`),
    text(p.city ? `**${p.city.label}**\n-# ${p.city.timezone} · ${day}` : 'اختر مدينتك أولًا. لن نطلب عنوان منزلك أو نكتشف موقعك تلقائيًا.'),
    ...(today.length ? [text(today.map(event => `**${event.label}**　${prayerClock(event.at, p.city.timezone)}`).join('\n'))] : []),
    ...(next ? [text(`الصلاة القادمة: **${next.label}** <t:${Math.floor(next.at / 1000)}:R>.`)] : []),
    text(`-# ${p.method ? PRAYER_METHODS.find(([id]) => id === p.method)[1] : 'اختر طريقة الحساب'} · ${p.enabled ? 'التذكير مفعّل' : 'التذكير غير مفعّل'}${paused ? ' · متوقف مؤقتًا' : ''}${dmBlocked ? ' · الخاص مغلق؛ اختبره من الإعدادات' : ''}`),
    ...(p.city && p.method && !today.length ? [text('تعذّر حساب جدول كامل لهذا اليوم. لن يُرسل تذكير لهذا الجدول. راجع مواقيت الجهة المعتمدة محليًا، خاصة في المناطق القطبية.')] : []),
    text('١. اختر مدينتك. ٢. طابق الجدول مع مسجدك. ٣. فعّل التذكير الذي تريده.\nتذكير الصلوات الخمس مستقل عن تذكير الجمعة والقضاء؛ حدّث المدينة عند السفر.'),
    separator(),
    row(button(p.city ? 'تغيير المدينة' : 'اختر مدينتي', 'prayer_location'), button('ضبط الحساب', 'prayer_calculation')),
    row({ ...button(p.enabled ? 'إيقاف تذكير الصلاة' : 'راجعت الجدول؛ فعّل التذكير', p.enabled ? 'prayer_disable' : 'prayer_enable', p.enabled ? 2 : 3), disabled: !p.enabled && !ready }, button('الإشعار والصوت', 'prayer_audio')),
    row(button('تذكيرات الجمعة والقضاء', 'prayer_occasions')),
    row(button('إعداداتي العامة', 'settings'), button('مساحتي', 'home'))
  ], { ephemeral: true, accent: BRAND.blue });
}

export function occasionsPayload({ preferences: p = DEFAULT_PRAYER, next = [], ready = false, notice = '', paused = false, dmBlocked = false } = {}) {
  const descriptions = {
    fridayPrayer: 'قبل موعد الظهر يوم الجمعة بـ٤٥ دقيقة؛ موعد خطبة مسجدك قد يختلف.',
    fridayDua: 'في الساعة الأخيرة قبل المغرب يوم الجمعة، بعد العصر.',
    qada: 'لمن عليه قضاء: تنبيهان فقط كل سنة، قبل رمضان المتوقع بـ٣٠ يومًا ثم بـ١٥ يومًا، وقت الظهر.'
  };
  return envelope([
    text(`## الجمعة وقضاء رمضان${notice ? `\n${notice}` : ''}\nاختر ما تحتاجه؛ كل زر يفعّل تذكيرًا واحدًا أو يوقفه فورًا.`),
    section(p.city ? `**مدينتك: ${p.city.label}**${!ready ? '\nتعذّر حساب جدول كامل؛ راجع مواقيت مدينتك.' : ''}${paused ? '\nالتنبيهات متوقفة مؤقتًا من إعداداتك العامة.' : ''}${dmBlocked ? '\nوصول الخاص معلّق؛ اختبره من إعداداتك العامة.' : ''}` : 'ابدأ باختيار مدينتك. لا تحتاج إلى تفعيل الصلوات الخمس لاستخدام هذه التذكيرات.', button(p.city ? 'مواقيت مدينتي' : 'اختر مدينتي', p.city ? 'prayer' : 'prayer_location', 3)),
    ...OCCASIONS.map(([key, label]) => {
      const event = next.find(item => item.key === key);
      return section(`### ${label} · ${p.occasions[key] ? 'مفعّل' : 'متوقف'}\n${descriptions[key]}${event ? `\n${p.occasions[key] ? 'التنبيه القادم' : 'الموعد عند التفعيل'}: **${prayerClock(event.at, p.city.timezone)}** بتوقيت مدينتك · <t:${Math.floor(event.at / 1000)}:R>.` : ''}`,
        { ...button(p.occasions[key] ? `إيقاف ${label}` : `تفعيل ${label}`, `prayer_occasion_${key}`, p.occasions[key] ? 2 : 3), disabled: !p.occasions[key] && (!ready || paused || dmBlocked) });
    }),
    text('-# مواعيد الجمعة بحسب جدول مدينتك. رمضان متوقع بتقويم أم القرى؛ ثبوته بإعلان بلدك. ساعة الدعاء وقت تُرجى فيه الإجابة، وليست وعدًا بإجابة محددة.'),
    row(button('الإشعار', 'prayer_audio'), button('المصادر', 'prayer_occasion_sources')),
    row(button('إعداداتي العامة', 'settings'), button('مساحتي', 'home'))
  ], { ephemeral: true, accent: BRAND.blue });
}

export function occasionSourcesPayload() {
  return envelope([
    text('## مصادر تذكيراتك\nرسائل التذكير من صياغة رفيق، وليست نقلًا لألفاظ الأحاديث.'),
    ...Object.values(OCCASION_CARDS).flatMap(card => [text(`### ${card.title}\n${sourceDetails(card.source)}\n${card.source.note}`), row(linkButton('افتح المصدر', card.source.url))]),
    row(button('رجوع للتذكيرات', 'prayer_occasions'))
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

export function prayerLocationPayload(notice = '') {
  return envelope([
    text(`## أي مدينة تريد مواقيتها؟${notice ? `\n${notice}` : ''}\nاكتب المدينة بالعربية أو بلغتها، وأضف الدولة لتمييز المدن المتشابهة. مثال: **مكة المكرمة، السعودية**. ثم اختر النتيجة الصحيحة بنفسك.`),
    text('عند الحاجة للبحث عبر الإنترنت، يُرسل اسم المدينة والدولة إلى Open-Meteo، دون معرّف حسابك في ديسكورد. نحفظ المدينة المختارة ومنطقتها الزمنية وإحداثيات مركزها ضمن بيانات البوت المشفّرة.'),
    text('-# لا نحتاج عنوانك أو موقعك الدقيق. يمكنك حذف اختيارك من الخصوصية. بيانات المدن: [GeoNames](https://www.geonames.org/) و[Open-Meteo](https://open-meteo.com/en/docs/geocoding-api).'),
    row(button('ابحث عن مدينة', 'prayer_city_modal', 3), button('رجوع', 'prayer'))
  ], { ephemeral: true, accent: BRAND.blue });
}

export function prayerCitiesPayload(cities, token) {
  return envelope([
    text('## اختر المدينة الصحيحة\nراجع الدولة والمنطقة. تغيير المدينة يوقف تذكيرات الصلاة والجمعة والقضاء والأذكار والقراءة؛ راجع الجدول ثم أعد تفعيل ما تحتاجه.'),
    prayerSelect(`prayer_city_${token}`, 'نتائج البحث — اختر مدينتك', cities.map((city, i) => [String(i), city.label]), null),
    text('-# بيانات المدن: [GeoNames](https://www.geonames.org/) و[Open-Meteo](https://open-meteo.com/en/docs/geocoding-api). تنتهي هذه النتائج بعد ١٠ دقائق.'),
    row(button('بحث جديد', 'prayer_city_modal'), button('رجوع', 'prayer'))
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
    row(button('تعديل الدقائق', 'prayer_adjust_modal'), button('راجع جدولك', 'prayer', 3))
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
    row(button('مواقيت صلاتي', 'prayer'), button('الجمعة والقضاء', 'prayer_occasions'))
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
      component: { type: 4, custom_id: 'minutes', style: 1, required: true, max_length: 2, placeholder: 'مثال: 30',
        value: String(offset && (offset < 0) === before ? Math.abs(offset) : ADHKAR_DELAY_MINUTES) } }] };
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

export function setupStartPayload(p = DEFAULT_PRAYER) {
  return envelope([
    text('## أهلًا بك في رفيق 🌿\nنضبط مساحتك في ثلاث خطوات بسيطة.'),
    text('**١ · مدينتك** → ٢ · تذكيراتك → ٣ · تجربة الإشعار'),
    text(p.city ? `مدينتك المحفوظة: **${p.city.label}**\nتستخدم التذكيرات هذا التوقيت. يمكنك إبقاء المدينة أو تغييرها.` : 'ابدأ باختيار مدينتك لتظهر المواقيت والتذكيرات بتوقيتك. نحتاج اسم المدينة فقط، ولا نطلب عنوانك.'),
    text('-# حفظ المدينة لا يفعّل أي تذكير. ستختار ما تريد في الخطوة التالية.'),
    row(button(p.city ? 'غيّر المدينة' : 'اختر مدينتي', 'setup_prayer_location', 3), ...(p.city ? [button('التالي: تذكيراتي', 'setup_choices', 3)] : [])),
    row(button('أتصفّح الآن', 'home'))
  ], { ephemeral: true });
}

export function setupChoicesPayload(p, user) {
  const status = active => active ? 'مفعّل' : 'غير مفعّل';
  return envelope([
    text(`## اختر ما ينفعك\n١ · مدينتك ✓ → **٢ · تذكيراتك** → ٣ · تجربة الإشعار\n${p.city?.label || 'يمكنك اختيار المدينة لاحقًا'}`),
    section(`**كفارة المجلس** · ${status(user.enabled && user.subscribedHere)}`, button('ضبط المجلس', 'setup_reminder_intro')),
    section(`**الصلوات الخمس** · ${status(p.enabled)}`, button('راجع المواقيت', 'setup_prayer')),
    section(`**الصباح والمساء** · ${status(p.daily.morning.activatedAt || p.daily.evening.activatedAt)}\nثلاثة أذكار في رسالة واحدة لكل وقت تفعّله.`, button('اختيار الأذكار', 'setup_daily')),
    section(`**قراءة القرآن** · ${status(p.daily.quran.activatedAt)}\nتذكير اختياري بموعد تحدده بنفسك.`, button('موعد القراءة', 'setup_daily_quran')),
    section('**الجمعة وقضاء رمضان** · خيارات مستقلة', button('عرض الخيارات', 'setup_prayer_occasions')),
    text('-# لا يوجد تفعيل شامل. اختياراتك تُحفظ فورًا، ويمكنك تعديلها لاحقًا من «يومي».'),
    row(button('رجوع للمدينة', 'setup'), button('التالي: تجربة الإشعار', 'setup_test', 3))
  ], { ephemeral: true });
}

export function setupTestPayload(p, user, notice = '') {
  return envelope([
    text(`## جرّب وصول الإشعار\n١ · مدينتك ✓ → ٢ · تذكيراتك ✓ → **٣ · تجربة الإشعار**${notice ? `\n${notice}` : ''}`),
    text(`إشعار الصلاة والأذكار والقرآن: **${p.delivery === 'normal' ? 'الجوال وسطح المكتب' : 'في الخاص بلا تنبيه'}**.\nإشعار المجلس والمؤقّت: **${user.delivery === 'normal' ? 'الجوال وسطح المكتب' : 'في الخاص بلا تنبيه'}**.`),
    text('نرسل التجربة فقط عند ضغط الزر. وصول الرسالة لا يثبت ظهور إشعار على هاتفك؛ تأكد بنفسك من إعدادات ديسكورد والجهاز.'),
    row(button('أرسل تجربة', 'setup_send_test', 3), button('ضبط الإشعار', 'setup_prayer_audio')),
    row(button('رجوع لتذكيراتي', 'setup_choices'), button('انتهيت — يومي', 'today', 3))
  ], { ephemeral: true });
}

// Keep the existing, tested settings screens inside the onboarding journey.
export function setupWrapPayload(payload) {
  const wrapped = structuredClone(payload);
  const visit = item => {
    if (item.custom_id?.startsWith('rafiq:v1:') && !item.custom_id.startsWith('rafiq:v1:setup_')) {
      const action = item.custom_id.slice(9);
      item.custom_id = ['home', 'cancel'].includes(action) ? 'rafiq:v1:setup_choices' : `rafiq:v1:setup_${action}`;
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
  return offset === 0 ? `عند أذان ${prayer} حسب مواقيت مدينتك.` : `${offset < 0 ? 'قبل' : 'بعد'} أذان ${prayer} بـ${arabicNumber(Math.abs(offset))} دقيقة حسب مواقيت مدينتك.`;
}
export function dailyOffsetPayload(p, key, notice = '') {
  if (!['morning', 'evening'].includes(key)) throw new RangeError('Unknown adhkar period');
  return envelope([
    text(`## موعد أذكار ${key === 'morning' ? 'الصباح' : 'المساء'}${notice ? `\n${notice}` : ''}\nالموعد الحالي: **${dailyOffsetDescription(p, key)}**`),
    text('اختر قبل الأذان أو بعده، ثم أدخل عدد الدقائق من ١ إلى ٦٠. يمكنك أيضًا اختيار وقت الأذان نفسه.\nاختيارك لهذه الفترة فقط؛ موعد الفترة الأخرى يبقى كما هو.'),
    row(button('قبل الأذان', `daily_offset_${key}_before_modal`), button('عند الأذان', `daily_offset_${key}_at`), button('بعد الأذان', `daily_offset_${key}_after_modal`)),
    text('-# التوقيت لتنظيم التنبيه؛ الاختيار المبكر تذكير مسبق. لا يحدد رفيق وقتًا شرعيًا للذكر ولا يحتاج وقت الإقامة.'),
    row(button('إعادة إلى بعد الأذان بـ٣٠ دقيقة', `daily_offset_${key}_reset`), button('رجوع', 'daily'))
  ], { ephemeral: true });
}

export function dailySettingsPayload(p = DEFAULT_PRAYER, { notice = '', events = [], paused = false, dmBlocked = false } = {}) {
  return envelope([
    text(`## أذكاري وقراءتي${notice ? `\n${notice}` : ''}\n${p.city ? p.city.label : 'اختر المدينة لضبط التوقيت المحلي.'}`),
    ...DAILY_REMINDERS.flatMap(([key, title]) => {
      const item = p.daily[key], next = events.find(e => e.key === key);
      const timing = key === 'quran' ? item.time ? `كل يوم عند ${item.time} بتوقيت مدينتك.` : 'حدد ساعة تناسبك.'
        : dailyOffsetDescription(p, key);
      return [text(`**${title}** · ${item.activatedAt ? 'مفعّل' : 'غير مفعّل'}\n${timing}${next ? `\nالموعد القادم حسب الإعداد: <t:${Math.floor(next.at / 1000)}:f>` : ''}`),
        row(button(key === 'quran' ? 'ضبط الموعد' : 'تعديل الموعد', key === 'quran' ? 'daily_quran_modal' : `daily_offset_${key}`), button(item.activatedAt ? 'إيقاف' : 'تفعيل', `daily_${item.activatedAt ? 'off' : 'enable'}_${key}`, item.activatedAt ? 2 : 3))];
    }),
    ...(dmBlocked || paused ? [text(dmBlocked ? 'الإرسال معلّق: اختبر الخاص من الإعدادات.' : 'التذكيرات متوقفة مؤقتًا من إعداداتك.')] : []),
    text('-# ثلاثة أذكار مختارة لكل وقت، برسالة واحدة. الموعد تقريبي للتذكير، ولا يعتمد على معرفة إقامة مسجدك. اختر المدينة ثم فعّل ما تريد.'),
    row(button('اقرأ أذكار الصباح', 'daily_morning_read'), button('اقرأ أذكار المساء', 'daily_evening_read')),
    row(button('مدينتي', 'prayer_location'), button('إشعاري', 'prayer_audio'), button('يومي', 'today'))
  ], { ephemeral: true });
}

const dailyText = period => DAILY_DHIKR.map((card, i) => `${arabicNumber(i + 1)} · ${card.title}${card.repeat ? ` — ${arabicNumber(card.repeat)} مرات` : ''}\n${card.text || card[period]}\n${card.source.reference}`).join('\n\n');
export function dailyReadingPayload(period) {
  if (!['morning', 'evening'].includes(period)) throw new RangeError('Unknown period');
  return envelope([text(`## أذكار ${period === 'morning' ? 'الصباح' : 'المساء'}\nثلاثة أذكار مختارة\n\n${dailyText(period)}`),
    row(button('المصادر والتوضيح', 'daily_sources'), button('ضبط تذكيري', 'daily'), button('يومي', 'today'))], { ephemeral: true });
}
export function dailySourcesPayload() {
  return envelope([
    text('## مصادر الأذكار المختارة'),
    ...DAILY_DHIKR.map(card => text(`**${card.title}**\n${sourceDetails(card.source)}\n${card.source.note}`)),
    text('الثلاثة اختصار للمحتوى، وليست حصرًا للأذكار المشروعة. توقيت الإشعار الذي تختاره تنظيم للتذكير، وليس وقتًا شرعيًا مخصوصًا للذكر. [بيان وقت أذكار الصباح والمساء — ابن باز](https://binbaz.org.sa/fatwas/14478/وقت-اذكار-الصباح-والمساء).'),
    row(button('الصباح', 'daily_morning_read'), button('المساء', 'daily_evening_read'), button('إعداداتي', 'daily'))
  ], { ephemeral: true });
}
export function dailyReminderPayload(p, event) {
  if (event.key === 'quran') return notification('حان الموعد الذي اخترته لقراءة القرآن 🌿\nافتح مصحفك واقرأ ما تيسر لك.', [row(button('تعديل الموعد', 'daily'), button('إيقاف تذكير القراءة', 'daily_off_quran'))], { silent: p.delivery === 'silent' });
  if (!['morning', 'evening'].includes(event.key)) throw new RangeError('Unknown daily reminder');
  return notification(`${p.daily[event.key].offsetMinutes < 0 ? 'تذكير مبكر حسب اختيارك: ' : ''}أذكار ${event.key === 'morning' ? 'الصباح' : 'المساء'} — ثلاثة أذكار مختارة\n\n${dailyText(event.key)}`, [row(button('المصادر', 'daily_sources'), button('تذكيري', 'daily'), button('إيقاف هذا التذكير', `daily_off_${event.key}`))], { silent: p.delivery === 'silent' });
}

export function todayPayload({ p = DEFAULT_PRAYER, user = {}, now = Date.now(), nextPrayer = null, next = null, subscribed = false } = {}) {
  const blocked = user.dmBlocked || user.pausedUntil > now;
  const labels = { break: 'الاستراحة', morning: 'أذكار الصباح', evening: 'أذكار المساء', quran: 'قراءة القرآن', fridayPrayer: 'الاستعداد للجمعة', fridayDua: 'دعاء الجمعة', qada30: 'قضاء رمضان', qada15: 'قضاء رمضان', ...Object.fromEntries(PRAYERS) };
  return envelope([
    text(`## يومي مع رفيق 🌿\n${p.city ? p.city.label : 'اختر مدينتك لتظهر مواقيتك هنا.'}`),
    text(nextPrayer ? `الصلاة القادمة: **${nextPrayer.label}** <t:${Math.floor(nextPrayer.at / 1000)}:R> · ${prayerClock(nextPrayer.at, p.city.timezone)}` : 'لم يظهر جدول الصلاة بعد؛ اختر المدينة وراجع المواقيت.'),
    text(blocked ? user.dmBlocked ? 'الإرسال معلّق: اختبر الخاص من إعداداتك.' : 'التنبيهات متوقفة مؤقتًا.' : next ? `التذكير المجدول القادم: **${labels[next.key]}** <t:${Math.floor(next.at / 1000)}:f>.` : 'لا يوجد موعد قادم متاح للتذكيرات المختارة. راجع الخيارات والمواقيت أدناه.'),
    section(`**المجلس** · ${user.enabled && subscribed ? 'مفعّل؛ بعد مغادرة مجلس مؤهل' : 'غير مفعّل'}`, button('المجلس', 'settings')),
    section(`**الصلوات الخمس** · ${p.enabled ? 'مفعّلة' : 'غير مفعّلة'}`, button('مواقيتي', 'prayer')),
    section(DAILY_REMINDERS.map(([key, label]) => `**${label}** · ${p.daily[key].activatedAt ? 'مفعّل' : 'غير مفعّل'}`).join('\n'), button('أذكاري وقراءتي', 'daily')),
    section(OCCASIONS.map(([key, label]) => `**${label}** · ${p.occasions[key] ? 'مفعّل' : 'غير مفعّل'}`).join('\n'), button('الجمعة والقضاء', 'prayer_occasions')),
    ...(user.breakAt > now ? [text(`مؤقّت الاستراحة: <t:${Math.floor(user.breakAt / 1000)}:R>.`)] : []),
    row(button('تحديث', 'today'), button('إعداد بسيط', 'setup'), button('مساحتي', 'home'))
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
      ? row(button('فعّل تذكيري', 'enable', 3), button('رجوع', 'home'))
      : row(button('تذكيري', 'settings'), button(paused ? 'استئناف التذكير' : 'إيقاف ٢٤ ساعة', paused ? 'resume' : 'pause_today'))
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
    row(button('الآن أتصفّح فقط', 'home'))
  ], { ephemeral: true });
}
export function enabledPayload({ frequency = 'session' } = {}) {
  return envelope([
    text('## تذكيرك جاهز 🌿\nأذكّرك في الخاص بعد خروجك من الصوت، إذا استمرت جلستك ٥ دقائق على الأقل وحضر معك شخص آخر.'),
    text(`-# ${frequencyDescription(frequency)} · ننتظر دقيقة لاحتمال عودتك`),
    separator(),
    row(button('اختبر الخاص', 'test_dm'), button('ضبط التذكير', 'settings'), button('مساحتي', 'home'))
  ], { ephemeral: true });
}
export function settingsPayload({ frequency = 'session', delivery = 'normal', enabled = false, subscribedHere = true, inGuild = false, paused = false, pausedUntil = 0, dmBlocked = false, notice = '' } = {}) {
  if (!['daily', 'session', 'session5'].includes(frequency) || !['normal', 'silent'].includes(delivery)) throw new RangeError('Invalid reminder preference');
  const select = (id, placeholder, options, selected) => row({
    type: 3, custom_id: `rafiq:v1:${id}`, placeholder, min_values: 1, max_values: 1,
    options: options.map(([value, label, description]) => ({ value, label, description, default: value === selected }))
  });
  return envelope([
    text(`${notice ? `${notice}\n` : ''}## إعداداتك\n**تذكير كفارة المجلس**\n-# ${dmBlocked ? 'تعذّر الوصول إلى الخاص؛ اختبره لاستئناف الإرسال' : paused ? 'جميع التنبيهات متوقفة مؤقتًا' : !enabled ? 'تذكير المجلس غير مفعّل' : !subscribedHere ? 'تذكير المجلس غير مفعّل في هذا السيرفر' : 'تذكير المجلس مفعّل'} · اختياراتك تُحفظ فورًا`),
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
    text('-# لقراءة التذكير من إشعار الهاتف، فعّل الإشعار ومعاينة الرسائل في جهازك. «بلا تنبيه» يمنع إشعار الدفع، ولا يعني إشعارًا بلا صوت.'),
    separator(),
    text('-# التكرار وطريقة التنبيه هنا لتذكير المجلس والمؤقّت. للصلاة والجمعة والقضاء إعداد إشعار مستقل؛ الإيقاف العام يشمل الجميع.'),
    row(button(paused ? 'استئناف التنبيهات' : !subscribedHere ? 'فعّل في هذا السيرفر' : enabled ? 'إيقاف ٢٤ ساعة' : 'فعّل تذكيري', paused ? 'resume' : !enabled || !subscribedHere ? 'enable' : 'pause_today'), button('اختبر الخاص', 'test_dm')),
    ...(inGuild && subscribedHere ? [row(button('إلغاء تذكير هذا السيرفر', 'unsubscribe_here'))] : []),
    row(button('الصلاة', 'prayer'), button('الجمعة والقضاء', 'prayer_occasions'), ...(!paused && (!enabled || !subscribedHere) ? [button('إيقاف ٢٤ ساعة', 'pause_today')] : [])),
    row(button('مساعدة إشعار الجوال', 'notification_help')),
    row(button('إيقاف كل التنبيهات', 'disable'), button('مساحتي', 'home'))
  ], { ephemeral: true });
}
export function ideaPayload(index = 0, { category = 'all', favorites = [] } = {}) {
  if (!Number.isInteger(index) || index < 0) throw new RangeError('Idea index must be a nonnegative integer');
  if (category !== 'saved' && !IDEA_CATEGORIES.some(item => item.id === category)) throw new RangeError('Unknown idea category');
  const ideas = COPY.ideas.filter(item => category === 'saved' ? favorites.includes(item.id) : category === 'all' || item.category === category);
  if (!ideas.length) return noticePayload('أفكارك المحفوظة تنتظرك', 'حين تعجبك فكرة، اضغط «حفظ الفكرة» لتعود إليها بسهولة.', [button('تصفّح الأفكار', 'idea', 3), button('محفوظاتي', 'favorites')]);
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
    row(button(favorites.includes(idea.id) ? 'إزالة من المحفوظات' : 'حفظ الفكرة', `idea_save_${idea.id}_${category}`), button('محفوظاتي', 'favorites')),
    row(button('الدليل والتوضيح', `idea_source_${idea.id}_${category}`), button('مساحتي', 'home'))
  ], { ephemeral: true, accent: BRAND.gold });
}
export function ideaSourcePayload(id, { category = 'all' } = {}) {
  const idea = ideaById(id);
  if (!idea || (category !== 'saved' && !IDEA_CATEGORIES.some(item => item.id === category))) throw new RangeError('Unknown idea');
  return envelope([
    text(`## دليل الفكرة\n${idea.title}\n${idea.evidence}`),
    text(sourceDetails(idea.source)), text(idea.source.note),
    text(`-# طابَقنا المادة مع المصادر بتاريخ ${idea.source.checkedOn}.`),
    separator(), row(button('العودة للفكرة', `idea_${category}_${GOOD_DEEDS.indexOf(idea)}`), button('ملاحظة على المحتوى', `report_${id}`))
  ], { ephemeral: true, accent: BRAND.gold });
}
export function pausedPayload() {
  return envelope([
    text('## على راحتك 🌿\nتوقفت التنبيهات لمدة ٢٤ ساعة، وأُلغي مؤقّت الاستراحة إن وجد. يعود تذكير المجلس بعدها مع إعداداتك نفسها.'),
    separator(), row(button('استئناف الآن','resume',3),button('عرض الذكر','preview'),button('إعداداتي','settings'))
  ], {ephemeral:true});
}
export function disabledPayload() {
  return envelope([
    text('## توقفت كل التنبيهات\nأُوقف تذكير المجلس وأُلغي مؤقّت الاستراحة. اختياراتك ومحفوظاتك باقية، ويمكنك التصفّح متى أحببت.'),
    separator(), row(button('إعادة التفعيل','enable',3),button('عرض الذكر','preview'))
  ], {ephemeral:true});
}

export function homePayload({ enabled = false, subscribedHere = true, paused = false, dmBlocked = false, breakAt = null, favoriteCount = 0 } = {}) {
  const status = dmBlocked ? 'تعذّر الوصول إلى الخاص؛ راجع إعداداتك' : !enabled ? 'تذكير المجلس غير مفعّل' : paused ? 'تذكير المجلس متوقف مؤقتًا' : !subscribedHere ? 'تذكيرك مفعّل في سيرفر آخر؛ يمكنك تفعيله هنا أيضًا' : 'تذكير المجلس مفعّل';
  return envelope([
    text('-# رفيق · مساحتك الخاصة\n## ماذا يناسب لحظتك؟\nذكر تقرؤه، وفكرة تطبّقها، ووقت ترتاح فيه.'), separator(),
    row(button('ابدأ الإعداد', 'setup', 3), button('يومي', 'today'), button('أذكاري وقراءتي', 'daily')),
    section('### 🌿 أذكار موثّقة\nذكر ودعاء، مع المصدر متى أردت.', button('أذكار موثّقة', 'library', 3)),
    section('### 🌱 فكرة خير\nمع أهلك، مع أصحابك، أو أثناء اللعب.', button('فكرة خير', 'idea')),
    section('### 🕰️ مواقيت صلاتك\nتذكير خاص بحسب مدينتك، حين تختاره.', button('مواقيت الصلاة', 'prayer')),
    section('### الجمعة وقضاء رمضان\nتذكيرات تختارها، في وقت مدينتك.', button('اختيار التذكيرات', 'prayer_occasions')),
    section(`### ⏳ وقت لاستراحة\n${breakAt ? `استراحتك <t:${Math.floor(breakAt / 1000)}:R>.` : 'حدّد وقتًا لرسالة واحدة تذكّرك باستراحتك.'}`, button(breakAt ? 'إدارة المؤقّت' : 'وقت لاستراحة', 'break')),
    separator(),
    text(`-# ${status}${favoriteCount ? ` · ${arabicNumber(favoriteCount)} في محفوظاتك` : ''}`),
    row(button('محفوظاتي', 'favorites'), button(paused ? 'استئناف التنبيهات' : dmBlocked ? 'إصلاح وصول الخاص' : enabled && subscribedHere ? 'ضبط تذكيري' : 'فعّل تذكير المجلس', paused ? 'resume' : dmBlocked || (enabled && subscribedHere) ? 'settings' : 'reminder_intro')),
    separator(), row(button('مصادرنا', 'methodology'), button('بياناتي', 'privacy'), button('مساعدة وإبلاغ', 'support'))
  ], { ephemeral: true });
}

export function favoritesPayload({ dhikrCount = 0, ideaCount = 0 } = {}) {
  return envelope([
    text('## أشياء تحب أن تعود إليها 🌿\nأذكارك وأفكارك المحفوظة، في مكان واحد.'),
    separator(),
    section(`### أذكار وأدعية\n${dhikrCount ? `عدد المحفوظات: ${arabicNumber(dhikrCount)}.` : 'احفظ ذكرًا من المكتبة ليظهر هنا.'}`, button('أذكاري المحفوظة', 'saved_dhikr', 3)),
    section(`### أفكار لعمل الخير\n${ideaCount ? `عدد المحفوظات: ${arabicNumber(ideaCount)}.` : 'احفظ فكرة تناسبك من صفحة الأفكار.'}`, button('أفكاري المحفوظة', 'saved_ideas')),
    text('-# علامات مرجعية خاصة بك؛ لا نسجّل إن كنت قد عملت بها.'),
    separator(), row(button('تصفّح الأذكار', 'library'), button('تصفّح الأفكار', 'idea'), button('مساحتي', 'home'))
  ], { ephemeral: true });
}

export function libraryPayload({ selectedId = 'majlis', favorites = [], onlyFavorites = false } = {}) {
  const cards = onlyFavorites ? DHIKR_CARDS.filter(card => favorites.includes(card.id)) : DHIKR_CARDS;
  if (!cards.length) return noticePayload('محفوظاتك تنتظرك', 'احفظ ذكرًا للوصول إليه بسهولة. الحفظ علامة مرجعية خاصة بك.', [button('تصفّح الأذكار', 'library', 3), button('مساحتي', 'home')]);
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
    row(button('مساحتي', 'home'))
  ], { ephemeral: true });
}

export function sourcePayload(id, { onlyFavorites = false } = {}) {
  const card = dhikrById(id);
  if (!card) throw new RangeError('Unknown dhikr');
  return envelope([
    text(`## مصدر ${card.title}\n${card.source.reference}`), text(sourceDetails(card.source)), text(card.source.note),
    text(`[شرح الشيخ ابن باز](${card.source.url})\n-# طابَقنا المادة مع المصادر بتاريخ ${card.source.checkedOn}.`),
    separator(), row(button('العودة للذكر', `card_${id}${onlyFavorites ? '_saved' : ''}`), button('ملاحظة على المحتوى', `report_${id}`)),
    row(button('منهج المحتوى', 'methodology'))
  ], { ephemeral: true });
}

export function methodologyPayload() {
  return envelope([
    text('## ذكرٌ تعرف مصدره\nنعتمد القرآن والسنة الثابتة، مع العناية بفهم السلف، ونرجع إلى شروح أهل العلم الموثوقين، ومنها شروح الشيخ ابن باز.'),
    text('نذكر مخرّج الحديث على البطاقة، وتفاصيل الرواية والحكم في «المصدر والتوضيح»، بالرجوع إلى كتب أئمة الحديث. اقتراحات رفيق العملية مميّزة عن النصوص الشرعية. لا نخصّص ذكرًا بعدد أو وقت تعبدي بلا دليل، ولا يولّد البوت فتاوى.'),
    text('-# المحفوظات للوصول السريع. لا نقاط للحسنات، ولا ترتيب للأعضاء بحسب العبادة.'),
    separator(), row(button('تصفّح الأذكار', 'library', 3), button('مساحتي', 'home'))
  ], { ephemeral: true });
}

export function breakPayload({ breakAt = null, notice = '', paused = false, dmBlocked = false, delivery = 'normal' } = {}) {
  return envelope([
    text(`${notice ? `${notice}\n` : ''}## وقت لاستراحة\n${breakAt ? `مؤقّتك مضبوط: <t:${Math.floor(breakAt / 1000)}:R>.` : 'اختر متى أذكّرك باستراحة من الجلسة.'}`),
    ...(paused || dmBlocked ? [text(paused ? 'التنبيهات متوقفة مؤقتًا. استأنفها من إعداداتك قبل ضبط المؤقّت.' : 'وصول الخاص معلّق. افتح إعداداتك واختبر الخاص أولًا.'), row(button('إعدادات التنبيه', 'settings'))] : []),
    text(`-# رسالة واحدة في الخاص، ${delivery === 'silent' ? 'بلا تنبيه دفع أو سطح مكتب' : 'بتنبيه حسب إعدادات ديسكورد'}. لا تتكرر تلقائيًا. تغيير المدة يستبدل المؤقّت السابق.`),
    row(button('١٥ دقيقة', 'break_15'), button('٣٠ دقيقة', 'break_30'), button('٦٠ دقيقة', 'break_60'), button('٩٠ دقيقة', 'break_90')),
    ...(breakAt ? [row(button('أضف ١٥ دقيقة', 'break_extend_15'), button('إلغاء المؤقّت', 'break_cancel'))] : []),
    row(button('مساحتي', 'home'))
  ], { ephemeral: true, accent: BRAND.blue });
}

export function breakReminderPayload({ silent = false } = {}) {
  return notification('حان وقت الاستراحة 🌱\nهذا هو التذكير الذي طلبته. خذ استراحتك، وراجع ما تحتاج أن تفرغ له الآن.\nانتهى المؤقّت. لن يتكرر تلقائيًا.', [
    row(button('ذكّرني بعد ١٥ دقيقة', 'break_15'), button('فكرة خير', 'idea'), button('مساحتي', 'home'))
  ], { silent });
}

export function notificationHelpPayload() {
  return envelope([
    text('## اقرأ التذكير من إشعار جوالك\n١. في إعدادات التذكير، اختر «إشعار الجوال وسطح المكتب». للصلاة والجمعة والقضاء والأذكار والقراءة اختيار مستقل عن المجلس والمؤقّت.\n٢. في إعدادات هاتفك ← الإشعارات ← Discord، اسمح بالإشعارات ومعاينة النص في الموضع الذي يناسب خصوصيتك. تأكد من السماح بإشعارات الرسائل الخاصة ومن عدم كتم محادثة رفيق.\n٣. جرّب «اختبر الخاص» للمجلس أو «اختبر الإشعار» للصلاة.'),
    text('يرسل رفيق النص داخل الرسالة، لتتمكن من قراءته من الإشعار عندما يسمح جهازك. قد تختصر الشاشة النص أو تخفيه، وقد يمنع الكتم أو عدم الإزعاج التنبيه. وصول الرسالة للخاص لا يثبت ظهور إشعار على الهاتف.'),
    row(linkButton('إعدادات إشعارات ديسكورد', 'https://support.discord.com/hc/en-us/articles/218892547--Mobile-Notifications-Settings-101')),
    row(button('إعدادات المجلس', 'settings'), button('إشعار الصلاة والجمعة', 'prayer_audio'), button('مساحتي', 'home'))
  ], { ephemeral: true });
}

export function privacyPayload({ privacyURL, supportURL } = {}) {
  return envelope([
    text('## بياناتك واختياراتك\nنحفظ معرّفك في ديسكورد، واختياراتك، والسيرفرات التي فعّلت فيها التذكير، ومحفوظاتك ومؤقّتك. عند إعداد الصلاة نحفظ المدينة التي تختارها وإحداثيات مركزها ومنطقتها الزمنية وطريقة الحساب والتعديلات واختيار الإشعار والصوت. نحفظ أيضًا التذكيرات الاختيارية للجمعة والقضاء والأذكار والقرآن، ووقت تفعيلها ومواعيدها، ومنها الدقائق التي تختارها قبل الأذان أو بعده للأذكار؛ لا نسأل عن عدد أيام القضاء أو سببه، ولا نسجّل أداء عبادتك.'),
    text('لا نقرأ محتوى المحادثات ولا نسجّل الصوت. توقيت المجلس يبقى في الذاكرة أثناء التشغيل، وتُحفظ أوقات محاولات التذكير مؤقتًا لمنع التكرار. حذف بياناتك يوقف التنبيهات ويمحو سجلك من قاعدة البوت؛ الرسائل الموجودة في ديسكورد تبقى عندك.'),
    text('-# بيانات التشغيل المحفوظة مشفّرة. ننظّف محاولات المجلس والمؤقّت بعد ٤٨ ساعة، ومحاولات الصلاة والجمعة والقضاء بعد ٧ أيام، ونزيل اشتراك السيرفر إذا أُزيل منه البوت.'),
    ...(privacyURL ? [row(linkButton('سياسة الخصوصية', privacyURL), ...(supportURL ? [linkButton('المساعدة والإبلاغ', supportURL)] : []))] : []),
    separator(), row(button('حذف بياناتي', 'forget'), button('مساحتي', 'home'))
  ], { ephemeral: true });
}

export function supportPayload({ supportURL, reportCard = null } = {}) {
  return envelope([
    text('## مساعدة وإبلاغ\nللإبلاغ عن خلل، أو محتوى يحتاج مراجعة، أو مشكلة خصوصية، تواصل مع مشغّل رفيق من الرابط أدناه.'),
    text('اذكر الخيار الذي واجهت فيه المشكلة وما حدث. لا ترسل كلمات مرور أو رموز دخول أو معلومات خاصة عن غيرك. يمكنك تعديل اختياراتك أو حذف بياناتك من «بياناتي».'),
    ...(reportCard ? [text(`ملاحظتك عن: ${reportCard.title}\nانسخ اسم المادة مع ملاحظتك ورابط الدليل إن توفر. فتح هذه الصفحة لا يرسل بلاغًا تلقائيًا.`)] : []),
    ...(supportURL ? [row(linkButton('تواصل مع مشغّل رفيق', supportURL))] : [text('-# المعاينة فقط: يضبط المشغّل رابط الدعم قبل تشغيل البوت.')]),
    separator(), row(button('بياناتي', 'privacy'), button('مساحتي', 'home'))
  ], { ephemeral: true });
}

export function forgetPromptPayload() {
  return noticePayload('حذف بياناتك؟', 'سيتوقف التذكير، ويُلغى المؤقّت، وتُحذف تفضيلاتك ومحفوظاتك من قاعدة البوت.', [button('احذف بياناتي', 'forget_confirm', 4), button('رجوع', 'privacy')]);
}

export function noticePayload(title, body, buttons = [button('مساحتي', 'home')]) {
  return envelope([text(`## ${title}\n${body}`), separator(), row(...buttons)], { ephemeral: true });
}
