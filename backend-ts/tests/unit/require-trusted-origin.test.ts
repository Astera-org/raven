import { createApp } from "#src/app.js";
import { initConfig } from "#src/config.js";
import type * as AuthModule from "#src/lib/auth.js";
import { requireTrustedOrigin } from "#src/lib/middleware/require-trusted-origin.js";
import { memoryAdapter } from "better-auth/adapters/memory";
import { Hono } from "hono";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A real better-auth instance, so origins are matched as in production, on
// an in-memory database, since the guard never touches it.
vi.mock("#src/lib/auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof AuthModule>();
  return {
    ...actual,
    getAuth: () => actual.generateAuth(memoryAdapter({})),
  };
});

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "raven-origin-"));
  const configPath = join(tempDir, "raven.toml");
  writeFileSync(
    configPath,
    `
DATABASE_URI = "mysql://raven:raven@localhost:3306/raven"
BASE_URL_WEB = "https://app.example.com"
BASE_URL_ADMIN = "https://admin.example.com"
BASE_URL_API = "https://api.example.com/api"
EXTRA_ALLOWED_ORIGIN_PATTERN = "https://*-preview.example.com"
ENVIRONMENT = "test"
`
  );
  initConfig(configPath);
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function guardedApp() {
  const app = new Hono();
  app.use("*", requireTrustedOrigin);
  app.all("*", (c) => c.text("ok"));
  return app;
}

describe("requireTrustedOrigin", () => {
  it("refuses a cross-site write", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const res = await guardedApp().request("/api/orgs/x", {
        method,
        headers: { Origin: "https://evil.example.com" },
      });
      expect(res.status, method).toBe(403);
    }
  });

  it("refuses the null origin", async () => {
    const res = await guardedApp().request("/api/orgs/x", {
      method: "POST",
      headers: { Origin: "null" },
    });
    expect(res.status).toBe(403);
  });

  it("allows writes from our frontends", async () => {
    for (const origin of [
      "https://app.example.com",
      "https://admin.example.com",
      "https://api.example.com",
    ]) {
      const res = await guardedApp().request("/api/orgs/x", {
        method: "POST",
        headers: { Origin: origin },
      });
      expect(res.status, origin).toBe(200);
    }
  });

  it("allows writes from a preview matching EXTRA_ALLOWED_ORIGIN_PATTERN", async () => {
    const res = await guardedApp().request("/api/orgs/x", {
      method: "POST",
      headers: { Origin: "https://raven-abc123-preview.example.com" },
    });
    expect(res.status).toBe(200);
  });

  it("refuses an origin that only resembles the preview pattern", async () => {
    for (const origin of [
      "http://raven-abc123-preview.example.com",
      "https://raven-preview.example.com.evil.com",
      "https://evil.com/-preview.example.com",
    ]) {
      const res = await guardedApp().request("/api/orgs/x", {
        method: "POST",
        headers: { Origin: origin },
      });
      expect(res.status, origin).toBe(403);
    }
  });

  it("allows a write without Origin, as the CLI sends", async () => {
    const res = await guardedApp().request("/api/orgs/x", { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("allows cross-site reads", async () => {
    const res = await guardedApp().request("/api/orgs/x", {
      headers: { Origin: "https://evil.example.com" },
    });
    expect(res.status).toBe(200);
  });

  it("leaves one-click unsubscribe to its signed token", async () => {
    for (const path of [
      "/api/notifications/unsubscribe",
      "/api/v0/notifications/unsubscribe",
    ]) {
      const res = await guardedApp().request(path, {
        method: "POST",
        headers: { Origin: "https://mail.example.net" },
      });
      expect(res.status, path).toBe(200);
    }
  });

  it("checks other notification writes", async () => {
    for (const path of [
      "/api/notifications/unsubscribe/extra",
      "/api/notifications/settings",
    ]) {
      const res = await guardedApp().request(path, {
        method: "POST",
        headers: { Origin: "https://mail.example.net" },
      });
      expect(res.status, path).toBe(403);
    }
  });

  it("leaves better-auth's endpoints to its own origin check", async () => {
    for (const path of ["/api/auth2/sign-in/email", "/api/v0/auth2/sign-out"]) {
      const res = await guardedApp().request(path, {
        method: "POST",
        headers: { Origin: "https://evil.example.com" },
      });
      expect(res.status, path).toBe(200);
    }
  });
});

describe("the app", () => {
  it("refuses a cross-site text/plain POST to a v0 route", async () => {
    const res = await createApp().request("/api/publications/add_org", {
      method: "POST",
      headers: {
        Origin: "https://evil.example.com",
        "Content-Type": "text/plain",
      },
      body: JSON.stringify({ slug: "mine", org_id: 1 }),
    });
    expect(res.status).toBe(403);
  });

  it("refuses a cross-site bodyless POST to a v1 route", async () => {
    const res = await createApp().request(
      "/api/v1/publications/id/01ARZ3NDEKTSV4RRFFQ69G5FAV/versions",
      { method: "POST", headers: { Origin: "https://evil.example.com" } }
    );
    expect(res.status).toBe(403);
  });
});
