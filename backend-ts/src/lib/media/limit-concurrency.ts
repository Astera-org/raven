export type ConcurrencyLimit = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * Returns a function that runs the tasks it's given with at most
 * `concurrency` in flight at once, queueing the rest in call order.
 */
export function _limitConcurrency(concurrency: number): ConcurrencyLimit {
  let active = 0;
  const waiting: (() => void)[] = [];

  return async function limit<T>(task: () => Promise<T>): Promise<T> {
    if (active < concurrency) {
      active++;
    } else {
      // The finishing task hands its slot over, so `active` stays the same.
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}
