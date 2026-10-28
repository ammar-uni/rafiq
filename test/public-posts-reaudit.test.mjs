import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PUBLIC_POSTS, SEASONAL_CARDS, GOOD_DEEDS } from '../src/content.mjs';
import { assertBalancedQuotationMarks, assertReviewedContent, contentFingerprint } from '../src/content-review.mjs';
import { serverHomePayload, serverPostPayload } from '../src/server-messages.mjs';
import { seasonalReminderPayload } from '../src/messages.mjs';

const evidence = JSON.parse(readFileSync(new URL('./fixtures/public-posts-1-40-reaudit-sources.json', import.meta.url), 'utf8'));
// Typography, tashkeel and the conventional blessing are presentation only.
// No clause, question, answer, action, repetition or narrator caveat is removed.
const normalize = value => value.normalize('NFKC')
  .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/gu, '')
  .replaceAll('صلى الله عليه وسلم', '').replaceAll('رضي الله عنه', '').replaceAll('رضى الله عنه', '')
  .replace(/[أإآٱ]/gu, 'ا').replaceAll('ى', 'ي').replaceAll('السماوات', 'السموات')
  .replace(/[^\p{Script=Arabic}]/gu, '');
const originalFor = url => { const source = evidence.find(s => s.url === url); assert.ok(source, url); return source; };
// Independently read boundaries in the original Arabic, excluding isnad-only
// follow-ups. The ending of every selected matn is included, not its first quote.
const ranges = {
  1:['كلمتان حبيبتان'], 2:['أحب الكلام'], 3:['كنا مع النبي'], 4:['اللهم إني أسألك'],
  5:['جاء رجل إلى رسول الله','وقال ابن شبرمة'], 6:['جاء رجل إلى النبي'], 7:['من كان يؤمن'],
  8:['ليس الشديد'], 9:['من أحب أن'], 10:['المسلم من سلم','قال أبو عبد الله'],
  11:['إن الرفق'], 12:['يسروا'], 13:['قال لي النبي'], 14:['من لا يرحم'],
  15:['أن رجلا سأل النبي'], 16:['ما من عبد'], 17:['من نفس'], 18:['ما نقصت'],
  19:['سئل النبي'], 20:['من صلى علي واحدة'], 21:['لا يؤمن'], 22:['كل سلامى'],
  23:['اتقوا النار'], 24:['قال لي رسول الله'], 25:['أن رجلا قال للنبي'], 26:['أن النبي قال'],
  27:['خيركم من تعلم'], 28:['سمعت النبي'], 29:['الطهور شطر'], 30:['لا يحل لرجل'],
  31:['أن رسول الله'], 32:['نعمتان مغبون','قال عباس العنبري'], 33:['المؤمن القوي'],
  34:['أن ناسا من الأنصار'], 35:['من نزل منزلا'], 36:['إن الله ليرضى'],
  37:['ما يصيب المسلم'], 38:['والله إني'], 39:['فقدت رسول الله'], 40:['كل معروف']
};
function fullMatn(source, [opening, closing]) {
  const arabic = normalize(source.arabic), begin = arabic.indexOf(normalize(opening));
  assert.ok(begin >= 0, 'Missing source opening: ' + source.url);
  const end = closing ? arabic.indexOf(normalize(closing), begin) : arabic.length;
  assert.ok(end > begin, 'Missing source closing: ' + source.url);
  return arabic.slice(begin, end);
}

test('all first forty posts retain the full independently retrieved matn, including dialogue and endings', () => {
  assert.equal(evidence.filter(s => s.editorialNumber !== null).length, 40);
  for (const post of PUBLIC_POSTS.slice(0, 40)) {
    const source = originalFor(post.source.url);
    assert.equal(source.retrievedOn, post.source.checkedOn);
    const expected = fullMatn(source, ranges[post.editorialNumber]);
    assert.ok(normalize(post.body).endsWith(expected), `${post.editorialNumber}: missing or altered matn`);
    assert.ok(expected.length > 10);
    assertBalancedQuotationMarks(post.body, post.id);
  }
  // A former fragment must fail even if someone calls it a complete narration.
  assert.ok(!normalize('«احرص على ما ينفعك واستعن بالله ولا تعجز»').endsWith(fullMatn(originalFor('https://sunnah.com/muslim:2664'), ranges[33])));
});

test('first forty prophetic quotations are complete and narrator uncertainty stays outside guillemets', () => {
  for (const post of PUBLIC_POSTS.slice(0, 40)) {
    let expected = normalize([...originalFor(post.source.url).arabic.matchAll(/"([^"]+)"/gu)].map(m => m[1]).join(' '));
    if (post.editorialNumber === 29) expected = expected.replace(normalize('أو تملأ'), '');
    const actual = normalize([...post.body.matchAll(/«([^»]+)»/gu)].map(m => m[1]).join(' '));
    assert.equal(actual, expected, `${post.editorialNumber}: quotation was shortened or attributed incorrectly`);
  }
});

test('every public post renders without truncation, balances quotes and carries a full-text reference', () => {
  assert.equal(PUBLIC_POSTS.length, 360);
  for (const card of PUBLIC_POSTS) {
    assert.doesNotMatch(card.source.reference, /مقتطف|الدعاء من الحديث/u);
    assert.doesNotMatch(card.body, /…|\.\.\./u);
    assertBalancedQuotationMarks(card.body, card.id);
  }
  const text = JSON.stringify(serverHomePayload());
  assert.ok(text.includes(PUBLIC_POSTS.length.toLocaleString('ar')));
  assert.match(text, /بأحاديث كاملة/);
  assert.equal(text.match(/مكتبة تضم ([\d٠-٩]+) منشورًا/u)?.[1], PUBLIC_POSTS.length.toLocaleString('ar'));
  const post = structuredClone(PUBLIC_POSTS[0]);
  post.source.reference = 'رواه البخاري — مقتطف من الحديث.';
  assert.throws(() => assertReviewedContent([post], { version: 1, entries: [{id:post.id, checkedOn:post.source.checkedOn, sha256:contentFingerprint(post)}] }), /Content review required/);
});

test('seasonal reminders include both entire narrations without attributing narrator dialogue to the Prophet', () => {
  for (const [key, start] of [['dhul-hijjah','قال رسول الله'], ['arafah','أن رسول الله']]) {
    const card = SEASONAL_CARDS[key];
    const source = originalFor(key === 'arafah' ? 'https://sunnah.com/muslim:1162b' : 'https://sunnah.com/abudawud:2438');
    assert.ok(normalize(card.text).endsWith(fullMatn(source, [start])), key + ': narration is incomplete');
    const payload = seasonalReminderPayload({key,referenceDay:'2027-05-01',confirmed:false});
    assert.ok(payload.content.includes(card.text));
    assert.ok(payload.content.length <= 2000);
    assertBalancedQuotationMarks(payload.content, key);
    assert.ok(!payload.content.includes('«' + card.text + '»'), 'No quote around narrator narrative');
  }
});

test('good-deed ideas quote the whole evidence narration when quoting a hadith', () => {
  for (const [id,url,start] of [['help','https://sunnah.com/muslim:1893a','جاء رجل إلى النبي'], ['kind-word','https://sunnah.com/bukhari:6018','من كان يؤمن']]) {
    const card = GOOD_DEEDS.find(c => c.id === id);
    assert.ok(normalize(card.evidence).endsWith(fullMatn(originalFor(url), [start])));
    assertBalancedQuotationMarks(card.evidence, id);
  }
});

test('all 320 later primary narrations freshly retrieved agree with the independently retained full Arabic sources', () => {
  const fresh = JSON.parse(readFileSync(new URL('./fixtures/public-posts-41-360-reaudit-sources.json', import.meta.url), 'utf8'));
  const retained = readdirSync(new URL('./fixtures/', import.meta.url))
    .filter(name => /^public-posts-\d+-\d+-sources\.json$/u.test(name))
    .flatMap(name => JSON.parse(readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8')));
  assert.equal(fresh.length, PUBLIC_POSTS.length - 40);
  for (const post of PUBLIC_POSTS.slice(40)) {
    const current = fresh.find(s => s.url === post.source.url);
    const original = retained.find(s => s.url === post.source.url);
    assert.ok(current && original, 'Missing primary source: ' + post.id);
    assert.equal(current.retrievedOn, '2026-10-28');
    assert.equal(normalize(current.arabic), normalize(original.arabic), 'Primary source changed: ' + post.id);
  }
});
