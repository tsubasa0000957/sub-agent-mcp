interface Waiter {
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
  signal: AbortSignal;
  onAbort: () => void;
}

export class Semaphore {
  private active = 0;
  private readonly waiters: Waiter[] = [];

  constructor(
    private readonly capacity: number,
    private readonly maxQueue = Number.POSITIVE_INFINITY,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error("Semaphore capacity must be positive");
    if (maxQueue !== Number.POSITIVE_INFINITY && (!Number.isInteger(maxQueue) || maxQueue < 0)) {
      throw new Error("Semaphore queue limit must be a non-negative integer");
    }
  }

  async acquire(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) throw abortError(signal.reason);
    if (this.active < this.capacity) {
      this.active += 1;
      return this.releaseOnce();
    }
    if (this.waiters.length >= this.maxQueue) throw new OverloadedError();

    return new Promise<() => void>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        signal,
        onAbort: () => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(abortError(signal.reason));
        },
      };
      signal.addEventListener("abort", waiter.onAbort, { once: true });
      this.waiters.push(waiter);
    });
  }

  private releaseOnce(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const waiter = this.waiters.shift();
      if (waiter === undefined) {
        this.active -= 1;
        return;
      }
      waiter.signal.removeEventListener("abort", waiter.onAbort);
      waiter.resolve(this.releaseOnce());
    };
  }
}

export class OverloadedError extends Error {
  constructor() {
    super("OpenAI execution queue is full; retry later");
    this.name = "OverloadedError";
  }
}

function abortError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  const error = new Error("Operation aborted");
  error.name = "AbortError";
  return error;
}
