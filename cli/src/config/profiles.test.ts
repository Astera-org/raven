import { ExitCode } from "#src/errors.js";
import {
  createTestRuntime,
  MemoryTokenStore,
  type TestRuntime,
} from "#src/testing/test-runtime.js";
import { beforeEach, describe, expect, it } from "vitest";
import { writeConfig } from "./config-file.js";
import { DEFAULT_API_URL, resolveProfile } from "./profiles.js";

describe("resolveProfile", () => {
  let runtime: TestRuntime;

  beforeEach(async () => {
    runtime = await createTestRuntime({
      tokenStore: new MemoryTokenStore({ local: "local-token" }),
    });
    await writeConfig(runtime.configDir, {
      current: "local",
      profiles: {
        local: { apiUrl: "http://localhost:7001", user: "alice" },
        staging: { apiUrl: "https://api.staging.thestacks.org/" },
        public: { apiUrl: DEFAULT_API_URL },
      },
    });
  });

  it("uses the current profile and its stored token", async () => {
    await expect(resolveProfile({}, runtime)).resolves.toEqual({
      name: "local",
      apiUrl: "http://localhost:7001",
      user: "alice",
      token: "local-token",
      tokenSource: "store",
      sessionExpiresAt: undefined,
    });
  });

  it("prefers --profile over RAVEN_PROFILE over current", async () => {
    runtime.env.RAVEN_PROFILE = "public";

    expect((await resolveProfile({}, runtime)).name).toBe("public");
    expect((await resolveProfile({ profile: "staging" }, runtime)).name).toBe(
      "staging"
    );
  });

  it("normalizes the server URL", async () => {
    const profile = await resolveProfile({ profile: "staging" }, runtime);

    expect(profile.apiUrl).toBe("https://api.staging.thestacks.org");
    expect(profile.token).toBeUndefined();
  });

  it("falls back to the default server anonymously with no profile", async () => {
    await writeConfig(runtime.configDir, { profiles: {} });

    await expect(resolveProfile({}, runtime)).resolves.toEqual({
      name: undefined,
      apiUrl: DEFAULT_API_URL,
      user: undefined,
      token: undefined,
      tokenSource: undefined,
      sessionExpiresAt: undefined,
    });
  });

  it("fails for an undefined profile", async () => {
    await expect(
      resolveProfile({ profile: "nope" }, runtime)
    ).rejects.toMatchObject({ exitCode: ExitCode.Usage });
  });

  it("lets RAVEN_TOKEN override the stored token", async () => {
    runtime.env.RAVEN_TOKEN = "env-token";

    const profile = await resolveProfile({}, runtime);

    expect(profile.token).toBe("env-token");
    expect(profile.tokenSource).toBe("env");
  });

  it("doesn't send a stored token to a RAVEN_API_URL server", async () => {
    runtime.env.RAVEN_API_URL = "https://evil.example.com";

    const profile = await resolveProfile({}, runtime);

    expect(profile.apiUrl).toBe("https://evil.example.com");
    expect(profile.token).toBeUndefined();
  });

  it.each([
    "http://localhost:7001",
    "http://localhost:7001/",
    "http://localhost:7001/api",
  ])(
    "sends the stored token when RAVEN_API_URL %s is the profile's server",
    async (override) => {
      runtime.env.RAVEN_API_URL = override;

      const profile = await resolveProfile({}, runtime);

      expect(profile.apiUrl).toBe("http://localhost:7001");
      expect(profile.token).toBe("local-token");
      expect(profile.tokenSource).toBe("store");
    }
  );

  it("doesn't send a stored token to another port on the same host", async () => {
    runtime.env.RAVEN_API_URL = "http://localhost:7002";

    expect((await resolveProfile({}, runtime)).token).toBeUndefined();
  });

  it("still sends RAVEN_TOKEN to a RAVEN_API_URL server", async () => {
    runtime.env.RAVEN_API_URL = "https://api.staging.thestacks.org";
    runtime.env.RAVEN_TOKEN = "env-token";

    const profile = await resolveProfile({}, runtime);

    expect(profile.token).toBe("env-token");
    expect(profile.tokenSource).toBe("env");
  });

  it("rejects an invalid RAVEN_API_URL", async () => {
    runtime.env.RAVEN_API_URL = "localhost:7001";

    await expect(resolveProfile({}, runtime)).rejects.toMatchObject({
      exitCode: ExitCode.Usage,
    });
  });
});
