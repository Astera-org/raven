import { ValidationIssuesResponse } from "#src/lib/middleware/validation-errors.js";
import { createRoute, z, type RouteConfig } from "@hono/zod-openapi";

/**
 * `stable` routes are used by a deployed client, so they may only change
 * additively; `alpha` routes are still in development and may change freely.
 * Emitted as oasdiff's `x-stability-level`. See `api-v1/README.md`.
 */
export type V1Stability = "stable" | "alpha";

export type V1StabilityOption = { stability?: V1Stability };

type V1RouteConfig<P extends string> = Omit<RouteConfig, "path"> & {
  path: P;
} & V1StabilityOption;

type RequestConfig = NonNullable<RouteConfig["request"]>;

/**
 * Types can't see zod checks such as `.regex()`, so unlike
 * `canRejectRequest` this counts any declared request input as rejectable.
 */
type HasRequestInput<R> = R extends { request: infer Req }
  ? [keyof Req & keyof RequestConfig] extends [never]
    ? false
    : true
  : false;

type V1Responses<R extends V1RouteConfig<string>> =
  HasRequestInput<R> extends true
    ? 422 extends keyof R["responses"]
      ? R["responses"]
      : R["responses"] & typeof ValidationIssuesResponse
    : R["responses"];

/**
 * `createRoute` for every v1 route: documents the 422 that the v1 app's
 * `defaultHook` returns when the request fails its schemas. A route can
 * declare its own `422` to override the description.
 *
 * Also records the route's `stability` as `x-stability-level`. It defaults
 * to `alpha` even when spreading a stable route, so an alias is only stable
 * when it says so itself.
 */
export function createV1Route<P extends string, R extends V1RouteConfig<P>>(
  config: R
) {
  const { stability = "alpha", ...route } = config;
  const responses = canRejectRequest(route.request)
    ? { ...ValidationIssuesResponse, ...route.responses }
    : route.responses;

  return createRoute({
    ...route,
    "x-stability-level": stability,
    responses: responses as V1Responses<R>,
  });
}

/**
 * Whether request validation could fail before the handler runs. Errs
 * towards `true`: only objects of check-free `z.string()` fields count as
 * unable to fail. Path params are always present so may be required;
 * query, header, and cookie fields must be optional.
 */
export function canRejectRequest(request: RequestConfig | undefined): boolean {
  if (!request) return false;
  if (request.body) return true;
  if (request.params && !acceptsAnyStrings(request.params, true)) return true;

  return [request.query, request.headers, request.cookies].some(
    (schema) => schema !== undefined && !acceptsAnyStrings(schema, false)
  );
}

function acceptsAnyStrings(
  schema: z.ZodType | z.ZodType[],
  allowRequiredFields: boolean
): boolean {
  if (!(schema instanceof z.ZodObject)) return false;
  if (schema.def.catchall instanceof z.ZodNever || schema.def.checks?.length) {
    return false;
  }

  return Object.values(schema.shape).every((field) =>
    field instanceof z.ZodOptional
      ? isUncheckedString(field.unwrap())
      : allowRequiredFields && isUncheckedString(field)
  );
}

function isUncheckedString(schema: z.core.$ZodType): boolean {
  return schema instanceof z.ZodString && !schema.def.checks?.length;
}
