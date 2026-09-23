import { seasonalWindow } from './seasonal-times.mjs';
import { seasonalReminderPayload } from './messages.mjs';

export class SeasonalScheduler {
  constructor({ store, queue, deliver, canSend = () => true, now = Date.now, calculate = seasonalWindow, onError = () => {} }) {
    Object.assign(this, { store, queue, deliver, canSend, now, calculate, onError });
    this.day = null;
    this.events = [];
  }
  async tick() {
    if (!this.canSend()) return;
    const now = this.now(), day = new Date(now).toISOString().slice(0, 10);
    if (this.day !== day) {
      this.day = day;
      try { this.events = this.calculate(now); }
      catch (error) { this.events = []; this.onError(error); }
    }
    const due = this.events.filter(event => event.at <= now && now - event.at <= 120000);
    if (!due.length) return;
    for (const userId of this.store.seasonalUsers()) {
      if (!this.canSend()) return;
      await this.queue.run(userId, async () => {
        for (const event of due) {
          if (!this.canSend()) return;
          const user = this.store.claimSeasonal(userId, event, this.now());
          if (user) await this.deliver(userId, seasonalReminderPayload(event, { silent: user.delivery === 'silent' }), `seasonal:${userId}:${event.id}`);
        }
      });
    }
  }
}
