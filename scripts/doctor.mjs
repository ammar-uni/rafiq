import { DatabaseSync } from 'node:sqlite';
import { readConfig } from '../src/config.mjs';

const database = new DatabaseSync(':memory:');
database.exec('SELECT 1');
database.close();
console.log('Node.js and SQLite are available.');
try {
  readConfig(process.env, { requireRuntime: true });
  console.log('Local configuration is present. No Discord connection was attempted and no secret values were printed.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
