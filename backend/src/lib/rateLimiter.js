/**
 * Token bucket keyed by an arbitrary string (upstream host, uid, IP).
 * `take()` resolves when a token is available, so callers queue instead of failing.
 */
export class KeyedTokenBucket {
  constructor({ perSecond, burst }) {
    this.rate = perSecond;
    this.burst = burst;
    this.buckets = new Map();
  }

  #refill(key) {
    const now = Date.now();
    const b = this.buckets.get(key) ?? { tokens: this.burst, at: now };
    b.tokens = Math.min(this.burst, b.tokens + ((now - b.at) / 1000) * this.rate);
    b.at = now;
    this.buckets.set(key, b);
    return b;
  }

  /** Returns 0 if a token was taken, otherwise ms until one is available. */
  tryTake(key) {
    const b = this.#refill(key);
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return 0;
    }
    return Math.ceil(((1 - b.tokens) / this.rate) * 1000);
  }

  async take(key, { maxWaitMs = 15_000 } = {}) {
    for (;;) {
      const wait = this.tryTake(key);
      if (wait === 0) return;
      if (wait > maxWaitMs) throw new Error(`rate limit wait ${wait}ms exceeds ${maxWaitMs}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}
