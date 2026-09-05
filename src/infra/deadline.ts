export function deadlineSignal(signal: AbortSignal, timeoutMs: number): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, timeoutMs))]);
}

export function isTimeoutOrAbort(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError" || /abort|timeout/i.test(error.message))
  );
}
