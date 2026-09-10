/** Memory-only preview adapter. No storage, Discord connection, or personal data. */
export class PreviewStore {
  constructor() { this.reset(); }
  reset() {
    this.user = { enabled: false, frequency: 'daily', delivery: 'silent', pausedUntil: 0, dmBlocked: false, breakAt: null, lastTestAt: null };
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
  getPrayer() { return structuredClone(this.prayer || { city: null, method: 'UmmAlQura', asr: 'Shafi', highLatitude: 'MiddleOfTheNight', adjustments: [0, 0, 0, 0, 0], ramadanIsha: false, enabled: false, activatedAt: 0, delivery: 'silent', soundId: null }); }
  setPrayer(id, p) { this.prayer = structuredClone(p); return this.getPrayer(); }
  disablePrayer() { if (this.prayer) this.prayer.enabled = false; }
}
