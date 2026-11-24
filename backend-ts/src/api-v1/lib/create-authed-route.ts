import {
  requireAuth,
  requireAuthResponse,
} from "#src/lib/middleware/require-auth.js";
import {
  requireElevatedSession,
  requireElevatedSessionResponse,
} from "#src/lib/middleware/require-elevated-session.js";
import {
  createGuardedRoute,
  type GuardedRouteConfig,
} from "#v1/lib/create-guarded-route.js";
import { type MiddlewareHandler } from "hono";

const createAuthGuardedRoute = createGuardedRoute(
  [requireAuth],
  requireAuthResponse
);

const createElevatedGuardedRoute = createGuardedRoute(
  [requireAuth, requireElevatedSession],
  { ...requireAuthResponse, ...requireElevatedSessionResponse }
);

export interface AuthedRouteOptions {
  /**
   * Also require a recent password confirmation
   * (`POST /api/auth2/elevate-session`); otherwise 403. A route's own 403
   * response replaces the documented one, so mention elevation there too.
   */
  requireElevated?: boolean;
}

/**
 * `createV1Route` for routes that require a session: runs `requireAuth` before
 * any `middleware` given, documents its 401, and sets bearer-auth `security`.
 * Handlers can then be typed with `AuthEnv`.
 *
 * `middleware` must be a single middleware or a tuple
 */
export function createAuthedRoute<
  P extends string,
  R extends GuardedRouteConfig<P>,
  const M extends MiddlewareHandler | MiddlewareHandler[] = [],
>(
  config: R & { middleware?: M },
  options: AuthedRouteOptions & { requireElevated: true }
): ReturnType<typeof createElevatedGuardedRoute<P, R, M>>;
export function createAuthedRoute<
  P extends string,
  R extends GuardedRouteConfig<P>,
  const M extends MiddlewareHandler | MiddlewareHandler[] = [],
>(
  config: R & { middleware?: M },
  options?: AuthedRouteOptions & { requireElevated?: false }
): ReturnType<typeof createAuthGuardedRoute<P, R, M>>;
export function createAuthedRoute<
  P extends string,
  R extends GuardedRouteConfig<P>,
  const M extends MiddlewareHandler | MiddlewareHandler[] = [],
>(config: R & { middleware?: M }, options: AuthedRouteOptions = {}) {
  return options.requireElevated
    ? createElevatedGuardedRoute<P, R, M>(config)
    : createAuthGuardedRoute<P, R, M>(config);
}
