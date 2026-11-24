import { requireAuthResponse } from "#src/lib/middleware/require-auth.js";
import { type AsArray } from "#src/types/generics.js";
import {
  createV1Route,
  type V1StabilityOption,
} from "#v1/lib/create-v1-route.js";
import { requireAdminScope } from "#v1/routes/admin/middleware/require-admin-scope.js";
import { type RouteConfig } from "@hono/zod-openapi";
import { type MiddlewareHandler } from "hono";

type AuthedRouteConfig<P extends string> = Omit<
  RouteConfig,
  "path" | "middleware" | "security"
> & { path: P } & V1StabilityOption;
/**
 * `createV1Route` for routes that require a session: runs `requireAuth` before
 * any `middleware` given, documents its 401, and sets bearer-auth `security`.
 * Handlers can then be typed with `AuthEnv`.
 *
 * `middleware` must be a single middleware or a tuple
 */
export function createAdminRoute<
  P extends string,
  R extends AuthedRouteConfig<P>,
  const M extends MiddlewareHandler | MiddlewareHandler[] = [],
>(config: R & { middleware?: M }) {
  const { middleware: routeMiddleware, ...route } = config;
  const middleware = [
    requireAdminScope,
    ...(routeMiddleware
      ? Array.isArray(routeMiddleware)
        ? routeMiddleware
        : [routeMiddleware]
      : []),
  ] as [typeof requireAdminScope, ...AsArray<M>];
  return createV1Route({
    ...route,
    middleware: middleware,
    security: [{ bearerAuth: [] }],
    responses: {
      403: {
        description: "The caller is neither a site admin nor an org admin.",
        content: requireAuthResponse[401].content,
      },
      ...requireAuthResponse,
      ...route.responses,
    },
  });
}
