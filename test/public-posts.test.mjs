import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PUBLIC_POSTS } from '../src/content.mjs';
import { assertBalancedQuotationMarks } from '../src/content-review.mjs';
import { serverCardForEvent, serverPostPayload } from '../src/server-messages.mjs';
import { publicPostSourcePayload } from '../src/messages.mjs';

test('all 360 public messages exactly match the reviewed editorial text and source', () => {
  const documents = ['reminder-posts.md', 'reminder-posts-21-40.md', 'reminder-posts-41-60.md', 'reminder-posts-61-85.md', 'reminder-posts-86-110.md', 'reminder-posts-111-160.md', 'reminder-posts-161-210.md', 'reminder-posts-211-260.md', 'reminder-posts-261-310.md', 'reminder-posts-311-360.md'].map(file => readFileSync(new URL(`../docs/${file}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n'));
  const sections = documents.flatMap(document => [...document.matchAll(/^#{2,3} ([٠-٩]+) · (.+)\n([\s\S]*?)(?=^#{2,3} |$(?![\s\S]))/gm)]);
  assert.equal(PUBLIC_POSTS.length, 360);
  assert.equal(sections.length, PUBLIC_POSTS.length);
  assert.deepEqual(PUBLIC_POSTS.map(card => card.editorialNumber), Array.from({ length: PUBLIC_POSTS.length }, (_, index) => index + 1));
  assert.equal(new Set(PUBLIC_POSTS.map(card => card.id)).size, PUBLIC_POSTS.length);
  const seen = new Set();
  for (let day = 0; day < PUBLIC_POSTS.length; day++) {
    const event = { kind: 'daily', day: new Date(Date.UTC(2026, 8, 20 + day)).toISOString().slice(0, 10), slot: 0 };
    const card = serverCardForEvent(event), section = sections[card.editorialNumber - 1];
    const lines = section[3].split('\n').filter(line => line.startsWith('>')).map(line => line.replace(/^> ?/, '')).filter(Boolean);
    assert.equal(serverPostPayload(event).content, lines.join('\n'), card.id);
    assertBalancedQuotationMarks(serverPostPayload(event).content, `${card.id}: generated public message`);
    assert.ok(serverPostPayload(event).content.length <= 2000, `${card.id}: the complete post must fit a Discord message`);
    assert.ok(section[3].includes(`(${card.source.url})`), card.id);
    assert.equal(section[3].match(/^- الصحابي(?:ة|ان)?: (.+)$/m)?.[1], card.narratorLine, card.id);
    assert.ok(card.source.citations.every(ref => ['bukhari', 'muslim'].includes(ref.collection)));
    seen.add(card.id);
  }
  assert.equal(seen.size, PUBLIC_POSTS.length, 'Every reviewed post appears in the rotation');
  assert.throws(() => { PUBLIC_POSTS[0].body = 'changed'; }, TypeError);
});

test('one, two and three daily slots rotate through all 360 posts across month boundaries', () => {
  for (const count of [1, 2, 3]) {
    const slots = Array.from({length: count}, () => new Set());
    for (let day = 0; day < PUBLIC_POSTS.length; day++) {
      const date = new Date(Date.UTC(2026, 8, 20 + day)).toISOString().slice(0, 10);
      const today = slots.map((seen, slot) => {
        const card = serverCardForEvent({kind: 'daily', day: date, slot});
        assert.ok(!seen.has(card.id), `Slot ${slot} repeats before completing its rotation`);
        seen.add(card.id);
        return card.id;
      });
      assert.equal(new Set(today).size, count, 'Daily slots must contain different posts');
    }
    for (const seen of slots) assert.equal(seen.size, PUBLIC_POSTS.length);
  }
});

test('posts 41–60 match the retrieved Arabic narrations and introduce twenty distinct references', () => {
  const evidence = JSON.parse(readFileSync(new URL('./fixtures/public-posts-41-60-sources.json', import.meta.url), 'utf8'));
  const previousUrls = new Set(PUBLIC_POSTS.slice(0, 40).flatMap(card => card.source.citations.map(ref => ref.url)));
  const normalize = text => text.replace(/[^\u0621-\u063a\u0641-\u064a\u0671\s]/gu, '').replaceAll('اقرؤوا', 'اقرءوا').replaceAll('السماوات', 'السموات').replace(/الحي(?=$|\s)/gu, 'الحى').replace(/\s/gu, '');
  const newPosts = PUBLIC_POSTS.slice(40, 60);
  assert.equal(newPosts.length, 20);
  assert.equal(evidence.length, newPosts.length);
  assert.equal(new Set(evidence.map(source => source.url)).size, newPosts.length);
  for (const card of newPosts) {
    const source = evidence.find(source => source.url === card.source.url);
    assert.ok(source, `Missing primary text for ${card.id}`);
    assert.equal(source.retrievedOn, card.source.checkedOn);
    assert.ok(!previousUrls.has(source.url), `Repeated earlier reference: ${source.url}`);
    const quotes = [...card.body.matchAll(/«([^»]+)»/gu)].map(match => match[1]);
    assert.ok(quotes.length >= 1, 'Each new post quotes the prophetic text');
    for (const quote of quotes) assert.ok(normalize(source.arabic).includes(normalize(quote)), `${card.id}: quotation differs from its Arabic source`);
  }
});

test('new reminders retain the complete prophetic wording and preserve narrator qualifications', () => {
  const evidence = JSON.parse(readFileSync(new URL('./fixtures/public-posts-41-60-sources.json', import.meta.url), 'utf8'));
  const normalize = text => text.replace(/[^\u0621-\u063a\u0641-\u064a\u0671\s]/gu, '').replaceAll('اقرؤوا', 'اقرءوا').replaceAll('السماوات', 'السموات').replace(/الحي(?=$|\s)/gu, 'الحى').replace(/\s/gu, '');
  for (const card of PUBLIC_POSTS.slice(40, 60)) {
    const source = evidence.find(source => source.url === card.source.url);
    let quotedSource = [...source.arabic.matchAll(/"([^"]+)"/gu)].map(match => match[1]);
    // This is the narrator's alternate ending, already explained in source details.
    if (card.editorialNumber === 49) quotedSource = quotedSource.slice(0, 1);
    let expected = normalize(quotedSource.join(' '));
    if (card.editorialNumber === 58) {
      // The narrator's uncertainty interrupts the primary text and must stay visible.
      expected = expected.replace('وأحسبهقاليشكالقعنبي', '');
      assert.ok(normalize(card.body).includes('وأحسبهقاليشكالقعنبي'));
    }
    const actual = [...card.body.matchAll(/«([^»]+)»/gu)].map(match => match[1]);
    assert.equal(normalize(actual.join(' ')), expected, `${card.id}: a sentence of the prophetic text was omitted or altered`);
    assert.ok(!card.source.reference.includes('مقتطف'));
  }
  assert.ok(PUBLIC_POSTS.find(card => card.editorialNumber === 42).body.includes('وتحدثني عن صحيفتك'));
  assert.ok(PUBLIC_POSTS.find(card => card.editorialNumber === 45).body.includes('وشبك أصابعه'));
  assert.ok(PUBLIC_POSTS.find(card => card.editorialNumber === 60).body.includes('قال معاوية: بلغني أن البطلة السحرة'));
});

test('posts 61–85 add twenty-five distinct primary references and retain every prophetic sentence', () => {
  const evidence = JSON.parse(readFileSync(new URL('./fixtures/public-posts-61-85-sources.json', import.meta.url), 'utf8'));
  const previousUrls = new Set(PUBLIC_POSTS.slice(0, 60).flatMap(card => card.source.citations.map(ref => ref.url)));
  const normalize = text => text.replace(/[^\u0621-\u063a\u0641-\u064a\u0671]/gu, '');
  const newPosts = PUBLIC_POSTS.slice(60, 85);
  assert.equal(newPosts.length, 25);
  assert.equal(evidence.length, 25);
  assert.equal(new Set(evidence.map(source => source.url)).size, 25);
  for (const card of newPosts) {
    const source = evidence.find(source => source.url === card.source.url);
    assert.ok(source, `Missing primary Arabic narration for ${card.id}`);
    assert.ok(!previousUrls.has(source.url), `Repeated earlier reference: ${source.url}`);
    assert.equal(source.retrievedOn, card.source.checkedOn);
    let expected = normalize([...source.arabic.matchAll(/"([^"]+)"/gu)].map(match => match[1]).join(' '));
    assert.ok(expected.length > 0, 'The evidence must contain the original complete quotation');
    const qualifications = { 74: 'أو قال حتى يتفرقا', 81: 'وربما قال يعطي' };
    const qualification = qualifications[card.editorialNumber];
    if (qualification) {
      assert.ok(expected.includes(normalize(qualification)), 'The qualification must come from the primary narration');
      expected = expected.replace(normalize(qualification), '');
      // Narrator uncertainty stays visible, outside the words attributed to the Prophet.
      const outsideQuotes = card.body.replace(/«[^»]+»/gu, '');
      assert.ok(normalize(outsideQuotes).includes(normalize(qualification)), `${card.id}: narrator qualification is missing`);
    }
    const quotes = [...card.body.matchAll(/«([^»]+)»/gu)].map(match => match[1]);
    assert.equal(normalize(quotes.join(' ')), expected, `${card.id}: the prophetic wording was shortened or altered`);
    assert.equal(card.source.citations.length, 1);
    assert.equal(card.source.citations[0].url, source.url);
    assert.ok(!card.source.reference.includes('مقتطف'));
  }
});

test('posts 61–85 preserve dialogue, narrator context and the three repeated clauses', () => {
  const evidence = JSON.parse(readFileSync(new URL('./fixtures/public-posts-61-85-sources.json', import.meta.url), 'utf8'));
  const cardFor = number => PUBLIC_POSTS.find(card => card.editorialNumber === number);
  const sourceFor = number => evidence.find(source => source.url === cardFor(number).source.url).arabic;
  const normalize = text => text.replaceAll('صلى الله عليه وسلم', '').replace(/[^\u0621-\u063a\u0641-\u064a\u0671]/gu, '');
  const context = sourceFor(62).match(/أَرَادَ بِنَاءَ الْمَسْجِدِ[\s\S]*?فَقَالَ سَمِعْتُ/u)?.[0];
  assert.ok(context, 'Missing original context of Uthman’s statement');
  assert.ok(normalize(cardFor(62).body).includes(normalize(context)));
  for (const number of [67, 68]) {
    const dialogue = sourceFor(number).split('"')[2];
    assert.ok(dialogue && normalize(dialogue).length > 0);
    assert.ok(normalize(cardFor(number).body).includes(normalize(dialogue)), `Post ${number}: the question or reply was removed`);
  }
  const shoulder = sourceFor(82).match(/أَخَذَ رَسُولُ اللَّهِ[\s\S]*?فَقَالَ/u)?.[0];
  const counsel = sourceFor(82).split('"')[2];
  assert.ok(shoulder && counsel);
  assert.ok(normalize(cardFor(82).body).includes(normalize(shoulder)));
  assert.ok(normalize(cardFor(82).body).includes(normalize(counsel)));
  const quotedCounsel = [...cardFor(82).body.matchAll(/«([^»]+)»/gu)].map(match => match[1]).join(' ');
  assert.ok(!quotedCounsel.includes('إذا أمسيت'), 'Ibn Umar’s counsel must not be attributed to the Prophet');
  assert.equal((normalize(cardFor(78).body).match(/أنظرواهذينحتىيصطلحا/gu) || []).length, 3);
});

test('complete rotations cover every post across year boundaries and all three daily slots', () => {
  for (const beginning of ['1969-12-15', '2026-10-06', '2026-12-19', '2027-02-15']) {
    for (const slot of [0, 1, 2]) {
      const seen = new Set();
      for (let offset = 0; offset < PUBLIC_POSTS.length; offset++) {
        const day = new Date(Date.parse(beginning + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
        const card = serverCardForEvent({kind: 'daily', day, slot});
        assert.ok(!seen.has(card.id), `${beginning}, slot ${slot}: post repeats before the full rotation`);
        seen.add(card.id);
      }
      assert.equal(seen.size, PUBLIC_POSTS.length);
    }
  }
});

test('public source details include complete-narration context, safe links and a home route without mentions', () => {
  for (const card of PUBLIC_POSTS) {
    const source = publicPostSourcePayload(card.id), text = JSON.stringify(source);
    assert.ok(source.flags & 64);
    assert.ok(text.includes(card.source.url));
    assert.ok(text.includes(card.narratorLine));
    assert.ok(text.includes('حدود النقل'));
    assert.ok(text.includes('rafiq:v1:home'));
    assert.deepEqual(source.allowed_mentions.parse, []);
  }
  assert.throws(() => publicPostSourcePayload('unknown'), RangeError);
});
