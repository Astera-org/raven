import { getConfig } from "#src/config.js";
import { getAuth } from "#src/lib/auth.js";
import { applicationError } from "#v1/lib/route-responses/error-content.js";
import { createMiddleware } from "hono/factory";

/**
 * Our own frontends, the origins CORS allows. better-auth also trusts
 * EXTRA_ALLOWED_ORIGIN_PATTERN, for frontends such as Vercel previews that
 * proxy `/api` through their own origin and so don't need CORS.
 */
export function trustedOrigins(): string[] {
  const cfg = getConfig();
  return [
    cfg.BASE_URL_WEB,
    cfg.BASE_URL_ADMIN,
    ...(cfg.BASE_URL_API ? [new URL(cfg.BASE_URL_API).origin] : []),
  ].filter(Boolean);
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Routes that don't rely on the session cookie to authorize a write:
// better-auth runs its own origin check on its endpoints, and unsubscribing is
// authorized by the signed token in the link, which mail clients POST for
// one-click unsubscribe (List-Unsubscribe-Post), possibly with their own
// Origin.
const EXEMPT_PATHS = [
  /^\/api(\/v0)?\/auth2(\/|$)/,
  /^\/api(\/v0)?\/notifications\/unsubscribe$/,
];

/**
 * Refuses a state-changing request whose Origin header isn't one better-auth
 * trusts: `trustedOrigins()` plus EXTRA_ALLOWED_ORIGIN_PATTERN, so a proxied
 * preview can write wherever it can sign in.
 *
 * Session cookies are SameSite=None in production, so CORS alone doesn't stop
 * cross-site writes: a bodyless POST, or one with a form or text/plain body,
 * needs no preflight, the browser sends the cookie with it, and v0 parses
 * text/plain bodies as JSON. Browsers send Origin on every request with an
 * unsafe method, while non-browser clients such as the CLI send none and
 * authenticate with a bearer token, so a request without Origin passes.
 */
export const requireTrustedOrigin = createMiddleware(async (c, next) => {
  if (
    SAFE_METHODS.has(c.req.method) ||
    EXEMPT_PATHS.some((path) => path.test(c.req.path))
  ) {
    return next();
  }
  const origin = c.req.header("Origin");
  if (origin === undefined) return next();
  const authContext = await getAuth().$context;
  if (!authContext.isTrustedOrigin(origin)) {
    return c.json(
      applicationError({ auth: { message: "Untrusted request origin" } }),
      403
    );
  }
  return next();
});
