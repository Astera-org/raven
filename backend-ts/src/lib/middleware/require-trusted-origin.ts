import { getConfig } from "#src/config.js";
import { type AuthEnv } from "#src/types/hono.js";
import { applicationError } from "#v1/lib/route-responses/error-content.js";
import { createMiddleware } from "hono/factory";

/** Our own frontends: the origins CORS and better-auth trust. */
export function trustedOrigins(): string[] {
  const cfg = getConfig();
  return [
    cfg.BASE_URL_WEB,
    cfg.BASE_URL_ADMIN,
    ...(cfg.BASE_URL_API ? [new URL(cfg.BASE_URL_API).origin] : []),
  ].filter(Boolean);
}

/**
 * Refuses a request whose Origin header isn't one of `trustedOrigins()`.
 *
 * For routes that take a CORS-simple body (multipart/form-data): a cross-site
 * form can POST one without a preflight, and the browser sends the session
 * cookie with it (SameSite=None in production). Browsers send Origin on every
 * cross-origin POST, while non-browser clients such as the CLI send none and
 * authenticate with a bearer token, so a request without Origin passes.
 */
export const requireTrustedOrigin = createMiddleware<AuthEnv>(
  async (c, next) => {
    const origin = c.req.header("Origin");
    if (origin !== undefined && !trustedOrigins().includes(origin)) {
      return c.json(
        applicationError({ auth: { message: "Untrusted request origin" } }),
        403
      );
    }
    await next();
  }
);
