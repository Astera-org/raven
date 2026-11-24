import { writeConfig } from "#src/config/config-file.js";
import { ExitCode } from "#src/errors.js";
import { runCli } from "#src/program.js";
import { displayPath } from "#src/pubs/display-path.js";
import { FakeAuthServer } from "#src/testing/fake-auth.js";
import {
  createTestRuntime,
  jsonResponse,
  MemoryTokenStore,
  type TestRuntime,
} from "#src/testing/test-runtime.js";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOCAL = "http://localhost:7001";
const PUB_ID = "01KX0000000000000000000PUB";
const ETAG = '"etag-1"';
const PUSHED_ETAG = '"etag-2"';
const BIB_ETAG = '"etag-bib"';
const DOCUMENT = "---\ntitle: Ravens\n---\n\nWe watched them.\n";

const created = {
  publicationId: PUB_ID,
  slug: "ravens-01kx0000000000000000000pub",
  versionId: "01KX00000000000000000VERSN",
  validationErrors: [],
  links: [
    {
      rel: "edit",
      href: `http://localhost:3000/publications/${PUB_ID}/edit`,
    },
  ],
};

describe("raven pubs create", () => {
  let runtime: TestRuntime;
  let auth: FakeAuthServer;
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let dir: string;
  let paper: string;

  function requests(): Request[] {
    return fetchMock.mock.calls.map(([input]) => input as Request);
  }

  async function linkFile(): Promise<unknown> {
    return JSON.parse(
      await readFile(join(dir, ".raven", "publications.json"), "utf8")
    );
  }

  let createResponse: () => Response;
  let uploadResponse: (file: File) => Response;

  function respondWith(body: unknown): void {
    createResponse = () =>
      new Response(JSON.stringify(body), {
        status: 201,
        headers: {
          "Content-Type": "application/json",
          ETag: ETAG,
          Location: `/api/v1/publications/id/${PUB_ID}`,
        },
      });
  }

  beforeEach(async () => {
    auth = new FakeAuthServer();
    respondWith(created);
    uploadResponse = (file) =>
      jsonResponse({
        url: `https://s3.test/${file.name}`,
        sha256: "sha",
        draftCreated: false,
      });
    fetchMock = vi.fn<typeof fetch>(async (input) => {
      const request = input as Request;
      const { pathname } = new URL(request.url);
      if (pathname.endsWith("/draft/media-assets")) {
        const file = (await request.clone().formData()).get("file") as File;
        return uploadResponse(file);
      }
      if (pathname.endsWith("/draft/bibliography")) {
        return new Response(JSON.stringify(created), {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: BIB_ETAG },
        });
      }
      if (pathname.endsWith("/draft/content")) {
        return new Response(JSON.stringify(created), {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: PUSHED_ETAG },
        });
      }
      return createResponse();
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
    dir = await mkdtemp(join(tmpdir(), "raven-create-"));
    paper = join(dir, "paper.md");
    await writeFile(paper, DOCUMENT);
  });

  it("creates the publication and links the file to it", async () => {
    expect(await runCli(["pubs", "create", paper], runtime)).toBe(
      ExitCode.Success
    );

    const [request] = requests();
    expect(request?.method).toBe("POST");
    expect(request?.url).toBe(`${LOCAL}/api/v1/publications`);
    expect(request?.headers.get("Authorization")).toBe("Bearer token-1");
    expect(await request?.json()).toEqual({
      importDocument: {
        format: "mystmd",
        body: DOCUMENT,
        filename: "paper.md",
      },
    });
    expect(await linkFile()).toEqual({
      version: 1,
      servers: {
        [LOCAL]: {
          "paper.md": { id: PUB_ID, slug: created.slug, etag: ETAG },
        },
      },
    });
    const linkPath = displayPath(join(dir, ".raven", "publications.json"));
    expect(runtime.stdout.text).toBe(
      [
        `Created publication ${created.slug} (${PUB_ID}).`,
        `Linked paper.md in ${linkPath}.`,
        "Ready to publish.",
        `Edit it at ${created.links[0]?.href}`,
        "",
      ].join("\n")
    );
  });

  it("sends --slug, and --org as an ID or a slug", async () => {
    await runCli(
      [
        "pubs",
        "create",
        paper,
        "--slug",
        "ravens-study",
        "--org",
        "vanderbilt",
        "--org",
        "01KVAQ3RGRZ9R8WGB9GXY2WX5F",
      ],
      runtime
    );

    expect(requests()).toHaveLength(1);
    expect(await requests()[0]?.json()).toMatchObject({
      slug: "ravens-study",
      orgs: [
        { orgSlug: "vanderbilt" },
        { orgId: "01KVAQ3RGRZ9R8WGB9GXY2WX5F" },
      ],
    });
  });

  it("reports an unknown org without linking anything", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          type: "validation_error",
          errors: [{ path: ["orgs", 0], message: "Org not found" }],
          error: "Org not found",
        },
        422
      )
    );

    expect(
      await runCli(["pubs", "create", paper, "--org", "nope"], runtime)
    ).toBe(ExitCode.Validation);
    expect(runtime.stderr.text).toBe("Error: orgs.0: Org not found\n");
    await expect(linkFile()).rejects.toThrow(/ENOENT/);
  });

  it("lists what still stops publishing", async () => {
    respondWith({
      ...created,
      validationErrors: [
        {
          path: ["contributors"],
          message: "At least one contributor must be in the byline",
        },
        { path: [], message: "Something general" },
      ],
    });

    await runCli(["pubs", "create", paper], runtime);

    expect(runtime.stdout.text).toContain(
      [
        "Not ready to publish yet:",
        "  contributors: At least one contributor must be in the byline",
        "  Something general",
      ].join("\n")
    );
  });

  it("prints the server's warnings apart from what stops publishing", async () => {
    respondWith({
      ...created,
      validationErrors: [
        {
          path: ["subtitle"],
          message: "Subtitle was truncated to 300 characters",
          severity: "warning",
        },
      ],
    });

    await runCli(["pubs", "create", paper], runtime);

    expect(runtime.stderr.text).toBe(
      "Warning: subtitle: Subtitle was truncated to 300 characters\n"
    );
    expect(runtime.stdout.text).toContain("Ready to publish.");
  });

  it("lists only what stops publishing under not ready, warning about the rest", async () => {
    respondWith({
      ...created,
      validationErrors: [
        {
          path: ["subtitle"],
          message: "Subtitle was truncated to 300 characters",
          severity: "warning",
        },
        { path: ["title"], message: "Title is required", severity: "error" },
      ],
    });

    await runCli(["pubs", "create", paper], runtime);

    expect(runtime.stderr.text).toBe(
      "Warning: subtitle: Subtitle was truncated to 300 characters\n"
    );
    expect(runtime.stdout.text).toContain(
      "Not ready to publish yet:\n  title: Title is required\n"
    );
    expect(runtime.stdout.text).not.toContain("truncated");
  });

  it("prints the response, ETag and link file with --json", async () => {
    await runCli(["pubs", "create", paper, "--json"], runtime);

    expect(JSON.parse(runtime.stdout.text)).toEqual({
      ...created,
      etag: ETAG,
      linkFile: displayPath(join(dir, ".raven", "publications.json")),
      uploads: [],
      bibliography: [],
    });
  });

  it("refuses a file that's already linked on this server", async () => {
    await runCli(["pubs", "create", paper], runtime);
    fetchMock.mockClear();

    expect(await runCli(["pubs", "create", paper], runtime)).toBe(
      ExitCode.Usage
    );
    expect(requests()).toEqual([]);
    expect(runtime.stderr.text).toContain(
      `paper.md is already linked to publication ${created.slug} on ${LOCAL}; use \`raven pubs push\` to update it`
    );
  });

  it("refuses missing local files before sending anything", async () => {
    await writeFile(paper, `${DOCUMENT}\n![A plot](figures/plot.png)\n`);

    expect(await runCli(["pubs", "create", paper], runtime)).toBe(
      ExitCode.Validation
    );
    expect(requests()).toEqual([]);
    expect(runtime.stderr.text).toContain("line 7: figures/plot.png");
  });

  it("checks the document with --dry-run, without logging in or sending", async () => {
    expect(
      await runCli(
        [
          "pubs",
          "create",
          paper,
          "--dry-run",
          "--profile",
          "public",
          "--slug",
          "ravens-study",
        ],
        runtime
      )
    ).toBe(ExitCode.Success);

    expect(requests()).toEqual([]);
    expect(runtime.stdout.text).toBe(
      [
        "Would create a publication from paper.md.",
        `Size:  ${Buffer.byteLength(DOCUMENT)} bytes`,
        "Slug:  ravens-study",
        "Orgs:  -",
        "No local files to upload.",
        "No bibliography.",
        "",
      ].join("\n")
    );
  });

  it("needs a login", async () => {
    expect(
      await runCli(["pubs", "create", paper, "--profile", "public"], runtime)
    ).toBe(ExitCode.Auth);
    expect(requests()).toEqual([]);
  });

  it("reports the server's validation errors", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          type: "validation_error",
          errors: [{ path: ["license"], message: 'Unsupported license "MIT"' }],
          error: 'Unsupported license "MIT"',
        },
        422
      )
    );

    expect(await runCli(["pubs", "create", paper], runtime)).toBe(
      ExitCode.Validation
    );
    expect(runtime.stderr.text).toBe(
      'Error: license: Unsupported license "MIT"\n'
    );
  });

  describe("with a bibliography", () => {
    beforeEach(async () => {
      await writeFile(
        paper,
        "---\ntitle: Ravens\nbibliography: [refs.bib]\n---\n\nCites {cite}`a`.\n"
      );
      await writeFile(join(dir, "refs.bib"), "@misc{a, title={A}}");
    });

    it("sends the files, then the document, so the issues are the last write's", async () => {
      expect(await runCli(["pubs", "create", paper], runtime)).toBe(
        ExitCode.Success
      );

      const [create, bibliography, content] = requests();
      expect(create?.url).toBe(`${LOCAL}/api/v1/publications`);
      expect(bibliography?.method).toBe("PUT");
      expect(bibliography?.url).toBe(
        `${LOCAL}/api/v1/publications/id/${PUB_ID}/draft/bibliography`
      );
      // The create's own ETag guards the bibliography, and its ETag the
      // content.
      expect(bibliography?.headers.get("If-Match")).toBe(ETAG);
      expect(await bibliography?.json()).toEqual({
        files: [{ filename: "refs.bib", content: "@misc{a, title={A}}" }],
      });
      expect(content?.url).toContain("/draft/content");
      expect(content?.headers.get("If-Match")).toBe(BIB_ETAG);
      expect(await linkFile()).toMatchObject({
        servers: { [LOCAL]: { "paper.md": { etag: PUSHED_ETAG } } },
      });
    });

    it("links the bibliography's ETag when the document then fails, so push can finish", async () => {
      const respond = fetchMock.getMockImplementation();
      fetchMock.mockImplementation(async (input) => {
        const request = input as Request;
        if (new URL(request.url).pathname.endsWith("/draft/content")) {
          return jsonResponse(
            {
              type: "application_error",
              errors: { draft: { message: "Something broke" } },
            },
            500
          );
        }
        return respond!(input);
      });

      expect(await runCli(["pubs", "create", paper], runtime)).toBe(
        ExitCode.Server
      );
      expect(runtime.stderr.text).toContain(
        "but the document wasn't sent again after its bibliography. Run `raven pubs push` with the same arguments to finish."
      );
      expect(runtime.stderr.text).not.toContain("local paths");
      expect(await linkFile()).toMatchObject({
        servers: { [LOCAL]: { "paper.md": { etag: BIB_ETAG } } },
      });
    });

    it("says to push with --force when the bibliography's ETag can't be linked", async () => {
      const linkDirectory = join(dir, ".raven");
      const respond = fetchMock.getMockImplementation();
      fetchMock.mockImplementation(async (input) => {
        const request = input as Request;
        if (new URL(request.url).pathname.endsWith("/draft/bibliography")) {
          await chmod(linkDirectory, 0o500);
        }
        return respond!(input);
      });

      const exitCode = await runCli(["pubs", "create", paper], runtime).finally(
        () => chmod(linkDirectory, 0o700)
      );

      expect(exitCode).toBe(ExitCode.General);
      expect(runtime.stderr.text).toContain(
        "could not save the draft's new ETag"
      );
      expect(runtime.stderr.text).toContain(
        "its bibliography stored, but its document wasn't sent again. Fix the link file, then run `raven pubs push --force` with the same arguments to finish."
      );
      expect(requests().map(({ url }) => url)).not.toContain(
        `${LOCAL}/api/v1/publications/id/${PUB_ID}/draft/content`
      );
      expect(await linkFile()).toMatchObject({
        servers: { [LOCAL]: { "paper.md": { etag: ETAG } } },
      });
    });

    it("names the bibliography when its write fails", async () => {
      const respond = fetchMock.getMockImplementation();
      fetchMock.mockImplementation(async (input) => {
        const request = input as Request;
        if (new URL(request.url).pathname.endsWith("/draft/bibliography")) {
          return jsonResponse(
            {
              type: "application_error",
              errors: { files: { message: "The files are too large" } },
            },
            413
          );
        }
        return respond!(input);
      });

      expect(await runCli(["pubs", "create", paper], runtime)).not.toBe(
        ExitCode.Success
      );
      expect(runtime.stderr.text).toContain("The files are too large");
      expect(runtime.stderr.text).toContain(
        "its draft doesn't have its bibliography yet. Run `raven pubs push` with the same arguments to finish."
      );
      expect(await linkFile()).toMatchObject({
        servers: { [LOCAL]: { "paper.md": { etag: ETAG } } },
      });
    });

    it("lists the files with --json and --dry-run", async () => {
      await runCli(["pubs", "create", paper, "--json"], runtime);
      expect(JSON.parse(runtime.stdout.text).bibliography).toEqual([
        {
          filename: "refs.bib",
          file: displayPath(join(dir, "refs.bib")),
          bytes: 19,
        },
      ]);

      runtime.stdout.text = "";
      await runCli(["pubs", "create", paper, "--dry-run"], runtime);
      expect(runtime.stdout.text).toContain("Bibliography:");
      expect(runtime.stdout.text).toContain("refs.bib (19 bytes)");
    });
  });

  describe("with local images", () => {
    const WITH_IMAGE = `${DOCUMENT}\n![Plot](plot.png)\n`;

    beforeEach(async () => {
      await writeFile(join(dir, "plot.png"), "plot-bytes");
      await writeFile(paper, WITH_IMAGE);
    });

    function linked(etag: string) {
      return {
        version: 1,
        servers: {
          [LOCAL]: {
            "paper.md": { id: PUB_ID, slug: created.slug, etag },
          },
        },
      };
    }

    it("creates the publication, uploads the files, then pushes their URLs", async () => {
      expect(await runCli(["pubs", "create", paper], runtime)).toBe(
        ExitCode.Success
      );

      const [create, upload, put] = requests();
      expect(create?.url).toBe(`${LOCAL}/api/v1/publications`);
      expect(upload?.url).toBe(
        `${LOCAL}/api/v1/publications/id/${PUB_ID}/draft/media-assets`
      );
      expect(put?.method).toBe("PUT");
      expect(put?.headers.get("If-Match")).toBe(ETAG);
      expect(await put?.text()).toBe(
        `${DOCUMENT}\n![Plot](https://s3.test/plot.png)\n`
      );
      expect(await linkFile()).toEqual(linked(PUSHED_ETAG));
    });

    it("lists each file and its URL with --json", async () => {
      await runCli(["pubs", "create", paper, "--json"], runtime);

      expect(JSON.parse(runtime.stdout.text).uploads).toEqual([
        {
          file: displayPath(join(dir, "plot.png")),
          url: "https://s3.test/plot.png",
          lines: [7],
        },
      ]);
    });

    it("keeps the link when an upload fails, and says how to finish", async () => {
      uploadResponse = () =>
        jsonResponse(
          {
            type: "application_error",
            errors: {
              file: { message: "The file is larger than 65536 bytes" },
            },
          },
          413
        );

      expect(await runCli(["pubs", "create", paper], runtime)).not.toBe(
        ExitCode.Success
      );

      expect(requests().map((r) => r.method)).toEqual(["POST", "POST"]);
      expect(await linkFile()).toEqual(linked(ETAG));
      expect(runtime.stderr.text).toContain(
        "its draft doesn't have the uploaded media (it still has the local paths) yet. Run `raven pubs push` with the same arguments to finish."
      );
    });
  });
});
