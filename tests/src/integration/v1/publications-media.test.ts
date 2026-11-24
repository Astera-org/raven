import { beforeEach, describe, expect, it } from "vitest";
import {
  fixtureBytes,
  getMediaMockCalls,
  type MediaDirective,
  mediaDirective,
  type MediaFixture,
  type MediaMockSpecialRoute,
  mediaUrl,
  query,
  registerUserWithId,
  resetMediaMock,
  seedSiteAdmin,
  setMediaLastModified,
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

type ExpectedAsset = Pick<
  MediaAssetResponse,
  "kind" | "mimeType" | "width" | "height" | "durationMs" | "rotation"
>;

// Dimensions are as displayed, i.e. after applying rotation / EXIF Orientation.
const FIXTURES: Record<
  MediaFixture,
  { directive: MediaDirective; expected: ExpectedAsset }
> = {
  "pixel.png": {
    directive: "image",
    expected: {
      kind: "image",
      mimeType: "image/png",
      width: 1,
      height: 1,
      durationMs: null,
      rotation: null,
    },
  },
  "pixel.svg": {
    directive: "image",
    expected: {
      kind: "image",
      mimeType: "image/svg+xml",
      width: 1,
      height: 1,
      durationMs: null,
      rotation: null,
    },
  },
  "pixel-prolog.svg": {
    directive: "image",
    expected: {
      kind: "image",
      mimeType: "image/svg+xml",
      width: 1,
      height: 1,
      durationMs: null,
      rotation: null,
    },
  },
  "pixel-animated.gif": {
    directive: "image",
    expected: {
      kind: "image",
      mimeType: "image/gif",
      width: 2,
      height: 1,
      durationMs: null,
      rotation: null,
    },
  },
  "pixel-orient6.jpg": {
    directive: "image",
    expected: {
      kind: "image",
      mimeType: "image/jpeg",
      width: 2,
      height: 1,
      durationMs: null,
      rotation: null,
    },
  },
  "pixel.mp4": {
    directive: "video",
    expected: {
      kind: "video",
      mimeType: "video/mp4",
      width: 2,
      height: 2,
      durationMs: 1000,
      rotation: 0,
    },
  },
  "pixel-rot90.mp4": {
    directive: "video",
    expected: {
      kind: "video",
      mimeType: "video/mp4",
      width: 4,
      height: 2,
      durationMs: 1000,
      rotation: 90,
    },
  },
  "silence.mp3": {
    directive: "audio",
    expected: {
      kind: "audio",
      mimeType: "audio/mpeg",
      width: null,
      height: null,
      // LAME pads the 1s of audio out to 16 frames (1.152s). Newer ffprobe trims
      // that padding using the LAME gapless header; older versions (e.g. 5.1 in
      // the backend image) report the padded length.
      durationMs: expect.toBeOneOf([1000, 1152]),
      rotation: null,
    },
  },
  "blank.html": {
    directive: "iframe",
    expected: {
      kind: "file",
      mimeType: "text/html",
      width: null,
      height: null,
      durationMs: null,
      rotation: null,
    },
  },
};

const FIXTURE_NAMES = Object.keys(FIXTURES) as MediaFixture[];

const SLUG = "media-upload-test-pub";

function directiveFor(name: MediaFixture): string {
  return mediaDirective(FIXTURES[name].directive, name);
}

async function registerAuthor() {
  const { client, user, userId, userIds } = await registerUserWithId();
  await seedSiteAdmin(userId);
  await client.login(user.username, user.password);
  return { client, userIds };
}

function createPublication(client: TestApiClient, body: string) {
  return client.post("/api/v1/publications").send({
    slug: SLUG,
    title: "Media Test",
    abstract: "Abstract text.",
    body,
  });
}

async function createPublicationOk(
  client: TestApiClient,
  body: string
): Promise<string> {
  const resp = await createPublication(client, body);
  expect(resp.status, resp.text).toBe(201);
  return resp.body.publicationId as string;
}

async function getDraft(
  client: TestApiClient,
  publicationId: string
): Promise<PublicationResponse> {
  const resp = await client.get(
    `/api/v1/publications/id/${publicationId}/draft`
  );
  expect(resp.status, resp.text).toBe(200);
  return resp.body.publication as PublicationResponse;
}

async function addBylineAuthor(
  client: TestApiClient,
  publicationId: string,
  userId: string
) {
  const resp = await client
    .patch(`/api/v1/publications/id/${publicationId}`)
    .send({
      contributors: [
        { userId, roles: ["author"], inByline: true, affiliations: [] },
      ],
    });
  expect(resp.status, resp.text).toBe(200);
}

async function publish(client: TestApiClient, publicationId: string) {
  const resp = await client
    .post(`/api/v1/publications/id/${publicationId}/publish`)
    .send({});
  expect(resp.status, resp.text).toBe(200);
}

async function getStoredBody(publicationId: string): Promise<string | null> {
  const rows = await query<{ body: string | null }>(
    `SELECT body FROM versions WHERE publication_id = '${publicationId}' ORDER BY version_number DESC LIMIT 1`
  );
  return rows[0]?.body ?? null;
}

/** The response omits originUrl, so map assets back to fixtures via the DB. */
async function fixtureNameForAsset(asset: MediaAssetResponse) {
  const rows = await query<{ origin_url: string }>(
    `SELECT origin_url FROM media_assets WHERE id = '${asset.id}'`
  );
  expect(rows).toHaveLength(1);
  return rows[0]!.origin_url.split("/").pop();
}

async function expectStoredInS3(
  asset: MediaAssetResponse,
  name: MediaFixture
): Promise<void> {
  const resp = await fetch(asset.publicUrl);
  expect(resp.status).toBe(200);
  expect(resp.headers.get("content-type")).toBe(asset.mimeType);
  expect(Buffer.from(await resp.arrayBuffer()).equals(fixtureBytes(name))).toBe(
    true
  );
}

async function countRows(table: string): Promise<number> {
  const rows = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM \`${table}\``
  );
  return Number(rows[0]!.n);
}

describe("v1 publication media uploads", () => {
  beforeEach(async () => {
    await resetMediaMock();
  });

  describe("POST /api/v1/publications", () => {
    it.each(FIXTURE_NAMES)(
      "uploads %s and returns it in mediaAssets",
      async (name) => {
        const { client } = await registerAuthor();
        const publicationId = await createPublicationOk(
          client,
          directiveFor(name)
        );

        const draft = await getDraft(client, publicationId);
        expect(draft.mediaAssets).toHaveLength(1);
        const asset = draft.mediaAssets[0]!;
        expect(asset).toEqual({
          id: expect.any(String),
          publicUrl: expect.any(String),
          byteSize: fixtureBytes(name).byteLength,
          ...FIXTURES[name].expected,
        });

        expect(draft.body).toContain(asset.publicUrl);
        expect(draft.body).not.toContain(mediaUrl(name));
        await expectStoredInS3(asset, name);
      }
    );

    it("uploads every media directive in a single body", async () => {
      const { client } = await registerAuthor();
      const publicationId = await createPublicationOk(
        client,
        FIXTURE_NAMES.map(directiveFor).join("\n\n")
      );

      const draft = await getDraft(client, publicationId);
      expect(draft.mediaAssets).toHaveLength(FIXTURE_NAMES.length);
      const names = await Promise.all(
        draft.mediaAssets.map(fixtureNameForAsset)
      );
      expect(names.sort()).toEqual([...FIXTURE_NAMES].sort());
      for (const asset of draft.mediaAssets) {
        expect(draft.body).toContain(asset.publicUrl);
      }
    });

    it(
      "returns every media asset when there are more than a page's worth",
      { timeout: 30_000 },
      async () => {
        const assetCount = 21;
        const { client } = await registerAuthor();
        const body = Array.from(
          { length: assetCount },
          (_, i) =>
            `:::image{src="${mediaUrl("pixel.png").replace("/pixel.png", `/copy-${i}/pixel.png`)}"}\n:::`
        ).join("\n\n");
        const publicationId = await createPublicationOk(client, body);

        const draft = await getDraft(client, publicationId);
        expect(draft.mediaAssets).toHaveLength(assetCount);
      }
    );

    it("sniffs the file type when Content-Type is unhelpful", async () => {
      const { client } = await registerAuthor();
      const publicationId = await createPublicationOk(
        client,
        mediaDirective("image", "mislabeled.png")
      );

      const draft = await getDraft(client, publicationId);
      expect(draft.mediaAssets).toHaveLength(1);
      expect(draft.mediaAssets[0]).toMatchObject({
        kind: "image",
        mimeType: "image/png",
      });
    });

    it("uploads a URL repeated in the body only once", async () => {
      const { client } = await registerAuthor();
      const publicationId = await createPublicationOk(
        client,
        [directiveFor("pixel.png"), directiveFor("pixel.png")].join("\n\n")
      );

      const draft = await getDraft(client, publicationId);
      expect(draft.mediaAssets).toHaveLength(1);
      const downloads = (await getMediaMockCalls()).filter(
        (call) => call.method === "GET" && call.path === "/pixel.png"
      );
      expect(downloads).toHaveLength(1);
    });

    it("leaves non-allowlisted URLs and non-media directives untouched", async () => {
      const { client } = await registerAuthor();
      const body = [
        `:::image{src="https://example.com/pixel.png"}\n:::`,
        `:::callout{src="${mediaUrl("pixel.png")}"}\n:::`,
      ].join("\n\n");
      const publicationId = await createPublicationOk(client, body);

      const draft = await getDraft(client, publicationId);
      expect(draft.mediaAssets).toEqual([]);
      expect(draft.body).toBe(body);
      expect(await getMediaMockCalls()).toEqual([]);
    });

    it.each<MediaMockSpecialRoute>(["notes.txt", "missing.png"])(
      "rejects %s and rolls back the publication",
      async (name) => {
        const { client } = await registerAuthor();
        const resp = await createPublication(
          client,
          mediaDirective("image", name)
        );
        expect(resp.status, resp.text).toBe(400);

        expect(await countRows("publications")).toBe(0);
        expect(await countRows("versions")).toBe(0);
        expect(await countRows("media_assets")).toBe(0);
      }
    );
  });

  describe("PATCH /api/v1/publications/id/:id", () => {
    it("uploads media added to an existing draft", async () => {
      const { client } = await registerAuthor();
      const publicationId = await createPublicationOk(client, "No media yet.");

      const patchResp = await client
        .patch(`/api/v1/publications/id/${publicationId}`)
        .send({ body: directiveFor("pixel.png") });
      expect(patchResp.status, patchResp.text).toBe(200);

      const draft = await getDraft(client, publicationId);
      expect(draft.mediaAssets).toHaveLength(1);
      const asset = draft.mediaAssets[0]!;
      expect(draft.body).toContain(asset.publicUrl);
      expect(await getStoredBody(publicationId)).toContain(asset.publicUrl);
    });

    it("links an existing media asset without downloading it again", async () => {
      const { client } = await registerAuthor();
      const publicationId = await createPublicationOk(
        client,
        directiveFor("pixel.png")
      );
      const [original] = (await getDraft(client, publicationId)).mediaAssets;
      await query(
        `DELETE FROM version_media_asset_map WHERE media_asset_id = '${original!.id}'`
      );
      expect((await getDraft(client, publicationId)).mediaAssets).toEqual([]);

      for (let attempt = 0; attempt < 2; attempt++) {
        const patchResp = await client
          .patch(`/api/v1/publications/id/${publicationId}`)
          .send({ body: directiveFor("pixel.png") });
        expect(patchResp.status, patchResp.text).toBe(200);

        const draft = await getDraft(client, publicationId);
        expect(draft.mediaAssets.map((asset) => asset.id)).toEqual([
          original!.id,
        ]);
      }

      expect(await countRows("media_assets")).toBe(1);
      const downloads = (await getMediaMockCalls()).filter(
        (call) => call.method === "GET" && call.path === "/pixel.png"
      );
      expect(downloads).toHaveLength(1);
    });

    it("restores a soft-deleted asset instead of duplicating it", async () => {
      const { client } = await registerAuthor();
      const publicationId = await createPublicationOk(
        client,
        directiveFor("pixel.png")
      );
      const [original] = (await getDraft(client, publicationId)).mediaAssets;
      await query(
        `DELETE FROM version_media_asset_map WHERE media_asset_id = '${original!.id}'`
      );
      await query(
        `UPDATE media_assets SET deleted_at = NOW(3) WHERE id = '${original!.id}'`
      );

      const patchResp = await client
        .patch(`/api/v1/publications/id/${publicationId}`)
        .send({ body: directiveFor("pixel.png") });
      expect(patchResp.status, patchResp.text).toBe(200);

      const draft = await getDraft(client, publicationId);
      expect(draft.mediaAssets.map((asset) => asset.id)).toEqual([
        original!.id,
      ]);
      expect(await countRows("media_assets")).toBe(1);
      const [row] = await query<{ deleted_at: Date | null }>(
        `SELECT deleted_at FROM media_assets WHERE id = '${original!.id}'`
      );
      expect(row!.deleted_at).toBeNull();
    });

    it("re-uploads a file whose upstream Last-Modified changed", async () => {
      const { client } = await registerAuthor();
      const publicationId = await createPublicationOk(
        client,
        directiveFor("pixel.png")
      );
      const [original] = (await getDraft(client, publicationId)).mediaAssets;

      await setMediaLastModified("pixel.png", new Date("2025-06-01T00:00:00Z"));
      const patchResp = await client
        .patch(`/api/v1/publications/id/${publicationId}`)
        .send({ body: directiveFor("pixel.png") });
      expect(patchResp.status, patchResp.text).toBe(200);

      const draft = await getDraft(client, publicationId);
      const replacement = draft.mediaAssets.find(
        (asset) => asset.publicUrl !== original!.publicUrl
      );
      expect(replacement).toBeDefined();
      const downloads = (await getMediaMockCalls()).filter(
        (call) => call.method === "GET" && call.path === "/pixel.png"
      );
      expect(downloads).toHaveLength(2);
    });
  });

  describe("publishing and new drafts", () => {
    it("returns media assets on the published version", async () => {
      const { client, userIds } = await registerAuthor();
      const publicationId = await createPublicationOk(
        client,
        directiveFor("pixel.png")
      );
      await addBylineAuthor(client, publicationId, userIds.id);
      await publish(client, publicationId);

      const resp = await client.get(`/api/v1/publications/p/${SLUG}`);
      expect(resp.status, resp.text).toBe(200);
      const publication = resp.body.publication as PublicationResponse;
      expect(publication.mediaAssets).toHaveLength(1);
      expect(publication.body).toContain(publication.mediaAssets[0]!.publicUrl);
    });

    it("carries media assets over to a new draft of a published version", async () => {
      const { client, userIds } = await registerAuthor();
      const publicationId = await createPublicationOk(
        client,
        directiveFor("pixel.png")
      );
      await addBylineAuthor(client, publicationId, userIds.id);
      await publish(client, publicationId);
      const published = (await client.get(`/api/v1/publications/p/${SLUG}`))
        .body.publication as PublicationResponse;

      const postDraftResp = await client.post(
        `/api/v1/publications/id/${publicationId}/draft`
      );
      expect(postDraftResp.status, postDraftResp.text).toBe(201);

      const getDraftResp = await client.get(
        `/api/v1/publications/id/${publicationId}/draft`
      );
      expect(getDraftResp.status, getDraftResp.text).toBe(200);

      const draft = await getDraft(client, publicationId);
      expect(draft.mediaAssets.map((asset) => asset.id)).toEqual(
        published.mediaAssets.map((asset) => asset.id)
      );
    });
  });
});
