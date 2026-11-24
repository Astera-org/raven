import { type AppEnv } from "#src/types/hono.js";
import { OpenAPIHono } from "@hono/zod-openapi";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sessions = { existsActiveElevation: vi.fn<() => Promise<boolean>>() };
vi.mock("#v1/db-repositories/index.js", () => ({
  makeRepositories: () => ({ sessions }),
}));

const { createAuthedRoute } = await import("#v1/lib/create-authed-route.js");
const { ELEVATION_REQUIRED_MESSAGE } =
  await import("#src/lib/middleware/require-elevated-session.js");

const ok = { 200: { description: "OK" } };

function appFor(route: ReturnType<typeof createAuthedRoute>, signedIn = true) {
  const app = new OpenAPIHono<AppEnv>();
  app.use("*", async (c, next) => {
    const auth = signedIn
      ? { user: { id: "user-1" }, session: { id: "session-1" } }
      : { user: null, session: null };
    c.set("user", auth.user as AppEnv["Variables"]["user"]);
    c.set("session", auth.session as AppEnv["Variables"]["session"]);
    await next();
  });
  app.openapi(route, (c) => c.text("ok", 200));
  return app;
}

describe("createAuthedRoute", () => {
  beforeEach(() => {
    sessions.existsActiveElevation.mockReset();
  });

  it("doesn't check elevation by default", async () => {
    const route = createAuthedRoute({
      method: "get",
      path: "/",
      responses: ok,
    });

    const response = await appFor(route).request("/");

    expect(response.status).toBe(200);
    expect(Object.keys(route.responses)).toEqual(["200", "401"]);
    expect(sessions.existsActiveElevation).not.toHaveBeenCalled();
  });

  describe("with requireElevated", () => {
    const route = createAuthedRoute(
      { method: "get", path: "/", responses: ok },
      { requireElevated: true }
    );

    it("documents the 403", () => {
      expect(Object.keys(route.responses)).toEqual(["200", "401", "403"]);
    });

    it("passes an elevated session", async () => {
      sessions.existsActiveElevation.mockResolvedValue(true);

      const response = await appFor(route).request("/");

      expect(response.status).toBe(200);
      expect(sessions.existsActiveElevation).toHaveBeenCalledWith("session-1");
    });

    it("refuses a session without an active elevation", async () => {
      sessions.existsActiveElevation.mockResolvedValue(false);

      const response = await appFor(route).request("/");

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        type: "application_error",
        errors: { auth: { message: ELEVATION_REQUIRED_MESSAGE } },
      });
    });

    it("still answers 401 without a session", async () => {
      const response = await appFor(route, false).request("/");

      expect(response.status).toBe(401);
      expect(sessions.existsActiveElevation).not.toHaveBeenCalled();
    });
  });
});
