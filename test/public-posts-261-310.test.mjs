import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PUBLIC_POSTS, DHIKR_CARDS, GOOD_DEEDS, OCCASION_CARDS, DAILY_DHIKR, SEASONAL_CARDS } from '../src/content.mjs';
import { assertBalancedQuotationMarks } from '../src/content-review.mjs';

const evidence = JSON.parse(readFileSync(new URL('./fixtures/public-posts-261-310-sources.json', import.meta.url), 'utf8'));
const newPosts = PUBLIC_POSTS.slice(260, 310);
// Typography and vowel marks may differ; words, clauses, dialogue and counts may not.
const normalize = text => text.replace(/[^\u0621-\u063a\u0641-\u064a\u0671]/gu, '').replaceAll('صلىاللهعليهوسلم', '').replaceAll('ى', 'ي');
const bodyQuotes = text => [...text.matchAll(/«([^»]+)»/gu)].map(match => normalize(match[1]));

function selectedNarration(source) {
  if (source.editorialNumber !== 284) return source.arabic;
  // Bukhari 1443 has two paths. The second is complete and uses المنفق.
  const boundary = source.arabic.indexOf('وَحَدَّثَنَا أَبُو الْيَمَانِ');
  assert.ok(boundary > 0, 'Missing second path in Bukhari 1443');
  assert.equal([...source.arabic.matchAll(/"([^"]+)"/gu)].length, 2);
  return source.arabic.slice(boundary);
}

function splitOnce(text, phrase) {
  const words = normalize(phrase);
  const index = text.indexOf(words);
  assert.ok(index >= 0, 'Missing independently checked narrator qualification: ' + phrase);
  assert.equal(text.indexOf(words, index + words.length), -1, 'Ambiguous qualification boundary');
  return [text.slice(0, index), text.slice(index + words.length)];
}

function originalQuotes(source) {
  const quotes = [...selectedNarration(source).matchAll(/"([^"]+)"/gu)].map(match => normalize(match[1]));
  if (source.editorialNumber === 284) {
    assert.equal(quotes.length, 1);
    return splitOnce(quotes[0], 'أو وفرت');
  }
  if (source.editorialNumber === 306) {
    assert.equal(quotes.length, 1);
    const [first, rest] = splitOnce(quotes[0], 'أو قال عاجل أمري وآجله');
    const [second, last] = splitOnce(rest, 'أو قال في عاجل أمري وآجله');
    const ending = normalize('قال ويسمي حاجته');
    assert.ok(last.endsWith(ending), 'Missing closing narrator words in Bukhari 1166');
    return [first, second, last.slice(0, -ending.length)];
  }
  if (source.editorialNumber === 309) {
    assert.equal(quotes.length, 1);
    return splitOnce(quotes[0], 'أو خمس من الفطرة');
  }
  return quotes;
}

// Read boundaries in the independent source text, rather than an excerpt in a card.
// Closing boundaries only exclude compiler glosses and isnad-only follow-ups.
const contextRanges = {
  261: ['مر النبي'],
  262: ['دخلنا مع رسول الله', 'رواه موسى'],
  263: ['أرسلت ابنة النبي'],
  264: ['سمعت رسول الله'],
  265: ['كان النبي'],
  266: ['سألت رسول الله'],
  267: ['لا يخلون رجل'],
  268: ['سألت عائشة'],
  269: ['ما حجبني النبي'],
  270: ['سمع عمر'],
  271: ['بلغوا عني'],
  272: ['كان فيمن كان قبلكم'],
  273: ['عذبت امرأة'],
  274: ['ثنتان حفظتهما'],
  275: ['جاء ثلاثة رهط'],
  276: ['قال لي رسول الله', 'وقال هشام'],
  277: ['حفظت من النبي'],
  278: ['كانت بي بواسير'],
  279: ['يا أبا موسى'],
  280: ['من حفظ عشر آيات'],
  281: ['قال رسول الله'],
  282: ['أن ناسا'],
  283: ['على كل مسلم صدقة'],
  284: ['مثل البخيل والمنفق', 'تابعه الحسن'],
  285: ['ليس المسكين'],
  286: ['أن رجلا'],
  287: ['رغم أنف'],
  288: ['إن الله يقول يوم القيامة'],
  289: ['عن النبي'],
  290: ['لا يشير أحدكم'],
  291: ['رب أشعث'],
  292: ['لا يجوع أهل بيت'],
  293: ['أن النبي'],
  294: ['إذا شرب أحدكم'],
  295: ['لا يقولن أحدكم'],
  296: ['أن رسول الله'],
  297: ['كان رسول الله'],
  298: ['أن رسول الله'],
  299: ['من نسي صلاة', 'وقال حبان'],
  300: ['إذا أنفقت المرأة'],
  301: ['أنه سمع رسول الله'],
  302: ['بايعت رسول الله'],
  303: ['إن من الشجر شجرة'],
  304: ['مثل ما بعثني الله', 'قال أبو عبد الله'],
  305: ['أنه كان'],
  306: ['كان رسول الله'],
  307: ['الرؤيا الصالحة', 'وعن أبيه حدثنا'],
  308: ['إن الله خلق الخلق'],
  309: ['الفطرة خمس'],
  310: ['طعام الواحد', 'وفي رواية إسحاق']
};

test('posts 261–310 add fifty distinct references and preserve every complete quotation', () => {
  const earlier = [...DHIKR_CARDS, ...GOOD_DEEDS, ...Object.values(OCCASION_CARDS), ...DAILY_DHIKR, ...Object.values(SEASONAL_CARDS), ...PUBLIC_POSTS.slice(0, 260)];
  const baseRef = ref => ref.collection + ':' + ref.number.replace(/[a-z]$/u, '');
  const seenRefs = new Set(earlier.flatMap(card => card.source.citations.map(baseRef)));
  const seenQuotes = new Set(earlier.map(card => bodyQuotes(card.body || card.text || '').join('')).filter(Boolean));
  assert.equal(newPosts.length, 50);
  assert.equal(evidence.length, 50);
  assert.equal(new Set(evidence.map(source => source.url)).size, 50);
  assert.deepEqual(evidence.map(source => source.editorialNumber), Array.from({length: 50}, (_, i) => 261 + i));
  for (const card of newPosts) {
    const source = evidence.find(source => source.editorialNumber === card.editorialNumber);
    assert.equal(source.url, card.source.url);
    assert.equal(source.retrievedOn, '2026-10-15');
    assert.equal(card.source.checkedOn, source.retrievedOn);
    assert.equal(card.source.citations.length, 1);
    const ref = card.source.citations[0];
    assert.equal(ref.url, source.url);
    assert.ok(!seenRefs.has(baseRef(ref)), card.id + ': a previous reference or letter variant was repeated');
    seenRefs.add(baseRef(ref));
    assert.deepEqual(bodyQuotes(card.body), originalQuotes(source), card.id + ': a quotation was shortened, altered or closed at the wrong boundary');
    assertBalancedQuotationMarks(card.body, card.id);
    assertBalancedQuotationMarks(card.source.note, card.id + '.source.note');
    const words = bodyQuotes(card.body).join('');
    if (words) {
      assert.ok(!seenQuotes.has(words), card.id + ': an earlier complete quotation was repeated');
      seenQuotes.add(words);
    }
    assert.ok(!card.source.reference.includes('مقتطف'));
  }
});

test('posts 261–310 retain the whole matn, actions, replies and narrator qualifications', () => {
  for (const card of newPosts) {
    const source = evidence.find(source => source.editorialNumber === card.editorialNumber);
    const text = normalize(selectedNarration(source));
    const [opening, closing] = contextRanges[card.editorialNumber];
    const start = text.indexOf(normalize(opening));
    assert.ok(start >= 0, card.id + ': missing source opening');
    const end = closing ? text.indexOf(normalize(closing), start) : text.length;
    assert.ok(end > start, card.id + ': missing source closing');
    const matn = text.slice(start, end);
    assert.ok(normalize(card.body).endsWith(matn), card.id + ': context, dialogue or narrator wording was omitted or changed');
  }
  const cardFor = n => newPosts.find(card => card.editorialNumber === n);
  const outside = n => normalize(cardFor(n).body.replace(/«[^»]+»/gu, ''));
  for (const n of [266, 268, 277, 302, 305]) assert.equal(bodyQuotes(cardFor(n).body).length, 0, n + ': narrated actions must not become direct Prophetic speech');
  assert.equal(cardFor(270).source.citations[0].narrator, 'عمر بن الخطاب');
  for (const n of [271, 276, 301]) assert.equal(cardFor(n).source.citations[0].narrator, 'عبد الله بن عمرو بن العاص');
  assert.equal(cardFor(283).source.citations[0].narrator, 'أبو موسى الأشعري');
  for (const n of [294, 307]) assert.equal(cardFor(n).source.citations[0].narrator, 'أبو قتادة الأنصاري');
  assert.ok(normalize(cardFor(269).body).includes(normalize('ولقد شكوت إليه أني لا أثبت على الخيل')));
  assert.ok(outside(265).includes(normalize('قال أحسبه فطيم')));
  assert.ok(outside(272).includes(normalize('قال قتادة فقال الحسن ذكر لنا')));
  assert.ok(outside(274).includes(normalize('ثنتان حفظتهما')));
  assert.ok(outside(277).includes(normalize('حدثتني حفصة')));
  assert.ok(cardFor(281).body.includes('﴿الله لا إله إلا هو الحي القيوم﴾'));
  assert.ok(outside(281).includes(normalize('الله لا إله إلا هو الحي القيوم')));
  assert.ok(outside(284).includes(normalize('أو وفرت')));
  assert.equal((normalize(cardFor(287).body).match(/رغمأنف/gu) || []).length, 3);
  assert.equal((normalize(cardFor(289).body).match(/ياعبادي/gu) || []).length, 10);
  assert.ok(outside(289).includes(normalize('قال سعيد كان أبو إدريس الخولاني')));
  assert.equal((normalize(cardFor(293).body).match(/نعمالأدمالخل/gu) || []).length, 2);
  assert.ok(outside(297).includes(normalize('يتأول القرآن')));
  assert.equal((cardFor(299).body.match(/﴿وأقم الصلاة لذكري﴾/gu) || []).length, 2);
  assert.ok(outside(299).includes(normalize('قال موسى قال همام')));
  for (const phrase of ['أو قال عاجل أمري وآجله', 'أو قال في عاجل أمري وآجله', 'قال ويسمي حاجته']) {
    assert.ok(outside(306).includes(normalize(phrase)), 'Missing separated narrator wording: ' + phrase);
  }
  assert.ok(outside(309).includes(normalize('أو خمس من الفطرة')));
  assert.ok(cardFor(304).source.note.includes('قال أبو عبد الله قال إسحاق'));
  for (const n of [297, 298]) {
    const source = evidence.find(e => e.editorialNumber === n);
    assert.equal(source.retrievedFrom, 'https://sunnah.com/muslim/4');
    assert.ok(source.sourceLine > 0);
  }
});

