import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PUBLIC_POSTS, DHIKR_CARDS, GOOD_DEEDS, OCCASION_CARDS, DAILY_DHIKR, SEASONAL_CARDS } from '../src/content.mjs';
import { assertBalancedQuotationMarks } from '../src/content-review.mjs';

const evidence = JSON.parse(readFileSync(new URL('./fixtures/public-posts-211-260-sources.json', import.meta.url), 'utf8'));
const newPosts = PUBLIC_POSTS.slice(210, 260);
// Ignore vowel marks, typography and the blessing, then normalize alif maqsura.
// Do not remove narrator caveats, clauses, counts or context.
const normalize = text => text.replace(/[^\u0621-\u063a\u0641-\u064a\u0671]/gu, '').replaceAll('صلىاللهعليهوسلم', '').replaceAll('ى', 'ي');
const bodyQuotes = text => [...text.matchAll(/«([^»]+)»/gu)].map(match => normalize(match[1]));

function selectedNarration(source) {
  // 6135 contains a complete first path, followed by Ismail's separate path.
  // Preserve the first path in full; never append the latter path's extra quote.
  if (source.editorialNumber === 254) {
    const boundary = source.arabic.indexOf('حَدَّثَنَا إِسْمَاعِيلُ');
    assert.ok(boundary > 0, 'Missing independent path boundary in Bukhari 6135');
    assert.equal([...source.arabic.matchAll(/"([^"]+)"/gu)].length, 2);
    return source.arabic.slice(0, boundary);
  }
  return source.arabic;
}
const originalQuotes = source => [...selectedNarration(source).matchAll(/"([^"]+)"/gu)].map(match => normalize(match[1]));

// Boundaries were read from each independently retrieved Arabic source.
// Closing markers exclude isnad follow-ups or the compiler's lexical gloss,
// which is retained in the source note of post 246.
const contextRanges = {
  "211": [
    "أول من بدأ"
  ],
  "212": [
    "لا يدخل الجنة"
  ],
  "213": [
    "أن رسول الله مر"
  ],
  "214": [
    "أن النبي قال",
    "تابعه شبابة"
  ],
  "215": [
    "سألت أبا وائل"
  ],
  "216": [
    "وكان شهد بدرا"
  ],
  "217": [
    "أن رسول الله مر"
  ],
  "220": [
    "ما رأيت أحدا"
  ],
  "222": [
    "كان أبو صالح"
  ],
  "223": [
    "كان رسول الله إذا أمسى"
  ],
  "224": [
    "من أحب لقاء الله",
    "اختصره أبو داود"
  ],
  "228": [
    "كان رسول الله في سفر"
  ],
  "229": [
    "جاء رجل إلى النبي"
  ],
  "235": [
    "قيل يا رسول الله"
  ],
  "237": [
    "لقيت أبا ذر"
  ],
  "238": [
    "قال رجل يا رسول الله"
  ],
  "239": [
    "أشهد على النبي"
  ],
  "240": [
    "من عال جاريتين"
  ],
  "242": [
    "كان عبد الله يذكر الناس"
  ],
  "246": [
    "أن النبي قال لبلال",
    "قال أبو عبد الله"
  ],
  "247": [
    "قدم على النبي"
  ],
  "248": [
    "كنا مع حذيفة"
  ],
  "250": [
    "عدنا خبابا"
  ],
  "253": [
    "أن النبي بعث معاذا"
  ]
};

test('posts 211–260 have fifty new references and match every complete quotation separately', () => {
  const earlier = [...DHIKR_CARDS, ...GOOD_DEEDS, ...Object.values(OCCASION_CARDS), ...DAILY_DHIKR, ...Object.values(SEASONAL_CARDS), ...PUBLIC_POSTS.slice(0, 210)];
  const previousReferences = new Set(earlier.flatMap(card => card.source.citations.map(ref => ref.collection + ':' + ref.number.replace(/[a-z]$/u, ''))));
  const previousQuotes = new Set(earlier.map(card => bodyQuotes(card.body || card.text || '').join('')).filter(Boolean));
  const seen = new Set();
  assert.equal(newPosts.length, 50);
  assert.equal(evidence.length, 50);
  assert.equal(new Set(evidence.map(source => source.url)).size, 50);
  assert.deepEqual(evidence.map(source => source.editorialNumber), Array.from({length: 50}, (_, index) => index + 211));
  for (const card of newPosts) {
    const source = evidence.find(source => source.editorialNumber === card.editorialNumber);
    assert.equal(source.url, card.source.url);
    assert.equal(source.retrievedOn, '2026-10-13');
    assert.equal(card.source.checkedOn, source.retrievedOn);
    assert.equal(card.source.citations.length, 1);
    const ref = card.source.citations[0];
    assert.equal(ref.url, source.url);
    assert.ok(!previousReferences.has(ref.collection + ':' + ref.number.replace(/[a-z]$/u, '')), card.id + ': a previous narration or letter variant was repeated');
    assert.deepEqual(bodyQuotes(card.body), originalQuotes(source), card.id + ': a quote was shortened, changed or closed at the wrong boundary');
    assertBalancedQuotationMarks(card.body, card.id);
    assertBalancedQuotationMarks(card.source.note, card.id + '.source.note');
    const words = bodyQuotes(card.body).join('');
    if (words) {
      assert.ok(!previousQuotes.has(words), card.id + ': previously used full quotation');
      assert.ok(!seen.has(words), card.id + ': repeated full quotation');
      seen.add(words);
    }
    assert.ok(!card.source.reference.includes('مقتطف'));
  }
});

test('posts 211–260 preserve the whole matn, dialogue, actions and narrator qualifications', () => {
  for (const card of newPosts) {
    const source = evidence.find(source => source.editorialNumber === card.editorialNumber);
    const range = contextRanges[card.editorialNumber];
    let matn;
    if (range) {
      const text = normalize(selectedNarration(source));
      const [opening, closing] = range;
      const start = text.indexOf(normalize(opening));
      assert.ok(start >= 0, card.id + ': missing source opening');
      const end = closing ? text.indexOf(normalize(closing), start) : text.length;
      assert.ok(end > start, card.id + ': missing source closing');
      matn = text.slice(start, end);
    } else matn = originalQuotes(source).join('');
    assert.ok(matn.length > 0, card.id + ': empty original narration');
    assert.ok(normalize(card.body).endsWith(matn), card.id + ': full context, reply, action or narrator words were omitted or changed');
  }
  const cardFor = number => newPosts.find(card => card.editorialNumber === number);
  assert.equal(cardFor(211).source.citations[0].narrator, 'أبو سعيد الخدري');
  assert.equal(cardFor(214).source.citations[0].narrator, 'أبو شريح');
  assert.equal(cardFor(221).source.citations[0].narrator, 'الأغر المزني');
  assert.equal(cardFor(238).source.citations[0].narrator, 'أبو مسعود الأنصاري');
  for (const number of [220, 239, 242, 250]) assert.equal(bodyQuotes(cardFor(number).body).length, 0, number + ': narrative or Companion speech must not become a direct Prophetic quotation');
  assert.ok(normalize(cardFor(223).body.replace(/«[^»]+»/gu, '')).includes(normalize('قال الحسن فحدثني الزبيد أنه حفظ عن إبراهيم في هذا')));
  assert.ok(normalize(cardFor(224).body.replace(/«[^»]+»/gu, '')).includes(normalize('قالت عائشة أو بعض أزواجه')));
  assert.ok(normalize(cardFor(239).body).includes(normalize('أو قال عطاء أشهد على ابن عباس')));
  assert.ok(cardFor(240).body.endsWith('وضم أصابعه.'));
  assert.ok(cardFor(246).body.includes('قال: ما عملت عملًا أرجى عندي'));
  assert.ok(cardFor(246).source.note.includes('دف نعليك يعني تحريك'));
  assert.equal(bodyQuotes(cardFor(254).body).length, 1, 'Separate Ismail path must not be spliced into the first narration');
});
