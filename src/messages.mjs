import { DHIKR_CARDS, GOOD_DEEDS, IDEA_CATEGORIES, dhikrById, ideaById } from './content.mjs';
import { DEFAULT_PRAYER, PRAYERS, PRAYER_METHODS, PRAYER_HIGH_LATITUDE } from './prayer-config.mjs';
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
const sourceDetails = source => source.citations.map(ref => `[${ref.book} (${arabicNumber(ref.number.replace(/[a-z]$/, ''))})](${ref.url}) · الصحابي: ${ref.narrator} رضي الله عنه.`).join('\n');
const container = (components, accent = BRAND.accent) => ({ type: 17, accent_color: accent, components });
const envelope = (components, { ephemeral = false, silent = false, accent = BRAND.accent } = {}) => ({
  flags: FLAGS.componentsV2 | (ephemeral ? FLAGS.ephemeral : 0) | (silent ? FLAGS.silent : 0),
  allowed_mentions: { parse: [], replied_user: false },
  components: [container(components, accent)]
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
    text('المواقيت محسوبة لمركز المدينة؛ طابقها مع جدول مسجدك قبل التفعيل. التذكير لخمس صلوات يوميًا في الخاص، مستقل عن تذكير المجلس. حدّث المدينة عند السفر.'),
    separator(),
    row(button(p.city ? 'تغيير المدينة' : 'اختر مدينتي', 'prayer_location'), button('ضبط الحساب', 'prayer_calculation')),
    row({ ...button(p.enabled ? 'إيقاف تذكير الصلاة' : 'راجعت الجدول؛ فعّل التذكير', p.enabled ? 'prayer_disable' : 'prayer_enable', p.enabled ? 2 : 3), disabled: !p.enabled && !ready }, button('الإشعار والصوت', 'prayer_audio')),
    row(button('إعداداتي العامة', 'settings'), button('مساحتي', 'home'))
  ], { ephemeral: true, accent: BRAND.blue });
}

export function prayerLocationPayload() {
  return envelope([
    text('## أي مدينة تريد مواقيتها؟\nاكتب اسم المدينة والدولة، ثم اختر النتيجة الصحيحة بنفسك.'),
    text('يُرسل نص البحث فقط إلى Open-Meteo للعثور على المدينة، دون معرّف حسابك في ديسكورد. نحفظ المدينة المختارة ومنطقتها الزمنية وإحداثيات مركزها ضمن بيانات البوت المشفّرة.'),
    text('-# لا نحتاج موقعك الدقيق. يمكنك حذف اختيارك وبياناتك من الخصوصية. بيانات المدن: [GeoNames عبر Open-Meteo](https://open-meteo.com/en/docs/geocoding-api).'),
    row(button('ابحث عن مدينة', 'prayer_city_modal', 3), button('رجوع', 'prayer'))
  ], { ephemeral: true, accent: BRAND.blue });
}

export function prayerCitiesPayload(cities, token) {
  return envelope([
    text('## اختر المدينة الصحيحة\nراجع الدولة والمنطقة. اختيار مدينة جديدة يوقف تذكير الصلاة حتى تراجع جدولها وتفعّله مجددًا.'),
    prayerSelect(`prayer_city_${token}`, 'نتائج البحث — اختر مدينتك', cities.map((city, i) => [String(i), city.label]), null),
    text('-# بيانات المدن: [GeoNames عبر Open-Meteo](https://open-meteo.com/en/docs/geocoding-api). تنتهي هذه النتائج بعد ١٠ دقائق.'),
    row(button('بحث جديد', 'prayer_city_modal'), button('رجوع', 'prayer'))
  ], { ephemeral: true, accent: BRAND.blue });
}

export function prayerCalculationPayload(p = DEFAULT_PRAYER, notice = '') {
  return envelope([
    text(`## ضبط الحساب${notice ? `\n${notice}` : ''}\nاختر الطريقة التي تطابق الجدول المعتمد عندك. تغيير الحساب يوقف التذكير حتى تراجع الجدول وتفعّله مجددًا.`),
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
    text('## الإشعار والصوت\nاختر كيف تصلك تذكيرات الصلاة. إعدادات ديسكورد وجهازك تتحكم في سماع الإشعار أثناء اللعب أو المكالمة.'),
    prayerSelect('prayer_delivery', 'طريقة إشعار الصلاة', [['silent', 'رسالة صامتة'], ['normal', 'إشعار ديسكورد المعتاد']], p.delivery),
    text('**الصوت المخصص**\nيمكن إضافة ملفات صوتية هنا لاحقًا. اختيار ملف يرفقه بالتذكير لتشغيله بيدك؛ لا يبدأ تلقائيًا ولا يُسمع لبقية القناة. تشغيل صوت خاص تلقائيًا أثناء اللعب يحتاج تطبيقًا مرافقًا على جهازك؛ هذه الإمكانية لم تُضف بعد.'),
    ...(sounds.length ? [prayerSelect('prayer_sound', 'ملف صوتي اختياري', [['none', 'دون ملف صوتي'], ...sounds.map(sound => [sound.id, sound.label])], sounds.some(s => s.id === p.soundId) ? p.soundId : 'none')] : [text('-# لم تُضف ملفات صوتية بعد. الإشعار المعتاد متاح الآن، ولا يتجاوز الكتم أو وضع عدم الإزعاج.')]),
    row(button('اختبر إشعار الصلاة', 'prayer_test'), button('مواقيت صلاتي', 'prayer', 3))
  ], { ephemeral: true, accent: BRAND.blue });
}

export function prayerReminderPayload(p, event, sound = null) {
  const payload = envelope([
    text(`## 🕰️ موعد ${event.label}\nحان موعد ${event.label} بحسب جدولك المحسوب.`),
    text(`**${p.city.label}** · ${prayerClock(event.at, p.city.timezone)}\n-# ${PRAYER_METHODS.find(([id]) => id === p.method)[1]} · ${p.city.timezone}`),
    ...(sound ? [text(`ملف اختياري: ${sound.label} — اضغط لتنزيله أو تشغيله، ولا يبدأ تلقائيًا.`), { type: 13, file: { url: `attachment://${sound.filename}` } }] : []),
    row(button('مواقيتي وإعداداتي', 'prayer'), button('إيقاف تذكير الصلاة', 'prayer_disable'))
  ], { silent: p.delivery === 'silent', accent: BRAND.blue });
  if (sound) payload.attachments = [{ id: '0', filename: sound.filename, soundId: sound.id }];
  return payload;
}

export function prayerTestPayload(p = DEFAULT_PRAYER, sound = null) {
  const payload = envelope([
    text('## تجربة إشعار الصلاة\nهذه رسالة اختبار طلبتها الآن، وليست إعلانًا عن دخول وقت صلاة.'),
    text(p.delivery === 'silent' ? 'اخترت رسالة صامتة. يمكنك تغيير ذلك من إعدادات إشعار الصلاة.' : 'اخترت إشعار ديسكورد المعتاد. سماعه يعتمد على إعدادات ديسكورد وجهازك.'),
    ...(sound ? [{ type: 13, file: { url: `attachment://${sound.filename}` } }] : []),
    row(button('إعدادات إشعاري', 'prayer_audio'))
  ], { silent: p.delivery === 'silent', accent: BRAND.blue });
  if (sound) payload.attachments = [{ id: '0', filename: sound.filename, soundId: sound.id }];
  return payload;
}

export function prayerModal(action, p = DEFAULT_PRAYER) {
  const field = (id, label, value, placeholder, maxLength) => ({ type: 18, label, component: { type: 4, custom_id: id, style: 1, required: true, max_length: maxLength, ...(value !== null ? { value } : {}), placeholder } });
  if (action === 'prayer_city_modal') return { custom_id: 'rafiq:v1:prayer_search', title: 'اختر مدينتك', components: [field('city', 'اسم المدينة، الدولة', null, 'مثال: Berlin, Germany — دون عنوان منزلك', 80)] };
  if (action === 'prayer_adjust_modal') return { custom_id: 'rafiq:v1:prayer_adjust', title: 'تعديل المواقيت بالدقائق', components: PRAYERS.map(([id, label], i) => field(id, label, String(p.adjustments[i]), 'بين -60 و60؛ مثل +2 أو -3', 3)) };
  throw new RangeError('Unknown modal');
}
export function reminderPayload({ silent = true, preview = false, enabled = true, paused = false } = {}) {
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
export function reminderIntroPayload({ enabled = false, subscribedHere = true, frequency = 'daily', delivery = 'silent' } = {}) {
  return envelope([
    text('## تذكير المجلس، باختيارك 🌿\nشاهد شكل الرسالة أولًا، ثم قرّر إن كنت تريد وصولها في الخاص.'),
    text('بعد مجلس صوتي مشترك مدته ٥ دقائق أو أكثر، ينتظر رفيق نحو ٤٥ ثانية بعد خروجك لاحتمال عودتك.'),
    text(`اختيارك الحالي: ${frequency === 'session' ? 'بفاصل ساعتين، وحتى ٣ مرات خلال ٢٤ ساعة' : 'مرة كل ٢٤ ساعة كحد أقصى'} · ${delivery === 'normal' ? 'بتنبيه عادي حسب إعدادات ديسكورد' : 'في الخاص بلا تنبيه دفع أو سطح مكتب'}.`),
    text('-# الذكر عند القيام من المجلس؛ مهلة الإرسال لتنظيم التنبيه. يمكنك إيقاف التذكير متى شئت.'),
    separator(), row(button('شاهد نموذج الرسالة', 'preview'), button(enabled && subscribedHere ? 'ضبط تذكيري' : 'فعّل تذكير المجلس', enabled && subscribedHere ? 'settings' : 'enable', 3)),
    row(button('الآن أتصفّح فقط', 'home'))
  ], { ephemeral: true });
}
export function enabledPayload({ frequency = 'daily' } = {}) {
  return envelope([
    text('## تذكيرك جاهز 🌿\nأذكّرك في الخاص بعد خروجك من الصوت، إذا استمرت جلستك ٥ دقائق على الأقل وحضر معك شخص آخر.'),
    text(`-# ${frequency === 'daily' ? 'مرة كل ٢٤ ساعة كحد أقصى' : 'بفاصل ساعتين على الأقل، وبحد أقصى ٣ مرات خلال ٢٤ ساعة'} · ننتظر نحو ٤٥ ثانية لاحتمال عودتك`),
    separator(),
    row(button('اختبر الخاص', 'test_dm'), button('ضبط التذكير', 'settings'), button('مساحتي', 'home'))
  ], { ephemeral: true });
}
export function settingsPayload({ frequency = 'daily', delivery = 'silent', enabled = false, subscribedHere = true, inGuild = false, paused = false, pausedUntil = 0, dmBlocked = false, notice = '' } = {}) {
  if (!['daily', 'session'].includes(frequency) || !['normal', 'silent'].includes(delivery)) throw new RangeError('Invalid reminder preference');
  const select = (id, placeholder, options, selected) => row({
    type: 3, custom_id: `rafiq:v1:${id}`, placeholder, min_values: 1, max_values: 1,
    options: options.map(([value, label, description]) => ({ value, label, description, default: value === selected }))
  });
  return envelope([
    text(`${notice ? `${notice}\n` : ''}## تذكيرك على راحتك\n-# ${dmBlocked ? 'تعذّر الوصول إلى الخاص؛ اختبره لاستئناف الإرسال' : paused ? 'التذكير متوقف مؤقتًا' : !enabled ? 'التذكير غير مفعّل' : !subscribedHere ? 'التذكير غير مفعّل في هذا السيرفر' : 'تذكيرك مفعّل'} · اختياراتك تُحفظ فورًا`),
    ...(paused && pausedUntil ? [text(`ينتهي الإيقاف <t:${Math.floor(pausedUntil / 1000)}:R>.`)] : []),
    select('frequency', 'كم مرة؟', [
      ['daily', 'مرة كل ٢٤ ساعة كحد أقصى', 'بداية خفيفة لتقليل تكرار الرسائل'],
      ['session', 'بعد المجالس', 'فاصل ساعتين؛ حتى ٣ مرات خلال ٢٤ ساعة']
    ], frequency),
    select('delivery', 'كيف تصلك الرسالة؟', [
      ['normal', 'تنبيه عادي', 'حسب إعدادات الإشعارات في ديسكورد'],
      ['silent', 'في الخاص، بلا تنبيه', 'دون إشعار دفع أو تنبيه سطح المكتب']
    ], delivery),
    separator(),
    text('-# التكرار وطريقة التنبيه هنا لتذكير المجلس والمؤقّت. للصلاة إعداد إشعار مستقل؛ الإيقاف العام يشمل الجميع.'),
    row(button(paused ? 'استئناف التنبيهات' : !subscribedHere ? 'فعّل في هذا السيرفر' : enabled ? 'إيقاف ٢٤ ساعة' : 'فعّل تذكيري', paused ? 'resume' : !enabled || !subscribedHere ? 'enable' : 'pause_today'), button('اختبر الخاص', 'test_dm')),
    ...(inGuild && subscribedHere ? [row(button('إلغاء تذكير هذا السيرفر', 'unsubscribe_here'))] : []),
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
    section('### 🌿 أذكار موثّقة\nذكر ودعاء، مع المصدر متى أردت.', button('أذكار موثّقة', 'library', 3)),
    section('### 🌱 فكرة خير\nمع أهلك، مع أصحابك، أو أثناء اللعب.', button('فكرة خير', 'idea')),
    section('### 🕰️ مواقيت صلاتك\nتذكير خاص بحسب مدينتك، حين تختاره.', button('مواقيت الصلاة', 'prayer')),
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

export function breakPayload({ breakAt = null, notice = '', paused = false, dmBlocked = false, delivery = 'silent' } = {}) {
  return envelope([
    text(`${notice ? `${notice}\n` : ''}## وقت لاستراحة\n${breakAt ? `مؤقّتك مضبوط: <t:${Math.floor(breakAt / 1000)}:R>.` : 'اختر متى أذكّرك باستراحة من الجلسة.'}`),
    ...(paused || dmBlocked ? [text(paused ? 'التنبيهات متوقفة مؤقتًا. استأنفها من إعداداتك قبل ضبط المؤقّت.' : 'وصول الخاص معلّق. افتح إعداداتك واختبر الخاص أولًا.'), row(button('إعدادات التنبيه', 'settings'))] : []),
    text(`-# رسالة واحدة في الخاص، ${delivery === 'silent' ? 'بلا تنبيه دفع أو سطح مكتب' : 'بتنبيه حسب إعدادات ديسكورد'}. لا تتكرر تلقائيًا. تغيير المدة يستبدل المؤقّت السابق.`),
    row(button('١٥ دقيقة', 'break_15'), button('٣٠ دقيقة', 'break_30'), button('٦٠ دقيقة', 'break_60'), button('٩٠ دقيقة', 'break_90')),
    ...(breakAt ? [row(button('أضف ١٥ دقيقة', 'break_extend_15'), button('إلغاء المؤقّت', 'break_cancel'))] : []),
    row(button('مساحتي', 'home'))
  ], { ephemeral: true, accent: BRAND.blue });
}

export function breakReminderPayload({ silent = true } = {}) {
  return envelope([
    text('## حان وقت الاستراحة 🌱\nهذا هو التذكير الذي طلبته. خذ استراحتك، وراجع ما تحتاج أن تفرغ له الآن.'),
    text('-# انتهى المؤقّت. لن يتكرر تلقائيًا.'),
    separator(), row(button('ذكّرني بعد ١٥ دقيقة', 'break_15'), button('فكرة خير', 'idea'), button('مساحتي', 'home'))
  ], { silent });
}

export function privacyPayload({ privacyURL, supportURL } = {}) {
  return envelope([
    text('## بياناتك واختياراتك\nنحفظ معرّفك في ديسكورد، واختياراتك، والسيرفرات التي فعّلت فيها التذكير، ومحفوظاتك ومؤقّتك. عند إعداد الصلاة نحفظ المدينة التي تختارها وإحداثيات مركزها ومنطقتها الزمنية وطريقة الحساب والتعديلات واختيار الإشعار والصوت.'),
    text('لا نقرأ محتوى المحادثات ولا نسجّل الصوت. توقيت المجلس يبقى في الذاكرة أثناء التشغيل، وتُحفظ أوقات محاولات التذكير مؤقتًا لمنع التكرار. حذف بياناتك يوقف التنبيهات ويمحو سجلك من قاعدة البوت؛ الرسائل الموجودة في ديسكورد تبقى عندك.'),
    text('-# بيانات التشغيل المحفوظة مشفّرة. ننظّف أوقات المحاولات بعد ٤٨ ساعة، ونزيل اشتراك السيرفر إذا أُزيل منه البوت.'),
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
