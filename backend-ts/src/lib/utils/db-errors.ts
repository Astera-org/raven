function isDuplicateEntryDriverError(
  error: unknown,
  key: string | undefined
): boolean {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    error.code !== "ER_DUP_ENTRY"
  ) {
    return false;
  }
  if (key === undefined) return true;
  // MySQL reports the violated key as e.g. `for key 'publications.publications_doi_unique'`.
  return (
    "sqlMessage" in error &&
    typeof error.sqlMessage === "string" &&
    error.sqlMessage.includes(`${key}'`)
  );
}

const LOCK_CONFLICT_CODES = new Set([
  "ER_LOCK_WAIT_TIMEOUT",
  "ER_LOCK_DEADLOCK",
]);

function isLockConflictDriverError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    LOCK_CONFLICT_CODES.has(error.code)
  );
}

/**
 * True when MySQL gave up on a statement waiting for a row lock, because the
 * wait passed `innodb_lock_wait_timeout` or would have deadlocked. Either way
 * the transaction is rolled back and can be retried. Checks the error and its
 * `.cause`, like `isDuplicateEntryError`.
 */
export function isLockConflictError(error: unknown): boolean {
  if (isLockConflictDriverError(error)) return true;
  const cause =
    typeof error === "object" && error !== null && "cause" in error
      ? error.cause
      : undefined;
  return isLockConflictDriverError(cause);
}

/**
 * True for a MySQL unique-constraint violation (driver error code `ER_DUP_ENTRY`),
 * optionally only when the violated unique key is named `key`.
 *
 * drizzle-orm wraps driver errors in a `DrizzleQueryError`, which nests the
 * original driver error (and its `.code`) at `.cause` rather than exposing it
 * directly, so both the error and its cause are checked.
 */
export function isDuplicateEntryError(error: unknown, key?: string): boolean {
  if (isDuplicateEntryDriverError(error, key)) return true;
  const cause =
    typeof error === "object" && error !== null && "cause" in error
      ? error.cause
      : undefined;
  return isDuplicateEntryDriverError(cause, key);
}
