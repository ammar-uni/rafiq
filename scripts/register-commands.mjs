import { REST } from 'discord.js';
import { readConfig } from '../src/config.mjs';
import { COMMANDS } from '../src/commands.mjs';
import { registerApplication } from '../src/registration.mjs';

try {
  const config = readConfig();
  const rest = new REST({ version: '10', retries: 0, timeout: 10_000 }).setToken(config.token);
  await registerApplication(rest, config);
  console.log(`Registered ${COMMANDS.length} commands ${config.guildId ? 'in the configured test server' : 'globally'}.`);
} catch (error) {
  console.error(['RAF_CONFIG', 'RAF_APP_MISMATCH'].includes(error.code) ? error.message : `Command registration failed (${String(error.code || error.name).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60)}).`);
  process.exitCode = 1;
}
