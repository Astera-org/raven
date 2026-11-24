import { readConfig, writeConfig } from "#src/config/config-file.js";
import { ExitCode } from "#src/errors.js";
import { runCli } from "#src/program.js";
import { FakeAuthServer } from "#src/testing/fake-auth.js";
import {
  createTestRuntime,
  MemoryTokenStore,
  type TestRuntime,
} from "#src/testing/test-runtime.js";
import { beforeEach, describe, expect, it } from "vitest";

const LOCAL = "http://localhost:7001";

describe("raven auth logout and status", () => {
  let auth: FakeAuthServer;
  let runtime: TestRuntime;
  let token: string;

  beforeEach(async () => {
    auth = new FakeAuthServer();
    token = auth.issueToken();
    runtime = await createTestRuntime({
      authFetch: auth.fetch,
      tokenStore: new MemoryTokenStore({ local: token }),
    });
    await writeConfig(runtime.configDir, {
      current: "local",
      profiles: {
        local: {
          apiUrl: LOCAL,
          user: "alice",
          sessionExpiresAt: "2026-09-24T00:00:00.000Z",
        },
      },
    });
  });

  it("shows the logged-in user and refreshes the stored expiry", async () => {
    expect(await runCli(["auth", "status"], runtime)).toBe(ExitCode.Success);

    expect(runtime.stdout.text).toBe(
      [
        "Profile:  local",
        `Server:   ${LOCAL}`,
        "User:     alice",
        `Expires:  ${auth.expiresAt}`,
        "",
      ].join("\n")
    );
    expect(
      (await readConfig(runtime.configDir)).profiles.local?.sessionExpiresAt
    ).toBe(auth.expiresAt);
  });

  it("exits with the auth code when the session is gone", async () => {
    auth.sessions.clear();

    expect(await runCli(["auth", "status"], runtime)).toBe(ExitCode.Auth);
    expect(runtime.stdout.text).toContain("alice (session expired)");
    expect(runtime.stderr.text).toContain(
      "the session for profile local has expired or was revoked; run raven auth login --profile local"
    );
  });

  it("doesn't send the stored token when RAVEN_API_URL points elsewhere", async () => {
    runtime.env.RAVEN_API_URL = "https://api.staging.thestacks.org";

    expect(await runCli(["auth", "status"], runtime)).toBe(ExitCode.Success);

    expect(auth.calls).toEqual([]);
    expect(runtime.stdout.text).toContain("User:     anonymous");
    expect(runtime.stdout.text).toContain(
      "Server:   https://api.staging.thestacks.org"
    );
  });

  it("logs out on the profile's own server, ignoring RAVEN_API_URL", async () => {
    runtime.env.RAVEN_API_URL = "https://api.staging.thestacks.org";

    await runCli(["auth", "logout"], runtime);

    expect(auth.calls.map((call) => call.url)).toEqual([
      `${LOCAL}/api/auth2/sign-out`,
    ]);
    expect(auth.sessions.has(token)).toBe(false);
  });

  it("shows anonymous with no profile", async () => {
    const empty = await createTestRuntime();

    await runCli(["auth", "status", "--json"], empty);

    expect(JSON.parse(empty.stdout.text)).toEqual({
      profile: null,
      server: "https://api.thestacks.org",
      user: null,
      loggedIn: false,
    });
  });

  it("logs out on the server and locally, keeping the profile", async () => {
    expect(await runCli(["auth", "logout"], runtime)).toBe(ExitCode.Success);

    expect(auth.sessions.has(token)).toBe(false);
    expect(runtime.tokenStore.tokens).toEqual({});
    expect(await readConfig(runtime.configDir)).toEqual({
      current: "local",
      profiles: { local: { apiUrl: LOCAL } },
    });
    expect(runtime.stdout.text).toBe(
      `Logged out of ${LOCAL} (profile local)\n`
    );
  });

  it("is a no-op when not logged in", async () => {
    await runCli(["auth", "logout"], runtime);
    runtime.stdout.text = "";

    expect(await runCli(["auth", "logout"], runtime)).toBe(ExitCode.Success);
    expect(runtime.stdout.text).toBe("Profile local wasn't logged in\n");
  });

  it("deletes the local token even when the server is unreachable", async () => {
    auth.unreachable = true;

    expect(await runCli(["auth", "logout"], runtime)).toBe(ExitCode.Success);
    expect(runtime.stderr.text).toContain(
      "Warning: couldn't end the session on the server (could not reach http://localhost:7001: ECONNREFUSED); the local token was deleted anyway"
    );
    expect(runtime.tokenStore.tokens).toEqual({});
  });

  it("logs out the stored session but warns that RAVEN_TOKEN still applies", async () => {
    const envToken = auth.issueToken();
    runtime.env.RAVEN_TOKEN = envToken;

    expect(await runCli(["auth", "logout"], runtime)).toBe(ExitCode.Success);

    expect(auth.sessions.has(token)).toBe(false);
    expect(auth.sessions.has(envToken)).toBe(true);
    expect(runtime.stdout.text).toBe(
      `Logged out of ${LOCAL} (profile local)\n`
    );
    expect(runtime.stderr.text).toContain(
      "Warning: RAVEN_TOKEN is set and logout doesn't revoke it; commands keep using it until you unset it"
    );
  });

  it("explains that RAVEN_TOKEN isn't revoked when no profile is selected", async () => {
    const empty = await createTestRuntime({ authFetch: auth.fetch });
    empty.env.RAVEN_TOKEN = auth.issueToken();

    expect(await runCli(["auth", "logout"], empty)).toBe(ExitCode.Usage);
    expect(auth.calls).toEqual([]);
    expect(empty.stderr.text).toContain(
      "no profile selected; RAVEN_TOKEN is set and logout doesn't revoke it"
    );
  });

  it("requires a profile to log out of", async () => {
    const empty = await createTestRuntime();

    expect(await runCli(["auth", "logout"], empty)).toBe(ExitCode.Usage);
  });
});
