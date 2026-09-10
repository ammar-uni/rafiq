import { MINUTE } from './store.mjs';
import { reminderPayload, breakReminderPayload } from './messages.mjs';

export const SESSION_MINIMUM = 5 * MINUTE;
export const LEAVE_GRACE = 45_000;

export class ReminderEngine {
  constructor({ store, queue, sendDM, now = Date.now, canSend = () => true, isInVoice = () => false, onError = () => {}, prayers = null }) {
    Object.assign(this, { store, queue, sendDM, now, canSend, isInVoice, onError });
    this.sessions = new Map();
    this.pending = new Map();
    this.running = false;
    this.prayers = prayers;
  }
  key(userId, guildId) { return `${guildId}:${userId}`; }
  tracks(userId, guildId) {
    const user = this.store.getUser(userId);
    return user.enabled && !user.dmBlocked && user.pausedUntil <= this.now() && this.store.isSubscribed(userId, guildId);
  }
  join({ userId, guildId, channelId, hasCompany = false }) {
    const key = this.key(userId, guildId);
    const previous = this.sessions.get(key) || this.pending.get(key)?.session;
    // A reconnect or a join in another server cancels a pending farewell.
    for (const [entryKey, entry] of this.pending) if (entry.session.userId === userId) this.pending.delete(entryKey);
    if (!this.tracks(userId, guildId)) return;
    this.sessions.set(key, { userId, guildId, channelId, startedAt: previous?.startedAt ?? this.now(), hasCompany: hasCompany || Boolean(previous?.hasCompany) });
  }
  markCompany(guildId, channelId) {
    for (const session of this.sessions.values()) if (session.guildId === guildId && session.channelId === channelId) session.hasCompany = true;
  }
  leave({ userId, guildId }) {
    const key = this.key(userId, guildId);
    const session = this.sessions.get(key);
    this.sessions.delete(key);
    if (!session || !session.hasCompany || this.now() - session.startedAt < SESSION_MINIMUM) return;
    this.pending.set(key, { session, due: this.now() + LEAVE_GRACE });
  }
  discard(userId, guildId) {
    const key = this.key(userId, guildId);
    this.sessions.delete(key);
    this.pending.delete(key);
  }
  cancelUser(userId) {
    this.prayers?.forget(userId);
    for (const [key, session] of this.sessions) if (session.userId === userId) this.sessions.delete(key);
    for (const [key, entry] of this.pending) if (entry.session.userId === userId) this.pending.delete(key);
  }
  removeGuild(guildId) {
    for (const [key, session] of this.sessions) if (session.guildId === guildId) this.sessions.delete(key);
    for (const [key, entry] of this.pending) if (entry.session.guildId === guildId) this.pending.delete(key);
  }
  clearVoice() { this.sessions.clear(); this.pending.clear(); }

  async deliver(userId, payload, nonce) {
    try { await this.sendDM(userId, payload, nonce); }
    catch (error) {
      if (Number(error.code) === 50007) {
        this.store.updateUser(userId, { dmBlocked: true, breakAt: null });
        this.cancelUser(userId);
      }
      this.onError(error);
    }
  }

  async tick() {
    if (this.running || !this.canSend()) return;
    this.running = true;
    try {
      for (const [key, entry] of this.pending) {
        if (entry.due > this.now()) continue;
        await this.queue.run(entry.session.userId, async () => {
          if (this.pending.get(key) !== entry || !this.canSend()) return;
          this.pending.delete(key);
          const { userId, guildId } = entry.session;
          if (this.now() - entry.due > 5 * MINUTE) return;
          if (this.isInVoice(userId) || [...this.sessions.values()].some(session => session.userId === userId)) return;
          const user = this.store.claimReminder(userId, guildId, this.now());
          if (user) await this.deliver(userId, reminderPayload({ silent: user.delivery === 'silent' }), `majlis:${userId}:${entry.due}`);
        });
      }
      for (const due of this.store.dueBreaks(this.now())) {
        await this.queue.run(due.user_id, async () => {
          if (!this.canSend()) return;
          const user = this.store.takeBreak(due.user_id, due.break_at, this.now());
          if (user) await this.deliver(due.user_id, breakReminderPayload({ silent: user.delivery === 'silent' }), `break:${due.user_id}:${due.break_at}`);
        });
      }
      await this.prayers?.tick();
      this.store.prune(this.now());
    } finally { this.running = false; }
  }
}
