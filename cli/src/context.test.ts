import type { CommandUnknownOpts } from "@commander-js/extra-typings";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeConfig } from "./config/config-file.js";
import { createContext } from "./context.js";
import {
  createTestRuntime,
  jsonResponse,
  MemoryTokenStore,
  type TestRuntime,
} from "./testing/test-runtime.js";

const LOCAL = "http://localhost:7001";

/** A parsed command with no global options set. */
const command = {
  optsWithGlobals: () => ({}),
} as unknown as CommandUnknownOpts;

describe("createContext", () => {
  let runtime: TestRuntime;
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  async function authorizationSent(): Promise<string | null> {
    const { api } = await createContext(command, "optional", runtime);
    await api.GET("/health");
    const request = fetchMock.mock.calls.at(-1)?.[0] as Request;
    return request.headers.get("Authorization");
  }

  beforeEach(async () => {
    fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse({ apiVersion: 1, status: "ok" }))
    );
    runtime = await createTestRuntime({
      fetch: fetchMock,
      tokenStore: new MemoryTokenStore({ local: "stored-token" }),
    });
    await writeConfig(runtime.configDir, {
      current: "local",
      profiles: {
        local: {
          apiUrl: LOCAL,
          user: "alice",
          sessionExpiresAt: "2026-09-30T00:00:00.000Z",
        },
      },
    });
  });

  it("sends the stored token to the profile's server", async () => {
    expect(await authorizationSent()).toBe("Bearer stored-token");
  });

  it("sends the stored token when RAVEN_API_URL is the profile's server", async () => {
    runtime.env.RAVEN_API_URL = `${LOCAL}/`;

    expect(await authorizationSent()).toBe("Bearer stored-token");
  });

  it("sends no token when RAVEN_API_URL is another server", async () => {
    runtime.env.RAVEN_API_URL = "https://api.staging.thestacks.org";

    expect(await authorizationSent()).toBeNull();
    const request = fetchMock.mock.calls.at(-1)?.[0] as Request;
    expect(request.url).toBe("https://api.staging.thestacks.org/api/v1/health");
  });

  it("sends RAVEN_TOKEN, not the stored token, to a RAVEN_API_URL server", async () => {
    runtime.env.RAVEN_API_URL = "https://api.staging.thestacks.org";
    runtime.env.RAVEN_TOKEN = "env-token";

    expect(await authorizationSent()).toBe("Bearer env-token");
  });
});
