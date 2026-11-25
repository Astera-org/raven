import { applicationError } from "#v1/lib/route-responses/error-content.js";
import { createV1App } from "#v1/routes/app-v1.js";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { createV0App } from "./api-v0/index.js";
import { ADMIN_UI_CLIENT_HEADER } from "./lib/admin-ui-session.js";
import { apiDocs } from "./lib/api-docs.js";
import { getHandlerAuth } from "./lib/auth.js";
import { logger } from "./lib/logger.js";
import { authMiddleware } from "./lib/middleware/auth-context.js";
import { jsonErrorsMiddleware } from "./lib/middleware/json-error.js";
import { trustedOrigins } from "./lib/middleware/require-trusted-origin.js";
import { jsonValidationErrorsMiddleware } from "./lib/middleware/validation-errors.js";
import { type AppEnv } from "./types/hono.js";

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use("*", jsonErrorsMiddleware);
  app.use("*", jsonValidationErrorsMiddleware);

  app.use("*", (c, next) => {
    c.set("logger", logger);
    return next();
  });

  app.use("*", async (c, next) => {
    const start = Date.now();
    let status = 500;
    try {
      await next();
      status = c.res.status;
      c.var.logger.info(
        {
          method: c.req.method,
          path: c.req.path,
          status,
          ms: Date.now() - start,
        },
        "HTTP request"
      );
    } catch (error) {
      c.var.logger.error(
        {
          method: c.req.method,
          path: c.req.path,
          status: 500,
          error,
          ms: Date.now() - start,
        },
        "HTTP request"
      );
    }
  });

  app.onError((err, c) => {
    c.var.logger.error({ err }, "Unhandled error");
    return c.var.jsonErrors({ server: ["Internal server error"] }, 500);
  });

  // Hono only consults the root app's notFound handler, so v1's lives here.
  app.notFound((c) => {
    if (!/^\/api\/v1(\/|$)/.test(c.req.path))
      return c.text("404 Not Found", 404);
    return c.json(applicationError({ root: { message: "Not found" } }), 404);
  });

  /**
   * Redirect paths with trailing slashes to their non-trailing-slash versions
   * to avoid duplicate route handling. For example, both /api/auth and
   * /api/auth/ would match the same route, which ensures that each route is
   * only handled once.
   */
  app.use("*", async (c, next) => {
    const url = new URL(c.req.url);
    // Only redirect if the path ends with a trailing slash and is not just "/"
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
      return c.redirect(url.toString(), 308);
    }
    return next();
  });

  app.use(
    "*",
    cors({
      // Session auth relies on cookies (SameSite=None in production), so
      // reflecting back any Origin here would let any site make credentialed
      // requests and read the response. Only allow our own frontends, the
      // same origins better-auth trusts for redirects.
      origin: (origin) =>
        trustedOrigins().includes(origin) ? origin : undefined,
      // x-captcha-response carries the Turnstile token on sign-up (lib/auth.ts).
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "x-captcha-response",
        ADMIN_UI_CLIENT_HEADER,
      ],
      // PATCH is v1's standard partial-update verb (see routes/v1/*).
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
    })
  );

  // Add Better Auth middleware. This adds `user` and `session` to the context
  app.use("*", authMiddleware);

  // /api/* is the unversioned API, unprefixed and untouched indefinitely.
  // /api/v0/* is the same route tree mounted a second time, freezing the
  // current (pre-versioning) behavior under an explicit version prefix. Both
  // prefixes share the same router instances, so there is no duplication
  // risk between them.
  //
  // authMiddleware must run before both auth mounts: its session lookup
  // throws on failure, giving a 500, whereas customSession's `/get-session`
  // turns the same failure into 200 `null`, which clients read as signed out.
  //
  // The docs route must come before the auth mounts, which would match it.
  app.on(
    "GET",
    ["/api/auth2/docs", "/api/v0/auth2/docs"],
    apiDocs({
      url: "/api/auth2/open-api/generate-schema",
      pageTitle: "The Stacks Auth API Docs",
    })
  );
  app.on(["GET", "POST"], "/api/auth2/*", (c) =>
    getHandlerAuth().handler(c.req.raw)
  );
  // Better Auth's internal router dispatches by matching its fixed basePath, so
  // rewrite the request to look like an /api/auth2/* request.
  app.on(["GET", "POST"], "/api/v0/auth2/*", (c) => {
    const url = new URL(c.req.raw.url);
    url.pathname = url.pathname.replace(/^\/api\/v0\/auth2/, "/api/auth2");
    const req = new Request(url, {
      method: c.req.raw.method,
      headers: c.req.raw.headers,
      body: c.req.raw.body,
      // Required by undici when the body is a stream.
      duplex: c.req.raw.body ? "half" : undefined,
    } as RequestInit);
    return getHandlerAuth().handler(req);
  });

  const appV0 = createV0App();
  const appV1 = createV1App();

  const healthHandler = (c: Context) => c.json({ status: "ok" });
  app.get("/api/health", healthHandler);
  app.get("/api/v0/health", healthHandler);

  const routes = app
    .route(`/api`, appV0)
    .route(`/api/v0`, appV0)

    // /api/v1/* — the properly-REST'd, better-auth-only surface, migrated
    // resource-by-resource on top of the frozen v0 behavior above. See the v1
    // conventions in the API versioning plan.
    .route("/api/v1", appV1);

  return routes;
}

export type AppType = ReturnType<typeof createApp>;
