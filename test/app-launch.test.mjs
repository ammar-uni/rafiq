import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Client, MessagePayload } from 'discord.js';
import { appLaunchPayload, welcomePayload, BRAND, FLAGS } from '../src/messages.mjs';
import { toDiscord } from '../src/discord-adapter.mjs';
import { createPreviewServer } from '../scripts/serve-preview.mjs';

const visit = (payload, predicate) => {
  const matches = [];
  function walk(item) {
    if (predicate(item)) matches.push(item);
    item.components?.forEach(walk);
    if (item.accessory) walk(item.accessory);
  }
  payload.components.forEach(walk);
  return matches;
};

test('launch announcement and public card use the exact Store product without mentions or a direct installer', () => {
  for (const payload of [appLaunchPayload(), welcomePayload()]) {
    const links = visit(payload, item => item.type === 2 && item.style === 5);
    assert.ok(links.some(item => item.url === 'https://apps.microsoft.com/detail/9NN8WLLF8P7Z'));
    assert.ok(links.some(item => item.url === 'https://rafiq.ammarbalkhi.com/#windows'));
    assert.deepEqual(payload.allowed_mentions, { parse: [], replied_user: false });
    assert.ok(!(payload.flags & FLAGS.ephemeral));
    assert.doesNotMatch(JSON.stringify(payload), /@everyone|@here|\.exe|\.msix|\.env|قيد مراجعة Microsoft/);
  }
  const launch = appLaunchPayload();
  assert.ok(!(launch.flags & FLAGS.silent));
  assert.match(JSON.stringify(launch), /Windows 11/);
  assert.match(JSON.stringify(launch), /مواقيت الصلاة في شريط المهام/);
  assert.match(JSON.stringify(launch), /macOS وLinux قيد التطوير/);
  assert.match(JSON.stringify(launch), /مثال توضيحي/);
});

test('Discord serializes the launch screenshot attachment for sending and editing', async t => {
  const client = new Client({ intents: [] }); t.after(() => client.destroy());
  for (const forEdit of [false, true]) {
    const message = MessagePayload.create({ client }, toDiscord(appLaunchPayload(), { forEdit })).resolveBody();
    await message.resolveFiles();
    assert.equal(message.files.length, 1);
    assert.equal(message.files[0].name, BRAND.appScreenshot);
    assert.equal(message.body.attachments[0].id, '0');
    assert.deepEqual(message.body.allowed_mentions.parse, []);
    const image = message.body.components[0].components.find(item => item.type === 12);
    assert.equal(image.items[0].media.url, `attachment://${BRAND.appScreenshot}`);
  }
});

test('the attachment adapter still rejects arbitrary filenames and path traversal', () => {
  for (const filename of ['other.png', '../.env', '../../private.txt', '/etc/passwd']) {
    const payload = appLaunchPayload(); payload.attachments[0].filename = filename;
    assert.throws(() => toDiscord(payload), /Unknown attachment/);
  }
});

test('local preview serves only the approved screenshot and rejects cross-origin access', async t => {
  const server = createPreviewServer({ lookup: () => assert.fail('No city lookup expected') });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/assets/${BRAND.appScreenshot}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(new URL(`../assets/${BRAND.appScreenshot}`, import.meta.url)));
  assert.equal((await fetch(`${base}/assets/.env`)).status, 404);
  assert.equal((await fetch(`${base}/assets/${BRAND.appScreenshot}`, { headers: { Origin: 'https://unrelated.example' } })).status, 403);
});
