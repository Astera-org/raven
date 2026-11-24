import { writeConfig } from "#src/config/config-file.js";
import { ExitCode } from "#src/errors.js";
import { runCli } from "#src/program.js";
import { LinkFile } from "#src/pubs/link-file.js";
import { FakeAuthServer } from "#src/testing/fake-auth.js";
import {
  createTestRuntime,
  jsonResponse,
  MemoryTokenStore,
  type TestRuntime,
} from "#src/testing/test-runtime.js";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOCAL = "http://localhost:7001";
const PUB_ID = "01KX0000000000000000000PUB";
const SLUG = "ravens-01kx0000000000000000000pub";
const OLD_ETAG = '"etag-1"';
const NEW_ETAG = '"etag-2"';
const READABLE = "# Ravens\n\nWe watched them.\n";
const SOURCE = "---\ntitle: Ravens\n---\n\nWe watched them.";
const REBUILT =
  "---\ntitle: Ravens\nlicense: CC-BY-4.0\n---\n\nEdited online.\n";
const PUBLICATION = {
  publication: { id: PUB_ID, slug: SLUG },
  bibliography: {
    files: ["refs.bib", "bib/more.bib"],
    entries: { a: { id: "a", type: "document", title: "A" } },
  },
};
const REFS = { filename: "refs.bib", content: "@misc{a, title={A}}\n" };
const MORE = { filename: "bib/more.bib", content: "@misc{b, title={B}}\n" };

function textResponse(body: string, contentType: string): Response {
  return new Response(body, {
    headers: { "Content-Type": contentType, ETag: NEW_ETAG },
  });
}

describe("raven pubs get", () => {
  let runtime: TestRuntime;
  let auth: FakeAuthServer;
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let dir: string;
  let paper: string;
  let sourceResponse: () => Response;
  let bibliographyResponse: { files: { filename: string; content: string }[] };

  function requests(): Request[] {
    return fetchMock.mock.calls.map(([input]) => input as Request);
  }

  async function link(): Promise<unknown> {
    return (await LinkFile.read(dir)).get(LOCAL, "paper.md");
  }

  beforeEach(async () => {
    auth = new FakeAuthServer();
    sourceResponse = () => textResponse(SOURCE, "text/markdown");
    bibliographyResponse = { files: [REFS, MORE] };
    fetchMock = vi.fn<typeof fetch>((input) => {
      const request = input as Request;
      const { pathname } = new URL(request.url);
      const accept = request.headers.get("Accept") ?? "";
      if (pathname.endsWith("/draft/bibliography")) {
        return Promise.resolve(jsonResponse(bibliographyResponse));
      }
      if (pathname.endsWith("/draft/content")) {
        return Promise.resolve(sourceResponse());
      }
      if (accept === "application/json") {
        const response = jsonResponse(PUBLICATION);
        response.headers.set("ETag", NEW_ETAG);
        return Promise.resolve(response);
      }
      if (pathname.endsWith("/draft")) {
        return Promise.resolve(
          textResponse(REBUILT, "text/markdown; variant=myst")
        );
      }
      return Promise.resolve(textResponse(READABLE, "text/markdown"));
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
    dir = await mkdtemp(join(tmpdir(), "raven-get-"));
    paper = join(dir, "paper.md");
    await writeFile(paper, SOURCE);
    await (
      await LinkFile.read(dir)
    ).set(LOCAL, "paper.md", { id: PUB_ID, slug: SLUG, etag: OLD_ETAG });
  });

  it("prints the latest published version as Markdown, by the linked id", async () => {
    expect(
      await runCli(["pubs", "get", paper, "--profile", "public"], runtime)
    ).toBe(ExitCode.Success);

    const [request] = requests();
    expect(request?.url).toBe(`${LOCAL}/api/v1/publications/id/${PUB_ID}`);
    expect(request?.headers.get("Accept")).toBe("text/markdown");
    expect(request?.headers.get("Authorization")).toBeNull();
    expect(runtime.stdout.text).toBe(READABLE);
  });

  it("gets a version by slug", async () => {
    expect(
      await runCli(
        ["pubs", "get", "--slug", "corvid-cognition", "--version-number", "2"],
        runtime
      )
    ).toBe(ExitCode.Success);

    expect(requests()[0]?.url).toBe(
      `${LOCAL}/api/v1/publications/p/corvid-cognition/versions/v2`
    );
  });

  it("prints the API object with --format json or --json", async () => {
    await runCli(["pubs", "get", paper, "--format", "json"], runtime);
    expect(JSON.parse(runtime.stdout.text)).toEqual(PUBLICATION);
    expect(runtime.stdout.text).toBe(
      `${JSON.stringify(PUBLICATION, null, 2)}\n`
    );

    runtime.stdout.text = "";
    await runCli(["pubs", "get", paper, "--json"], runtime);
    expect(JSON.parse(runtime.stdout.text)).toEqual(PUBLICATION);
    expect(requests()[1]?.headers.get("Accept")).toBe("application/json");
  });

  it("warns when the version it prints is a draft", async () => {
    const draft = '---\ntitle: "Ravens"\nversion: 1\nstate: draft\n---\n';
    fetchMock.mockImplementation(() =>
      Promise.resolve(textResponse(draft, "text/markdown"))
    );

    expect(await runCli(["pubs", "get", paper], runtime)).toBe(
      ExitCode.Success
    );
    expect(runtime.stdout.text).toBe(draft);
    expect(runtime.stderr.text).toBe(
      "Warning: version 1 is a draft, not a published version; only its editors can read it\n"
    );

    fetchMock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          publication: { versionNumber: 2, versionState: "DRAFT" },
        })
      )
    );
    runtime.stderr.text = "";
    await runCli(["pubs", "get", paper, "--format", "json"], runtime);
    expect(runtime.stderr.text).toContain("version 2 is a draft");
  });

  it("doesn't warn about a published version", async () => {
    await runCli(["pubs", "get", paper], runtime);
    await runCli(["pubs", "get", paper, "--json"], runtime);

    expect(runtime.stderr.text).toBe("");
  });

  it("prints the draft's source verbatim and records its ETag", async () => {
    expect(await runCli(["pubs", "get", paper, "--draft"], runtime)).toBe(
      ExitCode.Success
    );

    const [request] = requests();
    expect(request?.url).toBe(
      `${LOCAL}/api/v1/publications/id/${PUB_ID}/draft/content`
    );
    expect(request?.headers.get("Authorization")).toBe("Bearer token-1");
    expect(runtime.stdout.text).toBe(SOURCE);
    expect(await link()).toEqual({ id: PUB_ID, slug: SLUG, etag: NEW_ETAG });
    expect(runtime.stderr.text).toContain(
      "the next push replaces it, so merge these changes into paper.md first"
    );
  });

  it("names the bibliography files that differ when it records a new ETag", async () => {
    await writeFile(
      paper,
      "---\ntitle: Ravens\nbibliography: [refs.bib, local.bib]\n---\n\nText.\n"
    );
    await writeFile(join(dir, "refs.bib"), "@misc{a, title={Old A}}\n");
    await writeFile(join(dir, "local.bib"), "@misc{c, title={C}}\n");

    expect(await runCli(["pubs", "get", paper, "--draft"], runtime)).toBe(
      ExitCode.Success
    );

    expect(runtime.stdout.text).toBe(SOURCE);
    expect(await link()).toEqual({ id: PUB_ID, slug: SLUG, etag: NEW_ETAG });
    expect(runtime.stderr.text).toContain(
      [
        "the draft's bibliography differs from the local files, and the next push replaces it with them:",
        "  refs.bib (changed)",
        "  bib/more.bib (only on the server)",
        "  local.bib (only local)",
      ].join("\n")
    );
  });

  it("doesn't mention the bibliography when the local files match it", async () => {
    await writeFile(
      paper,
      "---\ntitle: Ravens\nbibliography: [refs.bib, bib/more.bib]\n---\n\nText.\n"
    );
    await writeFile(join(dir, "refs.bib"), REFS.content);
    await mkdir(join(dir, "bib"));
    await writeFile(join(dir, "bib", "more.bib"), MORE.content);

    await runCli(["pubs", "get", paper, "--draft"], runtime);

    expect(runtime.stderr.text).toContain("merge these changes into paper.md");
    expect(runtime.stderr.text).not.toContain("bibliography");
  });

  it("still records the ETag when the local bibliography can't be read", async () => {
    await writeFile(
      paper,
      "---\ntitle: Ravens\nbibliography: missing.bib\n---\n\nText.\n"
    );

    expect(await runCli(["pubs", "get", paper, "--draft"], runtime)).toBe(
      ExitCode.Success
    );

    expect(await link()).toEqual({ id: PUB_ID, slug: SLUG, etag: NEW_ETAG });
    expect(runtime.stderr.text).toContain(
      "couldn't compare the draft's bibliography with the local files"
    );
  });

  it("says nothing when the draft's ETag is the one already recorded", async () => {
    await (
      await LinkFile.read(dir)
    ).set(LOCAL, "paper.md", { id: PUB_ID, slug: SLUG, etag: NEW_ETAG });

    await runCli(["pubs", "get", paper, "--draft"], runtime);

    expect(runtime.stderr.text).toBe("");
  });

  it("suggests --rebuild when the source no longer matches the draft", async () => {
    sourceResponse = () =>
      jsonResponse(
        {
          type: "application_error",
          errors: { draft: { message: "The draft was edited since" } },
        },
        409
      );

    expect(await runCli(["pubs", "get", paper, "--draft"], runtime)).toBe(
      ExitCode.Conflict
    );
    expect(runtime.stderr.text).toContain(
      "get the draft rendered as MyST with --draft --rebuild"
    );
    expect(runtime.stdout.text).toBe("");
    expect(await link()).toEqual({ id: PUB_ID, slug: SLUG, etag: OLD_ETAG });
  });

  it("suggests --rebuild for a draft with no MyST source", async () => {
    sourceResponse = () =>
      jsonResponse(
        {
          type: "application_error",
          errors: { draft: { message: "The draft has no MyST source" } },
        },
        404
      );

    expect(await runCli(["pubs", "get", paper, "--draft"], runtime)).toBe(
      ExitCode.NotFound
    );
    expect(runtime.stderr.text).toContain("has no MyST source");
    expect(runtime.stderr.text).toContain("--draft --rebuild");
  });

  it("prints the draft rendered as MyST with --rebuild", async () => {
    expect(
      await runCli(["pubs", "get", paper, "--draft", "--rebuild"], runtime)
    ).toBe(ExitCode.Success);

    const [request] = requests();
    expect(request?.url).toBe(
      `${LOCAL}/api/v1/publications/id/${PUB_ID}/draft`
    );
    expect(request?.headers.get("Accept")).toBe("text/markdown; variant=myst");
    expect(runtime.stdout.text).toBe(REBUILT);
    expect(await link()).toEqual({ id: PUB_ID, slug: SLUG, etag: NEW_ETAG });
  });

  it("prints the draft's fields with --draft --json, without recording the ETag", async () => {
    await runCli(["pubs", "get", paper, "--draft", "--json"], runtime);

    expect(requests()[0]?.url).toBe(
      `${LOCAL}/api/v1/publications/id/${PUB_ID}/draft`
    );
    expect(JSON.parse(runtime.stdout.text)).toEqual(PUBLICATION);
    expect(
      requests().some(({ url }) => url.endsWith("/draft/bibliography"))
    ).toBe(false);
    expect(await link()).toEqual({ id: PUB_ID, slug: SLUG, etag: OLD_ETAG });
  });

  it("gets a draft by slug, resolving its id first", async () => {
    await runCli(["pubs", "get", "--slug", "other-pub", "--draft"], runtime);

    expect(requests().map((request) => new URL(request.url).pathname)).toEqual([
      "/api/v1/publications/p/other-pub",
      `/api/v1/publications/id/${PUB_ID}/draft/content`,
    ]);
  });

  it("needs a login for --draft", async () => {
    expect(
      await runCli(
        ["pubs", "get", paper, "--draft", "--profile", "public"],
        runtime
      )
    ).toBe(ExitCode.Auth);
    expect(requests()).toEqual([]);
  });

  it.each([
    [["--rebuild"], "--rebuild only applies with --draft"],
    [
      ["--draft", "--version-number", "2"],
      "--version-number and --draft can't be combined",
    ],
    [["--json", "--format", "md"], "leave out --json"],
    [["--draft", "--rebuild", "--format", "json"], "--rebuild prints MyST"],
    [["--bibliography"], "--bibliography only applies with --draft"],
    [
      ["--draft", "--rebuild", "--bibliography"],
      "--bibliography prints the draft's BibTeX files",
    ],
    [["--version-number", "0"], "expected a positive whole number"],
  ])("rejects %j", async (args, message) => {
    expect(await runCli(["pubs", "get", paper, ...args], runtime)).toBe(
      ExitCode.Usage
    );
    expect(runtime.stderr.text).toContain(message);
    expect(requests()).toEqual([]);
  });

  describe("--bibliography", () => {
    it("lists the stored files, one per line", async () => {
      await runCli(
        ["pubs", "get", paper, "--draft", "--bibliography"],
        runtime
      );

      expect(requests().at(-1)?.url).toBe(
        `${LOCAL}/api/v1/publications/id/${PUB_ID}/draft/bibliography`
      );
      expect(runtime.stdout.text).toBe("refs.bib\nbib/more.bib\n");
    });

    it("takes a path after the flag as the path, not a filename", async () => {
      expect(
        await runCli(
          ["pubs", "get", "--draft", "--bibliography", paper],
          runtime
        )
      ).toBe(ExitCode.Success);

      expect(runtime.stdout.text).toBe("refs.bib\nbib/more.bib\n");
    });

    it("takes the value as a filename when --slug names the publication", async () => {
      await runCli(
        [
          "pubs",
          "get",
          "--slug",
          SLUG,
          "--draft",
          "--bibliography",
          "refs.bib",
        ],
        runtime
      );

      expect(runtime.stdout.text).toBe(REFS.content);
    });

    it("prints the stored files as the route returns them with --json", async () => {
      await runCli(
        ["pubs", "get", paper, "--draft", "--bibliography", "--json"],
        runtime
      );

      expect(JSON.parse(runtime.stdout.text)).toEqual({ files: [REFS, MORE] });
    });

    it("prints an empty list with --json when the draft has none", async () => {
      bibliographyResponse = { files: [] };

      await runCli(
        ["pubs", "get", paper, "--draft", "--bibliography", "--json"],
        runtime
      );

      expect(JSON.parse(runtime.stdout.text)).toEqual({ files: [] });
      expect(runtime.stderr.text).toBe("");
    });

    it("prints one file verbatim, for redirecting into a local copy", async () => {
      await runCli(
        ["pubs", "get", paper, "--draft", "--bibliography", "bib/more.bib"],
        runtime
      );

      expect(runtime.stdout.text).toBe(MORE.content);
      // The document is never printed with it.
      expect(runtime.stdout.text).not.toContain("title: Ravens");
    });

    it("prints only the named file, in the same shape, with --json", async () => {
      await runCli(
        [
          "pubs",
          "get",
          paper,
          "--draft",
          "--bibliography",
          "refs.bib",
          "--json",
        ],
        runtime
      );

      expect(JSON.parse(runtime.stdout.text)).toEqual({ files: [REFS] });
    });

    it("says when the draft has none, keeping stdout empty", async () => {
      bibliographyResponse = { files: [] };

      await runCli(
        ["pubs", "get", paper, "--draft", "--bibliography"],
        runtime
      );

      expect(runtime.stdout.text).toBe("");
      expect(runtime.stderr.text).toContain(
        `the draft of ${SLUG} has no bibliography`
      );
    });

    it("lists what it has for an unknown filename", async () => {
      expect(
        await runCli(
          ["pubs", "get", paper, "--draft", "--bibliography", "nope.bib"],
          runtime
        )
      ).toBe(ExitCode.NotFound);

      expect(runtime.stderr.text).toContain(
        "has no bibliography file called nope.bib"
      );
      expect(runtime.stderr.text).toContain("  refs.bib");
    });
  });

  it("needs a link or --slug", async () => {
    const other = join(dir, "other.md");
    await writeFile(other, SOURCE);

    expect(await runCli(["pubs", "get", other], runtime)).toBe(ExitCode.Usage);
    expect(runtime.stderr.text).toContain(
      `other.md isn't linked to a publication on ${LOCAL}`
    );
  });
});
