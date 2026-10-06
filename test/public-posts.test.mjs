import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PUBLIC_POSTS } from '../src/content.mjs';
import { serverCardForEvent, serverPostPayload } from '../src/server-messages.mjs';
import { publicPostSourcePayload } from '../src/messages.mjs';

test('all sixty public messages exactly match the reviewed editorial text and source', () => {
  const documents = ['reminder-posts.md', 'reminder-posts-21-40.md', 'reminder-posts-41-60.md'].map(file => readFileSync(new URL(`../docs/${file}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n'));
  const sections = documents.flatMap(document => [...document.matchAll(/^#{2,3} ([٠-٩]+) · (.+)\n([\s\S]*?)(?=^#{2,3} |$(?![\s\S]))/gm)]);
  assert.equal(PUBLIC_POSTS.length, 60);
  assert.equal(sections.length, PUBLIC_POSTS.length);
  assert.deepEqual(PUBLIC_POSTS.map(card => card.editorialNumber), Array.from({ length: PUBLIC_POSTS.length }, (_, index) => index + 1));
  assert.equal(new Set(PUBLIC_POSTS.map(card => card.id)).size, PUBLIC_POSTS.length);
  const seen = new Set();
  for (let day = 0; day < PUBLIC_POSTS.length; day++) {
    const event = { kind: 'daily', day: new Date(Date.UTC(2026, 8, 20 + day)).toISOString().slice(0, 10), slot: 0 };
    const card = serverCardForEvent(event), section = sections[card.editorialNumber - 1];
    const lines = section[3].split('\n').filter(line => line.startsWith('>')).map(line => line.replace(/^> ?/, '')).filter(Boolean);
    assert.equal(serverPostPayload(event).content, lines.join('\n'), card.id);
    assert.ok(section[3].includes(`(${card.source.url})`), card.id);
    assert.equal(section[3].match(/^- الصحابي(?:ة|ان)?: (.+)$/m)?.[1], card.narratorLine, card.id);
    assert.ok(card.source.citations.every(ref => ['bukhari', 'muslim'].includes(ref.collection)));
    seen.add(card.id);
  }
  assert.equal(seen.size, PUBLIC_POSTS.length, 'Every reviewed post appears in the rotation');
  assert.throws(() => { PUBLIC_POSTS[0].body = 'changed'; }, TypeError);
});

test('one, two and three daily slots rotate through all sixty posts across month boundaries', () => {
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
  const newPosts = PUBLIC_POSTS.slice(40);
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
  for (const card of PUBLIC_POSTS.slice(40)) {
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

test('public source details include excerpt context, safe links and a home route without mentions', () => {
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
