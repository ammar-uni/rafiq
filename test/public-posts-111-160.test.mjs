import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PUBLIC_POSTS, DHIKR_CARDS, GOOD_DEEDS, OCCASION_CARDS, DAILY_DHIKR, SEASONAL_CARDS } from '../src/content.mjs';

const evidence = JSON.parse(readFileSync(new URL('./fixtures/public-posts-111-160-sources.json', import.meta.url), 'utf8'));
const newPosts = PUBLIC_POSTS.slice(110, 160);
// Two documented hamza spellings and alif maqsura are orthography only.
// No words, narrator qualifications, counts or clauses are removed.
const normalize = text => text.replaceAll('صلى الله عليه وسلم', '').replace(/[^\u0621-\u063a\u0641-\u064a\u0671]/gu, '').replaceAll('ى', 'ي').replaceAll('رءوس', 'رؤوس').replaceAll('مئوي', 'مؤوي');
const quotedWords = (text, pattern) => normalize([...text.matchAll(pattern)].map(match => match[1]).join(' '));

// Independently read primary source boundaries retain context and dialogue.
// Explicit closing boundaries omit only follow-ups concerning the isnad.
const contextRanges = {
  "112": [
    "انصر أخاك"
  ],
  "115": [
    "كان رسول الله",
    "لم يذكر وكيع"
  ],
  "117": [
    "قلت يا رسول الله"
  ],
  "118": [
    "أنا وكافل اليتيم"
  ],
  "120": [
    "إن من أكبر الكبائر"
  ],
  "121": [
    "قدمت علي أمي"
  ],
  "122": [
    "سألت رسول الله"
  ],
  "124": [
    "كان رسول الله"
  ],
  "125": [
    "جاء رجل",
    "تابعه جرير"
  ],
  "127": [
    "هلك المتنطعون"
  ],
  "128": [
    "سمعت رسول الله"
  ],
  "129": [
    "أنها سمعت رسول الله"
  ],
  "130": [
    "لن ينجي"
  ],
  "135": [
    "أتدرون"
  ],
  "143": [
    "كان رسول الله"
  ],
  "144": [
    "كان من دعاء رسول الله"
  ],
  "145": [
    "كان أكثر دعاء النبي"
  ],
  "146": [
    "أن رسول الله"
  ],
  "147": [
    "جاء أعرابي",
    "ولم يذكر ابن أبي شيبة"
  ],
  "148": [
    "قلت يا رسول الله"
  ],
  "155": [
    "سمعت رسول الله"
  ],
  "157": [
    "قال النبي"
  ]
};

test('posts 111–160 have 50 distinct new references and retain every quoted word', () => {
  const earlier = [...DHIKR_CARDS, ...GOOD_DEEDS, ...Object.values(OCCASION_CARDS), ...DAILY_DHIKR, ...Object.values(SEASONAL_CARDS), ...PUBLIC_POSTS.slice(0, 110)];
  const previousUrls = new Set(earlier.flatMap(card => card.source.citations.map(ref => ref.url)));
  const previousQuotes = new Set(PUBLIC_POSTS.slice(0, 110).map(card => quotedWords(card.body, /«([^»]+)»/gu)).filter(Boolean));
  const seenQuotes = new Set();
  assert.equal(newPosts.length, 50);
  assert.equal(evidence.length, 50);
  assert.equal(new Set(evidence.map(source => source.url)).size, 50);
  for (const card of newPosts) {
    const source = evidence.find(source => source.url === card.source.url);
    assert.ok(source, `Missing independent Arabic source: ${card.id}`);
    assert.ok(!previousUrls.has(source.url), `Repeated reference: ${source.url}`);
    assert.equal(source.retrievedOn, '2026-10-12');
    assert.equal(source.retrievedOn, card.source.checkedOn);
    assert.equal(card.source.citations.length, 1);
    assert.equal(card.source.citations[0].url, source.url);
    const original = quotedWords(source.arabic, /"([^"]+)"/gu);
    const actual = quotedWords(card.body, /«([^»]+)»/gu);
    assert.equal(actual, original, `${card.id}: a quotation was shortened or altered`);
    if (actual) {
      assert.ok(!previousQuotes.has(actual), `${card.id}: previously used full quotation`);
      assert.ok(!seenQuotes.has(actual), `${card.id}: repeated quotation in this batch`);
      seenQuotes.add(actual);
    }
    assert.ok(!card.source.reference.includes('مقتطف'));
  }
});

test('posts 111–160 preserve whole narrations, actions, dialogue and narrator qualifications', () => {
  for (const card of newPosts) {
    const source = evidence.find(source => source.url === card.source.url);
    const range = contextRanges[card.editorialNumber];
    let completeMatn;
    if (range) {
      const text = normalize(source.arabic), [opening, closing] = range;
      const beginning = text.indexOf(normalize(opening));
      assert.ok(beginning >= 0, `Missing source beginning: ${card.id}`);
      const ending = closing ? text.indexOf(normalize(closing), beginning) : text.length;
      assert.ok(ending > beginning, `Missing source ending: ${card.id}`);
      completeMatn = text.slice(beginning, ending);
    } else completeMatn = quotedWords(source.arabic, /"([^"]+)"/gu);
    assert.ok(completeMatn.length > 0, `Empty primary narration: ${card.id}`);
    assert.ok(normalize(card.body).endsWith(completeMatn), `${card.id}: narrated context, question, reply or action was shortened or altered`);
  }
  const cardFor = number => newPosts.find(card => card.editorialNumber === number);
  assert.ok(cardFor(115).body.startsWith('قالت عائشة رضي الله عنها:'));
  assert.ok(!cardFor(115).body.includes('قال رسول الله'));
  const contentment = cardFor(138), original = evidence.find(source => source.url === contentment.source.url);
  assert.ok(normalize(original.arabic).includes(normalize('عبد الله بن عمرو بن العاص')));
  assert.equal(contentment.source.citations[0].narrator, 'عبد الله بن عمرو بن العاص', 'The Arabic isnad names the son, not the English heading’s father');
  const bedouin = cardFor(147);
  assert.ok(normalize(bedouin.body.replace(/«[^»]+»/gu, '')).includes(normalize('قال موسى أما عافني فأنا أتوهم وما أدري')));
  assert.ok(!quotedWords(bedouin.body, /«([^»]+)»/gu).includes(normalize('عافني')), 'Narrator uncertainty must not become a word attributed to the Prophet');
  const crescent = cardFor(157);
  assert.ok(normalize(crescent.body.replace(/«[^»]+»/gu, '')).includes(normalize('أو قال قال أبو القاسم')));
});

