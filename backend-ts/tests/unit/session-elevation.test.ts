import { sessionElevation } from "#src/lib/session-elevation.js";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { bearer } from "better-auth/plugins";
import { beforeEach, describe, expect, it } from "vitest";

const PASSWORD = "correct-horse-battery";

describe("sessionElevation plugin", () => {
  let db: Record<string, Record<string, unknown>[]>;
  let elevations: Map<string, Date>;
  let auth: ReturnType<typeof makeAuth>;
  let token: string;

  function makeAuth() {
    return betterAuth({
      baseURL: "http://localhost:3000",
      secret: "test-secret-that-is-at-least-32-characters-long",
      database: memoryAdapter(db),
      emailAndPassword: { enabled: true },
      plugins: [
        bearer(),
        sessionElevation({
          maxAgeSec: 600,
          upsertElevation: async (sessionId, expiresAt) => {
            elevations.set(sessionId, expiresAt);
          },
        }),
      ],
    });
  }

  function elevate(password: string, bearerToken = token) {
    return auth.handler(
      new Request("http://localhost:3000/api/auth/elevate-session", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({ password }),
      })
    );
  }

  beforeEach(async () => {
    db = { user: [], account: [], session: [] };
    elevations = new Map();
    auth = makeAuth();
    ({ token } = (await auth.api.signUpEmail({
      body: { email: "alice@example.org", password: PASSWORD, name: "Alice" },
    })) as { token: string });
  });

  it("elevates the session for maxAgeSec on the right password", async () => {
    const before = Date.now();
    const response = await elevate(PASSWORD);

    expect(response.status).toBe(200);
    const { expiresAt } = (await response.json()) as { expiresAt: string };
    const lifetime = Date.parse(expiresAt) - before;
    expect(lifetime).toBeGreaterThanOrEqual(600_000);
    expect(lifetime).toBeLessThan(601_000);
    expect([...elevations]).toEqual([
      [db.session?.[0]?.id, new Date(expiresAt)],
    ]);
  });

  it("rejects a wrong password without elevating", async () => {
    const response = await elevate("wrong-password");

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_PASSWORD" });
    expect(elevations.size).toBe(0);
  });

  it("requires a session", async () => {
    const response = await elevate(PASSWORD, "not-a-token");

    expect(response.status).toBe(401);
    expect(elevations.size).toBe(0);
  });
});
