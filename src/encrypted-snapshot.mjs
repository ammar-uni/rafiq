import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { StorageLease } from './storage-lease.mjs';

const MAGIC = Buffer.from('RAFIQ01\n');
const MAX_BYTES = 16 * 1024 * 1024;
const storageError = message => Object.assign(new Error(message), { code: 'RAF_STORAGE' });

export function dataKey(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) {
    throw storageError('RAFIQ_DATA_KEY must be a 32-byte key. Run npm run setup:local; never share the key.');
  }
  return Buffer.from(value, 'hex');
}

/** A single-process, authenticated snapshot. Plaintext never goes to a database or journal file. */
export class EncryptedSnapshot {
  constructor(filename, key) {
    this.key = dataKey(key);
    this.filename = resolve(filename);
    mkdirSync(dirname(this.filename), { recursive: true, mode: 0o700 });
    try { this.lease = new StorageLease(this.filename); }
    catch (error) { this.key.fill(0); throw error; }
  }

  read() {
    if (!existsSync(this.filename)) return null;
    const bytes = readFileSync(this.filename);
    if (bytes.length > MAX_BYTES || bytes.length < MAGIC.length + 28 || !bytes.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw storageError('The data file is not a supported encrypted Rafiq snapshot. It was not modified. Do not rename an old SQLite file to migrate it.');
    }
    let plain;
    try {
      const offset = MAGIC.length;
      const decipher = createDecipheriv('aes-256-gcm', this.key, bytes.subarray(offset, offset + 12), { authTagLength: 16 });
      decipher.setAAD(MAGIC);
      decipher.setAuthTag(bytes.subarray(offset + 12, offset + 28));
      plain = Buffer.concat([decipher.update(bytes.subarray(offset + 28)), decipher.final()]);
      return JSON.parse(plain.toString('utf8'));
    } catch { throw storageError('Cannot decrypt the data file: the key is wrong or the file is damaged. No data was overwritten.'); }
    finally { plain?.fill(0); }
  }

  write(value) {
    const plain = Buffer.from(JSON.stringify(value));
    let bytes;
    try {
      if (plain.length + MAGIC.length + 28 > MAX_BYTES) throw storageError('The small-server storage limit was reached. Stop and migrate storage before adding more data.');
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', this.key, nonce, { authTagLength: 16 });
      cipher.setAAD(MAGIC);
      const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
      bytes = Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), encrypted]);
    } finally { plain.fill(0); }

    const temporary = this.filename + '.' + randomBytes(8).toString('hex') + '.tmp';
    let fd;
    try {
      fd = openSync(temporary, 'wx', 0o600);
      writeFileSync(fd, bytes);
      fsyncSync(fd);
      closeSync(fd); fd = undefined;
      renameSync(temporary, this.filename);
    } finally {
      if (fd !== undefined) closeSync(fd);
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }

  close() {
    this.lease?.close(); this.lease = null;
    this.key.fill(0);
  }
}
