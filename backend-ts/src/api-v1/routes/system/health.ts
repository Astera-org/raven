import type { AppEnv } from "#src/types/hono.js";
import { createV1Route } from "#v1/lib/create-v1-route.js";
import { type RouteHandler } from "@hono/zod-openapi";
import { HealthResponseSchema } from "./route-responses/health.js";

// ---------------------------------------------------------------------------
// GET /health — liveness check
// ---------------------------------------------------------------------------

export const healthRoute = createV1Route({
  method: "get",
  path: "/health",
  tags: ["system"],
  summary: "Liveness check",
  responses: {
    200: {
      description: "The API is up.",
      content: { "application/json": { schema: HealthResponseSchema } },
    },
  },
});

export const healthHandler: RouteHandler<typeof healthRoute, AppEnv> = (c) => {
  return c.json({ apiVersion: 1, status: "ok" }, 200);
};
