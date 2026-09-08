// Serialize sends and preference changes for the same user, without blocking others.
export class SerialQueue {
  constructor() { this.tails = new Map(); }
  run(key, work) {
    const previous = this.tails.get(key) || Promise.resolve();
    const result = previous.then(work);
    const settled = result.catch(() => {});
    this.tails.set(key, settled);
    settled.then(() => { if (this.tails.get(key) === settled) this.tails.delete(key); });
    return result;
  }
  async drain() { await Promise.all(this.tails.values()); }
}
