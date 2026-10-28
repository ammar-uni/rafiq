import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PUBLIC_POSTS, DHIKR_CARDS, GOOD_DEEDS, OCCASION_CARDS, DAILY_DHIKR, SEASONAL_CARDS } from '../src/content.mjs';

const evidence = JSON.parse(readFileSync(new URL('./fixtures/public-posts-161-210-sources.json', import.meta.url), 'utf8'));
const newPosts = PUBLIC_POSTS.slice(160, 210);
// Normalize typography, vowel marks, the blessing and alif maqsura only.
// Narrator qualifications remain in the complete narration below.
const normalize = text => text.replaceAll('صلى الله عليه وسلم', '').replace(/[^\u0621-\u063a\u0641-\u064a\u0671]/gu, '').replaceAll('ى', 'ي');
const quotedWords = text => normalize([...text.matchAll(/«([^»]+)»/gu)].map(match => match[1]).join(' '));

function primaryQuotation(source, number) {
  // Bukhari 6290 uses braces for the Prophetic quote in the digital source.
  const pattern = number === 172 ? /\{([^}]+)\}/gu : /"([^"]+)"/gu;
  let quotes = [...source.arabic.matchAll(pattern)].map(match => match[1]);
  // Select the complete first narration of 6251; the fourth quote belongs
  // to the separately reported Abu Usama variant, not this narration.
  if (number === 175) {
    assert.equal(quotes.length, 4);
    quotes = quotes.slice(0, 3);
  }
  let words = normalize(quotes.join(' '));
  // In 631 the primary page puts the narrator's caveat inside its quote.
  // Preserve it outside Prophetic guillemets, and in the full matn test.
  if (number === 181) words = words.replace(normalize('وذكر أشياء أحفظها أو لا أحفظها'), '');
  return words;
}

// Opening/closing boundaries were read from the independent Arabic sources.
// Closing markers omit only isnad follow-ups or the explicitly separate variant.
const contextRanges = {
  "161": [
    "كنت غلاما"
  ],
  "162": [
    "ما عاب النبي"
  ],
  "164": [
    "أن النبي أمر بلعق"
  ],
  "165": [
    "احترق بيت"
  ],
  "166": [
    "كان رسول الله"
  ],
  "167": [
    "أن رسول الله أتي بشراب"
  ],
  "169": [
    "كنت في مجلس",
    "وقال ابن المبارك"
  ],
  "170": [
    "اطلع رجل"
  ],
  "171": [
    "أنه مر على صبيان"
  ],
  "174": [
    "إياكم والجلوس"
  ],
  "175": [
    "أن رجلا دخل المسجد",
    "وقال أبو أسامة"
  ],
  "176": [
    "كنت أبيت"
  ],
  "177": [
    "لقيت ثوبان"
  ],
  "178": [
    "كانت علينا رعاية الإبل"
  ],
  "179": [
    "كنت عند عثمان"
  ],
  "180": [
    "ألا أدلكم"
  ],
  "181": [
    "أتينا إلى النبي"
  ],
  "185": [
    "أن رجلا سأل رسول الله"
  ],
  "186": [
    "أن نبي الله"
  ],
  "187": [
    "سمعت رسول الله"
  ],
  "188": [
    "أوصاني خليلي"
  ],
  "189": [
    "بينما جبريل"
  ],
  "191": [
    "أن رجلا سمع رجلا"
  ],
  "192": [
    "أيحب أحدكم"
  ],
  "194": [
    "ضمني رسول الله"
  ],
  "195": [
    "إذا أتيت مضجعك"
  ],
  "196": [
    "كان النبي"
  ],
  "197": [
    "أن النبي كان إذا أوى"
  ],
  "198": [
    "أن فاطمة"
  ],
  "199": [
    "أن النبي خرج"
  ],
  "200": [
    "أنه كان يدعو"
  ],
  "201": [
    "خدمت النبي"
  ],
  "202": [
    "سمعت أبا بردة"
  ],
  "206": [
    "ألا أنبئكم",
    "وقال إسماعيل"
  ]
};

test('posts 161–210 contain 50 new references and every word of the selected quotations', () => {
  const earlier = [...DHIKR_CARDS, ...GOOD_DEEDS, ...Object.values(OCCASION_CARDS), ...DAILY_DHIKR, ...Object.values(SEASONAL_CARDS), ...PUBLIC_POSTS.slice(0, 160)];
  const previousUrls = new Set(earlier.flatMap(card => card.source.citations.map(ref => ref.url)));
  const previousQuotes = new Set(earlier.map(card => quotedWords(card.body || '')).filter(Boolean));
  const seenQuotes = new Set();
  assert.equal(newPosts.length, 50);
  assert.equal(evidence.length, 50);
  assert.equal(new Set(evidence.map(source => source.url)).size, 50);
  for (const card of newPosts) {
    const source = evidence.find(source => source.url === card.source.url);
    assert.ok(source, 'Missing independent source: ' + card.id);
    assert.ok(!previousUrls.has(source.url), 'Repeated reference: ' + source.url);
    assert.equal(source.retrievedOn, '2026-10-12');
    assert.equal(card.source.checkedOn, source.retrievedOn);
    assert.equal(card.source.citations.length, 1);
    assert.equal(card.source.citations[0].url, source.url);
    assert.equal(quotedWords(card.body), primaryQuotation(source, card.editorialNumber), card.id + ': selected quotation was shortened or altered');
    const actual = quotedWords(card.body);
    if (actual) {
      assert.ok(!previousQuotes.has(actual), card.id + ': previously used full quotation');
      assert.ok(!seenQuotes.has(actual), card.id + ': repeated full quotation');
      seenQuotes.add(actual);
    }
    assert.ok(!card.source.reference.includes('مقتطف'));
  }
});

test('posts 161–210 preserve the complete matn, dialogue, actions and narrator caveats', () => {
  for (const card of newPosts) {
    const source = evidence.find(source => source.url === card.source.url);
    const range = contextRanges[card.editorialNumber];
    let matn;
    if (range) {
      let original = normalize(source.arabic);
      // The inserted honorific after Fatima's name is not matn; every
      // event and word of dialogue in 5361 is retained.
      if (card.editorialNumber === 198) original = original.replace('عليهماالسلام', '');
      const [opening, closing] = range;
      const begin = original.indexOf(normalize(opening));
      assert.ok(begin >= 0, 'Missing source opening: ' + card.id);
      const end = closing ? original.indexOf(normalize(closing), begin) : original.length;
      assert.ok(end > begin, 'Missing source ending: ' + card.id);
      matn = original.slice(begin, end);
    } else matn = primaryQuotation(source, card.editorialNumber);
    assert.ok(matn.length > 0, 'Empty matn: ' + card.id);
    assert.ok(normalize(card.body).endsWith(matn), card.id + ': context, action or narrator words were omitted or altered');
  }
  const cardFor = number => newPosts.find(card => card.editorialNumber === number);
  const teaching = cardFor(181);
  assert.ok(normalize(teaching.body.replace(/«[^»]+»/gu, '')).includes(normalize('وذكر أشياء أحفظها أو لا أحفظها')));
  assert.ok(!quotedWords(teaching.body).includes(normalize('أحفظها')), 'Narrator uncertainty must stay outside Prophetic speech');
  const wudu = cardFor(178);
  assert.equal(wudu.source.citations[0].number, '234a');
  assert.ok(quotedWords(wudu.body).includes(normalize('فيبلغ أو فيسبغ الوضوء')));
  assert.ok(quotedWords(wudu.body).includes(normalize('وأن محمدًا عبد الله ورسوله')));
  assert.ok(!cardFor(189).body.includes('«'), 'Gabriel and angel speech must not be presented as a Prophetic quotation');
  assert.ok(!cardFor(197).body.includes('«'), 'The description of the Prophet’s act is narrative');
  assert.ok(cardFor(197).body.includes('يفعل ذلك ثلاث مرات'));
  assert.equal(cardFor(190).source.citations[0].narrator, 'أبو مسعود الأنصاري');
  assert.equal(cardFor(206).source.citations[0].narrator, 'أبو بكرة');
  assert.ok(normalize(cardFor(187).body.replace(/«[^»]+»/gu, '')).includes(normalize('وقال النعمان بن سالم ما تركتهن منذ سمعتهن من عمرو بن أوس')));
});
