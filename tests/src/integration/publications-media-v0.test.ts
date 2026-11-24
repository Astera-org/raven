import { escape } from "mysql2";
import { beforeEach, describe, expect, it } from "vitest";
import {
  fixtureBytes,
  getMediaMockCalls,
  mediaDirective,
  mediaUrl,
  query,
  registerUserWithId,
  resetMediaMock,
  seedSiteAdmin,
  type TestApiClient,
} from "./helpers.js";

interface MediaAssetResponse {
  id: string;
  byteSize: number;
  mimeType: string;
  kind: "audio" | "file" | "image" | "video";
  publicUrl: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  rotation: number | null;
}

interface PublicationResponse {
  body: string | null;
  mediaAssets: MediaAssetResponse[];
}

const SLUG = "media-upload-test-pub";

const PNG_ASSET = {
  id: expect.any(String),
  publicUrl: expect.any(String),
  byteSize: fixtureBytes("pixel.png").byteLength,
  kind: "image",
  mimeType: "image/png",
  width: 1,
  height: 1,
  durationMs: null,
  rotation: null,
};

async function registerAuthor() {
  const { client, user, userId } = await registerUserWithId();
  await seedSiteAdmin(userId);
  await client.login(user.username, user.password);
  return { client, user };
}

function createPublication(client: TestApiClient, body: string) {
  return client.post("/api/publications").send({
    slug: SLUG,
    title: "Media Test",
    abstract: "Abstract text.",
    body,
  });
}

async function createPublicationOk(client: TestApiClient, body: string) {
  const resp = await createPublication(client, body);
  expect(resp.status, resp.text).toBe(201);
}

async function getDraft(client: TestApiClient): Promise<PublicationResponse> {
  const resp = await client.get(`/api/publications/${SLUG}/draft`);
  expect(resp.status, resp.text).toBe(200);
  return resp.body.publication as PublicationResponse;
}

async function getPublished(
  client: TestApiClient
): Promise<PublicationResponse> {
  const resp = await client.get(`/api/publications/${SLUG}`);
  expect(resp.status, resp.text).toBe(200);
  return resp.body.publication as PublicationResponse;
}

async function publish(client: TestApiClient, username: string) {
  const contribResp = await client.post("/api/publications/add_contrib").send({
    slug: SLUG,
    username,
    role: "author",
    in_byline: true,
  });
  expect(contribResp.status, contribResp.text).toBe(200);

  const publishResp = await client.post(`/api/publications/${SLUG}/publish`);
  expect(publishResp.status, publishResp.text).toBe(200);
}

async function getStoredBodies(): Promise<(string | null)[]> {
  const rows = await query<{ body: string | null }>(
    `SELECT v.body FROM versions v JOIN publications p ON p.id_int = v.publication_id_int WHERE p.slug = ${escape(SLUG)} ORDER BY v.version_number`
  );
  return rows.map((row) => row.body);
}

async function countRows(table: string): Promise<number> {
  const rows = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM \`${table}\``
  );
  return Number(rows[0]!.n);
}

describe("v0 publication media uploads", () => {
  beforeEach(async () => {
    await resetMediaMock();
  });

  describe("POST /api/publications", () => {
    it("uploads media and returns it in mediaAssets", async () => {
      const { client } = await registerAuthor();
      await createPublicationOk(client, mediaDirective("image", "pixel.png"));

      const draft = await getDraft(client);
      expect(draft.mediaAssets).toEqual([PNG_ASSET]);
      const asset = draft.mediaAssets[0]!;
      expect(draft.body).toContain(asset.publicUrl);
      expect(draft.body).not.toContain(mediaUrl("pixel.png"));
      expect(await getStoredBodies()).toEqual([
        expect.stringContaining(asset.publicUrl),
      ]);

      const s3Resp = await fetch(asset.publicUrl);
      expect(s3Resp.status).toBe(200);
      expect(
        Buffer.from(await s3Resp.arrayBuffer()).equals(
          fixtureBytes("pixel.png")
        )
      ).toBe(true);
    });

    it("rejects undownloadable media and rolls back the publication", async () => {
      const { client } = await registerAuthor();
      const resp = await createPublication(
        client,
        mediaDirective("image", "missing.png")
      );
      expect(resp.status, resp.text).toBe(400);

      expect(await countRows("publications")).toBe(0);
      expect(await countRows("versions")).toBe(0);
    });
  });

  describe("PUT /api/publications/:slug", () => {
    it("uploads media added to an existing draft", async () => {
      const { client } = await registerAuthor();
      await createPublicationOk(client, "No media yet.");

      const putResp = await client
        .put(`/api/publications/${SLUG}`)
        .send({ body: mediaDirective("image", "pixel.png") });
      expect(putResp.status, putResp.text).toBe(200);

      const draft = await getDraft(client);
      expect(draft.mediaAssets).toEqual([PNG_ASSET]);
      expect(draft.body).toContain(draft.mediaAssets[0]!.publicUrl);
    });

    // The failed PUT rolls back its media_assets row but leaves pixel.png's
    // object in S3, so the retry finds the key already present.
    it("records media whose S3 object survived a rolled-back upload", async () => {
      const { client } = await registerAuthor();
      await createPublicationOk(client, "No media yet.");

      const failedResp = await client.put(`/api/publications/${SLUG}`).send({
        body: [
          mediaDirective("image", "pixel.png"),
          mediaDirective("image", "missing.png"),
        ].join("\n\n"),
      });
      expect(failedResp.status, failedResp.text).toBe(400);
      expect(await countRows("media_assets")).toBe(0);

      const putResp = await client
        .put(`/api/publications/${SLUG}`)
        .send({ body: mediaDirective("image", "pixel.png") });
      expect(putResp.status, putResp.text).toBe(200);

      const draft = await getDraft(client);
      expect(draft.mediaAssets).toEqual([PNG_ASSET]);
      const downloads = (await getMediaMockCalls()).filter(
        (call) => call.method === "GET" && call.path === "/pixel.png"
      );
      expect(downloads).toHaveLength(2);
    });

    // Creating the new draft and uploading its media share a transaction, so
    // this also guards against the upload blocking on the uncommitted draft.
    it(
      "uploads media into a new draft of a published publication",
      { timeout: 15_000 },
      async () => {
        const { client, user } = await registerAuthor();
        await createPublicationOk(client, "Version one.");
        await publish(client, user.username);

        const putResp = await client
          .put(`/api/publications/${SLUG}`)
          .send({ body: mediaDirective("image", "pixel.png") });
        expect(putResp.status, putResp.text).toBe(200);

        const draft = await getDraft(client);
        expect(draft.mediaAssets).toEqual([PNG_ASSET]);
        expect(draft.body).toContain(draft.mediaAssets[0]!.publicUrl);
        expect((await getPublished(client)).mediaAssets).toEqual([]);
      }
    );
  });

  describe("POST /api/publications/:slug/draft", () => {
    it("carries media assets over into a new draft", async () => {
      const { client, user } = await registerAuthor();
      await createPublicationOk(client, mediaDirective("image", "pixel.png"));
      await publish(client, user.username);

      const draftResp = await client.post(`/api/publications/${SLUG}/draft`);
      expect(draftResp.status, draftResp.text).toBe(201);

      const draft = draftResp.body.publication as PublicationResponse;
      expect(draft.mediaAssets).toEqual([PNG_ASSET]);
      expect(draft.mediaAssets[0]!.id).toBe(
        (await getPublished(client)).mediaAssets[0]!.id
      );
    });
  });

  describe("POST /api/publications/:slug/publish", () => {
    it("returns media assets on the published version", async () => {
      const { client, user } = await registerAuthor();
      await createPublicationOk(client, mediaDirective("image", "pixel.png"));
      await publish(client, user.username);

      const published = await getPublished(client);
      expect(published.mediaAssets).toEqual([PNG_ASSET]);
      expect(published.body).toContain(published.mediaAssets[0]!.publicUrl);
    });
  });
});
