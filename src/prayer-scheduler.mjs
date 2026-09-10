import { prayerDate, prayerWindow } from './prayer-times.mjs';
import { prayerReminderPayload } from './messages.mjs';

export class PrayerScheduler {
  constructor({ store, queue, deliver, canSend = () => true, now = Date.now, calculate = prayerWindow, sounds = [], onError = () => {} }) {
    Object.assign(this, { store, queue, deliver, canSend, now, calculate, sounds, onError });
    this.cache = new Map();
  }
  forget(userId) { this.cache.delete(userId); }
  async tick() {
    const users = this.store.prayerUsers();
    const present = new Set(users);
    for (const id of this.cache.keys()) if (!present.has(id)) this.cache.delete(id);
    for (const userId of users) {
      if (!this.canSend()) return;
      await this.queue.run(userId, async () => {
        if (!this.canSend()) return;
        const p = this.store.getPrayer(userId), user = this.store.getUser(userId), now = this.now();
        if (!p.enabled || user.dmBlocked || user.pausedUntil > now) { this.forget(userId); return; }
        const signature = prayerDate(now, p.city.timezone) + JSON.stringify(p);
        let entry = this.cache.get(userId);
        if (entry?.signature !== signature) {
          try { entry = { signature, events: this.calculate(p, now) }; }
          catch (error) { entry = { signature, events: [] }; this.onError(error); }
          this.cache.set(userId, entry);
        }
        for (const event of entry.events) {
          if (!this.canSend()) return;
          const at = this.now();
          if (event.at > at || at - event.at > 120000) continue;
          const claimed = this.store.claimPrayer(userId, p, event, at);
          if (claimed) {
            const sound = this.sounds.find(sound => sound.id === claimed.soundId) || null;
            await this.deliver(userId, prayerReminderPayload(claimed, event, sound), `prayer:${userId}:${event.day}:${event.key}`);
          }
        }
      });
    }
  }
}
