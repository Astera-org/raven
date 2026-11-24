import { getLockPool } from "#src/db/index.js";
import { logger } from "./logger.js";

const DEFAULT_LOCK_TIMEOUT_SECONDS = 10;

export class NamedLockTimeoutError extends Error {
  constructor(public readonly lockName: string) {
    super(`Could not acquire lock ${lockName}`);
    this.name = "NamedLockTimeoutError";
  }
}

/**
 * Runs `fn` while holding the MySQL named lock `lockName` (GET_LOCK), so
 * requests that take the same lock run one at a time, across processes.
 * Throws `onTimeout()` (by default a `NamedLockTimeoutError`) when the lock
 * isn't acquired within `timeoutSeconds`.
 *
 * Named locks are session-scoped, so acquire and release must share one
 * connection -- this checks out a connection from the separate lock pool
 * (see `getLockPool`) and holds it for the entire duration of `fn`. `fn`
 * itself should keep using `getDb()` as normal, so callers waiting for the
 * lock never take connections the lock holder needs.
 */
export async function withNamedLock<T>(
  lockName: string,
  fn: () => Promise<T>,
  {
    timeoutSeconds = DEFAULT_LOCK_TIMEOUT_SECONDS,
    onTimeout = () => new NamedLockTimeoutError(lockName),
  }: { timeoutSeconds?: number; onTimeout?: () => Error } = {}
): Promise<T> {
  const conn = await getLockPool().getConnection();
  // Track acquisition ourselves rather than relying on RELEASE_LOCK's
  // built-in "only releases a lock this session actually holds" guard --
  // that way a timed-out caller never even issues a RELEASE_LOCK for a lock
  // it doesn't own, instead of depending on MySQL to no-op it safely.
  let acquired = false;
  try {
    const [rows] = await conn.query("SELECT GET_LOCK(?, ?) AS acquired", [
      lockName,
      timeoutSeconds,
    ]);
    acquired =
      (rows as unknown as Array<{ acquired: number | null }>)[0]?.acquired ===
      1;
    if (!acquired) {
      throw onTimeout();
    }
    return await fn();
  } finally {
    if (acquired) {
      try {
        await conn.query("SELECT RELEASE_LOCK(?)", [lockName]);
      } catch (e) {
        logger.error({ err: e, lockName }, "Failed to release named lock");
      }
    }
    conn.release();
  }
}
