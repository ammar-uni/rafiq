import { serverEvents } from './server-config.mjs';
import { serverPostPayload } from './server-messages.mjs';

export class ServerScheduler {
  constructor({ store, queue, send, canSend = () => true, now = Date.now, calculate = serverEvents, onError = () => {} }) {
    Object.assign(this, { store, queue, send, canSend, now, calculate, onError });
    this.cache = new Map();
  }
  async tick() {
    if (!this.canSend()) return;
    const guildIds = this.store.postingGuilds();
    for (const key of this.cache.keys()) if (!guildIds.includes(key)) this.cache.delete(key);
    for (const guildId of guildIds) {
      if (!this.canSend()) return;
      await this.queue.run(`guild:${guildId}`, async () => {
        if (!this.canSend()) return;
        const p = this.store.getServer(guildId), now = this.now();
        if (!p.enabled) { this.cache.delete(guildId); return; }
        try {
          const key = JSON.stringify(p) + new Date(now).toISOString().slice(0, 10);
          if (this.cache.get(guildId)?.key !== key) this.cache.set(guildId, { key, events: this.calculate(p, now) });
          for (const event of this.cache.get(guildId).events) {
            if (!this.canSend()) return;
            if (event.at > now || now - event.at > 120000) continue;
            // The encrypted reservation precedes all network calls. An ambiguous
            // timeout must never result in repeating a public post or role ping.
            const claimed = this.store.claimServer(guildId, p, event, this.now());
            if (!claimed) continue;
            try {
              await this.send(guildId, claimed, serverPostPayload(event, claimed.roleId, claimed.mentionEveryone), `server:${guildId}:${event.id}`);
              if (claimed.issue && JSON.stringify(this.store.getServer(guildId)) === JSON.stringify(claimed)) this.store.setServer(guildId, { ...claimed, issue: null });
            }
            catch (error) {
              const permanent = error.code === 'RAF_SERVER_TARGET' || [50001, 50013, 10003, 10004, 10011].includes(Number(error.code));
              // GuildDelete can arrive during the send. Never recreate settings
              // that were deleted, or replace a newer configuration.
              if (JSON.stringify(this.store.getServer(guildId)) === JSON.stringify(claimed)) this.store.setServer(guildId, { ...claimed, enabled: permanent ? false : claimed.enabled, issue: permanent ? 'permissions' : 'delivery' });
              this.onError(error);
              return;
            }
          }
        } catch (error) { this.onError(error); }
      });
    }
  }
}
