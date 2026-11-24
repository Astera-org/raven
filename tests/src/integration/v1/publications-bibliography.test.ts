import { describe, expect, it } from "vitest";
import {
  addSelfToByline,
  makeUser,
  PERMISSION_DENIED,
  query,
  registerUserWithId,
  seedPublication,
  seedSiteAdmin,
  TestApiClient,
  UNAUTHENTICATED,
} from "./helpers.js";

// BIBLIOGRAPHY_MAX_BYTES for backend-test in docker-compose.test.yml.
const BIBLIOGRAPHY_MAX_BYTES = 65536;

const MYST_DOCUMENT = [
  "---",
  "title: Ravens and crows",
  "---",
  "",
  "They remember faces {cite}`smith2020`.",
  "",
].join("\n");

const REFS_BIB = [
  "@article{smith2020,",
  '  author = {M{\\"u}ller, Anna and Jones, Bob},',
  "  title = {On \\emph{things}},",
  "  year = {2020},",
  "  doi = {10.1234/ABC.def},",
  "}",
  "",
].join("\n");

const MORE_BIB = [
  "@book{jones2019,",
  "  author = {Jones, Bob},",
  "  title = {A book},",
  "  year = {2019},",
  "}",
  "",
].join("\n");

const BROKEN_BIB = "@article{oops,\n  title = {Unclosed,\n";

type Issue = { severity?: string; path: unknown[]; message: string };

function warningsOf(body: { validationErrors: Issue[] }): Issue[] {
  return body.validationErrors
    .filter((issue) => issue.severity === "warning")
    .map(({ severity: _severity, ...issue }) => issue);
}

async function adminClient() {
  const { client, user, userId } = await registerUserWithId();
  await seedSiteAdmin(userId);
  await client.login(user.username, user.password);
  return { client, userId };
}

async function outsiderClient() {
  const { client, user } = await registerUserWithId(makeUser("outsider"));
  await client.login(user.username, user.password);
  return client;
}

async function createFromMyst(client: TestApiClient) {
  const res = await client.post("/api/v1/publications").send({
    importDocument: {
      format: "mystmd",
      body: MYST_DOCUMENT,
      filename: "ravens.md",
    },
  });
  expect(res.status).toBe(201);
  return {
    publicationId: res.body.publicationId as string,
    slug: res.body.slug as string,
    etag: res.headers.etag as string,
  };
}

function putBibliography(
  client: TestApiClient,
  publicationId: string,
  files: { filename: string; content: string }[],
  ifMatch?: string
) {
  const req = client.put(
    `/api/v1/publications/id/${publicationId}/draft/bibliography`
  );
  if (ifMatch !== undefined) req.set("If-Match", ifMatch);
  return req.send({ files });
}

function getBibliography(client: TestApiClient, publicationId: string) {
  return client.get(
    `/api/v1/publications/id/${publicationId}/draft/bibliography`
  );
}

async function draftEtag(client: TestApiClient, publicationId: string) {
  const res = await client.get(
    `/api/v1/publications/id/${publicationId}/draft`
  );
  expect(res.status).toBe(200);
  return res.headers.etag as string;
}

describe("PUT /api/v1/publications/id/{id}/draft/bibliography", () => {
  it("stores the files as sent and returns the draft's new ETag", async () => {
    const { client } = await adminClient();
    const { publicationId, etag } = await createFromMyst(client);
    const files = [
      { filename: "refs.bib", content: REFS_BIB },
      { filename: "bib/more.bib", content: MORE_BIB },
    ];

    const res = await putBibliography(client, publicationId, files, etag);

    expect(res.status).toBe(200);
    expect(res.body.publicationId).toBe(publicationId);
    expect(warningsOf(res.body)).toEqual([]);
    expect(res.headers.etag).not.toBe(etag);
    expect(res.headers.etag).toBe(await draftEtag(client, publicationId));
    const stored = await getBibliography(client, publicationId);
    expect(stored.status).toBe(200);
    expect(stored.body).toEqual({ files });
  });

  it("replaces the whole list, and an empty one removes it", async () => {
    const { client } = await adminClient();
    const { publicationId, etag } = await createFromMyst(client);
    await putBibliography(client, publicationId, [
      { filename: "refs.bib", content: REFS_BIB },
      { filename: "more.bib", content: MORE_BIB },
    ]);

    const replaced = await putBibliography(client, publicationId, [
      { filename: "more.bib", content: MORE_BIB },
    ]);
    expect(replaced.status).toBe(200);
    expect((await getBibliography(client, publicationId)).body).toEqual({
      files: [{ filename: "more.bib", content: MORE_BIB }],
    });

    const removed = await putBibliography(client, publicationId, []);
    expect(removed.status).toBe(200);
    expect((await getBibliography(client, publicationId)).body).toEqual({
      files: [],
    });
    // Back to what the draft hashed to before it had a bibliography.
    expect(removed.headers.etag).toBe(etag);
  });

  it("leaves the ETag unchanged when the files don't change", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createFromMyst(client);
    const files = [{ filename: "refs.bib", content: REFS_BIB }];

    const first = await putBibliography(client, publicationId, files);
    const again = await putBibliography(client, publicationId, files);

    expect(again.status).toBe(200);
    expect(again.headers.etag).toBe(first.headers.etag);
  });

  it("opens a draft for a published publication, with 201 and Location", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createFromMyst(client);
    await addSelfToByline(client, publicationId);
    expect(
      (
        await client
          .post(`/api/v1/publications/id/${publicationId}/versions`)
          .send({})
      ).status
    ).toBe(201);

    const res = await putBibliography(client, publicationId, [
      { filename: "refs.bib", content: REFS_BIB },
    ]);

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(
      `/api/v1/publications/id/${publicationId}/draft`
    );
    expect((await getBibliography(client, publicationId)).body.files).toEqual([
      { filename: "refs.bib", content: REFS_BIB },
    ]);
  });

  describe("If-Match", () => {
    it("writes when the ETag still matches, and refuses a stale one", async () => {
      const { client } = await adminClient();
      const { publicationId, etag } = await createFromMyst(client);

      const first = await putBibliography(
        client,
        publicationId,
        [{ filename: "refs.bib", content: REFS_BIB }],
        etag
      );
      expect(first.status).toBe(200);

      const stale = await putBibliography(
        client,
        publicationId,
        [{ filename: "refs.bib", content: MORE_BIB }],
        etag
      );

      expect(stale.status).toBe(412);
      expect((await getBibliography(client, publicationId)).body.files).toEqual(
        [{ filename: "refs.bib", content: REFS_BIB }]
      );
    });

    it("refuses an ETag from before a content push", async () => {
      const { client } = await adminClient();
      const { publicationId, etag } = await createFromMyst(client);
      const pushed = await client
        .put(`/api/v1/publications/id/${publicationId}/draft/content`)
        .set("Content-Type", "text/markdown")
        .send("---\ntitle: Ravens, revisited\n---\n\nAgain.\n");
      expect(pushed.status).toBe(200);

      const res = await putBibliography(
        client,
        publicationId,
        [{ filename: "refs.bib", content: REFS_BIB }],
        etag
      );

      expect(res.status).toBe(412);
    });

    it("overwrites unconditionally without one", async () => {
      const { client } = await adminClient();
      const { publicationId } = await createFromMyst(client);
      await putBibliography(client, publicationId, [
        { filename: "refs.bib", content: REFS_BIB },
      ]);

      const res = await putBibliography(client, publicationId, [
        { filename: "refs.bib", content: MORE_BIB },
      ]);

      expect(res.status).toBe(200);
      expect((await getBibliography(client, publicationId)).body.files).toEqual(
        [{ filename: "refs.bib", content: MORE_BIB }]
      );
    });
  });

  describe("files it can't use", () => {
    it("stores a file that doesn't parse, and warns where it stopped", async () => {
      const { client } = await adminClient();
      const { publicationId } = await createFromMyst(client);

      const res = await putBibliography(client, publicationId, [
        { filename: "refs.bib", content: REFS_BIB },
        { filename: "broken.bib", content: BROKEN_BIB },
      ]);

      expect(res.status).toBe(200);
      expect(warningsOf(res.body)).toEqual([
        {
          code: "custom",
          path: ["files", 1],
          message: expect.stringMatching(
            /^broken\.bib couldn't be read: .*line \d+ col \d+/
          ),
        },
      ]);
      expect(
        (await getBibliography(client, publicationId)).body.files[1].content
      ).toBe(BROKEN_BIB);
    });

    it("warns about a key defined in two files", async () => {
      const { client } = await adminClient();
      const { publicationId } = await createFromMyst(client);

      const res = await putBibliography(client, publicationId, [
        { filename: "refs.bib", content: REFS_BIB },
        {
          filename: "more.bib",
          content: "@misc{smith2020, title = {Again}}\n",
        },
      ]);

      expect(res.status).toBe(200);
      expect(warningsOf(res.body)).toEqual([
        {
          code: "custom",
          path: ["files", 1],
          message:
            "more.bib defines smith2020 again, after refs.bib; citations of it use this definition",
        },
      ]);
    });

    it("warns about a citation the new files no longer resolve", async () => {
      const { client } = await adminClient();
      const { publicationId } = await createFromMyst(client);
      await putBibliography(client, publicationId, [
        { filename: "refs.bib", content: REFS_BIB },
      ]);

      const res = await putBibliography(client, publicationId, [
        { filename: "more.bib", content: MORE_BIB },
      ]);

      expect(res.status).toBe(200);
      expect(warningsOf(res.body)).toEqual([
        {
          code: "custom",
          path: ["body"],
          message: expect.stringMatching(
            /Could not link citation with label "smith2020"/
          ),
        },
      ]);
    });

    it.each([
      ["the same filename twice", "refs.bib", "refs.bib"],
      ["an absolute path", "refs.bib", "/etc/refs.bib"],
      ["a path leaving the directory", "refs.bib", "../refs.bib"],
    ])("returns 422 for %s", async (_, first, second) => {
      const { client } = await adminClient();
      const { publicationId } = await createFromMyst(client);

      const res = await putBibliography(client, publicationId, [
        { filename: first, content: REFS_BIB },
        { filename: second, content: MORE_BIB },
      ]);

      expect(res.status).toBe(422);
      expect(res.body.type).toBe("validation_error");
      expect((await getBibliography(client, publicationId)).body.files).toEqual(
        []
      );
    });

    it("returns 413 for files over the limit, and stores nothing", async () => {
      const { client } = await adminClient();
      const { publicationId } = await createFromMyst(client);
      const padding = "x".repeat(BIBLIOGRAPHY_MAX_BYTES);

      const res = await putBibliography(client, publicationId, [
        { filename: "refs.bib", content: `@misc{big, title = {${padding}}}` },
      ]);

      expect(res.status).toBe(413);
      expect(res.body.errors.files.message).toMatch(/larger than/);
      expect((await getBibliography(client, publicationId)).body.files).toEqual(
        []
      );
    });

    it("refuses a Google Doc draft", async () => {
      const { client } = await adminClient();
      const { publicationId } = await createFromMyst(client);
      await query(
        `UPDATE versions SET import_document_format = 'gdoc' WHERE publication_id = '${publicationId}'`
      );

      const res = await putBibliography(client, publicationId, [
        { filename: "refs.bib", content: REFS_BIB },
      ]);

      expect(res.status).toBe(409);
    });
  });

  describe("the draft it is stored on", () => {
    it("carries into the next draft after publishing", async () => {
      const { client } = await adminClient();
      const { publicationId, slug } = await createFromMyst(client);
      await putBibliography(client, publicationId, [
        { filename: "refs.bib", content: REFS_BIB },
      ]);
      await addSelfToByline(client, publicationId);
      expect(
        (
          await client
            .post(`/api/v1/publications/id/${publicationId}/versions`)
            .send({})
        ).status
      ).toBe(201);

      const opened = await client.post(`/api/publications/${slug}/draft`);

      expect(opened.status).toBe(201);
      expect((await getBibliography(client, publicationId)).body.files).toEqual(
        [{ filename: "refs.bib", content: REFS_BIB }]
      );
    });

    it("survives a content push", async () => {
      const { client } = await adminClient();
      const { publicationId } = await createFromMyst(client);
      await putBibliography(client, publicationId, [
        { filename: "refs.bib", content: REFS_BIB },
      ]);

      const pushed = await client
        .put(`/api/v1/publications/id/${publicationId}/draft/content`)
        .set("Content-Type", "text/markdown")
        .send("---\ntitle: Ravens, revisited\n---\n\nAgain.\n");

      expect(pushed.status).toBe(200);
      expect((await getBibliography(client, publicationId)).body.files).toEqual(
        [{ filename: "refs.bib", content: REFS_BIB }]
      );
    });
  });

  describe("permissions", () => {
    it("returns 401 without a session", async () => {
      const { client } = await adminClient();
      const { publicationId } = await createFromMyst(client);

      const res = await putBibliography(new TestApiClient(), publicationId, []);

      expect(res.status).toBe(401);
      expect(res.body).toEqual(UNAUTHENTICATED);
    });

    it("returns 403 for a user who can't edit the publication", async () => {
      const { client } = await adminClient();
      const { publicationId } = await createFromMyst(client);
      const other = await outsiderClient();

      const res = await putBibliography(other, publicationId, []);

      expect(res.status).toBe(403);
      expect(res.body).toEqual(PERMISSION_DENIED);
    });
  });
});

const CITING_DOCUMENT = [
  "---",
  "title: Ravens and crows",
  "---",
  "",
  "They remember {cite}`smith2020`, {cite}`linked2021` and {cite}`jones2019`.",
  "",
].join("\n");

const FULL_BIB = [
  REFS_BIB,
  MORE_BIB,
  "@misc{linked2021,",
  "  title = {A page},",
  "  url = {https://example.org/page},",
  "}",
  "",
].join("\n");

function pushContent(
  client: TestApiClient,
  publicationId: string,
  source: string
) {
  return client
    .put(`/api/v1/publications/id/${publicationId}/draft/content`)
    .set("Content-Type", "text/markdown")
    .send(source);
}

async function v0References(client: TestApiClient, slug: string) {
  const res = await client.get(`/api/publications/${slug}/draft`);
  expect(res.status).toBe(200);
  return (res.body.publication.references as { url: string }[])
    .map((r) => r.url)
    .sort();
}

describe("references of a cited bibliography", () => {
  async function citingPublication() {
    const { client } = await adminClient();
    const { publicationId, slug } = await createFromMyst(client);
    expect(
      (
        await putBibliography(client, publicationId, [
          { filename: "refs.bib", content: FULL_BIB },
        ])
      ).status
    ).toBe(200);
    expect(
      (await pushContent(client, publicationId, CITING_DOCUMENT)).status
    ).toBe(200);
    return { client, publicationId, slug };
  }

  it("links a cited entry with a DOI or a URL, and leaves the rest out", async () => {
    const { client, slug } = await citingPublication();

    // jones2019 has neither a DOI nor a URL, so it is no reference.
    expect(await v0References(client, slug)).toEqual([
      "https://doi.org/10.1234/abc.def",
      "https://example.org/page",
    ]);
  });

  it("never writes an entry's text to the shared reference row", async () => {
    await citingPublication();

    const [row] = await query<{ text: string }>(
      "SELECT text FROM `references` WHERE url = 'https://example.org/page'"
    );
    expect(row?.text).toBe("");
  });

  it("unlinks them when the bibliography is removed", async () => {
    const { client, publicationId, slug } = await citingPublication();

    expect((await putBibliography(client, publicationId, [])).status).toBe(200);

    expect(await v0References(client, slug)).toEqual([]);
  });
});

const MDAST = "application/vnd.thestacks.mdast+json";

function citeNodes(tree: { type: string; children?: unknown[] }) {
  const found: Record<string, unknown>[] = [];
  const visit = (node: Record<string, unknown>) => {
    if (node["type"] === "cite") found.push(node);
    (node["children"] as Record<string, unknown>[] | undefined)?.forEach(visit);
  };
  visit(tree as unknown as Record<string, unknown>);
  return found;
}

describe("the bibliography of a publication response", () => {
  it("carries the files and only the entries the document cites", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createFromMyst(client);
    await putBibliography(client, publicationId, [
      { filename: "refs.bib", content: FULL_BIB },
    ]);

    const res = await client.get(
      `/api/v1/publications/id/${publicationId}/draft`
    );

    expect(res.status).toBe(200);
    // The document cites smith2020 only; jones2019 and linked2021 are in the
    // file but not in the response.
    expect(res.body.publication.bibliography).toEqual({
      files: ["refs.bib"],
      entries: {
        smith2020: expect.objectContaining({
          type: "article-journal",
          title: "On <i>things</i>",
          DOI: "10.1234/ABC.def",
        }),
      },
    });
  });

  it("stays on the version once it is published", async () => {
    const { client } = await adminClient();
    const { publicationId, slug } = await createFromMyst(client);
    await putBibliography(client, publicationId, [
      { filename: "refs.bib", content: REFS_BIB },
    ]);
    await addSelfToByline(client, publicationId);
    expect(
      (
        await client
          .post(`/api/v1/publications/id/${publicationId}/versions`)
          .send({})
      ).status
    ).toBe(201);

    const res = await client.get(`/api/v1/publications/p/${slug}`);

    expect(res.status).toBe(200);
    expect(res.body.publication.bibliography.files).toEqual(["refs.bib"]);
    expect(Object.keys(res.body.publication.bibliography.entries)).toEqual([
      "smith2020",
    ]);
  });

  it("is absent for a publication without one", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createFromMyst(client);

    const res = await client.get(
      `/api/v1/publications/id/${publicationId}/draft`
    );

    expect(res.status).toBe(200);
    expect(res.body.publication).not.toHaveProperty("bibliography");
  });
});

describe("the MyST AST of a draft with a bibliography", () => {
  it("numbers a cited key and carries its text", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createFromMyst(client);
    const before = await client
      .get(`/api/v1/publications/id/${publicationId}/draft`)
      .set("Accept", MDAST);
    expect(before.status).toBe(200);
    expect(citeNodes(before.body.tree)[0]).toMatchObject({ error: true });

    await putBibliography(client, publicationId, [
      { filename: "refs.bib", content: REFS_BIB },
    ]);

    const after = await client
      .get(`/api/v1/publications/id/${publicationId}/draft`)
      .set("Accept", MDAST);
    expect(after.status).toBe(200);
    expect(after.headers.etag).not.toBe(before.headers.etag);
    expect(citeNodes(after.body.tree)).toEqual([
      expect.objectContaining({
        label: "https://doi.org/10.1234/abc.def",
        enumerator: "1",
        citationKey: "smith2020",
        citationText: "Müller A, Jones B. (2020). On things.",
      }),
    ]);
    expect(after.body.citations.order).toEqual([
      "https://doi.org/10.1234/abc.def",
    ]);
    expect(after.body.messages).toEqual([]);
  });
});

describe("GET /api/v1/publications/id/{id}/draft/bibliography", () => {
  it("returns an empty list for a draft without a bibliography", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createFromMyst(client);

    const res = await getBibliography(client, publicationId);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ files: [] });
    expect(res.headers.etag).toBe(await draftEtag(client, publicationId));
  });

  it("returns 404 for a publication with no draft", async () => {
    const { client, userId } = await adminClient();
    const { id: publicationId } = await seedPublication({
      ownerId: userId,
      slug: "published-no-draft",
      state: "PUBLISHED",
    });

    const res = await getBibliography(client, publicationId);

    expect(res.status).toBe(404);
    expect(res.body.errors.draft.message).toBe("No draft found");
  });

  it("returns 404 for an unknown publication", async () => {
    const { client } = await adminClient();

    const res = await getBibliography(client, "01JQZ0X0X0X0X0X0X0X0X0X0X0");

    expect(res.status).toBe(404);
    expect(res.body.errors.publication.message).toBe("Publication not found");
  });

  it("returns 403 for a user who can't see the draft", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createFromMyst(client);
    const other = await outsiderClient();

    const res = await getBibliography(other, publicationId);

    expect(res.status).toBe(403);
    expect(res.body).toEqual(PERMISSION_DENIED);
  });
});
