import { writeConfig } from "#src/config/config-file.js";
import { ExitCode } from "#src/errors.js";
import { runCli } from "#src/program.js";
import { FakeAuthServer } from "#src/testing/fake-auth.js";
import {
  createTestRuntime,
  jsonResponse,
  MemoryTokenStore,
  type TestRuntime,
} from "#src/testing/test-runtime.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOCAL = "http://localhost:7001";

const vanderbilt = {
  id: "01KVAQ3RGRZ9R8WGB9GXY2WX5F",
  name: "Vanderbilt University",
  slug: "vanderbilt",
  avatar: null,
  profile: "Vanderbilt University\nNashville, TN",
  rorId: "02vm5rt34",
  unlisted: false,
  createdAt: "2026-06-17T11:57:51.000Z",
  updatedAt: null,
  canEdit: true,
};

describe("raven orgs get", () => {
  let runtime: TestRuntime;
  let auth: FakeAuthServer;
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  function lastRequest(): Request {
    return fetchMock.mock.calls.at(-1)?.[0] as Request;
  }

  beforeEach(async () => {
    auth = new FakeAuthServer();
    fetchMock = vi.fn<typeof fetch>((input) => {
      const { pathname } = new URL((input as Request).url);
      return Promise.resolve(
        pathname === "/api/v1/orgs/vanderbilt"
          ? jsonResponse(vanderbilt)
          : jsonResponse(
              {
                type: "application_error",
                errors: { org: { message: "Organization not found" } },
              },
              404
            )
      );
    });
    runtime = await createTestRuntime({
      fetch: fetchMock,
      authFetch: auth.fetch,
      tokenStore: new MemoryTokenStore({ local: auth.issueToken() }),
    });
    await writeConfig(runtime.configDir, {
      current: "local",
      profiles: {
        local: {
          apiUrl: LOCAL,
          user: "alice",
          sessionExpiresAt: "2026-09-30T00:00:00.000Z",
        },
        public: { apiUrl: LOCAL },
      },
    });
  });

  it("shows the organization to a logged-in user", async () => {
    expect(await runCli(["orgs", "get", "vanderbilt"], runtime)).toBe(
      ExitCode.Success
    );

    expect(lastRequest().url).toBe(`${LOCAL}/api/v1/orgs/vanderbilt`);
    expect(lastRequest().headers.get("Authorization")).toBe("Bearer token-1");
    expect(runtime.stdout.text).toBe(
      [
        "Name:      Vanderbilt University",
        "Slug:      vanderbilt",
        "ID:        01KVAQ3RGRZ9R8WGB9GXY2WX5F",
        "ROR ID:    02vm5rt34",
        "Unlisted:  no",
        "Avatar:    -",
        "Created:   2026-06-17T11:57:51.000Z",
        "Updated:   -",
        "Can edit:  yes",
        "Profile:   Vanderbilt University",
        "           Nashville, TN",
        "",
      ].join("\n")
    );
  });

  it("works anonymously and hides Can edit", async () => {
    await runCli(["orgs", "get", "vanderbilt", "--profile", "public"], runtime);

    expect(lastRequest().headers.get("Authorization")).toBeNull();
    expect(runtime.stdout.text).not.toContain("Can edit");
  });

  it("sends no token with --anonymous", async () => {
    await runCli(["orgs", "get", "vanderbilt", "--anonymous"], runtime);

    expect(lastRequest().headers.get("Authorization")).toBeNull();
  });

  it("prints the API object with --json", async () => {
    await runCli(["orgs", "get", "vanderbilt", "--json"], runtime);

    expect(JSON.parse(runtime.stdout.text)).toEqual(vanderbilt);
  });

  it("exits with the not-found code for an unknown org", async () => {
    expect(await runCli(["orgs", "get", "nope"], runtime)).toBe(
      ExitCode.NotFound
    );
    expect(runtime.stderr.text).toBe("Error: org: Organization not found\n");
  });

  it("explains a rejected token", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          type: "application_error",
          errors: { auth: { message: "Authentication required" } },
        },
        401
      )
    );

    expect(await runCli(["orgs", "get", "vanderbilt"], runtime)).toBe(
      ExitCode.Auth
    );
    expect(runtime.stderr.text).toContain(
      "the session for profile local has expired or was revoked; run raven auth login --profile local"
    );
  });

  it("warns when the stored session has expired", async () => {
    auth.sessions.clear();
    await writeConfig(runtime.configDir, {
      current: "local",
      profiles: {
        local: {
          apiUrl: LOCAL,
          user: "alice",
          sessionExpiresAt: "2026-09-01T00:00:00.000Z",
        },
      },
    });

    expect(await runCli(["orgs", "get", "vanderbilt"], runtime)).toBe(
      ExitCode.Success
    );
    expect(runtime.stderr.text).toContain(
      "Warning: the session for profile local has expired"
    );
  });
});
