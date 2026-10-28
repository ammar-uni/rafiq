import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DHIKR_CARDS, GOOD_DEEDS, OCCASION_CARDS, DAILY_DHIKR, SEASONAL_CARDS, PUBLIC_POSTS } from '../src/content.mjs';
import { assertReviewedContent, contentFingerprint, assertBalancedQuotationMarks } from '../src/content-review.mjs';

test('quotation marks and brackets must close in order, including nesting and Quran delimiters', () => {
  const valid = ['نص دون اقتباس.', 'قال: «الحديث».', '«الأول» ثم «الثاني».', '«قال: “النص”».', '«السطر الأول\nالسطر الثاني»', '(توضيح)', '[المصدر](https://example.test)', '{بيان}', '﴿قل هو الله أحد﴾', '«قال (توضيح [مرجع]): ﴿قل هو الله أحد﴾»'];
  for (const text of valid) assert.doesNotThrow(() => assertBalancedQuotationMarks(text));
  const invalid = ['«الحديث', 'الحديث»', '»الحديث«', '«قال: «النص».', '«قال: “النص»”', '“النص»', '«النص»»', '(الحديث', 'الحديث)', '[المصدر', 'المصدر]', '{بيان', 'بيان}', '﴿قل هو الله أحد', 'قل هو الله أحد﴾', '﴾قل هو الله أحد﴿', '«النص (التوضيح»)', '([المصدر)]', '﴿قل هو الله أحد»', '﴿قل هو الله أحد﴾﴾'];
  for (const text of invalid) assert.throws(() => assertBalancedQuotationMarks(text), { code: 'CONTENT_QUOTATION_INVALID' });
});

test('a matching review fingerprint cannot allow unclosed quotes or brackets in religious text or source notes', () => {
  const shipped = [...DHIKR_CARDS, ...GOOD_DEEDS, ...Object.values(OCCASION_CARDS), ...DAILY_DHIKR, ...Object.values(SEASONAL_CARDS), ...PUBLIC_POSTS];
  for (const field of ['body', 'source.note']) for (const opening of ['«', '(', '[', '{', '﴿']) {
    const cards = structuredClone(shipped);
    const card = cards.find(card => card.id === 'post-good-character');
    if (field === 'body') card.body = opening + card.body;
    else card.source.note += ' ' + opening;
    const review = JSON.parse(readFileSync(new URL('../src/content-review.json', import.meta.url), 'utf8'));
    review.entries.find(entry => entry.id === card.id).sha256 = contentFingerprint(card);
    assert.throws(() => assertReviewedContent(cards, review), error => error.code === 'CONTENT_QUOTATION_INVALID' && error.message.includes(`${card.id}.${field}`));
  }
});

test('the shipped religious content matches its source review', () => {
  assert.equal(assertReviewedContent(), 379);
  assert.throws(() => { DHIKR_CARDS[0].text = 'changed'; }, TypeError);
  assert.throws(() => { DHIKR_CARDS[0].source.citations[0].number = '1'; }, TypeError);
  assert.throws(() => { OCCASION_CARDS.fridayDua.body = 'changed'; }, TypeError);
});

test('changes to wording, attribution, narrators or explanations require another review', () => {
  const changes = [
    card => { card.text += ' لفظ زائد'; },
    card => { card.source.reference = 'رواه البخاري'; },
    card => { card.source.citations[0].narrator = 'راو آخر'; },
    card => { card.source.citations[0].number = '4860'; },
    card => { card.source.note += ' حكم جديد'; },
    card => { card.source.citations = []; }
  ];
  for (const change of changes) {
    const cards = structuredClone([...DHIKR_CARDS, ...GOOD_DEEDS, ...Object.values(OCCASION_CARDS), ...DAILY_DHIKR, ...Object.values(SEASONAL_CARDS), ...PUBLIC_POSTS]);
    assert.equal(assertReviewedContent(cards), 379);
    change(cards[0]);
    assert.throws(() => assertReviewedContent(cards), { code: 'CONTENT_REVIEW_REQUIRED' });
  }
  const cards = [...DHIKR_CARDS, ...GOOD_DEEDS, ...Object.values(OCCASION_CARDS), ...DAILY_DHIKR, ...Object.values(SEASONAL_CARDS), ...PUBLIC_POSTS];
  assert.throws(() => assertReviewedContent([...cards, {id:'unreviewed'}]), { code: 'CONTENT_REVIEW_REQUIRED' });
  assert.throws(() => assertReviewedContent(cards.slice(1)), { code: 'CONTENT_REVIEW_REQUIRED' });
  for (let index = 11; index < cards.length; index++) {
    const changed = structuredClone(cards); changed[index].body += ' نسبة غير مراجعة';
    assert.throws(() => assertReviewedContent(changed), { code: 'CONTENT_REVIEW_REQUIRED' });
  }
});
