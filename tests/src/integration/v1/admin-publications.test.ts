import { escape } from "mysql2";
import { describe, expect, it } from "vitest";
import { itEnforcesAdminGate } from "./admin-gate.js";
import {
  endMembership,
  execute,
  expectValidationError,
  linkOrg,
  loggedInUser,
  makeUser,
  query,
  registerUserWithId,
  seedOrg,
  seedOrgMember,
  seedPublication,
  seedSiteAdmin,
  TestApiClient,
  UNAUTHENTICATED,
  type RouteCase,
} from "./helpers.js";

const ADMIN_LIST = "/api/v1/admin/publications";

// The column default migration 0030 gives every publication.
const DEFAULT_DOI_METADATA = {
  type: "datacite",
  content: {
    language: "en",
    types: { resourceTypeGeneral: "Other", resourceType: "Article" },
    subjects: [
      {
        subject: "FOS: Biological sciences",
        subjectScheme: "Fields of Science and Technology (FOS)",
      },
    ],
  },
};

const CUSTOM_DOI_METADATA = {
  type: "datacite",
  content: {
    language: "fr",
    types: { resourceTypeGeneral: "Dataset", resourceType: "Survey data" },
    subjects: [
      {
        subject: "FOS: Earth and related environmental sciences",
        subjectScheme: "Fields of Science and Technology (FOS)",
      },
    ],
  },
};

async function storedDoiMetadata(publicationIdInt: number) {
  const [row] = await query<{ doi_metadata: unknown }>(
    `SELECT doi_metadata FROM publications WHERE id_int = ${publicationIdInt}`
  );
  return row?.doi_metadata;
}

async function storedPublicationRow(publicationIdInt: number) {
  const [row] = await query(
    `SELECT * FROM publications WHERE id_int = ${publicationIdInt}`
  );
  return row;
}

async function markDeleted(publicationIdInt: number) {
  await execute(
    `UPDATE publications SET state = 'DELETED' WHERE id_int = ${publicationIdInt}`
  );
}

async function addTags(pub: { intId: number; id: string }, tags: string[]) {
  for (const tag of tags) {
    await execute(
      `INSERT INTO publication_tags (publication_id_int, publication_id, tag) VALUES (${pub.intId}, ${escape(pub.id)}, ${escape(tag)})`
    );
  }
}

async function addComments(
  pub: { intId: number; id: string },
  author: { id: string; id_int: number },
  total: number
) {
  for (let i = 0; i < total; i++) {
    await execute(
      `INSERT INTO comments (id, publication_id_int, publication_id, user_id_int, user_id, body, state) VALUES (ULID(), ${pub.intId}, ${escape(pub.id)}, ${author.id_int}, ${escape(author.id)}, 'Comment ${i}', 'PUBLISHED')`
    );
  }
}

// A published publication that was later removed: its last version is the
// one it was removed with, as the removal flow leaves it.
async function seedRemovedPublication(ownerId: number, slug: string) {
  const pub = await seedPublication({
    ownerId,
    slug,
    title: "Original Title",
    state: "PUBLISHED",
  });
  await execute(
    `INSERT INTO versions (publication_id_int, publication_id, version_number, title, version_desc, state) VALUES (${pub.intId}, ${escape(pub.id)}, 2, 'REMOVAL: Original Title', 'Removed due to legal obligations.', 'PUBLISHED')`
  );
  await execute(
    `UPDATE publications SET state = 'DELETED', latest_version_number = 2 WHERE id_int = ${pub.intId}`
  );
  const versions = await query<{ id: string; version_number: number }>(
    `SELECT id, version_number FROM versions WHERE publication_id_int = ${pub.intId} ORDER BY version_number`
  );
  return { ...pub, v1Id: versions[0]!.id, removedVersionId: versions[1]!.id };
}

function slugsOf(body: { items: { slug: string }[] }) {
  return body.items.map((item) => item.slug).sort();
}

const ADMIN_PUBLICATION_ROUTES: RouteCase<{ slug: string }>[] = [
  {
    name: "GET /publications",
    send: (client) => client.get(ADMIN_LIST),
  },
  {
    name: "GET /publications/{idOrSlug}",
    send: (client, { slug }) => client.get(`${ADMIN_LIST}/${slug}`),
  },
  {
    name: "GET /publications/{idOrSlug}/versions/{versionNumber}",
    send: (client, { slug }) => client.get(`${ADMIN_LIST}/${slug}/versions/1`),
  },
  {
    name: "PATCH /publications/{idOrSlug}",
    send: (client, { slug }) =>
      client
        .patch(`${ADMIN_LIST}/${slug}`)
        .send({ doiMetadata: CUSTOM_DOI_METADATA }),
  },
];

describe("/api/v1/admin/publications authorization gate", () => {
  itEnforcesAdminGate(ADMIN_PUBLICATION_ROUTES, async () => {
    const owner = await registerUserWithId(makeUser("owner"));
    const org = await seedOrg("Target Org", "target-org");
    const pub = await seedPublication({
      ownerId: owner.userId,
      slug: "target-pub",
      state: "PUBLISHED",
    });
    await linkOrg(org, pub);
    const before = await storedPublicationRow(pub.intId);
    return {
      org,
      target: { slug: "target-pub" },
      expectUntouched: async () => {
        expect(await storedPublicationRow(pub.intId)).toEqual(before);
      },
    };
  });

  it("rejects a signed-out caller before validating the query", async () => {
    const resp = await new TestApiClient().get(`${ADMIN_LIST}?state=bad`);
    expect(resp.status).toBe(401);
    expect(resp.body).toEqual(UNAUTHENTICATED);
  });
});

describe("GET /api/v1/admin/publications", () => {
  it("lists every publication for a site admin, removed ones included", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);

    await seedPublication({ ownerId: userId, slug: "a-draft" });
    await seedPublication({
      ownerId: userId,
      slug: "a-published",
      state: "PUBLISHED",
    });
    const deleted = await seedPublication({
      ownerId: userId,
      slug: "a-deleted",
      state: "PUBLISHED",
    });
    await markDeleted(deleted.intId);

    const resp = await client.get(ADMIN_LIST);
    expect(resp.status).toBe(200);
    expect(slugsOf(resp.body)).toEqual(["a-deleted", "a-draft", "a-published"]);
    expect(resp.body.pagination).toEqual({ total: 3, page: 1, perPage: 20 });
  });

  it("scopes an org admin to publications in orgs they administer", async () => {
    const owner = await registerUserWithId(makeUser("owner"));
    const { client, userIds } = await loggedInUser("orgadmin");

    const adminOrg = await seedOrg("Admin Org", "admin-org");
    const memberOrg = await seedOrg("Member Org", "member-org");
    const otherOrg = await seedOrg("Other Org", "other-org");
    await seedOrgMember(adminOrg.orgIdInt, userIds, "ADMIN");
    await seedOrgMember(memberOrg.orgIdInt, userIds);

    const inAdminOrg = await seedPublication({
      ownerId: owner.userId,
      slug: "in-admin-org",
    });
    const inMemberOrg = await seedPublication({
      ownerId: owner.userId,
      slug: "in-member-org",
    });
    const inOtherOrg = await seedPublication({
      ownerId: owner.userId,
      slug: "in-other-org",
    });
    await seedPublication({ ownerId: owner.userId, slug: "no-org" });
    await linkOrg(adminOrg, inAdminOrg);
    await linkOrg(memberOrg, inMemberOrg);
    await linkOrg(otherOrg, inOtherOrg);

    const resp = await client.get(ADMIN_LIST);
    expect(resp.status).toBe(200);
    expect(slugsOf(resp.body)).toEqual(["in-admin-org"]);
    expect(resp.body.pagination.total).toBe(1);
  });

  it("excludes orgs whose admin membership has ended", async () => {
    const owner = await registerUserWithId(makeUser("owner"));
    const { client, userIds } = await loggedInUser("orgadmin");

    const activeOrg = await seedOrg("Active Org", "active-org");
    const expiredOrg = await seedOrg("Expired Org", "expired-org");
    await seedOrgMember(activeOrg.orgIdInt, userIds, "ADMIN");
    await seedOrgMember(expiredOrg.orgIdInt, userIds, "ADMIN");
    await endMembership(expiredOrg, userIds);

    for (const slug of ["active-one", "active-two"]) {
      const pub = await seedPublication({ ownerId: owner.userId, slug });
      await linkOrg(activeOrg, pub);
    }
    const inExpiredOrg = await seedPublication({
      ownerId: owner.userId,
      slug: "expired-one",
    });
    await linkOrg(expiredOrg, inExpiredOrg);

    const resp = await client.get(ADMIN_LIST);
    expect(resp.status).toBe(200);
    expect(slugsOf(resp.body)).toEqual(["active-one", "active-two"]);
    expect(resp.body.pagination.total).toBe(2);
  });

  it("filters by state", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    await seedPublication({ ownerId: userId, slug: "the-draft" });
    await seedPublication({
      ownerId: userId,
      slug: "the-published",
      state: "PUBLISHED",
    });

    const published = await client.get(`${ADMIN_LIST}?state=published`);
    expect(published.status).toBe(200);
    expect(slugsOf(published.body)).toEqual(["the-published"]);

    const drafts = await client.get(`${ADMIN_LIST}?state=draft`);
    expect(drafts.status).toBe(200);
    expect(slugsOf(drafts.body)).toEqual(["the-draft"]);

    const all = await client.get(`${ADMIN_LIST}?state=all`);
    expect(slugsOf(all.body)).toEqual(["the-draft", "the-published"]);

    const invalid = await client.get(`${ADMIN_LIST}?state=deleted`);
    expect(invalid.status).toBe(422);
  });

  it("searches title and slug only", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    await seedPublication({
      ownerId: userId,
      slug: "mitosis-notes",
      title: "Unrelated Heading",
    });
    await seedPublication({
      ownerId: userId,
      slug: "unrelated-slug",
      title: "All About Mitosis",
    });
    const inBody = await seedPublication({
      ownerId: userId,
      slug: "body-only",
      title: "Nothing Here",
    });
    await execute(
      `UPDATE versions SET abstract = 'mitosis', body = 'mitosis' WHERE publication_id_int = ${inBody.intId}`
    );

    const resp = await client.get(`${ADMIN_LIST}?q=MITOSIS`);
    expect(resp.status).toBe(200);
    expect(slugsOf(resp.body)).toEqual(["mitosis-notes", "unrelated-slug"]);

    const byContributor = await client.get(`${ADMIN_LIST}?q=Siteadmin`);
    expect(byContributor.body.items).toHaveLength(0);

    const wildcard = await client.get(`${ADMIN_LIST}?q=%25`);
    expect(wildcard.body.items).toHaveLength(0);
  });

  it("attaches only each publication's own related rows", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    const alice = await registerUserWithId(makeUser("alice"));
    const bob = await registerUserWithId(makeUser("bob"));
    const orgA = await seedOrg("Org A", "org-a");
    const orgB = await seedOrg("Org B", "org-b");

    const pubA = await seedPublication({
      ownerId: alice.userId,
      slug: "pub-a",
      title: "Title A",
      state: "PUBLISHED",
    });
    const pubB = await seedPublication({
      ownerId: bob.userId,
      slug: "pub-b",
      title: "Title B",
    });
    const pubEmpty = await seedPublication({
      ownerId: userId,
      slug: "pub-empty",
      title: "Title Empty",
    });
    await execute(
      `DELETE FROM contributors WHERE version_id_int = ${pubEmpty.versionIdInt}`
    );

    // Linked before Org A so insertion order disagrees with priority order.
    const orgA2 = await seedOrg("Org A2", "org-a2");
    await linkOrg(orgA2, pubA, 1);
    await linkOrg(orgA, pubA);
    await linkOrg(orgB, pubB);
    await addTags(pubA, ["genetics", "imaging"]);
    await addTags(pubB, ["ecology"]);
    await addComments(pubA, alice.userIds, 2);
    await addComments(pubB, bob.userIds, 1);

    const resp = await client.get(ADMIN_LIST);
    expect(resp.status).toBe(200);
    expect(resp.body.pagination.total).toBe(3);

    const bySlug = Object.fromEntries(
      resp.body.items.map((item: { slug: string }) => [item.slug, item])
    );
    expect(bySlug["pub-a"]).toEqual({
      id: pubA.id,
      slug: "pub-a",
      doi: null,
      state: "PUBLISHED",
      versionNumber: 1,
      title: "Title A",
      abstract: null,
      createdAt: expect.any(String),
      contributors: [
        {
          userId: alice.userIds.id,
          firstName: "Alice",
          lastName: "User",
          avatar: null,
        },
      ],
      orgs: [
        {
          orgId: orgA.orgId,
          slug: "org-a",
          name: "Org A",
          avatar: null,
          priority: 0,
        },
        {
          orgId: orgA2.orgId,
          slug: "org-a2",
          name: "Org A2",
          avatar: null,
          priority: 1,
        },
      ],
      tags: expect.arrayContaining(["genetics", "imaging"]),
      commentsCount: 2,
    });
    expect(bySlug["pub-a"].tags).toHaveLength(2);
    expect(bySlug["pub-b"]).toEqual({
      id: pubB.id,
      slug: "pub-b",
      doi: null,
      state: "DRAFT",
      versionNumber: 1,
      title: "Title B",
      abstract: null,
      createdAt: expect.any(String),
      contributors: [
        {
          userId: bob.userIds.id,
          firstName: "Bob",
          lastName: "User",
          avatar: null,
        },
      ],
      orgs: [
        {
          orgId: orgB.orgId,
          slug: "org-b",
          name: "Org B",
          avatar: null,
          priority: 0,
        },
      ],
      tags: ["ecology"],
      commentsCount: 1,
    });
    expect(bySlug["pub-empty"]).toMatchObject({
      id: pubEmpty.id,
      contributors: [],
      orgs: [],
      tags: [],
      commentsCount: 0,
    });
  });

  it("shows and searches a recreated draft's live version", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);

    const created = await client.post("/api/v1/publications").send({
      slug: "recreated-draft",
      title: "Original Title",
      abstract: "Original abstract.",
    });
    expect(created.status).toBe(201);
    const draftUrl = `/api/v1/publications/id/${created.body.publicationId}/draft`;

    expect((await client.delete(draftUrl)).status).toBe(204);
    expect((await client.post(draftUrl)).status).toBe(201);
    const patched = await client
      .patch(draftUrl)
      .send({ title: "Recreated Title", abstract: "Recreated abstract." });
    expect(patched.status).toBe(200);
    expect(patched.body.applied).toEqual(
      expect.arrayContaining(["title", "abstract"])
    );

    const resp = await client.get(ADMIN_LIST);
    expect(resp.status).toBe(200);
    expect(resp.body.pagination.total).toBe(1);
    expect(resp.body.items).toEqual([
      expect.objectContaining({
        slug: "recreated-draft",
        state: "DRAFT",
        versionNumber: 2,
        title: "Recreated Title",
        abstract: "Recreated abstract.",
      }),
    ]);

    const byLiveTitle = await client.get(`${ADMIN_LIST}?q=Recreated`);
    expect(slugsOf(byLiveTitle.body)).toEqual(["recreated-draft"]);
    expect(byLiveTitle.body.pagination.total).toBe(1);

    const byDeletedTitle = await client.get(`${ADMIN_LIST}?q=Original`);
    expect(byDeletedTitle.body.items).toHaveLength(0);
    expect(byDeletedTitle.body.pagination.total).toBe(0);
  });

  it("paginates", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    for (const slug of ["page-a", "page-b", "page-c"]) {
      await seedPublication({ ownerId: userId, slug });
    }

    const resp = await client.get(`${ADMIN_LIST}?page=2&perPage=2`);
    expect(resp.status).toBe(200);
    expect(resp.body.items).toHaveLength(1);
    expect(resp.body.pagination).toEqual({ total: 3, page: 2, perPage: 2 });
  });
});

describe("GET /api/v1/admin/publications/:idOrSlug", () => {
  function versionSummaries(
    versions: { id: string; versionNumber: number; state: string }[]
  ) {
    return versions.map(({ id, versionNumber, state }) => ({
      id,
      versionNumber,
      state,
    }));
  }

  it("serves a recreated draft and lists it without the discarded one", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    const pub = await seedPublication({
      ownerId: userId,
      slug: "admin-recreated-draft",
    });

    const draftUrl = `/api/v1/publications/id/${pub.id}/draft`;
    expect((await client.delete(draftUrl)).status).toBe(204);
    const recreated = await client.post(draftUrl);
    expect(recreated.status).toBe(201);

    const resp = await client.get(`${ADMIN_LIST}/admin-recreated-draft`);
    expect(resp.status).toBe(200);
    expect(resp.body.publication.versionNumber).toBe(2);
    expect(versionSummaries(resp.body.publication.versions)).toEqual([
      { id: recreated.body.versionId, versionNumber: 2, state: "DRAFT" },
    ]);
  });

  it("serves the published version and lists a pending draft", async () => {
    const { client, user, userId, userIds } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    const slug = "admin-pending-draft";
    const pub = await seedPublication({
      ownerId: userId,
      slug,
      state: "PUBLISHED",
    });
    const [v1] = await query<{ id: string }>(
      `SELECT id FROM versions WHERE publication_id_int = ${pub.intId}`
    );
    const created = await client.post(
      `/api/v1/publications/id/${pub.id}/draft`
    );
    expect(created.status).toBe(201);

    const resp = await client.get(`${ADMIN_LIST}/${pub.id}`);
    expect(resp.status).toBe(200);
    expect(resp.body.publication.versionNumber).toBe(1);
    expect(resp.body.publication.contributors).toEqual([
      expect.objectContaining({
        userId: userIds.id,
        username: user.username,
      }),
    ]);
    expect(versionSummaries(resp.body.publication.versions)).toEqual([
      { id: created.body.versionId, versionNumber: 2, state: "DRAFT" },
      { id: v1!.id, versionNumber: 1, state: "PUBLISHED" },
    ]);

    // The public route is unchanged: published versions only, no state.
    const publicResp = await client.get(`/api/v1/publications/p/${slug}`);
    expect(publicResp.status).toBe(200);
    expect(publicResp.body.publication.versions).toEqual([
      expect.not.objectContaining({ state: expect.anything() }),
    ]);
    expect(publicResp.body.publication.versions[0].id).toBe(v1!.id);
    expect(publicResp.body.publication.contributors[0]).not.toHaveProperty(
      "username"
    );
  });

  it("agrees with the list when the latest version number isn't published", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    const slug = "admin-unpublished-latest";
    const pub = await seedPublication({
      ownerId: userId,
      slug,
      state: "PUBLISHED",
    });
    const created = await client.post(
      `/api/v1/publications/id/${pub.id}/draft`
    );
    expect(created.status).toBe(201);
    await execute(
      `UPDATE publications SET latest_version_number = 2 WHERE id_int = ${pub.intId}`
    );

    const list = await client.get(ADMIN_LIST);
    expect(list.status).toBe(200);
    expect(slugsOf(list.body)).not.toContain(slug);
    expect((await client.get(`${ADMIN_LIST}/${slug}`)).status).toBe(404);
  });

  it("counts the publication's comments in every state", async () => {
    const { client, userId, userIds } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    const pub = await seedPublication({
      ownerId: userId,
      slug: "admin-comment-count",
      state: "PUBLISHED",
    });
    const otherPub = await seedPublication({
      ownerId: userId,
      slug: "admin-comment-count-other",
      state: "PUBLISHED",
    });
    const seededComments = [
      [pub, "PUBLISHED"],
      [pub, "WITHDRAWN"],
      [pub, "MODERATED"],
      [pub, "DELETED"],
      [otherPub, "PUBLISHED"],
    ] as const;
    for (const [target, state] of seededComments) {
      await execute(
        `INSERT INTO comments (id, publication_id_int, publication_id, user_id_int, user_id, body, state) VALUES (ULID(), ${target.intId}, ${escape(target.id)}, ${userIds.id_int}, ${escape(userIds.id)}, 'A comment', ${escape(state)})`
      );
    }

    const resp = await client.get(`${ADMIN_LIST}/admin-comment-count`);
    expect(resp.status).toBe(200);
    expect(resp.body.publication.commentsCount).toBe(4);
  });

  it("only finds publications in an org admin's own orgs", async () => {
    const owner = await registerUserWithId(makeUser("owner"));
    const { client, userIds } = await loggedInUser("orgadmin");
    const adminOrg = await seedOrg("Admin Org", "admin-org");
    const otherOrg = await seedOrg("Other Org", "other-org");
    await seedOrgMember(adminOrg.orgIdInt, userIds, "ADMIN");

    const mine = await seedPublication({
      ownerId: owner.userId,
      slug: "in-my-org",
      state: "PUBLISHED",
    });
    const theirs = await seedPublication({
      ownerId: owner.userId,
      slug: "in-their-org",
      state: "PUBLISHED",
    });
    await linkOrg(adminOrg, mine);
    await linkOrg(otherOrg, theirs);

    expect((await client.get(`${ADMIN_LIST}/in-my-org`)).status).toBe(200);
    const outside = await client.get(`${ADMIN_LIST}/in-their-org`);
    expect(outside.status).toBe(404);
    expect(outside.body).toEqual({
      type: "application_error",
      errors: { publication: { message: "Publication not found" } },
    });
  });

  it("serves the publication's stored DOI metadata", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    const pub = await seedPublication({
      ownerId: userId,
      slug: "with-doi-metadata",
    });

    const initial = await client.get(`${ADMIN_LIST}/with-doi-metadata`);
    expect(initial.status).toBe(200);
    expect(initial.body.publication.doiMetadata).toEqual(DEFAULT_DOI_METADATA);

    await execute(
      `UPDATE publications SET doi_metadata = ${escape(JSON.stringify(CUSTOM_DOI_METADATA))} WHERE id_int = ${pub.intId}`
    );
    const updated = await client.get(`${ADMIN_LIST}/with-doi-metadata`);
    expect(updated.body.publication.doiMetadata).toEqual(CUSTOM_DOI_METADATA);
  });
});

describe("PATCH /api/v1/admin/publications/:idOrSlug", () => {
  it("saves DOI metadata for an org admin's own publication and serves it", async () => {
    const owner = await registerUserWithId(makeUser("owner"));
    const { client, userIds } = await loggedInUser("orgadmin");
    const org = await seedOrg("Admin Org", "admin-org");
    await seedOrgMember(org.orgIdInt, userIds, "ADMIN");
    const pub = await seedPublication({
      ownerId: owner.userId,
      slug: "in-my-org",
      state: "PUBLISHED",
    });
    await linkOrg(org, pub);
    const before = await client.get(`${ADMIN_LIST}/in-my-org`);
    expect(before.status).toBe(200);

    const resp = await client
      .patch(`${ADMIN_LIST}/in-my-org`)
      .send({ doiMetadata: CUSTOM_DOI_METADATA });

    expect(resp.status).toBe(200);
    expect(resp.body.publication).toEqual({
      ...before.body.publication,
      doiMetadata: CUSTOM_DOI_METADATA,
    });
    expect(await storedDoiMetadata(pub.intId)).toEqual(CUSTOM_DOI_METADATA);
    const reread = await client.get(`${ADMIN_LIST}/in-my-org`);
    expect(reread.body.publication).toEqual(resp.body.publication);
  });

  it("rejects DOI metadata that doesn't match the schema and leaves the publication untouched", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    const pub = await seedPublication({
      ownerId: userId,
      slug: "bad-metadata",
    });
    const before = await storedPublicationRow(pub.intId);

    const resp = await client.patch(`${ADMIN_LIST}/bad-metadata`).send({
      doiMetadata: {
        ...CUSTOM_DOI_METADATA,
        content: {
          ...CUSTOM_DOI_METADATA.content,
          language: "French",
          subjects: [],
        },
      },
    });

    expectValidationError(resp);
    expect(
      (resp.body.errors as { path: unknown[] }[]).map(({ path }) => path)
    ).toEqual(
      expect.arrayContaining([
        ["doiMetadata", "content", "language"],
        ["doiMetadata", "content", "subjects"],
      ])
    );
    expect(await storedPublicationRow(pub.intId)).toEqual(before);
  });

  it("only updates publications in an org admin's own orgs", async () => {
    const owner = await registerUserWithId(makeUser("owner"));
    const { client, userIds } = await loggedInUser("orgadmin");
    const adminOrg = await seedOrg("Admin Org", "admin-org");
    const otherOrg = await seedOrg("Other Org", "other-org");
    await seedOrgMember(adminOrg.orgIdInt, userIds, "ADMIN");
    const theirs = await seedPublication({
      ownerId: owner.userId,
      slug: "in-their-org",
      state: "PUBLISHED",
    });
    await linkOrg(otherOrg, theirs);
    const before = await storedPublicationRow(theirs.intId);

    const resp = await client
      .patch(`${ADMIN_LIST}/in-their-org`)
      .send({ doiMetadata: CUSTOM_DOI_METADATA });

    expect(resp.status).toBe(404);
    expect(resp.body).toEqual({
      type: "application_error",
      errors: { publication: { message: "Publication not found" } },
    });
    expect(await storedPublicationRow(theirs.intId)).toEqual(before);
  });
});

describe("removed publications", () => {
  it("lists removed publications with the removed and all filters", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    await seedRemovedPublication(userId, "removed-pub");
    await seedPublication({
      ownerId: userId,
      slug: "live-pub",
      state: "PUBLISHED",
    });

    const removed = await client.get(`${ADMIN_LIST}?state=removed`);
    expect(removed.status).toBe(200);
    expect(removed.body.items).toEqual([
      expect.objectContaining({
        slug: "removed-pub",
        state: "DELETED",
        versionNumber: 2,
        title: "REMOVAL: Original Title",
      }),
    ]);
    expect(slugsOf((await client.get(ADMIN_LIST)).body)).toEqual([
      "live-pub",
      "removed-pub",
    ]);
  });

  it("serves a removed publication's last version and lists its versions", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    const pub = await seedRemovedPublication(userId, "removed-detail");
    await execute(
      `INSERT INTO versions (publication_id_int, publication_id, version_number, title, state) VALUES (${pub.intId}, ${escape(pub.id)}, 3, 'Leftover draft', 'DRAFT')`
    );
    const [leftover] = await query<{ id: string }>(
      `SELECT id FROM versions WHERE publication_id_int = ${pub.intId} AND version_number = 3`
    );

    const resp = await client.get(`${ADMIN_LIST}/removed-detail`);
    expect(resp.status).toBe(200);
    expect(resp.body.publication.state).toBe("DELETED");
    expect(resp.body.publication.versionNumber).toBe(2);
    expect(resp.body.publication.title).toBe("REMOVAL: Original Title");
    expect(
      resp.body.publication.versions.map(
        (v: { id: string; versionNumber: number; state: string }) => ({
          id: v.id,
          versionNumber: v.versionNumber,
          state: v.state,
        })
      )
    ).toEqual([
      { id: leftover!.id, versionNumber: 3, state: "DRAFT" },
      { id: pub.removedVersionId, versionNumber: 2, state: "PUBLISHED" },
      { id: pub.v1Id, versionNumber: 1, state: "PUBLISHED" },
    ]);
  });

  it("serves and lists a removed never-published publication's live draft", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    const pub = await seedPublication({
      ownerId: userId,
      slug: "removed-draft",
      title: "Discarded Title",
    });
    const draftUrl = `/api/v1/publications/id/${pub.id}/draft`;
    expect((await client.delete(draftUrl)).status).toBe(204);
    const recreated = await client.post(draftUrl);
    expect(recreated.status).toBe(201);
    expect(
      (await client.patch(draftUrl).send({ title: "Live Title" })).status
    ).toBe(200);
    // v0 removes never-published publications by state alone.
    await markDeleted(pub.intId);

    const list = await client.get(`${ADMIN_LIST}?state=removed`);
    expect(list.status).toBe(200);
    expect(list.body.items).toEqual([
      expect.objectContaining({
        slug: "removed-draft",
        state: "DELETED",
        versionNumber: 2,
        title: "Live Title",
      }),
    ]);
    const byDiscardedTitle = await client.get(
      `${ADMIN_LIST}?state=removed&q=Discarded`
    );
    expect(byDiscardedTitle.body.items).toHaveLength(0);

    const resp = await client.get(`${ADMIN_LIST}/removed-draft`);
    expect(resp.status).toBe(200);
    expect(resp.body.publication.state).toBe("DELETED");
    expect(resp.body.publication.versionNumber).toBe(2);
    expect(resp.body.publication.title).toBe("Live Title");
    expect(
      resp.body.publication.versions.map(
        (v: { id: string; versionNumber: number; state: string }) => ({
          id: v.id,
          versionNumber: v.versionNumber,
          state: v.state,
        })
      )
    ).toEqual([
      { id: recreated.body.versionId, versionNumber: 2, state: "DRAFT" },
    ]);
  });

  it("shows org admins removed publications in their own orgs only", async () => {
    const owner = await registerUserWithId(makeUser("owner"));
    const { client, userIds } = await loggedInUser("orgadmin");
    const adminOrg = await seedOrg("Admin Org", "admin-org");
    const otherOrg = await seedOrg("Other Org", "other-org");
    await seedOrgMember(adminOrg.orgIdInt, userIds, "ADMIN");
    const mine = await seedRemovedPublication(
      owner.userId,
      "removed-in-my-org"
    );
    const theirs = await seedRemovedPublication(
      owner.userId,
      "removed-in-their-org"
    );
    await linkOrg(adminOrg, mine);
    await linkOrg(otherOrg, theirs);

    const list = await client.get(`${ADMIN_LIST}?state=removed`);
    expect(list.status).toBe(200);
    expect(slugsOf(list.body)).toEqual(["removed-in-my-org"]);
    expect(slugsOf((await client.get(ADMIN_LIST)).body)).toEqual([
      "removed-in-my-org",
    ]);

    const visible = await client.get(`${ADMIN_LIST}/removed-in-my-org`);
    expect(visible.status).toBe(200);
    expect(visible.body.publication.id).toBe(mine.id);
    expect(visible.body.publication.state).toBe("DELETED");

    const hidden = await client.get(`${ADMIN_LIST}/removed-in-their-org`);
    expect(hidden.status).toBe(404);
    expect(hidden.body).toEqual({
      type: "application_error",
      errors: { publication: { message: "Publication not found" } },
    });
  });
});

describe("GET /api/v1/admin/publications/:idOrSlug/versions/:versionNumber", () => {
  it("serves an earlier version with its own body, release notes and DOI", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    const pub = await seedPublication({
      ownerId: userId,
      slug: "admin-two-versions",
      title: "First Title",
      state: "PUBLISHED",
    });
    await execute(
      `UPDATE versions SET body = 'First body', version_desc = 'First release', doi = '10.1234/v1' WHERE publication_id_int = ${pub.intId}`
    );
    await execute(
      `INSERT INTO versions (publication_id_int, publication_id, version_number, title, body, version_desc, doi, state) VALUES (${pub.intId}, ${escape(pub.id)}, 2, 'Second Title', 'Second body', 'Second release', '10.1234/v2', 'PUBLISHED')`
    );
    await execute(
      `UPDATE publications SET latest_version_number = 2 WHERE id_int = ${pub.intId}`
    );

    const resp = await client.get(
      `${ADMIN_LIST}/admin-two-versions/versions/1`
    );
    expect(resp.status).toBe(200);
    expect(resp.body.publication).toEqual(
      expect.objectContaining({
        versionNumber: 1,
        title: "First Title",
        body: "First body",
        versionDesc: "First release",
        versionDoi: "10.1234/v1",
      })
    );
    // The version route lists the same versions as the detail route.
    const detail = await client.get(`${ADMIN_LIST}/admin-two-versions`);
    expect(resp.body.publication.versions).toEqual(
      detail.body.publication.versions
    );
  });

  it("serves the current draft", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    const pub = await seedPublication({
      ownerId: userId,
      slug: "admin-version-draft",
      state: "PUBLISHED",
    });
    const created = await client.post(
      `/api/v1/publications/id/${pub.id}/draft`
    );
    expect(created.status).toBe(201);

    const resp = await client.get(
      `${ADMIN_LIST}/admin-version-draft/versions/2`
    );
    expect(resp.status).toBe(200);
    expect(resp.body.publication.versionNumber).toBe(2);
    expect(resp.body.publication.versions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.body.versionId,
          versionNumber: 2,
          state: "DRAFT",
        }),
      ])
    );
  });

  it("only serves the versions the detail route lists", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    const pub = await seedRemovedPublication(userId, "removed-versions");
    await execute(
      `INSERT INTO versions (publication_id_int, publication_id, version_number, title, state) VALUES (${pub.intId}, ${escape(pub.id)}, 3, 'Leftover draft', 'DRAFT')`
    );
    // Hidden by the detail route: a discarded draft.
    await execute(
      `INSERT INTO versions (publication_id_int, publication_id, version_number, title, state) VALUES (${pub.intId}, ${escape(pub.id)}, 4, 'Discarded draft', 'DELETED')`
    );

    const first = await client.get(`${ADMIN_LIST}/removed-versions/versions/1`);
    expect(first.status).toBe(200);
    expect(first.body.publication.title).toBe("Original Title");

    const draft = await client.get(`${ADMIN_LIST}/removed-versions/versions/3`);
    expect(draft.status).toBe(200);
    expect(draft.body.publication.versionNumber).toBe(3);
    expect(draft.body.publication.title).toBe("Leftover draft");

    for (const versionNumber of [4, 9]) {
      const resp = await client.get(
        `${ADMIN_LIST}/removed-versions/versions/${versionNumber}`
      );
      expect(resp.status).toBe(404);
      expect(resp.body).toEqual({
        type: "application_error",
        errors: { version: { message: "Version not found" } },
      });
    }
  });

  it("returns the detail route's 404 when the latest version number isn't published", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    const slug = "version-unpublished-latest";
    const pub = await seedPublication({
      ownerId: userId,
      slug,
      state: "PUBLISHED",
    });
    expect(
      (await client.post(`/api/v1/publications/id/${pub.id}/draft`)).status
    ).toBe(201);
    // Out of step: the latest version number points at the draft, so no
    // version is served and the detail route and the list both hide it.
    await execute(
      `UPDATE publications SET latest_version_number = 2 WHERE id_int = ${pub.intId}`
    );

    const detail = await client.get(`${ADMIN_LIST}/${slug}`);
    expect(detail.status).toBe(404);
    for (const versionNumber of [1, 2]) {
      const resp = await client.get(
        `${ADMIN_LIST}/${slug}/versions/${versionNumber}`
      );
      expect(resp.status).toBe(404);
      expect(resp.body).toEqual(detail.body);
    }
    expect(detail.body).toEqual({
      type: "application_error",
      errors: { publication: { message: "Publication not found" } },
    });
  });

  it("only finds versions of publications in an org admin's own orgs", async () => {
    const owner = await registerUserWithId(makeUser("owner"));
    const { client, userIds } = await loggedInUser("orgadmin");
    const adminOrg = await seedOrg("Admin Org", "admin-org");
    const otherOrg = await seedOrg("Other Org", "other-org");
    await seedOrgMember(adminOrg.orgIdInt, userIds, "ADMIN");
    const mine = await seedPublication({
      ownerId: owner.userId,
      slug: "version-in-my-org",
      state: "PUBLISHED",
    });
    const theirs = await seedPublication({
      ownerId: owner.userId,
      slug: "version-in-their-org",
      state: "PUBLISHED",
    });
    await linkOrg(adminOrg, mine);
    await linkOrg(otherOrg, theirs);

    expect(
      (await client.get(`${ADMIN_LIST}/version-in-my-org/versions/1`)).status
    ).toBe(200);
    const outside = await client.get(
      `${ADMIN_LIST}/version-in-their-org/versions/1`
    );
    expect(outside.status).toBe(404);
    expect(outside.body).toEqual({
      type: "application_error",
      errors: { publication: { message: "Publication not found" } },
    });
  });

  it("serves a removed never-published publication's live draft, not the discarded one", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    const pub = await seedPublication({
      ownerId: userId,
      slug: "removed-draft-version",
      title: "Discarded Title",
    });
    const draftUrl = `/api/v1/publications/id/${pub.id}/draft`;
    expect((await client.delete(draftUrl)).status).toBe(204);
    expect((await client.post(draftUrl)).status).toBe(201);
    expect(
      (await client.patch(draftUrl).send({ title: "Live Title" })).status
    ).toBe(200);
    // v0 removes never-published publications by state alone.
    await markDeleted(pub.intId);

    const live = await client.get(
      `${ADMIN_LIST}/removed-draft-version/versions/2`
    );
    expect(live.status).toBe(200);
    expect(live.body.publication.title).toBe("Live Title");
    const discarded = await client.get(
      `${ADMIN_LIST}/removed-draft-version/versions/1`
    );
    expect(discarded.status).toBe(404);
    expect(discarded.body).toEqual({
      type: "application_error",
      errors: { version: { message: "Version not found" } },
    });
  });

  it("rejects every version number spelling but plain digits in range", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    // Signed in as an admin so requireAdminScope lets the request reach
    // validation. The long ones convert inexactly, or to Infinity.
    for (const spelling of [
      "v1",
      "0",
      "02",
      "2.0",
      "0x2",
      "2e0",
      "+2",
      "9".repeat(20),
      "9".repeat(400),
    ]) {
      expect(
        (await client.get(`${ADMIN_LIST}/anything/versions/${spelling}`)).status
      ).toBe(422);
    }
  });
});
