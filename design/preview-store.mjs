/** Memory-only preview adapter. No storage, Discord connection, or personal data. */
import { DEFAULT_PRAYER, DEFAULT_OCCASIONS, stopDaily } from '../src/prayer-config.mjs';
export class PreviewStore {
  constructor() { this.reset(); }
  reset() {
    this.user = { enabled: false, frequency: 'session', delivery: 'normal', pausedUntil: 0, dmBlocked: false, breakAt: null, lastTestAt: null, seasonalAt: null };
    this.guilds = new Set(); this.cards = new Set(); this.ideas = new Set();
    this.prayer = null;
  }
  getUser() { return { ...this.user }; }
  updateUser(id, patch) { Object.assign(this.user, patch); return this.getUser(); }
  subscriptions() { return [...this.guilds]; }
  isSubscribed(id, guild) { return this.guilds.has(guild); }
  subscribe(id, guild) { this.guilds.add(guild); return this.updateUser(id, { enabled: true, pausedUntil: 0 }); }
  unsubscribe(id, guild) { this.guilds.delete(guild); if (!this.guilds.size) this.user.enabled = false; }
  favorites() { return [...this.cards]; }
  savedIdeas() { return [...this.ideas]; }
  toggleFavorite(id, card) { this.cards.has(card) ? this.cards.delete(card) : this.cards.add(card); }
  toggleIdeaFavorite(id, idea) { this.ideas.has(idea) ? this.ideas.delete(idea) : this.ideas.add(idea); }
  forget() { this.reset(); }
  transaction(fn) { return fn(); }
  getPrayer() { return structuredClone(this.prayer || DEFAULT_PRAYER); }
  setPrayer(id, p) { this.prayer = structuredClone(p); return this.getPrayer(); }
  disablePrayer(id, all = false) { if (this.prayer) { this.prayer.enabled = false; if (all) { this.prayer.occasions = { ...DEFAULT_OCCASIONS }; this.prayer.daily = stopDaily(this.prayer.daily); } } }
}
