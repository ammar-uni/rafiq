import test from 'node:test';
import assert from 'node:assert/strict';
import { DHIKR_CARDS, GOOD_DEEDS, OCCASION_CARDS, DAILY_DHIKR } from '../src/content.mjs';
import { assertReviewedContent } from '../src/content-review.mjs';

test('the shipped religious content matches its source review', () => {
  assert.equal(assertReviewedContent(), 17);
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
    const cards = structuredClone([...DHIKR_CARDS, ...GOOD_DEEDS, ...Object.values(OCCASION_CARDS), ...DAILY_DHIKR]);
    assert.equal(assertReviewedContent(cards), 17);
    change(cards[0]);
    assert.throws(() => assertReviewedContent(cards), { code: 'CONTENT_REVIEW_REQUIRED' });
  }
  const cards = [...DHIKR_CARDS, ...GOOD_DEEDS, ...Object.values(OCCASION_CARDS), ...DAILY_DHIKR];
  assert.throws(() => assertReviewedContent([...cards, {id:'unreviewed'}]), { code: 'CONTENT_REVIEW_REQUIRED' });
  assert.throws(() => assertReviewedContent(cards.slice(1)), { code: 'CONTENT_REVIEW_REQUIRED' });
  for (let index = 11; index < cards.length; index++) {
    const changed = structuredClone(cards); changed[index].body += ' نسبة غير مراجعة';
    assert.throws(() => assertReviewedContent(changed), { code: 'CONTENT_REVIEW_REQUIRED' });
  }
});
