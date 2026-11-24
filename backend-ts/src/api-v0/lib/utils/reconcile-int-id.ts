type StripIntSuffix<K extends string> = K extends `${infer Prefix}_int`
  ? Prefix extends `${string}id`
    ? Prefix
    : K
  : K;

type ReconcileIntIdKeys<T> = {
  [K in keyof T as StripIntSuffix<K & string>]: T[K];
};

/**
 * Since we've migrated the database IDs to have an `_int` suffix, but the API
 * still needs to return `id`, this function will reconcile the two by
 * converting all keys ending in `_int` to their corresponding key without the
 * suffix.
 *
 * This function does not modify the original object; it returns a new object
 * with the reconciled keys.
 *
 * This is meant to be a stopgap until we migrate fully to camelCase on the API
 *
 * @param obj - An object that may contain keys ending with `_int`.
 * @returns A new object with keys ending in `_int` replaced by their
 *          corresponding key without the suffix.
 */
export function reconcileIntIdToId<T extends object>(
  obj: T
): ReconcileIntIdKeys<T> {
  const result: Record<string, unknown> = {};
  const idToSkip = new Set<string>();
  for (const key of Object.keys(obj)) {
    const match = key.match(/^(\w*id)_int$/);

    /**
     * If we have both `comments_id_int` and `comments_id` we want to ensure we
     * overwrite the `comments_id` value with `comments_id_int`.
     */
    if (match) {
      idToSkip.add(match[1]!);
    }
    if (!match && idToSkip.has(key)) {
      continue;
    }

    result[match ? match[1]! : key] = (obj as Record<string, unknown>)[key];
  }
  return result as ReconcileIntIdKeys<T>;
}

/**
 * Since we've migrated the database IDs to have an `_int` suffix, but the API
 * still needs to return `id`, this function will reconcile the two by
 * converting all keys ending in `_int` to their corresponding key without the
 * suffix.
 *
 * This function does not modify the original objects; it returns a new array of
 * new objects with the reconciled keys.
 *
 * This is meant to be a stopgap until we migrate fully to camelCase on the API
 *
 * @param objects - An array of objects that may contain keys ending with `_int`
 * @returns A new array of objects with keys ending in `_int` replaced by their
 *          corresponding key without the suffix.
 */
export function reconcileIntIdsToId<T extends object>(
  objects: T[]
): ReconcileIntIdKeys<T>[] {
  return objects.map((o) => reconcileIntIdToId(o));
}
