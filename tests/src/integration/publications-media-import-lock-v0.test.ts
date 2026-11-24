import { escape } from "mysql2";
import { describe, expect, it } from "vitest";
import {
  execute,
  query,
  registerUserWithId,
  seedSiteAdmin,
  type TestApiClient,
} from "./helpers.js";

const SLUG = "media-import-lock";
const IN_PROGRESS =
  "The body can't be edited until its imported media has finished uploading";
const IMPORT_ID = "01IMPORT".padEnd(26, "0");
const BATCH_ID = "01BATCH".padEnd(26, "0");

async function registerAuthor() {
  const { client, user, userId } = await registerUserWithId();
  await seedSiteAdmin(userId);
  await client.login(user.username, user.password);
  return client;
}

async function createDraft(client: TestApiClient) {
  const resp = await client.post("/api/publications").send({
    slug: SLUG,
    title: "Import Lock",
    abstract: "Abstract text.",
    body: "Original body.",
  });
  expect(resp.status, resp.text).toBe(201);
  const [ids] = await query<{ publicationId: string; versionId: string }>(
    `SELECT p.id AS publicationId, v.id AS versionId FROM publications p JOIN versions v ON v.publication_id_int = p.id_int WHERE p.slug = ${escape(SLUG)}`
  );
  return ids!;
}

/** v0 drafts can't be imported, so seed the batch an import would leave. */
async function seedMediaImport(
  ids: { publicationId: string; versionId: string },
  status: "processing" | "completed"
) {
  await execute(
    `INSERT INTO version_imports (id, version_id, format, body) VALUES (${escape(IMPORT_ID)}, ${escape(ids.versionId)}, 'gdoc', '')`
  );
  await execute(
    `INSERT INTO media_import_batches (id, publication_id, version_id, import_id, status, total) VALUES (${escape(BATCH_ID)}, ${escape(ids.publicationId)}, ${escape(ids.versionId)}, ${escape(IMPORT_ID)}, ${escape(status)}, 1)`
  );
}

async function storedBody() {
  const [row] = await query<{ body: string }>(
    `SELECT v.body FROM versions v JOIN publications p ON p.id_int = v.publication_id_int WHERE p.slug = ${escape(SLUG)}`
  );
  return row?.body;
}

describe("v0 publication edits while imported media is uploading", () => {
  it("rejects a body edit with 409", async () => {
    const client = await registerAuthor();
    await seedMediaImport(await createDraft(client), "processing");

    const resp = await client
      .put(`/api/publications/${SLUG}`)
      .send({ body: "Replaced body." });

    expect(resp.status, resp.text).toBe(409);
    expect(resp.body.error).toBe(IN_PROGRESS);
    expect(await storedBody()).toBe("Original body.");
  });

  it("still allows edits that don't touch the body", async () => {
    const client = await registerAuthor();
    await seedMediaImport(await createDraft(client), "processing");

    const resp = await client
      .put(`/api/publications/${SLUG}`)
      .send({ title: "Renamed" });

    expect(resp.status, resp.text).toBe(200);
  });

  it("rejects publishing with 409", async () => {
    const client = await registerAuthor();
    await seedMediaImport(await createDraft(client), "processing");

    const resp = await client.post(`/api/publications/${SLUG}/publish`);

    expect(resp.status, resp.text).toBe(409);
    expect(resp.body.error).toBe(IN_PROGRESS);
  });

  it("rejects publishing a body that still holds a media ref with 400", async () => {
    const client = await registerAuthor();
    await seedMediaImport(await createDraft(client), "completed");
    const put = await client
      .put(`/api/publications/${SLUG}`)
      .send({ body: ":::image{src=raven-media://01FAILED}\n:::" });
    expect(put.status, put.text).toBe(200);

    const resp = await client.post(`/api/publications/${SLUG}/publish`);

    expect(resp.status, resp.text).toBe(400);
    expect(resp.body.error).toMatch(/imported media that failed to upload/);
  });

  it("allows body edits once the import has settled", async () => {
    const client = await registerAuthor();
    await seedMediaImport(await createDraft(client), "completed");

    const resp = await client
      .put(`/api/publications/${SLUG}`)
      .send({ body: "Replaced body." });

    expect(resp.status, resp.text).toBe(200);
    expect(await storedBody()).toBe("Replaced body.");
  });
});
