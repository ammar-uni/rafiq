import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DHIKR_CARDS, GOOD_DEEDS, HADITH_BOOKS } from './content.mjs';

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const contentFingerprint = card => createHash('sha256').update(JSON.stringify(canonical(card))).digest('hex');

// A change detector, not a hadith authenticator. Update the review record only
// after comparing wording, narrators and references with the actual sources.
export function assertReviewedContent(cards = [...DHIKR_CARDS, ...GOOD_DEEDS], review = JSON.parse(readFileSync(new URL('./content-review.json', import.meta.url), 'utf8'))) {
  const reject = () => { const error = new Error('Content review required: compare the changed material with its primary sources before release.'); error.code = 'CONTENT_REVIEW_REQUIRED'; throw error; };
  if (review.version !== 1 || !Array.isArray(review.entries) || review.entries.length !== cards.length) reject();
  const ids = new Set();
  for (const card of cards) {
    if (ids.has(card.id)) reject();
    ids.add(card.id);
    const record = review.entries.filter(entry => entry.id === card.id);
    if (record.length !== 1 || record[0].sha256 !== contentFingerprint(card) || record[0].checkedOn !== card.source?.checkedOn) reject();
    if (!card.source?.citations?.length) reject();
    for (const ref of card.source.citations) {
      if (!Object.hasOwn(HADITH_BOOKS, ref.collection) || ref.book !== HADITH_BOOKS[ref.collection] || !/^\d+[a-z]?$/.test(ref.number) || !ref.narrator || ref.url !== `https://sunnah.com/${ref.collection}:${ref.number}`) reject();
    }
  }
  return cards.length;
}
