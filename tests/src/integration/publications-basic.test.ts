import { escape } from "mysql2";
import { assert, describe, expect, it } from "vitest";
import {
  execute,
  getUserId,
  getUserIds,
  makeUser,
  query,
  registerUser,
  registerUserWithId,
  seedOrg,
  seedOrgMember,
  seedPublication,
  seedSiteAdmin,
  TestApiClient,
  waitForRows,
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

describe("/api/publications", () => {
  it("lists publications", async () => {
    let resp = await new TestApiClient().get("/api/publications");
    expect(resp.status).toBe(200);
    expect(resp.body.items).toBeDefined();

    const { client, userId } = await registerUserWithId();
    await seedPublication({
      slug: "listed-new-pub",
      ownerId: userId,
      state: "PUBLISHED",
      title: "Published Article",
    });
    resp = await client.get("/api/publications");
    expect(resp.status).toBe(200);
    expect(resp.body.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it("gets published publications by slug", async () => {
    const { client, userId } = await registerUserWithId();
    await seedPublication({
      slug: "get-me-new-pub",
      ownerId: userId,
      state: "PUBLISHED",
    });
    expect((await client.get("/api/publications/get-me-new-pub")).status).toBe(
      200
    );
    expect((await client.get("/api/publications/does-not-exist")).status).toBe(
      404
    );
  });

  it("gets latest version for deleted publications regardless of requested version", async () => {
    const { client, userId } = await registerUserWithId();
    await seedDeletedMultiVersion({
      slug: "deleted-multi-version",
      ownerId: userId,
    });

    for (const path of [
      "/api/publications/deleted-multi-version",
      "/api/publications/deleted-multi-version/v1",
      "/api/publications/deleted-multi-version/v999",
    ]) {
      const resp = await client.get(path);
      expect(resp.status).toBe(200);
      expect(resp.body.publication.state).toBe("DELETED");
      expect(resp.body.publication.version_number).toBe(2);
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
    const resp = await anonClient.get("/api/publications/deleted-anon-view");
    expect(resp.status).toBe(200);
    expect(resp.body.publication.state).toBe("DELETED");
    expect(resp.body.publication.version_number).toBe(2);
    expect(resp.body.publication.title).toBe("Deleted V2 Title");
  });

  it("returns 404 for deleted publications without a DOI", async () => {
    const { client, userId } = await registerUserWithId();
    await seedPublication({
      slug: "deleted-without-doi",
      ownerId: userId,
      state: "DELETED",
    });

    for (const path of [
      "/api/publications/deleted-without-doi",
      "/api/publications/deleted-without-doi.json",
      "/api/publications/deleted-without-doi.md",
      "/api/publications/deleted-without-doi/v1",
      "/api/publications/deleted-without-doi/v1.json",
      "/api/publications/deleted-without-doi/v1.md",
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
    const adminResp = await adminClient.post("/api/publications").send({
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
    expect(
      (
        await memberClient.post("/api/publications").send({
          slug: "org-pub-arcadia",
          title: "Org Pub",
          abstract: "From an org member.",
          body: "",
        })
      ).status
    ).toBe(201);
  });

  it("rejects create requests without permission", async () => {
    const client = new TestApiClient();
    expect(
      (
        await client
          .post("/api/publications")
          .send({ slug: "unauthorized", title: "Nope", body: "" })
      ).status
    ).toBe(401);
    const user = await registerUser(client);
    await client.login(user.username, user.password);
    expect(
      (
        await client
          .post("/api/publications")
          .send({ slug: "forbidden-pub", title: "Should Fail", body: "" })
      ).status
    ).toBe(403);
  });

  it("updates and deletes drafts only for owners", async () => {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await seedPublication({
      slug: "editable-pub",
      ownerId: userId,
      state: "DRAFT",
    });
    await seedPublication({
      slug: "deletable-pub",
      ownerId: userId,
      state: "DRAFT",
    });
    await client.login(user.username, user.password);

    expect(
      (
        await client.put("/api/publications/editable-pub").send({
          title: "Edited Title",
          abstract: "Updated abstract",
          body: "Updated body text.",
        })
      ).status
    ).toBe(200);
    expect(
      (await client.delete("/api/publications/deletable-pub/draft")).status
    ).toBe(204);

    await seedPublication({
      slug: "not-mine-pub",
      ownerId: userId,
      state: "DRAFT",
    });
    const other = makeUser("other");
    await registerUser(new TestApiClient(), other);
    await client.login(other.username, other.password);
    expect(
      (
        await client
          .put("/api/publications/not-mine-pub")
          .send({ title: "Hijack" })
      ).status
    ).toBe(403);
  });

  it("allows site admins, but not unrelated users, to view drafts", async () => {
    const { userId: ownerId } = await registerUserWithId(
      makeUser("draftowner")
    );
    await seedPublication({
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
      "/api/publications/admin-visible-draft/draft"
    );
    expect(adminResp.status).toBe(200);
    expect(adminResp.body.publication.slug).toBe("admin-visible-draft");

    const otherClient = new TestApiClient();
    const other = await registerUser(otherClient, makeUser("draftstranger"));
    await otherClient.login(other.username, other.password);

    expect(
      (await otherClient.get("/api/publications/admin-visible-draft/draft"))
        .status
    ).toBe(403);
  });

  it("sets tags and contributors", async () => {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await seedPublication({
      slug: "tagged-new-pub",
      ownerId: userId,
      state: "DRAFT",
    });
    await seedPublication({
      slug: "collab-new-pub",
      ownerId: userId,
      state: "DRAFT",
    });
    await client.login(user.username, user.password);

    expect(
      (
        await client
          .post("/api/publications/tagged-new-pub/tags")
          .send({ tags: ["biology", "chemistry"] })
      ).status
    ).toBe(200);
    const tagged = await client.get("/api/publications/tagged-new-pub/draft");
    expect(tagged.status).toBe(200);
    expect(tagged.body.publication.tags).toContain("biology");

    await registerUser(new TestApiClient(), makeUser("contrib"));
    await client.login(user.username, user.password);
    expect(
      (
        await client
          .post("/api/publications/add_contrib")
          .send({ slug: "collab-new-pub", username: "contrib", role: "author" })
      ).status
    ).toBe(200);
  });

  it("creates, updates, preserves, rejects, and clears embed URLs", async () => {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);

    expect(
      (
        await client.post("/api/publications").send({
          slug: "embed-create",
          title: "Embed Test",
          abstract: "Testing embed fields.",
          body: "",
          feedback_form_embed_src: "https://example.com/form",
          social_posts_embed_src: "https://example.com/posts",
        })
      ).status
    ).toBe(201);
    let pub = (await client.get("/api/publications/embed-create/draft")).body
      .publication;
    expect(pub.feedback_form_embed_src).toBe("https://example.com/form");
    expect(pub.social_posts_embed_src).toBe("https://example.com/posts");

    expect(
      (
        await client.put("/api/publications/embed-create").send({
          title: "Updated",
          abstract: "Updated abstract",
          body: "Updated body",
          feedback_form_embed_src: "https://example.com/new-form",
          social_posts_embed_src: "https://example.com/new-posts",
        })
      ).status
    ).toBe(200);
    pub = (await client.get("/api/publications/embed-create/draft")).body
      .publication;
    expect(pub.feedback_form_embed_src).toBe("https://example.com/new-form");
    expect(pub.social_posts_embed_src).toBe("https://example.com/new-posts");

    expect(
      (
        await client
          .put("/api/publications/embed-create")
          .send({ title: "Changed Title", abstract: "New abstract", body: "" })
      ).status
    ).toBe(200);
    pub = (await client.get("/api/publications/embed-create/draft")).body
      .publication;
    expect(pub.feedback_form_embed_src).toBe("https://example.com/new-form");

    const badCreate = await client.post("/api/publications").send({
      slug: "embed-bad-proto",
      title: "Bad Proto",
      abstract: "Abstract.",
      body: "",
      feedback_form_embed_src: "http://example.com/form",
    });
    expect(badCreate.status).toBe(400);
    expect(badCreate.body.error).toContain("https://");

    const badUpdate = await client.put("/api/publications/embed-create").send({
      title: "T",
      abstract: "A",
      body: "",
      social_posts_embed_src: "javascript:alert(1)",
    });
    expect(badUpdate.status).toBe(400);
    expect(badUpdate.body.error).toContain("https://");

    expect(
      (
        await client.put("/api/publications/embed-create").send({
          title: "Clear Test",
          abstract: "Abstract.",
          body: "",
          feedback_form_embed_src: "",
          social_posts_embed_src: "",
        })
      ).status
    ).toBe(200);
    pub = (await client.get("/api/publications/embed-create/draft")).body
      .publication;
    expect(pub.feedback_form_embed_src).toBeNull();
    expect(pub.social_posts_embed_src).toBeNull();
  });
});

describe("POST /api/publications/:slug/draft", () => {
  it("creates or returns a draft from the latest version", async () => {
    const { client, user, userId: ownerId } = await registerUserWithId();
    const { pubId, versionId } = await seedPublishedV1({
      slug: "based-on-latest",
      ownerId,
      title: "V1 Title",
      subtitle: "V1 Subtitle",
      abstract: "V1 Abstract",
      body: "V1 Body",
      versionDesc: "V1 release notes",
    });
    // As of this commit, triggers are not installed so we need to pass the ULID
    await execute(
      `INSERT INTO linked_assets (version_id_int, type, url, name) VALUES (${versionId}, 'dataset', 'https://example.com/data.csv', 'Dataset')`
    );
    const { orgIdInt: orgId } = await seedOrg(
      "Arcadia Science",
      "arcadia-science"
    );
    await execute(
      `INSERT INTO contributors (version_id_int, user_id_int, roles, in_byline, priority) VALUES (${versionId}, ${ownerId}, '["author"]', TRUE, 1)`
    );
    await execute(
      `INSERT INTO contributor_affiliations (version_id_int, user_id_int, affiliated_org_id_int) VALUES (${versionId}, ${ownerId}, ${orgId})`
    );
    await client.login(user.username, user.password);

    const first = await client.post("/api/publications/based-on-latest/draft");
    expect(first.status).toBe(201);
    expect(first.body.publication.title).toBe("V1 Title");
    expect(first.body.publication.subtitle).toBe("V1 Subtitle");
    expect(first.body.publication.abstract).toBe("V1 Abstract");
    expect(first.body.publication.body).toBe("V1 Body");
    expect(first.body.publication.version_number).toBe(2);
    expect(first.body.publication.linked_assets[0].url).toBe(
      "https://example.com/data.csv"
    );
    expect(first.body.publication.contributors[0].affiliations[0].slug).toBe(
      "arcadia-science"
    );

    const draftRows = await query<{
      id: number;
      version_number: number;
      state: string;
      title: string;
      body: string;
    }>(
      `SELECT id, version_number, state, title, body FROM versions WHERE publication_id_int = ${pubId} AND state = 'DRAFT'`
    );
    expect(draftRows).toHaveLength(1);
    expect(draftRows[0]!.version_number).toBe(2);

    const second = await client.post("/api/publications/based-on-latest/draft");
    expect(second.status).toBe(200);
    expect(second.body.publication.id).toBe(first.body.publication.id);
  });

  it("handles unauthorized, not found, and forbidden cases", async () => {
    const { client, user, userId: ownerId } = await registerUserWithId();
    await seedPublishedV1({ slug: "ghost-new-pub", ownerId });
    expect(
      (await new TestApiClient().post("/api/publications/ghost/draft")).status
    ).toBe(401);

    await client.login(user.username, user.password);
    expect(
      (await client.post("/api/publications/does-not-exist/draft")).status
    ).toBe(404);

    await seedPublishedV1({ slug: "not-yours-pub", ownerId });
    const other = makeUser("intruder");
    await registerUser(new TestApiClient(), other);
    await client.login(other.username, other.password);
    expect(
      (await client.post("/api/publications/not-yours-pub/draft")).status
    ).toBe(403);
  });

  it("returns 404 when latest_version_number points at a missing version", async () => {
    const { client, user, userId: ownerId } = await registerUserWithId();
    await execute(
      `INSERT INTO publications (slug, owner_id_int, state, latest_version_number) VALUES ('orphan', ${ownerId}, 'PUBLISHED', 1)`
    );
    await client.login(user.username, user.password);
    expect((await client.post("/api/publications/orphan/draft")).status).toBe(
      404
    );
  });
});

describe("POST /api/publications/:slug/publish", () => {
  it("publishes a brand-new draft (version 1)", async () => {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);

    // TODO slug should only need to be 12 characters
    // const slug =  "publish-me-v1",
    const slug = "publish-me-v1-aaaa";
    const createResp = await client.post("/api/publications").send({
      slug,
      title: "Publish Me",
      abstract: "Abstract text.",
      body: "Body text.",
    });
    expect(createResp.status).toBe(201);

    // Publishing requires at least one byline contributor.
    const addContribResp = await client
      .post("/api/publications/add_contrib")
      .send({
        slug,
        username: user.username,
        role: "author",
        in_byline: true,
      });
    expect(addContribResp.status).toBe(200);

    const publishResp = await client.post(`/api/publications/${slug}/publish`);
    expect(publishResp.status).toBe(200);
    expect(publishResp.body).toMatchObject({
      slug,
      version_number: 1,
      state: "PUBLISHED",
    });

    const pubRows = await query<{
      state: string;
      latest_version_number: number;
    }>(
      `SELECT state, latest_version_number FROM publications WHERE slug = ${escape(slug)}`
    );
    expect(pubRows[0]!.state).toBe("PUBLISHED");
    expect(pubRows[0]!.latest_version_number).toBe(1);

    const versionRows = await query<{ state: string }>(
      `SELECT state FROM versions WHERE publication_id_int = (SELECT id_int FROM publications WHERE slug = ${escape(slug)}) AND version_number = 1`
    );
    expect(versionRows[0]!.state).toBe("PUBLISHED");

    // Now publicly visible, matching what the "Preview" -> live page transition assumes.
    const anonResp = await new TestApiClient().get(`/api/publications/${slug}`);
    expect(anonResp.status).toBe(200);
    expect(anonResp.body.publication.state).toBe("PUBLISHED");
  });

  it("notifies followers when a new publication is published", async () => {
    const { client, user, userId } = await registerUserWithId(
      makeUser("pubnotifyowner")
    );
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);

    const followerClient = new TestApiClient();
    const follower = await registerUser(
      followerClient,
      makeUser("pubnotifyfollow")
    );
    const ownerIds = await getUserIds(user.username);
    const followerIds = await getUserIds(follower.username);
    await execute(
      `INSERT INTO followers (leader_id_int, leader_id, follower_id_int, follower_id) VALUES (${ownerIds.id_int}, ${escape(ownerIds.id)}, ${followerIds.id_int}, ${escape(followerIds.id)})`
    );

    const createResp = await client.post("/api/publications").send({
      slug: "publish-notify-followers",
      title: "Notify Followers",
      abstract: "Abstract text.",
      body: "Body text.",
    });
    expect(createResp.status).toBe(201);
    const publicationId = createResp.body.publication_id;

    const publishResp = await client.post(
      "/api/publications/publish-notify-followers/publish"
    );
    expect(publishResp.status).toBe(200);

    const notifyRows = await waitForRows<{
      message: string;
      state: string;
      seen: number;
    }>(
      `SELECT message, state, seen FROM notifications WHERE user_id_int = ${followerIds.id_int} AND publication_id_int = ${publicationId}`
    );
    expect(notifyRows.length).toBe(1);
    expect(notifyRows[0]).toMatchObject({
      state: "NEW_PUBLICATION",
      seen: 0,
    });
    expect(notifyRows[0]!.message).toContain("just published something new");

    await followerClient.login(follower.username, follower.password);
    const notificationsResp = await followerClient.get("/api/notifications");
    expect(notificationsResp.status).toBe(200);
    const notificationItems = notificationsResp.body.items;
    expect(notificationItems.length).toBe(1);
    expect(notificationItems[0]).toMatchObject({
      message: notifyRows[0]!.message,
      seen: 0,
    });
  });

  it("publishes a new draft version, bumping version_number and latest_version_number", async () => {
    const { client, user, userId: ownerId } = await registerUserWithId();
    await seedPublishedV1({
      slug: "publish-v2-draft",
      ownerId,
      title: "V1 Title",
      body: "V1 body",
    });
    await client.login(user.username, user.password);

    const draftResp = await client.post(
      "/api/publications/publish-v2-draft/draft"
    );
    expect(draftResp.status).toBe(201);

    // Publishing requires at least one byline contributor.
    const addContribResp = await client
      .post("/api/publications/add_contrib")
      .send({
        slug: "publish-v2-draft",
        username: user.username,
        role: "author",
        in_byline: true,
      });
    expect(addContribResp.status).toBe(200);

    const publishResp = await client
      .post("/api/publications/publish-v2-draft/publish")
      .send({ note: "New version achieved!" });
    expect(publishResp.status).toBe(200);
    expect(publishResp.body.version_number).toBe(2);

    const pubRows = await query<{ latest_version_number: number }>(
      `SELECT latest_version_number FROM publications WHERE slug = 'publish-v2-draft'`
    );
    expect(pubRows[0]!.latest_version_number).toBe(2);
  });

  it("requires a title and body before publishing", async () => {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);
    const slug = "incomplete-pub";

    // abstract alone satisfies the create-time "title, abstract, or body" check,
    // leaving title/body empty for the publish-time check to catch.
    const createResp = await client.post("/api/publications").send({
      slug,
      abstract: "Only an abstract, no title or body.",
      body: "",
    });
    expect(createResp.status).toBe(201);

    const publishResp = await client.post(`/api/publications/${slug}/publish`);
    expect(publishResp.status).toBe(400);
    expect(publishResp.body.error).toContain("Missing title or body");
  });

  it("returns 400 when there is no draft to publish", async () => {
    const { client, user, userId: ownerId } = await registerUserWithId();
    await seedPublishedV1({ slug: "already-published", ownerId });
    await client.login(user.username, user.password);

    const resp = await client.post(
      "/api/publications/already-published/publish"
    );
    expect(resp.status).toBe(400);
    expect(resp.body.error).toBe("No draft found");
  });

  it("requires authentication and edit permission", async () => {
    const { userId: ownerId } = await registerUserWithId(
      makeUser("publishowner")
    );
    await seedPublication({
      slug: "guarded-publish",
      ownerId,
      state: "DRAFT",
      title: "Guarded",
    });

    expect(
      (
        await new TestApiClient().post(
          "/api/publications/guarded-publish/publish"
        )
      ).status
    ).toBe(401);

    const stranger = new TestApiClient();
    const other = await registerUser(stranger, makeUser("publishstranger"));
    await stranger.login(other.username, other.password);
    const res = await stranger.post(
      "/api/publications/guarded-publish/publish"
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/publications/:slug/linked-assets", () => {
  it("replaces (not appends) the draft's linked assets", async () => {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);
    await client.post("/api/publications").send({
      slug: "draft-assets-pub",
      title: "Assets Pub",
      abstract: "Abstract.",
      body: "",
    });

    const setResp = await client
      .post("/api/publications/draft-assets-pub/linked-assets")
      .send({
        linked_assets: [
          {
            type: "dataset",
            url: "https://example.com/data.csv",
            name: "Dataset",
          },
          { type: "code", url: "https://github.com/example/repo" },
        ],
      });
    expect(setResp.status).toBe(200);
    expect(setResp.body.publication_id).toBeDefined();

    const draft = await client.get("/api/publications/draft-assets-pub/draft");
    expect(draft.body.publication.linked_assets).toHaveLength(2);
    // No ORDER BY on the backend's linked_assets query, so assert as a set, not by index.
    expect(draft.body.publication.linked_assets).toEqual(
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

    const replaceResp = await client
      .post("/api/publications/draft-assets-pub/linked-assets")
      .send({
        linked_assets: [
          { type: "dataset", url: "https://example.com/v2.csv", name: "V2" },
        ],
      });
    expect(replaceResp.status).toBe(200);
    const draft2 = await client.get("/api/publications/draft-assets-pub/draft");
    expect(draft2.body.publication.linked_assets).toHaveLength(1);
    expect(draft2.body.publication.linked_assets[0].url).toBe(
      "https://example.com/v2.csv"
    );

    // Empty list clears all assets.
    const clearResp = await client
      .post("/api/publications/draft-assets-pub/linked-assets")
      .send({ linked_assets: [] });
    expect(clearResp.status).toBe(200);
    const draft3 = await client.get("/api/publications/draft-assets-pub/draft");
    expect(draft3.body.publication.linked_assets).toHaveLength(0);
  });

  it("returns 422 when there is no draft version", async () => {
    const { client, user, userId: ownerId } = await registerUserWithId();
    await seedPublishedV1({ slug: "no-draft-assets", ownerId });
    await client.login(user.username, user.password);

    const resp = await client
      .post("/api/publications/no-draft-assets/linked-assets")
      .send({
        linked_assets: [{ type: "dataset", url: "https://example.com/x.csv" }],
      });
    expect(resp.status).toBe(422);
  });

  it("requires authentication and edit permission", async () => {
    const { userId: ownerId } = await registerUserWithId(
      makeUser("assetsowner")
    );
    await seedPublication({
      slug: "guarded-assets",
      ownerId,
      state: "DRAFT",
    });

    expect(
      (
        await new TestApiClient()
          .post("/api/publications/guarded-assets/linked-assets")
          .send({ linked_assets: [] })
      ).status
    ).toBe(401);

    const stranger = new TestApiClient();
    const other = await registerUser(stranger, makeUser("assetsstranger"));
    await stranger.login(other.username, other.password);
    expect(
      (
        await stranger
          .post("/api/publications/guarded-assets/linked-assets")
          .send({ linked_assets: [] })
      ).status
    ).toBe(403);
  });
});

describe("POST /api/publications/add_org and remove_org", () => {
  it("adds and removes an org association, idempotently", async () => {
    const { client, user, userId, userIds } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);
    await client.post("/api/publications").send({
      slug: "org-linked-pub",
      title: "Org Linked",
      abstract: "Abstract.",
      body: "",
    });
    const { orgIdInt: orgId } = await seedOrg("Radial", "radial-org-slug");
    // Once a publication is mapped to an org, canEdit requires the actor to be an
    // org_user_map member of that org (even for the owner) — mirroring how the UI's
    // potential_orgs list only ever offers orgs the user already belongs to.
    await seedOrgMember(orgId, userIds);

    const addResp = await client
      .post("/api/publications/add_org")
      .send({ slug: "org-linked-pub", org_id: orgId });
    expect(addResp.status).toBe(200);
    expect(
      await query(
        `SELECT 1 FROM org_publication_map WHERE org_id_int = ${orgId}`
      )
    ).toHaveLength(1);

    // Adding the same org again is idempotent (no duplicate mapping).
    const addAgainResp = await client
      .post("/api/publications/add_org")
      .send({ slug: "org-linked-pub", org_id: orgId });
    expect(addAgainResp.status).toBe(200);
    expect(
      await query(
        `SELECT 1 FROM org_publication_map WHERE org_id_int = ${orgId}`
      )
    ).toHaveLength(1);

    const removeResp = await client
      .post("/api/publications/remove_org")
      .send({ slug: "org-linked-pub", org_id: orgId });
    expect(removeResp.status).toBe(200);
    expect(
      await query(
        `SELECT 1 FROM org_publication_map WHERE org_id_int = ${orgId}`
      )
    ).toHaveLength(0);
  });

  it("returns 404 for an unknown org on add_org", async () => {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);
    await client.post("/api/publications").send({
      slug: "org-not-found-pub",
      title: "Org 404",
      abstract: "Abstract.",
      body: "",
    });

    const resp = await client
      .post("/api/publications/add_org")
      .send({ slug: "org-not-found-pub", org_id: 999999 });
    expect(resp.status).toBe(404);
  });

  it("requires authentication and edit permission", async () => {
    const { userId: ownerId } = await registerUserWithId(makeUser("orgowner"));
    await seedPublication({ slug: "guarded-pub-org", ownerId, state: "DRAFT" });
    const orgId = await seedOrg("Guarded Org", "guarded-org-slug");

    expect(
      (
        await new TestApiClient()
          .post("/api/publications/add_org")
          .send({ slug: "guarded-pub-org", org_id: orgId })
      ).status
    ).toBe(401);

    const stranger = new TestApiClient();
    const other = await registerUser(stranger, makeUser("orgstranger"));
    await stranger.login(other.username, other.password);
    expect(
      (
        await stranger
          .post("/api/publications/add_org")
          .send({ slug: "guarded-pub-org", org_id: orgId })
      ).status
    ).toBe(403);
  });
});

describe("POST/DELETE /api/publications/:slug/contrib-affiliation", () => {
  it("adds and removes a contributor's org affiliation", async () => {
    const { client, user, userId: ownerId } = await registerUserWithId();
    await seedSiteAdmin(ownerId);
    await client.login(user.username, user.password);
    await client.post("/api/publications").send({
      slug: "affiliation-pub",
      title: "Affil Pub",
      abstract: "Abstract.",
      body: "",
    });

    await registerUser(new TestApiClient(), makeUser("affilcontrib"));
    const addContribResp = await client
      .post("/api/publications/add_contrib")
      .send({
        slug: "affiliation-pub",
        username: "affilcontrib",
        role: "author",
      });
    expect(addContribResp.status).toBe(200);
    const contribUserId = await getUserId("affilcontrib");

    await seedOrg("Affil Org", "affiliation-org");

    const addResp = await client
      .post("/api/publications/affiliation-pub/contrib-affiliation")
      .send({ user_id: contribUserId, org_slug: "affiliation-org" });
    expect(addResp.status).toBe(200);

    let draft = await client.get("/api/publications/affiliation-pub/draft");
    let contributor = draft.body.publication.contributors.find(
      (c: { user_id: number }) => c.user_id === contribUserId
    );
    expect(contributor.affiliations).toHaveLength(1);
    expect(contributor.affiliations[0].slug).toBe("affiliation-org");

    // Duplicate affiliation is rejected.
    const dupResp = await client
      .post("/api/publications/affiliation-pub/contrib-affiliation")
      .send({ user_id: contribUserId, org_slug: "affiliation-org" });
    expect(dupResp.status).toBe(409);

    const removeResp = await client.delete(
      `/api/publications/affiliation-pub/contrib-affiliation?user_id=${contribUserId}&org_slug=affiliation-org`
    );
    expect(removeResp.status).toBe(200);

    draft = await client.get("/api/publications/affiliation-pub/draft");
    contributor = draft.body.publication.contributors.find(
      (c: { user_id: number }) => c.user_id === contribUserId
    );
    expect(contributor.affiliations).toHaveLength(0);
  });

  it("rejects affiliating a non-contributor and an unknown org", async () => {
    const { client, user, userId: ownerId } = await registerUserWithId();
    await seedSiteAdmin(ownerId);
    await client.login(user.username, user.password);
    await client.post("/api/publications").send({
      slug: "affiliation-guard",
      title: "Affil Guard",
      abstract: "Abstract.",
      body: "",
    });
    await seedOrg("Affil Guard Org", "affiliation-guard-org");

    // The owner is not a contributor row yet (create does not add one automatically).
    const notContribResp = await client
      .post("/api/publications/affiliation-guard/contrib-affiliation")
      .send({ user_id: ownerId, org_slug: "affiliation-guard-org" });
    expect(notContribResp.status).toBe(400);

    await client.post("/api/publications/add_contrib").send({
      slug: "affiliation-guard",
      username: user.username,
      role: "author",
    });
    const unknownOrgResp = await client
      .post("/api/publications/affiliation-guard/contrib-affiliation")
      .send({ user_id: ownerId, org_slug: "does-not-exist-org" });
    expect(unknownOrgResp.status).toBe(404);
  });

  it("denies unauthenticated and non-editors (this route has no explicit 401 — canEdit rejects to 403)", async () => {
    const { userId: ownerId } = await registerUserWithId(
      makeUser("affilowner")
    );
    await seedPublication({ slug: "guarded-affil", ownerId, state: "DRAFT" });

    expect(
      (
        await new TestApiClient()
          .post("/api/publications/guarded-affil/contrib-affiliation")
          .send({ user_id: ownerId, org_slug: "unused-org-slug" })
      ).status
    ).toBe(403);

    const stranger = new TestApiClient();
    const other = await registerUser(stranger, makeUser("affilstranger"));
    await stranger.login(other.username, other.password);
    expect(
      (
        await stranger
          .post("/api/publications/guarded-affil/contrib-affiliation")
          .send({ user_id: ownerId, org_slug: "unused-org-slug" })
      ).status
    ).toBe(403);
  });
});

describe("POST /api/publications/remove_contrib", () => {
  it("removes a contributor by role", async () => {
    const { client, user, userId: ownerId } = await registerUserWithId();
    await seedSiteAdmin(ownerId);
    await client.login(user.username, user.password);
    await client.post("/api/publications").send({
      slug: "remove-contrib-pub",
      title: "Remove Contrib",
      abstract: "Abstract.",
      body: "",
    });
    await registerUser(new TestApiClient(), makeUser("removeme"));
    await client.post("/api/publications/add_contrib").send({
      slug: "remove-contrib-pub",
      username: "removeme",
      role: "author",
    });
    const contribUserId = await getUserId("removeme");

    const removeResp = await client
      .post("/api/publications/remove_contrib")
      .send({
        slug: "remove-contrib-pub",
        user_id: contribUserId,
        role: "author",
      });
    expect(removeResp.status).toBe(200);

    const rows = await query(
      `SELECT 1 FROM contributors c JOIN versions v ON v.id_int = c.version_id_int WHERE v.publication_id_int = (SELECT id_int FROM publications WHERE slug = 'remove-contrib-pub') AND c.user_id_int = ${contribUserId}`
    );
    expect(rows).toHaveLength(0);
  });

  it("requires user_id and role, plus authentication/edit permission", async () => {
    const { client, user, userId: ownerId } = await registerUserWithId();
    await seedSiteAdmin(ownerId);
    await client.login(user.username, user.password);
    await client.post("/api/publications").send({
      slug: "remove-contrib-guard",
      title: "Guard",
      abstract: "Abstract.",
      body: "",
    });

    expect(
      (
        await client.post("/api/publications/remove_contrib").send({
          slug: "remove-contrib-guard",
          role: "author",
        })
      ).status
    ).toBe(400);
    expect(
      (
        await client.post("/api/publications/remove_contrib").send({
          slug: "remove-contrib-guard",
          user_id: ownerId,
        })
      ).status
    ).toBe(400);

    expect(
      (
        await new TestApiClient()
          .post("/api/publications/remove_contrib")
          .send({
            slug: "remove-contrib-guard",
            user_id: ownerId,
            role: "author",
          })
      ).status
    ).toBe(401);

    const stranger = new TestApiClient();
    const other = await registerUser(stranger, makeUser("removestranger"));
    await stranger.login(other.username, other.password);
    expect(
      (
        await stranger.post("/api/publications/remove_contrib").send({
          slug: "remove-contrib-guard",
          user_id: ownerId,
          role: "author",
        })
      ).status
    ).toBe(403);
  });
});

describe("GET /api/publications/rss/:org_slug", () => {
  async function seedOrgPublication(slug: string) {
    const { userId } = await registerUserWithId();
    const { orgIdInt: orgId } = await seedOrg("Rss Org", "rss-org");
    const { pubId } = await seedPublishedV1({ slug, ownerId: userId });
    await execute(
      `INSERT INTO org_publication_map (org_id_int, publication_id_int) VALUES (${orgId}, ${pubId})`
    );
    return { userId, pubId };
  }

  async function getFeedItem(slug: string) {
    const resp = await new TestApiClient().get("/api/publications/rss/rss-org");
    expect(resp.status).toBe(200);
    const items = resp.text.match(/<item>[\s\S]*?<\/item>/g) ?? [];
    return items.find((item) =>
      item.includes(`<link>https://thestacks.org/publications/${slug}</link>`)
    );
  }

  it("includes a publication with no comments", async () => {
    await seedOrgPublication("rss-no-comments");

    const item = await getFeedItem("rss-no-comments");
    expect(item).toBeDefined();
    expect(item).toContain("<numComments>0</numComments>");
  });

  it("includes a publication whose only comment is withdrawn", async () => {
    const { userId, pubId } = await seedOrgPublication("rss-withdrawn-only");
    await execute(
      `INSERT INTO comments (id, publication_id_int, user_id_int, body, state) VALUES (ULID(), ${pubId}, ${userId}, 'Withdrawn comment', 'WITHDRAWN')`
    );

    const item = await getFeedItem("rss-withdrawn-only");
    expect(item).toBeDefined();
    expect(item).toContain("<numComments>1</numComments>");
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
    const createResp = await client.post("/api/publications").send({
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

    // Step 2: POST /publications/add_contrib
    await registerUser(new TestApiClient(), makeUser("fullflowcontrib"));
    const addContribResp = await client
      .post("/api/publications/add_contrib")
      .send({
        slug,
        username: "fullflowcontrib",
        role: "author",
        in_byline: true,
      });
    expect(addContribResp.status).toBe(200);
    const contribUserId = await getUserId("fullflowcontrib");

    // Step 2b: POST /publications/:slug/contrib-affiliation
    await seedOrg("Full Flow Affil Org", "full-flow-affiliation-org");
    const affilResp = await client
      .post(`/api/publications/${slug}/contrib-affiliation`)
      .send({ user_id: contribUserId, org_slug: "full-flow-affiliation-org" });
    expect(affilResp.status).toBe(200);

    // Step 3: GET /publications/potential_orgs then POST /publications/add_org
    const { orgIdInt: pubOrgId } = await seedOrg(
      "Full Flow Pub Org",
      "full-flow-pub-org"
    );
    await seedOrgMember(pubOrgId, userIds);
    const potentialOrgsResp = await client.get(
      `/api/publications/potential_orgs?slug=${slug}`
    );
    expect(potentialOrgsResp.status).toBe(200);
    expect(
      potentialOrgsResp.body.some(
        (o: { slug: string }) => o.slug === "full-flow-pub-org"
      )
    ).toBe(true);
    const addOrgResp = await client
      .post("/api/publications/add_org")
      .send({ slug, org_id: pubOrgId });
    expect(addOrgResp.status).toBe(200);

    // Step 4: POST /publications/:slug/tags
    const tagsResp = await client
      .post(`/api/publications/${slug}/tags`)
      .send({ tags: ["biology", "genomics"] });
    expect(tagsResp.status).toBe(200);

    // Step 5: POST /publications/:slug/linked-assets
    const assetsResp = await client
      .post(`/api/publications/${slug}/linked-assets`)
      .send({
        linked_assets: [
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
    const updateResp = await client.put(`/api/publications/${slug}`).send({
      title: "Full Flow Publication",
      subtitle: "A subtitle",
      abstract: "An abstract.",
      body: "Final body content.",
      version_desc: null,
      license: "CC BY",
    });
    expect(updateResp.status).toBe(200);

    // Step 6: POST /publications/:slug/publish
    const publishResp = await client.post(`/api/publications/${slug}/publish`);
    expect(publishResp.status).toBe(200);
    expect(publishResp.body).toMatchObject({
      slug,
      state: "PUBLISHED",
      version_number: 1,
    });

    // Verify the published publication reflects every step of the flow.
    const finalResp = await new TestApiClient().get(
      `/api/publications/${slug}`
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
    expect(contributor.affiliations[0].slug).toBe("full-flow-affiliation-org");
  });
});
