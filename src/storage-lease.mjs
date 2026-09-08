import { DatabaseSync } from 'node:sqlite';
import { closeSync, existsSync, openSync, statSync } from 'node:fs';

const failure = message => Object.assign(new Error(message), { code: 'RAF_STORAGE' });

/** SQLite supplies an OS-backed exclusive lock on an empty file; no data is written. */
export class StorageLease {
  constructor(filename) {
    if (existsSync(filename + '.lock')) {
      throw failure('Cannot lock the data file: a legacy .lock exists. Stop the old bot and follow docs/setup.md before upgrading.');
    }
    this.filename = filename + '.guard';
    let database;
    try {
      closeSync(openSync(this.filename, 'a', 0o600));
      if (statSync(this.filename).size !== 0) throw failure('The storage guard must be empty. No data was overwritten.');
      database = new DatabaseSync(this.filename);
      database.exec('PRAGMA busy_timeout = 0; PRAGMA journal_mode = MEMORY; BEGIN EXCLUSIVE;');
      this.database = database;
    } catch (error) {
      database?.close();
      if (error.code === 'RAF_STORAGE') throw error;
      throw failure('Cannot lock the data file. Run one bot process on a local persistent disk.');
    }
  }

  close() {
    if (!this.database) return;
    this.database.close();
    this.database = null;
    // Keep the empty file: unlinking a locked inode can create two independent locks.
  }
}
