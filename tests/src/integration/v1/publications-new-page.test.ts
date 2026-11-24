import { describe, expect, it } from "vitest";
import {
  makeUser,
  registerUserWithId,
  seedOrg,
  seedOrgMember,
  seedSiteAdmin,
  TestApiClient,
} from "./helpers.js";

// Mirrors the API calls made by pages/publications/new/index.tsx in the
describe("publications/new page (mirrors pages/publications/new/index.tsx)", () => {
  it("requires authentication for both the drafts list and publication creation", async () => {
    const anon = new TestApiClient();

    expect((await anon.get("/api/v1/users/me/publications")).status).toBe(401);
    expect(
      (
        await anon.post("/api/v1/publications").send({
          title: "Unauthorized Import",
          subtitle: null,
          abstract: "",
          body: "Body from Google Doc.",
          importDocument: {
            url: "https://docs.google.com/document/d/unauthorized/edit",
            filename: "Unauthorized Doc",
            format: "gdoc",
            body: "<p>Body from Google Doc.</p>",
            syncDate: new Date().toUTCString(),
          },
        })
      ).status
    ).toBe(401);
  });

  it("rejects publication creation for users without create-publication permission", async () => {
    const { client, user } = await registerUserWithId(makeUser("noperms"));
    await client.login(user.username, user.password);

    const resp = await client.post("/api/v1/publications").send({
      title: "Should Be Rejected",
      abstract: "",
      body: "Body from Google Doc.",
      importDocument: {
        url: "https://docs.google.com/document/d/no-perms/edit",
        filename: "No Perms Doc",
        format: "gdoc",
        body: "<p>Body from Google Doc.</p>",
        syncDate: new Date().toUTCString(),
      },
    });
    expect(resp.status).toBe(403);
  });

  it("imports a Google Doc into a new draft, then surfaces it in my drafts", async () => {
    const { client, user, userId } = await registerUserWithId(
      makeUser("importer")
    );
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);

    // Before anything is created, RecentDraftsCard's query should come back empty.
    const emptyDrafts = await client.get(
      "/api/v1/users/me/publications?state=draft&perPage=100"
    );
    expect(emptyDrafts.status).toBe(200);
    expect(emptyDrafts.body.items).toEqual([]);
    expect(emptyDrafts.body.pagination.total).toBe(0);

    // ImportHero.handleImport: googleDocToMyst() resolves title/subtitle/abstract/body
    // client-side, then createPublication() is called with that plus importDocument.
    const importUrl = "https://docs.google.com/document/d/abc123/edit";
    const syncDate = new Date().toUTCString();
    const createResp = await client.post("/api/v1/publications").send({
      title: "Imported From Google Docs",
      subtitle: "An imported subtitle",
      abstract: "An imported abstract.",
      body: "Imported body content.",
      importDocument: {
        url: importUrl,
        filename: "My Google Doc",
        format: "gdoc",
        body: "<p>Imported body content.</p>",
        syncDate,
      },
    });
    expect(createResp.status).toBe(201);
    expect(createResp.body.publicationId).toBeDefined();
    expect(createResp.body.slug).toBeDefined();
    const { slug, publicationId } = createResp.body;

    // handleImportSuccess navigates to /publications/:id/edit with this id.
    expect(typeof publicationId).toBe("string");

    // The draft view (as used by the change/edit page next in the flow) should
    // reflect the imported content and the import metadata.
    const draftResp = await client.get(
      `/api/v1/publications/id/${publicationId}/draft`
    );
    expect(draftResp.status).toBe(200);
    const draft = draftResp.body.publication;
    expect(draft.title).toBe("Imported From Google Docs");
    expect(draft.subtitle).toBe("An imported subtitle");
    expect(draft.abstract).toBe("An imported abstract.");
    expect(draft.body).toBe("Imported body content.");
    expect(draft.importDocument).toMatchObject({
      url: importUrl,
      format: "gdoc",
      filename: "My Google Doc",
    });
    expect(draft.importDocument.syncDate).toBeDefined();

    // RecentDraftsCard's query should now include the newly imported draft.
    const draftsResp = await client.get(
      "/api/v1/users/me/publications?state=draft&perPage=100"
    );
    expect(draftsResp.status).toBe(200);
    expect(draftsResp.body.pagination.total).toBe(1);
    expect(draftsResp.body.items).toHaveLength(1);
    const listedDraft = draftsResp.body.items[0];
    expect(listedDraft.publicationId).toBe(publicationId);
    expect(listedDraft.slug).toBe(slug);
    expect(listedDraft.title).toBe("Imported From Google Docs");
    expect(listedDraft.versionId).toBeDefined();
    expect(listedDraft.createdAt).toMatch(/Z$/);
    expect(listedDraft.updatedAt).toMatch(/Z$/);
  });

  it("truncates a too-long subtitle on creation and reports a displayable validation error", async () => {
    const { client, user, userId } = await registerUserWithId(
      makeUser("longsubtitle")
    );
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);

    const tooLongSubtitle = "a".repeat(301);
    const resp = await client.post("/api/v1/publications").send({
      title: "Imported From Google Docs",
      subtitle: tooLongSubtitle,
      abstract: "An imported abstract.",
      body: "Imported body content.",
      importDocument: {
        url: "https://docs.google.com/document/d/toolongsubtitle/edit",
        filename: "My Google Doc",
        format: "gdoc",
        body: "<p>Imported body content.</p>",
        syncDate: new Date().toUTCString(),
      },
    });

    // Creation still succeeds, but the subtitle is truncated and a
    // warning is returned describing what happened.
    expect(resp.status).toBe(201);
    // The truncated 300 characters are still over the 280-character text
    // limit for publishing, so that is reported too, as an error.
    expect(resp.body.validationErrors).toEqual([
      {
        code: "custom",
        message:
          "Subtitle must be 280 characters or less, not counting formatting",
        path: ["subtitle"],
        severity: "error",
      },
      {
        code: "custom",
        message: "At least one contributor must be in the byline",
        path: ["contributors"],
        severity: "error",
      },
      {
        path: ["subtitle"],
        message: "Subtitle was truncated to 300 characters",
        severity: "warning",
      },
    ]);
    const { publicationId } = resp.body;

    const draftResp = await client.get(
      `/api/v1/publications/id/${publicationId}/draft`
    );
    expect(draftResp.status).toBe(200);
    expect(draftResp.body.publication.subtitle).toBe("a".repeat(300));
  });

  it("scopes my drafts to the requesting user, as RecentDraftsCard expects", async () => {
    const {
      client: ownerClient,
      user: owner,
      userId: ownerId,
    } = await registerUserWithId(makeUser("draftowner2"));
    await seedSiteAdmin(ownerId);
    await ownerClient.login(owner.username, owner.password);
    await ownerClient.post("/api/v1/publications").send({
      title: "Owner's Draft",
      abstract: "Owned by draftowner2.",
      body: "",
    });

    const { orgIdInt } = await seedOrg(
      "Arcadia Science",
      "arcadia-science-new-page"
    );
    const {
      client: otherClient,
      user: other,
      userId: otherId,
      userIds,
    } = await registerUserWithId(makeUser("draftother2"));
    await seedOrgMember(orgIdInt, userIds);
    await otherClient.login(other.username, other.password);
    await otherClient.post("/api/v1/publications").send({
      title: "Other User's Draft",
      abstract: "Owned by draftother2.",
      body: "",
    });
    expect(otherId).not.toBe(ownerId);

    const ownerDrafts = await ownerClient.get(
      "/api/v1/users/me/publications?state=draft&perPage=100"
    );
    expect(ownerDrafts.body.pagination.total).toBe(1);
    expect(ownerDrafts.body.items[0].title).toBe("Owner's Draft");

    const otherDrafts = await otherClient.get(
      "/api/v1/users/me/publications?state=draft&perPage=100"
    );
    expect(otherDrafts.body.pagination.total).toBe(1);
    expect(otherDrafts.body.items[0].title).toBe("Other User's Draft");
  });
});

const BODY = [
  "# Introduction",
  "",
  "See [](https://example.com/first-reference).",
  "",
  "## Methods",
  "",
  "### Not a section (depth 3)",
  "",
  ':::figure{type="image"}',
  "![](https://example.com/image.png)",
  ":::",
  "",
  "::::figure{type='video'}",
  "https://example.com/video.mp4",
  "::::",
  "",
  ":::figure{type=audio}",
  "https://example.com/audio.mp3",
  ":::",
  "",
  ':::figure{type="iframe"}',
  "https://example.com/embed",
  ":::",
  "",
  ':::figure{type="table"}',
  "| a | b |",
  "| - | - |",
  "| 1 | 2 |",
  ":::",
  "",
  ':::figure{type="image"}',
  "![](https://example.com/second-image.png)",
  ":::",
  "",
  ":::div{.bordered}",
  "## Not a section (inside a bordered box)",
  ":::",
  "",
  "## Results",
  "",
  "See [](https://example.com/second-reference).",
].join("\n");

async function createDraft(
  client: TestApiClient,
  fields: { abstract: string; body: string }
): Promise<string> {
  const resp = await client.post("/api/v1/publications").send({
    slug: "publication-stats-test",
    title: "Stats Pub",
    ...fields,
  });
  expect(resp.status).toBe(201);
  return resp.body.publicationId as string;
}

// References are extracted fire-and-forget after create/PATCH, so poll the
// draft until the expected citation count shows up.
async function getDraftWithCitations(
  client: TestApiClient,
  publicationId: string,
  citations: number,
  timeoutMs = 6000
) {
  const start = Date.now();
  for (;;) {
    const resp = await client.get(
      `/api/v1/publications/id/${publicationId}/draft`
    );
    expect(resp.status).toBe(200);
    if (
      resp.body.publication.stats.citations === citations ||
      Date.now() - start >= timeoutMs
    ) {
      return resp;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function siteAdminClient() {
  const { client, user, userId } = await registerUserWithId();
  await seedSiteAdmin(userId);
  await client.login(user.username, user.password);
  return client;
}

// The stats shown on the change/edit page (generateDocumentStats), returned by
// the draft GET and PATCH routes that page uses.
describe("publication stats on the draft", () => {
  it("counts sections, figures by type, and citations on the draft", async () => {
    const client = await siteAdminClient();
    const publicationId = await createDraft(client, {
      abstract: "An abstract.",
      body: BODY,
    });

    const resp = await getDraftWithCitations(client, publicationId, 2);

    expect(resp.body.publication.stats).toEqual({
      // Abstract + Introduction, Methods, Results. Depth-3 headings and
      // headings inside bordered boxes are not counted.
      sections: 4,
      audio: 1,
      images: 2,
      videos: 1,
      iframes: 1,
      tables: 1,
      citations: 2,
    });
  });

  it("returns zeroed stats for an empty draft", async () => {
    const client = await siteAdminClient();
    const publicationId = await createDraft(client, {
      abstract: "",
      body: "",
    });

    const resp = await client.get(
      `/api/v1/publications/id/${publicationId}/draft`
    );
    expect(resp.status).toBe(200);
    expect(resp.body.publication.stats).toEqual({
      sections: 0,
      audio: 0,
      images: 0,
      videos: 0,
      iframes: 0,
      tables: 0,
      citations: 0,
    });
  });

  it("reflects the updated body in the PATCH response", async () => {
    const client = await siteAdminClient();
    const publicationId = await createDraft(client, {
      abstract: "",
      body: "# Only section",
    });

    const patchResp = await client
      .patch(`/api/v1/publications/id/${publicationId}`)
      .send({
        abstract: "Now with an abstract.",
        body: [
          "# One",
          "",
          "## Two",
          "",
          ':::figure{type="table"}',
          "| a |",
          "| - |",
          ":::",
        ].join("\n"),
      });
    expect(patchResp.status).toBe(200);
    expect(patchResp.body.publication.stats).toMatchObject({
      sections: 3,
      images: 0,
      tables: 1,
    });
  });
});
