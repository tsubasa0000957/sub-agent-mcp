import { describe, expect, it } from "vitest";
import { Semaphore } from "../../src/infra/concurrency.js";
import {
  RateLimitExceededError,
  TokenBucketRateLimiter,
} from "../../src/infra/rateLimit.js";

describe("execution admission controls", () => {
  it("rejects acquisition when the bounded semaphore queue is full", async () => {
    const semaphore = new Semaphore(1, 1);
    const signal = new AbortController().signal;
    const releaseFirst = await semaphore.acquire(signal);
    const second = semaphore.acquire(signal);

    await expect(semaphore.acquire(signal)).rejects.toMatchObject({ name: "OverloadedError" });
    releaseFirst();
    const releaseSecond = await second;
    releaseSecond();
  });

  it("refills a token-bucket budget over its configured interval", () => {
    let now = 0;
    const limiter = new TokenBucketRateLimiter(4, 60_000, () => now);
    limiter.consume(4);
    expect(() => limiter.consume(1)).toThrow(RateLimitExceededError);

    now = 15_000;
    expect(() => limiter.consume(1)).not.toThrow();
  });
});
