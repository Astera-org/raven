import { escape } from "mysql2";
import { assert, describe, expect, it } from "vitest";
import { type ValidationIssue } from "../../../../backend-ts/dist/lib/middleware/validation-errors.js";
import {
  execute,
  expectValidationError,
  getUserId,
  getUserIds,
  loggedInUser,
  makeUser,
  PERMISSION_DENIED,
  query,
  registerUser,
  registerUserWithId,
  seedOrg,
  seedOrgMember,
  seedPublication,
  seedSiteAdmin,
  TestApiClient,
  UNAUTHENTICATED,
  waitForRows,
  type RouteCase,
} from "./helpers.js";

async function seedPublishedV1(opts: {
  slug: string;
  ownerId: number;
  title?: string;
  subtitle?: string;
  abstract?: string;
  body?: string;
  versionDesc?: string;
}) {
  const pub = await execute(
    `INSERT INTO publications (slug, owner_id_int, state, latest_version_number) VALUES ('${opts.slug}', ${opts.ownerId}, 'PUBLISHED', 1)`
  );
  const pubIds = await query<{ id: string }>(
    `SELECT id FROM publications WHERE id_int = ${pub.insertId}`
  );
  const version = await execute(
    `INSERT INTO versions (publication_id_int, version_number, title, subtitle, abstract, body, version_desc, state) VALUES (${pub.insertId}, 1, '${opts.title ?? "Published Title"}', '${opts.subtitle ?? "Published Subtitle"}', '${opts.abstract ?? "Published abstract."}', '${opts.body ?? "Published body."}', '${opts.versionDesc ?? "Initial release."}', 'PUBLISHED')`
  );
  const versionsIds = await query<{ id: string }>(
    `SELECT id FROM versions WHERE id_int = ${version.insertId}`
  );

  assert(pubIds[0]?.id != undefined, "publication id unexpectedly undefined");
  assert(
    versionsIds[0]?.id != undefined,
    "publication id unexpectedly undefined"
  );

  return {
    pubId: pub.insertId,
    pubIdUlid: pubIds[0].id,
    versionId: version.insertId,
    versionIdUlid: versionsIds[0].id,
  };
}

async function seedDeletedMultiVersion(opts: {
  slug: string;
  ownerId: number;
}) {
  const pub = await execute(
    `INSERT INTO publications (slug, owner_id_int, doi, state, latest_version_number) VALUES (${escape(opts.slug)}, ${opts.ownerId}, ${escape(`10.1234/${opts.slug}`)}, 'DELETED', 2)`
  );
  const pubIds = await query<{ id: string }>(
    `SELECT id FROM publications WHERE id_int = ${pub.insertId}`
  );
  const pubIdStr = pubIds[0]!.id;
  await execute(
    `INSERT INTO versions (publication_id, publication_id_int, version_number, title, subtitle, abstract, body, version_desc, state) VALUES (${escape(pubIdStr)}, ${pub.insertId}, 1, 'Deleted V1 Title', 'Deleted V1 Subtitle', 'Deleted V1 abstract.', 'Deleted V1 body.', 'First deleted release.', 'PUBLISHED')`
  );
  await execute(
    `INSERT INTO versions (publication_id, publication_id_int, version_number, title, subtitle, abstract, body, version_desc, state) VALUES (${escape(pubIdStr)}, ${pub.insertId}, 2, 'Deleted V2 Title', 'Deleted V2 Subtitle', 'Deleted V2 abstract.', 'Deleted V2 body.', 'Latest deleted release.', 'PUBLISHED')`
  );
  return pub.insertId;
}

const UNKNOWN_ULID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

// The subjects in the column default migration 0030 gives every publication.
const DEFAULT_SUBJECTS = [
  {
    subject: "FOS: Biological sciences",
    subjectScheme: "Fields of Science and Technology (FOS)",
  },
];

async function storedDoiMetadata(publicationId: string) {
  const [row] = await query<{ doi_metadata: unknown }>(
    `SELECT doi_metadata FROM publications WHERE id = ${escape(publicationId)}`
  );
  return row?.doi_metadata;
}

async function addBylineAuthor(
  client: TestApiClient,
  publicationId: string,
  userId: string
) {
  const resp = await client
    .patch(`/api/v1/publications/id/${publicationId}/draft`)
    .send({
      contributors: [
        { userId, roles: ["author"], inByline: true, affiliations: [] },
      ],
    });
  expect(resp.status).toBe(200);
  expect(resp.body.applied).toContain("contributors");
}

describe("/api/v1/publications", () => {
  it("lists publications", async () => {
    let resp = await new TestApiClient().get("/api/v1/publications");
    expect(resp.status).toBe(200);
    expect(resp.body.items).toBeDefined();

    const { client, userId } = await registerUserWithId();
    await seedPublication({
      slug: "listed-new-pub",
      ownerId: userId,
      state: "PUBLISHED",
      title: "Published Article",
    });
    resp = await client.get("/api/v1/publications");
    expect(resp.status).toBe(200);
    expect(resp.body.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it("searches publications by title and by contributor name", async () => {
    const { client, userId } = await registerUserWithId(makeUser("zephyrine"));
    await seedPublication({
      slug: "searchable-pub",
      ownerId: userId,
      state: "PUBLISHED",
      title: "Quokka Husbandry",
    });

    const slugsFor = async (q: string): Promise<string[]> => {
      const resp = await client.get(`/api/v1/publications?q=${q}`);
      expect(resp.status, resp.text).toBe(200);
      return resp.body.items.map((item: { slug: string }) => item.slug);
    };

    expect(await slugsFor("quokka")).toContain("searchable-pub");
    expect(await slugsFor("zephyrine")).toContain("searchable-pub");
    expect(await slugsFor("zephyr")).toContain("searchable-pub");
    expect(await slugsFor("quetzalcoatlus")).not.toContain("searchable-pub");
  });

  it("never lists or searches drafts or deleted publications", async () => {
    const { userId } = await registerUserWithId();
    await seedPublishedV1({
      slug: "public-quokka",
      ownerId: userId,
      title: "Quokka Husbandry",
    });
    const draft = await seedPublication({
      slug: "secret-quokka-draft",
      ownerId: userId,
      state: "DRAFT",
      title: "Quokka Draft",
    });
    await execute(
      `UPDATE versions SET body = 'Embargoedterm results.' WHERE id_int = ${draft.versionIdInt}`
    );
    await seedDeletedMultiVersion({ slug: "deleted-quokka", ownerId: userId });

    // The list is public, so check it as an anonymous caller.
    const anonymous = new TestApiClient();
    const listFor = async (q?: string) => {
      const path = q
        ? `/api/v1/publications?q=${encodeURIComponent(q)}`
        : "/api/v1/publications";
      const resp = await anonymous.get(path);
      expect(resp.status, resp.text).toBe(200);
      return {
        slugs: resp.body.items.map((item: { slug: string }) => item.slug),
        total: resp.body.pagination.total,
      };
    };

    expect(await listFor()).toEqual({ slugs: ["public-quokka"], total: 1 });
    expect(await listFor("quokka")).toEqual({
      slugs: ["public-quokka"],
      total: 1,
    });
    // Words that appear only in the draft's body or the deleted versions
    // must not match: the search covers version bodies.
    expect(await listFor("embargoedterm")).toEqual({ slugs: [], total: 0 });
    expect(await listFor("deleted")).toEqual({ slugs: [], total: 0 });
  });

  it("gets published publications by slug", async () => {
    const { client, userId, userIds } = await registerUserWithId();
    await seedPublication({
      slug: "get-me-new-pub",
      ownerId: userId,
      state: "PUBLISHED",
    });

    const resp = await client.get("/api/v1/publications/p/get-me-new-pub");
    expect(resp.status).toBe(200);
    // Comment counts are admin-only: the public response counts no comments,
    // since the public comments API hides some states.
    expect(resp.body.publication).not.toHaveProperty("commentsCount");
    // Usernames are admin-only.
    expect(resp.body.publication.contributors).toEqual([
      expect.objectContaining({ userId: userIds.id }),
    ]);
    expect(resp.body.publication.contributors[0]).not.toHaveProperty(
      "username"
    );
    expect(
      (await client.get("/api/v1/publications/p/does-not-exist")).status
    ).toBe(404);
  });

  it("gets latest version for deleted publications regardless of requested version", async () => {
    const { client, userId } = await registerUserWithId();
    await seedDeletedMultiVersion({
      slug: "deleted-multi-version",
      ownerId: userId,
    });

    for (const path of [
      "/api/v1/publications/p/deleted-multi-version",
      "/api/v1/publications/p/deleted-multi-version/versions/v1",
      "/api/v1/publications/p/deleted-multi-version/versions/v999",
    ]) {
      const resp = await client.get(path);
      expect(resp.status).toBe(200);
      expect(resp.body.publication.state).toBe("DELETED");
      expect(resp.body.publication.versionNumber).toBe(2);
      expect(resp.body.publication.title).toBe("Deleted V2 Title");
    }
  });

  it("allows anonymous users to view a deleted publication's latest version", async () => {
    const { userId: ownerId } = await registerUserWithId(
      makeUser("deletedpubowner")
    );
    await seedDeletedMultiVersion({
      slug: "deleted-anon-view",
      ownerId,
    });

    const anonClient = new TestApiClient();
    for (const path of [
      "/api/v1/publications/p/deleted-anon-view",
      "/api/v1/publications/p/deleted-anon-view/versions/v1",
    ]) {
      const resp = await anonClient.get(path);
      expect(resp.status).toBe(200);
      expect(resp.body.publication.state).toBe("DELETED");
      expect(resp.body.publication.versionNumber).toBe(2);
      expect(resp.body.publication.title).toBe("Deleted V2 Title");
    }
  });

  it("returns 404 for deleted publications without a DOI", async () => {
    const { client, userId } = await registerUserWithId();
    await seedPublication({
      slug: "deleted-without-doi",
      ownerId: userId,
      state: "DELETED",
    });

    for (const path of [
      "/api/v1/publications/p/deleted-without-doi",
      "/api/v1/publications/p/deleted-without-doi.json",
      "/api/v1/publications/p/deleted-without-doi.md",
      "/api/v1/publications/p/deleted-without-doi/versions/v1",
      "/api/v1/publications/p/deleted-without-doi/versions/v1.json",
      "/api/v1/publications/p/deleted-without-doi/versions/v1.md",
    ]) {
      expect((await client.get(path)).status).toBe(404);
    }
  });

  it("creates publications for site admins and Arcadia members", async () => {
    const {
      client: adminClient,
      user: admin,
      userId: adminId,
    } = await registerUserWithId();
    await seedSiteAdmin(adminId);
    await adminClient.login(admin.username, admin.password);
    const adminResp = await adminClient.post("/api/v1/publications").send({
      slug: "brand-new-pub",
      title: "Brand New",
      abstract: "Abstract text.",
      body: "",
    });
    expect(adminResp.status).toBe(201);
    expect(adminResp.body.slug).toBe("brand-new-pub");
    expect(adminResp.body.slug).toBe("brand-new-pub");

    const {
      client: memberClient,
      user: member,
      userIds: memberIds,
    } = await registerUserWithId(makeUser("member"));
    const { orgIdInt: orgId } = await seedOrg(
      "Arcadia Science",
      "arcadia-science"
    );
    await seedOrgMember(orgId, memberIds);
    await memberClient.login(member.username, member.password);
    const res = await memberClient.post("/api/v1/publications").send({
      slug: "org-pub-arcadia",
      title: "Org Pub",
      abstract: "From an org member.",
      body: "",
    });
    expect(res.status).toBe(201);
  });

  it("updates and deletes drafts only for owners", async () => {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    const { id: editableId } = await seedPublication({
      slug: "editable-pub",
      ownerId: userId,
      state: "DRAFT",
    });
    const { id: deletableId } = await seedPublication({
      slug: "deletable-pub",
      ownerId: userId,
      state: "DRAFT",
    });
    await client.login(user.username, user.password);

    const patchResp = await client
      .patch(`/api/v1/publications/id/${editableId}/draft`)
      .send({
        title: "Edited Title",
        abstract: "Updated abstract",
        body: "Updated body text.",
      });
    expect(patchResp.status).toBe(200);
    expect(patchResp.body.publication.title).toBe("Edited Title");
    expect(
      (await client.delete(`/api/v1/publications/id/${deletableId}/draft`))
        .status
    ).toBe(204);
    expect(
      (await client.get(`/api/v1/publications/id/${deletableId}/draft`)).status
    ).toBe(404);

    const { id: notMineId } = await seedPublication({
      slug: "not-mine-pub",
      ownerId: userId,
      state: "DRAFT",
    });
    const otherClient = new TestApiClient();
    const other = await registerUser(otherClient, makeUser("other"));
    await otherClient.login(other.username, other.password);
    expect(
      (
        await otherClient
          .patch(`/api/v1/publications/id/${notMineId}/draft`)
          .send({ title: "Hijack" })
      ).status
    ).toBe(403);
    expect(
      (await otherClient.delete(`/api/v1/publications/id/${notMineId}/draft`))
        .status
    ).toBe(403);
  });

  it("allows site admins, but not unrelated users, to view drafts", async () => {
    const { userId: ownerId } = await registerUserWithId(
      makeUser("draftowner")
    );
    const { id: publicationId } = await seedPublication({
      slug: "admin-visible-draft",
      ownerId,
      state: "DRAFT",
    });

    const {
      client: adminClient,
      user: admin,
      userId: adminId,
    } = await registerUserWithId(makeUser("draftadmin"));
    await seedSiteAdmin(adminId);
    await adminClient.login(admin.username, admin.password);

    const adminResp = await adminClient.get(
      `/api/v1/publications/id/${publicationId}/draft`
    );
    expect(adminResp.status).toBe(200);
    expect(adminResp.body.publication.slug).toBe("admin-visible-draft");

    const otherClient = new TestApiClient();
    const other = await registerUser(otherClient, makeUser("draftstranger"));
    await otherClient.login(other.username, other.password);

    expect(
      (await otherClient.get(`/api/v1/publications/id/${publicationId}/draft`))
        .status
    ).toBe(403);
    expect(
      (
        await new TestApiClient().get(
          `/api/v1/publications/id/${publicationId}/draft`
        )
      ).status
    ).toBe(401);
  });

  it("sets tags and contributors", async () => {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    const { id: publicationId } = await seedPublication({
      slug: "tagged-new-pub",
      ownerId: userId,
      state: "DRAFT",
    });
    const contrib = await registerUser(
      new TestApiClient(),
      makeUser("contrib")
    );
    await client.login(user.username, user.password);

    const patchResp = await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({
        tags: ["biology", "chemistry"],
        contributors: [
          {
            userId: contrib.id,
            roles: ["author"],
            inByline: true,
            affiliations: [],
          },
        ],
      });
    expect(patchResp.status).toBe(200);
    expect(patchResp.body.applied).toEqual(
      expect.arrayContaining(["tags", "contributors"])
    );

    const draft = await client.get(
      `/api/v1/publications/id/${publicationId}/draft`
    );
    expect(draft.status).toBe(200);
    expect([...draft.body.publication.tags].sort()).toEqual([
      "biology",
      "chemistry",
    ]);
    expect(draft.body.publication.contributors).toEqual([
      expect.objectContaining({
        userId: contrib.id,
        roles: ["author"],
        inByline: true,
      }),
    ]);
  });

  it("creates, updates, preserves, and clears embed URLs", async () => {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);

    const createResp = await client.post("/api/v1/publications").send({
      slug: "embed-create",
      title: "Embed Test",
      abstract: "Testing embed fields.",
      body: "",
      feedbackFormEmbedSrc: "https://example.com/form",
      socialPostsEmbedSrc: "https://example.com/posts",
    });
    expect(createResp.status).toBe(201);
    const { publicationId } = createResp.body;
    const getDraft = async () =>
      (await client.get(`/api/v1/publications/id/${publicationId}/draft`)).body
        .publication;

    let pub = await getDraft();
    expect(pub.feedbackFormEmbedSrc).toBe("https://example.com/form");
    expect(pub.socialPostsEmbedSrc).toBe("https://example.com/posts");

    expect(
      (
        await client
          .patch(`/api/v1/publications/id/${publicationId}/draft`)
          .send({
            feedbackFormEmbedSrc: "https://example.com/new-form",
            socialPostsEmbedSrc: "https://example.com/new-posts",
          })
      ).status
    ).toBe(200);
    pub = await getDraft();
    expect(pub.feedbackFormEmbedSrc).toBe("https://example.com/new-form");
    expect(pub.socialPostsEmbedSrc).toBe("https://example.com/new-posts");

    expect(
      (
        await client
          .patch(`/api/v1/publications/id/${publicationId}/draft`)
          .send({ title: "Changed Title" })
      ).status
    ).toBe(200);
    pub = await getDraft();
    expect(pub.feedbackFormEmbedSrc).toBe("https://example.com/new-form");

    expect(
      (
        await client
          .patch(`/api/v1/publications/id/${publicationId}/draft`)
          .send({
            feedbackFormEmbedSrc: "",
            socialPostsEmbedSrc: "",
          })
      ).status
    ).toBe(200);
    pub = await getDraft();
    expect(pub.feedbackFormEmbedSrc).toBeNull();
    expect(pub.socialPostsEmbedSrc).toBeNull();
  });

  it("rejects non-https embed URLs", async () => {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);

    const badCreate = await client.post("/api/v1/publications").send({
      slug: "embed-bad-proto",
      title: "Bad Proto",
      abstract: "Abstract.",
      body: "",
      feedbackFormEmbedSrc: "http://example.com/form",
    });
    expect(badCreate.status).toBe(201);
    expect(
      badCreate.body.validationErrors?.find(
        (ve: ValidationIssue) => ve.path[0] === "feedbackFormEmbedSrc"
      )
    ).toBeDefined();

    const { publicationId } = (
      await client.post("/api/v1/publications").send({
        slug: "embed-good-proto",
        title: "Good Proto",
        abstract: "Abstract.",
        body: "",
      })
    ).body;
    const badUpdate = await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({ socialPostsEmbedSrc: "javascript:alert(1)" });
    expect(
      badUpdate.body.validationErrors?.find(
        (ve: ValidationIssue) => ve.path[0] === "socialPostsEmbedSrc"
      )
    ).toBeDefined();
  });
});

// @todo v1 has no route yet for creating a new draft from the latest published
// version (v0's POST /:slug/draft). See the @todo in patch-publication.ts.
/**
 * Seeds linked assets, a reference, and a contributor affiliation on the given
 * version so tests can assert they carry over to a new draft.
 */
async function seedVersionExtras(opts: {
  pubId: number;
  versionId: number;
  ownerId: number;
}) {
  await execute(
    `INSERT INTO linked_assets (version_id_int, type, url, name) VALUES (${opts.versionId}, 'dataset', 'https://example.com/data.csv', 'Dataset')`
  );
  const reference = await execute(
    "INSERT INTO `references` (url, text) VALUES ('https://doi.org/10.1234/ref', 'A reference')"
  );
  await execute(
    `INSERT INTO version_references (version_id_int, reference_id_int) VALUES (${opts.versionId}, ${reference.insertId})`
  );
  const { orgIdInt: orgId } = await seedOrg(
    "Arcadia Science",
    "arcadia-science"
  );
  await execute(
    `INSERT INTO contributors (version_id_int, user_id_int, roles, in_byline, priority) VALUES (${opts.versionId}, ${opts.ownerId}, '["author"]', TRUE, 1)`
  );
  await execute(
    `INSERT INTO contributor_affiliations (version_id_int, user_id_int, affiliated_org_id_int) VALUES (${opts.versionId}, ${opts.ownerId}, ${orgId})`
  );
}

async function draftRows(pubId: number) {
  return query<{ id: string; version_number: number }>(
    `SELECT id, version_number FROM versions WHERE publication_id_int = ${pubId} AND state = 'DRAFT'`
  );
}

describe.each([
  {
    route: "POST /api/v1/publications/p/:slug/draft",
    draftPath: (ids: { slug: string; pubIdUlid: string }) =>
      `/api/v1/publications/p/${ids.slug}/draft`,
    missingPath: "/api/v1/publications/p/does-not-exist/draft",
  },
  {
    route: "POST /api/v1/publications/id/:id/draft",
    draftPath: (ids: { slug: string; pubIdUlid: string }) =>
      `/api/v1/publications/id/${ids.pubIdUlid}/draft`,
    missingPath: `/api/v1/publications/id/${UNKNOWN_ULID}/draft`,
  },
])("$route", ({ draftPath, missingPath }) => {
  it("creates a draft from the latest version, then returns it on repeat calls", async () => {
    const { client, user, userId: ownerId } = await registerUserWithId();
    const slug = "based-on-latest";
    const { pubId, pubIdUlid, versionId } = await seedPublishedV1({
      slug,
      ownerId,
      title: "V1 Title",
      subtitle: "V1 Subtitle",
      abstract: "V1 Abstract",
      body: "V1 Body",
    });
    await seedVersionExtras({ pubId, versionId, ownerId });
    await client.login(user.username, user.password);

    const first = await client.post(draftPath({ slug, pubIdUlid }));
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ publicationId: pubIdUlid, slug });

    const rows = await draftRows(pubId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(first.body.versionId);
    expect(rows[0]!.version_number).toBe(2);

    // The edit page loads the new draft by publication id next.
    const draftResp = await client.get(
      `/api/v1/publications/id/${pubIdUlid}/draft`
    );
    expect(draftResp.status).toBe(200);
    const draft = draftResp.body.publication;
    expect(draft).toMatchObject({
      title: "V1 Title",
      subtitle: "V1 Subtitle",
      abstract: "V1 Abstract",
      body: "V1 Body",
      versionNumber: 2,
    });
    expect(draft.linkedAssets).toEqual([
      { type: "dataset", url: "https://example.com/data.csv", name: "Dataset" },
    ]);
    expect(draft.references).toEqual([
      { url: "https://doi.org/10.1234/ref", text: "A reference" },
    ]);
    expect(draft.contributors[0].affiliations[0].slug).toBe("arcadia-science");

    const second = await client.post(draftPath({ slug, pubIdUlid }));
    expect(second.status).toBe(200);
    expect(second.body.versionId).toBe(first.body.versionId);
    expect(await draftRows(pubId)).toHaveLength(1);
  });

  it("numbers the draft after the highest existing version", async () => {
    const { client, user, userId: ownerId } = await registerUserWithId();
    const slug = "multi-version";
    const { pubId, pubIdUlid } = await seedPublishedV1({ slug, ownerId });
    await execute(
      `INSERT INTO versions (publication_id, publication_id_int, version_number, title, body, state) VALUES (${escape(pubIdUlid)}, ${pubId}, 2, 'V2 Title', 'V2 Body', 'PUBLISHED')`
    );
    await execute(
      `UPDATE publications SET latest_version_number = 2 WHERE id_int = ${pubId}`
    );
    await client.login(user.username, user.password);

    const resp = await client.post(draftPath({ slug, pubIdUlid }));
    expect(resp.status).toBe(201);

    const rows = await draftRows(pubId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.version_number).toBe(3);

    const draftResp = await client.get(
      `/api/v1/publications/id/${pubIdUlid}/draft`
    );
    expect(draftResp.body.publication.title).toBe("V2 Title");
  });

  it("returns 404 for an unknown publication", async () => {
    const { client, user } = await registerUserWithId();
    await client.login(user.username, user.password);
    expect((await client.post(missingPath)).status).toBe(404);
  });

  it("creates a draft for a deleted publication, so it can be republished", async () => {
    const { client, user, userId: ownerId } = await registerUserWithId();
    const slug = "deleted-draft";
    const { pubId, pubIdUlid } = await seedPublishedV1({ slug, ownerId });
    await execute(
      `UPDATE publications SET state = 'DELETED' WHERE id_int = ${pubId}`
    );
    await client.login(user.username, user.password);

    expect((await client.post(draftPath({ slug, pubIdUlid }))).status).toBe(
      201
    );
    const rows = await draftRows(pubId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.version_number).toBe(2);
  });

  it("returns 404 when latest_version_number points at a missing version", async () => {
    const { client, user, userId: ownerId } = await registerUserWithId();
    const slug = "orphan";
    await execute(
      `INSERT INTO publications (slug, owner_id_int, state, latest_version_number) VALUES ('${slug}', ${ownerId}, 'PUBLISHED', 1)`
    );
    const [pub] = await query<{ id: string }>(
      `SELECT id FROM publications WHERE slug = '${slug}'`
    );
    await client.login(user.username, user.password);

    expect(
      (await client.post(draftPath({ slug, pubIdUlid: pub!.id }))).status
    ).toBe(404);
  });
});

describe("POST /api/v1/publications/id/:id/versions", () => {
  it.each([
    {
      scenario: "supplied note replaces the draft description",
      draftDescription: "Description saved while drafting.",
      note: "Final description supplied when publishing.",
      expected: "Final description supplied when publishing.",
    },
    {
      scenario: "null note preserves the draft description",
      draftDescription: "Description saved while drafting.",
      note: null,
      expected: "Description saved while drafting.",
    },
    {
      scenario: "omitted note preserves the draft description",
      draftDescription: "Description saved while drafting.",
      note: undefined,
      expected: "Description saved while drafting.",
    },
    {
      scenario: "null note and null draft description remain null",
      draftDescription: null,
      note: null,
      expected: null,
    },
    {
      scenario: "omitted note allows a null draft description",
      draftDescription: null,
      note: undefined,
      expected: null,
    },
  ])(
    "publish version description: $scenario",
    async ({ draftDescription, note, expected }) => {
      const { client, user, userId, userIds } = await registerUserWithId();
      await seedSiteAdmin(userId);
      await client.login(user.username, user.password);

      const slug = "publish-note-description";
      const createResp = await client.post("/api/v1/publications").send({
        slug,
        title: "Publish Note Test",
        abstract: "Abstract text.",
        body: "Body text.",
        ...(draftDescription === null ? {} : { versionDesc: draftDescription }),
      });
      expect(createResp.status).toBe(201);
      const { publicationId } = createResp.body;
      const draftResp = await client.get(
        `/api/v1/publications/id/${publicationId}/draft`
      );
      expect(draftResp.status).toBe(200);
      expect(draftResp.body.publication.versionDesc).toBe(draftDescription);
      await addBylineAuthor(client, publicationId, userIds.id);

      const publishResp = await client
        .post(`/api/v1/publications/id/${publicationId}/versions`)
        .send(note === undefined ? {} : { note });
      expect(publishResp.status, publishResp.text).toBe(201);
      expect(publishResp.body).toMatchObject({
        versionNumber: 1,
        state: "PUBLISHED",
      });

      const versionRows = await query<{
        state: string;
        version_desc: string | null;
      }>(
        `SELECT state, version_desc FROM versions WHERE publication_id = ${escape(publicationId)} AND version_number = 1`
      );
      expect(versionRows).toHaveLength(1);
      expect(versionRows[0]!.state).toBe("PUBLISHED");
      expect(versionRows[0]!.version_desc).toBe(expected);
    }
  );

  it("rejects a note of empty string", async () => {
    const { client, user, userId, userIds } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);

    const createResp = await client.post("/api/v1/publications").send({
      slug: "publish-bad-note",
      title: "Publish Bad Note",
      abstract: "Abstract text.",
      body: "Body text.",
    });
    expect(createResp.status).toBe(201);
    const { publicationId } = createResp.body;
    await addBylineAuthor(client, publicationId, userIds.id);

    const publishResp = await client
      .post(`/api/v1/publications/id/${publicationId}/versions`)
      .send({ note: "" });
    expect(publishResp.status).toBe(422);
    expect(publishResp.body.errors[0].path).toEqual(["note"]);
  });

  it("publishes a brand-new draft (version 1)", async () => {
    const { client, user, userId, userIds } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);

    // TODO slug should only need to be 12 characters
    // const slug =  "publish-me-v1",
    const slug = "publish-me-v1-aaaa";
    const createResp = await client.post("/api/v1/publications").send({
      slug,
      title: "Publish Me",
      abstract: "Abstract text.",
      body: "Body text.",
    });
    expect(createResp.status).toBe(201);
    const { publicationId } = createResp.body;

    // Publishing requires at least one byline contributor.
    await addBylineAuthor(client, publicationId, userIds.id);

    const publishResp = await client.post(
      `/api/v1/publications/id/${publicationId}/versions`
    );
    expect(publishResp.status).toBe(201);
    expect(publishResp.body).toMatchObject({
      publicationId,
      slug,
      versionNumber: 1,
      state: "PUBLISHED",
    });
    const location = `/api/v1/publications/id/${publicationId}/versions/v1`;
    expect(publishResp.headers.location).toBe(location);
    expect((await client.get(location)).status).toBe(200);

    const pubRows = await query<{
      state: string;
      latest_version_number: number;
    }>(
      `SELECT state, latest_version_number FROM publications WHERE id = ${escape(publicationId)}`
    );
    expect(pubRows[0]!.state).toBe("PUBLISHED");
    expect(pubRows[0]!.latest_version_number).toBe(1);

    const versionRows = await query<{ state: string }>(
      `SELECT state FROM versions WHERE publication_id = ${escape(publicationId)} AND version_number = 1`
    );
    expect(versionRows[0]!.state).toBe("PUBLISHED");

    // No draft remains once it's been published.
    expect(
      (await client.get(`/api/v1/publications/id/${publicationId}/draft`))
        .status
    ).toBe(404);
  });

  // @todo Notification fan-out on publish isn't ported to v1 yet (see the
  // @todo in post-publish.ts).
  it("notifies followers when a new publication is published", async () => {
    const { client, user, userId, userIds } = await registerUserWithId(
      makeUser("pubnotifyowner")
    );
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);

    const followerClient = new TestApiClient();
    const follower = await registerUser(
      followerClient,
      makeUser("pubnotifyfollow")
    );
    const followerIds = await getUserIds(follower.username);
    await execute(
      `INSERT INTO followers (leader_id_int, leader_id, follower_id_int, follower_id) VALUES (${userIds.id_int}, ${escape(userIds.id)}, ${followerIds.id_int}, ${escape(followerIds.id)})`
    );

    const createResp = await client.post("/api/v1/publications").send({
      slug: "publish-notify-followers",
      title: "Notify Followers",
      abstract: "Abstract text.",
      body: "Body text.",
    });
    expect(createResp.status).toBe(201);
    const { publicationId } = createResp.body;
    await addBylineAuthor(client, publicationId, userIds.id);

    const publishResp = await client.post(
      `/api/v1/publications/id/${publicationId}/versions`
    );
    expect(publishResp.status).toBe(201);

    const notifyRows = await waitForRows<{
      message: string;
      state: string;
      seen: number;
    }>(
      `SELECT message, state, seen FROM notifications WHERE user_id = ${escape(followerIds.id)} AND publication_id = ${escape(publicationId)}`
    );
    expect(notifyRows.length).toBe(1);
    expect(notifyRows[0]).toMatchObject({
      state: "NEW_PUBLICATION",
      seen: 0,
    });
    expect(notifyRows[0]!.message).toContain("just published something new");
  });

  it("publishes a new draft version, bumping versionNumber and latest_version_number", async () => {
    const {
      client,
      user,
      userId: ownerId,
      userIds,
    } = await registerUserWithId();
    const { pubId, pubIdUlid } = await seedPublishedV1({
      slug: "publish-v2-draft",
      ownerId,
      title: "V1 Title",
      body: "V1 body",
    });
    // Seeded directly so this test covers publishing in isolation.
    await execute(
      `INSERT INTO versions (publication_id_int, version_number, title, body, state) VALUES (${pubId}, 2, 'V2 Title', 'V2 body', 'DRAFT')`
    );
    await client.login(user.username, user.password);

    // Publishing requires at least one byline contributor.
    await addBylineAuthor(client, pubIdUlid, userIds.id);

    const noNoteResp = await client.post(
      `/api/v1/publications/id/${pubIdUlid}/versions`
    );
    expect(noNoteResp.status).toBe(422);

    const publishResp = await client
      .post(`/api/v1/publications/id/${pubIdUlid}/versions`)
      .send({ note: "New version achieved!" });
    expect(publishResp.status).toBe(201);
    expect(publishResp.body.versionNumber).toBe(2);

    const pubRows = await query<{ latest_version_number: number }>(
      `SELECT latest_version_number FROM publications WHERE id = ${escape(pubIdUlid)}`
    );
    expect(pubRows[0]!.latest_version_number).toBe(2);
  });

  it("requires a title and body before publishing", async () => {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);

    // abstract alone satisfies the create-time "title, abstract, or body" check,
    // leaving title/body empty for the publish-time check to catch.
    const createResp = await client.post("/api/v1/publications").send({
      slug: "incomplete-pub",
      abstract: "Only an abstract, no title or body.",
      body: "",
    });
    expect(createResp.status).toBe(201);

    const publishResp = await client.post(
      `/api/v1/publications/id/${createResp.body.publicationId}/versions`
    );
    expect(publishResp.status).toBe(422);
    expect(publishResp.body.error).toContain(
      "Invalid input: expected string, received null"
    );
  });

  it("returns 404 when there is no draft to publish", async () => {
    const { client, user, userId: ownerId } = await registerUserWithId();
    const { pubIdUlid } = await seedPublishedV1({
      slug: "already-published",
      ownerId,
    });
    await client.login(user.username, user.password);

    const resp = await client.post(
      `/api/v1/publications/id/${pubIdUlid}/versions`
    );
    expect(resp.status).toBe(404);
    expect(resp.body.errors).toStrictEqual({
      draft: { message: "No draft found" },
    });
  });
});

describe("PATCH /api/v1/publications/id/:id/draft linkedAssets", () => {
  it("replaces (not appends) the draft's linked assets", async () => {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);
    const { publicationId } = (
      await client.post("/api/v1/publications").send({
        slug: "draft-assets-pub",
        title: "Assets Pub",
        abstract: "Abstract.",
        body: "",
      })
    ).body;
    const patchAssets = (linkedAssets: unknown[]) =>
      client
        .patch(`/api/v1/publications/id/${publicationId}/draft`)
        .send({ linkedAssets });
    const getAssets = async () =>
      (await client.get(`/api/v1/publications/id/${publicationId}/draft`)).body
        .publication.linkedAssets;

    const setResp = await patchAssets([
      {
        type: "dataset",
        url: "https://example.com/data.csv",
        name: "Dataset",
      },
      { type: "code", url: "https://github.com/example/repo" },
    ]);
    expect(setResp.status).toBe(200);
    expect(setResp.body.applied).toContain("linkedAssets");

    // No ORDER BY on the backend's linked_assets query, so assert as a set, not by index.
    const assets = await getAssets();
    expect(assets).toHaveLength(2);
    expect(assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "dataset",
          url: "https://example.com/data.csv",
          name: "Dataset",
        }),
        expect.objectContaining({
          type: "code",
          url: "https://github.com/example/repo",
        }),
      ])
    );

    expect(
      (
        await patchAssets([
          { type: "dataset", url: "https://example.com/v2.csv", name: "V2" },
        ])
      ).status
    ).toBe(200);
    const replaced = await getAssets();
    expect(replaced).toHaveLength(1);
    expect(replaced[0].url).toBe("https://example.com/v2.csv");

    // Empty list clears all assets.
    expect((await patchAssets([])).status).toBe(200);
    expect(await getAssets()).toHaveLength(0);
  });

  it("returns 404 when there is no draft version", async () => {
    const { client, user, userId: ownerId } = await registerUserWithId();
    const { pubIdUlid } = await seedPublishedV1({
      slug: "no-draft-assets",
      ownerId,
    });
    await client.login(user.username, user.password);

    const resp = await client
      .patch(`/api/v1/publications/id/${pubIdUlid}/draft`)
      .send({
        linkedAssets: [{ type: "dataset", url: "https://example.com/x.csv" }],
      });
    expect(resp.status).toBe(404);
  });
});

describe("PATCH /api/v1/publications/id/:id/draft orgs", () => {
  it("adds and removes an org association, idempotently", async () => {
    const { client, user, userId, userIds } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);
    const { publicationId } = (
      await client.post("/api/v1/publications").send({
        slug: "org-linked-pub",
        title: "Org Linked",
        abstract: "Abstract.",
        body: "",
      })
    ).body;
    const { orgIdInt, orgId } = await seedOrg("Radial", "radial-org-slug");
    // Once a publication is mapped to an org, canEdit requires the actor to be an
    // org_user_map member of that org (even for the owner) — mirroring how the UI's
    // candidate-orgs list only ever offers orgs the user already belongs to.
    await seedOrgMember(orgIdInt, userIds);
    const patchOrgs = (orgs: { orgId: string }[]) =>
      client
        .patch(`/api/v1/publications/id/${publicationId}/draft`)
        .send({ orgs });
    const countMappings = async () =>
      (
        await query(
          `SELECT 1 FROM org_publication_map WHERE org_id = ${escape(orgId)}`
        )
      ).length;

    const addResp = await patchOrgs([{ orgId }]);
    expect(addResp.status).toBe(200);
    expect(addResp.body.publication.orgs).toEqual([
      expect.objectContaining({ orgId, slug: "radial-org-slug" }),
    ]);
    expect(await countMappings()).toBe(1);

    // Sending the same org again is idempotent (no duplicate mapping).
    expect((await patchOrgs([{ orgId }])).status).toBe(200);
    expect(await countMappings()).toBe(1);

    expect((await patchOrgs([])).status).toBe(200);
    expect(await countMappings()).toBe(0);
  });

  async function createDraftWithThreeOrgs(slug: string) {
    const { client, user, userId, userIds } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);
    const { publicationId } = (
      await client.post("/api/v1/publications").send({
        slug,
        title: "Org Priorities",
        abstract: "Abstract.",
        body: "",
      })
    ).body;
    const seedMemberOrg = async (name: string) => {
      const { orgIdInt, orgId } = await seedOrg(name, `${slug}-${name}`);
      await seedOrgMember(orgIdInt, userIds);
      return orgId;
    };
    const orgA = await seedMemberOrg("a");
    const orgB = await seedMemberOrg("b");
    const orgC = await seedMemberOrg("c");
    const patchOrgs = (orgIds: string[]) =>
      client
        .patch(`/api/v1/publications/id/${publicationId}/draft`)
        .send({ orgs: orgIds.map((orgId) => ({ orgId })) });
    return { orgA, orgB, orgC, patchOrgs };
  }

  const savedOrgPriorities = (orgs: { orgId: string; priority: number }[]) =>
    orgs
      .map(({ orgId, priority }) => ({ orgId, priority }))
      .sort((x, y) => x.priority - y.priority);

  it("saves several orgs with priorities in request order", async () => {
    const { orgA, orgB, orgC, patchOrgs } =
      await createDraftWithThreeOrgs("multi-org-pub");

    const resp = await patchOrgs([orgB, orgA, orgC]);
    expect(resp.status).toBe(200);
    expect(resp.body.applied).toContain("orgs");
    expect(savedOrgPriorities(resp.body.publication.orgs)).toEqual([
      { orgId: orgB, priority: 1 },
      { orgId: orgA, priority: 2 },
      { orgId: orgC, priority: 3 },
    ]);
  });

  it("reorders existing orgs by updating their priorities", async () => {
    const { orgA, orgB, orgC, patchOrgs } =
      await createDraftWithThreeOrgs("reorder-org-pub");
    expect((await patchOrgs([orgA, orgB, orgC])).status).toBe(200);

    const resp = await patchOrgs([orgC, orgA, orgB]);
    expect(resp.status).toBe(200);
    expect(resp.body.applied).toContain("orgs");
    expect(savedOrgPriorities(resp.body.publication.orgs)).toEqual([
      { orgId: orgC, priority: 1 },
      { orgId: orgA, priority: 2 },
      { orgId: orgB, priority: 3 },
    ]);
  });

  it("removes, keeps and adds orgs in one save", async () => {
    const { orgA, orgB, orgC, patchOrgs } =
      await createDraftWithThreeOrgs("swap-org-pub");
    expect((await patchOrgs([orgA, orgB])).status).toBe(200);

    const resp = await patchOrgs([orgB, orgC]);
    expect(resp.status).toBe(200);
    expect(resp.body.applied).toContain("orgs");
    expect(savedOrgPriorities(resp.body.publication.orgs)).toEqual([
      { orgId: orgB, priority: 1 },
      { orgId: orgC, priority: 2 },
    ]);
  });

  it("collapses a repeated new org to its first position", async () => {
    const { orgA, orgB, patchOrgs } =
      await createDraftWithThreeOrgs("repeat-new-org-pub");

    const resp = await patchOrgs([orgA, orgB, orgA]);
    expect(resp.status).toBe(200);
    expect(resp.body.applied).toContain("orgs");
    expect(savedOrgPriorities(resp.body.publication.orgs)).toEqual([
      { orgId: orgA, priority: 1 },
      { orgId: orgB, priority: 2 },
    ]);
  });

  it("collapses a repeated existing org to its first position", async () => {
    const { orgA, orgB, patchOrgs } = await createDraftWithThreeOrgs(
      "repeat-existing-org-pub"
    );
    expect((await patchOrgs([orgA, orgB])).status).toBe(200);

    const resp = await patchOrgs([orgB, orgA, orgB]);
    expect(resp.status).toBe(200);
    expect(resp.body.applied).toContain("orgs");
    expect(savedOrgPriorities(resp.body.publication.orgs)).toEqual([
      { orgId: orgB, priority: 1 },
      { orgId: orgA, priority: 2 },
    ]);
  });

  it("rejects an unknown org", async () => {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);
    const { publicationId } = (
      await client.post("/api/v1/publications").send({
        slug: "org-not-found-pub",
        title: "Org 404",
        abstract: "Abstract.",
        body: "",
      })
    ).body;

    const resp = await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({ orgs: [{ orgId: UNKNOWN_ULID }] });
    expect(resp.status).toBeLessThan(500);
    expect(resp.body.applied ?? []).not.toContain("orgs");
    expect(
      await query(
        `SELECT 1 FROM org_publication_map WHERE publication_id = ${escape(publicationId)}`
      )
    ).toHaveLength(0);
  });
});

async function createDraft(client: TestApiClient, slug: string, title: string) {
  const resp = await client.post("/api/v1/publications").send({
    slug,
    title,
    abstract: "Abstract.",
    body: "",
  });
  expect(resp.status).toBe(201);
  return resp.body.publicationId as string;
}

describe("PATCH /api/v1/publications/id/:id/draft slug", () => {
  it("stores a free variant of a taken slug and reports it", async () => {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);
    await createDraft(client, "taken-slug-pub", "Slug Test");
    await createDraft(client, "taken-slug-pub-2", "Slug Test");
    const publicationId = await createDraft(
      client,
      "slug-mover-pub",
      "Slug Test"
    );

    const resp = await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({ slug: "taken-slug-pub" });
    expect(resp.status).toBe(200);
    expect(resp.body.applied).toContain("slug");
    expect(resp.body.rejected?.slug).toBeUndefined();
    expect(resp.body.publication.slug).toBe("taken-slug-pub-3");
    expect(resp.body.validationErrors).toContainEqual({
      code: "slug_replaced",
      path: ["slug"],
      message:
        'The slug "taken-slug-pub" is already taken, so "taken-slug-pub-3" was used instead',
    });
  });

  it("keeps the publication's own slug when it is the free variant", async () => {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);
    await createDraft(client, "own-variant-pub", "Slug Test");
    const publicationId = await createDraft(
      client,
      "own-variant-pub-2",
      "Slug Test"
    );

    const resp = await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({ slug: "own-variant-pub" });
    expect(resp.status).toBe(200);
    expect(resp.body.publication.slug).toBe("own-variant-pub-2");
  });

  it("rejects an invalid slug without touching the stored one", async () => {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);
    const publicationId = await createDraft(
      client,
      "invalid-slug-pub",
      "Slug Test"
    );

    const resp = await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({ slug: "Not A Slug!", title: "Still Saved" });
    expect(resp.status).toBe(200);
    expect(resp.body.applied).not.toContain("slug");
    expect(resp.body.applied).toContain("title");
    expect(resp.body.rejected?.slug?.path).toEqual(["slug"]);
    expect(resp.body.publication.slug).toBe("invalid-slug-pub");
  });
});

describe("PUT /api/v1/publications/id/:id/doi duplicate", () => {
  const DUPLICATE_DOI = "10.83972/duplicate-doi";
  const DOI_TAKEN: ValidationIssue = {
    code: "custom",
    path: ["doi"],
    message: "DOI is already in use by another publication",
  };

  async function loginArcadiaMember() {
    const { client, user, userIds } = await registerUserWithId();
    const { orgIdInt } = await seedOrg();
    await seedOrgMember(orgIdInt, userIds);
    await client.login(user.username, user.password);
    return client;
  }

  it("rejects a DOI another publication already has", async () => {
    const client = await loginArcadiaMember();
    const firstId = await createDraft(client, "first-doi-pub", "DOI Test");
    const secondId = await createDraft(client, "second-doi-pub", "DOI Test");

    const firstResp = await client
      .put(`/api/v1/publications/id/${firstId}/doi`)
      .send({ doi: DUPLICATE_DOI });
    expect(firstResp.status).toBe(200);

    const secondResp = await client
      .put(`/api/v1/publications/id/${secondId}/doi`)
      .send({ doi: DUPLICATE_DOI });
    expectValidationError(secondResp);
    expect(secondResp.body.errors).toEqual([DOI_TAKEN]);

    expect(
      await query<{ doi: string | null }>(
        `SELECT doi FROM publications WHERE id = ${escape(secondId)}`
      )
    ).toEqual([{ doi: null }]);
  });

  it("accepts a publication's own DOI again", async () => {
    const client = await loginArcadiaMember();
    const publicationId = await createDraft(
      client,
      "own-doi-publication",
      "DOI Test"
    );

    for (let attempt = 0; attempt < 2; attempt++) {
      const resp = await client
        .put(`/api/v1/publications/id/${publicationId}/doi`)
        .send({ doi: DUPLICATE_DOI });
      expect(resp.status).toBe(200);
    }

    expect(
      await query<{ doi: string | null }>(
        `SELECT doi FROM publications WHERE id = ${escape(publicationId)}`
      )
    ).toEqual([{ doi: DUPLICATE_DOI }]);
  });

  it("rejects a DOI longer than the column allows", async () => {
    const client = await loginArcadiaMember();
    const publicationId = await createDraft(
      client,
      "long-doi-publication",
      "DOI Test"
    );

    const resp = await client
      .put(`/api/v1/publications/id/${publicationId}/doi`)
      .send({ doi: `10.83972/${"x".repeat(256)}` });
    expectValidationError(resp);
    expect(resp.body.errors).toEqual([
      expect.objectContaining({
        path: ["doi"],
        message: "DOI must be 255 characters or less",
      }),
    ]);
  });
});

describe("POST /api/v1/publications duplicate DOI", () => {
  it("rejects a DOI another publication already has", async () => {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);
    const doi = "10.83972/duplicate-doi-on-create";

    const firstResp = await client
      .post("/api/v1/publications")
      .send({ slug: "first-created-doi-pub", title: "DOI Test", doi });
    expect(firstResp.status).toBe(201);

    const secondResp = await client
      .post("/api/v1/publications")
      .send({ slug: "second-created-doi-pub", title: "DOI Test", doi });
    expectValidationError(secondResp);
    expect(secondResp.body.errors).toEqual([
      {
        code: "custom",
        path: ["doi"],
        message: "DOI is already in use by another publication",
      },
    ]);

    expect(
      await query<{ id: string }>(
        "SELECT id FROM publications WHERE slug = 'second-created-doi-pub'"
      )
    ).toEqual([]);
  });
});

describe("PATCH /api/v1/publications/id/:id/draft subtitle", () => {
  const SUBTITLE_TOO_LONG =
    "Subtitle must be 280 characters or less, not counting formatting";

  async function patchSubtitle(slug: string, subtitle: string) {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);
    const { publicationId } = (
      await client.post("/api/v1/publications").send({
        slug,
        title: "Subtitle Test",
        abstract: "Abstract.",
        body: "Body.",
      })
    ).body;
    return client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({ subtitle });
  }

  it("saves a subtitle over 280 characters but flags it for publishing", async () => {
    const resp = await patchSubtitle("subtitle-too-long", "a".repeat(281));
    expect(resp.status).toBe(200);
    expect(resp.body.applied).toContain("subtitle");
    expect(resp.body.publication.subtitle).toHaveLength(281);
    expect(resp.body.validationErrors).toContainEqual(
      expect.objectContaining({
        path: ["subtitle"],
        message: SUBTITLE_TOO_LONG,
      })
    );
  });

  it("does not count markdown toward the 280-character limit", async () => {
    const subtitle = `**${"a".repeat(280)}**`;
    const resp = await patchSubtitle("subtitle-with-markdown", subtitle);
    expect(resp.status).toBe(200);
    expect(resp.body.publication.subtitle).toBe(subtitle);
    expect(
      resp.body.validationErrors.filter(
        (e: ValidationIssue) => e.path[0] === "subtitle"
      )
    ).toEqual([]);
  });
});

describe("PATCH /api/v1/publications/id/:id/draft subjects", () => {
  const SUBJECTS = [
    {
      subject: "FOS: Computer and information sciences",
      subjectScheme: "Fields of Science and Technology (FOS)",
    },
    { subject: "Neuroscience" },
  ];
  const CUSTOM_TYPES = {
    resourceTypeGeneral: "Dataset",
    resourceType: "Survey data",
  };

  async function createDraft(slug: string) {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);
    const resp = await client.post("/api/v1/publications").send({
      slug,
      title: "Subjects Test",
      abstract: "Abstract.",
      body: "Body.",
    });
    expect(resp.status).toBe(201);
    return { client, publicationId: resp.body.publicationId as string };
  }

  it("serves the default subjects on a new draft", async () => {
    const { client, publicationId } = await createDraft("subjects-default");

    const resp = await client.get(
      `/api/v1/publications/id/${publicationId}/draft`
    );
    expect(resp.status).toBe(200);
    expect(resp.body.publication.subjects).toEqual(DEFAULT_SUBJECTS);
  });

  it("replaces only the subjects, keeping a language and types changed since the draft loaded", async () => {
    const { client, publicationId } = await createDraft("subjects-atomic");
    // As an admin would through PATCH /admin/publications/{idOrSlug}, after
    // the editor loaded the draft.
    await execute(
      `UPDATE publications SET doi_metadata = JSON_SET(doi_metadata, '$.content.language', 'fr', '$.content.types', CAST(${escape(JSON.stringify(CUSTOM_TYPES))} AS JSON)) WHERE id = ${escape(publicationId)}`
    );

    const resp = await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({ subjects: SUBJECTS });
    expect(resp.status).toBe(200);
    expect(resp.body.applied).toContain("subjects");
    expect(resp.body.rejected?.subjects).toBeUndefined();
    expect(resp.body.publication.subjects).toEqual(SUBJECTS);
    expect(await storedDoiMetadata(publicationId)).toEqual({
      type: "datacite",
      content: { language: "fr", types: CUSTOM_TYPES, subjects: SUBJECTS },
    });

    const draft = await client.get(
      `/api/v1/publications/id/${publicationId}/draft`
    );
    expect(draft.body.publication.subjects).toEqual(SUBJECTS);
  });

  it("rejects the whole patch when a subject is empty", async () => {
    const { client, publicationId } = await createDraft("subjects-invalid");
    const before = await storedDoiMetadata(publicationId);

    const resp = await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({ title: "Renamed", subjects: [{ subject: "" }] });
    expectValidationError(resp);
    expect(await storedDoiMetadata(publicationId)).toEqual(before);

    const draft = await client.get(
      `/api/v1/publications/id/${publicationId}/draft`
    );
    expect(draft.body.publication.title).toBe("Subjects Test");
  });

  it("rejects an empty subjects list under subjects and still applies the rest", async () => {
    const { client, publicationId } = await createDraft("subjects-empty");
    const before = await storedDoiMetadata(publicationId);

    const resp = await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({ title: "Renamed", subjects: [] });
    expect(resp.status).toBe(200);
    expect(resp.body.applied).toContain("title");
    expect(resp.body.applied).not.toContain("subjects");
    expect(resp.body.rejected?.subjects?.path).toEqual(["subjects"]);
    expect(resp.body.publication.title).toBe("Renamed");
    expect(resp.body.publication.subjects).toEqual(DEFAULT_SUBJECTS);
    expect(await storedDoiMetadata(publicationId)).toEqual(before);
  });

  it("rejects subjects on a deleted publication's draft, which isn't a DRAFT", async () => {
    const { client, publicationId } = await createDraft("subjects-deleted");
    await execute(
      `UPDATE publications SET state = 'DELETED' WHERE id = ${escape(publicationId)}`
    );
    const before = await storedDoiMetadata(publicationId);

    const resp = await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({ title: "Renamed", subjects: SUBJECTS });
    expect(resp.status).toBe(200);
    expect(resp.body.applied).toContain("title");
    expect(resp.body.applied).not.toContain("subjects");
    expect(resp.body.rejected?.subjects).toEqual({
      path: ["subjects"],
      message: "Can only modify subjects while the publication is a draft",
    });
    expect(await storedDoiMetadata(publicationId)).toEqual(before);
  });
});

describe("PATCH /api/v1/publications/id/:id/draft of a published publication", () => {
  it("rejects subjects changes and leaves the stored DOI metadata untouched", async () => {
    const { client, user, userId: ownerId } = await registerUserWithId();
    const { pubIdUlid } = await seedPublishedV1({
      slug: "published-locked-subjects",
      ownerId,
    });
    await client.login(user.username, user.password);
    expect(
      (await client.post(`/api/v1/publications/id/${pubIdUlid}/draft`)).status
    ).toBe(201);
    const before = await storedDoiMetadata(pubIdUlid);

    const resp = await client
      .patch(`/api/v1/publications/id/${pubIdUlid}/draft`)
      .send({ subjects: [{ subject: "Neuroscience" }] });
    expect(resp.status).toBe(200);
    expect(resp.body.applied).not.toContain("subjects");
    expect(resp.body.rejected?.subjects).toEqual({
      path: ["subjects"],
      message: "Cannot modify subjects after publication",
    });
    expect(resp.body.publication.subjects).toEqual(DEFAULT_SUBJECTS);
    expect(await storedDoiMetadata(pubIdUlid)).toEqual(before);
  });

  it("rejects license and slug changes under their own fields", async () => {
    const { client, user, userId: ownerId } = await registerUserWithId();
    const slug = "published-locked-fields";
    const { pubIdUlid } = await seedPublishedV1({ slug, ownerId });
    await client.login(user.username, user.password);
    expect(
      (await client.post(`/api/v1/publications/id/${pubIdUlid}/draft`)).status
    ).toBe(201);

    const resp = await client
      .patch(`/api/v1/publications/id/${pubIdUlid}/draft`)
      .send({ license: "CC0", slug: "published-locked-fields-new" });
    expect(resp.status).toBe(200);
    expect(resp.body.applied).not.toContain("license");
    expect(resp.body.applied).not.toContain("slug");
    expect(resp.body.rejected?.license).toEqual({
      path: ["license"],
      message: "Cannot modify license after publication",
    });
    expect(resp.body.rejected?.slug?.path).toEqual(["slug"]);
    expect(resp.body.publication.slug).toBe(slug);
  });
});

describe("owner of a draft in an org they don't belong to", () => {
  async function seedDraftInForeignOrg(slug: string) {
    const { client, user, userId: ownerId } = await registerUserWithId();
    const {
      intId,
      id: publicationId,
      versionId,
    } = await seedPublication({
      slug,
      ownerId,
      state: "DRAFT",
      title: "Foreign Org Draft",
    });
    const { orgIdInt, orgId } = await seedOrg("Foreign Org", `${slug}-org`);
    await execute(
      `INSERT INTO org_publication_map (org_id_int, org_id, publication_id_int, publication_id) VALUES (${orgIdInt}, ${escape(orgId)}, ${intId}, ${escape(publicationId)})`
    );
    await client.login(user.username, user.password);
    return { client, intId, publicationId, versionId };
  }

  it("can still view and modify the draft", async () => {
    const { client, publicationId, versionId } =
      await seedDraftInForeignOrg("foreign-org-edit");
    // Drop the owner's contributor row so access comes from ownership alone.
    await execute(
      `DELETE FROM contributors WHERE version_id = ${escape(versionId)}`
    );

    const viewResp = await client.get(
      `/api/v1/publications/id/${publicationId}/draft`
    );
    expect(viewResp.status, viewResp.text).toBe(200);
    expect(viewResp.body.publication.title).toBe("Foreign Org Draft");

    const patchResp = await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({ title: "Renamed By Owner" });
    expect(patchResp.status, patchResp.text).toBe(200);
    expect(patchResp.body.applied).toContain("title");

    const afterResp = await client.get(
      `/api/v1/publications/id/${publicationId}/draft`
    );
    expect(afterResp.body.publication.title).toBe("Renamed By Owner");
  });

  it("cannot publish the draft", async () => {
    const { client, publicationId } = await seedDraftInForeignOrg(
      "foreign-org-publish"
    );
    expect(
      (
        await client
          .patch(`/api/v1/publications/id/${publicationId}/draft`)
          .send({ abstract: "Abstract text.", body: "Body text." })
      ).status
    ).toBe(200);

    const publishResp = await client.post(
      `/api/v1/publications/id/${publicationId}/versions`
    );
    expect(publishResp.status, publishResp.text).toBe(403);

    const pubRows = await query<{ state: string }>(
      `SELECT state FROM publications WHERE id = ${escape(publicationId)}`
    );
    expect(pubRows[0]!.state).toBe("DRAFT");
  });
});

describe("PATCH /api/v1/publications/id/:id/draft contributors", () => {
  it("adds and removes a contributor's org affiliation", async () => {
    const { client, user, userId: ownerId } = await registerUserWithId();
    await seedSiteAdmin(ownerId);
    await client.login(user.username, user.password);
    const { publicationId } = (
      await client.post("/api/v1/publications").send({
        slug: "affiliation-pub",
        title: "Affil Pub",
        abstract: "Abstract.",
        body: "",
      })
    ).body;
    const contrib = await registerUser(
      new TestApiClient(),
      makeUser("affilcontrib")
    );
    const { orgId } = await seedOrg("Affil Org", "affiliation-org");
    const patchAffiliations = (affiliations: string[]) =>
      client.patch(`/api/v1/publications/id/${publicationId}/draft`).send({
        contributors: [
          {
            userId: contrib.id,
            roles: ["author"],
            inByline: true,
            affiliations,
          },
        ],
      });
    const getContributor = async () =>
      (
        await client.get(`/api/v1/publications/id/${publicationId}/draft`)
      ).body.publication.contributors.find(
        (c: { userId: string }) => c.userId === contrib.id
      );

    expect((await patchAffiliations([orgId])).status).toBe(200);
    let contributor = await getContributor();
    expect(contributor.affiliations).toHaveLength(1);
    expect(contributor.affiliations[0]).toMatchObject({
      orgId,
      slug: "affiliation-org",
    });

    // Re-sending the same affiliation is idempotent.
    expect((await patchAffiliations([orgId])).status).toBe(200);
    expect((await getContributor()).affiliations).toHaveLength(1);

    expect((await patchAffiliations([])).status).toBe(200);
    contributor = await getContributor();
    expect(contributor.affiliations).toHaveLength(0);
  });

  async function createDraftWithAffiliationOrgs(slug: string) {
    const { client, user, userId: ownerId } = await registerUserWithId();
    await seedSiteAdmin(ownerId);
    await client.login(user.username, user.password);
    const { publicationId }: { publicationId: string } = (
      await client.post("/api/v1/publications").send({
        slug,
        title: "Affil Pub",
        abstract: "Abstract.",
        body: "",
      })
    ).body;
    const { orgId: orgA } = await seedOrg("Org A", `${slug}-a`);
    const { orgId: orgB } = await seedOrg("Org B", `${slug}-b`);
    const { orgId: orgC } = await seedOrg("Org C", `${slug}-c`);
    const patchContributors = (
      contributors: {
        userId: string;
        affiliations: string[];
        roles?: string[];
      }[]
    ) =>
      client.patch(`/api/v1/publications/id/${publicationId}/draft`).send({
        contributors: contributors.map((c) => ({
          roles: ["author"],
          inByline: true,
          ...c,
        })),
      });
    const getAffiliationIds = async (userId: string) =>
      (
        await client.get(`/api/v1/publications/id/${publicationId}/draft`)
      ).body.publication.contributors
        .find((c: { userId: string }) => c.userId === userId)
        .affiliations.map((a: { orgId: string }) => a.orgId);
    return {
      publicationId,
      orgA,
      orgB,
      orgC,
      patchContributors,
      getAffiliationIds,
    };
  }

  it("saves several affiliations for one contributor", async () => {
    const { orgA, orgB, patchContributors, getAffiliationIds } =
      await createDraftWithAffiliationOrgs("multi-affil-pub");
    const contrib = await registerUser(
      new TestApiClient(),
      makeUser("multiaffil")
    );

    const resp = await patchContributors([
      { userId: contrib.id, affiliations: [orgA, orgB] },
    ]);
    expect(resp.status).toBe(200);
    expect(resp.body.applied).toContain("contributors");
    const affiliationIds = await getAffiliationIds(contrib.id);
    expect(affiliationIds).toHaveLength(2);
    expect(affiliationIds).toEqual(expect.arrayContaining([orgA, orgB]));
  });

  it("removes, keeps and adds a contributor's affiliations in one save", async () => {
    const { orgA, orgB, orgC, patchContributors, getAffiliationIds } =
      await createDraftWithAffiliationOrgs("swap-affil-pub");
    const contrib = await registerUser(
      new TestApiClient(),
      makeUser("swapaffil")
    );
    expect(
      (
        await patchContributors([
          { userId: contrib.id, affiliations: [orgA, orgB] },
        ])
      ).status
    ).toBe(200);

    const resp = await patchContributors([
      { userId: contrib.id, affiliations: [orgB, orgC] },
    ]);
    expect(resp.status).toBe(200);
    expect(resp.body.applied).toContain("contributors");
    const affiliationIds = await getAffiliationIds(contrib.id);
    expect(affiliationIds).toHaveLength(2);
    expect(affiliationIds).toEqual(expect.arrayContaining([orgB, orgC]));
    expect(affiliationIds).not.toContain(orgA);
  });

  it("updates each contributor's affiliations independently in one save", async () => {
    const { orgA, orgB, orgC, patchContributors, getAffiliationIds } =
      await createDraftWithAffiliationOrgs("two-contrib-affil-pub");
    const first = await registerUser(
      new TestApiClient(),
      makeUser("firstaffil")
    );
    const second = await registerUser(
      new TestApiClient(),
      makeUser("secondaffil")
    );
    expect(
      (
        await patchContributors([
          { userId: first.id, affiliations: [orgA] },
          { userId: second.id, affiliations: [orgB] },
        ])
      ).status
    ).toBe(200);

    const resp = await patchContributors([
      { userId: first.id, affiliations: [orgC] },
      { userId: second.id, affiliations: [orgA, orgB] },
    ]);
    expect(resp.status).toBe(200);
    expect(resp.body.applied).toContain("contributors");
    expect(await getAffiliationIds(first.id)).toEqual([orgC]);
    const secondIds = await getAffiliationIds(second.id);
    expect(secondIds).toHaveLength(2);
    expect(secondIds).toEqual(expect.arrayContaining([orgA, orgB]));
  });

  it("replaces an affiliation with a repeated new one, saving it once", async () => {
    const { orgA, orgB, patchContributors, getAffiliationIds } =
      await createDraftWithAffiliationOrgs("repeat-affil-pub");
    const contrib = await registerUser(
      new TestApiClient(),
      makeUser("repeataffil")
    );
    expect(
      (await patchContributors([{ userId: contrib.id, affiliations: [orgA] }]))
        .status
    ).toBe(200);

    const resp = await patchContributors([
      { userId: contrib.id, affiliations: [orgB, orgB] },
    ]);
    expect(resp.status).toBe(200);
    expect(resp.body.applied).toContain("contributors");
    expect(await getAffiliationIds(contrib.id)).toEqual([orgB]);
  });

  it("keeps existing affiliations when a save names an unknown org", async () => {
    const { orgA, patchContributors, getAffiliationIds } =
      await createDraftWithAffiliationOrgs("unknown-affil-rollback-pub");
    const contrib = await registerUser(
      new TestApiClient(),
      makeUser("rollbackaffil")
    );
    expect(
      (await patchContributors([{ userId: contrib.id, affiliations: [orgA] }]))
        .status
    ).toBe(200);

    const resp = await patchContributors([
      { userId: contrib.id, affiliations: [UNKNOWN_ULID] },
    ]);
    expect(resp.status).toBe(200);
    expect(resp.body.applied).not.toContain("contributors");
    expect(await getAffiliationIds(contrib.id)).toEqual([orgA]);
  });

  it("re-adds a removed contributor with their previous affiliation", async () => {
    const { orgA, patchContributors, getAffiliationIds } =
      await createDraftWithAffiliationOrgs("readd-affil-pub");
    const contrib = await registerUser(
      new TestApiClient(),
      makeUser("readdaffil")
    );
    expect(
      (await patchContributors([{ userId: contrib.id, affiliations: [orgA] }]))
        .status
    ).toBe(200);

    expect((await patchContributors([])).status).toBe(200);
    expect(
      await query(
        `SELECT 1 FROM contributor_affiliations WHERE user_id = ${escape(contrib.id)}`
      )
    ).toHaveLength(0);

    const resp = await patchContributors([
      { userId: contrib.id, affiliations: [orgA] },
    ]);
    expect(resp.status).toBe(200);
    expect(resp.body.applied).toContain("contributors");
    expect(await getAffiliationIds(contrib.id)).toEqual([orgA]);
  });

  it("adds a contributor whose affiliation row outlived an earlier removal", async () => {
    const { publicationId, orgA, patchContributors, getAffiliationIds } =
      await createDraftWithAffiliationOrgs("legacy-affil-pub");
    const contrib = await registerUser(
      new TestApiClient(),
      makeUser("legacyaffil")
    );
    // v0 removes a contributor's roles without deleting their affiliations
    await execute(
      `INSERT INTO contributor_affiliations (version_id_int, user_id_int, affiliated_org_id_int) SELECT v.id_int, u.id_int, o.id_int FROM versions v, users u, organizations o WHERE v.publication_id = ${escape(publicationId)} AND v.state = 'DRAFT' AND u.id = ${escape(contrib.id)} AND o.id = ${escape(orgA)}`
    );

    const resp = await patchContributors([
      { userId: contrib.id, affiliations: [orgA] },
    ]);
    expect(resp.status).toBe(200);
    expect(resp.body.applied).toContain("contributors");
    expect(await getAffiliationIds(contrib.id)).toEqual([orgA]);
  });

  it("drops the affiliations of a contributor sent with no roles", async () => {
    const { orgA, patchContributors } =
      await createDraftWithAffiliationOrgs("no-roles-affil-pub");
    const contrib = await registerUser(
      new TestApiClient(),
      makeUser("norolesaffil")
    );
    expect(
      (await patchContributors([{ userId: contrib.id, affiliations: [orgA] }]))
        .status
    ).toBe(200);

    const resp = await patchContributors([
      { userId: contrib.id, roles: [], affiliations: [orgA] },
    ]);
    expect(resp.status).toBe(200);
    expect(resp.body.applied).toContain("contributors");
    expect(
      await query(
        `SELECT 1 FROM contributor_affiliations WHERE user_id = ${escape(contrib.id)}`
      )
    ).toHaveLength(0);
  });

  it("saves an affiliation repeated across entries for one contributor once", async () => {
    const { orgA, patchContributors, getAffiliationIds } =
      await createDraftWithAffiliationOrgs("repeat-contrib-affil-pub");
    const contrib = await registerUser(
      new TestApiClient(),
      makeUser("repeatcontribaffil")
    );

    const resp = await patchContributors([
      { userId: contrib.id, affiliations: [orgA] },
      { userId: contrib.id, affiliations: [orgA] },
    ]);
    expect(resp.status).toBe(200);
    expect(resp.body.applied).toContain("contributors");
    expect(await getAffiliationIds(contrib.id)).toEqual([orgA]);
  });

  it("merges the affiliations of entries repeated for one contributor", async () => {
    const { orgA, orgB, patchContributors, getAffiliationIds } =
      await createDraftWithAffiliationOrgs("merge-contrib-affil-pub");
    const contrib = await registerUser(
      new TestApiClient(),
      makeUser("mergecontribaffil")
    );
    expect(
      (await patchContributors([{ userId: contrib.id, affiliations: [orgA] }]))
        .status
    ).toBe(200);

    const resp = await patchContributors([
      { userId: contrib.id, affiliations: [orgB] },
      { userId: contrib.id, affiliations: [orgA] },
    ]);
    expect(resp.status).toBe(200);
    expect(resp.body.applied).toContain("contributors");
    const affiliationIds = await getAffiliationIds(contrib.id);
    expect(affiliationIds).toHaveLength(2);
    expect(affiliationIds).toEqual(expect.arrayContaining([orgA, orgB]));
  });

  it("points an unknown org in a repeated contributor entry at that entry", async () => {
    const { orgA, patchContributors } = await createDraftWithAffiliationOrgs(
      "repeat-unknown-affil-pub"
    );
    const contrib = await registerUser(
      new TestApiClient(),
      makeUser("repeatunknownaffil")
    );

    const resp = await patchContributors([
      { userId: contrib.id, affiliations: [orgA] },
      { userId: contrib.id, affiliations: [orgA, UNKNOWN_ULID] },
    ]);
    expect(resp.status).toBe(200);
    expect(resp.body.applied).not.toContain("contributors");
    expect(resp.body.validationErrors).toContainEqual({
      code: "custom",
      input: UNKNOWN_ULID,
      message: "Org not found",
      path: ["contributors", 1, "affiliations", 1],
    });
    expect(
      await query(
        `SELECT 1 FROM contributor_affiliations WHERE user_id = ${escape(contrib.id)}`
      )
    ).toHaveLength(0);
  });

  it("rejects affiliating with an unknown org", async () => {
    const {
      client,
      user,
      userId: ownerId,
      userIds,
    } = await registerUserWithId();
    await seedSiteAdmin(ownerId);
    await client.login(user.username, user.password);
    const { publicationId } = (
      await client.post("/api/v1/publications").send({
        slug: "affiliation-guard",
        title: "Affil Guard",
        abstract: "Abstract.",
        body: "",
      })
    ).body;

    const resp = await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({
        contributors: [
          {
            userId: userIds.id,
            roles: ["author"],
            inByline: true,
            affiliations: [UNKNOWN_ULID],
          },
        ],
      });
    expect(resp.status).toBeLessThan(500);
    expect(resp.body.applied ?? []).not.toContain("contributors");
    expect(
      await query(
        `SELECT 1 FROM contributor_affiliations WHERE user_id = ${escape(userIds.id)}`
      )
    ).toHaveLength(0);
  });

  it("removes a contributor omitted from the list", async () => {
    const {
      client,
      user,
      userId: ownerId,
      userIds,
    } = await registerUserWithId();
    await seedSiteAdmin(ownerId);
    await client.login(user.username, user.password);
    const { publicationId, versionId } = (
      await client.post("/api/v1/publications").send({
        slug: "remove-contrib-pub",
        title: "Remove Contrib",
        abstract: "Abstract.",
        body: "",
      })
    ).body;
    const removeMe = await registerUser(
      new TestApiClient(),
      makeUser("removeme")
    );
    const owner = {
      userId: userIds.id,
      roles: ["author"],
      inByline: true,
      affiliations: [],
    };
    const countContribRows = async (userId: string) =>
      (
        await query(
          `SELECT 1 FROM contributors WHERE version_id = ${escape(versionId)} AND user_id = ${escape(userId)}`
        )
      ).length;

    expect(
      (
        await client
          .patch(`/api/v1/publications/id/${publicationId}/draft`)
          .send({
            contributors: [
              owner,
              {
                userId: removeMe.id,
                roles: ["author"],
                inByline: false,
                affiliations: [],
              },
            ],
          })
      ).status
    ).toBe(200);
    expect(await countContribRows(removeMe.id)).toBe(1);

    const removeResp = await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({ contributors: [owner] });
    expect(removeResp.status).toBe(200);
    expect(removeResp.body.publication.contributors).toEqual([
      expect.objectContaining({ userId: userIds.id }),
    ]);
    expect(await countContribRows(removeMe.id)).toBe(0);
    expect(await countContribRows(userIds.id)).toBe(1);
  });

  describe("multiple roles", () => {
    // json_arrayagg doesn't guarantee order, so roles are compared sorted
    const sortRoles = (roles: string[]) =>
      [...roles].sort((a, b) => a.localeCompare(b));

    const setup = async (slug: string, contribUsername: string) => {
      const { client, user, userId, userIds } = await registerUserWithId();
      await seedSiteAdmin(userId);
      // Seeds the owner as a contributor with the role "Writing"
      const { id: publicationId, versionId } = await seedPublication({
        slug,
        ownerId: userId,
        state: "DRAFT",
      });
      const contrib = await registerUser(
        new TestApiClient(),
        makeUser(contribUsername)
      );
      await client.login(user.username, user.password);
      const patchContributors = (
        contributors: { userId: string; roles: string[] }[]
      ) =>
        client.patch(`/api/v1/publications/id/${publicationId}/draft`).send({
          contributors: contributors.map((c) => ({
            ...c,
            inByline: true,
            affiliations: [],
          })),
        });
      const patchRoles = (roles: string[]) =>
        patchContributors([{ userId: contrib.id, roles }]);
      const storedRoles = async (userId = contrib.id) =>
        (
          await query<{ roles: string[] }>(
            `SELECT roles FROM contributors WHERE version_id = ${escape(versionId)} AND user_id = ${escape(userId)}`
          )
        )[0]?.roles ?? [];
      return {
        ownerId: userIds.id,
        contrib,
        patchContributors,
        patchRoles,
        storedRoles,
      };
    };

    it("adds a new contributor with several roles", async () => {
      const { contrib, patchRoles, storedRoles } = await setup(
        "multi-role-new",
        "multirolenew"
      );

      const resp = await patchRoles(["Conceptualization", "Writing"]);
      expect(resp.status).toBe(200);
      expect(resp.body.applied).toContain("contributors");
      expect(await storedRoles()).toEqual(["Conceptualization", "Writing"]);
      expect(resp.body.publication.contributors).toHaveLength(1);
      const [returned] = resp.body.publication.contributors;
      expect(returned.userId).toBe(contrib.id);
      expect(sortRoles(returned.roles)).toEqual([
        "Conceptualization",
        "Writing",
      ]);
    });

    it("adds several new roles to an existing contributor", async () => {
      const { contrib, patchRoles, storedRoles } = await setup(
        "multi-role-existing",
        "multiroleexisting"
      );

      expect((await patchRoles(["author"])).status).toBe(200);
      expect(await storedRoles()).toEqual(["author"]);

      const resp = await patchRoles(["author", "Conceptualization", "Writing"]);
      expect(resp.status).toBe(200);
      expect(resp.body.applied).toContain("contributors");
      expect(await storedRoles()).toEqual([
        "author",
        "Conceptualization",
        "Writing",
      ]);
      expect(resp.body.publication.contributors).toHaveLength(1);
      const [returned] = resp.body.publication.contributors;
      expect(returned.userId).toBe(contrib.id);
      expect(sortRoles(returned.roles)).toEqual([
        "author",
        "Conceptualization",
        "Writing",
      ]);
    });

    it("rolls back the whole contributor update when one user doesn't exist", async () => {
      const { ownerId, contrib, patchContributors, storedRoles } = await setup(
        "multi-role-missing",
        "multirolemissing"
      );

      const resp = await patchContributors([
        { userId: contrib.id, roles: ["Conceptualization", "Writing"] },
        { userId: UNKNOWN_ULID, roles: ["author"] },
      ]);
      expect(resp.status).toBe(200);
      expect(resp.body.applied).not.toContain("contributors");
      expect(resp.body.validationErrors).toContainEqual({
        code: "custom",
        input: UNKNOWN_ULID,
        message: "User not found",
        path: ["contributors", 1],
      });
      expect(resp.body.publication.contributors).toEqual([
        expect.objectContaining({ userId: ownerId, roles: ["Writing"] }),
      ]);
      expect(await storedRoles(ownerId)).toEqual(["Writing"]);
      expect(await storedRoles(contrib.id)).toEqual([]);
      expect(await storedRoles(UNKNOWN_ULID)).toEqual([]);
    });

    it("de-duplicates a repeated role", async () => {
      const { patchRoles, storedRoles } = await setup(
        "multi-role-repeated",
        "multirolerepeated"
      );

      const resp = await patchRoles(["Writing", "Writing"]);
      expect(resp.status).toBe(200);
      expect(resp.body.applied).toContain("contributors");
      expect(await storedRoles()).toEqual(["Writing"]);
    });

    it("de-duplicates a repeated role with a different orders", async () => {
      const { patchRoles, storedRoles } = await setup(
        "multi-role-repeated",
        "multirolerepeated"
      );

      const resp = await patchRoles([
        "Writing",
        "Conceptualization",
        "Writing",
      ]);
      expect(resp.status).toBe(200);
      expect(resp.body.applied).toContain("contributors");
      expect(await storedRoles()).toEqual(["Writing", "Conceptualization"]);
    });

    it("de-duplicates a role shared by a contributor listed twice", async () => {
      const { contrib, patchContributors, storedRoles } = await setup(
        "multi-role-listed-twice",
        "multiroletwice"
      );

      const resp = await patchContributors([
        { userId: contrib.id, roles: ["Writing"] },
        { userId: contrib.id, roles: ["Writing", "Conceptualization"] },
      ]);
      expect(resp.status).toBe(200);
      expect(resp.body.applied).toContain("contributors");
      expect(await storedRoles()).toEqual(["Writing", "Conceptualization"]);
    });
  });

  it("requires userId and roles", async () => {
    const {
      client,
      user,
      userId: ownerId,
      userIds,
    } = await registerUserWithId();
    await seedSiteAdmin(ownerId);
    await client.login(user.username, user.password);
    const { publicationId } = (
      await client.post("/api/v1/publications").send({
        slug: "remove-contrib-guard",
        title: "Guard",
        abstract: "Abstract.",
        body: "",
      })
    ).body;
    const patchContributors = (c: TestApiClient, contributor: object) =>
      c
        .patch(`/api/v1/publications/id/${publicationId}/draft`)
        .send({ contributors: [contributor] });
    const validContributor = {
      userId: userIds.id,
      roles: ["author"],
      inByline: true,
      affiliations: [],
    };

    const { userId: _userId, ...missingUserId } = validContributor;
    expectValidationError(await patchContributors(client, missingUserId));
    const { roles: _roles, ...missingRoles } = validContributor;
    expectValidationError(await patchContributors(client, missingRoles));
  });
});

type EditTarget = {
  slug: string;
  publicationId: string;
  orgId: string;
  ownerUserId: string;
};

// Every route that changes a publication, so each one gets the same
// signed-out and non-editor checks.
const EDIT_ROUTES: RouteCase<EditTarget>[] = [
  {
    name: "POST /publications",
    send: (client) =>
      client
        .post("/api/v1/publications")
        .send({ slug: "unauthorized", title: "Nope", body: "" }),
  },
  {
    name: "POST /publications/p/:slug/draft",
    send: (client, { slug }) =>
      client.post(`/api/v1/publications/p/${slug}/draft`),
  },
  {
    name: "POST /publications/id/:id/draft",
    send: (client, { publicationId }) =>
      client.post(`/api/v1/publications/id/${publicationId}/draft`),
  },
  {
    name: "POST /publications/id/:id/versions",
    send: (client, { publicationId }) =>
      client.post(`/api/v1/publications/id/${publicationId}/versions`),
  },
  {
    name: "PATCH /publications/id/:id/draft linkedAssets",
    send: (client, { publicationId }) =>
      client.patch(`/api/v1/publications/id/${publicationId}/draft`).send({
        linkedAssets: [
          {
            type: "dataset",
            url: "https://example.com/data.csv",
            name: "Data",
          },
        ],
      }),
  },
  {
    name: "PATCH /publications/id/:id/draft orgs",
    send: (client, { publicationId, orgId }) =>
      client
        .patch(`/api/v1/publications/id/${publicationId}/draft`)
        .send({ orgs: [{ orgId }] }),
  },
  {
    name: "PATCH /publications/id/:id/draft contributors",
    send: (client, { publicationId, ownerUserId }) =>
      client.patch(`/api/v1/publications/id/${publicationId}/draft`).send({
        contributors: [
          {
            userId: ownerUserId,
            roles: ["author"],
            inByline: true,
            affiliations: [],
          },
        ],
      }),
  },
];

/**
 * A published publication owned by someone else. It has no draft, so the
 * snapshot catches a rejected POST .../draft that creates one anyway.
 */
async function seedEditTarget() {
  const { userId: ownerId, userIds } = await registerUserWithId(
    makeUser("editowner")
  );
  const slug = "guarded-pub";
  const { pubId, pubIdUlid } = await seedPublishedV1({ slug, ownerId });
  const { orgId } = await seedOrg("Guarded Org", "guarded-org");
  const snapshot = () =>
    query(
      `SELECT
        (SELECT COUNT(*) FROM publications) AS publications,
        (SELECT COUNT(*) FROM versions WHERE publication_id_int = ${pubId}) AS versions,
        (SELECT COUNT(*) FROM org_publication_map WHERE publication_id_int = ${pubId}) AS orgs,
        (SELECT COUNT(*) FROM contributors c JOIN versions v ON v.id_int = c.version_id_int WHERE v.publication_id_int = ${pubId}) AS contributors,
        (SELECT COUNT(*) FROM linked_assets la JOIN versions v ON la.version_id_int = v.id_int WHERE v.publication_id_int = ${pubId}) AS linkedAssets`
    );
  const before = await snapshot();
  return {
    target: { slug, publicationId: pubIdUlid, orgId, ownerUserId: userIds.id },
    async expectUntouched() {
      expect(await snapshot()).toEqual(before);
    },
  };
}

describe("publication edit authorization", () => {
  it.each(EDIT_ROUTES)("$name requires authentication", async (route) => {
    const { target, expectUntouched } = await seedEditTarget();

    const resp = await route.send(new TestApiClient(), target);
    expect(resp.status).toBe(401);
    expect(resp.body).toEqual(UNAUTHENTICATED);
    await expectUntouched();
  });

  it.each(EDIT_ROUTES)("$name forbids a non-editor", async (route) => {
    const { target, expectUntouched } = await seedEditTarget();
    const { client } = await loggedInUser("stranger");

    const resp = await route.send(client, target);
    expect(resp.status).toBe(403);
    expect(resp.body).toEqual(PERMISSION_DENIED);
    await expectUntouched();
  });
});

// End-to-end coverage mirroring the thestacks.org "create publication" UI flow:
// create draft -> add contributor -> affiliate contributor with an org -> associate
// the publication with an org (via potential_orgs) -> set tags -> set linked assets
// -> final draft save -> publish. See PublicationEditor.tsx for the equivalent
// client-side sequence.
describe("full create-publication flow (mirrors thestacks.org UI)", () => {
  it("create → contributor+affiliation → org → tags → linked assets → save → publish", async () => {
    const {
      client,
      user,
      userId: ownerId,
      userIds,
    } = await registerUserWithId();
    await seedSiteAdmin(ownerId);
    await client.login(user.username, user.password);

    const slug = "full-flow-pub";

    // Step 1 (PublicationEditor "Create draft"): POST /publications
    const createResp = await client.post("/api/v1/publications").send({
      slug,
      title: "Full Flow Publication",
      subtitle: "A subtitle",
      abstract: "An abstract.",
      body: "",
      doi: null,
      version_desc: null,
      license: "CC BY",
      feedback_form_embed_src: null,
      social_posts_embed_src: null,
    });
    expect(createResp.status).toBe(201);
    expect(createResp.body.slug).toBe(slug);
    expect(createResp.body.publicationId).toBeTypeOf("string");
    const { publicationId } = createResp.body;

    // Step 2: POST /publications/add_contrib
    const registerResp = await registerUser(
      new TestApiClient(),
      makeUser("fullflowcontrib")
    );
    const addContribResp = await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({
        contributors: [
          {
            username: "fullflowcontrib",
            userId: registerResp.id,
            roles: ["author"],
            inByline: true,
            affiliations: [],
          },
        ],
      });
    expect(addContribResp.status).toBe(200);
    const contribUserId = await getUserId("fullflowcontrib");

    // Step 2b: POST /publications/:slug/contrib-affiliation
    const { orgId } = await seedOrg(
      "Full Flow Affil Org",
      "full-flow-affiliation-org"
    );
    const affilResp = await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({
        contributors: [
          {
            username: "fullflowcontrib",
            userId: registerResp.id,
            roles: ["author"],
            inByline: true,
            affiliations: [orgId],
          },
        ],
      });
    // const affilResp = await client
    //   .post(`/api/v1/publications/p/${slug}/contrib-affiliation`)
    //   .send({ user_id: contribUserId, org_slug: "full-flow-affiliation-org" });
    expect(affilResp.status).toBe(200);

    // Step 3: GET /publications/potential_orgs then POST /publications/add_org
    const { orgIdInt: pubOrgId, orgId: pubOrgUlid } = await seedOrg(
      "Full Flow Pub Org",
      "full-flow-pub-org"
    );
    await seedOrgMember(pubOrgId, userIds);
    const potentialOrgsResp = await client.get(
      `/api/v1/publications/id/${publicationId}/candidate-orgs`
    );
    expect(potentialOrgsResp.status).toBe(200);
    expect(
      potentialOrgsResp.body.items.some(
        (o: { slug: string }) => o.slug === "full-flow-pub-org"
      )
    ).toBe(true);
    const addOrgResp = await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({ orgs: [{ orgId: pubOrgUlid }] });
    expect(addOrgResp.status).toBe(200);

    // Step 4: POST /publications/:slug/tags
    const tagsResp = await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({ tags: ["biology", "genomics"] });
    expect(tagsResp.status).toBe(200);

    // Step 5: POST /publications/:slug/linked-assets
    const assetsResp = await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({
        linkedAssets: [
          {
            type: "dataset",
            url: "https://example.com/DaTa.csv",
            name: "Dataset",
          },
        ],
      });
    expect(assetsResp.status).toBe(200);

    // Step 1b (PublicationEditor's publishMutation re-saves the draft first):
    // PUT /publications/:slug
    const updateResp = await client
      .patch(`/api/v1/publications/id/${publicationId}/draft`)
      .send({
        title: "Full Flow Publication",
        subtitle: "A subtitle",
        abstract: "An abstract.",
        body: "Final body content.",
        versionDesc: null,
        license: "CC BY",
      });
    expect(updateResp.status).toBe(200);

    // Step 6: POST /publications/id/:id/versions
    const publishResp = await client.post(
      `/api/v1/publications/id/${publicationId}/versions`
    );
    expect(publishResp.status).toBe(201);
    expect(publishResp.body).toMatchObject({
      slug,
      state: "PUBLISHED",
      versionNumber: 1,
    });

    describe("verify publication", () => {
      it(async () => {
        // Verify the published publication reflects every step of the flow.
        const finalResp = await new TestApiClient().get(
          `/api/v1/publications/p/${slug}`
        );
        expect(finalResp.status).toBe(200);
        const pub = finalResp.body.publication;
        expect(pub.state).toBe("PUBLISHED");
        expect(pub.title).toBe("Full Flow Publication");
        expect(pub.body).toBe("Final body content.");
        expect([...pub.tags].sort()).toEqual(["biology", "genomics"]);
        expect(pub.linked_assets).toHaveLength(1);
        expect(pub.linked_assets[0].url).toBe("https://example.com/DaTa.csv");
        expect(
          pub.orgs.some((o: { slug: string }) => o.slug === "full-flow-pub-org")
        ).toBe(true);
        const contributor = pub.contributors.find(
          (c: { user_id: number }) => c.user_id === contribUserId
        );
        expect(contributor).toBeDefined();
        expect(contributor.affiliations[0].slug).toBe(
          "full-flow-affiliation-org"
        );
      });
    });
  });
});

describe("GET /api/v1/users/me/publications", () => {
  it("lists the caller's publications, filtered by state", async () => {
    const {
      client,
      user,
      userId: ownerId,
    } = await registerUserWithId(makeUser("mypubsowner"));
    const draftOnly = await seedPublication({
      ownerId,
      slug: "my-draft-only",
      title: "Draft Only",
    });
    await seedPublication({
      ownerId,
      slug: "my-deleted",
      state: "DELETED",
      title: "Deleted",
    });
    const publishedOnly = await seedPublishedV1({
      slug: "my-published-only",
      ownerId,
      title: "Published Only",
    });
    const withPendingDraft = await seedPublishedV1({
      slug: "my-pending-draft",
      ownerId,
      title: "Pending Draft",
    });
    const { userId: otherOwnerId } = await registerUserWithId(
      makeUser("mypubsother")
    );
    await seedPublication({ ownerId: otherOwnerId, slug: "not-mine" });
    await client.login(user.username, user.password);

    const draftResp = await client.post(
      `/api/v1/publications/id/${withPendingDraft.pubIdUlid}/draft`
    );
    expect(draftResp.status).toBe(201);

    const list = async (qs: string) => {
      const resp = await client.get(`/api/v1/users/me/publications${qs}`);
      expect(resp.status).toBe(200);
      return resp.body;
    };
    const all = await list("");
    expect(all.pagination.total).toBe(3);
    expect(all.items).toContainEqual(
      expect.objectContaining({
        publicationId: draftOnly.id,
        state: "DRAFT",
        versionNumber: 1,
        title: "Draft Only",
      })
    );
    expect(all.items).toContainEqual(
      expect.objectContaining({
        publicationId: publishedOnly.pubIdUlid,
        state: "PUBLISHED",
        versionId: publishedOnly.versionIdUlid,
        versionNumber: 1,
      })
    );
    expect(all.items).toContainEqual(
      expect.objectContaining({
        publicationId: withPendingDraft.pubIdUlid,
        state: "PUBLISHED",
        versionId: draftResp.body.versionId,
        versionNumber: 2,
      })
    );

    const drafts = await list("?state=draft");
    expect(drafts.pagination.total).toBe(2);
    expect(
      drafts.items.map((i: { publicationId: string }) => i.publicationId).sort()
    ).toEqual([draftOnly.id, withPendingDraft.pubIdUlid].sort());

    const published = await list("?state=published");
    expect(published.pagination.total).toBe(2);
    expect(
      published.items
        .map((i: { publicationId: string }) => i.publicationId)
        .sort()
    ).toEqual([publishedOnly.pubIdUlid, withPendingDraft.pubIdUlid].sort());
  });

  it("rejects an unknown state", async () => {
    const { client, user } = await registerUserWithId(
      makeUser("mypubsbadstate")
    );
    await client.login(user.username, user.password);

    const resp = await client.get("/api/v1/users/me/publications?state=bogus");
    expect(resp.status).toBe(422);
  });
});

describe("deprecated publication routes", () => {
  it("still serves PATCH /id/:id, GET /drafts and POST /id/:id/publish", async () => {
    const { client, user, userId, userIds } = await registerUserWithId(
      makeUser("deprecatedroutes")
    );
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);

    const createResp = await client.post("/api/v1/publications").send({
      slug: "deprecated-routes-pub",
      title: "Deprecated Routes",
      abstract: "Abstract text.",
      body: "Body text.",
    });
    expect(createResp.status).toBe(201);
    const { publicationId } = createResp.body;

    const patchResp = await client
      .patch(`/api/v1/publications/id/${publicationId}`)
      .send({
        title: "Patched Through The Old Path",
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
    expect(patchResp.body.applied).toEqual(
      expect.arrayContaining(["title", "contributors"])
    );

    const draftsResp = await client.get("/api/v1/publications/drafts");
    expect(draftsResp.status).toBe(200);
    expect(draftsResp.body).toEqual(
      (await client.get("/api/v1/users/me/publications?state=draft")).body
    );
    expect(draftsResp.body.items).toContainEqual(
      expect.objectContaining({
        publicationId,
        title: "Patched Through The Old Path",
      })
    );

    const publishResp = await client.post(
      `/api/v1/publications/id/${publicationId}/publish`
    );
    expect(publishResp.status).toBe(200);
    expect(publishResp.headers.location).toBeUndefined();
    expect(publishResp.body).toMatchObject({
      publicationId,
      versionNumber: 1,
      state: "PUBLISHED",
    });
  });
});
