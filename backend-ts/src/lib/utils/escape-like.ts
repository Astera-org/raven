/** Escape SQL LIKE wildcards (`\`, `%`, `_`) in a user-supplied string. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&");
}
