import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  api,
  fixtureBytes,
  makeUser,
  PERMISSION_DENIED,
  query,
  registerUserWithId,
  seedPublication,
  seedSiteAdmin,
  type TestApiClient,
  UNAUTHENTICATED,
} from "./helpers.js";

// MEDIA_MAX_BYTES for backend-test in docker-compose.test.yml.
const MEDIA_MAX_BYTES = 1048576;

// A ZIP holding one empty file named "a", which file-type sniffs as
// application/zip.
const EMPTY_ZIP = Buffer.from(
  "504b03040a0000000000000000000000000000000000000000000100000061" +
    "504b01020a000a000000000000000000000000000000000000000000010000" +
    "0000000000000000000000000000000061" +
    "504b050600000000010001002f0000001f0000000000",
  "hex"
);

async function adminClient() {
  const { client, user, userId } = await registerUserWithId();
  await seedSiteAdmin(userId);
  await client.login(user.username, user.password);
  return { client, userId };
}

async function createDraft(client: TestApiClient) {
  const res = await client
    .post("/api/v1/publications")
    .send({ title: "With figures", body: "Body." });
  expect(res.status).toBe(201);
  return res.body.publicationId as string;
}

function upload(
  client: TestApiClient,
  publicationId: string,
  bytes: Buffer,
  filename: string
) {
  return client
    .post(`/api/v1/publications/id/${publicationId}/draft/media-assets`)
    .attach("file", bytes, filename);
}

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function draftMediaAssets(client: TestApiClient, publicationId: string) {
  const res = await client.get(
    `/api/v1/publications/id/${publicationId}/draft`
  );
  expect(res.status).toBe(200);
  return res.body.publication.mediaAssets as { publicUrl: string }[];
}

async function countAssets(publicationId: string) {
  const [row] = await query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM media_assets " +
      `WHERE storage_key LIKE 'publications/${publicationId}/%'`
  );
  return Number(row!.n);
}

describe("POST /api/v1/publications/id/{id}/draft/media-assets", () => {
  it.each(["plot.png", "α.png", "PLOT.PNG"])(
    "stores %s under its full hash and extension and links it to the draft",
    async (filename) => {
      const { client } = await adminClient();
      const publicationId = await createDraft(client);
      const bytes = fixtureBytes("pixel.png");

      const res = await upload(client, publicationId, bytes, filename);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        url: expect.stringMatching(
          new RegExp(
            `/publications/${publicationId}/media_${sha256(bytes)}\\.png$`
          )
        ),
        sha256: sha256(bytes),
        draftCreated: false,
      });
      const stored = await fetch(res.body.url);
      expect(stored.status).toBe(200);
      expect(stored.headers.get("Content-Disposition")).toBe(
        `inline; filename="media_${sha256(bytes)}.png"`
      );
      expect(Buffer.from(await stored.arrayBuffer())).toEqual(bytes);
      expect(await draftMediaAssets(client, publicationId)).toEqual([
        expect.objectContaining({ publicUrl: res.body.url, kind: "image" }),
      ]);
    }
  );

  it("returns the same URL for the same bytes without storing them twice", async () => {
    const { client } = await adminClient();
    const publicationId = await createDraft(client);
    const bytes = fixtureBytes("pixel.png");

    const results = await Promise.all([
      upload(client, publicationId, bytes, "a.png"),
      upload(client, publicationId, bytes, "b.png"),
      upload(client, publicationId, bytes, "a.png"),
    ]);

    for (const res of results) expect(res.status).toBe(200);
    expect(new Set(results.map((res) => res.body.url)).size).toBe(1);
    expect(await countAssets(publicationId)).toBe(1);
    expect(await draftMediaAssets(client, publicationId)).toHaveLength(1);
  });

  it("leaves the draft's ETag unchanged", async () => {
    const { client } = await adminClient();
    const publicationId = await createDraft(client);
    const before = await client.get(
      `/api/v1/publications/id/${publicationId}/draft`
    );

    const res = await upload(
      client,
      publicationId,
      fixtureBytes("pixel.mp4"),
      "clip.mp4"
    );

    expect(res.status).toBe(200);
    const after = await client.get(
      `/api/v1/publications/id/${publicationId}/draft`
    );
    expect(after.headers.etag).toBe(before.headers.etag);
  });

  it("opens one draft when parallel uploads find none open", async () => {
    const { client, userId } = await adminClient();
    const { id: publicationId } = await seedPublication({
      ownerId: userId,
      slug: "published-with-figures",
      state: "PUBLISHED",
    });

    const results = await Promise.all(
      (["pixel.png", "pixel.svg", "pixel.mp4"] as const).map((name) =>
        upload(client, publicationId, fixtureBytes(name), name)
      )
    );

    for (const res of results) expect(res.status).toBe(200);
    expect(results.filter((res) => res.body.draftCreated)).toHaveLength(1);
    const drafts = await query<{ id: string }>(
      "SELECT v.id FROM versions v JOIN publications p " +
        "ON p.id_int = v.publication_id_int " +
        `WHERE p.id = '${publicationId}' AND v.state = 'DRAFT'`
    );
    expect(drafts).toHaveLength(1);
    expect(await draftMediaAssets(client, publicationId)).toHaveLength(3);
  });

  it.each([
    ["an unsupported extension", "payload.exe", fixtureBytes("pixel.png")],
    ["no extension", "plot", fixtureBytes("pixel.png")],
    ["bytes that aren't the image they claim", "plot.png", Buffer.from("no")],
    ["a ZIP archive named as an image", "plot.png", EMPTY_ZIP],
  ])("returns 422 for %s and stores nothing", async (_, filename, bytes) => {
    const { client } = await adminClient();
    const publicationId = await createDraft(client);

    const res = await upload(client, publicationId, bytes, filename);

    expect(res.status).toBe(422);
    expect(res.body.errors).toEqual([
      expect.objectContaining({ path: ["file"] }),
    ]);
    expect(await countAssets(publicationId)).toBe(0);
  });

  it("returns 422 without a file", async () => {
    const { client } = await adminClient();
    const publicationId = await createDraft(client);

    const res = await client
      .post(`/api/v1/publications/id/${publicationId}/draft/media-assets`)
      .field("note", "no file");

    expect(res.status).toBe(422);
    expect(res.body.errors).toEqual([
      expect.objectContaining({ path: ["file"] }),
    ]);
  });

  it("returns 413 for a file over the limit", async () => {
    const { client } = await adminClient();
    const publicationId = await createDraft(client);

    const res = await upload(
      client,
      publicationId,
      Buffer.alloc(MEDIA_MAX_BYTES + 1),
      "big.png"
    );

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      type: "application_error",
      errors: { file: { message: expect.any(String) } },
    });
    expect(await countAssets(publicationId)).toBe(0);
  });

  it("returns 403 to a user who can't edit the publication", async () => {
    const { client: owner } = await adminClient();
    const publicationId = await createDraft(owner);
    const { client: other, user } = await registerUserWithId(
      makeUser("outsider")
    );
    await other.login(user.username, user.password);

    const res = await upload(
      other,
      publicationId,
      fixtureBytes("pixel.png"),
      "plot.png"
    );

    expect(res.status).toBe(403);
    expect(res.body).toEqual(PERMISSION_DENIED);
  });

  it("refuses a cross-site upload made with the session cookie", async () => {
    const { client } = await adminClient();
    const publicationId = await createDraft(client);

    const res = await upload(
      client,
      publicationId,
      fixtureBytes("pixel.png"),
      "plot.png"
    ).set("Origin", "https://attacker.example");

    expect(res.status).toBe(403);
    expect(res.body.errors).toHaveProperty("auth");
    expect(await countAssets(publicationId)).toBe(0);
  });

  it("accepts a bearer-token upload without an Origin, as the CLI sends", async () => {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    const { token } = await client.login(user.username, user.password);
    const publicationId = await createDraft(client);

    const res = await api()
      .post(`/api/v1/publications/id/${publicationId}/draft/media-assets`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", fixtureBytes("pixel.png"), "plot.png");

    expect(res.status).toBe(200);
  });

  it("returns 404 for an unknown publication", async () => {
    const { client } = await adminClient();

    const res = await upload(
      client,
      "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      fixtureBytes("pixel.png"),
      "plot.png"
    );

    expect(res.status).toBe(404);
    expect(res.body.errors).toHaveProperty("publication");
  });

  it("returns 401 without a session", async () => {
    const { client } = await adminClient();
    const publicationId = await createDraft(client);

    const res = await api()
      .post(`/api/v1/publications/id/${publicationId}/draft/media-assets`)
      .attach("file", fixtureBytes("pixel.png"), "plot.png");

    expect(res.status).toBe(401);
    expect(res.body).toEqual(UNAUTHENTICATED);
  });
});
