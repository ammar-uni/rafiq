import { DHIKR_CARDS, GOOD_DEEDS, IDEA_CATEGORIES, dhikrById, ideaById } from './content.mjs';
/** Native Discord REST payloads. Rendering only; these functions never send messages. */
export const FLAGS = Object.freeze({ componentsV2: 32768, ephemeral: 64, silent: 4096 });
export const BRAND = Object.freeze({ name: 'رفيق', accent: 0x65ac89, gold: 0xcab17a, blue: 0x8aaec4, banner: 'rafiq-banner-v2.webp' });
export const SOURCE = DHIKR_CARDS[0].source.citations[0].url;
export const COPY = Object.freeze({
  welcomeTitle: 'خيرٌ خفيف، في وقته.',
  welcomeBody: 'ذكرٌ موثّق، وفكرة خير، واستراحة في وقت تختاره. افتح مساحتك واختر ما ينفعك.',
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
      { type: 12, items: [{ media: { url: `attachment://${BRAND.banner}` }, description: 'رفيق — خيرٌ يرافقك. رمز محادثة عاجي يحتضن نبتة خضراء، وطريق مضيء بلطف.' }] },
      text(`## ${COPY.welcomeTitle}\n${COPY.welcomeBody}`),
      text(`-# ${COPY.welcomeDetail}`),
      separator(),
      row(button('رفيقك للخير', 'home', 3), button('أذكار موثّقة', 'library'), button('فكرة خير', 'idea'))
    ], { silent: true }),
    attachments: [{ id: '0', filename: BRAND.banner, description: 'غلاف رفيق' }]
  };
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
export function settingsPayload({ frequency = 'daily', delivery = 'silent', enabled = false, subscribedHere = true, paused = false, dmBlocked = false, notice = '' } = {}) {
  if (!['daily', 'session'].includes(frequency) || !['normal', 'silent'].includes(delivery)) throw new RangeError('Invalid reminder preference');
  const select = (id, placeholder, options, selected) => row({
    type: 3, custom_id: `rafiq:v1:${id}`, placeholder, min_values: 1, max_values: 1,
    options: options.map(([value, label, description]) => ({ value, label, description, default: value === selected }))
  });
  return envelope([
    text(`${notice ? `${notice}\n` : ''}## تذكيرك على راحتك\n-# ${dmBlocked ? 'تعذّر الوصول إلى الخاص؛ اختبره لاستئناف الإرسال' : paused ? 'التذكير متوقف مؤقتًا' : !enabled ? 'التذكير غير مفعّل' : !subscribedHere ? 'التذكير غير مفعّل في هذا السيرفر' : 'تذكيرك مفعّل'} · اختياراتك تُحفظ فورًا`),
    select('frequency', 'كم مرة؟', [
      ['daily', 'مرة كل ٢٤ ساعة كحد أقصى', 'بداية خفيفة لتقليل تكرار الرسائل'],
      ['session', 'بعد المجالس', 'فاصل ساعتين؛ حتى ٣ مرات خلال ٢٤ ساعة']
    ], frequency),
    select('delivery', 'كيف تصلك الرسالة؟', [
      ['normal', 'تنبيه عادي', 'حسب إعدادات الإشعارات في ديسكورد'],
      ['silent', 'في الخاص، بلا تنبيه', 'دون إشعار دفع أو تنبيه سطح المكتب']
    ], delivery),
    separator(),
    text('-# التكرار وطريقة التنبيه والإيقاف مشتركة بين السيرفرات التي فعّلت فيها رفيق.'),
    row(button(paused ? 'استئناف التنبيهات' : !subscribedHere ? 'فعّل في هذا السيرفر' : enabled ? 'إيقاف ٢٤ ساعة' : 'فعّل تذكيري', paused ? 'resume' : !enabled || !subscribedHere ? 'enable' : 'pause_today'), button('اختبر الخاص', 'test_dm')),
    row(button('إيقاف كل التنبيهات', 'disable'), button('مساحتي', 'home'))
  ], { ephemeral: true });
}
export function ideaPayload(index = 0, { category = 'all' } = {}) {
  if (!Number.isInteger(index) || index < 0) throw new RangeError('Idea index must be a nonnegative integer');
  if (!IDEA_CATEGORIES.some(item => item.id === category)) throw new RangeError('Unknown idea category');
  const ideas = COPY.ideas.filter(item => category === 'all' || item.category === category);
  const idea = ideas.find(item => item === COPY.ideas[index]) || ideas[0];
  const position = ideas.indexOf(idea);
  const actionAt = offset => `idea_${category}_${COPY.ideas.indexOf(ideas[(position + offset + ideas.length) % ideas.length])}`;
  return envelope([
    text(`-# 🌱 فكرة لعمل خير · ${arabicNumber(position + 1)} من ${arabicNumber(ideas.length)}\n## ${idea.title}\n${idea.body}`),
    text('-# صياغة تطبيقية من رفيق؛ الحديث ومصدره في «الدليل والتوضيح».'),
    row({ type: 3, custom_id: 'rafiq:v1:idea_category', placeholder: 'فكرة تناسب موقفك', min_values: 1, max_values: 1,
      options: IDEA_CATEGORIES.map(item => ({ label: item.label, description: item.description, value: item.id, default: item.id === category })) }),
    separator(),
    row(...(ideas.length > 2 ? [button('الفكرة السابقة', actionAt(-1))] : []), button('فكرة أخرى', actionAt(1), 3)),
    row(button('الدليل والتوضيح', `idea_source_${idea.id}_${category}`), button('مساحتي', 'home'))
  ], { ephemeral: true, accent: BRAND.gold });
}
export function ideaSourcePayload(id, { category = 'all' } = {}) {
  const idea = ideaById(id);
  if (!idea || !IDEA_CATEGORIES.some(item => item.id === category)) throw new RangeError('Unknown idea');
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
    text('## مساحتك مع رفيق 🌿\nخيرٌ يرافقك. اختر ما يناسب لحظتك.'), separator(),
    section('### 🌿 أذكار موثّقة\nذكر ودعاء، مع المصدر متى أردت.', button('أذكار موثّقة', 'library', 3)),
    section('### 🌱 فكرة خير\nمع أهلك، مع أصحابك، أو أثناء اللعب.', button('فكرة خير', 'idea')),
    section(`### ⏳ وقت لاستراحة\n${breakAt ? `استراحتك <t:${Math.floor(breakAt / 1000)}:R>.` : 'حدّد وقتًا لرسالة واحدة تذكّرك باستراحتك.'}`, button(breakAt ? 'إدارة المؤقّت' : 'وقت لاستراحة', 'break')),
    separator(),
    text(`-# ${status}${favoriteCount ? ` · ${arabicNumber(favoriteCount)} في محفوظاتك` : ''}`),
    row(button('محفوظاتي', 'favorites'), button(enabled && subscribedHere ? 'ضبط تذكيري' : 'فعّل تذكير المجلس', enabled && subscribedHere ? 'settings' : 'reminder_intro')),
    separator(), row(button('مصادرنا', 'methodology'), button('بياناتي', 'privacy'), button('مساعدة وإبلاغ', 'support'))
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

export function breakPayload({ breakAt = null, notice = '' } = {}) {
  return envelope([
    text(`${notice ? `${notice}\n` : ''}## وقت لاستراحة\n${breakAt ? `مؤقّتك مضبوط: <t:${Math.floor(breakAt / 1000)}:R>.` : 'اختر متى أذكّرك باستراحة من الجلسة.'}`),
    text('-# رسالة واحدة في الخاص، بلا تكرار. تغيير المدة يستبدل المؤقّت السابق.'),
    row(button('١٥ دقيقة', 'break_15'), button('٣٠ دقيقة', 'break_30'), button('٦٠ دقيقة', 'break_60'), button('٩٠ دقيقة', 'break_90')),
    row(button('إلغاء المؤقّت', 'break_cancel'), button('مساحتي', 'home'))
  ], { ephemeral: true, accent: BRAND.blue });
}

export function breakReminderPayload({ silent = true } = {}) {
  return envelope([
    text('## حان وقت الاستراحة 🌱\nهذا هو التذكير الذي طلبته. خذ استراحتك، وراجع ما تحتاج أن تفرغ له الآن.'),
    text('-# انتهى المؤقّت. لن يتكرر تلقائيًا.'),
    separator(), row(button('فكرة خير', 'idea'), button('مساحتي', 'home'))
  ], { silent });
}

export function privacyPayload({ privacyURL, supportURL } = {}) {
  return envelope([
    text('## بياناتك عندك\nنحفظ معرّفك في ديسكورد، واختياراتك، والسيرفرات التي فعّلت فيها التذكير، ومحفوظاتك، وموعد المؤقّت إن طلبته.'),
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
