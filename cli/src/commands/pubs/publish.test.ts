import { writeConfig } from "#src/config/config-file.js";
import { ExitCode } from "#src/errors.js";
import { runCli } from "#src/program.js";
import { LinkFile } from "#src/pubs/link-file.js";
import { FakeAuthServer } from "#src/testing/fake-auth.js";
import {
  createTestRuntime,
  interactive,
  jsonResponse,
  MemoryTokenStore,
  ScriptedPrompter,
  type TestRuntime,
} from "#src/testing/test-runtime.js";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOCAL = "http://localhost:7001";
const PUB_ID = "01KX0000000000000000000PUB";
const SLUG = "ravens-01kx0000000000000000000pub";
const ETAG = '"etag-1"';

const published = {
  publicationId: PUB_ID,
  slug: SLUG,
  versionNumber: 2,
  state: "PUBLISHED",
  doi: "10.57844/ravens",
  versionDoi: "10.57844/ravens.v2",
};

interface Draft {
  versionNumber: number;
  versionDesc: string | null;
  validationErrors: Array<{ path: string[]; message: string }>;
  etag: string;
}

describe("raven pubs publish", () => {
  let runtime: TestRuntime;
  let auth: FakeAuthServer;
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let dir: string;
  let paper: string;
  let draft: Draft;

  function requests(): Request[] {
    return fetchMock.mock.calls.map(([input]) => input as Request);
  }

  function posts(): Request[] {
    return requests().filter((request) => request.method === "POST");
  }

  async function useRuntime(overrides = {}): Promise<void> {
    runtime = await createTestRuntime({
      fetch: fetchMock,
      authFetch: auth.fetch,
      tokenStore: new MemoryTokenStore({ local: auth.issueToken() }),
      ...overrides,
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
  }

  beforeEach(async () => {
    auth = new FakeAuthServer();
    draft = {
      versionNumber: 2,
      versionDesc: null,
      validationErrors: [],
      etag: ETAG,
    };
    fetchMock = vi.fn<typeof fetch>((input) => {
      const request = input as Request;
      const { pathname } = new URL(request.url);
      if (pathname === "/api/v1/publications/p/other-pub") {
        return Promise.resolve(
          jsonResponse({
            publication: {
              id: "01KXOTHER00000000000000PUB",
              slug: "other-pub",
            },
          })
        );
      }
      if (pathname.endsWith("/draft")) {
        const response = jsonResponse({
          publication: {
            id: PUB_ID,
            slug: SLUG,
            title: "Ravens",
            versionNumber: draft.versionNumber,
            versionDesc: draft.versionDesc,
          },
          validationErrors: draft.validationErrors,
        });
        response.headers.set("ETag", draft.etag);
        return Promise.resolve(response);
      }
      return Promise.resolve(jsonResponse(published, 201));
    });
    await useRuntime();
    dir = await mkdtemp(join(tmpdir(), "raven-publish-"));
    paper = join(dir, "paper.md");
    await writeFile(paper, "# Ravens\n");
    await (
      await LinkFile.read(dir)
    ).set(LOCAL, "paper.md", { id: PUB_ID, slug: SLUG, etag: ETAG });
  });

  it("publishes the linked draft with a note", async () => {
    expect(
      await runCli(
        [
          "pubs",
          "publish",
          paper,
          "--note",
          "New field data",
          "--authors-consented",
          "--yes",
        ],
        runtime
      )
    ).toBe(ExitCode.Success);

    const [read, post] = requests();
    expect(read?.url).toBe(`${LOCAL}/api/v1/publications/id/${PUB_ID}/draft`);
    expect(read?.headers.get("Accept")).toBe("application/json");
    expect(post?.method).toBe("POST");
    expect(post?.url).toBe(
      `${LOCAL}/api/v1/publications/id/${PUB_ID}/versions`
    );
    expect(post?.headers.get("Authorization")).toBe("Bearer token-1");
    expect(await post?.json()).toEqual({ note: "New field data" });
    expect(runtime.stdout.text).toBe(
      [
        `Published version 2 of ${SLUG}.`,
        "DOI:          10.57844/ravens",
        "Version DOI:  10.57844/ravens.v2",
        "",
      ].join("\n")
    );
    expect(runtime.stderr.text).toBe("");
  });

  it("asks for confirmation on a terminal", async () => {
    const prompter = new ScriptedPrompter([true, true]);
    await useRuntime(interactive(prompter));

    expect(
      await runCli(["pubs", "publish", paper, "--note", "x"], runtime)
    ).toBe(ExitCode.Success);
    expect(prompter.asked).toEqual([
      "I confirm that all byline authors have consented to this release.",
      `Publish version 2 of ${SLUG} ("Ravens")? It becomes public, its DOIs are registered and followers are notified.`,
    ]);
    expect(prompter.confirmDefaults).toEqual([false, false]);
    expect(posts()).toHaveLength(1);
  });

  it("publishes nothing when the confirmation is declined", async () => {
    await useRuntime(interactive(new ScriptedPrompter([true, false])));

    expect(
      await runCli(["pubs", "publish", paper, "--note", "x"], runtime)
    ).toBe(ExitCode.General);
    expect(posts()).toEqual([]);
  });

  it("publishes nothing when the authors' consent isn't confirmed", async () => {
    const prompter = new ScriptedPrompter([false]);
    await useRuntime(interactive(prompter));

    expect(
      await runCli(["pubs", "publish", paper, "--note", "x", "--yes"], runtime)
    ).toBe(ExitCode.General);
    expect(prompter.asked).toEqual([
      "I confirm that all byline authors have consented to this release.",
    ]);
    expect(posts()).toEqual([]);
  });

  it("needs --authors-consented without a terminal, even with --yes", async () => {
    expect(
      await runCli(["pubs", "publish", paper, "--note", "x", "--yes"], runtime)
    ).toBe(ExitCode.Usage);
    expect(runtime.stderr.text).toContain(
      `pass --authors-consented to confirm that all byline authors of ${SLUG} have consented to this release`
    );
    expect(posts()).toEqual([]);
  });

  describe("with nobody in the byline", () => {
    const BYLINE_ISSUE = {
      path: ["contributors"],
      message: "At least one contributor must be in the byline",
    };
    const ME = {
      userId: "01KX0000000000000000000USR",
      roles: ["Writing"],
      inByline: true,
      affiliations: [],
    };

    function patches(): Request[] {
      return requests().filter((request) => request.method === "PATCH");
    }

    beforeEach(() => {
      draft.validationErrors = [BYLINE_ISSUE];
    });

    it("offers to add the caller on a terminal, then publishes", async () => {
      const prompter = new ScriptedPrompter([true, true, true]);
      await useRuntime(interactive(prompter));

      expect(
        await runCli(["pubs", "publish", paper, "--note", "x"], runtime)
      ).toBe(ExitCode.Success);
      expect(prompter.asked[0]).toBe(
        `Nobody is in the byline of ${SLUG}. Add yourself as Writing?`
      );
      expect(prompter.confirmDefaults[0]).toBe(true);
      const [patch] = patches();
      expect(patch?.url).toBe(
        `${LOCAL}/api/v1/publications/id/${PUB_ID}/draft`
      );
      expect(await patch?.json()).toEqual({ contributors: [ME] });
      expect(posts()).toHaveLength(1);
    });

    it("adds the caller with --add-me-to-byline, without a terminal", async () => {
      expect(
        await runCli(
          [
            "pubs",
            "publish",
            paper,
            "--note",
            "x",
            "--add-me-to-byline",
            "--authors-consented",
            "--yes",
          ],
          runtime
        )
      ).toBe(ExitCode.Success);
      expect(await patches()[0]?.json()).toEqual({ contributors: [ME] });
      expect(posts()).toHaveLength(1);
    });

    it("explains the fix, changing nothing, when declined or without a terminal", async () => {
      for (const overrides of [
        interactive(new ScriptedPrompter([false])),
        {},
      ]) {
        await useRuntime(overrides);

        expect(
          await runCli(
            [
              "pubs",
              "publish",
              paper,
              "--note",
              "x",
              "--authors-consented",
              "--yes",
            ],
            runtime
          )
        ).toBe(ExitCode.Validation);
        expect(runtime.stderr.text).toContain(
          "contributors: At least one contributor must be in the byline"
        );
        expect(runtime.stderr.text).toContain("--add-me-to-byline");
      }
      expect(patches()).toEqual([]);
      expect(posts()).toEqual([]);
    });

    it("doesn't offer it while something else stops publishing too", async () => {
      draft.validationErrors = [
        BYLINE_ISSUE,
        { path: ["title"], message: "Title is required" },
      ];
      const prompter = new ScriptedPrompter([]);
      await useRuntime(interactive(prompter));

      expect(
        await runCli(["pubs", "publish", paper, "--note", "x"], runtime)
      ).toBe(ExitCode.Validation);
      expect(prompter.asked).toEqual([]);
      expect(patches()).toEqual([]);
    });
  });

  it("needs --yes without a terminal", async () => {
    expect(
      await runCli(
        ["pubs", "publish", paper, "--note", "x", "--authors-consented"],
        runtime
      )
    ).toBe(ExitCode.Usage);
    expect(runtime.stderr.text).toContain(`pass --yes to publish ${SLUG}`);
    expect(posts()).toEqual([]);
  });

  it("needs --note after the first version, unless the draft has one", async () => {
    expect(
      await runCli(
        ["pubs", "publish", paper, "--authors-consented", "--yes"],
        runtime
      )
    ).toBe(ExitCode.Validation);
    expect(runtime.stderr.text).toBe(
      [
        `Error: ${SLUG} can't be published yet:`,
        "  note: pass --note to describe what changed in this version",
        "",
      ].join("\n")
    );
    expect(posts()).toEqual([]);

    draft.versionDesc = "Fixed typos";
    expect(
      await runCli(
        ["pubs", "publish", paper, "--authors-consented", "--yes"],
        runtime
      )
    ).toBe(ExitCode.Success);
    expect(await posts()[0]?.json()).toEqual({});
  });

  it("lets --note supply the version description the server reports missing", async () => {
    draft.validationErrors = [
      {
        path: ["versionDesc"],
        message:
          "Version description required for new versions of a published pub",
      },
    ];

    expect(
      await runCli(
        [
          "pubs",
          "publish",
          paper,
          "--note",
          "x",
          "--authors-consented",
          "--yes",
        ],
        runtime
      )
    ).toBe(ExitCode.Success);
    expect(await posts()[0]?.json()).toEqual({ note: "x" });

    expect(
      await runCli(
        ["pubs", "publish", paper, "--authors-consented", "--yes"],
        runtime
      )
    ).toBe(ExitCode.Validation);
    expect(runtime.stderr.text).toBe(
      [
        `Error: ${SLUG} can't be published yet:`,
        "  note: pass --note to describe what changed in this version",
        "",
      ].join("\n")
    );
  });

  it("publishes a first version without a note", async () => {
    draft.versionNumber = 1;

    expect(
      await runCli(
        ["pubs", "publish", paper, "--authors-consented", "--yes"],
        runtime
      )
    ).toBe(ExitCode.Success);
  });

  it("explains that there's nothing to publish without an open draft", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse(
          {
            type: "application_error",
            errors: { draft: { message: "No draft found" } },
          },
          404
        )
      )
    );

    expect(
      await runCli(
        ["pubs", "publish", paper, "--authors-consented", "--yes"],
        runtime
      )
    ).toBe(ExitCode.NotFound);
    expect(runtime.stderr.text).toBe(
      `Error: nothing to publish: the latest version of ${SLUG} is already published; push changes with \`raven pubs push\` to open a new draft\n`
    );
    expect(posts()).toEqual([]);
  });

  it("refuses a draft the server reports as not ready", async () => {
    draft.validationErrors = [
      { path: ["contributors"], message: "At least one byline contributor" },
    ];

    expect(
      await runCli(
        [
          "pubs",
          "publish",
          paper,
          "--note",
          "x",
          "--authors-consented",
          "--yes",
        ],
        runtime
      )
    ).toBe(ExitCode.Validation);
    expect(runtime.stderr.text).toContain(
      "  contributors: At least one byline contributor"
    );
    expect(posts()).toEqual([]);
  });

  it("reports what would be published with --dry-run", async () => {
    expect(await runCli(["pubs", "publish", paper, "--dry-run"], runtime)).toBe(
      ExitCode.Success
    );

    expect(posts()).toEqual([]);
    expect(runtime.stdout.text).toBe(
      [
        `Would publish version 2 of ${SLUG}.`,
        "Title:  Ravens",
        "Note:   -",
        "Not ready to publish yet:",
        "  note: pass --note to describe what changed in this version",
        "",
      ].join("\n")
    );
  });

  it("warns when the draft changed on the server since the last push", async () => {
    draft.etag = '"etag-2"';

    await runCli(
      ["pubs", "publish", paper, "--note", "x", "--authors-consented", "--yes"],
      runtime
    );

    expect(runtime.stderr.text).toContain(
      `Warning: the draft of ${SLUG} was edited on the server since paper.md's last push`
    );
  });

  it("publishes another publication by slug", async () => {
    expect(
      await runCli(
        [
          "pubs",
          "publish",
          "--slug",
          "other-pub",
          "--note",
          "x",
          "--authors-consented",
          "--yes",
        ],
        runtime
      )
    ).toBe(ExitCode.Success);
    expect(requests()[1]?.url).toContain(
      "/publications/id/01KXOTHER00000000000000PUB/draft"
    );
  });

  it("needs a path or --slug", async () => {
    expect(
      await runCli(["pubs", "publish", "--authors-consented", "--yes"], runtime)
    ).toBe(ExitCode.Usage);
    expect(requests()).toEqual([]);
  });

  it("prints the response with --json", async () => {
    await runCli(
      [
        "pubs",
        "publish",
        paper,
        "--note",
        "x",
        "--authors-consented",
        "--yes",
        "--json",
      ],
      runtime
    );

    expect(JSON.parse(runtime.stdout.text)).toEqual(published);
  });
});
