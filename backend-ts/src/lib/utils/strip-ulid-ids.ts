type StripUlidSuffix<K extends string> = K extends `${string}_ulid` ? never : K;

type StripUlidKeys<T> = {
  [K in keyof T as StripUlidSuffix<K & string>]: T[K];
};

/**
 * Since the migration from the previous PR, we still want (currently) to strip
 * ULID ids from the response for now, but as they have been renamed to `id` we
 * actually strip these out first before reconciling the `*id_int` to `*id`.
 */
export function stripUlidIds<T extends object>(obj: T): StripUlidKeys<T> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (key === "ror_id" || (key !== "id" && !key.endsWith("_id"))) {
      result[key] = (obj as Record<string, unknown>)[key];
    }
  }
  return result as StripUlidKeys<T>;
}

export function stripUlidIdsFromArray<T extends object>(
  objects: T[]
): StripUlidKeys<T>[] {
  return objects.map((o) => stripUlidIds(o));
}
