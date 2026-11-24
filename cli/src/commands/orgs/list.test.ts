import { writeConfig } from "#src/config/config-file.js";
import { ExitCode } from "#src/errors.js";
import { runCli } from "#src/program.js";
import {
  createTestRuntime,
  jsonResponse,
  MemoryTokenStore,
  type TestRuntime,
} from "#src/testing/test-runtime.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOCAL = "http://localhost:7001";

function org(slug: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `id-${slug}`,
    name: `Org ${slug}`,
    slug,
    avatar: null,
    profile: null,
    rorId: null,
    unlisted: false,
    createdAt: "2026-06-17T11:57:51.000Z",
    updatedAt: null,
    ...overrides,
  };
}

const allOrgs = [
  org("alpha", { rorId: "02vm5rt34" }),
  org("beta", { unlisted: true }),
  org("gamma"),
];

/** Serves `allOrgs` from GET /api/v1/orgs, paginated like the real route. */
function orgsServer() {
  return vi.fn<typeof fetch>((input) => {
    const url = new URL((input as Request).url);
    const page = Number(url.searchParams.get("page") ?? "1");
    const perPage = Number(url.searchParams.get("perPage") ?? "20");
    const items = allOrgs.slice((page - 1) * perPage, page * perPage);
    return Promise.resolve(
      jsonResponse({
        items,
        pagination: { total: allOrgs.length, page, perPage },
      })
    );
  });
}

describe("raven orgs list", () => {
  let runtime: TestRuntime;
  let fetchMock: ReturnType<typeof orgsServer>;

  function requestUrls(): string[] {
    return fetchMock.mock.calls.map(([input]) => (input as Request).url);
  }

  beforeEach(async () => {
    fetchMock = orgsServer();
    runtime = await createTestRuntime({
      fetch: fetchMock,
      tokenStore: new MemoryTokenStore({ local: "secret" }),
    });
    await writeConfig(runtime.configDir, {
      current: "local",
      profiles: {
        local: {
          apiUrl: LOCAL,
          user: "admin",
          sessionExpiresAt: "2026-09-30T00:00:00.000Z",
        },
      },
    });
  });

  it("lists a page of organizations as a table", async () => {
    expect(await runCli(["orgs", "list", "--per-page", "2"], runtime)).toBe(
      ExitCode.Success
    );

    expect(requestUrls()).toEqual([`${LOCAL}/api/v1/orgs?page=1&perPage=2`]);
    expect(runtime.stdout.text).toBe(
      [
        "SLUG   NAME       ROR ID     UNLISTED",
        "alpha  Org alpha  02vm5rt34",
        "beta   Org beta   -          yes",
        "",
        "Showing 1-2 of 3; next page: raven orgs list --page 2",
        "",
      ].join("\n")
    );
  });

  it("shows a later page", async () => {
    await runCli(["orgs", "list", "--page", "2", "--per-page", "2"], runtime);

    expect(runtime.stdout.text).toContain("gamma");
    expect(runtime.stdout.text).toContain("Showing 3-3 of 3\n");
  });

  it("sends the stored token so site admins see unlisted orgs", async () => {
    await runCli(["orgs", "list"], runtime);

    const request = fetchMock.mock.calls[0]?.[0] as Request;
    expect(request.headers.get("Authorization")).toBe("Bearer secret");
  });

  it("fetches every page with --all", async () => {
    await runCli(["orgs", "list", "--all", "--json"], runtime);

    expect(requestUrls()).toEqual([`${LOCAL}/api/v1/orgs?page=1&perPage=100`]);
    expect(JSON.parse(runtime.stdout.text)).toEqual({
      items: allOrgs,
      pagination: { total: 3, page: 1, perPage: 3 },
    });
  });

  it("passes the API's envelope through with --json", async () => {
    await runCli(["orgs", "list", "--json", "--per-page", "1"], runtime);

    expect(JSON.parse(runtime.stdout.text)).toEqual({
      items: [allOrgs[0]],
      pagination: { total: 3, page: 1, perPage: 1 },
    });
  });

  it("says so when there are no organizations", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        items: [],
        pagination: { total: 0, page: 1, perPage: 20 },
      })
    );

    await runCli(["orgs", "list"], runtime);

    expect(runtime.stdout.text).toBe("No organizations\n");
  });

  it("rejects a page that isn't a positive whole number", async () => {
    expect(await runCli(["orgs", "list", "--page", "0"], runtime)).toBe(
      ExitCode.Usage
    );
    expect(runtime.stderr.text).toContain(
      'expected a positive whole number, got "0"'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
