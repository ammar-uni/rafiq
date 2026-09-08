import assert from 'node:assert/strict';
import { DHIKR_CARDS, GOOD_DEEDS } from '../src/content.mjs';
import { assertReviewedContent } from '../src/content-review.mjs';
assertReviewedContent();
const ids = new Set();
for (const card of [...DHIKR_CARDS, ...GOOD_DEEDS]) {
  assert.ok(!ids.has(card.id)); ids.add(card.id);
  assert.ok(/^[a-z-]+$/.test(card.id));
  assert.ok(card.title && (card.text || card.body));
  assert.ok(card.source.reference && card.source.publisher && /^\d{4}-\d{2}-\d{2}$/.test(card.source.checkedOn));
  const url = new URL(card.source.url);
  assert.equal(url.protocol, 'https:');
  assert.ok(['binbaz.org.sa', 'sunnah.com'].includes(url.hostname));
  if (url.hostname === 'binbaz.org.sa') assert.ok(/^\/(fatwas|audios)\/\d+\//.test(url.pathname));
  else assert.ok(card.source.citations.some(ref => ref.url === card.source.url));
}
console.log(`${DHIKR_CARDS.length} dhikr cards and ${GOOD_DEEDS.length} good-deed suggestions match the source-review record. This detects unreviewed changes, not religious authenticity.`);
