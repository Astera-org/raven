import mysql from "mysql2/promise";
import { describe, expect, it } from "vitest";
import {
  addSelfToByline,
  execute,
  makeUser,
  query,
  registerUser,
  registerUserWithId,
  seedOrg,
  seedSiteAdmin,
  TestApiClient,
  waitForRows,
} from "./helpers.js";

const MYST_DOCUMENT = [
  "---",
  "title: Ravens and *crows*",
  "subtitle: A field study",
  "abstract: Corvids are clever.",
  "license: CC0-1.0",
  "keywords: [corvids, cognition]",
  "---",
  "",
  "## Methods",
  "",
  "We watched them.",
  "",
].join("\n");

/** What stops a MyST pub whose authors aren't Stacks users from publishing. */
const BYLINE_ISSUE = {
  code: "custom",
  path: ["contributors"],
  message: "At least one contributor must be in the byline",
};

/** The issue as a create or push reports it, among `validationErrors`. */
const BYLINE_ERROR = { ...BYLINE_ISSUE, severity: "error" };

type Issue = { severity?: string; path: unknown[]; message: string };

/** What a create or push changed or couldn't use, which doesn't block publishing. */
function warningsOf(body: { validationErrors: Issue[] }): Issue[] {
  return body.validationErrors
    .filter((issue) => issue.severity === "warning")
    .map(({ severity: _severity, ...issue }) => issue);
}

async function adminClient() {
  const { client, user, userId, userIds } = await registerUserWithId();
  await seedSiteAdmin(userId);
  await client.login(user.username, user.password);
  return { client, userUlid: userIds.id };
}

function postMyst(
  client: TestApiClient,
  source: string,
  { filename, ...fields }: { filename?: string; [field: string]: unknown } = {}
) {
  return client.post("/api/v1/publications").send({
    importDocument: { format: "mystmd", body: source, filename },
    ...fields,
  });
}

describe("POST /api/v1/publications with myst", () => {
  it("creates a draft from the document's frontmatter and body", async () => {
    const { client } = await adminClient();

    const res = await postMyst(client, MYST_DOCUMENT, { filename: "paper.md" });

    expect(res.status).toBe(201);
    const { publicationId, slug, versionId, validationErrors } = res.body;
    expect(res.headers.location).toBe(
      `/api/v1/publications/id/${publicationId}`
    );
    expect(res.headers.etag).toMatch(/^"[\w-]+"$/);
    expect(slug).toMatch(/^ravens-and-crows-/);
    expect(validationErrors).toEqual([BYLINE_ERROR]);
    expect(res.body.links).toEqual([
      {
        rel: "edit",
        href: expect.stringMatching(
          new RegExp(`/publications/${publicationId}/edit$`)
        ),
      },
    ]);

    const draft = await client.get(
      `/api/v1/publications/id/${publicationId}/draft`
    );
    expect(draft.status).toBe(200);
    expect(draft.body.publication).toMatchObject({
      title: "Ravens and *crows*",
      subtitle: "A field study",
      abstract: "Corvids are clever.",
      body: "## Methods\n\nWe watched them.",
      license: "CC0",
      contributors: [],
    });
    expect([...draft.body.publication.tags].sort()).toEqual([
      "cognition",
      "corvids",
    ]);

    const [version] = await query<{
      import_document_format: string;
      import_document_body: string;
      import_document_filename: string;
      import_document_url: string | null;
      import_document_sync_date: Date | null;
    }>(
      `SELECT import_document_format, import_document_body, import_document_filename, import_document_url, import_document_sync_date FROM versions WHERE id = '${versionId}'`
    );
    expect(version).toMatchObject({
      import_document_format: "mystmd",
      import_document_body: MYST_DOCUMENT,
      import_document_filename: "paper.md",
      import_document_url: null,
    });
    expect(version?.import_document_sync_date).not.toBeNull();
  });

  it("uses the slug and orgs from the query", async () => {
    const { client } = await adminClient();
    const { orgId: firstOrg } = await seedOrg("First Org", "first-org");
    const { orgId: secondOrg } = await seedOrg("Second Org", "second-org");

    const res = await postMyst(client, MYST_DOCUMENT, {
      slug: "My-Corvid-Study",
      orgs: [{ orgId: secondOrg }, { orgId: firstOrg }],
    });

    expect(res.status).toBe(201);
    expect(res.body.slug).toBe("my-corvid-study");
    const draft = await client.get(
      `/api/v1/publications/id/${res.body.publicationId}/draft`
    );
    const orgs: { orgId: string; priority: number }[] =
      draft.body.publication.orgs;
    expect(
      orgs
        .map((o) => [o.orgId, o.priority])
        .sort((a, b) => Number(a[1]) - Number(b[1]))
    ).toEqual([
      [secondOrg, 1],
      [firstOrg, 2],
    ]);
  });

  it("takes the title from a leading H1 and defaults the license", async () => {
    const { client } = await adminClient();

    const res = await postMyst(client, "# Corvid notes\n\nSome notes.\n");

    expect(res.status).toBe(201);
    const draft = await client.get(
      `/api/v1/publications/id/${res.body.publicationId}/draft`
    );
    expect(draft.body.publication).toMatchObject({
      title: "Corvid notes",
      body: "Some notes.",
      license: "CC BY",
    });
  });

  it("rejects an unsupported license", async () => {
    const { client } = await adminClient();

    const res = await postMyst(client, "---\nlicense: MIT\n---\n# T\n\nB\n");

    expect(res.status).toBe(422);
    expect(res.body.errors).toEqual([
      expect.objectContaining({
        path: ["license"],
        message: expect.stringContaining("CC-BY-4.0"),
      }),
    ]);
  });

  it("rejects invalid frontmatter", async () => {
    const { client } = await adminClient();

    const res = await postMyst(client, "---\ndoi: not-a-doi\n---\nBody\n");

    expect(res.status).toBe(422);
    expect(res.body.errors[0].path).toEqual(["body"]);
  });

  it("leaves out a DOI another publication already has", async () => {
    const { client } = await adminClient();
    const doiDocument = "---\ntitle: Page\ndoi: 10.1234/project\n---\nBody\n";
    const first = await postMyst(client, doiDocument);
    expect(first.status).toBe(201);

    const res = await postMyst(client, doiDocument);

    expect(res.status).toBe(201);
    expect(warningsOf(res.body)).toContainEqual(
      expect.objectContaining({
        path: ["doi"],
        message: expect.stringContaining("another publication already has it"),
      })
    );
    const [publication] = await query<{ doi: string | null }>(
      `SELECT doi FROM publications WHERE id = '${res.body.publicationId}'`
    );
    expect(publication?.doi).toBeNull();
  });

  it("rejects a document with neither title nor slug", async () => {
    const { client } = await adminClient();

    const res = await postMyst(client, "Just a body.\n");

    expect(res.status).toBe(422);
    expect(res.body.errors[0].path).toEqual(["slug"]);
  });

  it("rejects a slug that's taken", async () => {
    const { client } = await adminClient();
    expect(
      (await postMyst(client, MYST_DOCUMENT, { slug: "taken-slug-x" })).status
    ).toBe(201);

    const res = await postMyst(client, MYST_DOCUMENT, { slug: "taken-slug-x" });

    expect(res.status).toBe(422);
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({
        path: ["slug"],
        message: "Slug already exists",
      })
    );
  });

  it("rejects an unknown org without creating anything", async () => {
    const { client } = await adminClient();
    const { count: before } = (
      await query<{ count: number }>(
        "SELECT COUNT(*) AS count FROM publications"
      )
    )[0]!;

    const res = await postMyst(client, MYST_DOCUMENT, {
      orgs: [{ orgSlug: "no-such-org" }],
    });

    expect(res.status).toBe(422);
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({ path: ["orgs", 0], message: "Org not found" })
    );
    const { count: after } = (
      await query<{ count: number }>(
        "SELECT COUNT(*) AS count FROM publications"
      )
    )[0]!;
    expect(after).toBe(before);
  });

  it("rejects a keyword too long to store without creating anything", async () => {
    const { client } = await adminClient();
    const { count: before } = (
      await query<{ count: number }>(
        "SELECT COUNT(*) AS count FROM publications"
      )
    )[0]!;

    const res = await postMyst(
      client,
      MYST_DOCUMENT.replace("cognition", "k".repeat(256))
    );

    expect(res.status).toBe(422);
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({
        path: ["keywords", 1],
        message: "Keywords can be at most 255 characters",
      })
    );
    const { count: after } = (
      await query<{ count: number }>(
        "SELECT COUNT(*) AS count FROM publications"
      )
    )[0]!;
    expect(after).toBe(before);
  });

  it("attaches orgs given by slug", async () => {
    const { client } = await adminClient();
    const { orgId } = await seedOrg("Slug Org", "slug-org");

    const res = await postMyst(client, MYST_DOCUMENT, {
      orgs: [{ orgSlug: "slug-org" }],
    });

    expect(res.status).toBe(201);
    const draft = await getDraft(client, res.body.publicationId);
    expect(draft.orgs.map((o: { orgId: string }) => o.orgId)).toEqual([orgId]);
  });

  it("attaches an org given more than once only once", async () => {
    const { client } = await adminClient();
    const { orgId: repeatedOrg } = await seedOrg(
      "Repeated Org",
      "repeated-org"
    );
    const { orgId: otherOrg } = await seedOrg("Other Org", "other-org");

    const res = await postMyst(client, MYST_DOCUMENT, {
      orgs: [
        { orgId: repeatedOrg },
        { orgSlug: "repeated-org" },
        { orgId: otherOrg },
        { orgId: repeatedOrg },
      ],
    });

    expect(res.status).toBe(201);
    const draft = await getDraft(client, res.body.publicationId);
    const orgs: { orgId: string; priority: number }[] = draft.orgs;
    expect(
      orgs
        .map((o) => [o.orgId, o.priority])
        .sort((a, b) => Number(a[1]) - Number(b[1]))
    ).toEqual([
      [repeatedOrg, 1],
      [otherOrg, 2],
    ]);
  });

  it("needs exactly one of orgId and orgSlug per org", async () => {
    const { client } = await adminClient();
    const { orgId } = await seedOrg("Either Org", "either-org");

    for (const org of [{}, { orgId, orgSlug: "either-org" }]) {
      const res = await postMyst(client, MYST_DOCUMENT, { orgs: [org] });
      expect(res.status).toBe(422);
      expect(res.body.errors[0]).toMatchObject({
        path: ["orgs", 0],
        message: "Give exactly one of orgId or orgSlug",
      });
    }
  });

  it("truncates a long subtitle and reports it", async () => {
    const { client } = await adminClient();

    const res = await postMyst(
      client,
      `---\ntitle: T\nsubtitle: ${"s".repeat(310)}\n---\nBody\n`
    );

    expect(res.status).toBe(201);
    expect(warningsOf(res.body)).toContainEqual(
      expect.objectContaining({
        path: ["subtitle"],
        message: "Subtitle was truncated to 300 characters",
      })
    );
    expect(
      (await getDraft(client, res.body.publicationId)).subtitle
    ).toHaveLength(300);
  });

  it("requires a login and permission to create", async () => {
    const client = new TestApiClient();
    expect((await postMyst(client, MYST_DOCUMENT)).status).toBe(401);

    const user = await registerUser(client);
    await client.login(user.username, user.password);
    expect((await postMyst(client, MYST_DOCUMENT)).status).toBe(403);
  });

  it("rejects a raw text/markdown body", async () => {
    const { client } = await adminClient();

    const res = await client
      .post("/api/v1/publications")
      .set("Content-Type", "text/markdown")
      .send(MYST_DOCUMENT);

    expect(res.status).toBe(415);
    expect(res.body).toEqual({
      type: "application_error",
      errors: { root: { message: "Unsupported Media Type" } },
    });
  });

  it("rejects document fields alongside a MyST document", async () => {
    const { client } = await adminClient();

    const res = await postMyst(client, MYST_DOCUMENT, { title: "Other" });

    expect(res.status).toBe(422);
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({ path: ["importDocument"] })
    );
  });

  it("attaches orgs on a JSON create without myst", async () => {
    const { client } = await adminClient();
    const { orgId } = await seedOrg("Json Org", "json-org");

    const res = await client
      .post("/api/v1/publications")
      .send({ title: "From JSON", body: "Body.", orgs: [{ orgId }] });

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(
      `/api/v1/publications/id/${res.body.publicationId}`
    );
    expect(res.headers.etag).toMatch(/^"[\w-]+"$/);
    const draft = await client.get(
      `/api/v1/publications/id/${res.body.publicationId}/draft`
    );
    expect(
      draft.body.publication.orgs.map((o: { orgId: string }) => o.orgId)
    ).toEqual([orgId]);
  });

  it("returns 400 for malformed JSON", async () => {
    const { client } = await adminClient();

    const res = await client
      .post("/api/v1/publications")
      .set("Content-Type", "application/json")
      .send("{not json");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      type: "application_error",
      errors: { root: { message: "Malformed JSON in request body" } },
    });
  });
});

function putSource(
  client: TestApiClient,
  publicationId: string,
  source: string,
  ifMatch?: string
) {
  const req = client
    .put(`/api/v1/publications/id/${publicationId}/draft/content`)
    .set("Content-Type", "text/markdown");
  if (ifMatch !== undefined) req.set("If-Match", ifMatch);
  return req.send(source);
}

/**
 * Runs `fn` while inserting tags for `publicationId` fails, to make a write
 * fail partway. Creating a trigger needs root, which the `query` helper's
 * user isn't.
 */
async function withFailingTagInserts<T>(
  publicationId: string,
  fn: () => Promise<T>
): Promise<T> {
  const root = await mysql.createConnection(
    "mysql://root:test_root@localhost:3307/raven_test"
  );
  try {
    await root.query(
      "CREATE TRIGGER fail_tag_inserts BEFORE INSERT ON publication_tags " +
        `FOR EACH ROW BEGIN IF NEW.publication_id = '${publicationId}' THEN ` +
        "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tag insert failed'; " +
        "END IF; END"
    );
    return await fn();
  } finally {
    await root.query("DROP TRIGGER IF EXISTS fail_tag_inserts");
    await root.end();
  }
}

const UPDATED_DOCUMENT = [
  "---",
  "title: Ravens, revisited",
  "license: CC-BY-4.0",
  "keywords: [corvids, memory]",
  "---",
  "",
  "We watched them again.",
  "",
].join("\n");

async function createFromMyst(client: TestApiClient) {
  const res = await postMyst(client, MYST_DOCUMENT);
  expect(res.status).toBe(201);
  return {
    publicationId: res.body.publicationId as string,
    slug: res.body.slug as string,
    etag: res.headers.etag as string,
  };
}

async function getDraft(client: TestApiClient, publicationId: string) {
  const res = await client.get(
    `/api/v1/publications/id/${publicationId}/draft`
  );
  expect(res.status).toBe(200);
  return res.body.publication;
}

describe("PUT /api/v1/publications/id/{id}/draft/content", () => {
  it("replaces the draft's fields and tags when If-Match matches", async () => {
    const { client } = await adminClient();
    const { publicationId, etag } = await createFromMyst(client);

    const res = await putSource(client, publicationId, UPDATED_DOCUMENT, etag);

    expect(res.status).toBe(200);
    expect(res.body.validationErrors).toEqual([BYLINE_ERROR]);
    expect(res.body.links).toEqual([
      {
        rel: "edit",
        href: expect.stringMatching(
          new RegExp(`/publications/${publicationId}/edit$`)
        ),
      },
    ]);
    expect(res.headers.etag).toMatch(/^"[\w-]+"$/);
    expect(res.headers.etag).not.toBe(etag);
    const draft = await getDraft(client, publicationId);
    expect(draft).toMatchObject({
      title: "Ravens, revisited",
      subtitle: null,
      abstract: null,
      body: "We watched them again.",
      license: "CC BY",
    });
    expect([...draft.tags].sort()).toEqual(["corvids", "memory"]);
    expect(draft.contributors).toEqual([]);

    const [version] = await query<{ import_document_body: string }>(
      `SELECT import_document_body FROM versions WHERE id = '${res.body.versionId}'`
    );
    expect(version?.import_document_body).toBe(UPDATED_DOCUMENT);
  });

  it("returns 412 when the draft was edited elsewhere since that ETag", async () => {
    const { client } = await adminClient();
    const { publicationId, etag } = await createFromMyst(client);
    const patch = await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({ abstract: "Edited in the web editor." });
    expect(patch.status).toBe(200);

    const res = await putSource(client, publicationId, UPDATED_DOCUMENT, etag);

    expect(res.status).toBe(412);
    expect((await getDraft(client, publicationId)).abstract).toBe(
      "Edited in the web editor."
    );
  });

  it.each([
    ["tags", { tags: ["corvids", "edited"] }],
    ["license", { license: "CC BY" }],
  ])(
    "returns 412 when the %s changed since that ETag",
    async (_field, edit) => {
      const { client } = await adminClient();
      const { publicationId, etag } = await createFromMyst(client);
      const patch = await client
        .patch(`/api/v1/publications/id/${publicationId}/draft`)
        .send(edit);
      expect(patch.status).toBe(200);

      const res = await putSource(
        client,
        publicationId,
        UPDATED_DOCUMENT,
        etag
      );

      expect(res.status).toBe(412);
    }
  );

  it("keeps the ETag when the tags come back in another order", async () => {
    const { client } = await adminClient();
    const { publicationId, etag } = await createFromMyst(client);

    const res = await putSource(
      client,
      publicationId,
      MYST_DOCUMENT.replace(
        "keywords: [corvids, cognition]",
        "keywords: [cognition, corvids]"
      ),
      etag
    );

    expect(res.status).toBe(200);
    expect(res.headers.etag).toBe(etag);
  });

  it("applies concurrent pushes one after another, so the last one wins whole", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createFromMyst(client);
    const documents = [1, 2, 3, 4].map((n) =>
      [
        "---",
        `title: Push ${n}`,
        `keywords: [push-${n}, shared]`,
        "---",
        "",
        `Body ${n}.`,
        "",
      ].join("\n")
    );

    const responses = await Promise.all(
      documents.map((document) => putSource(client, publicationId, document))
    );

    expect(responses.map((res) => res.status)).toEqual([200, 200, 200, 200]);
    const draft = await getDraft(client, publicationId);
    const n = /^Push (\d)$/.exec(draft.title)?.[1];
    expect(draft.body).toBe(`Body ${n}.`);
    expect([...draft.tags].sort()).toEqual([`push-${n}`, "shared"]);
    const source = await getSource(client, publicationId);
    expect(source.status).toBe(200);
    expect(source.text).toBe(documents[Number(n) - 1]);
  });

  it("leaves the draft and its ETag as they were when a push fails partway", async () => {
    const { client } = await adminClient();
    const { publicationId, etag } = await createFromMyst(client);

    const failed = await withFailingTagInserts(publicationId, () =>
      putSource(client, publicationId, UPDATED_DOCUMENT, etag)
    );

    expect(failed.status).toBe(500);
    const draft = await getDraft(client, publicationId);
    expect(draft).toMatchObject({
      title: "Ravens and *crows*",
      body: expect.stringContaining("We watched them."),
      license: "CC0",
    });
    expect([...draft.tags].sort()).toEqual(["cognition", "corvids"]);
    const source = await getSource(client, publicationId);
    expect(source.status).toBe(200);
    expect(source.text).toBe(MYST_DOCUMENT);
    expect(source.headers.etag).toBe(etag);

    const retry = await putSource(
      client,
      publicationId,
      UPDATED_DOCUMENT,
      etag
    );
    expect(retry.status).toBe(200);
  });

  it("rejects a keyword too long to store, changing nothing", async () => {
    const { client } = await adminClient();
    const { publicationId, etag } = await createFromMyst(client);

    const res = await putSource(
      client,
      publicationId,
      UPDATED_DOCUMENT.replace("memory", "k".repeat(256)),
      etag
    );

    expect(res.status).toBe(422);
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({
        path: ["keywords", 1],
        message: "Keywords can be at most 255 characters",
      })
    );
    expect((await getDraft(client, publicationId)).title).toBe(
      "Ravens and *crows*"
    );
  });

  it("overwrites unconditionally without If-Match", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createFromMyst(client);
    await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({ abstract: "Edited in the web editor." });

    const res = await putSource(client, publicationId, UPDATED_DOCUMENT);

    expect(res.status).toBe(200);
    expect((await getDraft(client, publicationId)).abstract).toBeNull();
  });

  it("creates a draft after publishing, matching the published ETag", async () => {
    const { client } = await adminClient();
    const { publicationId, etag } = await createFromMyst(client);
    await addSelfToByline(client, publicationId);
    const publish = await client
      .post(`/api/v1/publications/id/${publicationId}/versions`)
      .send({});
    expect(publish.status, publish.text).toBe(201);

    const res = await putSource(
      client,
      publicationId,
      UPDATED_DOCUMENT.replace("license: CC-BY-4.0\n", ""),
      etag
    );

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(
      `/api/v1/publications/id/${publicationId}/draft`
    );
    expect(res.body.versionId).not.toBe(publish.body.id);
    expect((await getDraft(client, publicationId)).title).toBe(
      "Ravens, revisited"
    );
  });

  it("runs a push and a publish one after the other", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createFromMyst(client);
    await addSelfToByline(client, publicationId);
    const lock = await mysql.createConnection(
      "mysql://root:test_root@localhost:3307/raven_test"
    );
    let publish: Promise<{ status: number; text: string }>;
    let push: Promise<Awaited<ReturnType<typeof putSource>>>;
    try {
      await lock.beginTransaction();
      await lock.query("SELECT id FROM publications WHERE id = ? FOR UPDATE", [
        publicationId,
      ]);
      publish = Promise.resolve(
        client
          .post(`/api/v1/publications/id/${publicationId}/versions`)
          .send({})
      );
      push = Promise.resolve(
        putSource(client, publicationId, UPDATED_DOCUMENT)
      );
      await new Promise((resolve) => setTimeout(resolve, 500));

      const states = await query<{ state: string; title: string }>(
        `SELECT state, title FROM versions WHERE publication_id = '${publicationId}'`
      );
      expect(states).toEqual([{ state: "DRAFT", title: "Ravens and *crows*" }]);
    } finally {
      await lock.commit();
      await lock.end();
    }

    const [published, pushed] = await Promise.all([publish, push]);
    const versions = await query<{ state: string; title: string }>(
      `SELECT state, title FROM versions WHERE publication_id = '${publicationId}' ORDER BY version_number`
    );
    expect(published.status, published.text).toBe(201);
    if (pushed.status === 201) {
      // The publish went first, so the push opened a new draft.
      expect(versions).toEqual([
        { state: "PUBLISHED", title: "Ravens and *crows*" },
        { state: "DRAFT", title: "Ravens, revisited" },
      ]);
    } else {
      // The push went first, so the publish published the pushed draft.
      expect(pushed.status).toBe(200);
      expect(versions).toEqual([
        { state: "PUBLISHED", title: "Ravens, revisited" },
      ]);
    }
  });

  it("keeps the license of a published publication", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createFromMyst(client);
    await addSelfToByline(client, publicationId);
    await client
      .post(`/api/v1/publications/id/${publicationId}/versions`)
      .send({});

    const res = await putSource(client, publicationId, UPDATED_DOCUMENT);

    expect(res.status).toBe(201);
    expect(warningsOf(res.body)).toContainEqual(
      expect.objectContaining({ path: ["license"] })
    );
    expect((await getDraft(client, publicationId)).license).toBe("CC0");
    const source = await getSource(client, publicationId);
    expect(source.status).toBe(200);
    expect(source.headers.etag).toBe(res.headers.etag);
  });

  it("leaves an empty byline empty, so publishing waits for an author", async () => {
    const { client } = await adminClient();
    const create = await client
      .post("/api/v1/publications")
      .send({ title: "From the web editor", body: "Body." });
    expect(create.status).toBe(201);
    const { publicationId } = create.body;

    const res = await putSource(client, publicationId, UPDATED_DOCUMENT);

    expect(res.status).toBe(200);
    expect(res.body.validationErrors).toEqual([BYLINE_ERROR]);
    expect((await getDraft(client, publicationId)).contributors).toEqual([]);
    const publish = await client
      .post(`/api/v1/publications/id/${publicationId}/versions`)
      .send({});
    expect(publish.status).toBe(422);
    expect(publish.body.errors).toContainEqual(BYLINE_ISSUE);
  });

  it("records a DOI only on a never-published publication without one", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createFromMyst(client);

    const first = await putSource(
      client,
      publicationId,
      `---\ntitle: T\ndoi: 10.1234/first\n---\nBody\n`
    );
    expect(first.status).toBe(200);
    const second = await putSource(
      client,
      publicationId,
      `---\ntitle: T\ndoi: 10.1234/second\n---\nBody\n`
    );
    expect(second.status).toBe(200);
    expect(warningsOf(second.body)).toContainEqual(
      expect.objectContaining({ path: ["doi"] })
    );

    const [publication] = await query<{ doi: string }>(
      `SELECT doi FROM publications WHERE id = '${publicationId}'`
    );
    expect(publication?.doi).toBe("10.1234/first");
  });

  it("replaces the draft but leaves out a DOI another publication has", async () => {
    const { client } = await adminClient();
    const taken = await postMyst(
      client,
      "---\ntitle: Other\ndoi: 10.1234/taken\n---\nBody\n"
    );
    expect(taken.status).toBe(201);
    const { publicationId, etag } = await createFromMyst(client);

    const res = await putSource(
      client,
      publicationId,
      `---\ntitle: Replaced\ndoi: 10.1234/taken\n---\nNew body\n`,
      etag
    );

    expect(res.status).toBe(200);
    expect(warningsOf(res.body)).toContainEqual(
      expect.objectContaining({
        path: ["doi"],
        message: expect.stringContaining("another publication already has it"),
      })
    );
    expect(await getDraft(client, publicationId)).toMatchObject({
      title: "Replaced",
      body: "New body",
    });
    const [publication] = await query<{ doi: string | null }>(
      `SELECT doi FROM publications WHERE id = '${publicationId}'`
    );
    expect(publication?.doi).toBeNull();
  });

  it("refuses to replace a Google Doc draft", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createFromMyst(client);
    await query(
      `UPDATE versions SET import_document_format = 'gdoc' WHERE publication_id = '${publicationId}'`
    );

    const res = await putSource(client, publicationId, UPDATED_DOCUMENT);

    expect(res.status).toBe(409);
  });

  it("rejects invalid documents without changing the draft", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createFromMyst(client);

    const res = await putSource(
      client,
      publicationId,
      "---\nlicense: MIT\n---\nBody\n"
    );

    expect(res.status).toBe(422);
    expect((await getDraft(client, publicationId)).title).toBe(
      "Ravens and *crows*"
    );
  });

  it("accepts If-Match: * and a list containing the ETag", async () => {
    const { client } = await adminClient();
    const { publicationId, etag } = await createFromMyst(client);

    const star = await putSource(client, publicationId, UPDATED_DOCUMENT, "*");
    expect(star.status).toBe(200);

    const list = await putSource(
      client,
      publicationId,
      MYST_DOCUMENT,
      `"stale", ${star.headers.etag}`
    );
    expect(list.status).toBe(200);
    expect(list.headers.etag).toBe(etag);
  });

  it("doesn't match a weak ETag", async () => {
    const { client } = await adminClient();
    const { publicationId, etag } = await createFromMyst(client);

    const res = await putSource(
      client,
      publicationId,
      UPDATED_DOCUMENT,
      `W/${etag}`
    );

    expect(res.status).toBe(412);
  });

  it("stores the filename, keeps earlier imports and leaves the orgs alone", async () => {
    const { client } = await adminClient();
    const { orgId } = await seedOrg("Kept Org", "kept-org");
    const create = await postMyst(client, MYST_DOCUMENT, {
      filename: "paper.md",
      orgs: [{ orgId }],
    });
    const { publicationId, versionId } = create.body;

    const res = await client
      .put(
        `/api/v1/publications/id/${publicationId}/draft/content?filename=notes.md`
      )
      .set("Content-Type", "text/markdown")
      .send(UPDATED_DOCUMENT);

    expect(res.status).toBe(200);
    const draft = await getDraft(client, publicationId);
    expect(draft.importDocument.filename).toBe("notes.md");
    const imports = await query<{ filename: string }>(
      `SELECT filename FROM version_imports WHERE version_id = '${versionId}' ORDER BY id`
    );
    expect(imports.map((i) => i.filename)).toEqual(["paper.md", "notes.md"]);
    expect(draft.orgs.map((o: { orgId: string }) => o.orgId)).toEqual([orgId]);
  });

  it("returns 404 for a deleted publication", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createFromMyst(client);
    await query(
      `UPDATE publications SET state = 'DELETED' WHERE id = '${publicationId}'`
    );

    expect(
      (await putSource(client, publicationId, UPDATED_DOCUMENT)).status
    ).toBe(404);
    expect((await getSource(client, publicationId)).status).toBe(404);
  });

  it("checks the content type, login, permission and publication", async () => {
    const { client: owner } = await adminClient();
    const { publicationId } = await createFromMyst(owner);

    const json = await owner
      .put(`/api/v1/publications/id/${publicationId}/draft/content`)
      .send({ title: "JSON" });
    expect(json.status).toBe(415);

    const anonymous = new TestApiClient();
    expect(
      (await putSource(anonymous, publicationId, UPDATED_DOCUMENT)).status
    ).toBe(401);

    const other = new TestApiClient();
    const otherUser = await registerUser(other, {
      username: "other",
      email: "other@example.com",
      password: "password123",
      firstName: "Other",
      lastName: "User",
      name: "Other User",
    });
    await other.login(otherUser.username, otherUser.password);
    expect(
      (await putSource(other, publicationId, UPDATED_DOCUMENT)).status
    ).toBe(403);

    expect(
      (await putSource(owner, "01ARZ3NDEKTSV4RRFFQ69G5FAV", UPDATED_DOCUMENT))
        .status
    ).toBe(404);
  });
});

function getSource(client: TestApiClient, publicationId: string) {
  return client.get(`/api/v1/publications/id/${publicationId}/draft/content`);
}

describe("GET /api/v1/publications/id/{id}/draft/content", () => {
  it("returns the stored source with the draft's ETag", async () => {
    const { client } = await adminClient();
    const { publicationId, etag } = await createFromMyst(client);

    const res = await getSource(client, publicationId);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe(
      "text/markdown; variant=myst; charset=utf-8"
    );
    expect(res.text).toBe(MYST_DOCUMENT);
    expect(res.headers.etag).toBe(etag);
    const draft = await client.get(
      `/api/v1/publications/id/${publicationId}/draft`
    );
    expect(draft.headers.etag).toBe(etag);
  });

  it("returns the source of the latest PUT", async () => {
    const { client } = await adminClient();
    const { publicationId, etag } = await createFromMyst(client);
    const put = await putSource(client, publicationId, UPDATED_DOCUMENT, etag);
    expect(put.status).toBe(200);

    const res = await getSource(client, publicationId);

    expect(res.status).toBe(200);
    expect(res.text).toBe(UPDATED_DOCUMENT);
    expect(res.headers.etag).toBe(put.headers.etag);
  });

  it("serves a source whose subtitle was truncated", async () => {
    const { client } = await adminClient();
    const source = `---\ntitle: T\nsubtitle: ${"s".repeat(310)}\n---\nBody\n`;
    const create = await postMyst(client, source);
    expect(create.status).toBe(201);

    const res = await getSource(client, create.body.publicationId);

    expect(res.status).toBe(200);
    expect(res.text).toBe(source);
  });

  it("returns 409 once the draft was edited without MyST", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createFromMyst(client);
    await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({ abstract: "Edited in the web editor." });

    const res = await getSource(client, publicationId);

    expect(res.status).toBe(409);
    expect(res.body.errors.draft.message).toContain(
      `/api/v1/publications/id/${publicationId}/draft`
    );
  });

  it("returns 409 once the tags were edited without MyST", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createFromMyst(client);
    const patch = await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({ tags: ["corvids"] });
    expect(patch.status).toBe(200);

    expect((await getSource(client, publicationId)).status).toBe(409);
  });

  it("serves the source copied into a new draft after publishing", async () => {
    const { client } = await adminClient();
    const { publicationId, etag } = await createFromMyst(client);
    await addSelfToByline(client, publicationId);
    await client
      .post(`/api/v1/publications/id/${publicationId}/versions`)
      .send({});
    expect((await getSource(client, publicationId)).status).toBe(404);

    const draft = await client.post(
      `/api/v1/publications/id/${publicationId}/draft`
    );
    expect(draft.status).toBe(201);
    const res = await getSource(client, publicationId);

    expect(res.status).toBe(200);
    expect(res.text).toBe(MYST_DOCUMENT);
    expect(res.headers.etag).toBe(etag);
  });

  it("serves the source copied into a draft opened through v0", async () => {
    const { client } = await adminClient();
    const { publicationId, slug } = await createFromMyst(client);
    await addSelfToByline(client, publicationId);
    await client
      .post(`/api/v1/publications/id/${publicationId}/versions`)
      .send({});

    const draft = await client.post(`/api/publications/${slug}/draft`);
    expect(draft.status).toBe(201);
    const res = await getSource(client, publicationId);

    expect(res.status).toBe(200);
    expect(res.text).toBe(MYST_DOCUMENT);
    expect((await getDraft(client, publicationId)).content).toMatchObject({
      format: "myst",
    });
  });

  it("keeps MyST as the format of a draft a v0 edit opens", async () => {
    const { client } = await adminClient();
    const { publicationId, slug } = await createFromMyst(client);
    await addSelfToByline(client, publicationId);
    await client
      .post(`/api/v1/publications/id/${publicationId}/versions`)
      .send({});

    const edit = await client
      .put(`/api/publications/${slug}`)
      .send({ abstract: "Edited in the web editor." });
    expect(edit.status).toBe(200);

    const draft = await getDraft(client, publicationId);
    expect(draft.abstract).toBe("Edited in the web editor.");
    expect(draft.content).toMatchObject({ format: "myst" });
  });

  it("returns 404 for a draft without MyST source", async () => {
    const { client } = await adminClient();
    const create = await client
      .post("/api/v1/publications")
      .send({ title: "From the web editor", body: "Body." });

    expect((await getSource(client, create.body.publicationId)).status).toBe(
      404
    );
  });

  it("checks login and permission", async () => {
    const { client: owner } = await adminClient();
    const { publicationId } = await createFromMyst(owner);

    expect((await getSource(new TestApiClient(), publicationId)).status).toBe(
      401
    );

    const other = new TestApiClient();
    const otherUser = await registerUser(other, {
      username: "reader",
      email: "reader@example.com",
      password: "password123",
      firstName: "Reader",
      lastName: "User",
      name: "Reader User",
    });
    await other.login(otherUser.username, otherUser.password);
    expect((await getSource(other, publicationId)).status).toBe(403);
  });
});

function getDraftAsMyst(client: TestApiClient, publicationId: string) {
  return client
    .get(`/api/v1/publications/id/${publicationId}/draft`)
    .set("Accept", "text/markdown; variant=myst");
}

describe("GET /api/v1/publications/id/{id}/draft as MyST", () => {
  it("builds MyST from a web-editor draft's fields", async () => {
    const { client } = await adminClient();
    const create = await client.post("/api/v1/publications").send({
      title: "From the web editor",
      subtitle: "A subtitle",
      abstract: "An abstract.",
      body: "## Body\n\nText.",
      license: "CC0",
    });
    expect(create.status).toBe(201);
    const { publicationId } = create.body;
    await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({ tags: ["corvids"] });

    const res = await getDraftAsMyst(client, publicationId);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(
      /^text\/markdown; variant=myst/
    );
    expect(res.headers.vary).toMatch(/\bAccept\b/);
    expect(res.text).toBe(
      [
        "---",
        "title: From the web editor",
        "subtitle: A subtitle",
        "abstract: An abstract.",
        "license: CC0-1.0",
        "keywords:",
        "  - corvids",
        "---",
        "",
        "## Body",
        "",
        "Text.",
        "",
      ].join("\n")
    );
    const json = await client.get(
      `/api/v1/publications/id/${publicationId}/draft`
    );
    expect(res.headers.etag).toBe(json.headers.etag);
  });

  it("can be pushed back unchanged with its ETag", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createFromMyst(client);
    await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({ abstract: "Edited in the web editor." });
    expect((await getSource(client, publicationId)).status).toBe(409);
    const before = await getDraft(client, publicationId);

    const rebuilt = await getDraftAsMyst(client, publicationId);
    expect(rebuilt.status).toBe(200);
    const put = await putSource(
      client,
      publicationId,
      rebuilt.text,
      rebuilt.headers.etag
    );

    expect(put.status).toBe(200);
    expect(put.headers.etag).toBe(rebuilt.headers.etag);
    const after = await getDraft(client, publicationId);
    for (const field of [
      "title",
      "subtitle",
      "abstract",
      "body",
      "license",
      "tags",
    ]) {
      expect(after[field], field).toEqual(before[field]);
    }
    const source = await getSource(client, publicationId);
    expect(source.status).toBe(200);
    expect(source.text).toBe(rebuilt.text);
  });

  it("negotiates on Accept, keeping JSON as the default", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createFromMyst(client);
    const draftPath = `/api/v1/publications/id/${publicationId}/draft`;

    const noAccept = await client.get(draftPath);
    expect(noAccept.status).toBe(200);
    expect(noAccept.body.publication.id).toBe(publicationId);
    expect(noAccept.headers.vary).toMatch(/\bAccept\b/);

    const html = await client.get(draftPath).set("Accept", "text/html");
    expect(html.status).toBe(200);
    expect(html.headers["content-type"]).toMatch(/^application\/json/);

    const plain = await client.get(draftPath).set("Accept", "text/markdown");
    expect(plain.status).toBe(406);

    const preferred = await client
      .get(draftPath)
      .set("Accept", "application/json;q=0.5, text/markdown; variant=myst");
    expect(preferred.headers["content-type"]).toMatch(/^text\/markdown/);

    const quoted = await client
      .get(draftPath)
      .set("Accept", 'text/markdown; variant="myst"');
    expect(quoted.headers["content-type"]).toMatch(/^text\/markdown/);
  });

  it("trims the abstract when pushed back", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createFromMyst(client);
    await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({ abstract: "  Padded abstract.\n\n" });

    const rebuilt = await getDraftAsMyst(client, publicationId);
    const put = await putSource(
      client,
      publicationId,
      rebuilt.text,
      rebuilt.headers.etag
    );

    expect(put.status).toBe(200);
    expect((await getDraft(client, publicationId)).abstract).toBe(
      "Padded abstract."
    );
  });

  it("keeps an untitled draft untitled when its body starts with a lower heading", async () => {
    const { client } = await adminClient();
    const create = await client
      .post("/api/v1/publications")
      .send({ slug: "untitled-draft", body: "## Methods\n\nText." });
    expect(create.status).toBe(201);
    const { publicationId } = create.body;

    const rebuilt = await getDraftAsMyst(client, publicationId);
    const put = await putSource(
      client,
      publicationId,
      rebuilt.text,
      rebuilt.headers.etag
    );

    expect(put.status).toBe(200);
    expect(put.headers.etag).toBe(rebuilt.headers.etag);
    expect(put.body.validationErrors).toContainEqual(
      expect.objectContaining({ path: ["title"] })
    );
    expect(await getDraft(client, publicationId)).toMatchObject({
      title: null,
      body: "## Methods\n\nText.",
    });
  });

  it("moves a leading H1 of an untitled draft into the title when pushed back", async () => {
    const { client } = await adminClient();
    const create = await client
      .post("/api/v1/publications")
      .send({ slug: "untitled-with-h1", body: "# Heading\n\nText." });
    const { publicationId } = create.body;

    const rebuilt = await getDraftAsMyst(client, publicationId);
    const put = await putSource(
      client,
      publicationId,
      rebuilt.text,
      rebuilt.headers.etag
    );

    expect(put.status).toBe(200);
    expect(await getDraft(client, publicationId)).toMatchObject({
      title: "Heading",
      body: "Text.",
    });
  });

  it("round-trips a license that new publications can't choose", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createFromMyst(client);
    const patch = await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({ license: "CC BY-SA" });
    expect(patch.status).toBe(200);

    const rebuilt = await getDraftAsMyst(client, publicationId);
    expect(rebuilt.text).toContain("license: CC-BY-SA-4.0\n");
    const put = await putSource(
      client,
      publicationId,
      rebuilt.text,
      rebuilt.headers.etag
    );
    expect(put.status).toBe(200);
    expect((await getDraft(client, publicationId)).license).toBe("CC BY-SA");

    const change = await putSource(
      client,
      publicationId,
      rebuilt.text.replace("CC-BY-SA-4.0", "CC-BY-NC-4.0")
    );
    expect(change.status).toBe(422);
    expect(change.body.errors[0]).toMatchObject({
      path: ["license"],
      message: expect.stringContaining("CC-BY-NC-4.0"),
    });
    expect((await getDraft(client, publicationId)).license).toBe("CC BY-SA");
  });

  it("rejects creating a publication with a license new publications can't choose", async () => {
    const { client } = await adminClient();

    const res = await postMyst(
      client,
      "---\ntitle: T\nlicense: CC-BY-SA-4.0\n---\nBody\n"
    );

    expect(res.status).toBe(422);
    expect(res.body.errors[0].path).toEqual(["license"]);
  });

  it("refuses MyST for a Google Doc draft", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createFromMyst(client);
    await query(
      `UPDATE versions SET import_document_format = 'gdoc' WHERE publication_id = '${publicationId}'`
    );

    expect((await getDraftAsMyst(client, publicationId)).status).toBe(409);
  });
});

describe("PATCH /api/v1/publications/id/{id}/draft with orgs", () => {
  it("accepts orgs by slug and rejects unknown ones on their own", async () => {
    const { client } = await adminClient();
    const { orgId } = await seedOrg("Patch Org", "patch-org");
    const { publicationId } = await createFromMyst(client);
    const path = `/api/v1/publications/id/${publicationId}/draft`;

    const bySlug = await client
      .patch(path)
      .send({ orgs: [{ orgSlug: "patch-org" }] });
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.applied).toContain("orgs");
    expect(
      bySlug.body.publication.orgs.map((o: { orgId: string }) => o.orgId)
    ).toEqual([orgId]);

    const unknown = await client
      .patch(path)
      .send({ abstract: "Still applied.", orgs: [{ orgSlug: "no-such-org" }] });
    expect(unknown.status).toBe(200);
    expect(unknown.body.applied).toContain("abstract");
    expect(unknown.body.applied).not.toContain("orgs");
    expect(unknown.body.validationErrors).toContainEqual(
      expect.objectContaining({ path: ["orgs", 0], message: "Org not found" })
    );
    expect(
      unknown.body.publication.orgs.map((o: { orgId: string }) => o.orgId)
    ).toEqual([orgId]);
  });
});

describe("content and importDocument in the publication response", () => {
  it("give MyST versions the content format and drafts the document", async () => {
    const { client } = await adminClient();
    const create = await postMyst(client, MYST_DOCUMENT, {
      filename: "paper.md",
    });
    const { publicationId } = create.body;
    const importDocument = {
      id: expect.any(String),
      format: "mystmd",
      url: null,
      filename: "paper.md",
      syncDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      diagnostics: null,
      editedFields: [],
    };

    const draft = await getDraft(client, publicationId);
    expect(draft.content).toEqual({ format: "myst" });
    expect(draft.importDocument).toEqual(importDocument);

    const patch = await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({ abstract: "Edited in the web editor." });
    expect(patch.status).toBe(200);
    expect(patch.body.publication.content).toEqual({ format: "myst" });
    expect(patch.body.publication.importDocument.editedFields).toEqual([
      "abstract",
    ]);

    await addSelfToByline(client, publicationId);
    const publish = await client
      .post(`/api/v1/publications/id/${publicationId}/versions`)
      .send({});
    expect(publish.status).toBe(201);
    for (const reader of [client, new TestApiClient()]) {
      const published = await reader.get(
        `/api/v1/publications/id/${publicationId}`
      );
      expect(published.status).toBe(200);
      expect(published.body.publication.content).toEqual({ format: "myst" });
      expect(published.body.publication.importDocument.editedFields).toBeNull();
    }
  });

  it("record each push as the draft's import document", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createFromMyst(client);

    const res = await client
      .put(
        `/api/v1/publications/id/${publicationId}/draft/content?filename=notes.md`
      )
      .set("Content-Type", "text/markdown")
      .send(UPDATED_DOCUMENT);
    expect(res.status).toBe(200);

    expect(
      (await getDraft(client, publicationId)).importDocument
    ).toMatchObject({ format: "mystmd", url: null, filename: "notes.md" });
  });

  it("give a Google Doc draft its format and document", async () => {
    const { client } = await adminClient();
    const create = await client.post("/api/v1/publications").send({
      title: "From a Google Doc",
      body: "Body.",
      importDocument: {
        body: "<html></html>",
        url: "https://docs.google.com/document/d/abc/edit",
        format: "gdoc",
        filename: "doc.html",
      },
    });
    expect(create.status).toBe(201);

    const draft = await getDraft(client, create.body.publicationId);
    expect(draft.content).toEqual({ format: "gdoc" });
    expect(draft.importDocument).toMatchObject({
      format: "gdoc",
      url: "https://docs.google.com/document/d/abc/edit",
      filename: "doc.html",
    });
  });

  it("are absent for drafts that weren't imported", async () => {
    const { client } = await adminClient();
    const create = await client
      .post("/api/v1/publications")
      .send({ title: "From the web editor", body: "Body." });

    const draft = await getDraft(client, create.body.publicationId);
    expect(draft.content).toBeUndefined();
    expect(draft.importDocument).toBeUndefined();
  });
});

const MDAST = "application/vnd.thestacks.mdast+json";

const CITING_DOCUMENT = [
  "---",
  "title: Citing ravens",
  "abstract: Known since [](https://doi.org/10.1234/Ravens).",
  "---",
  "",
  "## Methods",
  "",
  "Watched {cite}`unknown-key`.",
  "",
].join("\n");

async function createCiting(client: TestApiClient) {
  const res = await postMyst(client, CITING_DOCUMENT);
  expect(res.status).toBe(201);
  return {
    publicationId: res.body.publicationId as string,
    slug: res.body.slug as string,
  };
}

function getDraftMdast(
  client: TestApiClient,
  publicationId: string,
  accept = MDAST
) {
  return client
    .get(`/api/v1/publications/id/${publicationId}/draft`)
    .set("Accept", accept);
}

describe("the MyST AST of a draft", () => {
  it("returns the AST with messages, privately", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createCiting(client);

    const res = await getDraftMdast(client, publicationId);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe(`${MDAST}; schema=1; version=3`);
    expect(res.headers.vary).toContain("Accept");
    expect(res.headers["cache-control"]).toBe("private, no-cache");
    expect(res.headers.etag).toMatch(/^"[0-9a-f]{64}"$/);
    const payload = JSON.parse(res.text);
    expect(payload).toMatchObject({
      schema: 1,
      version: 3,
      tree: {
        type: "root",
        children: [
          { type: "block", data: { part: "abstract" } },
          { type: "block", data: { part: "body" } },
        ],
      },
      citations: { order: ["https://doi.org/10.1234/ravens"] },
    });
    expect(payload.messages).toEqual([
      {
        severity: "warning",
        message: 'Could not link citation with label "unknown-key".',
        part: "body",
        line: 3,
      },
    ]);
  });

  it("answers a matching If-None-Match with 304", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createCiting(client);
    const first = await getDraftMdast(client, publicationId);

    const res = await client
      .get(`/api/v1/publications/id/${publicationId}/draft`)
      .set("Accept", MDAST)
      .set("If-None-Match", first.headers.etag as string);

    expect(res.status).toBe(304);
    expect(res.headers.etag).toBe(first.headers.etag);
  });

  it("reflects an edit made in the web editor", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createCiting(client);
    const before = await getDraftMdast(client, publicationId);
    await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({ body: "## Results\n\nEdited." });

    const res = await getDraftMdast(client, publicationId);

    expect(res.status).toBe(200);
    expect(res.headers.etag).not.toBe(before.headers.etag);
    expect(res.text).toContain("Results");
  });

  it("migrates down to an older version and caps a newer one", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createCiting(client);
    const latest = await getDraftMdast(client, publicationId);

    const older = await getDraftMdast(
      client,
      publicationId,
      `${MDAST}; version=2`
    );
    const newer = await getDraftMdast(
      client,
      publicationId,
      `${MDAST}; version=99`
    );

    expect(older.status).toBe(200);
    expect(older.headers["content-type"]).toBe(`${MDAST}; schema=1; version=2`);
    expect(JSON.parse(older.text).version).toBe(2);
    expect(older.headers.etag).not.toBe(latest.headers.etag);
    expect(newer.headers["content-type"]).toBe(`${MDAST}; schema=1; version=3`);
    expect(newer.headers.etag).toBe(latest.headers.etag);
  });

  it("refuses an unsupported schema and a draft that is not MyST", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createCiting(client);
    const web = await client
      .post("/api/v1/publications")
      .send({ title: "From the web editor", body: "Body." });

    expect(
      (await getDraftMdast(client, publicationId, `${MDAST}; schema=99`)).status
    ).toBe(406);
    expect((await getDraftMdast(client, web.body.publicationId)).status).toBe(
      406
    );
  });

  it("checks login and permission", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createCiting(client);
    const other = new TestApiClient();
    const otherUser = await registerUser(other, {
      username: "mdast-reader",
      email: "mdast-reader@example.com",
      password: "password123",
      firstName: "Reader",
      lastName: "User",
      name: "Reader User",
    });
    await other.login(otherUser.username, otherUser.password);

    expect(
      (await getDraftMdast(new TestApiClient(), publicationId)).status
    ).toBe(401);
    expect((await getDraftMdast(other, publicationId)).status).toBe(403);
  });

  it("keeps the other representations as they were", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createCiting(client);

    const json = await getDraftMdast(client, publicationId, "application/json");
    const preferred = await getDraftMdast(
      client,
      publicationId,
      `application/json, ${MDAST};q=0.5`
    );
    const myst = await getDraftMdast(
      client,
      publicationId,
      "text/markdown; variant=myst"
    );

    expect(json.body.publication.title).toBe("Citing ravens");
    expect(preferred.body.publication.title).toBe("Citing ravens");
    expect(myst.headers["content-type"]).toMatch(
      /^text\/markdown; variant=myst/
    );
  });
});

describe.each([
  ["slug", (pub: { slug: string }) => `/api/v1/publications/p/${pub.slug}`],
  [
    "id",
    (pub: { publicationId: string }) =>
      `/api/v1/publications/id/${pub.publicationId}`,
  ],
] as const)("the MyST AST of a published version by %s", (_, path) => {
  async function published(client: TestApiClient) {
    const { publicationId, slug } = await createCiting(client);
    await addSelfToByline(client, publicationId);
    const publish = await client
      .post(`/api/v1/publications/id/${publicationId}/versions`)
      .send({});
    expect(publish.status).toBe(201);
    return { publicationId, slug };
  }

  it("returns the AST without messages, publicly cacheable, to anyone", async () => {
    const { client } = await adminClient();
    const pub = await published(client);

    const res = await new TestApiClient()
      .get(`${path(pub)}/versions/v1`)
      .set("Accept", MDAST);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe(`${MDAST}; schema=1; version=3`);
    expect(res.headers["cache-control"]).toBe("public, max-age=300");
    expect(res.headers.vary).toContain("Accept");
    const payload = JSON.parse(res.text);
    expect(payload.citations.order).toEqual(["https://doi.org/10.1234/ravens"]);
    expect(payload).not.toHaveProperty("messages");
  });

  it("lets a suffix win over Accept and keeps JSON as the default", async () => {
    const { client } = await adminClient();
    const pub = await published(client);

    const md = await client
      .get(`${path(pub)}/versions/v1.md`)
      .set("Accept", MDAST);
    const json = await client.get(`${path(pub)}/versions/v1`);

    expect(md.headers["content-type"]).toMatch(/^text\/markdown/);
    expect(json.body.publication.title).toBe("Citing ravens");
  });

  it("refuses the AST of a version that is not MyST", async () => {
    const { client } = await adminClient();
    const web = await client
      .post("/api/v1/publications")
      .send({ title: "From the web editor", body: "Body." });
    await client
      .post(`/api/v1/publications/id/${web.body.publicationId}/versions`)
      .send({});

    const res = await client
      .get(`${path(web.body)}/versions/v1`)
      .set("Accept", MDAST);

    expect(res.status).toBe(406);
  });
});

describe("references of a MyST version", () => {
  // `{cite}` labels are only visible to the AST, not to the link regex used
  // for other publications.
  const DOCUMENT = [
    "---",
    "title: Cited ravens",
    "abstract: Known since [](https://doi.org/10.1234/Ravens).",
    "---",
    "",
    "See {cite}`10.1234/Crows` and [](https://example.org/report).",
    "",
  ].join("\n");
  const EXPECTED = [
    "https://doi.org/10.1234/ravens",
    "https://doi.org/10.1234/crows",
    "https://example.org/report",
  ];

  function storedUrls(publicationId: string) {
    return `SELECT r.url FROM version_references vr JOIN \`references\` r ON r.id_int = vr.reference_id_int JOIN versions v ON v.id_int = vr.version_id_int JOIN publications p ON p.id_int = v.publication_id_int WHERE p.id = '${publicationId}'`;
  }

  it("stores the AST's citations when a source is pushed", async () => {
    const { client } = await adminClient();
    const { publicationId, etag } = await createFromMyst(client);

    const put = await putSource(client, publicationId, DOCUMENT, etag);
    expect(put.status).toBe(200);

    const refs = (await getDraft(client, publicationId)).references as Array<{
      url: string;
    }>;
    expect(refs.map((r) => r.url).sort()).toEqual([...EXPECTED].sort());
  });

  it("stores the AST's citations when a publication is created", async () => {
    const { client } = await adminClient();
    const create = await postMyst(client, DOCUMENT);
    expect(create.status).toBe(201);

    // References are stored after the response, one row at a time.
    const sql = storedUrls(create.body.publicationId);
    await waitForRows(
      `SELECT COUNT(*) AS n FROM (${sql}) linked HAVING n >= ${EXPECTED.length}`,
      { timeoutMs: 5000 }
    );
    const rows = await query<{ url: string }>(sql);
    expect(rows.map((r) => r.url).sort()).toEqual([...EXPECTED].sort());
  });
});

describe("warnings from building the MyST AST", () => {
  const WARNING = {
    code: "custom",
    path: ["body"],
    message: 'Line 3: Could not link citation with label "unknown-key".',
  };

  it("come back on create", async () => {
    const { client } = await adminClient();

    const res = await postMyst(client, CITING_DOCUMENT);

    expect(res.status).toBe(201);
    expect(warningsOf(res.body)).toContainEqual(WARNING);
  });

  it("come back on push", async () => {
    const { client } = await adminClient();
    const { publicationId, etag } = await createFromMyst(client);

    const res = await putSource(client, publicationId, CITING_DOCUMENT, etag);

    expect(res.status).toBe(200);
    expect(warningsOf(res.body)).toContainEqual(WARNING);
  });
});

describe("stats of a MyST version", () => {
  it("are counted from the AST", async () => {
    const { client } = await adminClient();
    const create = await postMyst(
      client,
      [
        "---",
        "title: Counted ravens",
        "abstract: Short.",
        "---",
        "",
        "## Methods",
        "",
        "```{figure} https://example.org/a.png",
        "A.",
        "```",
        "",
      ].join("\n")
    );
    expect(create.status).toBe(201);

    const draft = await getDraft(client, create.body.publicationId);

    expect(draft.stats).toMatchObject({ sections: 2, images: 1, tables: 0 });
  });
});

describe("MyST authors as contributors", () => {
  const ORCID_USER_ORCID = "0000-0002-1825-0097";
  const UNKNOWN_ORCID = "0000-0001-5109-3700";

  async function seedAuthors() {
    const orcidUser = await registerUserWithId(makeUser("orcidauthor"));
    await execute(
      `UPDATE users SET orcid = '${ORCID_USER_ORCID}' WHERE id = '${orcidUser.userIds.id}'`
    );
    const emailUser = await registerUserWithId(makeUser("emailauthor"));
    return { orcidId: orcidUser.userIds.id, emailId: emailUser.userIds.id };
  }

  function withAuthors(authors: string[]) {
    return [
      "---",
      "title: Corvids",
      "authors:",
      ...authors,
      "---",
      "",
      "Text.",
      "",
    ].join("\n");
  }

  interface Contributor {
    userId: string;
    roles: string[];
    inByline: boolean;
    priority: number | null;
  }

  /** In byline order, which the response leaves to clients. */
  function byPriority(contributors: Contributor[]): Contributor[] {
    return [...contributors].sort(
      (a, b) => (a.priority ?? 0) - (b.priority ?? 0)
    );
  }

  async function countUsers(): Promise<number> {
    const [row] = await query<{ n: number }>("SELECT COUNT(*) AS n FROM users");
    return Number(row!.n);
  }

  it("finds authors by ORCID iD, then email, and warns about the rest", async () => {
    const { client, userUlid } = await adminClient();
    const { orcidId, emailId } = await seedAuthors();
    const usersBefore = await countUsers();

    const res = await postMyst(
      client,
      withAuthors([
        "  - name: Orcid Author",
        `    orcid: https://orcid.org/${ORCID_USER_ORCID}`,
        "    email: emailauthor@example.com",
        "    roles: [Conceptualization, writing – original draft]",
        "  - name: Email Author",
        `    orcid: ${UNKNOWN_ORCID}`,
        "    email: emailauthor@example.com",
        "    roles: [Writing – review & editing, Funding acquisition]",
        "  - name: Unknown Author",
        `    orcid: ${UNKNOWN_ORCID}`,
        "    roles: [Software]",
        "  - name: Nobody",
        "    email: nobody@example.com",
        "  - name: Anonymous",
      ])
    );

    expect(res.status).toBe(201);
    const draft = await getDraft(client, res.body.publicationId);
    expect(
      byPriority(draft.contributors).map((c) => ({
        userId: c.userId,
        roles: [...c.roles].sort(),
        inByline: c.inByline,
      }))
    ).toEqual([
      {
        userId: orcidId,
        roles: ["Conceptualization", "Writing"],
        inByline: true,
      },
      { userId: emailId, roles: ["Editing"], inByline: true },
    ]);
    expect(draft.contributors.map((c: Contributor) => c.userId)).not.toContain(
      userUlid
    );
    expect(warningsOf(res.body)).toEqual([
      {
        code: "custom",
        path: ["authors", 1, "roles", 1],
        message:
          '"Funding acquisition" isn\'t a contributor role on The Stacks; left out',
      },
      {
        code: "custom",
        path: ["authors", 2],
        message: `No user has the ORCID iD ${UNKNOWN_ORCID} of author "Unknown Author"; skipped`,
      },
      {
        code: "custom",
        path: ["authors", 3],
        message:
          'No user has the email nobody@example.com of author "Nobody"; skipped',
      },
      {
        code: "custom",
        path: ["authors", 4],
        message:
          'Author "Anonymous" has no ORCID iD or email to find them by; skipped',
      },
    ]);
    expect(await countUsers()).toBe(usersBefore);
  });

  it("leaves the byline empty when no author is found, rather than adding the caller", async () => {
    const { client } = await adminClient();

    const res = await postMyst(
      client,
      withAuthors(["  - name: Unknown Author", `    orcid: ${UNKNOWN_ORCID}`])
    );

    expect(res.status).toBe(201);
    expect(res.body.validationErrors).toEqual([
      expect.objectContaining({ path: ["authors", 0], severity: "warning" }),
      BYLINE_ERROR,
    ]);
    expect(
      (await getDraft(client, res.body.publicationId)).contributors
    ).toEqual([]);
  });

  it("only adds new authors on push, keeping existing contributors as they are", async () => {
    const { client } = await adminClient();
    const { orcidId, emailId } = await seedAuthors();
    const { publicationId } = await createFromMyst(client);

    const first = await putSource(
      client,
      publicationId,
      withAuthors([`  - orcid: ${ORCID_USER_ORCID}`, "    roles: [Software]"])
    );
    expect(first.status).toBe(200);
    const second = await putSource(
      client,
      publicationId,
      withAuthors([
        `  - orcid: ${ORCID_USER_ORCID}`,
        "    roles: [Supervision]",
        "  - email: emailauthor@example.com",
        `  - orcid: ${UNKNOWN_ORCID}`,
      ])
    );

    expect(second.status).toBe(200);
    expect(warningsOf(second.body)).toEqual([
      expect.objectContaining({ path: ["authors", 2] }),
    ]);
    expect(
      byPriority((await getDraft(client, publicationId)).contributors).map(
        (c) => ({ userId: c.userId, roles: c.roles })
      )
    ).toEqual([
      { userId: orcidId, roles: ["Software"] },
      { userId: emailId, roles: ["Writing"] },
    ]);
  });
});

describe("a draft read as a publication", () => {
  it("marks a never-published publication as a draft, without a canonical URL", async () => {
    const { client } = await adminClient();
    const { publicationId } = await createFromMyst(client);
    const path = `/api/v1/publications/id/${publicationId}`;

    const json = await client.get(path);
    expect(json.status).toBe(200);
    expect(json.body.publication.versionState).toBe("DRAFT");

    const markdown = await client.get(path).set("Accept", "text/markdown");
    expect(markdown.status).toBe(200);
    expect(markdown.text).toMatch(/^version: 1\nstate: draft\n---$/m);
    expect(markdown.text).not.toContain("canonical_url:");
    expect(markdown.headers["cache-control"]).toBe("private, no-cache");

    await addSelfToByline(client, publicationId);
    const publish = await client.post(`${path}/versions`).send({});
    expect(publish.status, publish.text).toBe(201);

    const published = await client.get(path).set("Accept", "text/markdown");
    expect(published.text).not.toContain("state: draft");
    expect(published.text).toMatch(/^canonical_url: ".+"$/m);
    expect(published.headers["cache-control"]).toBe("public, max-age=3600");
    expect((await client.get(path)).body.publication.versionState).toBe(
      "PUBLISHED"
    );
  });

  it("marks an open draft read by its version number", async () => {
    const { client } = await adminClient();
    const { publicationId, etag } = await createFromMyst(client);
    const path = `/api/v1/publications/id/${publicationId}`;
    await addSelfToByline(client, publicationId);
    expect((await client.post(`${path}/versions`).send({})).status).toBe(201);
    expect(
      (await putSource(client, publicationId, MYST_DOCUMENT, etag)).status
    ).toBe(201);

    const draft = await client
      .get(`${path}/versions/v2`)
      .set("Accept", "text/markdown");
    expect(draft.status).toBe(200);
    expect(draft.text).toMatch(/^state: draft$/m);
    expect(draft.text).not.toContain("canonical_url:");
    expect(draft.headers["cache-control"]).toBe("private, no-cache");

    const published = await client.get(`${path}/versions/v1`);
    expect(published.body.publication.versionState).toBe("PUBLISHED");
  });
});

const NUMBERED_DOCUMENT = [
  "---",
  "title: Numbered ravens",
  "numbering:",
  "  headings: true",
  "math:",
  "  '\\R': '\\mathbb{R}'",
  "---",
  "",
  "(sec-methods)=",
  "## Methods",
  "",
  "See §[%s](#sec-methods), for $x \\in \\R$.",
  "",
].join("\n");

/** The text of the draft's only cross-reference, and the payload's frontmatter. */
async function numberedDraftMdast(
  client: TestApiClient,
  publicationId: string
) {
  const res = await getDraftMdast(client, publicationId);
  expect(res.status).toBe(200);
  const payload = JSON.parse(res.text);
  const texts: string[] = [];
  const visit = (
    node: { type: string; value?: string; children?: unknown[] },
    inRef: boolean
  ) => {
    const isRef = inRef || node.type === "crossReference";
    if (isRef && node.type === "text") texts.push(node.value ?? "");
    for (const child of node.children ?? []) visit(child as typeof node, isRef);
  };
  visit(payload.tree, false);
  return { reference: texts.join(""), frontmatter: payload.frontmatter };
}

describe("numbering and math frontmatter of a MyST version", () => {
  it("numbers heading references and sends the math macros", async () => {
    const { client } = await adminClient();
    const create = await postMyst(client, NUMBERED_DOCUMENT);
    expect(create.status).toBe(201);
    expect(
      warningsOf(create.body).filter((w) => /not numbered/.test(w.message))
    ).toEqual([]);

    expect(await numberedDraftMdast(client, create.body.publicationId)).toEqual(
      {
        reference: "1",
        frontmatter: { math: { "\\R": { macro: "\\mathbb{R}" } } },
      }
    );
  });

  it("gives ?? and a warning without numbering", async () => {
    const { client } = await adminClient();
    const create = await postMyst(
      client,
      NUMBERED_DOCUMENT.replace("numbering:\n  headings: true\n", "")
    );
    expect(create.status).toBe(201);
    expect(
      warningsOf(create.body).some((w) => /not numbered/.test(w.message))
    ).toBe(true);

    expect(
      (await numberedDraftMdast(client, create.body.publicationId)).reference
    ).toBe("??");
  });

  it("keeps the numbering when checking the draft after a bibliography PUT", async () => {
    const { client } = await adminClient();
    const create = await postMyst(client, NUMBERED_DOCUMENT);
    expect(create.status).toBe(201);

    const put = await client
      .put(
        `/api/v1/publications/id/${create.body.publicationId}/draft/bibliography`
      )
      .send({ files: [] });

    expect(put.status, put.text).toBe(200);
    expect(
      warningsOf(put.body).filter((w) => /not numbered/.test(w.message))
    ).toEqual([]);
  });

  it("changes the ETag when a push changes only the numbering", async () => {
    const { client } = await adminClient();
    const create = await postMyst(client, NUMBERED_DOCUMENT);
    const { publicationId } = create.body;

    const put = await putSource(
      client,
      publicationId,
      NUMBERED_DOCUMENT.replace("  headings: true\n", "  headings: false\n"),
      create.headers.etag
    );

    expect(put.status).toBe(200);
    expect(put.headers.etag).not.toBe(create.headers.etag);
    expect((await numberedDraftMdast(client, publicationId)).reference).toBe(
      "??"
    );
  });

  it("writes it into the MyST built from the draft, which pushes back unchanged", async () => {
    const { client } = await adminClient();
    const create = await postMyst(client, NUMBERED_DOCUMENT);
    const { publicationId } = create.body;

    const rebuilt = await getDraftAsMyst(client, publicationId);
    expect(rebuilt.text).toContain(
      "numbering:\n  heading_1:\n    enabled: true\n"
    );
    expect(rebuilt.headers.etag).toBe(create.headers.etag);
    const put = await putSource(
      client,
      publicationId,
      rebuilt.text,
      rebuilt.headers.etag
    );

    expect(put.status).toBe(200);
    expect(put.headers.etag).toBe(create.headers.etag);
  });

  it.each(["v1", "v0"])(
    "copies it into a new draft opened through %s",
    async (api) => {
      const { client } = await adminClient();
      const create = await postMyst(client, NUMBERED_DOCUMENT);
      const { publicationId, slug } = create.body;
      await addSelfToByline(client, publicationId);
      const publish = await client
        .post(`/api/v1/publications/id/${publicationId}/versions`)
        .send({});
      expect(publish.status, publish.text).toBe(201);

      const draft =
        api === "v1"
          ? await client.post(`/api/v1/publications/id/${publicationId}/draft`)
          : await client.post(`/api/publications/${slug}/draft`);
      expect(draft.status, draft.text).toBeLessThan(300);

      expect(await numberedDraftMdast(client, publicationId)).toMatchObject({
        reference: "1",
        frontmatter: { math: { "\\R": { macro: "\\mathbb{R}" } } },
      });
    }
  );
});
