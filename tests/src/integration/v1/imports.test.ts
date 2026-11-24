import { escape } from "mysql2";
import { describe, expect, it } from "vitest";
import {
  api,
  execute,
  loggedInUser,
  makeUser,
  PERMISSION_DENIED,
  query,
  registerUserWithId,
  seedOrg,
  seedOrgMember,
  seedSiteAdmin,
  setMembershipStart,
  TestApiClient,
  UNAUTHENTICATED,
  waitForRows,
} from "./helpers.js";

const IMPORTS = "/api/v1/imports";

const urlSource = (url: string) => ({ source: { type: "url", url } });
const GOOGLE_DOC = urlSource("https://docs.google.com/document/d/abc/edit");

// Ids name fixtures in tests/fixtures/google-docs/, served by media-mock.
const googleDoc = (id: string) =>
  urlSource(`https://docs.google.com/document/d/${id}/edit`);

const countPublications = () =>
  query("SELECT COUNT(*) AS count FROM publications");

async function loggedInAdmin() {
  const registered = await registerUserWithId();
  await seedSiteAdmin(registered.userId);
  await registered.client.login(
    registered.user.username,
    registered.user.password
  );
  return registered;
}

async function expectImportedDraft(
  client: TestApiClient,
  ownerId: string,
  resp: { status: number; body: Record<string, unknown> },
  title: string = "Field Notes",
  settled: boolean = false
) {
  expect(resp.status).toBe(201);
  expect(resp.body).toMatchObject({
    publicationId: expect.any(String),
    versionId: expect.any(String),
    importId: expect.any(String),
    slug: expect.any(String),
    settled,
    validationErrors: expect.any(Array),
  });
  const publicationId = resp.body.publicationId as string;

  const draft = await client.get(
    `/api/v1/publications/id/${publicationId}/draft`
  );
  expect(draft.status).toBe(200);
  expect(draft.body.publication.title).toBe(title);

  const rows = await query<{ owner_id: string }>(
    `SELECT owner_id FROM publications WHERE id = ${escape(publicationId)}`
  );
  expect(rows[0]!.owner_id).toBe(ownerId);
  return publicationId;
}

describe("v1 imports", () => {
  it("documents the import route", async () => {
    const resp = await api().get("/api/v1/openapi.json");
    expect(resp.body.paths["/imports"].post.summary).toBe(
      "Import a publication"
    );
  });

  it("requires a session", async () => {
    const before = await countPublications();
    const resp = await new TestApiClient().post(IMPORTS).send(GOOGLE_DOC);
    expect(resp.status).toBe(401);
    expect(resp.body).toEqual(UNAUTHENTICATED);
    expect(await countPublications()).toEqual(before);
  });

  it("rejects callers who can't create publications", async () => {
    const { client } = await loggedInUser("importer");
    const before = await countPublications();
    const resp = await client.post(IMPORTS).send(GOOGLE_DOC);
    expect(resp.status).toBe(403);
    expect(resp.body).toEqual(PERMISSION_DENIED);
    expect(await countPublications()).toEqual(before);
  });

  it("lets Arcadia members past the permission check", async () => {
    const { client, user, userIds } = await registerUserWithId(
      makeUser("member")
    );
    const { orgIdInt } = await seedOrg("Arcadia Science", "arcadia-science");
    await seedOrgMember(orgIdInt, userIds);
    await client.login(user.username, user.password);

    // A non-Google URL fails after the permission check, so 400 (not 403)
    // shows the member was allowed to import.
    const resp = await client
      .post(IMPORTS)
      .send(urlSource("https://example.com/not-a-doc"));
    expect(resp.status).toBe(400);
  });

  it("rejects Arcadia members whose membership hasn't started", async () => {
    const { client, userId, userIds } = await loggedInUser("futuremember");
    const org = await seedOrg("Arcadia Science", "arcadia-science");
    await seedOrgMember(org.orgIdInt, userIds);
    await setMembershipStart(org, userId, "2999-01-01 00:00:00");

    const resp = await client
      .post(IMPORTS)
      .send(urlSource("https://example.com/not-a-doc"));
    expect(resp.status).toBe(403);
    expect(resp.body).toEqual(PERMISSION_DENIED);
  });

  it("rejects moderated Arcadia members", async () => {
    const { client, userId, userIds } = await loggedInUser("moderatedmember");
    const { orgIdInt } = await seedOrg("Arcadia Science", "arcadia-science");
    await seedOrgMember(orgIdInt, userIds);
    await execute(
      `UPDATE users SET state = 'MODERATED' WHERE id_int = ${userId}`
    );

    const resp = await client
      .post(IMPORTS)
      .send(urlSource("https://example.com/not-a-doc"));
    expect(resp.status).toBe(403);
    expect(resp.body).toEqual(PERMISSION_DENIED);
  });

  it("rejects URLs that aren't Google Docs", async () => {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);
    const resp = await client
      .post(IMPORTS)
      .send(urlSource("https://example.com/not-a-doc"));
    expect(resp.status).toBe(400);
    expect(resp.body).toEqual({
      type: "application_error",
      errors: {
        source: { message: "Only Google Docs URLs can be imported" },
      },
    });
  });

  it("rejects non-Google URLs with an explicit gdoc format", async () => {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);
    const resp = await client.post(IMPORTS).send({
      ...urlSource("https://example.com/not-a-doc"),
      format: { type: "gdoc" },
    });
    expect(resp.status).toBe(400);
  });

  it("rejects unknown formats", async () => {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);
    const resp = await client
      .post(IMPORTS)
      .send({ ...GOOGLE_DOC, format: { type: "latex" } });
    expect(resp.status).toBe(422);
    expect(resp.body.type).toBe("validation_error");
  });

  it("validates the request body", async () => {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);
    const resp = await client.post(IMPORTS).send(urlSource("nope"));
    expect(resp.status).toBe(422);
    expect(resp.body.type).toBe("validation_error");
  });
});

// Mirrors the POST /api/v1/publications coverage in publications-basic.test.ts.
describe("v1 imports: created draft", () => {
  it("creates a draft for site admins", async () => {
    const { client, userIds } = await loggedInAdmin();
    const resp = await client.post(IMPORTS).send(googleDoc("field-notes"));
    await expectImportedDraft(client, userIds.id, resp, undefined, true);
  });

  it("creates a draft for Arcadia members", async () => {
    const { client, user, userIds } = await registerUserWithId(
      makeUser("member")
    );
    const { orgIdInt } = await seedOrg("Arcadia Science", "arcadia-science");
    await seedOrgMember(orgIdInt, userIds);
    await client.login(user.username, user.password);

    const resp = await client.post(IMPORTS).send(googleDoc("field-notes"));
    await expectImportedDraft(client, userIds.id, resp, undefined, true);
  });

  it("returns 404 for a document that doesn't exist", async () => {
    const { client } = await loggedInAdmin();
    const before = await countPublications();
    const resp = await client.post(IMPORTS).send(googleDoc("does-not-exist"));
    expect(resp.status).toBe(404);
    expect(resp.body.errors.source).toBeDefined();
    expect(await countPublications()).toEqual(before);
  });

  it("returns 403 for a document Raven can't access", async () => {
    const { client } = await loggedInAdmin();
    const before = await countPublications();
    const resp = await client.post(IMPORTS).send(googleDoc("private"));
    expect(resp.status).toBe(403);
    expect(resp.body.errors.source).toBeDefined();
    expect(await countPublications()).toEqual(before);
  });

  it.each(["status-503", "status-429"])(
    "returns 502 when Google answers %s",
    async (id) => {
      const { client } = await loggedInAdmin();
      const before = await countPublications();
      const resp = await client.post(IMPORTS).send(googleDoc(id));
      expect(resp.status).toBe(502);
      expect(resp.body.errors.source).toBeDefined();
      expect(await countPublications()).toEqual(before);
    }
  );

  it("returns 422 for directives nested past the maximum depth", async () => {
    const { client } = await loggedInAdmin();
    const before = await countPublications();
    const resp = await client
      .post(IMPORTS)
      .send(googleDoc("directives-too-deep"));
    expect(resp.status).toBe(422);
    expect(resp.body).toMatchObject({
      type: "validation_error",
      errors: [
        {
          code: "custom",
          path: ["body"],
          message: expect.stringContaining("Maximum directive depth of 32"),
        },
      ],
    });
    expect(await countPublications()).toEqual(before);
  });

  it("returns diagnostics with a location for content it worked around", async () => {
    const { client } = await loggedInAdmin();
    const resp = await client.post(IMPORTS).send(googleDoc("diagnostics"));
    expect(resp.status).toBe(201);
    expect(resp.body.validationErrors).toContainEqual({
      code: "unmatched-directive-close",
      severity: "error",
      message: expect.any(String),
      path: ["body"],
      range: {
        startLine: expect.any(Number),
        startColumn: 1,
        endLine: expect.any(Number),
        endColumn: 5,
      },
    });
  });

  it("returns the current import, with its diagnostics, on the draft", async () => {
    const { client } = await loggedInAdmin();
    const resp = await client.post(IMPORTS).send(googleDoc("diagnostics"));
    const draftUrl = `/api/v1/publications/id/${resp.body.publicationId}/draft`;

    const draft = (await client.get(draftUrl)).body.publication;
    const [importRow] = await query<{ id: string }>(
      `SELECT id FROM version_imports WHERE version_id = ${escape(resp.body.versionId)}`
    );
    expect(draft.importDocument).toMatchObject({
      id: importRow!.id,
      url: "https://docs.google.com/document/d/diagnostics/edit",
      format: "gdoc",
      syncDate: expect.any(String),
    });
    // Stored with the text around it, so it can be found after edits.
    expect(draft.importDocument.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "unmatched-directive-close",
        excerpt: expect.objectContaining({
          before: "Before\n\n",
          highlight: expect.objectContaining({ start: "\\:::" }),
          after: expect.stringMatching(/^\n\nAfter/),
        }),
      })
    );

    // Replacing the import document makes a new import current.
    const replaced = await client.patch(draftUrl).send({
      importDocument: {
        body: "<p>New source</p>",
        url: "https://docs.google.com/document/d/other/edit",
        format: "gdoc",
        filename: "Other",
      },
    });
    expect(replaced.status).toBe(200);
    const afterReplace = (await client.get(draftUrl)).body.publication;
    expect(afterReplace.importDocument).toMatchObject({
      url: "https://docs.google.com/document/d/other/edit",
      filename: "Other",
      diagnostics: null,
    });
    expect(afterReplace.importDocument.id).not.toBe(importRow!.id);

    // Clearing it removes the current import.
    const cleared = await client.patch(draftUrl).send({ importDocument: null });
    expect(cleared.status).toBe(200);
    expect(
      (await client.get(draftUrl)).body.publication.importDocument
    ).toBeUndefined();
  });

  it("lists the fields edited since the import on the draft", async () => {
    const { client } = await loggedInAdmin();
    const resp = await client.post(IMPORTS).send(googleDoc("field-notes"));
    const draftUrl = `/api/v1/publications/id/${resp.body.publicationId}/draft`;
    const imported = (await client.get(draftUrl)).body.publication;
    expect(imported.importDocument.editedFields).toEqual([]);

    // Unchanged fields, and an empty subtitle sent as "", don't count as edits.
    const first = await client.patch(draftUrl).send({
      title: "Edited title",
      subtitle: imported.subtitle ?? "",
      abstract: imported.abstract,
      body: imported.body,
    });
    expect(first.status).toBe(200);
    expect(first.body.publication.importDocument.editedFields).toEqual([
      "title",
    ]);

    const second = await client
      .patch(draftUrl)
      .send({ abstract: "Edited abstract" });
    expect(second.status).toBe(200);
    expect(second.body.publication.importDocument.editedFields).toEqual([
      "title",
      "abstract",
    ]);

    const third = await client
      .patch(draftUrl)
      .send({ title: "Edited a third time" });
    expect(third.status).toBe(200);
    expect(third.body.publication.importDocument.editedFields).toEqual([
      "title",
      "abstract",
    ]);
  });

  it("lists edited fields in a fixed order, not the order they were edited in", async () => {
    const { client } = await loggedInAdmin();
    const resp = await client.post(IMPORTS).send(googleDoc("field-notes"));
    const draftUrl = `/api/v1/publications/id/${resp.body.publicationId}/draft`;

    await client.patch(draftUrl).send({ abstract: "Edited abstract" });
    const edited = await client.patch(draftUrl).send({ title: "Edited title" });

    expect(edited.status).toBe(200);
    expect(edited.body.publication.importDocument.editedFields).toEqual([
      "title",
      "abstract",
    ]);
  });

  it("lists earlier versions' imports on a new version's draft", async () => {
    const { client, userIds } = await loggedInAdmin();
    const resp = await client.post(IMPORTS).send(googleDoc("field-notes"));
    const publicationId = await expectImportedDraft(
      client,
      userIds.id,
      resp,
      undefined,
      true
    );
    const draftUrl = `/api/v1/publications/id/${publicationId}/draft`;

    // Publishing requires at least one byline contributor.
    const patchResp = await client.patch(draftUrl).send({
      contributors: [
        {
          userId: userIds.id,
          roles: ["author"],
          inByline: true,
          affiliations: [],
        },
      ],
    });
    expect(patchResp.status).toBe(200);
    const publishResp = await client.post(
      `/api/v1/publications/id/${publicationId}/versions`
    );
    expect(publishResp.status).toBe(201);

    // The published version keeps its import, without the editor's fields.
    const published = (
      await client.get(`/api/v1/publications/id/${publicationId}`)
    ).body.publication;
    expect(published.importDocument).toMatchObject({
      id: resp.body.importId,
      diagnostics: null,
      editedFields: null,
    });
    expect(published.versions[0].importDocument).toBeNull();

    // A new version's draft has no import of its own, but lists v1's.
    const created = await client.post(draftUrl);
    expect(created.status).toBe(201);
    const draft = (await client.get(draftUrl)).body.publication;
    expect(draft.importDocument).toBeUndefined();
    const listed = (versionNumber: number) =>
      draft.versions.find(
        (v: { versionNumber: number }) => v.versionNumber === versionNumber
      );
    expect(listed(1).importDocument).toMatchObject({
      id: resp.body.importId,
      url: "https://docs.google.com/document/d/field-notes/edit",
      format: "gdoc",
      syncDate: expect.any(String),
    });
    // Listed imports leave out the raw source and diagnostics.
    expect(listed(1).importDocument).not.toHaveProperty("body");
    expect(listed(1).importDocument).not.toHaveProperty("diagnostics");
    // The draft itself isn't listed.
    expect(listed(2)).toBeUndefined();
  });

  it("applies the gdoc singleLineBreaks option", async () => {
    const { client } = await loggedInAdmin();
    const bodyOf = async (format: Record<string, unknown>) => {
      const resp = await client
        .post(IMPORTS)
        .send({ ...googleDoc("diagnostics"), format });
      expect(resp.status).toBe(201);
      const rows = await query<{ body: string }>(
        `SELECT body FROM versions WHERE id = ${escape(resp.body.versionId)}`
      );
      return rows[0]!.body;
    };

    expect(await bodyOf({ type: "gdoc" })).toContain("After\n\nthe break");
    expect(
      await bodyOf({ type: "gdoc", singleLineBreaks: "line-break" })
    ).toMatch(/After( {2}|\\)\nthe break/);
  });

  // A real export (see tests/fixtures/google-docs). Conversion itself is
  // covered by the importer's snapshot tests; this checks the HTTP and storage
  // side. It has no media to upload, so nothing reaches out to Google.
  it("imports a real Google Docs export", async () => {
    const { client, userIds } = await loggedInAdmin();
    const resp = await client
      .post(IMPORTS)
      .send(googleDoc("DemoTheStacksTableTest"));
    await expectImportedDraft(
      client,
      userIds.id,
      resp,
      "Table and Header Test",
      true
    );
  });

  // Generated by media-mock: the real exports convert to bodies under TEXT's
  // 64 KiB, so they can't show the MEDIUMTEXT columns are needed.
  it(
    "stores a multi-megabyte export and queues its embedded images",
    { timeout: 30_000 },
    async () => {
      const { client, userIds } = await loggedInAdmin();
      const resp = await client.post(IMPORTS).send(googleDoc("large"));
      await expectImportedDraft(client, userIds.id, resp, "Large Export");

      const [row] = await query<{ body: number; source: number }>(
        `SELECT LENGTH(v.body) AS body, LENGTH(vi.body) AS source
       FROM versions v JOIN version_imports vi ON vi.id = v.current_import_id
       WHERE v.id = ${escape(resp.body.versionId)}`
      );
      // The source keeps its base64 images; the body references them instead.
      expect(Number(row!.source)).toBeGreaterThan(1_000_000);
      expect(Number(row!.body)).toBeGreaterThan(65_535);
      expect(Number(row!.body)).toBeLessThan(100_000);

      const itemsOf = `FROM media_import_items i
       JOIN media_import_batches b ON b.id = i.batch_id
       WHERE b.version_id = ${escape(resp.body.versionId)}`;

      // The media workers run live and may already have taken some items, which
      // clears their data.
      const items = await query<{
        type: string;
        status: string;
        bytes: number | null;
      }>(
        `SELECT JSON_UNQUOTE(JSON_EXTRACT(i.media, '$.source.type')) AS type,
         i.status, LENGTH(i.data) AS bytes ${itemsOf}`
      );
      expect(items).toHaveLength(7);
      for (const item of items) {
        expect(item.type).toBe("bytes");
        if (item.status === "pending" || item.status === "active")
          expect(Number(item.bytes)).toBeGreaterThan(0);
      }

      // Once every item settles, its bytes have been uploaded and dropped.
      const [settled] = await waitForRows<{ n: number }>(
        `SELECT COUNT(*) AS n ${itemsOf}
       HAVING SUM(i.status IN ('pending', 'active')) = 0`,
        { timeoutMs: 10_000 }
      );
      expect(Number(settled?.n)).toBe(7);
      const settledItems = await query<{
        status: string;
        bytes: number | null;
        s3Url: string | null;
      }>(
        `SELECT i.status, LENGTH(i.data) AS bytes, i.s3_url AS s3Url ${itemsOf}`
      );
      for (const item of settledItems) {
        expect(item).toMatchObject({ status: "completed", bytes: null });
        expect(item.s3Url).toBeTruthy();
      }
    }
  );

  it("produces a draft that can be published", async () => {
    const { client, userIds } = await loggedInAdmin();
    const resp = await client.post(IMPORTS).send(googleDoc("field-notes"));
    const publicationId = await expectImportedDraft(
      client,
      userIds.id,
      resp,
      undefined,
      true
    );

    // Publishing requires at least one byline contributor.
    const patchResp = await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({
        contributors: [
          {
            userId: userIds.id,
            roles: ["author"],
            inByline: true,
            affiliations: [],
          },
        ],
      });
    expect(patchResp.status).toBe(200);

    const publishResp = await client.post(
      `/api/v1/publications/id/${publicationId}/versions`
    );
    expect(publishResp.status).toBe(201);
    expect(publishResp.body).toMatchObject({
      publicationId,
      versionNumber: 1,
      state: "PUBLISHED",
    });
    expect(
      (await client.get(`/api/v1/publications/id/${publicationId}/draft`))
        .status
    ).toBe(404);
  });

  it("produces handles fields too long", async () => {
    const { client, userIds } = await loggedInAdmin();
    const resp = await client.post(IMPORTS).send(googleDoc("fields-too-long"));
    const publicationId = await expectImportedDraft(
      client,
      userIds.id,
      resp,
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer luctus luctus blandit. Proin eget risus non ipsum accumsan ultricies et cursus magna. Maecenas varius blandit justo, non egestas nisi semper non. Pellentesque sodales libero et quam tempus v",
      true
    );

    // Publishing requires at least one byline contributor.
    const patchResp = await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({
        contributors: [
          {
            userId: userIds.id,
            roles: ["author"],
            inByline: true,
            affiliations: [],
          },
        ],
      });
    expect(patchResp.status).toBe(200);

    const publishResp = await client.post(
      `/api/v1/publications/id/${publicationId}/versions`
    );
    expect(publishResp.status).toBe(422);

    const patchResp2 = await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({
        subtitle: "shorter subtitle",
      });
    expect(patchResp2.status).toBe(200);

    const publishResp2 = await client.post(
      `/api/v1/publications/id/${publicationId}/versions`
    );
    expect(publishResp2.status).toBe(201);

    expect(publishResp2.body).toMatchObject({
      publicationId,
      versionNumber: 1,
      state: "PUBLISHED",
    });
    expect(
      (await client.get(`/api/v1/publications/id/${publicationId}/draft`))
        .status
    ).toBe(404);
  });
});

describe("v1 imports: into an existing draft", () => {
  const intoDraft = (id: string, publicationId: string) => ({
    ...googleDoc(id),
    target: { type: "draft", publicationId },
  });

  /** Imports field-notes, which has no media, and publishes it. */
  async function publishedImport() {
    const registered = await loggedInAdmin();
    const { client, userIds } = registered;
    const resp = await client.post(IMPORTS).send(googleDoc("field-notes"));
    const publicationId = await expectImportedDraft(
      client,
      userIds.id,
      resp,
      undefined,
      true
    );
    // Publishing requires at least one byline contributor.
    await client.patch(`/api/v1/publications/id/${publicationId}/draft`).send({
      contributors: [
        {
          userId: userIds.id,
          roles: ["author"],
          inByline: true,
          affiliations: [],
        },
      ],
    });
    const published = await client.post(
      `/api/v1/publications/id/${publicationId}/versions`
    );
    expect(published.status, published.text).toBe(201);
    return { ...registered, publicationId };
  }

  it("replaces the draft's content and import, keeping the rest", async () => {
    const { client } = await loggedInAdmin();
    const first = await client.post(IMPORTS).send(googleDoc("field-notes"));
    const { publicationId, versionId, slug } = first.body;
    const draftUrl = `/api/v1/publications/id/${publicationId}/draft`;
    const edited = await client
      .patch(draftUrl)
      .send({ title: "Edited title", tags: ["kept"] });
    expect(edited.body.publication.importDocument.editedFields).toEqual([
      "title",
    ]);
    const before = await countPublications();

    const resp = await client
      .post(IMPORTS)
      .send(intoDraft("diagnostics", publicationId));

    expect(resp.status, resp.text).toBe(201);
    expect(resp.body).toMatchObject({
      publicationId,
      versionId,
      slug,
      importId: expect.any(String),
      settled: true,
    });
    expect(resp.body.importId).not.toBe(first.body.importId);
    expect(resp.body.validationErrors).toContainEqual(
      expect.objectContaining({ code: "unmatched-directive-close" })
    );
    expect(await countPublications()).toEqual(before);

    const draft = (await client.get(draftUrl)).body.publication;
    expect(draft.title).toBe("Diagnostics");
    expect(draft.body).toMatch(/^Before/);
    expect(draft.tags).toEqual(["kept"]);
    expect(draft.importDocument).toMatchObject({
      id: resp.body.importId,
      url: "https://docs.google.com/document/d/diagnostics/edit",
      editedFields: [],
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "unmatched-directive-close",
          excerpt: expect.any(Object),
        }),
      ]),
    });
  });

  it("gives a new version's draft its own import", async () => {
    const { client, publicationId } = await publishedImport();
    const draftUrl = `/api/v1/publications/id/${publicationId}/draft`;
    expect((await client.post(draftUrl)).status).toBe(201);

    const resp = await client
      .post(IMPORTS)
      .send(intoDraft("field-notes", publicationId));

    expect(resp.status, resp.text).toBe(201);
    const draft = (await client.get(draftUrl)).body.publication;
    expect(draft.importDocument).toMatchObject({
      id: resp.body.importId,
      url: "https://docs.google.com/document/d/field-notes/edit",
    });
  });

  it("returns 404 when the publication has no draft", async () => {
    const { client, publicationId } = await publishedImport();

    const resp = await client
      .post(IMPORTS)
      .send(intoDraft("field-notes", publicationId));

    expect(resp.status, resp.text).toBe(404);
    expect(resp.body.errors.draft).toBeDefined();
  });

  it("returns 404 for a publication that doesn't exist", async () => {
    const { client } = await loggedInAdmin();

    const resp = await client
      .post(IMPORTS)
      .send(intoDraft("field-notes", "01ARZ3NDEKTSV4RRFFQ69G5FAV"));

    expect(resp.status, resp.text).toBe(404);
    expect(resp.body.errors.publication).toBeDefined();
  });

  it("returns 403 to a user who can't edit the publication", async () => {
    const { client } = await loggedInAdmin();
    const first = await client.post(IMPORTS).send(googleDoc("field-notes"));
    const other = await loggedInUser("reimporter");

    const resp = await other.client
      .post(IMPORTS)
      .send(intoDraft("diagnostics", first.body.publicationId));

    expect(resp.status, resp.text).toBe(403);
    expect(resp.body).toEqual(PERMISSION_DENIED);
  });

  it("validates the target", async () => {
    const { client } = await loggedInAdmin();

    const resp = await client
      .post(IMPORTS)
      .send(intoDraft("field-notes", "not-a-ulid"));

    expect(resp.status, resp.text).toBe(422);
  });
});
