import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PUBLIC_POSTS, DHIKR_CARDS, GOOD_DEEDS, OCCASION_CARDS, DAILY_DHIKR, SEASONAL_CARDS } from '../src/content.mjs';

const evidence = JSON.parse(readFileSync(new URL('./fixtures/public-posts-86-110-sources.json', import.meta.url), 'utf8'));
const newPosts = PUBLIC_POSTS.slice(85, 110);
// Only orthography/diacritics and the written blessing are normalized, never words.
const normalize = text => text.replaceAll('صلى الله عليه وسلم', '').replace(/[^\u0621-\u063a\u0641-\u064a\u0671]/gu, '').replaceAll('ى', 'ي');

// Source boundaries were read independently from the primary Arabic narrations.
// These ranges retain all dialogue and context; an isnad follow-up is excluded
// only at the explicit boundary shown in the source.
const contextRanges = {
  "87": [
    "سألت النبي"
  ],
  "92": [
    "كنا عند رسول الله"
  ],
  "96": [
    "لا أقول لكم"
  ],
  "97": [
    "كان النبي"
  ],
  "98": [
    "أن النبي",
    "قال سفيان"
  ],
  "100": [
    "أن رسول الله"
  ],
  "101": [
    "آخى النبي",
    "أبو جحيفة وهب"
  ],
  "102": [
    "أن رجلًا"
  ],
  "103": [
    "أن رجلًا"
  ],
  "105": [
    "ما ضرب رسول الله"
  ],
  "106": [
    "دخلت امرأة"
  ],
  "108": [
    "حق المسلم"
  ]
};

test('posts 86–110 have 25 new primary references and keep all quoted wording', () => {
  const earlier = [...DHIKR_CARDS, ...GOOD_DEEDS, ...Object.values(OCCASION_CARDS), ...DAILY_DHIKR, ...Object.values(SEASONAL_CARDS), ...PUBLIC_POSTS.slice(0, 85)];
  const previousUrls = new Set(earlier.flatMap(card => card.source.citations.map(ref => ref.url)));
  assert.equal(newPosts.length, 25);
  assert.equal(evidence.length, 25);
  assert.equal(new Set(evidence.map(source => source.url)).size, 25);
  for (const card of newPosts) {
    const source = evidence.find(source => source.url === card.source.url);
    assert.ok(source, `Missing primary Arabic text: ${card.id}`);
    assert.ok(!previousUrls.has(source.url), `Earlier reference repeated: ${source.url}`);
    assert.equal(source.retrievedOn, '2026-10-11');
    assert.equal(source.retrievedOn, card.source.checkedOn);
    assert.equal(card.source.citations.length, 1);
    assert.equal(card.source.citations[0].url, source.url);
    const original = [...source.arabic.matchAll(/"([^"]+)"/gu)].map(match => match[1]).join(' ');
    const quoted = [...card.body.matchAll(/«([^»]+)»/gu)].map(match => match[1]).join(' ');
    assert.equal(normalize(quoted), normalize(original), `${card.id}: a quotation was shortened or altered`);
    assert.ok(!card.source.reference.includes('مقتطف'));
  }
});

test('posts 86–110 preserve the entire matn, including dialogue and narrated actions', () => {
  for (const card of newPosts) {
    const source = evidence.find(source => source.url === card.source.url);
    const range = contextRanges[card.editorialNumber];
    let completeMatn;
    if (range) {
      const text = normalize(source.arabic);
      const [opening, closing] = range;
      const beginning = text.indexOf(normalize(opening));
      assert.ok(beginning >= 0, `Missing source opening: ${card.id}`);
      const ending = closing ? text.indexOf(normalize(closing), beginning) : text.length;
      assert.ok(ending > beginning, `Missing source ending: ${card.id}`);
      completeMatn = text.slice(beginning, ending);
    } else {
      completeMatn = normalize([...source.arabic.matchAll(/"([^"]+)"/gu)].map(match => match[1]).join(' '));
    }
    assert.ok(completeMatn.length > 0, `Empty primary narration: ${card.id}`);
    assert.ok(normalize(card.body).endsWith(completeMatn), `${card.id}: the matn, context, question or reply was omitted or altered`);
  }
  const cardFor = number => newPosts.find(card => card.editorialNumber === number);
  assert.equal(cardFor(93).source.citations[0].narrator, 'أبو أيوب الأنصاري');
  const salam = cardFor(101);
  assert.equal(salam.source.citations[0].narrator, 'أبو جحيفة');
  assert.equal([...salam.body.matchAll(/«([^»]+)»/gu)].map(match => match[1]).join(' '), 'صدق سلمان', 'Salman’s counsel must remain his speech, separate from the Prophet’s confirmation');
  const description = cardFor(105);
  assert.ok(description.body.startsWith('قالت عائشة رضي الله عنها:'));
  assert.ok(!description.body.includes('قال رسول الله'));
  assert.ok(!description.body.includes('«'), 'Aisha’s narrated description must not be displayed as a prophetic quotation');
});

