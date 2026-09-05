export class TokenBucketRateLimiter {
  private available: number;
  private lastRefillMs: number;

  constructor(
    private readonly capacity: number,
    private readonly refillIntervalMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error("Rate limit capacity must be a positive integer");
    }
    if (!Number.isFinite(refillIntervalMs) || refillIntervalMs <= 0) {
      throw new Error("Rate limit refill interval must be positive");
    }
    this.available = capacity;
    this.lastRefillMs = now();
  }

  consume(cost: number): void {
    if (!Number.isInteger(cost) || cost < 1 || cost > this.capacity) {
      throw new Error("Rate limit cost must be a positive integer within capacity");
    }
    this.refill();
    if (this.available < cost) throw new RateLimitExceededError();
    this.available -= cost;
  }

  private refill(): void {
    const current = this.now();
    const elapsed = Math.max(0, current - this.lastRefillMs);
    this.lastRefillMs = current;
    this.available = Math.min(
      this.capacity,
      this.available + (elapsed * this.capacity) / this.refillIntervalMs,
    );
  }
}

export class RateLimitExceededError extends Error {
  constructor() {
    super("Global OpenAI request budget exceeded; retry later");
    this.name = "RateLimitExceededError";
  }
}
