import { DatabaseSync } from 'node:sqlite';
import { dhikrById, ideaById } from './content.mjs';
import { EncryptedSnapshot } from './encrypted-snapshot.mjs';
import { DEFAULT_PRAYER, PRAYERS, validatePrayer, readStoredPrayer } from './prayer-config.mjs';

export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;
export const DEFAULT_USER = Object.freeze({ enabled: false, frequency: 'daily', delivery: 'silent', pausedUntil: 0, dmBlocked: false, breakAt: null, lastTestAt: null });
const columns = { enabled: 'enabled', frequency: 'frequency', delivery: 'delivery', pausedUntil: 'paused_until', dmBlocked: 'dm_blocked', breakAt: 'break_at', lastTestAt: 'last_test_at' };
const id = value => { if (typeof value !== 'string' || !/^\d{1,25}$/.test(value)) throw new TypeError('Expected a Discord ID'); return value; };
const tables = {
  users: ['user_id', ...Object.values(columns)],
  subscriptions: ['user_id', 'guild_id'], favorites: ['user_id', 'card_id'],
  reminder_attempts: ['user_id', 'attempted_at'], guild_panels: ['guild_id', 'channel_id', 'message_id'],
  prayer_settings: ['user_id', 'settings'], prayer_attempts: ['user_id', 'local_day', 'prayer', 'attempted_at']
};

export class Store {
  constructor(filename, { encryptionKey } = {}) {
    this.db = new DatabaseSync(':memory:');
    this.db.exec(`
      PRAGMA journal_mode = MEMORY;
      PRAGMA temp_store = MEMORY;
      PRAGMA foreign_keys = ON;
      PRAGMA secure_delete = ON;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
        frequency TEXT NOT NULL DEFAULT 'daily' CHECK(frequency IN ('daily','session')),
        delivery TEXT NOT NULL DEFAULT 'silent' CHECK(delivery IN ('normal','silent')),
        paused_until INTEGER NOT NULL DEFAULT 0,
        dm_blocked INTEGER NOT NULL DEFAULT 0 CHECK(dm_blocked IN (0,1)),
        break_at INTEGER,
        last_test_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS subscriptions (
        user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        guild_id TEXT NOT NULL,
        PRIMARY KEY(user_id, guild_id)
      );
      CREATE TABLE IF NOT EXISTS favorites (
        user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        card_id TEXT NOT NULL,
        PRIMARY KEY(user_id, card_id)
      );
      CREATE TABLE IF NOT EXISTS reminder_attempts (
        user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        attempted_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS attempts_by_user ON reminder_attempts(user_id, attempted_at);
      CREATE TABLE IF NOT EXISTS guild_panels (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        message_id TEXT NOT NULL
      );
      CREATE TABLE prayer_settings (
        user_id TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
        settings TEXT NOT NULL
      );
      CREATE TABLE prayer_attempts (
        user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        local_day TEXT NOT NULL, prayer TEXT NOT NULL, attempted_at INTEGER NOT NULL,
        PRIMARY KEY(user_id, local_day, prayer)
      );
      PRAGMA user_version = 2;
    `);
    try {
      if (filename !== ':memory:') {
        this.snapshot = new EncryptedSnapshot(filename, encryptionKey);
        const saved = this.snapshot.read();
        if (saved) {
          const sourceTables = Object.entries(tables).filter(([name]) => saved.version !== 1 || !name.startsWith('prayer_'));
          if (![1, 2, 3].includes(saved.version) || !saved.tables || Object.keys(saved.tables).length !== sourceTables.length) throw new Error('Unsupported snapshot structure');
          this.db.exec('BEGIN IMMEDIATE');
          try {
            for (const [table, names] of sourceTables) {
              if (!Array.isArray(saved.tables[table])) throw new Error('Invalid snapshot table');
              const insert = this.db.prepare('INSERT INTO ' + table + ' (' + names.join(', ') + ') VALUES (' + names.map(() => '?').join(', ') + ')');
              for (const values of saved.tables[table]) {
                if (!Array.isArray(values) || values.length !== names.length) throw new Error('Invalid snapshot row');
                // Rollback bridge: preserve v3 data and conservatively use the older
                // three-per-day option until the five-per-day release is active.
                if (saved.version === 3 && table === 'users' && values[2] === 'session5') values[2] = 'session';
                if (table === 'prayer_settings') values[1] = JSON.stringify(readStoredPrayer(JSON.parse(values[1])));
                insert.run(...values);
              }
            }
            this.db.exec('COMMIT');
          } catch (error) { this.db.exec('ROLLBACK'); throw error; }
        } else this.persist();
      }
    } catch (error) { this.db.close(); this.snapshot?.close(); error.code = 'RAF_STORAGE'; throw error; }
  }

  persist() {
    if (!this.snapshot) return;
    const saved = {};
    for (const [table, names] of Object.entries(tables)) {
      saved[table] = this.db.prepare('SELECT ' + names.join(', ') + ' FROM ' + table).all().map(row => names.map(name => row[name]));
    }
    this.snapshot.write({ version: 2, tables: saved });
  }

  transaction(fn) {
    if (this.inTransaction) return fn();
    this.db.exec('BEGIN IMMEDIATE');
    this.inTransaction = true;
    const changes = () => this.db.prepare('SELECT total_changes() AS n').get().n;
    const before = changes();
    try {
      const result = fn();
      // Persist before acknowledging the action or starting a network send.
      // A failed disk write rolls back the in-memory transaction.
      if (changes() !== before) this.persist();
      this.db.exec('COMMIT');
      return result;
    }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
    finally { this.inTransaction = false; }
  }

  getUser(userId) {
    const row = this.db.prepare('SELECT * FROM users WHERE user_id = ?').get(id(userId));
    if (!row) return { ...DEFAULT_USER };
    return { enabled: Boolean(row.enabled), frequency: row.frequency, delivery: row.delivery, pausedUntil: row.paused_until,
      dmBlocked: Boolean(row.dm_blocked), breakAt: row.break_at, lastTestAt: row.last_test_at };
  }

  ensureUser(userId) { this.transaction(() => this.db.prepare('INSERT OR IGNORE INTO users(user_id) VALUES (?)').run(id(userId))); }

  updateUser(userId, patch) {
    const entries = Object.entries(patch);
    for (const [key, value] of entries) {
      if (!Object.hasOwn(columns, key)) throw new TypeError('Unknown preference');
      if (['enabled', 'dmBlocked'].includes(key) && typeof value !== 'boolean') throw new TypeError('Expected boolean');
      if (key === 'frequency' && !['daily', 'session'].includes(value)) throw new RangeError('Invalid frequency');
      if (key === 'delivery' && !['normal', 'silent'].includes(value)) throw new RangeError('Invalid delivery');
      if (['pausedUntil', 'breakAt', 'lastTestAt'].includes(key) && !(value === null && key !== 'pausedUntil') && (!Number.isSafeInteger(value) || value < 0)) throw new RangeError('Invalid timestamp');
    }
    if (!entries.length) return this.getUser(userId);
    return this.transaction(() => {
      this.ensureUser(userId);
      this.db.prepare(`UPDATE users SET ${entries.map(([key]) => `${columns[key]} = ?`).join(', ')} WHERE user_id = ?`)
        .run(...entries.map(([, value]) => typeof value === 'boolean' ? Number(value) : value), id(userId));
      return this.getUser(userId);
    });
  }

  subscribe(userId, guildId) {
    id(guildId);
    return this.transaction(() => {
      this.ensureUser(userId);
      this.db.prepare('INSERT OR IGNORE INTO subscriptions(user_id, guild_id) VALUES (?, ?)').run(userId, guildId);
      return this.updateUser(userId, { enabled: true, pausedUntil: 0 });
    });
  }

  isSubscribed(userId, guildId) {
    return Boolean(this.db.prepare('SELECT 1 FROM subscriptions WHERE user_id = ? AND guild_id = ?').get(id(userId), id(guildId)));
  }

  unsubscribe(userId, guildId) {
    return this.transaction(() => {
      this.db.prepare('DELETE FROM subscriptions WHERE user_id = ? AND guild_id = ?').run(id(userId), id(guildId));
      if (!this.subscriptions(userId).length && this.getUser(userId).enabled) this.updateUser(userId, { enabled: false });
    });
  }

  subscriptions(userId) { return this.db.prepare('SELECT guild_id FROM subscriptions WHERE user_id = ?').all(id(userId)).map(row => row.guild_id); }

  bookmarks(userId) { return this.db.prepare('SELECT card_id FROM favorites WHERE user_id = ? ORDER BY card_id').all(id(userId)).map(row => row.card_id); }

  favorites(userId) { return this.bookmarks(userId).filter(cardId => dhikrById(cardId)); }

  // Namespaced bookmarks reuse the v1 encrypted snapshot without a migration.
  savedIdeas(userId) { return this.bookmarks(userId).filter(key => key.startsWith('idea:') && ideaById(key.slice(5))).map(key => key.slice(5)); }

  toggleFavorite(userId, cardId) {
    if (!dhikrById(cardId)) throw new RangeError('Unknown dhikr');
    this.toggleBookmark(userId, cardId);
    return this.favorites(userId);
  }

  toggleIdeaFavorite(userId, ideaId) {
    if (!ideaById(ideaId)) throw new RangeError('Unknown idea');
    this.toggleBookmark(userId, `idea:${ideaId}`);
    return this.savedIdeas(userId);
  }

  toggleBookmark(userId, cardId) {
    if (!dhikrById(cardId) && !(cardId.startsWith('idea:') && ideaById(cardId.slice(5)))) throw new RangeError('Unknown bookmark');
    this.transaction(() => {
      this.ensureUser(userId);
      const deleted = this.db.prepare('DELETE FROM favorites WHERE user_id = ? AND card_id = ?').run(userId, cardId);
      if (!deleted.changes) this.db.prepare('INSERT INTO favorites(user_id, card_id) VALUES (?, ?)').run(userId, cardId);
    });
  }

  claimReminder(userId, guildId, now) {
    return this.transaction(() => {
      const user = this.getUser(userId);
      if (!user.enabled || user.dmBlocked || user.pausedUntil > now || !this.isSubscribed(userId, guildId)) return null;
      const attempts = this.db.prepare('SELECT attempted_at FROM reminder_attempts WHERE user_id = ? AND attempted_at > ? ORDER BY attempted_at DESC')
        .all(userId, now - DAY);
      const interval = user.frequency === 'daily' ? DAY : 120 * MINUTE;
      if (attempts.length >= 3 || (attempts.length && now - attempts[0].attempted_at < interval)) return null;
      // Reserve before the network call. Ambiguous failures must not cause repeated DMs.
      this.db.prepare('INSERT INTO reminder_attempts(user_id, attempted_at) VALUES (?, ?)').run(userId, now);
      return user;
    });
  }

  dueBreaks(now) { return this.db.prepare('SELECT user_id, break_at FROM users WHERE break_at <= ?').all(now); }

  takeBreak(userId, expectedAt, now) {
    return this.transaction(() => {
    const user = this.getUser(userId);
    if (user.breakAt === null || user.breakAt !== expectedAt || user.breakAt > now) return null;
    this.updateUser(userId, { breakAt: null });
    // Skip missed reminders after downtime; never send a backlog.
    if (now - expectedAt > 5 * MINUTE || user.dmBlocked || user.pausedUntil > now) return null;
    return user;
    });
  }

  getPrayer(userId) {
    const row = this.db.prepare('SELECT settings FROM prayer_settings WHERE user_id = ?').get(id(userId));
    return row ? validatePrayer(JSON.parse(row.settings)) : structuredClone(DEFAULT_PRAYER);
  }

  setPrayer(userId, preferences) {
    validatePrayer(preferences);
    return this.transaction(() => {
      this.ensureUser(userId);
      this.db.prepare('INSERT INTO prayer_settings VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET settings = excluded.settings').run(id(userId), JSON.stringify(preferences));
      return this.getPrayer(userId);
    });
  }

  disablePrayer(userId) {
    const p = this.getPrayer(userId);
    if (p.enabled) this.setPrayer(userId, { ...p, enabled: false });
  }

  prayerUsers() { return this.db.prepare('SELECT user_id FROM prayer_settings').all().map(row => row.user_id); }

  claimPrayer(userId, expected, event, now) {
    if (!PRAYERS.some(([key]) => key === event.key) || !/^\d{4}-\d{2}-\d{2}$/.test(event.day) || !Number.isSafeInteger(event.at)) throw new RangeError('Invalid prayer event');
    return this.transaction(() => {
      const p = this.getPrayer(userId), user = this.getUser(userId);
      if (JSON.stringify(p) !== JSON.stringify(expected) || !p.enabled || user.dmBlocked || user.pausedUntil > event.at ||
          p.activatedAt > event.at || event.at > now || now - event.at > 2 * MINUTE) return null;
      // The day/prayer key survives edits and restarts; a travel cooldown also prevents rapid repeat sends.
      if (this.db.prepare('SELECT 1 FROM prayer_attempts WHERE user_id = ? AND prayer = ? AND attempted_at > ?').get(id(userId), event.key, now - 12 * 60 * MINUTE)) return null;
      const result = this.db.prepare('INSERT OR IGNORE INTO prayer_attempts VALUES (?, ?, ?, ?)').run(id(userId), event.day, event.key, now);
      return result.changes ? p : null;
    });
  }

  forget(userId) { this.transaction(() => this.db.prepare('DELETE FROM users WHERE user_id = ?').run(id(userId))); }
  prune(now) { this.transaction(() => {
    this.db.prepare('DELETE FROM reminder_attempts WHERE attempted_at <= ?').run(now - 2 * DAY);
    this.db.prepare('DELETE FROM prayer_attempts WHERE attempted_at <= ?').run(now - 7 * DAY);
  }); }

  getPanel(guildId) { return this.db.prepare('SELECT channel_id, message_id FROM guild_panels WHERE guild_id = ?').get(id(guildId)); }

  setPanel(guildId, channelId, messageId) {
    this.transaction(() => this.db.prepare('INSERT INTO guild_panels VALUES (?, ?, ?) ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id, message_id = excluded.message_id')
      .run(id(guildId), id(channelId), id(messageId)));
  }

  removeGuild(guildId) {
    this.transaction(() => {
      this.db.prepare('DELETE FROM subscriptions WHERE guild_id = ?').run(id(guildId));
      this.db.prepare('DELETE FROM guild_panels WHERE guild_id = ?').run(guildId);
    });
  }

  reconcileGuilds(guildIds) {
    const current = new Set(guildIds.map(id));
    this.transaction(() => {
      const stored = this.db.prepare('SELECT guild_id FROM subscriptions UNION SELECT guild_id FROM guild_panels').all();
      for (const row of stored) if (!current.has(row.guild_id)) this.removeGuild(row.guild_id);
    });
  }

  close() { if (this.closed) return; this.closed = true; this.db.close(); this.snapshot?.close(); }
}
