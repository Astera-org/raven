import { beforeEach, describe, expect, it } from "vitest";
import type { AuthLevel } from "./auth-level.js";
import { readConfig, writeConfig } from "./config/config-file.js";
import { resolveProfile } from "./config/profiles.js";
import { ExitCode } from "./errors.js";
import { Output } from "./output.js";
import { checkStoredSession } from "./session.js";
import { FakeAuthServer } from "./testing/fake-auth.js";
import {
  createTestRuntime,
  MemoryTokenStore,
  TEST_NOW,
  type TestRuntime,
} from "./testing/test-runtime.js";

describe("checkStoredSession", () => {
  let auth: FakeAuthServer;
  let runtime: TestRuntime;
  let output: Output;

  async function check(
    sessionExpiresAt: string,
    authLevel: AuthLevel = "optional"
  ) {
    await writeConfig(runtime.configDir, {
      current: "local",
      profiles: {
        local: {
          apiUrl: "http://localhost:7001",
          user: "alice",
          sessionExpiresAt,
        },
      },
    });
    const profile = await resolveProfile({}, runtime);
    await checkStoredSession(profile, authLevel, runtime, output);
  }

  beforeEach(async () => {
    auth = new FakeAuthServer();
    runtime = await createTestRuntime({
      authFetch: auth.fetch,
      tokenStore: new MemoryTokenStore({ local: auth.issueToken() }),
    });
    output = new Output(runtime.stdout, runtime.stderr, false, {});
  });

  it("does nothing while the stored expiry is in the future", async () => {
    await check(new Date(TEST_NOW.getTime() + 60_000).toISOString());

    expect(auth.calls).toEqual([]);
    expect(runtime.stderr.text).toBe("");
  });

  it("refreshes a passed expiry when the server still has the session", async () => {
    await check("2026-09-01T00:00:00.000Z");

    expect(runtime.stderr.text).toBe("");
    expect(
      (await readConfig(runtime.configDir)).profiles.local?.sessionExpiresAt
    ).toBe(auth.expiresAt);
  });

  it("warns when the session is gone", async () => {
    auth.sessions.clear();

    await check("2026-09-01T00:00:00.000Z");

    expect(runtime.stderr.text).toContain(
      "Warning: the session for profile local has expired"
    );
  });

  it("fails a required command when the session is gone", async () => {
    auth.sessions.clear();

    await expect(
      check("2026-09-01T00:00:00.000Z", "required")
    ).rejects.toMatchObject({
      message: expect.stringContaining("has expired or was revoked"),
      exitCode: ExitCode.Auth,
    });
    expect(runtime.stderr.text).toBe("");
  });

  it("warns and continues when the session can't be checked", async () => {
    auth.unreachable = true;

    await check("2026-09-01T00:00:00.000Z", "required");

    expect(runtime.stderr.text).toContain(
      "Warning: couldn't check the session for profile local"
    );
    expect(runtime.stderr.text).not.toContain("has expired");
  });

  it("ignores tokens from RAVEN_TOKEN", async () => {
    runtime.env.RAVEN_TOKEN = "env-token";

    await check("2026-09-01T00:00:00.000Z");

    expect(auth.calls).toEqual([]);
  });
});
