import { Client, Events, GatewayIntentBits, Partials, ChannelType } from 'discord.js';
import { readConfig } from './config.mjs';
import { Store } from './store.mjs';
import { SerialQueue } from './serial.mjs';
import { RafiqApp } from './app.mjs';
import { ReminderEngine } from './reminders.mjs';
import { noticePayload, prayerModal } from './messages.mjs';
import { PRAYERS } from './prayer-config.mjs';
import { PrayerApp } from './prayer-app.mjs';
import { PrayerScheduler } from './prayer-scheduler.mjs';
import { loadPrayerSounds } from './prayer-sounds.mjs';
import { assertReviewedContent } from './content-review.mjs';
import { runtimeLog, safeErrorCode } from './runtime-log.mjs';
import { acknowledgePrivate, makeSendDM, setupPanel, statusPayload, toDiscord } from './discord-adapter.mjs';

function safeError(context, error) {
  runtimeLog(context, { code: safeErrorCode(error) });
}

async function main() {
  let config;
  try { assertReviewedContent(); } catch (error) { safeError('content-review-failed', error); process.exitCode = 65; if (process.connected) process.disconnect(); return; }
  try { config = readConfig(process.env, { requireRuntime: true }); } catch (error) { safeError('configuration-failed', error); process.exitCode = 78; if (process.connected) process.disconnect(); return; }
  const store = new Store(config.databasePath, { encryptionKey: config.encryptionKey });
  const queue = new SerialQueue();
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates], partials: [Partials.Channel],
    allowedMentions: { parse: [], repliedUser: false }, rest: { timeout: 10_000, retries: 0 }
  });
  const sounds = loadPrayerSounds();
  const sendDM = makeSendDM(client, { sounds });
  let connected = false;
  let identityVerified = false;
  let stopping = false;
  const engine = new ReminderEngine({ store, queue, sendDM, canSend: () => identityVerified && connected && !stopping && client.isReady(),
    isInVoice: userId => client.guilds.cache.some(guild => Boolean(guild.voiceStates.cache.get(userId)?.channelId)),
    onError: error => safeError('reminder', error) });
  engine.prayers = new PrayerScheduler({ store, queue, sounds, canSend: engine.canSend, deliver: (...args) => engine.deliver(...args), onError: error => safeError('prayer-schedule', error) });
  const prayers = new PrayerApp({ store, sounds, sendDM });
  const app = new RafiqApp({ store, queue, sendDM, prayers, privacyURL: config.privacyURL, supportURL: config.supportURL, cancelUser: userId => engine.cancelUser(userId), cancelGuild: (userId, guildId) => engine.discard(userId, guildId) });

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
      runtimeLog('application-mismatch');
      process.exitCode = 78;
      void stop();
      return;
    }
    // Ready provides the complete guild list, including unavailable guild stubs.
    // Remove subscriptions for servers that removed the bot while it was offline.
    try {
      store.reconcileGuilds([...client.guilds.cache.keys()]);
      store.prune(Date.now());
    } catch (error) { safeError('storage', error); process.exitCode = 73; void stop(); return; }
    identityVerified = true;
    connected = true;
    seedAll();
    runtimeLog('ready');
    reportHealth();
  });
  client.on(Events.VoiceStateUpdate, (before, after) => {
    if (!identityVerified || !connected || stopping || before.channelId === after.channelId || after.member?.user.bot) return;
    try {
      if (after.channelId) observe(after);
      else engine.leave({ userId: after.id, guildId: after.guild.id });
    } catch (error) { safeError('voice-event', error); }
  });
  client.on(Events.ShardDisconnect, () => { connected = false; engine.clearVoice(); runtimeLog('gateway-disconnected'); reportHealth(); });
  client.on(Events.ShardReconnecting, () => { connected = false; engine.clearVoice(); runtimeLog('gateway-reconnecting'); reportHealth(); });
  client.on(Events.ShardResume, () => { connected = true; seedAll(); runtimeLog('gateway-resumed'); reportHealth(); });
  client.on(Events.ShardReady, () => { if (client.isReady()) { connected = true; seedAll(); } });
  client.on(Events.GuildDelete, guild => { engine.removeGuild(guild.id); store.removeGuild(guild.id); });
  client.on(Events.GuildUnavailable, guild => engine.removeGuild(guild.id));
  client.on(Events.Error, error => safeError('discord', error));
  client.on(Events.Warn, () => runtimeLog('gateway-warning'));
  client.on(Events.InteractionCreate, async interaction => {
    if (stopping || !identityVerified) return;
    const isCommand = interaction.isChatInputCommand() && ['rafiq', 'rafiq-setup', 'rafiq-status'].includes(interaction.commandName);
    const isComponent = interaction.isMessageComponent() && interaction.customId.startsWith('rafiq:v1:');
    const isModal = interaction.isModalSubmit() && ['rafiq:v1:prayer_search', 'rafiq:v1:prayer_adjust'].includes(interaction.customId);
    if (!isCommand && !isComponent && !isModal) return;
    try {
      const action = isCommand ? interaction.options.getString('section') || 'home' : interaction.customId.slice('rafiq:v1:'.length);
      if (isComponent && ['prayer_city_modal', 'prayer_adjust_modal'].includes(action)) {
        await interaction.showModal(prayerModal(action, store.getPrayer(interaction.user.id)));
        return;
      }
      await acknowledgePrivate(interaction);
      let payload;
      if (isCommand && interaction.commandName === 'rafiq-setup') {
        payload = await queue.run(`guild:${interaction.guildId}`, () => setupPanel({ interaction, store }));
      } else if (isCommand && interaction.commandName === 'rafiq-status') {
        payload = statusPayload(interaction, store);
      } else {
        const values = isModal ? (action === 'prayer_search' ? [interaction.fields.getTextInputValue('city')] : PRAYERS.map(([key]) => interaction.fields.getTextInputValue(key))) : interaction.isStringSelectMenu() ? interaction.values : [];
        payload = await app.handle({ userId: interaction.user.id, guildId: interaction.guildId, action, values });
        if (['enable', 'resume', 'test_dm'].includes(action)) seedUser(interaction.user.id);
      }
      await interaction.editReply(toDiscord(payload, { forEdit: true }));
    } catch (error) {
      safeError('interaction', error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(toDiscord(noticePayload('تعذّر إكمال الطلب', 'حاول مجددًا بعد قليل. لم تُنشر إعداداتك في القناة.'), { forEdit: true })).catch(() => {});
      } else await interaction.reply(toDiscord(noticePayload('تعذّر فتح الخيار', 'حاول مجددًا بعد قليل.'))).catch(() => {});
    }
  });
  let tickPromise = Promise.resolve();
  const timer = setInterval(() => { prayers.prune(); if (!engine.running) tickPromise = engine.tick().catch(error => safeError('scheduler', error)); }, 5000);
  function reportHealth() {
    if (process.connected) process.send({ type: 'rafiq:health', ready: identityVerified && connected && !stopping && client.isReady() }, () => {});
  }
  const heartbeat = setInterval(reportHealth, 5000);
  heartbeat.unref();
  async function stop() {
    if (stopping) return;
    stopping = true;
    reportHealth();
    clearInterval(timer);
    clearInterval(heartbeat);
    engine.clearVoice();
    await tickPromise;
    await queue.drain();
    await client.destroy();
    store.close();
    runtimeLog('stopped');
    if (process.connected) process.disconnect();
  }
  process.once('SIGINT', () => { void stop(); });
  process.once('SIGTERM', () => { void stop(); });
  process.on('message', message => { if (message?.type === 'rafiq:stop') void stop(); });
  process.once('disconnect', () => { void stop(); });
  try { await client.login(config.token); }
  catch (error) { safeError('login', error); process.exitCode = ['TokenInvalid', 'TOKEN_INVALID', 4004, 4013, 4014].includes(error.code) ? 78 : 1; await stop(); }
}

process.once('uncaughtException', error => { safeError('fatal-uncaught', error); process.exit(1); });
process.once('unhandledRejection', error => { safeError('fatal-rejection', error); process.exit(1); });
main().catch(error => { safeError('startup', error); process.exitCode = error.code === 'RAF_STORAGE' ? 73 : 1; if (process.connected) process.disconnect(); });
