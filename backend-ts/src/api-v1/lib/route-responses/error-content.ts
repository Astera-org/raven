import { z } from "@hono/zod-openapi";
import { type SchemaObject } from "openapi31-ts";
import { type ZodObject, type ZodOptional, type ZodString } from "zod";

export type ResponseErrorSchemaType = ZodObject<{ message: ZodString }>;
export type OptionalResponseErrorSchemaType =
  ZodOptional<ResponseErrorSchemaType>;

/** `true` when `T` is a union, e.g. `"auth" | "org"`; `false` for a single key like `"auth"`. */
type IsUnion<T extends string | number, U = T> = T extends string | number
  ? [U] extends [T]
    ? false
    : true
  : never;

type ErrorKeyZodType<TKeys extends string | number> =
  true extends IsUnion<TKeys>
    ? OptionalResponseErrorSchemaType
    : ResponseErrorSchemaType;

export function errorContent(): {
  "application/json": {
    schema: z.ZodObject<{
      type: z.ZodLiteral<"application_error">;
      errors: z.ZodObject<{ root: ResponseErrorSchemaType }>;
    }>;
  };
};
export function errorContent<TKeys extends string | number>(
  keys: TKeys
): {
  "application/json": {
    schema: z.ZodObject<{
      type: z.ZodLiteral<"application_error">;
      errors: z.ZodObject<Record<TKeys, ResponseErrorSchemaType>>;
    }>;
  };
};
export function errorContent<TKeys extends string | number>(
  keys: [TKeys]
): {
  "application/json": {
    schema: z.ZodObject<{
      type: z.ZodLiteral<"application_error">;
      errors: z.ZodObject<Record<TKeys, ResponseErrorSchemaType>>;
    }>;
  };
};
export function errorContent<TKeys extends string | number>(
  keys: [TKeys, TKeys, ...TKeys[]]
): {
  "application/json": {
    schema: z.ZodObject<{
      type: z.ZodLiteral<"application_error">;
      errors: z.ZodObject<Record<TKeys, OptionalResponseErrorSchemaType>>;
    }>;
  };
};
export function errorContent<TKeys extends string | number>(
  ...keys: [TKeys, TKeys, ...TKeys[]]
): {
  "application/json": {
    schema: z.ZodObject<{
      type: z.ZodLiteral<"application_error">;
      errors: z.ZodObject<Record<TKeys, OptionalResponseErrorSchemaType>>;
    }>;
  };
};
export function errorContent<TKeys extends string | number>(
  keys: Record<TKeys, Partial<SchemaObject>>
): {
  "application/json": {
    schema: z.ZodObject<{
      type: z.ZodLiteral<"application_error">;
      errors: z.ZodObject<Record<TKeys, ErrorKeyZodType<TKeys>>>;
    }>;
  };
};
/**
 * Builds the `content` for a v1 error response in `createV1Route`, typed so
 * handlers can only return the declared keys:
 * `{ type: "application_error", errors: { [key]: { message: string } } }`.
 *
 * Keys can be passed as a single key, an array, varargs, or an object whose
 * values add OpenAPI metadata (e.g. a description) to each key. With no
 * arguments, the single required key is `root`.
 *
 * If only one key (whether by string, array, or object) is passed then that key
 * will be **required**, and for _all other cases_ all keys will be **optional**.
 *
 * ### Required key examples:
 *
 * ```ts
 * errorContent("auth");
 * errorContent(["auth"]);
 * // OpenAPI description
 * errorContent({auth: {description: "Authorization required"}})
 * ```
 *
 * ### Optional key examples:
 *
 * ```ts
 * errorContent("title", "subtitle");
 * errorContent(["title", "subtitle"]);
 * // OpenAPI description
 * errorContent({
 *   title: {description: "Pub title error"},
 *   subtitle: {description: "Pub subtitle error"},
 * })
 * ```
 */
export function errorContent<TKeys extends string | number>(
  keys?: TKeys | TKeys[] | Record<TKeys, Partial<SchemaObject>>,
  ...keysRest: TKeys[]
):
  | {
      "application/json": {
        schema: z.ZodObject<{
          type: z.ZodLiteral<"application_error">;
          errors: z.ZodObject<Record<TKeys, OptionalResponseErrorSchemaType>>;
        }>;
      };
    }
  | {
      "application/json": {
        schema: z.ZodObject<{
          type: z.ZodLiteral<"application_error">;
          errors: z.ZodObject<Record<TKeys, ResponseErrorSchemaType>>;
        }>;
      };
    } {
  const keyMetadata =
    !keys ||
    Array.isArray(keys) ||
    typeof keys === "string" ||
    typeof keys === "number"
      ? undefined
      : (keys as Record<TKeys, Partial<SchemaObject>>);
  const keysArr: TKeys[] =
    keys === undefined
      ? (["root"] as TKeys[])
      : [
          ...(keyMetadata
            ? (Object.keys(keyMetadata) as TKeys[])
            : ([] as TKeys[]).concat(keys as TKeys | TKeys[])),
          ...keysRest,
        ];
  return {
    "application/json": {
      schema: z.object({
        type: z.literal("application_error"),
        errors: z
          .object<Record<TKeys, OptionalResponseErrorSchemaType>>(
            keysArr.reduce(
              (prev, key): Record<TKeys, OptionalResponseErrorSchemaType> => {
                const objectSchema = z.object({ message: z.string() });
                const schema:
                  ResponseErrorSchemaType | OptionalResponseErrorSchemaType =
                  keysArr.length === 1 ? objectSchema : objectSchema.optional();
                const metadata = keyMetadata?.[key];
                return {
                  ...prev,
                  [key]: metadata ? schema.openapi(metadata) : schema,
                };
              },
              {} as Record<TKeys, OptionalResponseErrorSchemaType>
            )
          )
          .openapi({ minProperties: 1 }),
      }),
    },
  };
}

/**
 * Builds a v1 `application_error` body for `c.json(applicationError({...}), status)`.
 * Keep `c.json` and the status at the call site so OpenAPIHono still checks the
 * keys against that status's `errorContent(...)`.
 */
export function applicationError<
  TErrors extends Record<string, z.infer<ResponseErrorSchemaType>>,
>(errors: TErrors): { type: "application_error"; errors: TErrors } {
  return { type: "application_error", errors };
}
