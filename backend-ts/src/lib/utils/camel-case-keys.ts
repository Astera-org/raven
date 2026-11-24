import { camelCase } from "change-case";

/**
 * A type utility to convert a `snake_case` string to `camelCase`.
 */
export type SnakeToCamel<S extends string> =
  S extends `${infer Head}_${infer Tail}`
    ? `${Head}${Capitalize<SnakeToCamel<Tail>>}`
    : S;

/**
 * A type utility to convert all keys in an object to `camelCase`.
 */
export type CamelCaseKeys<T> = {
  [K in keyof T as K extends string ? SnakeToCamel<K> : K]: T[K];
};

/**
 * The API returns `snake_case` keys, but the drizzle API uses `camelCase`
 * keys. This function will convert all keys in an object to `camelCase`.
 *
 * @param obj - An object that may contain keys in `snake_case`.
 * @returns - The same object with all keys converted to `camelCase`.
 */
export function camelCaseKeys<T extends Record<string, unknown>>(
  obj: T
): CamelCaseKeys<T> {
  const result = Object.fromEntries(
    Reflect.ownKeys(obj)
      .filter((key) => Object.prototype.propertyIsEnumerable.call(obj, key))
      .map((key) => [
        typeof key === "string" ? camelCase(key) : key,
        obj[key as keyof T],
      ])
  );
  return result as CamelCaseKeys<T>;
}
