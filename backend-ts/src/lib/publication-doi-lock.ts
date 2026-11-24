import { withNamedLock } from "./named-lock.js";

export class DoiLockTimeoutError extends Error {
  constructor(publicationId: string) {
    super(`Could not acquire DOI mint lock for publication ${publicationId}`);
    this.name = "DoiLockTimeoutError";
  }
}

/**
 * Serializes the DOI read-mint-write critical section per publication using
 * a MySQL named lock (see `withNamedLock`), so two concurrent requests for
 * the same publication can't both observe "no DOI yet" and each mint a
 * separate, un-reconciled DataCite DOI. The lock is held for the entire
 * duration of `fn`, including any external DataCite calls it makes.
 */
export async function withPublicationDoiLock<T>(
  publicationId: string,
  fn: () => Promise<T>,
  timeoutSeconds?: number
): Promise<T> {
  return withNamedLock(`doi:publication:${publicationId}`, fn, {
    timeoutSeconds,
    onTimeout: () => new DoiLockTimeoutError(publicationId),
  });
}
