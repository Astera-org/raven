import { getConfig } from "#src/config.js";
import { apiDocs } from "#src/lib/api-docs.js";
import { createFilesRouter } from "#src/lib/shared-routes/files.js";
import type { AppEnv } from "#src/types/hono.js";
import { applicationError } from "#v1/lib/route-responses/error-content.js";
import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import adminRouter from "./admin/admin-router.js";
import importsRouter from "./imports/imports-router.js";
import orgsRouter from "./orgs/orgs-router.js";
import publicationsRouter from "./publications/publications-router.js";
import systemRouter from "./system/index.js";
import usersRouter from "./users/users-router.js";

/**
 * The v1 API: a properly-REST'd, better-auth-only surface, migrated
 * resource-by-resource from the frozen v0/unprefixed API. See the v1
 * conventions in the API versioning plan for the rules every route here
 * follows (verbs, envelopes, error shape, OpenAPI-first).
 *
 * Add each newly-migrated resource's router here as its own `.route(...)`
 * call, one folder per resource under `backend-ts/src/api-v1/routes/<resource>/`.
 */
export function createV1App() {
  // Mounted routers have no `defaultHook` of their own, so request-schema
  // failures in every v1 route fall back to this one.
  const app = new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.var.validationErrors(result.error.issues);
      }
    },
  });
  const config = getConfig();

  // A sub-app's onError takes over from the root app's once mounted with
  // `route()`, so v1 failures get the v1 envelope while v0 keeps its own.
  // HTTPExceptions thrown by validators (400 malformed JSON, 415 unsupported
  // media type) keep their status instead of becoming 500s.
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      if (err.res) return err.getResponse();
      return c.json(
        applicationError({ root: { message: err.message } }),
        err.status
      );
    }
    c.var.logger.error({ err }, "Unhandled error");
    return c.json(
      applicationError({ root: { message: "Internal server error" } }),
      500
    );
  });

  const filesRouter = createFilesRouter((c) =>
    c.json(applicationError({ file: { message: "File not found" } }), 404)
  );

  // Function chaining will allow TypeScript to infer the type of routesV1.
  // This will be useful once we can query these directly from the front end.
  const routesV1 = app
    .route("/orgs", orgsRouter)
    .route("/files", filesRouter)
    .route("/", systemRouter)
    .route("/publications", publicationsRouter)
    .route("/users", usersRouter)
    .route("/admin", adminRouter)
    .route("/imports", importsRouter);

  // Protected routes authenticate with a Better Auth bearer session token
  // (see lib/auth.ts's `bearer` plugin); register the scheme so Scalar can
  // offer an Authorize control and consumers know how to authenticate.
  routesV1.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
  });

  // BASE_URL_API is documented as configurable either with or without the
  // `/api` suffix (see raven.example.toml). Routes are always mounted at
  // `/api/v1` (see app.ts), so normalize to the origin first and always
  // append `/api/v1` rather than trusting the configured suffix.
  const apiOrigin = config.BASE_URL_API.replace(/\/api$/, "");

  // The following routes are not documented by OpenAPI
  routesV1.get("/openapi.json", (c) =>
    c.json(
      routesV1.getOpenAPI31Document({
        openapi: "3.1.0",
        info: {
          title: "The Stacks API v1",
          version: "1.0.0",
          description:
            "A single, continuously-evolving REST surface: additive changes " +
            "(new fields, new optional params, new endpoints) ship without " +
            "a version bump; breaking changes are a v2 conversation. See " +
            "`/api/v0` for the frozen, pre-versioning API.",
        },
        servers: [{ url: `${apiOrigin}/api/v1` }],
      })
    )
  );

  app.get(
    "/docs",
    apiDocs({
      url: "/api/v1/openapi.json",
      pageTitle: "The Stacks API v1 Docs",
    })
  );

  return routesV1;
}
