import { readFile, writeFile, rename } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { REST } from 'discord.js';
import { readConfig } from '../src/config.mjs';
import { publishAppAnnouncement } from '../src/app-announcement.mjs';

const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== '--plan' || args[2] !== '--ledger') throw new Error('Use --plan <approved-card-channels.json> --ledger <private-publication-journal.json>');
const planPath = resolve(args[1]), ledgerPath = resolve(args[3]);
if (planPath === ledgerPath) throw new Error('Plan and journal must be separate files');
const panels = JSON.parse(await readFile(planPath, 'utf8'));
const campaign = 'windows-store-launch-2026-10-31';
let ledger;
try { ledger = JSON.parse(await readFile(ledgerPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; ledger = { campaign, channels: {} }; }
async function save(value) {
  const temporary = `${ledgerPath}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2)+'\n', { flag: 'wx', mode: 0o600, flush: true });
  await rename(temporary, ledgerPath);
}
const config = readConfig();
const rest = new REST({ version: '10', timeout: 15_000, retries: 0 }).setToken(config.token);
const result = await publishAppAnnouncement({ rest, applicationId: config.applicationId, panels, ledger, save, campaign });
console.log(JSON.stringify({ campaign, ...result }));
if (result.failed || result.uncertain) process.exitCode = 1;
