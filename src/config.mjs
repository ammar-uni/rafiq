import { resolve } from 'node:path';

export function readConfig(env = process.env, { requireToken = true, requireRuntime = false } = {}) {
  const applicationId = env.DISCORD_APPLICATION_ID?.trim();
  const token = env.DISCORD_TOKEN?.trim();
  const guildId = env.DISCORD_GUILD_ID?.trim() || null;
  const encryptionKey = env.RAFIQ_DATA_KEY?.trim();
  const privacyURL = env.RAFIQ_PRIVACY_URL?.trim();
  const supportURL = env.RAFIQ_SUPPORT_URL?.trim();
  const errors = [];
  if (!applicationId || !/^\d{17,20}$/.test(applicationId)) errors.push('Set DISCORD_APPLICATION_ID to your Discord application ID in .env.');
  if (requireToken && (!token || /^(replace|your|paste|example)/i.test(token))) errors.push('Set DISCORD_TOKEN locally in .env. Never commit or share it.');
  if (guildId && !/^\d{17,20}$/.test(guildId)) errors.push('DISCORD_GUILD_ID must be a Discord server ID, or empty for global commands.');
  if (requireRuntime) {
    if (!encryptionKey || !/^[a-f0-9]{64}$/i.test(encryptionKey)) errors.push('Run npm run setup:local to prepare RAFIQ_DATA_KEY. Keep it private and separate from data backups.');
    for (const [field, value] of [['RAFIQ_PRIVACY_URL', privacyURL], ['RAFIQ_SUPPORT_URL', supportURL]]) {
      try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || url.hostname === 'localhost' || /(^|\.)(example\.(com|org|net)|invalid)$/.test(url.hostname) || url.hostname.endsWith('.local') || url.hostname.startsWith('127.') || url.hostname === '[::1]') throw new Error();
      } catch { errors.push('Set ' + field + ' to a real public HTTPS page before starting the bot. See docs/discord-policy-review.md.'); }
    }
  }
  if (errors.length) throw Object.assign(new Error(errors.join('\n')), { code: 'RAF_CONFIG' });
  return { applicationId, token, guildId, encryptionKey, privacyURL, supportURL, databasePath: resolve(env.RAFIQ_DATABASE_PATH || 'data/rafiq.enc') };
}
