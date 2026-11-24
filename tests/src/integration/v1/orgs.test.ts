import { escape } from "mysql2";
import { describe, expect, it } from "vitest";
import {
  execute,
  makeAuth2User,
  query,
  registerAuth2User,
  registerAuth2UserWithId,
  seedOrg,
  seedOrgMember,
  seedOrgMemberByUlid,
  seedSiteAdmin,
  TestApiClient,
} from "../helpers.js";
import { expectValidationError } from "./helpers.js";

// v1's better-auth-only orgs resource. See backend-ts/src/api-v1/routes/orgs/index.ts
// for the conventions these tests lock in: kebab-case sub-resource paths (no
// add_member/remove_member/delete_member RPC verbs), PATCH for partial
// updates, updates, `{ type: "validation_error", errors: [...] }` for 422 responses and
// `{ type: "application_error", errors: {...} }` for other non-2xx responses, and
// `{ items, pagination }` for every list response.

async function createAdminClient() {
  const { client, user, userIds } = await registerAuth2UserWithId();
  await seedSiteAdmin(userIds.id_int);
  return { client, user, userIds };
}

async function seedPublishedPub(opts: {
  slug: string;
  ownerId: number;
  title: string;
}): Promise<{ id: string; id_int: number; version_id_int: number }> {
  const pub = await execute(
    `INSERT INTO publications (id, slug, owner_id_int, state, latest_version_number) VALUES (ULID(), '${opts.slug}', ${opts.ownerId}, 'PUBLISHED', 1)`
  );
  const rows = await query<{ id: string }>(
    `SELECT id FROM publications WHERE id_int = ${pub.insertId}`
  );
  const pubId = rows[0]!.id;
  const version = await execute(
    `INSERT INTO versions (id, publication_id_int, publication_id, version_number, title, state) VALUES (ULID(), ${pub.insertId}, ${escape(pubId)}, 1, '${opts.title}', 'PUBLISHED')`
  );
  return { id: pubId, id_int: pub.insertId, version_id_int: version.insertId };
}

describe("/api/v1/orgs", () => {
  it("creates an organization as a site admin only, auto-slugifying the name", async () => {
    const { client } = await createAdminClient();

    const createResp = await client
      .post("/api/v1/orgs")
      .send({ name: "New V1 Org" });
    expect(createResp.status).toBe(201);
    expect(createResp.body.slug).toBe("new-v1-org");
    expect(typeof createResp.body.id).toBe("string");
    expect(createResp.body.canEdit).toBe(true);

    expect(
      (await new TestApiClient().post("/api/v1/orgs").send({ name: "Nope" }))
        .status
    ).toBe(401);

    const regular = new TestApiClient();
    await registerAuth2User(regular, makeAuth2User("regularv1"));
    const deniedResp = await regular
      .post("/api/v1/orgs")
      .send({ name: "Denied" });
    expect(deniedResp.status).toBe(403);
    expect(deniedResp.body.errors).toBeDefined();
  });

  it("rejects organization names longer than 255 characters", async () => {
    const { client } = await createAdminClient();
    const oversizedName = "x".repeat(256);

    const createResp = await client
      .post("/api/v1/orgs")
      .send({ name: oversizedName });
    expectValidationError(createResp);
    expect(
      createResp.body.errors.some((error: { path: (string | number)[] }) =>
        error.path.includes("name")
      )
    ).toBe(true);

    const createdRows = await query(
      `SELECT id FROM organizations WHERE name = ${escape(oversizedName)}`
    );
    expect(createdRows).toHaveLength(0);

    const { orgIdInt: orgId } = await seedOrg(
      "Original Name",
      "name-limit-org"
    );

    const patchResp = await client
      .patch("/api/v1/orgs/name-limit-org")
      .send({ name: oversizedName });
    expectValidationError(patchResp);
    expect(
      patchResp.body.errors.some((error: { path: (string | number)[] }) =>
        error.path.includes("name")
      )
    ).toBe(true);

    const unchangedRows = await query<{ name: string }>(
      `SELECT name FROM organizations WHERE id_int = ${orgId}`
    );
    expect(unchangedRows[0]?.name).toBe("Original Name");
  });

  it("lists organizations, showing unlisted ones only to site admins", async () => {
    const { orgIdInt: listedId } = await seedOrg("Listed Org", "listed-org");
    // created_at has one-second precision, so give the orgs distinct times
    // for the newest-first order to be deterministic.
    await execute(
      `UPDATE organizations SET created_at = NOW() - INTERVAL 1 DAY WHERE id_int = ${listedId}`
    );
    const { orgIdInt: unlistedId } = await seedOrg(
      "Unlisted Org",
      "unlisted-org"
    );
    await execute(
      `UPDATE organizations SET unlisted = TRUE WHERE id_int = ${unlistedId}`
    );
    const { orgIdInt: deletedId } = await seedOrg("Deleted Org", "deleted-org");
    await execute(
      `UPDATE organizations SET state = 'DELETED' WHERE id_int = ${deletedId}`
    );

    const anonymous = await new TestApiClient().get("/api/v1/orgs");
    expect(anonymous.status).toBe(200);
    expect(
      anonymous.body.items.map((org: { slug: string }) => org.slug)
    ).toEqual(["listed-org"]);
    expect(anonymous.body.pagination).toEqual({
      total: 1,
      page: 1,
      perPage: 20,
      totalUnlisted: 0,
    });
    expect(anonymous.body.items[0]).not.toHaveProperty("canEdit");

    const { client: member, userIds } = await registerAuth2UserWithId(
      makeAuth2User("orgmember")
    );
    await seedOrgMember(unlistedId, userIds, "ADMIN");
    const asMember = await member.get("/api/v1/orgs");
    expect(
      asMember.body.items.map((org: { slug: string }) => org.slug)
    ).toEqual(["listed-org"]);

    const { client: admin } = await createAdminClient();
    const asAdmin = await admin.get("/api/v1/orgs");
    expect(asAdmin.body.items.map((org: { slug: string }) => org.slug)).toEqual(
      ["unlisted-org", "listed-org"]
    );
    expect(asAdmin.body.pagination.total).toBe(2);

    const secondPage = await admin.get("/api/v1/orgs?page=2&perPage=1");
    expect(
      secondPage.body.items.map((org: { slug: string }) => org.slug)
    ).toEqual(["listed-org"]);
    expect(secondPage.body.pagination).toEqual({
      total: 2,
      page: 2,
      perPage: 1,
      totalUnlisted: 1,
    });
  });

  it("gets an organization by id or slug, reporting can_edit for the caller", async () => {
    const { orgIdInt, orgId } = await seedOrg("Get Org", "get-org");
    const orgUlid = orgId;

    const bySlug = await new TestApiClient().get("/api/v1/orgs/get-org");
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.name).toBe("Get Org");
    expect(bySlug.body.canEdit).toBe(false);
    expect(bySlug.body.createdAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );

    const byId = await new TestApiClient().get(`/api/v1/orgs/${orgUlid}`);
    expect(byId.status).toBe(200);
    expect(byId.body.slug).toBe("get-org");

    const { client, userIds } = await registerAuth2UserWithId();
    await seedOrgMember(orgIdInt, userIds, "ADMIN");
    const asAdmin = await client.get("/api/v1/orgs/get-org");
    expect(asAdmin.body.canEdit).toBe(true);

    expect(
      (await new TestApiClient().get("/api/v1/orgs/no-such-org")).status
    ).toBe(404);
  });

  it("grants org admin rights only once the membership has started", async () => {
    const { orgIdInt } = await seedOrg("Future Org", "future-org");
    const { client, userIds } = await registerAuth2UserWithId();
    await seedOrgMember(orgIdInt, userIds, "ADMIN");
    await execute(
      `UPDATE org_user_map SET start_at = NOW() + INTERVAL 1 DAY WHERE user_id = ${escape(userIds.id)}`
    );

    const resp = await client.get("/api/v1/orgs/future-org");
    expect(resp.status).toBe(200);
    expect(resp.body.canEdit).toBe(false);
    expect(
      (await client.patch("/api/v1/orgs/future-org").send({ name: "Renamed" }))
        .status
    ).toBe(403);
  });

  it("lets a site admin edit an organization they are not a member of", async () => {
    const { orgIdInt: orgId } = await seedOrg(
      "Site Admin Org",
      "site-admin-org"
    );
    const { client } = await createAdminClient();

    const memberRows = await query(
      `SELECT * FROM org_user_map WHERE org_id_int = ${orgId}`
    );
    expect(memberRows).toHaveLength(0);

    const getResp = await client.get("/api/v1/orgs/site-admin-org");
    expect(getResp.status).toBe(200);
    expect(getResp.body.canEdit).toBe(true);

    const patchResp = await client
      .patch("/api/v1/orgs/site-admin-org")
      .send({ name: "Renamed by Site Admin" });
    expect(patchResp.status).toBe(200);
    expect(patchResp.body.name).toBe("Renamed by Site Admin");
  });

  it("partially updates an organization, leaving omitted fields untouched", async () => {
    const { orgIdInt } = await seedOrg("Patch Org", "patch-org");
    await execute(
      `UPDATE organizations SET profile = 'Original profile' WHERE id_int = ${orgIdInt}`
    );
    const { client, userIds } = await registerAuth2UserWithId();
    await seedOrgMember(orgIdInt, userIds, "ADMIN");

    const patchName = await client
      .patch("/api/v1/orgs/patch-org")
      .send({ name: "Renamed Org" });
    expect(patchName.status).toBe(200);
    expect(patchName.body.name).toBe("Renamed Org");
    // profile was omitted from the body — must be untouched.
    expect(patchName.body.profile).toBe("Original profile");

    const clearAvatar = await client
      .patch("/api/v1/orgs/patch-org")
      .send({ avatar: null });
    expect(clearAvatar.status).toBe(200);
    expect(clearAvatar.body.avatar).toBeNull();
    expect(clearAvatar.body.name).toBe("Renamed Org");

    expect(
      (
        await new TestApiClient()
          .patch("/api/v1/orgs/patch-org")
          .send({ name: "Anon" })
      ).status
    ).toBe(401);

    const other = new TestApiClient();
    await registerAuth2User(other, makeAuth2User("otherpatcher"));
    expect(
      (await other.patch("/api/v1/orgs/patch-org").send({ name: "Nope" }))
        .status
    ).toBe(403);

    expect(
      (await client.patch("/api/v1/orgs/no-such-org").send({ name: "X" }))
        .status
    ).toBe(404);
  });

  it("sets and clears an organization's avatar", async () => {
    const { orgIdInt } = await seedOrg("Avatar Patch Org", "avatar-patch-org");
    const { client, userIds } = await registerAuth2UserWithId();
    await seedOrgMember(orgIdInt, userIds, "ADMIN");

    const setAvatar = await client
      .patch("/api/v1/orgs/avatar-patch-org")
      .send({ avatar: "https://example.com/logo.png" });
    expect(setAvatar.status).toBe(200);
    expect(setAvatar.body.avatar).toBe("https://example.com/logo.png");

    await execute(
      `UPDATE organizations SET avatar = 'existing.png' WHERE id_int = ${orgIdInt}`
    );
    const clearAvatar = await client
      .patch("/api/v1/orgs/avatar-patch-org")
      .send({ avatar: null });
    expect(clearAvatar.status).toBe(200);
    expect(clearAvatar.body.avatar).toBeNull();
  });

  it("leaves admin-only fields untouched on the public PATCH", async () => {
    const { orgIdInt } = await seedOrg("Admin Fields Org", "admin-fields-org");
    const { client, userIds } = await registerAuth2UserWithId();
    await seedOrgMember(orgIdInt, userIds, "ADMIN");

    const resp = await client.patch("/api/v1/orgs/admin-fields-org").send({
      slug: "renamed-slug",
      rorId: "https://ror.org/00000000",
      doiPrefix: "abc",
      doiMintingEnabled: true,
      unlisted: true,
    });
    expect(resp.status).toBe(200);

    const rows = await query(
      `SELECT slug, ror_id, doi_prefix, doi_minting_enabled, unlisted FROM organizations WHERE id_int = ${orgIdInt}`
    );
    expect(rows).toEqual([
      {
        slug: "admin-fields-org",
        ror_id: null,
        doi_prefix: null,
        doi_minting_enabled: 0,
        unlisted: 0,
      },
    ]);
  });

  it("documents only the fields the public PATCH applies", async () => {
    const spec = (await new TestApiClient().get("/api/v1/openapi.json")).body;
    const ref =
      spec.paths["/orgs/{idOrSlug}"].patch.requestBody.content[
        "application/json"
      ].schema.$ref;
    const schema = spec.components.schemas[ref.split("/").pop()];
    expect(Object.keys(schema.properties).sort()).toEqual([
      "avatar",
      "name",
      "profile",
    ]);
  });

  it("deletes an organization, cascading its member and publication links", async () => {
    const { orgIdInt } = await seedOrg("Delete Org", "delete-org");
    const { client, userIds } = await registerAuth2UserWithId();
    await seedOrgMember(orgIdInt, userIds, "ADMIN");

    const other = new TestApiClient();
    await registerAuth2User(other, makeAuth2User("deletedenied"));
    expect((await other.delete("/api/v1/orgs/delete-org")).status).toBe(403);

    const resp = await client.delete("/api/v1/orgs/delete-org");
    expect(resp.status).toBe(204);
    expect(resp.body).toEqual({});

    expect((await client.get("/api/v1/orgs/delete-org")).status).toBe(404);

    const memberRows = await query(
      `SELECT * FROM org_user_map WHERE org_id_int = ${orgIdInt}`
    );
    expect(memberRows).toHaveLength(0);
  });

  it("replaces an organization's avatar", async () => {
    const { orgIdInt } = await seedOrg("Avatar Org", "avatar-org");
    const { client, userIds } = await registerAuth2UserWithId();
    await seedOrgMember(orgIdInt, userIds, "ADMIN");

    const badExt = await client
      .put("/api/v1/orgs/avatar-org/avatar")
      .attach("avatar", Buffer.from("not an image"), "avatar.txt");
    expect(badExt.status).toBe(400);
    expect(badExt.body.errors).toBeDefined();

    const resp = await client
      .put("/api/v1/orgs/avatar-org/avatar")
      .attach("avatar", Buffer.from("fake-png-bytes"), "avatar.png");
    expect(resp.status).toBe(200);
    expect(resp.body.avatarUrl).toMatch(/^\/api\/v1\/files\//);

    const fileResp = await client.get(resp.body.avatarUrl);
    expect(fileResp.status).toBe(200);
  });

  it("lists members, returning an empty list rather than 404 when there are none", async () => {
    const { orgIdInt } = await seedOrg("Members Org", "members-org");

    // Unlike v0, a real org with zero members is a 200 with an empty list,
    // not a 404 — an empty collection isn't itself an error.
    const emptyMembers = await new TestApiClient().get(
      "/api/v1/orgs/members-org/members"
    );
    expect(emptyMembers.status).toBe(200);
    expect(emptyMembers.body.items).toEqual([]);
    expect(emptyMembers.body.pagination).toEqual({
      total: 0,
      page: 1,
      perPage: 20,
    });

    const notFound = await new TestApiClient().get(
      "/api/v1/orgs/no-such-members-org/members"
    );
    expect(notFound.status).toBe(404);

    const { client, user, userIds } = await createAdminClient();
    await seedOrgMember(orgIdInt, userIds, "ADMIN");

    const initial = await client.get("/api/v1/orgs/members-org/members");
    expect(initial.status).toBe(200);
    expect(initial.body.items).toHaveLength(1);
    expect(initial.body.pagination).toEqual({
      total: 1,
      page: 1,
      perPage: 20,
    });
    expect(initial.body.items[0].username).toBe(user.username);
    expect(initial.body.items[0].isAdmin).toBe(true);
  });

  it("lists members alphabetically by last name, then first name", async () => {
    const { orgIdInt } = await seedOrg("Sorted Org", "sorted-org");
    for (const [username, firstName, lastName] of [
      ["zara", "Zara", "Adams"],
      ["carl", "Carl", "Young"],
      ["anna", "Anna", "Adams"],
      ["beth", "Beth", "Moore"],
    ] as const) {
      const { userIds } = await registerAuth2UserWithId(
        makeAuth2User(username, { firstName, lastName })
      );
      await seedOrgMember(orgIdInt, userIds);
    }

    const resp = await new TestApiClient().get(
      "/api/v1/orgs/sorted-org/members"
    );
    expect(resp.status).toBe(200);
    expect(
      resp.body.items.map((item: { username: string }) => item.username)
    ).toEqual(["anna", "zara", "beth", "carl"]);
  });

  it("shows full member records only to org admins and site admins", async () => {
    const { orgIdInt } = await seedOrg("Privacy Org", "privacy-org");
    const member = await registerAuth2UserWithId(makeAuth2User("member"));
    await seedOrgMember(orgIdInt, member.userIds);
    const orgAdmin = await registerAuth2UserWithId(makeAuth2User("orgadmin"));
    await seedOrgMember(orgIdInt, orgAdmin.userIds, "ADMIN");
    const siteAdmin = await registerAuth2UserWithId(makeAuth2User("siteadmin"));
    await seedSiteAdmin(siteAdmin.userIds.id_int);
    const outsider = await registerAuth2UserWithId(makeAuth2User("outsider"));

    const path = "/api/v1/orgs/privacy-org/members";
    const publicKeys = [
      "avatar",
      "firstName",
      "lastName",
      "orcid",
      "userId",
      "username",
    ];
    for (const client of [
      new TestApiClient(),
      member.client,
      outsider.client,
    ]) {
      const resp = await client.get(path);
      expect(resp.status).toBe(200);
      expect(resp.body.pagination.total).toBe(2);
      for (const item of resp.body.items) {
        expect(Object.keys(item).sort()).toEqual(publicKeys);
      }
    }

    for (const client of [orgAdmin.client, siteAdmin.client]) {
      const resp = await client.get(path);
      expect(resp.status).toBe(200);
      for (const item of resp.body.items) {
        expect(item).toHaveProperty("email");
        expect(item).toHaveProperty("isAdmin");
      }
    }
  });

  it("lists an organization's publications", async () => {
    const { orgId, orgIdInt } = await seedOrg("Pub Org", "pub-org-v1");
    const orgUlid = orgId;
    const { client, user, userIds } = await registerAuth2UserWithId();
    await seedOrgMemberByUlid(orgId, userIds);

    const pub = await seedPublishedPub({
      slug: "v1-org-article",
      ownerId: userIds.id_int,
      title: "V1 Org Article Title",
    });
    await execute(
      `INSERT INTO org_publication_map (org_id_int, org_id, publication_id_int, publication_id) VALUES (${orgIdInt}, ${escape(orgUlid)}, ${pub.id_int}, ${escape(pub.id)})`
    );
    await execute(
      `INSERT INTO contributors (version_id_int, user_id_int, roles, in_byline, priority) VALUES (${pub.version_id_int}, ${userIds.id_int}, '["Writing"]', true, 1)`
    );
    await execute(
      `INSERT INTO contributor_affiliations (version_id_int, user_id_int, affiliated_org_id_int) VALUES (${pub.version_id_int}, ${userIds.id_int}, ${orgIdInt})`
    );
    await execute(
      `INSERT INTO publication_tags (publication_id_int, publication_id, tag) VALUES (${pub.id_int}, ${escape(pub.id)}, 'genetics')`
    );
    await execute(
      `INSERT INTO comments (id, publication_id_int, publication_id, user_id_int, user_id, body, state) VALUES (ULID(), ${pub.id_int}, ${escape(pub.id)}, ${userIds.id_int}, ${escape(userIds.id)}, 'Nice work', 'PUBLISHED')`
    );

    const resp = await client.get("/api/v1/orgs/pub-org-v1/publications");
    expect(resp.status).toBe(200);
    expect(resp.body.items).toHaveLength(1);
    expect(resp.body.items[0].id).toBe(pub.id);
    expect(resp.body.items[0].slug).toBe("v1-org-article");
    expect(resp.body.items[0].title).toBe("V1 Org Article Title");
    expect(resp.body.items[0].createdAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
    expect(resp.body.items[0].numComments).toBe(1);
    expect(resp.body.items[0].tags).toEqual(["genetics"]);
    expect(resp.body.items[0].contributors).toEqual([
      {
        userId: userIds.id,
        roles: ["Writing"],
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: null,
        inByline: true,
        priority: 1,
        affiliations: [
          {
            orgId: orgUlid,
            name: "Pub Org",
            slug: "pub-org-v1",
            rorId: null,
            avatar: null,
          },
        ],
      },
    ]);
    expect(resp.body.items[0].orgs).toEqual([
      {
        orgId: orgUlid,
        priority: null,
        slug: "pub-org-v1",
        name: "Pub Org",
        avatar: null,
      },
    ]);
    expect(resp.body.pagination).toEqual({ total: 1, page: 1, perPage: 20 });

    expect(
      (await client.get("/api/v1/orgs/no-such-org/publications")).status
    ).toBe(404);
  });
});
