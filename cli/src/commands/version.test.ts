import { writeConfig } from "#src/config/config-file.js";
import { ExitCode } from "#src/errors.js";
import { runCli } from "#src/program.js";
import {
  createTestRuntime,
  jsonResponse,
  MemoryTokenStore,
  type TestRuntime,
} from "#src/testing/test-runtime.js";
import { CLI_VERSION } from "#src/version.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("raven version", () => {
  let runtime: TestRuntime;
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(async () => {
    fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse({ apiVersion: 1, status: "ok" }))
    );
    runtime = await createTestRuntime({
      fetch: fetchMock,
      tokenStore: new MemoryTokenStore({ staging: "secret" }),
    });
    await writeConfig(runtime.configDir, {
      current: "staging",
      profiles: {
        staging: { apiUrl: "https://api.staging.thestacks.org", user: "alice" },
        local: { apiUrl: "http://localhost:7001" },
      },
    });
  });

  it("prints the CLI and server versions", async () => {
    const exitCode = await runCli(["version"], runtime);

    expect(exitCode).toBe(ExitCode.Success);
    expect(runtime.stdout.text).toBe(
      [
        `CLI:     raven ${CLI_VERSION}`,
        "Server:  https://api.staging.thestacks.org",
        "API:     v1",
        "",
      ].join("\n")
    );
    const request = fetchMock.mock.calls[0]?.[0] as Request;
    expect(request.url).toBe("https://api.staging.thestacks.org/api/v1/health");
  });

  it("never sends a token", async () => {
    await runCli(["version"], runtime);

    const request = fetchMock.mock.calls[0]?.[0] as Request;
    expect(request.headers.get("Authorization")).toBeNull();
  });

  it("prints JSON with --json and uses --profile", async () => {
    const exitCode = await runCli(
      ["version", "--json", "--profile", "local"],
      runtime
    );

    expect(exitCode).toBe(ExitCode.Success);
    expect(JSON.parse(runtime.stdout.text)).toEqual({
      cli: { name: "raven", version: CLI_VERSION },
      server: { url: "http://localhost:7001", apiVersion: 1, status: "ok" },
    });
  });

  it("still prints the CLI version when the server is unreachable", async () => {
    fetchMock.mockRejectedValue(
      new TypeError("fetch failed", { cause: new Error("ECONNREFUSED") })
    );

    const exitCode = await runCli(["version"], runtime);

    expect(exitCode).toBe(ExitCode.Network);
    expect(runtime.stdout.text).toContain(`CLI:     raven ${CLI_VERSION}`);
    expect(runtime.stderr.text).toBe(
      "Error: could not reach https://api.staging.thestacks.org: ECONNREFUSED\n"
    );
  });

  it("reports errors as JSON on stderr with --json", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "down" }, 503));

    const exitCode = await runCli(["--json", "version"], runtime);

    expect(exitCode).toBe(ExitCode.Server);
    expect(JSON.parse(runtime.stdout.text)).toEqual({
      cli: { name: "raven", version: CLI_VERSION },
      server: { url: "https://api.staging.thestacks.org" },
    });
    expect(JSON.parse(runtime.stderr.text)).toMatchObject({
      error: { code: "server", exitCode: ExitCode.Server, message: "down" },
    });
  });
});

describe("raven --version", () => {
  it("prints only the CLI version without a network call", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const runtime = await createTestRuntime({ fetch: fetchMock });

    const exitCode = await runCli(["--version"], runtime);

    expect(exitCode).toBe(ExitCode.Success);
    expect(runtime.stdout.text).toBe(`${CLI_VERSION}\n`);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("usage errors", () => {
  it("exits with the usage code for an unknown command", async () => {
    const runtime = await createTestRuntime();

    expect(await runCli(["nope"], runtime)).toBe(ExitCode.Usage);
    expect(runtime.stderr.text).toContain("unknown command 'nope'");
  });

  it("exits with the usage code for an undefined profile", async () => {
    const runtime = await createTestRuntime();

    expect(await runCli(["version", "--profile", "nope"], runtime)).toBe(
      ExitCode.Usage
    );
    expect(runtime.stderr.text).toContain('profile "nope" is not defined');
  });
});
