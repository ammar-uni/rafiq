import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, MessagePayload, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { acknowledgePrivate, toDiscord, canManageGuild, setupPanel } from '../src/discord-adapter.mjs';
import { welcomePayload, libraryPayload, homePayload, BRAND } from '../src/messages.mjs';
import { readConfig } from '../src/config.mjs';
import { COMMANDS, INSTALL_PERMISSIONS, inviteURL } from '../src/commands.mjs';

test('discord.js serializes the native components and suppresses mentions', async () => {
  const client = new Client({ intents: [] });
  const target = { client };
  const body = MessagePayload.create(target, toDiscord(libraryPayload())).resolveBody().body;
  assert.equal(body.components[0].type, 17);
  assert.equal(body.components[0].components[0].type, 10);
  assert.deepEqual(body.allowed_mentions, { parse: [], replied_user: false });
  const welcome = MessagePayload.create(target, toDiscord(welcomePayload())).resolveBody();
  await welcome.resolveFiles();
  assert.equal(welcome.files.length, 1);
  assert.equal(welcome.files[0].name, BRAND.banner);
  assert.equal(welcome.body.attachments.length, 1);
  assert.equal(welcome.body.attachments[0].id, '0');
  const home = MessagePayload.create(target, toDiscord(homePayload())).resolveBody().body;
  const sections = home.components[0].components.filter(component => component.type === 9);
  assert.equal(sections.length, 3);
  assert.equal(sections[0].accessory.custom_id, 'rafiq:v1:library');
  await client.destroy();
});

test('public and DM component clicks create a private response; private panels update in place', async () => {
  for (const originalPrivate of [false, true]) {
    const calls = [];
    await acknowledgePrivate({
      isMessageComponent: () => true,
      message: { flags: { has: () => originalPrivate } },
      deferUpdate: async () => calls.push('update'),
      deferReply: async options => { assert.equal(options.flags, MessageFlags.Ephemeral); calls.push('private'); }
    });
    assert.deepEqual(calls, [originalPrivate ? 'update' : 'private']);
  }
  assert.ok(!(toDiscord(libraryPayload(), { forEdit: true }).flags & MessageFlags.Ephemeral));
});

test('server setup enforces permissions at runtime and does not request administrator access', async () => {
  assert.equal(canManageGuild({ inGuild: () => false }), false);
  assert.equal(canManageGuild({ inGuild: () => true, memberPermissions: { has: () => false } }), false);
  const result = await setupPanel({ interaction: { inGuild: () => false }, store: {} });
  assert.match(JSON.stringify(result), /للمشرف/);
  assert.equal(INSTALL_PERMISSIONS & PermissionFlagsBits.Administrator, 0n);
  assert.equal(INSTALL_PERMISSIONS & PermissionFlagsBits.Connect, 0n);
  assert.equal(INSTALL_PERMISSIONS & PermissionFlagsBits.ManageMessages, 0n);
  assert.equal(COMMANDS.length, 3);
  assert.equal(new URL(inviteURL('123456789012345678')).searchParams.get('scope'), 'bot applications.commands');
});

test('configuration failures identify fields without exposing token values', () => {
  assert.throws(() => readConfig({ DISCORD_TOKEN: 'sensitive-value' }), error => !error.message.includes('sensitive-value') && error.message.includes('APPLICATION_ID'));
  assert.throws(() => readConfig({ DISCORD_APPLICATION_ID: '123456789012345678' }), /DISCORD_TOKEN/);
});
