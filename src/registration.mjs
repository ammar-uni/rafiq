import { Routes } from 'discord.js';
import { APP_DESCRIPTION, COMMANDS } from './commands.mjs';

export async function registerApplication(rest, config) {
  const application = await rest.get(Routes.currentApplication());
  if (application.id !== config.applicationId) throw Object.assign(new Error('The token does not belong to DISCORD_APPLICATION_ID.'), { code: 'RAF_APP_MISMATCH' });
  const route = config.guildId ? Routes.applicationGuildCommands(config.applicationId, config.guildId) : Routes.applicationCommands(config.applicationId);
  for (const command of COMMANDS) {
    const body = structuredClone(command);
    if (config.guildId) { delete body.contexts; delete body.integration_types; }
    // Upsert our named commands without removing other application commands.
    await rest.post(route, { body });
  }
  // Test-server registration must not change the public app profile.
  if (!config.guildId && application.description !== APP_DESCRIPTION) {
    await rest.patch(Routes.currentApplication(), { body: { description: APP_DESCRIPTION } });
  }
}
