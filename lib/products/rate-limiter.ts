type RateLimiterState = {
  lastRunAt: number;
};

export function createRateLimiter(minIntervalMs: number) {
  const state: RateLimiterState = {
    lastRunAt: 0
  };

  return async function schedule<T>(task: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const waitMs = Math.max(0, state.lastRunAt + minIntervalMs - now);

    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    state.lastRunAt = Date.now();
    return task();
  };
}
