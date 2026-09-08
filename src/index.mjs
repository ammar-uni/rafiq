import { Client, Events, GatewayIntentBits, Partials, ChannelType } from 'discord.js';
import { readConfig } from './config.mjs';
import { Store } from './store.mjs';
import { SerialQueue } from './serial.mjs';
import { RafiqApp } from './app.mjs';
import { ReminderEngine } from './reminders.mjs';
import { noticePayload } from './messages.mjs';
import { assertReviewedContent } from './content-review.mjs';
import { acknowledgePrivate, makeSendDM, setupPanel, statusPayload, toDiscord } from './discord-adapter.mjs';

function safeError(context, error) {
  const code = String(error?.code || error?.name || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
  console.error(`[${context}] ${code}`);
}

async function main() {
  let config;
  try { assertReviewedContent(); config = readConfig(process.env, { requireRuntime: true }); } catch (error) { console.error(error.message); process.exitCode = 1; return; }
  const store = new Store(config.databasePath, { encryptionKey: config.encryptionKey });
  const queue = new SerialQueue();
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates], partials: [Partials.Channel],
    allowedMentions: { parse: [], repliedUser: false }, rest: { timeout: 10_000, retries: 0 }
  });
  const sendDM = makeSendDM(client);
  let connected = false;
  let identityVerified = false;
  let stopping = false;
  const engine = new ReminderEngine({ store, queue, sendDM, canSend: () => identityVerified && connected && !stopping && client.isReady(),
    isInVoice: userId => client.guilds.cache.some(guild => Boolean(guild.voiceStates.cache.get(userId)?.channelId)),
    onError: error => safeError('reminder', error) });
  const app = new RafiqApp({ store, queue, sendDM, privacyURL: config.privacyURL, supportURL: config.supportURL, cancelUser: userId => engine.cancelUser(userId) });

  function observe(state) {
    if (!state.channelId || state.member?.user.bot) return;
    const channel = state.channel;
    if (!channel || channel.type !== ChannelType.GuildVoice || state.channelId === state.guild.afkChannelId) {
      engine.discard(state.id, state.guild.id);
      return;
    }
    const humanCount = channel.members.filter(member => !member.user.bot).size;
    engine.join({ userId: state.id, guildId: state.guild.id, channelId: channel.id, hasCompany: humanCount >= 2 });
    if (humanCount >= 2) engine.markCompany(state.guild.id, channel.id);
  }
  function seedUser(userId) {
    for (const guild of client.guilds.cache.values()) {
      const state = guild.voiceStates.cache.get(userId);
      if (state?.channelId) observe(state);
    }
  }
  function seedAll() {
    engine.clearVoice();
    for (const guild of client.guilds.cache.values()) for (const state of guild.voiceStates.cache.values()) observe(state);
  }
  client.once(Events.ClientReady, () => {
    if (client.application.id !== config.applicationId) {
      console.error('DISCORD_TOKEN does not belong to DISCORD_APPLICATION_ID.');
      process.exitCode = 1;
      void stop();
      return;
    }
    // Ready provides the complete guild list, including unavailable guild stubs.
    // Remove subscriptions for servers that removed the bot while it was offline.
    try {
      store.reconcileGuilds([...client.guilds.cache.keys()]);
      store.prune(Date.now());
    } catch (error) { safeError('storage', error); process.exitCode = 1; void stop(); return; }
    identityVerified = true;
    connected = true;
    seedAll();
    console.log('Rafiq is ready. Use /rafiq or /rafiq-setup.');
  });
  client.on(Events.VoiceStateUpdate, (before, after) => {
    if (!identityVerified || !connected || stopping || before.channelId === after.channelId || after.member?.user.bot) return;
    try {
      if (after.channelId) observe(after);
      else engine.leave({ userId: after.id, guildId: after.guild.id });
    } catch (error) { safeError('voice-event', error); }
  });
  client.on(Events.ShardDisconnect, () => { connected = false; engine.clearVoice(); });
  client.on(Events.ShardReconnecting, () => { connected = false; engine.clearVoice(); });
  client.on(Events.ShardResume, () => { connected = true; seedAll(); });
  client.on(Events.ShardReady, () => { if (client.isReady()) { connected = true; seedAll(); } });
  client.on(Events.GuildDelete, guild => { engine.removeGuild(guild.id); store.removeGuild(guild.id); });
  client.on(Events.GuildUnavailable, guild => engine.removeGuild(guild.id));
  client.on(Events.Error, error => safeError('discord', error));
  client.on(Events.Warn, () => console.warn('[discord] A gateway warning occurred.'));
  client.on(Events.InteractionCreate, async interaction => {
    if (stopping || !identityVerified) return;
    const isCommand = interaction.isChatInputCommand() && ['rafiq', 'rafiq-setup', 'rafiq-status'].includes(interaction.commandName);
    const isComponent = interaction.isMessageComponent() && interaction.customId.startsWith('rafiq:v1:');
    if (!isCommand && !isComponent) return;
    try {
      await acknowledgePrivate(interaction);
      let payload;
      if (isCommand && interaction.commandName === 'rafiq-setup') {
        payload = await queue.run(`guild:${interaction.guildId}`, () => setupPanel({ interaction, store }));
      } else if (isCommand && interaction.commandName === 'rafiq-status') {
        payload = statusPayload(interaction, store);
      } else {
        const action = isCommand ? interaction.options.getString('section') || 'home' : interaction.customId.slice('rafiq:v1:'.length);
        payload = await app.handle({ userId: interaction.user.id, guildId: interaction.guildId, action, values: interaction.isStringSelectMenu() ? interaction.values : [] });
        if (['enable', 'resume', 'test_dm'].includes(action)) seedUser(interaction.user.id);
      }
      await interaction.editReply(toDiscord(payload, { forEdit: true }));
    } catch (error) {
      safeError('interaction', error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(toDiscord(noticePayload('تعذّر إكمال الطلب', 'حاول مجددًا بعد قليل. لم تُنشر إعداداتك في القناة.'), { forEdit: true })).catch(() => {});
      }
    }
  });
  let tickPromise = Promise.resolve();
  const timer = setInterval(() => { if (!engine.running) tickPromise = engine.tick().catch(error => safeError('scheduler', error)); }, 5000);
  async function stop() {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    engine.clearVoice();
    await tickPromise;
    await queue.drain();
    await client.destroy();
    store.close();
  }
  process.once('SIGINT', () => { void stop(); });
  process.once('SIGTERM', () => { void stop(); });
  try { await client.login(config.token); }
  catch (error) { safeError('login', error); process.exitCode = 1; await stop(); }
}

main().catch(error => { safeError('startup', error); process.exitCode = 1; });
