// Fixed, source-checked content. Application suggestions are never hadith text.
export const HADITH_BOOKS = Object.freeze({ bukhari: 'صحيح البخاري', muslim: 'صحيح مسلم', abudawud: 'سنن أبي داود', tirmidhi: 'جامع الترمذي' });
const citation = (collection, number, narrator) => ({ collection, number, narrator, book: HADITH_BOOKS[collection], url: `https://sunnah.com/${collection}:${number}` });
const source = (url, reference, note = '', citations = []) => ({
  url, reference, note, citations, publisher: url.startsWith('https://binbaz.org.sa/') ? 'الموقع الرسمي للشيخ ابن باز' : 'نص كتاب الحديث على Sunnah.com', checkedOn: '2026-09-08'
});
export const DHIKR_CARDS = Object.freeze([
  {
    id: 'majlis', title: 'كفارة المجلس', category: 'عند ختام المجلس',
    text: 'سبحانك اللهم وبحمدك،\nأشهد أن لا إله إلا أنت،\nأستغفرك وأتوب إليك.',
    source: source('https://binbaz.org.sa/fatwas/15808/الحكم-على-حديث-كفارة-المجلس', 'رواه أبو داود والترمذي',
      'قال الترمذي: «حديث حسن غريب صحيح من هذا الوجه». وصحّح ابن باز حديث كفارة المجلس في الشرح المرتبط أدناه.\nيقال عند القيام من المجلس. بيّن الشيخ أن الكبائر تحتاج إلى توبة. مهلة وصول إشعار رفيق لتنظيم الإرسال، وليست وقتًا شرعيًا للذكر.',
      [citation('abudawud', '4859', 'أبو برزة الأسلمي'), citation('tirmidhi', '3433', 'أبو هريرة')])
  },
  {
    id: 'two-words', title: 'كلمتان خفيفتان', category: 'ذكر مطلق',
    text: 'سبحان الله وبحمده، سبحان الله العظيم.',
    source: source('https://binbaz.org.sa/fatwas/4157/هل-الذكر-سبب-لطمانينة-القلب', 'رواه البخاري ومسلم',
      'هاتان الكلمتان واردتان في الحديث. لا يخصّص رفيق لهما عددًا أو وقتًا تعبديًا.',
      [citation('bukhari', '7563', 'أبو هريرة'), citation('muslim', '2694', 'أبو هريرة')])
  },
  {
    id: 'four-words', title: 'أربع كلمات', category: 'ذكر مطلق',
    text: 'سبحان الله، والحمد لله، ولا إله إلا الله، والله أكبر.',
    source: source('https://binbaz.org.sa/audios/3822/03-من-حديث-اي-الكلام-احب-الى-الله-عز-وجل', 'رواه مسلم',
      'وردت في حديث أحبّ الكلام إلى الله أربع. لا يخصّص رفيق لها عددًا أو ترتيبًا لازمًا.',
      [citation('muslim', '2137a', 'سمرة بن جندب')])
  },
  {
    id: 'hawqala', title: 'لا حول ولا قوة إلا بالله', category: 'ذكر مطلق',
    text: 'لا حول ولا قوة إلا بالله.',
    source: source('https://binbaz.org.sa/fatwas/2509/ما-صحة-حديث-قل-لامتك-يقـولوا-لا-حـول-ولا-قـوة-الا-بالله', 'رواه البخاري ومسلم',
      'اعتمدنا الحديث الصحيح في الحوقلة. أمّا الخبر الذي يعيّن عشر مرات صباحًا ومساءً ونومًا في سؤال صفحة الشرح فلم يعرف الشيخ له أصلًا، ولم ندرجه.',
      [citation('bukhari', '6384', 'أبو موسى الأشعري'), citation('muslim', '2704a', 'أبو موسى الأشعري')])
  },
  {
    id: 'guidance', title: 'دعاء جامع', category: 'دعاء مأثور',
    text: 'اللهم إني أسألك الهدى والتقى والعفاف والغنى.',
    source: source('https://binbaz.org.sa/audios/2168/30-من-حديث-اللهم-اني-اسالك-الهدى-والتقى-والعفاف-والغنى', 'رواه مسلم',
      'دعاء نبوي. لا يربطه رفيق بوقت أو عدد لم يرد في النص.',
      [citation('muslim', '2721a', 'عبد الله بن مسعود')])
  }
]);
export const OCCASION_CARDS = Object.freeze({
  fridayPrayer: {
    id: 'friday-prayer', title: 'استعدّ لصلاة الجمعة',
    body: 'تذكير للاستعداد لصلاة الجمعة. راجع موعد الخطبة والصلاة في مسجدك.',
    source: { ...source('https://sunnah.com/bukhari:881', 'رواه البخاري',
      'الحديث أصل فضل التبكير إلى الجمعة. نص التذكير صياغة من رفيق؛ مهلة ٤٥ دقيقة تنظيم للإشعار، وليست تحديدًا شرعيًا ولا معرفة بموعد خطبة مسجدك.',
      [citation('bukhari', '881', 'أبو هريرة')]), checkedOn: '2026-09-13' }
  },
  fridayDua: {
    id: 'friday-dua', title: 'وقت للدعاء يوم الجمعة',
    body: 'خصّص وقتًا للدعاء. آخر يوم الجمعة بعد العصر من أرجى أوقات الإجابة.',
    source: { ...source('https://binbaz.org.sa/fatwas/21354/متى-ساعة-الاجابة-يوم-الجمعة-وكيفية-الدعاء', 'رواه أبو داود',
      'حديث جابر في التماسها آخر ساعة بعد العصر، صححه الألباني. بيّن ابن باز أن ما بعد العصر إلى الغروب من أرجى أوقاتها. نص التذكير صياغة من رفيق؛ الساعة ذات الستين دقيقة موعد تنبيه تقني، ولا نجزم بتعيين ساعة الإجابة.',
      [citation('abudawud', '1048', 'جابر بن عبد الله')]), checkedOn: '2026-09-13' }
  },
  qada: {
    id: 'ramadan-qada', title: 'تذكير بقضاء رمضان',
    body: 'إن بقي عليك قضاء من رمضان، فرتّب له أيامًا قبل رمضان القادم بحسب استطاعتك. يمكنك إيقاف هذا التذكير متى لم تعد تحتاجه.',
    source: { ...source('https://binbaz.org.sa/fatwas/12340/جاء-رمضان-وعليه-ايام-من-رمضان-سابق-هل-يكون-اثما', 'أثر عائشة في صحيح البخاري',
      'أثر عائشة في قضاء الصيام في شعبان، وبيان ابن باز للقضاء قبل رمضان القادم مع التفريق في العذر. نص التذكير صياغة من رفيق؛ موعدا ٣٠ و١٥ يومًا لتنظيم الإشعارات، ولا يدعوان إلى تأخير القضاء إلى شعبان.',
      [citation('bukhari', '1950', 'عائشة')]), checkedOn: '2026-09-13' }
  }
});
const speech = source('https://sunnah.com/bukhari:6018', 'رواه البخاري ومسلم',
  'أصل الفكرة في الأمر بالقول الطيب. صياغة الرسالة أو طريقة مساعدة صاحبك اقتراح من رفيق، وليست لفظ الحديث.',
  [citation('bukhari', '6018', 'أبو هريرة'), citation('muslim', '47a', 'أبو هريرة')]);
const guidance = source('https://sunnah.com/muslim:1893a', 'رواه مسلم',
  'النص المعروض جزء من حديث الدلالة على الخير. المثال العملي اقتراح من رفيق.',
  [citation('muslim', '1893a', 'أبو مسعود الأنصاري')]);
export const IDEA_CATEGORIES = Object.freeze([
  { id: 'all', label: 'كل الأفكار', description: 'تصفّح أفكار الخير الست' },
  { id: 'family', label: 'مع أهلي', description: 'برّ الوالدين وصلة الرحم' },
  { id: 'friends', label: 'مع أصحابي', description: 'نفع وكلمة طيبة' },
  { id: 'play', label: 'أثناء اللعب', description: 'هدوء وحسن تعامل' }
]);
export const GOOD_DEEDS = Object.freeze([
  {
    id: 'parents', category: 'family', title: 'اطمئن على والديك', body: 'اسأل عن حالهما، أو اعرض مساعدة يحتاجانها اليوم.',
    evidence: 'أصل الفكرة: برّ الوالدين وحسن صحبتهما.',
    source: source('https://sunnah.com/bukhari:5971', 'رواه البخاري ومسلم',
      'أصل الفكرة حديث السؤال عمّن أحق بحسن الصحبة. السؤال عن الحال وعرض المساعدة مثالان من رفيق، وليسا نص الحديث.',
      [citation('bukhari', '5971', 'أبو هريرة'), citation('muslim', '2548a', 'أبو هريرة')])
  },
  {
    id: 'help', category: 'friends', title: 'شارك علمًا نافعًا', body: 'إذا عرفت جوابًا صحيحًا لسؤال صاحبك، فاشرحه له برفق. وتثبّت قبل نقل المعلومة.',
    evidence: 'قال ﷺ: «من دل على خير فله مثل أجر فاعله».', source: guidance
  },
  {
    id: 'kind-word', category: 'friends', title: 'اترك كلمة طيبة', body: 'اشكر صاحبك على مساعدة قدّمها، أو شجّع زميلًا تعلّم شيئًا جديدًا.',
    evidence: 'قال ﷺ: «من كان يؤمن بالله واليوم الآخر فليقل خيرًا أو ليصمت».', source: speech
  },
  {
    id: 'calm', category: 'play', title: 'قبل أن تردّ بغضب', body: 'إذا اشتدّ النقاش في الجولة، توقّف قليلًا عن الردّ، واستعذ بالله من الشيطان الرجيم.',
    evidence: 'وردت الاستعاذة عند الغضب في حديث سليمان بن صرد.',
    source: source('https://sunnah.com/bukhari:6115', 'رواه البخاري ومسلم',
      'وردت الاستعاذة بالله من الشيطان الرجيم في هذا الحديث عند الغضب. التوقف عن الرد في الجولة اقتراح عملي من رفيق.',
      [citation('bukhari', '6115', 'سليمان بن صرد'), citation('muslim', '2610a', 'سليمان بن صرد')])
  },
  {
    id: 'kinship', category: 'family', title: 'صِل قريبًا غاب عنك', body: 'اختر قريبًا لم تتواصل معه منذ مدة، واسأل عنه برسالة مناسبة أو اتصال.',
    evidence: 'أصل الفكرة: صلة الرحم.',
    source: source('https://sunnah.com/bukhari:6138', 'رواه البخاري',
      'في هذه الرواية الأمر بصلة الرحم. اختيار الرسالة أو الاتصال اقتراح من رفيق، وليست له هيئة أو مدة تعبدية مخصوصة.',
      [citation('bukhari', '6138', 'أبو هريرة')])
  },
  {
    id: 'no-insult', category: 'play', title: 'خلّ الجولة بلا إساءة', body: 'إذا أخطأ أحد اللاعبين، أعنه على فهم الخطأ بكلام واضح من غير سبّ أو سخرية.',
    evidence: 'أصل الفكرة: حفظ اللسان والقول الطيب.', source: speech
  }
]);
// Three selections per period; wording follows the cited Arabic narration.
// These are a short selection, not a claim to collect every morning/evening dhikr.
export const DAILY_DHIKR = Object.freeze([
  {
    id: 'daily-forgiveness', title: 'سيد الاستغفار',
    text: 'اللهم أنت ربي، لا إله إلا أنت، خلقتني وأنا عبدك، وأنا على عهدك ووعدك ما استطعت، أعوذ بك من شر ما صنعت، أبوء لك بنعمتك علي، وأبوء لك بذنبي، فاغفر لي، فإنه لا يغفر الذنوب إلا أنت.',
    source: { ...source('https://sunnah.com/bukhari:6306', 'رواه البخاري', 'لفظ الدعاء من حديث شداد بن أوس. ورد فيه قوله في النهار والليل مع اليقين؛ لا يضيف رفيق عددًا تعبديًا من عنده.', [citation('bukhari', '6306', 'شداد بن أوس')]), checkedOn: '2026-09-20' }
  },
  {
    id: 'daily-protection', title: 'بسم الله', repeat: 3,
    text: 'بسم الله الذي لا يضر مع اسمه شيء في الأرض ولا في السماء وهو السميع العليم.',
    source: { ...source('https://sunnah.com/tirmidhi:3388', 'رواه الترمذي', 'وردت ثلاث مرات في صباح كل يوم ومساء كل ليلة. قال الترمذي: «هذا حديث حسن صحيح غريب».', [citation('tirmidhi', '3388', 'عثمان بن عفان')]), checkedOn: '2026-09-20' }
  },
  {
    id: 'daily-life', title: 'اللهم بك أصبحنا وبك أمسينا',
    morning: 'اللهم بك أصبحنا وبك أمسينا وبك نحيا وبك نموت وإليك النشور.',
    evening: 'اللهم بك أمسينا وبك نحيا وبك نموت وإليك النشور.',
    source: { ...source('https://sunnah.com/abudawud:5068', 'رواه أبو داود', 'اعتمدنا لفظ رواية أبي داود رقم ٥٠٦٨ كما في المصدر المرتبط، بما فيه لفظ المساء، دون تركيب ألفاظ الروايات. صححه الألباني.', [citation('abudawud', '5068', 'أبو هريرة')]), checkedOn: '2026-09-20' }
  }
]);
export const SEASONAL_CARDS = Object.freeze({
  'dhul-hijjah': {
    id: 'seasonal-dhul-hijjah', title: 'اقتربت عشر ذي الحجة',
    context: 'قال رسول الله ﷺ:',
    text: 'مَا مِنْ أَيَّامٍ الْعَمَلُ الصَّالِحُ فِيهَا أَحَبُّ إِلَى اللَّهِ مِنْ هَذِهِ الأَيَّامِ',
    source: { ...source('https://sunnah.com/abudawud:2438', 'رواه البخاري، واللفظ لأبي داود',
      'هذا صدر حديث ابن عباس في فضل العمل في أيام العشر، لا الحديث كاملًا. أصل الحديث في صحيح البخاري (٩٦٩)؛ اللفظ المعروض مطابق لرواية أبي داود (٢٤٣٨)، وفيها بعده: يعني أيام العشر. صحح الألباني رواية أبي داود. لم ننسب لفظ أبي داود إلى البخاري.',
      [citation('bukhari', '969', 'عبد الله بن عباس'), citation('abudawud', '2438', 'عبد الله بن عباس')]), checkedOn: '2026-09-23' }
  },
  arafah: {
    id: 'seasonal-arafah', title: 'اقترب يوم عرفة',
    context: 'سُئل رسول الله ﷺ عن صوم يوم عرفة فقال:',
    text: 'يُكَفِّرُ السَّنَةَ الْمَاضِيَةَ وَالْبَاقِيَةَ',
    qualifier: 'تذكير بالصيام لغير الحاج.',
    source: { ...source('https://binbaz.org.sa/fatwas/10173/صوم-التطوع-والايام-التي-يستحب-صيامها', 'رواه مسلم',
      'الجواب المقتبس بلفظه جزء من حديث أبي قتادة في صحيح مسلم (١١٦٢)، رواية b في الرابط. الجملة التي تقدم الاقتباس تلخّص سياق السؤال، ولا تُعرض بين علامتي اقتباس. لا نركّب معه لفظ «أحتسب على الله» من رواية أخرى. التذكير بالصيام لغير الحاج كما في بيان ابن باز المرتبط.',
      [citation('muslim', '1162b', 'أبو قتادة الأنصاري')]), checkedOn: '2026-09-23' }
  }
});
export function dhikrById(id) { return DHIKR_CARDS.find(card => card.id === id); }
export function ideaById(id) { return GOOD_DEEDS.find(card => card.id === id); }
function freezeContent(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freezeContent); Object.freeze(value); }
}
freezeContent(DHIKR_CARDS); freezeContent(GOOD_DEEDS); freezeContent(IDEA_CATEGORIES); freezeContent(OCCASION_CARDS);
freezeContent(DAILY_DHIKR);
freezeContent(SEASONAL_CARDS);
