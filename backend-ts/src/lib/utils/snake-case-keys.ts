import { snakeCase } from "change-case";

/**
 * A type utility to convert a `camelCase` string to `snake_case`.
 */
export type CamelToSnake<S extends string> =
  S extends `${infer First}${infer Rest}`
    ? Rest extends Uncapitalize<Rest>
      ? `${Lowercase<First>}${CamelToSnake<Rest>}`
      : `${Lowercase<First>}_${CamelToSnake<Rest>}`
    : S;

/**
 * A type utility to convert all keys in an object to `snake_case`.
 */
export type SnakeCaseKeys<T> = {
  [K in keyof T as K extends string ? CamelToSnake<K> : K]: T[K];
};

/**
 * The API still needs to return `snake_case` keys, but the drizzle API uses
 * `camelCase` keys. This function will convert all keys in an object to
 * `snake_case`.
 *
 * @param obj - An object that may contain keys in `camelCase`.
 * @returns - The same object with all keys converted to `snake_case`.
 */
export function snakeCaseKeys<T extends object>(obj: T): SnakeCaseKeys<T> {
  const result = Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [snakeCase(k), v])
  );
  return result as SnakeCaseKeys<T>;
}
