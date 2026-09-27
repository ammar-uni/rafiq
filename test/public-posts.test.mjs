import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PUBLIC_POSTS } from '../src/content.mjs';
import { serverCardForEvent, serverPostPayload } from '../src/server-messages.mjs';
import { publicPostSourcePayload } from '../src/messages.mjs';

test('all ten public messages exactly match the approved editorial text and source', () => {
  const document = readFileSync(new URL('../docs/reminder-posts.md', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  const sections = [...document.matchAll(/^## ([٠-٩]+) · (.+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)];
  assert.equal(PUBLIC_POSTS.length, 10);
  assert.equal(sections.length, PUBLIC_POSTS.length);
  const seen = new Set();
  for (let day = 10; day < 20; day++) {
    const event = { kind: 'daily', day: `2026-09-${day}`, slot: 0 };
    const card = serverCardForEvent(event), section = sections[card.editorialNumber - 1];
    const lines = section[3].split('\n').filter(line => line.startsWith('>')).map(line => line.replace(/^> ?/, '')).filter(Boolean);
    assert.equal(serverPostPayload(event).content, lines.join('\n'), card.id);
    assert.ok(section[3].includes(`(${card.source.url})`), card.id);
    assert.ok(section[3].includes(`- الصحابي: ${card.narratorLine}`), card.id);
    assert.ok(card.source.citations.every(ref => ['bukhari', 'muslim'].includes(ref.collection)));
    seen.add(card.id);
  }
  assert.equal(seen.size, 10, 'Every approved post appears in the rotation');
  assert.throws(() => { PUBLIC_POSTS[0].body = 'changed'; }, TypeError);
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
