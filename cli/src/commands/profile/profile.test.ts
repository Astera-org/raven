import { readConfig, writeConfig } from "#src/config/config-file.js";
import { ExitCode } from "#src/errors.js";
import { runCli } from "#src/program.js";
import { FakeAuthServer } from "#src/testing/fake-auth.js";
import {
  createTestRuntime,
  interactive,
  MemoryTokenStore,
  ScriptedPrompter,
  type TestRuntime,
} from "#src/testing/test-runtime.js";
import { beforeEach, describe, expect, it } from "vitest";

describe("raven profile add", () => {
  let runtime: TestRuntime;

  beforeEach(async () => {
    runtime = await createTestRuntime();
  });

  it("adds a profile and makes the first one current", async () => {
    expect(
      await runCli(
        ["profile", "add", "local", "http://localhost:7001/"],
        runtime
      )
    ).toBe(ExitCode.Success);
    expect(
      await runCli(
        ["profile", "add", "staging", "https://api.staging.thestacks.org"],
        runtime
      )
    ).toBe(ExitCode.Success);

    expect(await readConfig(runtime.configDir)).toEqual({
      current: "local",
      profiles: {
        local: { apiUrl: "http://localhost:7001" },
        staging: { apiUrl: "https://api.staging.thestacks.org" },
      },
    });
    expect(runtime.stdout.text).toBe(
      [
        "Added profile local (http://localhost:7001), now the current profile",
        "Added profile staging (https://api.staging.thestacks.org)",
        "",
      ].join("\n")
    );
  });

  it("prompts for the server when there's a terminal", async () => {
    const prompter = new ScriptedPrompter(["http://localhost:7001"]);
    runtime = await createTestRuntime(interactive(prompter));

    await runCli(["profile", "add", "local"], runtime);

    expect(prompter.asked).toEqual(["Server URL"]);
    expect((await readConfig(runtime.configDir)).profiles.local).toEqual({
      apiUrl: "http://localhost:7001",
    });
  });

  it("requires the server without a terminal", async () => {
    expect(await runCli(["profile", "add", "local"], runtime)).toBe(
      ExitCode.Usage
    );
    expect(runtime.stderr.text).toContain(
      "missing server URL; run raven profile add local <api-url>"
    );
  });

  it("rejects a duplicate name and an invalid URL", async () => {
    await runCli(["profile", "add", "local", "http://localhost:7001"], runtime);

    expect(
      await runCli(
        ["profile", "add", "local", "http://localhost:7002"],
        runtime
      )
    ).toBe(ExitCode.Usage);
    expect(
      await runCli(["profile", "add", "other", "localhost:7002"], runtime)
    ).toBe(ExitCode.Usage);
  });
});

describe("raven profile list and use", () => {
  let runtime: TestRuntime;

  beforeEach(async () => {
    runtime = await createTestRuntime();
    await writeConfig(runtime.configDir, {
      current: "local",
      profiles: {
        local: { apiUrl: "http://localhost:7001", user: "alice" },
        public: { apiUrl: "https://api.thestacks.org" },
      },
    });
  });

  it("lists profiles with the current one marked", async () => {
    await runCli(["profile", "list"], runtime);

    expect(runtime.stdout.text).toBe(
      [
        "   NAME    SERVER                     USER",
        "*  local   http://localhost:7001      alice",
        "   public  https://api.thestacks.org  anonymous",
        "",
      ].join("\n")
    );
  });

  it("lists profiles as JSON", async () => {
    await runCli(["profile", "list", "--json"], runtime);

    expect(JSON.parse(runtime.stdout.text)).toEqual({
      profiles: [
        {
          name: "local",
          apiUrl: "http://localhost:7001",
          user: "alice",
          current: true,
        },
        {
          name: "public",
          apiUrl: "https://api.thestacks.org",
          user: null,
          current: false,
        },
      ],
    });
  });

  it("says how to add a profile when there are none", async () => {
    const empty = await createTestRuntime();

    await runCli(["profile", "list"], empty);

    expect(empty.stdout.text).toContain("raven profile add <name> <api-url>");
  });

  it("switches the current profile", async () => {
    expect(await runCli(["profile", "use", "public"], runtime)).toBe(
      ExitCode.Success
    );

    expect((await readConfig(runtime.configDir)).current).toBe("public");
    expect(runtime.stdout.text).toBe(
      "Now using profile public (https://api.thestacks.org)\n"
    );
  });

  it("fails to use an undefined profile", async () => {
    expect(await runCli(["profile", "use", "nope"], runtime)).toBe(
      ExitCode.Usage
    );
  });
});

describe("raven profile remove", () => {
  let runtime: TestRuntime;
  let auth: FakeAuthServer;
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
        local: { apiUrl: "http://localhost:7001", user: "alice" },
        public: { apiUrl: "https://api.thestacks.org" },
      },
    });
  });

  it("ends the session, deletes the token and clears current", async () => {
    expect(await runCli(["profile", "remove", "local", "--yes"], runtime)).toBe(
      ExitCode.Success
    );

    expect(auth.sessions.has(token)).toBe(false);
    expect(runtime.tokenStore.tokens).toEqual({});
    expect(await readConfig(runtime.configDir)).toEqual({
      profiles: { public: { apiUrl: "https://api.thestacks.org" } },
    });
  });

  it("requires --yes without a terminal", async () => {
    expect(await runCli(["profile", "remove", "local"], runtime)).toBe(
      ExitCode.Usage
    );
    expect((await readConfig(runtime.configDir)).profiles.local).toBeDefined();
  });

  it("asks for confirmation at a terminal", async () => {
    const prompter = new ScriptedPrompter([false]);
    Object.assign(runtime, interactive(prompter));

    expect(await runCli(["profile", "remove", "public"], runtime)).toBe(
      ExitCode.General
    );
    expect(prompter.asked).toEqual([
      "Remove profile public (https://api.thestacks.org)?",
    ]);
    expect((await readConfig(runtime.configDir)).profiles.public).toBeDefined();
  });

  it("still removes the profile when the server is unreachable", async () => {
    auth.unreachable = true;

    expect(await runCli(["profile", "remove", "local", "-y"], runtime)).toBe(
      ExitCode.Success
    );
    expect(runtime.stderr.text).toContain(
      "Warning: couldn't end the session on the server (could not reach http://localhost:7001: ECONNREFUSED)"
    );
    expect(runtime.tokenStore.tokens).toEqual({});
  });
});
