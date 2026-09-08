import test from 'node:test';
import assert from 'node:assert/strict';
import { DHIKR_CARDS, GOOD_DEEDS } from '../src/content.mjs';
import { assertReviewedContent } from '../src/content-review.mjs';

test('the shipped religious content matches its source review', () => {
  assert.equal(assertReviewedContent(), 11);
  assert.throws(() => { DHIKR_CARDS[0].text = 'changed'; }, TypeError);
  assert.throws(() => { DHIKR_CARDS[0].source.citations[0].number = '1'; }, TypeError);
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
    const cards = structuredClone([...DHIKR_CARDS, ...GOOD_DEEDS]);
    change(cards[0]);
    assert.throws(() => assertReviewedContent(cards), { code: 'CONTENT_REVIEW_REQUIRED' });
  }
  assert.throws(() => assertReviewedContent([...DHIKR_CARDS, ...GOOD_DEEDS, {id:'unreviewed'}]), { code: 'CONTENT_REVIEW_REQUIRED' });
  assert.throws(() => assertReviewedContent([...DHIKR_CARDS, ...GOOD_DEEDS].slice(1)), { code: 'CONTENT_REVIEW_REQUIRED' });
});
