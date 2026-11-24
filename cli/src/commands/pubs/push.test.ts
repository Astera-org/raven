import { writeConfig } from "#src/config/config-file.js";
import { ExitCode } from "#src/errors.js";
import { runCli } from "#src/program.js";
import { displayPath } from "#src/pubs/display-path.js";
import { LinkFile } from "#src/pubs/link-file.js";
import { FakeAuthServer } from "#src/testing/fake-auth.js";
import {
  createTestRuntime,
  jsonResponse,
  MemoryTokenStore,
  type TestRuntime,
} from "#src/testing/test-runtime.js";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOCAL = "http://localhost:7001";
const PUB_ID = "01KX0000000000000000000PUB";
const SLUG = "ravens-01kx0000000000000000000pub";
const OLD_ETAG = '"etag-1"';
const NEW_ETAG = '"etag-2"';
const BIB_ETAG = '"etag-bib"';
const DOCUMENT = "---\ntitle: Ravens\n---\n\nWe watched them again.\n";
const EDIT_URL = `http://localhost:3000/publications/${PUB_ID}/edit`;

const pushed = {
  publicationId: PUB_ID,
  slug: SLUG,
  versionId: "01KX00000000000000000VERSN",
  validationErrors: [],
  links: [{ rel: "edit", href: EDIT_URL }],
};

describe("raven pubs push", () => {
  let runtime: TestRuntime;
  let auth: FakeAuthServer;
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let dir: string;
  let paper: string;
  let putResponse: () => Response;
  let uploadResponse: (file: File) => Response;

  function requests(): Request[] {
    return fetchMock.mock.calls.map(([input]) => input as Request);
  }

  function putReturns(status: number, body: unknown = pushed): void {
    putResponse = () =>
      new Response(JSON.stringify(body), {
        status,
        headers: {
          "Content-Type": "application/json",
          ...(status < 300 ? { ETag: NEW_ETAG } : {}),
        },
      });
  }

  async function link(): Promise<unknown> {
    return (await LinkFile.read(dir)).get(LOCAL, "paper.md");
  }

  beforeEach(async () => {
    auth = new FakeAuthServer();
    putReturns(200);
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
        const response = putResponse();
        if (response.status >= 300) return response;
        return new Response(await response.text(), {
          status: response.status,
          headers: { "Content-Type": "application/json", ETag: BIB_ETAG },
        });
      }
      if (
        request.method === "GET" &&
        pathname === "/api/v1/publications/p/other-pub"
      ) {
        return jsonResponse({
          publication: {
            id: "01KXOTHER00000000000000PUB",
            slug: "other-pub",
          },
        });
      }
      return putResponse();
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
    dir = await mkdtemp(join(tmpdir(), "raven-push-"));
    paper = join(dir, "paper.md");
    await writeFile(paper, DOCUMENT);
    await (
      await LinkFile.read(dir)
    ).set(LOCAL, "paper.md", {
      id: PUB_ID,
      slug: SLUG,
      etag: OLD_ETAG,
    });
  });

  it("replaces the linked draft, guarded by the stored ETag", async () => {
    expect(await runCli(["pubs", "push", paper], runtime)).toBe(
      ExitCode.Success
    );

    // The bibliography is written first, with the stored ETag, and the
    // content write sends the ETag it returned.
    const [bibliography, request] = requests();
    expect(bibliography?.method).toBe("PUT");
    expect(bibliography?.url).toBe(
      `${LOCAL}/api/v1/publications/id/${PUB_ID}/draft/bibliography`
    );
    expect(bibliography?.headers.get("If-Match")).toBe(OLD_ETAG);
    expect(await bibliography?.json()).toEqual({ files: [] });
    expect(request?.method).toBe("PUT");
    expect(request?.url).toBe(
      `${LOCAL}/api/v1/publications/id/${PUB_ID}/draft/content?filename=paper.md`
    );
    expect(request?.headers.get("Content-Type")).toBe("text/markdown");
    expect(request?.headers.get("If-Match")).toBe(BIB_ETAG);
    expect(request?.headers.get("Authorization")).toBe("Bearer token-1");
    expect(await request?.text()).toBe(DOCUMENT);
    expect(await link()).toEqual({ id: PUB_ID, slug: SLUG, etag: NEW_ETAG });
    expect(runtime.stdout.text).toBe(
      [
        `Pushed paper.md to ${SLUG}.`,
        "Ready to publish.",
        `Edit it at ${EDIT_URL}`,
        "",
      ].join("\n")
    );
  });

  it("says when the push opened a new draft", async () => {
    putReturns(201);

    await runCli(["pubs", "push", paper], runtime);

    expect(runtime.stdout.text).toContain(
      `Pushed paper.md to ${SLUG}, in a new draft.`
    );
  });

  it("prints the server's warnings apart from what stops publishing", async () => {
    putReturns(200, {
      ...pushed,
      validationErrors: [
        {
          path: ["body"],
          message: 'Line 3: Could not link citation with label "unknown-key".',
          severity: "warning",
        },
      ],
    });

    await runCli(["pubs", "push", paper], runtime);

    expect(runtime.stderr.text).toBe(
      'Warning: body: Line 3: Could not link citation with label "unknown-key".\n'
    );
    expect(runtime.stdout.text).toContain("Ready to publish.");
  });

  it("names publish --note for the version description the server asks for", async () => {
    putReturns(200, {
      ...pushed,
      validationErrors: [
        {
          path: ["versionDesc"],
          message:
            "Version description required for new versions of a published pub",
        },
      ],
    });

    await runCli(["pubs", "push", paper], runtime);

    expect(runtime.stdout.text).toContain(
      [
        "Not ready to publish yet:",
        "  note: pass --note to `raven pubs publish` to describe what changed in this version",
      ].join("\n")
    );
  });

  it("leaves out If-Match with --force", async () => {
    await runCli(["pubs", "push", paper, "--force"], runtime);

    expect(requests()[0]?.headers.get("If-Match")).toBeNull();
  });

  it("explains a draft changed on the server and keeps the link", async () => {
    putReturns(412, {
      type: "application_error",
      errors: { draft: { message: "The draft was changed since that ETag" } },
    });

    expect(await runCli(["pubs", "push", paper], runtime)).toBe(
      ExitCode.Conflict
    );
    expect(runtime.stderr.text).toContain(
      `the draft of ${SLUG} was edited on the server since this file's last push, so nothing was changed.`
    );
    expect(runtime.stderr.text).toContain(
      "raven pubs get <path> --draft --rebuild"
    );
    expect(await link()).toEqual({ id: PUB_ID, slug: SLUG, etag: OLD_ETAG });
  });

  describe("when the document fails after the bibliography is stored", () => {
    beforeEach(() => {
      fetchMock.mockImplementation((input) => {
        const request = input as Request;
        if (new URL(request.url).pathname.endsWith("/draft/bibliography")) {
          return Promise.resolve(
            new Response(JSON.stringify(pushed), {
              headers: { "Content-Type": "application/json", ETag: BIB_ETAG },
            })
          );
        }
        return Promise.resolve(putResponse());
      });
    });

    it("keeps the bibliography's ETag, so pushing again finishes the push", async () => {
      putReturns(500, {
        type: "application_error",
        errors: { draft: { message: "Something broke" } },
      });

      expect(await runCli(["pubs", "push", paper], runtime)).toBe(
        ExitCode.Server
      );
      expect(runtime.stderr.text).toContain(
        `The bibliography of ${SLUG} was stored, but its document wasn't; push again to finish.`
      );
      expect(await link()).toEqual({ id: PUB_ID, slug: SLUG, etag: BIB_ETAG });

      putReturns(200);
      fetchMock.mockClear();
      expect(await runCli(["pubs", "push", paper], runtime)).toBe(
        ExitCode.Success
      );
      expect(requests()[0]?.headers.get("If-Match")).toBe(BIB_ETAG);
      expect(await link()).toEqual({ id: PUB_ID, slug: SLUG, etag: NEW_ETAG });
    });

    it("keeps the server's error when the link can't be saved either", async () => {
      putReturns(500, {
        type: "application_error",
        errors: { draft: { message: "Something broke" } },
      });
      const links = join(dir, ".raven");
      await chmod(links, 0o500);

      const exitCode = await runCli(["pubs", "push", paper], runtime).finally(
        () => chmod(links, 0o700)
      );

      expect(exitCode).toBe(ExitCode.Server);
      expect(runtime.stderr.text).toContain("Something broke");
      expect(runtime.stderr.text).toContain(
        `The bibliography of ${SLUG} was stored, but its document wasn't; push again to finish.`
      );
      expect(runtime.stderr.text).toMatch(
        /Saving the draft's new ETag to .* also failed .*push again with --force to finish/
      );
      expect(await link()).toEqual({ id: PUB_ID, slug: SLUG, etag: OLD_ETAG });
    });

    it("explains a draft edited between the two writes", async () => {
      putReturns(412, {
        type: "application_error",
        errors: { draft: { message: "The draft was changed since that ETag" } },
      });

      expect(await runCli(["pubs", "push", paper], runtime)).toBe(
        ExitCode.Conflict
      );
      expect(runtime.stderr.text).toContain(
        `the draft of ${SLUG} was edited on the server after this push stored its bibliography, so its document wasn't replaced.`
      );
      expect(runtime.stderr.text).toContain(
        "raven pubs get <path> --draft --rebuild"
      );
      expect(await link()).toEqual({ id: PUB_ID, slug: SLUG, etag: BIB_ETAG });
    });
  });

  it("reports a Google Doc draft as a conflict", async () => {
    putReturns(409, {
      type: "application_error",
      errors: {
        draft: {
          message: "The draft comes from a Google Doc and can't be replaced",
        },
      },
    });

    expect(await runCli(["pubs", "push", paper], runtime)).toBe(
      ExitCode.Conflict
    );
    expect(runtime.stderr.text).toBe(
      "Error: draft: The draft comes from a Google Doc and can't be replaced\n"
    );
  });

  it("needs a link or --slug", async () => {
    const other = join(dir, "other.md");
    await writeFile(other, DOCUMENT);

    expect(await runCli(["pubs", "push", other], runtime)).toBe(ExitCode.Usage);
    expect(requests()).toEqual([]);
    expect(runtime.stderr.text).toContain(
      `other.md isn't linked to a publication on ${LOCAL}`
    );
  });

  it("needs --force to push to another publication by slug the first time", async () => {
    expect(
      await runCli(["pubs", "push", paper, "--slug", "other-pub"], runtime)
    ).toBe(ExitCode.Usage);
    expect(requests().map((r) => r.method)).toEqual(["GET"]);
    expect(runtime.stderr.text).toContain("pass --force");

    fetchMock.mockClear();
    putReturns(200, {
      ...pushed,
      publicationId: "01KXOTHER00000000000000PUB",
      slug: "other-pub",
    });
    expect(
      await runCli(
        ["pubs", "push", paper, "--slug", "other-pub", "--force"],
        runtime
      )
    ).toBe(ExitCode.Success);
    expect(requests()[2]?.url).toContain(
      "/publications/id/01KXOTHER00000000000000PUB/draft/content"
    );
    expect(requests()[2]?.headers.get("If-Match")).toBeNull();
    expect(await link()).toEqual({
      id: "01KXOTHER00000000000000PUB",
      slug: "other-pub",
      etag: NEW_ETAG,
    });
  });

  it("checks the document with --dry-run, without logging in or sending", async () => {
    expect(
      await runCli(
        ["pubs", "push", paper, "--dry-run", "--profile", "public"],
        runtime
      )
    ).toBe(ExitCode.Success);

    expect(requests()).toEqual([]);
    expect(runtime.stdout.text).toBe(
      [
        "Would push paper.md.",
        `Size:         ${Buffer.byteLength(DOCUMENT)} bytes`,
        `Publication:  ${SLUG}`,
        "Overwrite:    only if unchanged since the last push",
        "No local files to upload.",
        "No bibliography.",
        "",
      ].join("\n")
    );
  });

  it("refuses missing local files before sending anything", async () => {
    await writeFile(paper, `${DOCUMENT}![](plot.png)\n`);

    expect(await runCli(["pubs", "push", paper], runtime)).toBe(
      ExitCode.Validation
    );
    expect(requests()).toEqual([]);
  });

  it("prints the response with --json", async () => {
    await runCli(["pubs", "push", paper, "--json"], runtime);

    expect(JSON.parse(runtime.stdout.text)).toMatchObject({
      ...pushed,
      etag: NEW_ETAG,
      newDraft: false,
      uploads: [],
    });
  });

  describe("with a bibliography", () => {
    it("sends the files it finds, then the document", async () => {
      await writeFile(
        paper,
        "---\ntitle: Ravens\nbibliography: [refs.bib]\n---\n\nCites {cite}`a`.\n"
      );
      await writeFile(join(dir, "refs.bib"), "@misc{a, title={A}}");

      expect(await runCli(["pubs", "push", paper], runtime)).toBe(
        ExitCode.Success
      );

      const [bibliography, content] = requests();
      expect(await bibliography?.json()).toEqual({
        files: [{ filename: "refs.bib", content: "@misc{a, title={A}}" }],
      });
      expect(bibliography?.headers.get("If-Match")).toBe(OLD_ETAG);
      expect(content?.url).toContain("/draft/content");
      expect(content?.headers.get("If-Match")).toBe(BIB_ETAG);
    });

    it("warns about the files themselves, leaving citations to the document's write", async () => {
      await writeFile(
        paper,
        "---\ntitle: Ravens\nbibliography: [refs.bib]\n---\n\nCites {cite}`a`.\n"
      );
      await writeFile(join(dir, "refs.bib"), "@misc{a, title={A}");
      fetchMock.mockImplementation((input) => {
        const request = input as Request;
        if (!new URL(request.url).pathname.endsWith("/draft/bibliography")) {
          return Promise.resolve(putResponse());
        }
        const body = {
          ...pushed,
          validationErrors: [
            {
              path: ["files", 0],
              message: "refs.bib couldn't be read: unexpected end",
              severity: "warning",
            },
            {
              path: ["body"],
              message: "The citation a doesn't resolve",
              severity: "warning",
            },
          ],
        };
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            headers: { "Content-Type": "application/json", ETag: BIB_ETAG },
          })
        );
      });

      expect(await runCli(["pubs", "push", paper], runtime)).toBe(
        ExitCode.Success
      );
      expect(runtime.stderr.text).toContain(
        "refs.bib couldn't be read: unexpected end"
      );
      expect(runtime.stderr.text).not.toContain("doesn't resolve");
    });

    it("says when the bibliography write opened a new draft", async () => {
      fetchMock.mockImplementation((input) => {
        const request = input as Request;
        const opened = new URL(request.url).pathname.endsWith(
          "/draft/bibliography"
        );
        return Promise.resolve(
          new Response(JSON.stringify(pushed), {
            status: opened ? 201 : 200,
            headers: {
              "Content-Type": "application/json",
              ETag: opened ? BIB_ETAG : NEW_ETAG,
            },
          })
        );
      });

      expect(await runCli(["pubs", "push", paper, "--json"], runtime)).toBe(
        ExitCode.Success
      );
      expect(JSON.parse(runtime.stdout.text).newDraft).toBe(true);
    });

    it("refuses a bibliography it can't read before sending anything", async () => {
      await writeFile(
        paper,
        "---\ntitle: Ravens\nbibliography: [missing.bib]\n---\n\nBody.\n"
      );

      expect(await runCli(["pubs", "push", paper], runtime)).toBe(
        ExitCode.Validation
      );
      expect(requests()).toEqual([]);
      expect(runtime.stderr.text).toContain("missing.bib (from paper.md)");
    });
  });

  describe("with local images", () => {
    const WITH_IMAGES = [
      DOCUMENT,
      "![Plot](figures/plot.png)",
      "",
      "![Same bytes](copy.png)",
      "",
    ].join("\n");

    beforeEach(async () => {
      await mkdir(join(dir, "figures"));
      await writeFile(join(dir, "figures", "plot.png"), "plot-bytes");
      await writeFile(join(dir, "copy.png"), "plot-bytes");
      await writeFile(paper, WITH_IMAGES);
    });

    it("uploads each distinct file, then pushes the document with their URLs", async () => {
      expect(await runCli(["pubs", "push", paper], runtime)).toBe(
        ExitCode.Success
      );

      const [upload, , put] = requests();
      expect(upload?.method).toBe("POST");
      expect(upload?.url).toBe(
        `${LOCAL}/api/v1/publications/id/${PUB_ID}/draft/media-assets`
      );
      expect(upload?.headers.get("Content-Type")).toMatch(
        /^multipart\/form-data; boundary=/
      );
      expect(requests()).toHaveLength(3);
      expect(put?.method).toBe("PUT");
      expect(await put?.text()).toBe(
        [
          DOCUMENT,
          "![Plot](https://s3.test/plot.png)",
          "",
          "![Same bytes](https://s3.test/plot.png)",
          "",
        ].join("\n")
      );
      expect(await readFile(paper, "utf8")).toBe(WITH_IMAGES);
      expect(runtime.stderr.text).toBe(
        `Uploaded ${displayPath(join(dir, "figures", "plot.png"))} (line 7)\n`
      );
    });

    it("lists each file and its URL with --json", async () => {
      await runCli(["pubs", "push", paper, "--json"], runtime);

      expect(JSON.parse(runtime.stdout.text).uploads).toEqual([
        {
          file: displayPath(join(dir, "figures", "plot.png")),
          url: "https://s3.test/plot.png",
          lines: [7],
        },
        {
          file: displayPath(join(dir, "copy.png")),
          url: "https://s3.test/plot.png",
          lines: [9],
        },
      ]);
    });

    it("uploads the same bytes once per extension", async () => {
      await writeFile(join(dir, "clip.mp4"), "clip-bytes");
      await writeFile(join(dir, "clip.m4a"), "clip-bytes");
      await writeFile(paper, `${DOCUMENT}![](clip.mp4)\n\n![](clip.m4a)\n`);

      expect(await runCli(["pubs", "push", paper], runtime)).toBe(
        ExitCode.Success
      );

      expect(requests().map((r) => r.method)).toEqual([
        "POST",
        "POST",
        "PUT",
        "PUT",
      ]);
      expect(await requests()[3]?.text()).toBe(
        `${DOCUMENT}![](https://s3.test/clip.mp4)\n\n![](https://s3.test/clip.m4a)\n`
      );
    });

    it("refuses paths it can't replace before sending anything", async () => {
      await writeFile(paper, `${DOCUMENT}![Plot](\nfigures/plot.png)\n`);

      expect(await runCli(["pubs", "push", paper], runtime)).toBe(
        ExitCode.Validation
      );
      expect(requests()).toEqual([]);
      expect(runtime.stderr.text).toContain("figures/plot.png");
    });

    it("says when an upload opened a new draft", async () => {
      uploadResponse = (file) =>
        jsonResponse({
          url: `https://s3.test/${file.name}`,
          sha256: "sha",
          draftCreated: true,
        });

      await runCli(["pubs", "push", paper], runtime);

      expect(runtime.stdout.text).toContain(
        `Pushed paper.md to ${SLUG}, in a new draft.`
      );
    });

    it("reports every failed upload and doesn't push", async () => {
      await writeFile(join(dir, "notes.exe"), "exe-bytes");
      await writeFile(paper, `${WITH_IMAGES}\n![](notes.exe)\n`);
      uploadResponse = (file) =>
        file.name === "notes.exe"
          ? jsonResponse(
              {
                type: "validation_error",
                errors: [
                  {
                    path: ["file"],
                    message: "Unsupported file type extension `.exe`",
                  },
                ],
                error: "Unsupported file type extension `.exe`",
              },
              422
            )
          : jsonResponse({
              url: `https://s3.test/${file.name}`,
              sha256: "sha",
              draftCreated: false,
            });

      expect(await runCli(["pubs", "push", paper], runtime)).toBe(
        ExitCode.Validation
      );

      expect(requests().map((r) => r.method)).toEqual(["POST", "POST"]);
      expect(runtime.stderr.text).toContain(
        [
          "Error: 1 of 2 files failed to upload, so the draft wasn't changed:",
          `  ${displayPath(join(dir, "notes.exe"))}: file: Unsupported file type extension \`.exe\``,
        ].join("\n")
      );
      expect(await link()).toEqual({ id: PUB_ID, slug: SLUG, etag: OLD_ETAG });
    });

    it("lists the files it would upload with --dry-run", async () => {
      expect(
        await runCli(
          ["pubs", "push", paper, "--dry-run", "--profile", "public"],
          runtime
        )
      ).toBe(ExitCode.Success);

      expect(requests()).toEqual([]);
      expect(runtime.stdout.text).toContain(
        [
          "Would upload:",
          `  ${displayPath(join(dir, "figures", "plot.png"))} (10 bytes, line 7)`,
          `  ${displayPath(join(dir, "copy.png"))} (10 bytes, line 9)`,
        ].join("\n")
      );
    });

    it("refuses local includes before sending anything", async () => {
      await writeFile(paper, `${DOCUMENT}\n\`\`\`{include} other.md\n\`\`\`\n`);

      expect(await runCli(["pubs", "push", paper], runtime)).toBe(
        ExitCode.Validation
      );
      expect(requests()).toEqual([]);
      expect(runtime.stderr.text).toContain("other.md");
    });
  });
});
