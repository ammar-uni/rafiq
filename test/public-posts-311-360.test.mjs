import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PUBLIC_POSTS, DHIKR_CARDS, GOOD_DEEDS, OCCASION_CARDS, DAILY_DHIKR, SEASONAL_CARDS } from '../src/content.mjs';
import { assertBalancedQuotationMarks } from '../src/content-review.mjs';

const evidence = JSON.parse(readFileSync(new URL('./fixtures/public-posts-311-360-sources.json', import.meta.url), 'utf8'));
const newPosts = PUBLIC_POSTS.slice(310, 360);
// Ignore typography and vowel marks, normalize alif maqsura and the blessing.
// Never discard a clause, count, exception, dialogue or narrator qualification.
const normalize = text => text.replace(/[^\u0621-\u063a\u0641-\u064a\u0671]/gu, '').replaceAll('صلىاللهعليهوسلم', '').replaceAll('ى', 'ي');
const bodyQuotes = text => [...text.matchAll(/«([^»]+)»/gu)].map(match => normalize(match[1]));

function selectedNarration(source) {
  if (source.editorialNumber === 315) {
    const boundary = source.arabic.indexOf('وَفِي حَدِيثِ ابْنِ بَشَّارٍ');
    assert.ok(boundary > 0, 'Missing alternative Ibn Bashshar path in Muslim 2742');
    return source.arabic.slice(0, boundary);
  }
  if (source.editorialNumber === 344) {
    const quotes = [...source.arabic.matchAll(/"([^"]+)"/gu)];
    assert.equal(quotes.length, 2);
    assert.equal(normalize(quotes[0][1]), normalize('إذا قام أحدكم'));
    assert.ok(normalize(quotes[1][1]).startsWith(normalize('من قام من مجلسه')));
    return quotes[1][0]; // Abu Awanah's complete independent wording.
  }
  if (source.editorialNumber === 346) {
    const boundary = source.arabic.indexOf('وَلَمْ يَذْكُرْ قُتَيْبَةُ');
    assert.ok(boundary > 0, 'Missing Qutaybah path note in Muslim 2012a');
    return source.arabic.slice(0, boundary); // Ibn Rumh's complete wording.
  }
  return source.arabic;
}

function splitOnce(text, phrase) {
  const words = normalize(phrase), index = text.indexOf(words);
  assert.ok(index >= 0, 'Missing independently read narrator words: ' + phrase);
  assert.equal(text.indexOf(words, index + words.length), -1, 'Ambiguous narrator boundary');
  return [text.slice(0, index), text.slice(index + words.length)];
}

function originalQuotes(source) {
  const quotes = [...selectedNarration(source).matchAll(/"([^"]+)"/gu)].map(match => normalize(match[1]));
  if (source.editorialNumber === 357) {
    assert.equal(quotes.length, 2);
    const [first, rest] = splitOnce(quotes[0], 'إلى آخر الآية');
    const [second, ending] = splitOnce(rest, 'والآية التي في الحشر');
    const [third, fourth] = splitOnce(ending, 'حتى قال');
    return [first, second, third, fourth, quotes[1]];
  }
  if (source.editorialNumber === 360) {
    // The source uses no ASCII quotation marks here. The direct speech starts
    // after وقال; Jabir's preceding narrative must stay outside Prophetic quotes.
    assert.equal(quotes.length, 0);
    const direct = source.arabic.match(/وَقَالَ (هُمْ سَوَاءٌ)/u)?.[1];
    assert.ok(direct, 'Missing direct-speech boundary in Muslim 1598');
    return [normalize(direct)];
  }
  return quotes;
}

// Independently read matn boundaries in the retained source text.
// Closing boundaries exclude compiler/isnad follow-ups, never matn sentences.
const contextRanges = {
  311: ['تجد من شر الناس'],
  312: ['من حلف على ملة'],
  313: ['من حمل علينا السلاح'],
  314: ['أتى النبي'],
  315: ['إن الدنيا حلوة'],
  316: ['قال الله تبارك وتعالى'],
  317: ['سمعت جندبا'],
  318: ['ألا كلكم راع'],
  319: ['من أحدث في أمرنا', 'رواه عبد الله'],
  320: ['مثل القائم على حدود الله'],
  321: ['إن الأشعريين'],
  322: ['الحلف منفقة'],
  323: ['من أخذ أموال الناس'],
  324: ['مطل الغني ظلم'],
  325: ['من نذر أن يطيع الله'],
  326: ['إذا سمعتم المؤذن'],
  327: ['من صلى البردين', 'وقال ابن رجاء'],
  328: ['إذا سمعتم الإقامة'],
  329: ['ما بال أقوام'],
  330: ['يوم يقوم الناس لرب العالمين'],
  331: ['أول ما يقضى'],
  332: ['أن رجلا قال والله'],
  333: ['دخل رهط'],
  334: ['لا يتقدمن أحدكم'],
  335: ['لا يزال الناس بخير'],
  336: ['من صام رمضان'],
  337: ['إن في الجنة بابا'],
  338: ['إن المقسطين'],
  339: ['إن من أشر الناس'],
  340: ['إن الله حرم عليكم'],
  341: ['أنه كانت بينه'],
  342: ['نهى النبي'],
  343: ['إذا عطس أحدكم'],
  344: ['من قام من مجلسه'],
  345: ['لا يمشي أحدكم'],
  346: ['غطوا الإناء'],
  347: ['لا آكل متكئا'],
  348: ['من قال لا إله إلا الله'],
  349: ['إذا انتعل أحدكم'],
  350: ['أنه قال لرسول الله'],
  351: ['أن رسول الله'],
  352: ['قال لي النبي'],
  353: ['أن نافع بن عبد الحارث'],
  354: ['خرج رسول الله'],
  355: ['ما لأحدهم يقول'],
  356: ['أنها جاءت إلى النبي'],
  357: ['كنا عند رسول الله'],
  358: ['يا ابن آدم إنك'],
  359: ['أحق الشروط'],
  360: ['لعن رسول الله']
};

test('posts 311–360 add fifty distinct references and preserve each complete Prophetic quotation', () => {
  const earlier = [...DHIKR_CARDS, ...GOOD_DEEDS, ...Object.values(OCCASION_CARDS), ...DAILY_DHIKR, ...Object.values(SEASONAL_CARDS), ...PUBLIC_POSTS.slice(0, 310)];
  const baseRef = ref => ref.collection + ':' + ref.number.replace(/[a-z]$/u, '');
  const seenRefs = new Set(earlier.flatMap(c => c.source.citations.map(baseRef)));
  const seenQuotes = new Set(earlier.map(c => bodyQuotes(c.body || c.text || '').join('')).filter(Boolean));
  assert.equal(newPosts.length, 50);
  assert.equal(evidence.length, 50);
  assert.equal(new Set(evidence.map(s => s.url)).size, 50);
  assert.deepEqual(evidence.map(s => s.editorialNumber), Array.from({length: 50}, (_, i) => 311 + i));
  for (const card of newPosts) {
    const source = evidence.find(s => s.editorialNumber === card.editorialNumber);
    assert.equal(source.url, card.source.url);
    assert.equal(source.retrievedOn, '2026-10-16');
    assert.equal(card.source.checkedOn, source.retrievedOn);
    assert.equal(card.source.citations.length, 1);
    const ref = card.source.citations[0];
    assert.equal(ref.url, source.url);
    assert.ok(source.referenceText.replace(/\s/gu, '').endsWith(ref.number), 'Primary footer number differs: ' + card.id);
    assert.ok(!seenRefs.has(baseRef(ref)), 'An earlier reference or letter variant was reused: ' + card.id);
    seenRefs.add(baseRef(ref));
    assert.deepEqual(bodyQuotes(card.body), originalQuotes(source), card.id + ': quote shortened, altered or closed at the wrong boundary');
    assertBalancedQuotationMarks(card.body, card.id);
    assertBalancedQuotationMarks(card.source.note, card.id + '.source.note');
    const words = bodyQuotes(card.body).join('');
    assert.ok(words.length > 0);
    assert.ok(!seenQuotes.has(words), 'An earlier complete quotation was repeated: ' + card.id);
    seenQuotes.add(words);
    assert.ok(!card.source.reference.includes('مقتطف'));
  }
});

test('posts 311–360 retain full context, dialogue, conditions, counts and narrator words', () => {
  for (const card of newPosts) {
    const source = evidence.find(s => s.editorialNumber === card.editorialNumber);
    const text = normalize(selectedNarration(source));
    const [opening, closing] = contextRanges[card.editorialNumber];
    const start = text.indexOf(normalize(opening));
    assert.ok(start >= 0, card.id + ': missing independently checked opening');
    const end = closing ? text.indexOf(normalize(closing), start) : text.length;
    assert.ok(end > start, card.id + ': missing independently checked ending');
    assert.ok(normalize(card.body).endsWith(text.slice(start, end)), card.id + ': a matn clause, action, reply or narrator qualification was lost or changed');
  }
  const cardFor = n => newPosts.find(c => c.editorialNumber === n);
  const outside = n => normalize(cardFor(n).body.replace(/«[^»]+»/gu, ''));
  assert.equal(cardFor(312).source.citations[0].narrator, 'ثابت بن الضحاك');
  assert.ok(outside(312).includes(normalize('وكان من أصحاب الشجرة')));
  assert.equal(cardFor(317).source.citations[0].narrator, 'جندب');
  assert.ok(outside(317).includes(normalize('ولم أسمع أحدا يقول قال النبي غيره فدنوت منه')));
  for (const n of [326, 338]) assert.equal(cardFor(n).source.citations[0].narrator, 'عبد الله بن عمرو بن العاص');
  assert.equal(cardFor(327).source.citations[0].narrator, 'أبو موسى الأشعري');
  assert.ok(outside(329).includes(normalize('فاشتد قوله في ذلك حتى قال')));
  assert.ok(outside(332).endsWith(normalize('أو كما قال')));
  assert.ok(outside(333).includes(normalize('فقلت يا رسول الله ولم تسمع ما قالوا')));
  assert.ok(normalize(cardFor(334).body).includes(normalize('إلا أن يكون رجل كان يصوم صومه فليصم ذلك اليوم')));
  assert.equal((normalize(cardFor(337).body).match(/لايدخلمنهأحدغيرهم/gu) || []).length, 2);
  assert.ok(outside(341).includes(normalize('فقالت يا أبا سلمة اجتنب الأرض')));
  assert.ok(normalize(cardFor(342).body).includes(normalize('وإنه يفقأ العين ويكسر السن')));
  assert.equal((normalize(cardFor(348).body).match(/مائة/gu) || []).length, 4);
  assert.ok(normalize(cardFor(348).body).includes(normalize('ومن قال سبحان الله وبحمده في يوم مائة مرة')));
  assert.equal(cardFor(350).source.citations[0].narrator, 'أبو بكر الصديق');
  assert.ok(outside(350).includes(normalize('علمني دعاء أدعو به في صلاتي')));
  assert.ok(outside(352).endsWith(normalize('فالتفت إليه فإذا عيناه تذرفان')));
  assert.equal(cardFor(353).source.citations[0].narrator, 'عمر بن الخطاب');
  assert.equal(cardFor(353).source.citations[0].number, '817a');
  for (const words of ['إلى آخر الآية', 'والآية التي في الحشر', 'حتى قال', 'ثم تتابع الناس']) {
    assert.ok(outside(357).includes(normalize(words)), 'Missing separately attributed narrator context: ' + words);
  }
  assert.equal(bodyQuotes(cardFor(357).body).length, 5);
  assert.ok(normalize(cardFor(358).body).includes(normalize('ولا تلام على كفاف وابدأ بمن تعول')));
  assert.ok(outside(360).includes(normalize('لعن رسول الله آكل الربا وموكله وكاتبه وشاهديه وقال')));
  assert.deepEqual(bodyQuotes(cardFor(360).body), [normalize('هم سواء')]);
});

