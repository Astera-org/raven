import { USER_AGENT_DETAILS, USER_AGENT_PREFIX } from "#src/api/auth-client.js";
import { readConfig, writeConfig } from "#src/config/config-file.js";
import { ExitCode } from "#src/errors.js";
import { runCli } from "#src/program.js";
import { FakeAuthServer } from "#src/testing/fake-auth.js";
import {
  createTestRuntime,
  interactive,
  MemoryInput,
  ScriptedPrompter,
  type TestRuntime,
} from "#src/testing/test-runtime.js";
import { beforeEach, describe, expect, it } from "vitest";

const LOCAL = "http://localhost:7001";
const STAGING = "https://api.staging.thestacks.org";
const HOSTNAME = "Ada's Mac";
/** Answers to the computer-name prompt: enter a custom name. */
const NAME_ANSWERS = ["custom", HOSTNAME];

describe("raven auth login", () => {
  let auth: FakeAuthServer;
  let runtime: TestRuntime;

  async function login(args: string[], password = "secret") {
    runtime.stdin = new MemoryInput(`${password}\n`);
    return runCli(
      ["auth", "login", ...args, "--username", "alice", "--password-stdin"],
      runtime
    );
  }

  beforeEach(async () => {
    auth = new FakeAuthServer();
    runtime = await createTestRuntime({ authFetch: auth.fetch });
  });

  it("creates a profile named after the host and stores the session", async () => {
    expect(await login([LOCAL])).toBe(ExitCode.Success);

    const [token] = [...auth.sessions.keys()];
    expect(runtime.tokenStore.tokens).toEqual({ "localhost:7001": token });
    expect(await readConfig(runtime.configDir)).toEqual({
      current: "localhost:7001",
      profiles: {
        "localhost:7001": {
          apiUrl: LOCAL,
          user: "alice",
          sessionExpiresAt: auth.expiresAt,
          id: expect.any(String),
        },
      },
    });
    expect(auth.calls.map((call) => call.path)).toEqual([
      "/sign-in/username",
      "/get-session",
    ]);
    expect(runtime.stdout.text).toBe(
      `Logged in to ${LOCAL} as alice (profile localhost:7001)\n`
    );
  });

  it("uses the email endpoint for an identifier with @", async () => {
    runtime.stdin = new MemoryInput("secret");

    await runCli(
      [
        "auth",
        "login",
        LOCAL,
        "--username",
        "alice@example.org",
        "--password-stdin",
      ],
      runtime
    );

    expect(auth.calls[0]).toMatchObject({
      path: "/sign-in/email",
      body: { email: "alice@example.org", password: "secret" },
    });
  });

  it("reuses the one profile for a server", async () => {
    await writeConfig(runtime.configDir, {
      current: "other",
      profiles: {
        other: { apiUrl: STAGING },
        dev: { apiUrl: `${LOCAL}/`, hostname: HOSTNAME },
      },
    });

    await login([LOCAL]);

    const config = await readConfig(runtime.configDir);
    expect(Object.keys(config.profiles).sort()).toEqual(["dev", "other"]);
    expect(config.profiles.dev?.user).toBe("alice");
    expect(config.current).toBe("dev");
  });

  it("asks for --profile when several profiles use the server", async () => {
    await writeConfig(runtime.configDir, {
      profiles: { a: { apiUrl: LOCAL }, b: { apiUrl: LOCAL } },
    });

    expect(await login([LOCAL])).toBe(ExitCode.Usage);
    expect(runtime.stderr.text).toContain("several profiles use");
    expect(auth.calls).toEqual([]);
  });

  it("creates a named profile with --profile and a server", async () => {
    await login(["--profile", "dev", LOCAL]);

    expect((await readConfig(runtime.configDir)).profiles.dev?.apiUrl).toBe(
      LOCAL
    );
  });

  it("refuses --profile with a different server than the profile's", async () => {
    await writeConfig(runtime.configDir, {
      profiles: { dev: { apiUrl: STAGING } },
    });

    expect(await login(["--profile", "dev", LOCAL])).toBe(ExitCode.Usage);
  });

  it("requires --profile to name an existing profile without a server", async () => {
    expect(await login(["--profile", "dev"])).toBe(ExitCode.Usage);
    expect(runtime.stderr.text).toContain(
      "run raven auth login --profile dev <api-url> to create it"
    );
  });

  it("uses RAVEN_PROFILE, then current, with no arguments", async () => {
    await writeConfig(runtime.configDir, {
      current: "a",
      profiles: {
        a: { apiUrl: LOCAL },
        b: { apiUrl: STAGING, hostname: HOSTNAME },
      },
    });
    runtime.env.RAVEN_PROFILE = "b";

    await login([]);

    expect(auth.calls[0]?.url).toBe(`${STAGING}/api/auth2/sign-in/username`);
    expect((await readConfig(runtime.configDir)).current).toBe("b");
  });

  it("fails without a profile or a terminal", async () => {
    expect(await login([])).toBe(ExitCode.Usage);
    expect(runtime.stderr.text).toContain(
      "no profile selected; run raven auth login <api-url> or raven auth login --profile <name>"
    );
  });

  it("prompts for the password with --username at a terminal", async () => {
    const prompter = new ScriptedPrompter([...NAME_ANSWERS, "secret"]);
    Object.assign(runtime, interactive(prompter));

    expect(
      await runCli(["auth", "login", LOCAL, "--username", "alice"], runtime)
    ).toBe(ExitCode.Success);
    expect(prompter.asked).toEqual([
      "What should this computer be called?",
      "Computer name",
      "Password",
    ]);
    expect(
      (await readConfig(runtime.configDir)).profiles["localhost:7001"]?.hostname
    ).toBe(HOSTNAME);
  });

  it("doesn't ask for a computer name without a terminal", async () => {
    expect(await login([LOCAL])).toBe(ExitCode.Success);

    expect(auth.calls[0]?.userAgent).not.toContain("host=");
    expect(
      (await readConfig(runtime.configDir)).profiles["localhost:7001"]
    ).not.toHaveProperty("hostname");
  });

  it("encodes the profile and computer name in the User-Agent", async () => {
    Object.assign(
      runtime,
      interactive(new ScriptedPrompter(["custom", "Ada’s Mac; x)"]))
    );
    runtime.stdin = new MemoryInput("secret\n", true);

    expect(
      await runCli(
        [
          "auth",
          "login",
          "--profile",
          "café",
          LOCAL,
          "--username",
          "alice",
          "--password-stdin",
        ],
        runtime
      )
    ).toBe(ExitCode.Success);

    const userAgent = auth.calls[0]?.userAgent ?? "";
    expect(userAgent).toContain(`profile=${encodeURIComponent("café")}`);
    expect(userAgent).toContain(`host=${encodeURIComponent("Ada’s Mac; x)")}`);
  });

  it("offers the profile's user as the default username at a terminal", async () => {
    await writeConfig(runtime.configDir, {
      current: "local",
      profiles: { local: { apiUrl: LOCAL, user: "alice", hostname: HOSTNAME } },
    });
    const prompter = new ScriptedPrompter(["alice"]);
    Object.assign(runtime, interactive(prompter), {
      stdin: new MemoryInput("secret\n", true),
    });

    expect(await runCli(["auth", "login", "--password-stdin"], runtime)).toBe(
      ExitCode.Success
    );
    expect(prompter.asked).toEqual(["Username or email"]);
    expect(prompter.textDefaults).toEqual(["alice"]);
  });

  it("uses the profile's user without --username or a terminal", async () => {
    await writeConfig(runtime.configDir, {
      current: "local",
      profiles: { local: { apiUrl: LOCAL, user: "alice", hostname: HOSTNAME } },
    });
    runtime.stdin = new MemoryInput("secret\n");

    expect(await runCli(["auth", "login", "--password-stdin"], runtime)).toBe(
      ExitCode.Success
    );
    expect(auth.calls[0]?.body).toMatchObject({ username: "alice" });
  });

  it("requires credentials without a terminal", async () => {
    expect(await runCli(["auth", "login", LOCAL], runtime)).toBe(
      ExitCode.Usage
    );
    expect(runtime.stderr.text).toContain("missing --username");

    expect(
      await runCli(["auth", "login", LOCAL, "--username", "alice"], runtime)
    ).toBe(ExitCode.Usage);
    expect(runtime.stderr.text).toContain("pass --password-stdin");
  });

  it("reports a wrong password as an auth error and stores nothing", async () => {
    expect(await login([LOCAL], "wrong")).toBe(ExitCode.Auth);
    expect(runtime.stderr.text).toBe("Error: Invalid username or password\n");
    expect(runtime.tokenStore.tokens).toEqual({});
  });

  it("ends the previous session when logging in again", async () => {
    await login([LOCAL]);
    const firstToken = runtime.tokenStore.tokens["localhost:7001"] ?? "";

    await login([LOCAL]);

    expect(auth.sessions.has(firstToken)).toBe(false);
    expect(auth.sessions.size).toBe(1);
  });

  it("reports login as JSON", async () => {
    await login([LOCAL, "--json"]);

    expect(JSON.parse(runtime.stdout.text)).toEqual({
      profile: {
        name: "localhost:7001",
        apiUrl: LOCAL,
        user: "alice",
        current: true,
      },
      sessionExpiresAt: auth.expiresAt,
    });
  });

  describe("in the browser", () => {
    let opened: string[];

    function atTerminal(answers: string[] = []) {
      opened = [];
      const prompter = new ScriptedPrompter([...answers, ...NAME_ANSWERS]);
      Object.assign(runtime, interactive(prompter), {
        openUrl: async (url: string) => {
          opened.push(url);
        },
      });
    }

    it("prompts for the server and waits for approval", async () => {
      atTerminal([LOCAL]);

      expect(await runCli(["auth", "login"], runtime)).toBe(ExitCode.Success);

      expect(opened).toEqual([
        `${auth.verificationUri}?user_code=${auth.userCode}`,
      ]);
      expect(runtime.stderr.text).toContain(
        `Open ${auth.verificationUri} and enter the code ABCD-EFGH`
      );
      expect(auth.calls.map((call) => call.path)).toEqual([
        "/device/code",
        "/device/token",
        "/device/token",
        "/get-session",
      ]);
      expect(auth.calls[0]?.body).toEqual({ client_id: "stacks-cli" });
      const [token] = [...auth.sessions.keys()];
      expect(runtime.tokenStore.tokens).toEqual({ "localhost:7001": token });
    });

    it("identifies the device in the User-Agent", async () => {
      atTerminal();

      expect(await runCli(["auth", "login", LOCAL], runtime)).toBe(
        ExitCode.Success
      );

      const userAgentStart = `${USER_AGENT_PREFIX} (${USER_AGENT_DETAILS}`;
      for (const call of auth.calls) {
        expect(call.userAgent?.startsWith(userAgentStart)).toBe(true);
      }
    });

    it("prints the code when no browser opens", async () => {
      atTerminal();
      runtime.openUrl = () => Promise.reject(new Error("no browser"));

      expect(await runCli(["auth", "login", LOCAL], runtime)).toBe(
        ExitCode.Success
      );
      expect(runtime.stderr.text).toContain("ABCD-EFGH");
    });

    it("prints the code as JSON with --json", async () => {
      atTerminal();

      await runCli(["auth", "login", LOCAL, "--json"], runtime);

      const [notice] = runtime.stderr.text.split("\n");
      expect(JSON.parse(notice ?? "")).toEqual({
        verificationUri: auth.verificationUri,
        verificationUriComplete: `${auth.verificationUri}?user_code=${auth.userCode}`,
        userCode: auth.userCode,
      });
    });

    it("accepts an http approval page on localhost", async () => {
      atTerminal();
      auth.verificationUri = "http://localhost:3000/device";

      expect(await runCli(["auth", "login", LOCAL], runtime)).toBe(
        ExitCode.Success
      );
      expect(opened).toEqual([
        `http://localhost:3000/device?user_code=${auth.userCode}`,
      ]);
    });

    it("refuses an http approval page on another host", async () => {
      atTerminal();
      auth.verificationUri = "http://thestacks.org/device";

      expect(await runCli(["auth", "login", LOCAL], runtime)).not.toBe(
        ExitCode.Success
      );
      expect(opened).toEqual([]);
      expect(runtime.tokenStore.tokens).toEqual({});
    });

    it("reports a denied login as an auth error and stores nothing", async () => {
      atTerminal();
      auth.deviceTokenReplies = ["authorization_pending", "access_denied"];

      expect(await runCli(["auth", "login", LOCAL], runtime)).toBe(
        ExitCode.Auth
      );
      expect(runtime.stderr.text).toContain("Login was denied in the browser.");
      expect(runtime.tokenStore.tokens).toEqual({});
    });

    it("reports an expired code as an auth error", async () => {
      atTerminal();
      auth.deviceTokenReplies = ["expired_token"];

      expect(await runCli(["auth", "login", LOCAL], runtime)).toBe(
        ExitCode.Auth
      );
      expect(runtime.stderr.text).toContain("The login code expired");
    });

    it("stops polling once the code expires", async () => {
      atTerminal();
      auth.deviceExpiresIn = 0;

      expect(await runCli(["auth", "login", LOCAL], runtime)).toBe(
        ExitCode.Auth
      );
      expect(auth.calls.map((call) => call.path)).toEqual(["/device/code"]);
    });
  });
});
