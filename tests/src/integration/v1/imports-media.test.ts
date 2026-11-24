import { escape } from "mysql2";
import { beforeEach, describe, expect, it } from "vitest";
import {
  execute,
  getMediaMockCalls,
  makeUser,
  query,
  registerUserWithId,
  resetMediaMock,
  seedSiteAdmin,
  type TestApiClient,
  waitForRows,
} from "./helpers.js";

const IMPORTS = "/api/v1/imports";
const IN_PROGRESS = /until its imported media has finished uploading/;
const UNRESOLVED = /imported media that failed to upload/;

// Fixtures in tests/fixtures/google-docs/media-<name>.html each hold one image
// at http://lh3.googleusercontent.com/<name>.png, served by media-mock, except
// media-embedded, whose pixel.png is an inline data: URL.
type MediaDoc = "pixel" | "missing" | "corrupt" | "unavailable" | "embedded";

type BatchRow = {
  status: string;
};

type ItemRow = {
  status: string;
  error: string | null;
  s3_url: string | null;
};

async function loggedInAdmin() {
  const registered = await registerUserWithId();
  await seedSiteAdmin(registered.userId);
  await registered.client.login(
    registered.user.username,
    registered.user.password
  );
  return registered;
}

async function importMediaDoc(
  client: TestApiClient,
  doc: MediaDoc
): Promise<{ publicationId: string; importId: string }> {
  const resp = await client.post(IMPORTS).send({
    source: {
      type: "url",
      url: `https://docs.google.com/document/d/media-${doc}/edit`,
    },
  });
  expect(resp.status, resp.text).toBe(201);
  expect(resp.body.settled).toBe(false);
  return {
    publicationId: resp.body.publicationId as string,
    importId: resp.body.importId as string,
  };
}

async function waitForSettledBatch(publicationId: string): Promise<BatchRow> {
  const rows = await waitForRows<BatchRow>(
    `SELECT status FROM media_import_batches WHERE publication_id = ${escape(publicationId)} AND status IN ('completed', 'failed')`,
    { timeoutMs: 20_000, intervalMs: 200 }
  );
  expect(rows, "media import batch didn't settle").toHaveLength(1);
  return rows[0]!;
}

async function getItem(publicationId: string): Promise<ItemRow> {
  const rows = await query<ItemRow>(
    `SELECT i.status, i.error, i.s3_url FROM media_import_items i JOIN media_import_batches b ON b.id = i.batch_id WHERE b.publication_id = ${escape(publicationId)}`
  );
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

async function getUpload(client: TestApiClient, importId: string) {
  const resp = await client.get(`${IMPORTS}/${importId}`);
  expect(resp.status, resp.text).toBe(200);
  expect(resp.body.uploads).toHaveLength(1);
  return resp.body.uploads[0] as Record<string, unknown>;
}

function downloadsOf(name: string) {
  return getMediaMockCalls().then((calls) =>
    calls.filter((c) => c.method === "GET" && c.path === `/${name}`)
  );
}

describe("v1 imports: background media upload", () => {
  beforeEach(async () => {
    await resetMediaMock();
  });

  it("uploads imported media and swaps it into the draft body", async () => {
    const { client } = await loggedInAdmin();
    const { publicationId, importId } = await importMediaDoc(client, "pixel");

    expect((await waitForSettledBatch(publicationId)).status).toBe("completed");
    const item = await getItem(publicationId);
    expect(item.status).toBe("completed");
    expect(await getUpload(client, importId)).toMatchObject({
      status: "completed",
      url: item.s3_url,
      source: {
        type: "url",
        url: "http://lh3.googleusercontent.com/pixel.png",
      },
      error: null,
    });

    const draft = await client.get(
      `/api/v1/publications/id/${publicationId}/draft`
    );
    expect(draft.status).toBe(200);
    const { body, mediaAssets } = draft.body.publication;
    expect(mediaAssets).toHaveLength(1);
    expect(mediaAssets[0].publicUrl).toBe(item.s3_url);
    expect(body).toContain(item.s3_url);
    expect(body).not.toContain("raven-media://");
  });

  it("uploads an image embedded as a data: URL without downloading it", async () => {
    const { client } = await loggedInAdmin();
    const { publicationId, importId } = await importMediaDoc(
      client,
      "embedded"
    );

    expect((await waitForSettledBatch(publicationId)).status).toBe("completed");
    const item = await getItem(publicationId);
    expect(item.status).toBe("completed");
    expect(await getMediaMockCalls()).toEqual([]);
    expect((await getUpload(client, importId)).source).toEqual({
      type: "bytes",
      filename: expect.any(String),
      mimeType: "image/png",
    });

    const draft = await client.get(
      `/api/v1/publications/id/${publicationId}/draft`
    );
    const { body, mediaAssets } = draft.body.publication;
    expect(mediaAssets).toHaveLength(1);
    expect(mediaAssets[0].mimeType).toBe("image/png");
    expect(body).toContain(item.s3_url);
    expect(body).not.toContain("data:image");
  });

  it("fails a 404 immediately instead of retrying", async () => {
    const { client } = await loggedInAdmin();
    const { publicationId, importId } = await importMediaDoc(client, "missing");

    expect((await waitForSettledBatch(publicationId)).status).toBe("failed");
    const item = await getItem(publicationId);
    expect(item.status).toBe("failed");
    expect(item.error).toMatch(/HTTP 404/);
    expect(await downloadsOf("missing.png")).toHaveLength(1);
    expect(await getUpload(client, importId)).toMatchObject({
      status: "failed",
      url: null,
      error: { code: "unavailable", message: expect.any(String) },
    });
  });

  it("rejects publishing while a failed upload's ref is in the body", async () => {
    const { client } = await loggedInAdmin();
    const { publicationId } = await importMediaDoc(client, "missing");
    await waitForSettledBatch(publicationId);

    const resp = await client
      .post(`/api/v1/publications/id/${publicationId}/publish`)
      .send({});

    expect(resp.status, resp.text).toBe(422);
    expect(
      (resp.body.errors as { message: string }[]).some((e) =>
        UNRESOLVED.test(e.message)
      )
    ).toBe(true);
  });

  it("fails media that can't be read without storing it", async () => {
    const { client } = await loggedInAdmin();
    const { publicationId, importId } = await importMediaDoc(client, "corrupt");

    expect((await waitForSettledBatch(publicationId)).status).toBe("failed");
    const item = await getItem(publicationId);
    expect(item.status).toBe("failed");
    expect(item.error).toMatch(/Could not read .* as image/);
    expect(await query("SELECT id FROM media_assets")).toEqual([]);
    expect((await getUpload(client, importId)).error).toMatchObject({
      code: "unreadable",
    });
  });

  it("keeps a transient failure open for retry", async () => {
    const { client } = await loggedInAdmin();
    const { publicationId, importId } = await importMediaDoc(
      client,
      "unavailable"
    );

    const [item] = await waitForRows<ItemRow>(
      `SELECT i.status, i.error, i.s3_url FROM media_import_items i JOIN media_import_batches b ON b.id = i.batch_id WHERE b.publication_id = ${escape(publicationId)} AND i.error IS NOT NULL`,
      { timeoutMs: 20_000, intervalMs: 200 }
    );
    expect(item?.status).toBe("active");
    expect(item?.error).toMatch(/HTTP 503/);
    expect((await getUpload(client, importId)).error).toBeNull();
    const [batch] = await query<BatchRow>(
      `SELECT status FROM media_import_batches WHERE publication_id = ${escape(publicationId)}`
    );
    expect(batch?.status).toBe("processing");
  });

  it("won't re-import into a draft while its media is still uploading", async () => {
    const { client } = await loggedInAdmin();
    // The 503 keeps the item open for a retry, so the batch stays unsettled.
    const { publicationId } = await importMediaDoc(client, "unavailable");
    const draftUrl = `/api/v1/publications/id/${publicationId}/draft`;
    const before = (await client.get(draftUrl)).body.publication;

    const resp = await client.post(IMPORTS).send({
      source: {
        type: "url",
        url: "https://docs.google.com/document/d/field-notes/edit",
      },
      target: { type: "draft", publicationId },
    });

    expect(resp.status, resp.text).toBe(409);
    expect(resp.body.errors.draft).toBeDefined();
    const after = (await client.get(draftUrl)).body.publication;
    expect(after.title).toBe(before.title);
    expect(after.importDocument.id).toBe(before.importDocument.id);
  });

  it("deletes a never-published imported draft", async () => {
    const { client } = await loggedInAdmin();
    const { publicationId, importId } = await importMediaDoc(client, "pixel");
    await waitForSettledBatch(publicationId);

    const resp = await client.delete(
      `/api/v1/publications/id/${publicationId}`
    );

    expect(resp.status, resp.text).toBe(204);
    expect(
      await query(
        `SELECT id FROM version_imports WHERE id = ${escape(importId)}`
      )
    ).toEqual([]);
  });
});

describe("v1 imports: GET /imports/{id}", () => {
  it("resolves a non-canonical import id", async () => {
    const { client } = await loggedInAdmin();
    const { publicationId, importId } = await importMediaDoc(client, "pixel");
    expect(importId).toContain("0");

    const resp = await client.get(
      `${IMPORTS}/${importId.replace("0", "O").toLowerCase()}`
    );

    expect(resp.status, resp.text).toBe(200);
    expect(resp.body.publicationId).toBe(publicationId);
  });

  it("returns 404 to a user who can't edit the publication", async () => {
    const { client } = await loggedInAdmin();
    const { importId } = await importMediaDoc(client, "pixel");
    const other = await registerUserWithId(makeUser("importoutsider"));
    await other.client.login(other.user.username, other.user.password);

    const resp = await other.client.get(`${IMPORTS}/${importId}`);

    expect(resp.status, resp.text).toBe(404);
    expect(resp.body.uploads).toBeUndefined();
  });

  it("returns 404 for an unknown import id", async () => {
    const { client } = await loggedInAdmin();

    const resp = await client.get(`${IMPORTS}/01ARZ3NDEKTSV4RRFFQ69G5FAV`);

    expect(resp.status, resp.text).toBe(404);
  });

  it("rejects a malformed import id", async () => {
    const { client } = await loggedInAdmin();

    const resp = await client.get(`${IMPORTS}/not-a-ulid`);

    expect(resp.status, resp.text).toBe(422);
  });
});

// media-unavailable's image always returns 503, so its batch stays unsettled
// for the length of a test (the first retry is at least 15s away).
describe("v1 imports: body edits while media is uploading", () => {
  async function importInProgress() {
    const registered = await loggedInAdmin();
    const { publicationId } = await importMediaDoc(
      registered.client,
      "unavailable"
    );
    return { ...registered, publicationId };
  }

  async function settleBatch(publicationId: string) {
    await execute(
      `UPDATE media_import_batches SET status = 'completed' WHERE publication_id = ${escape(publicationId)}`
    );
  }

  async function storedBody(publicationId: string) {
    const [row] = await query<{ body: string }>(
      `SELECT body FROM versions WHERE publication_id = ${escape(publicationId)}`
    );
    return row?.body;
  }

  it("rejects a body edit but applies the rest of the PATCH", async () => {
    const { client, publicationId } = await importInProgress();
    const bodyBefore = await storedBody(publicationId);

    const resp = await client
      .patch(`/api/v1/publications/id/${publicationId}`)
      .send({ title: "Renamed", body: "Replaced body." });

    expect(resp.status, resp.text).toBe(200);
    expect(resp.body.rejected.body.message).toMatch(IN_PROGRESS);
    expect(resp.body.publication.title).toBe("Renamed");
    expect(await storedBody(publicationId)).toBe(bodyBefore);
  });

  it("rejects publishing", async () => {
    const { client, publicationId } = await importInProgress();

    const resp = await client
      .post(`/api/v1/publications/id/${publicationId}/publish`)
      .send({});

    expect(resp.status, resp.text).toBe(422);
    expect(
      (resp.body.errors as { message: string }[]).some((e) =>
        IN_PROGRESS.test(e.message)
      )
    ).toBe(true);
  });

  it("allows body edits once the import has settled", async () => {
    const { client, publicationId } = await importInProgress();
    await settleBatch(publicationId);

    const resp = await client
      .patch(`/api/v1/publications/id/${publicationId}`)
      .send({ body: "Replaced body." });

    expect(resp.status, resp.text).toBe(200);
    expect(resp.body.rejected.body).toBeUndefined();
    expect(await storedBody(publicationId)).toBe("Replaced body.");
  });
});
