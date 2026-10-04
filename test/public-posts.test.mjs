import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PUBLIC_POSTS } from '../src/content.mjs';
import { serverCardForEvent, serverPostPayload } from '../src/server-messages.mjs';
import { publicPostSourcePayload } from '../src/messages.mjs';

test('all forty public messages exactly match the approved editorial text and source', () => {
  const documents = ['reminder-posts.md', 'reminder-posts-21-40.md'].map(file => readFileSync(new URL(`../docs/${file}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n'));
  const sections = documents.flatMap(document => [...document.matchAll(/^#{2,3} ([٠-٩]+) · (.+)\n([\s\S]*?)(?=^#{2,3} |$(?![\s\S]))/gm)]);
  assert.equal(PUBLIC_POSTS.length, 40);
  assert.equal(sections.length, PUBLIC_POSTS.length);
  assert.deepEqual(PUBLIC_POSTS.map(card => card.editorialNumber), Array.from({ length: 40 }, (_, index) => index + 1));
  assert.equal(new Set(PUBLIC_POSTS.map(card => card.id)).size, 40);
  const seen = new Set();
  for (let day = 0; day < 40; day++) {
    const event = { kind: 'daily', day: new Date(Date.UTC(2026, 8, 20 + day)).toISOString().slice(0, 10), slot: 0 };
    const card = serverCardForEvent(event), section = sections[card.editorialNumber - 1];
    const lines = section[3].split('\n').filter(line => line.startsWith('>')).map(line => line.replace(/^> ?/, '')).filter(Boolean);
    assert.equal(serverPostPayload(event).content, lines.join('\n'), card.id);
    assert.ok(section[3].includes(`(${card.source.url})`), card.id);
    assert.equal(section[3].match(/^- الصحابي(?:ة|ان)?: (.+)$/m)?.[1], card.narratorLine, card.id);
    assert.ok(card.source.citations.every(ref => ['bukhari', 'muslim'].includes(ref.collection)));
    seen.add(card.id);
  }
  assert.equal(seen.size, 40, 'Every approved post appears in the rotation');
  assert.throws(() => { PUBLIC_POSTS[0].body = 'changed'; }, TypeError);
});

test('one, two and three daily slots rotate through all forty posts across month boundaries', () => {
  for (const count of [1, 2, 3]) {
    const slots = Array.from({length: count}, () => new Set());
    for (let day = 0; day < 40; day++) {
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
