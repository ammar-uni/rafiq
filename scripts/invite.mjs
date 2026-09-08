import { readConfig } from '../src/config.mjs';
import { inviteURL } from '../src/commands.mjs';
try { console.log(inviteURL(readConfig(process.env, { requireToken: false }).applicationId)); }
catch (error) { console.error(error.message); process.exitCode = 1; }
