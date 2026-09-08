import { REST, Routes } from 'discord.js';
import { readConfig } from '../src/config.mjs';
import { COMMANDS } from '../src/commands.mjs';

try {
  const config = readConfig();
  const rest = new REST({ version: '10', retries: 0, timeout: 10_000 }).setToken(config.token);
  const application = await rest.get(Routes.currentApplication());
  if (application.id !== config.applicationId) throw Object.assign(new Error('The token does not belong to DISCORD_APPLICATION_ID.'), { code: 'RAF_APP_MISMATCH' });
  const route = config.guildId ? Routes.applicationGuildCommands(config.applicationId, config.guildId) : Routes.applicationCommands(config.applicationId);
  for (const command of COMMANDS) {
    const body = structuredClone(command);
    if (config.guildId) { delete body.contexts; delete body.integration_types; }
    // POST upserts only our named commands, preserving unrelated application commands.
    await rest.post(route, { body });
  }
  console.log(`Registered ${COMMANDS.length} commands ${config.guildId ? 'in the configured test server' : 'globally'}.`);
} catch (error) {
  console.error(['RAF_CONFIG', 'RAF_APP_MISMATCH'].includes(error.code) ? error.message : `Command registration failed (${String(error.code || error.name).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60)}).`);
  process.exitCode = 1;
}
