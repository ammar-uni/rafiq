const DAY_MS = 86_400_000;
const DISCORD_EPOCH = 1_420_070_400_000;
export const FEEDBACK_RETENTION_DAYS = 90;
export const FEEDBACK_RETENTION_MS = FEEDBACK_RETENTION_DAYS * DAY_MS;
const CHECK_INTERVAL = 3_600_000;
const CONTINUE_INTERVAL = 60_000;
const PAGE_SIZE = 100;
const DELETE_LIMIT = 20;
const BATCH_MS = 15_000;
const snowflake = value => typeof value === 'string' && /^\d{17,20}$/.test(value);
const timestamp = id => Number(BigInt(id) >> 22n) + DISCORD_EPOCH;
const pageFailure = () => Object.assign(new Error('Invalid feedback retention page'), { code: 'RAF_RETENTION_PAGE' });

export function isExpiredFeedback(message, { botId, channelId, guildId, cutoff }) {
  return Boolean(snowflake(message?.id) && message.channelId === channelId && message.guildId === guildId
    && message.author?.id === botId && !message.webhookId && message.type === 0
    && timestamp(message.id) < cutoff
    && /^(?:بلاغ للمراجعة|اقتراح لرفيق) · [a-f0-9]{24}\n/.test(message.content)
    && message.content.includes('\nنص الملاحظة:\n```\n')
    && message.content.endsWith('لا يتغير المحتوى تلقائيًا؛ راجع الملاحظة والدليل أولًا.'));
}

/** Bounded scans of only the configured review channel. No report text or identity is retained here. */
export class FeedbackRetention {
  constructor({ resolveChannel = null, botId, canRun = () => true, now = Date.now, onError = () => {}, onResult = () => {} } = {}) {
    Object.assign(this, { resolveChannel, botId, canRun, now, onError, onResult });
    this.before = null;
    this.nextAt = 0;
    this.task = null;
  }
  get enabled() { return typeof this.resolveChannel === 'function'; }
  tick() {
    if (!this.enabled || this.task || !this.canRun() || this.now() < this.nextAt) return Promise.resolve(null);
    this.task = Promise.resolve().then(() => this.sweep()).catch(error => {
      this.nextAt = this.now() + CONTINUE_INTERVAL;
      this.onError(error);
      return { ok: false };
    }).finally(() => { this.task = null; });
    return this.task;
  }
  async drain() { await this.task; }
  async sweep() {
    const now = this.now(), cutoff = now - FEEDBACK_RETENTION_MS;
    if (!Number.isSafeInteger(now) || cutoff <= DISCORD_EPOCH) throw pageFailure();
    const threshold = (BigInt(cutoff - DISCORD_EPOCH) << 22n).toString();
    const before = this.before && BigInt(this.before) < BigInt(threshold) ? this.before : threshold;
    const channel = await this.resolveChannel();
    if (!this.canRun()) return null;
    const page = await channel.messages.fetch({ before, limit: PAGE_SIZE, cache: false });
    const messages = [...page.values()];
    if (messages.length > PAGE_SIZE || messages.some(message => !snowflake(message.id)
      || BigInt(message.id) >= BigInt(before) || message.channelId !== channel.id || message.guildId !== channel.guildId)
      || new Set(messages.map(message => message.id)).size !== messages.length) throw pageFailure();
    messages.sort((a, b) => BigInt(a.id) > BigInt(b.id) ? -1 : 1);
    const startedAt = this.now();
    let deleted = 0, inspected = 0;
    for (const message of messages) {
      if (!this.canRun() || deleted >= DELETE_LIMIT || this.now() - startedAt >= BATCH_MS) break;
      if (isExpiredFeedback(message, { botId: this.botId(), channelId: channel.id, guildId: channel.guildId, cutoff })) {
        try { await channel.messages.delete(message.id); deleted++; }
        catch (error) { if (error?.code !== 10008) throw error; }
      }
      // Advance only after deletion succeeds (or Discord confirms it is already absent).
      this.before = message.id;
      inspected++;
    }
    const complete = messages.length < PAGE_SIZE && inspected === messages.length;
    if (complete) this.before = null;
    this.nextAt = this.now() + (complete ? CHECK_INTERVAL : CONTINUE_INTERVAL);
    const result = { ok: true, deleted, inspected, complete };
    this.onResult(result);
    return result;
  }
}
