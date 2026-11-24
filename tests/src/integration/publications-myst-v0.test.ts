import { describe, expect, it } from "vitest";
// The v1 helpers sign in with BetterAuth, which v0 routes accept too, and
// the MyST create route needs.
import {
  addSelfToByline,
  registerUserWithId,
  seedSiteAdmin,
  TestApiClient,
} from "./v1/helpers.js";

const MYST_DOCUMENT = [
  "---",
  "title: Ravens in v0",
  "abstract: Corvids are clever.",
  "---",
  "",
  "## Methods",
  "",
  "We watched them.",
  "",
].join("\n");

async function adminClient() {
  const { client, user, userId } = await registerUserWithId();
  await seedSiteAdmin(userId);
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
  };
}

async function publish(client: TestApiClient, publicationId: string) {
  await addSelfToByline(client, publicationId);
  const res = await client
    .post(`/api/v1/publications/id/${publicationId}/versions`)
    .send({});
  expect(res.status).toBe(201);
}

describe("content and publication_ulid in v0 responses", () => {
  it("are on a MyST draft, with only the format, even for its owner", async () => {
    const client = await adminClient();
    const { publicationId, slug } = await createFromMyst(client);

    const res = await client.get(`/api/publications/${slug}/draft`);

    expect(res.status).toBe(200);
    expect(res.body.publication.publication_ulid).toBe(publicationId);
    expect(res.body.publication.content).toEqual({ format: "myst" });
  });

  it("give every reader of a version only the format", async () => {
    const client = await adminClient();
    const { publicationId, slug } = await createFromMyst(client);
    await publish(client, publicationId);

    for (const path of [
      `/api/publications/${slug}`,
      `/api/publications/${slug}/v1`,
    ]) {
      for (const reader of [client, new TestApiClient()]) {
        const res = await reader.get(path);

        expect(res.status, path).toBe(200);
        expect(res.body.publication.publication_ulid, path).toBe(publicationId);
        expect(res.body.publication.content, path).toEqual({ format: "myst" });
      }
    }
  });

  it("leave source out for a publication that was not imported", async () => {
    const client = await adminClient();
    const create = await client
      .post("/api/v1/publications")
      .send({ title: "From the web editor", body: "Body." });

    const res = await client.get(`/api/publications/${create.body.slug}/draft`);

    expect(res.body.publication.publication_ulid).toBe(
      create.body.publicationId
    );
    expect(res.body.publication).not.toHaveProperty("source");
  });

  it("keep the format when v0 opens a new draft", async () => {
    const client = await adminClient();
    const { publicationId, slug } = await createFromMyst(client);
    await publish(client, publicationId);

    const res = await client.post(`/api/publications/${slug}/draft`);

    expect(res.status).toBe(201);
    expect(res.body.publication.content).toMatchObject({ format: "myst" });
  });
});
