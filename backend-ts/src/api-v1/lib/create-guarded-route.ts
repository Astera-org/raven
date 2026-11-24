import { type AsArray } from "#src/types/generics.js";
import {
  createV1Route,
  type V1StabilityOption,
} from "#v1/lib/create-v1-route.js";
import { type RouteConfig } from "@hono/zod-openapi";
import { type MiddlewareHandler } from "hono";

export type GuardedRouteConfig<P extends string> = Omit<
  RouteConfig,
  "path" | "middleware" | "security" | "responses"
> & {
  path: P;
  // Every guard runs `requireAuth`, whose 401 shape is fixed, so a route
  // can't redeclare it.
  responses: RouteConfig["responses"] & { 401?: never };
} & V1StabilityOption;

/**
 * Builds a `createV1Route` variant for guarded routes: each route runs `guards`
 * before any `middleware` given, documents `guardResponses`, and sets
 * bearer-auth `security`.
 *
 * `middleware` must be a single middleware or a tuple
 */
export function createGuardedRoute<
  const G extends MiddlewareHandler[],
  GR extends NonNullable<RouteConfig["responses"]>,
>(guards: G, guardResponses: GR) {
  return function createRoute<
    P extends string,
    R extends GuardedRouteConfig<P>,
    const M extends MiddlewareHandler | MiddlewareHandler[] = [],
  >(config: R & { middleware?: M }) {
    const { middleware: routeMiddleware, ...route } = config;

    const middleware = [
      ...guards,
      ...(routeMiddleware
        ? Array.isArray(routeMiddleware)
          ? routeMiddleware
          : [routeMiddleware]
        : []),
    ] as [...G, ...AsArray<M>];

    return createV1Route({
      ...route,
      middleware: middleware,
      security: [{ bearerAuth: [] }],
      responses: { ...guardResponses, ...route.responses },
    });
  };
}
