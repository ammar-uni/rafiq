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
export function dhikrById(id) { return DHIKR_CARDS.find(card => card.id === id); }
export function ideaById(id) { return GOOD_DEEDS.find(card => card.id === id); }
function freezeContent(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freezeContent); Object.freeze(value); }
}
freezeContent(DHIKR_CARDS); freezeContent(GOOD_DEEDS); freezeContent(IDEA_CATEGORIES);
