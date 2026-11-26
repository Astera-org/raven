import { describe, expect, it } from "vitest";
import {
  TestApiClient,
  execute,
  getUserIds,
  makeUser,
  registerUser,
  registerUserWithId,
  seedOrg,
  seedOrgMember,
  seedSiteAdmin,
} from "./helpers.js";

async function seedPublishedPub(opts: {
  slug: string;
  ownerId: number;
  title: string;
}): Promise<number> {
  const pub = await execute(
    `INSERT INTO publications (slug, owner_id_int, state, latest_version_number) VALUES ('${opts.slug}', ${opts.ownerId}, 'PUBLISHED', 1)`
  );
  await execute(
    `INSERT INTO versions (publication_id_int, version_number, title, state) VALUES (${pub.insertId}, 1, '${opts.title}', 'PUBLISHED')`
  );
  return pub.insertId;
}

// Returns a logged-in client whose user has SITE_ADMIN state.
async function createAdminClient() {
  // Register a throwaway user first so the admin doesn't land on id_int 1.
  // MySQL coerces a ULID's leading numeric run when compared against an int,
  // which for id_int 1 can coincidentally match and mask bugs that compare
  // users.id (a ULID) against an id_int value.
  await registerUser(new TestApiClient(), makeUser("warmup-admin"));
  const { client, user, userIds } = await registerUserWithId();
  await seedSiteAdmin(userIds.id_int);
  await client.login(user.username, user.password);
  return { client, user, userIds };
}

describe("/api/orgs", () => {
  it("gets organizations by slug", async () => {
    // Verify GET /api/orgs/:slug returns all org fields; unknown slug returns 404.
    const { orgIdInt: orgId } = await seedOrg("Slug Org", "slug-org");
    await execute(
      `UPDATE organizations SET ror_id = 'https://ror.org/abc123', profile = 'A research org' WHERE id_int = ${orgId}`
    );
    const resp = await new TestApiClient().get("/api/orgs/slug-org");
    expect(resp.status).toBe(200);
    expect(resp.body.name).toBe("Slug Org");
    expect(resp.body.slug).toBe("slug-org");
    expect(resp.body.ror_id).toBe("https://ror.org/abc123");
    expect(resp.body.profile).toBe("A research org");
    expect(typeof resp.body.id).toBe("number");
    expect(
      (await new TestApiClient().get("/api/orgs/no-such-org")).status
    ).toBe(404);
  });

  it("creates organizations as a site admin only", async () => {
    // Only site admins can create orgs; unauthenticated gets 401, regular users get 403.
    const { client } = await createAdminClient();

    const createResp = await client.post("/api/orgs").send({ name: "New Org" });
    expect(createResp.status).toBe(201);
    expect(typeof createResp.body.org_id).toBe("number");
    expect(createResp.body.slug).toBe("new-org");

    const getResp = await new TestApiClient().get("/api/orgs/new-org");
    expect(getResp.status).toBe(200);
    expect(getResp.body.name).toBe("New Org");

    expect(
      (await new TestApiClient().post("/api/orgs").send({ name: "Nope" }))
        .status
    ).toBe(401);

    const regular = new TestApiClient();
    const regularUser = await registerUser(regular, makeUser("regular"));
    await regular.login(regularUser.username, regularUser.password);
    expect(
      (await regular.post("/api/orgs").send({ name: "Denied" })).status
    ).toBe(403);
  });

  it("adds, lists, and removes members", async () => {
    // Org admins can add members, list members with emails, and remove members.
    const { client, user, userIds } = await createAdminClient();
    const { orgIdInt: orgId } = await seedOrg("Members Org", "members-org");
    await seedOrgMember(orgId, userIds, "ADMIN");

    const newMember = makeUser("newmember");
    await registerUser(new TestApiClient(), newMember);
    await client.login(user.username, user.password);

    expect(
      (
        await client
          .post("/api/orgs/members-org/add_member")
          .send({ username: "newmember" })
      ).status
    ).toBe(200);

    const members = await client.get("/api/orgs/members-org/users");
    expect(members.status).toBe(200);
    const usernames = members.body.items.map(
      (m: { username: string }) => m.username
    );
    expect(usernames).toContain(user.username);
    expect(usernames).toContain("newmember");
    const newMemberEntry = members.body.items.find(
      (m: { username: string }) => m.username === "newmember"
    );
    expect(newMemberEntry.email).toBe("newmember@example.com");
    expect(members.headers["cache-control"]).toBe("no-store");

    const anonymous = await new TestApiClient().get(
      "/api/orgs/members-org/users"
    );
    expect(anonymous.status).toBe(200);
    expect(anonymous.headers["cache-control"]).toBe("no-store");
    for (const member of anonymous.body.items) {
      expect(member).not.toHaveProperty("email");
    }

    const malformedCookie = await new TestApiClient()
      .get("/api/orgs/members-org/users")
      .set("Cookie", "access_token=%E0%A4%A");
    expect(malformedCookie.status).toBe(200);
    for (const member of malformedCookie.body.items) {
      expect(member).not.toHaveProperty("email");
    }

    const plainMember = new TestApiClient();
    await plainMember.login(newMember.username, newMember.password);
    const asMember = await plainMember.get("/api/orgs/members-org/users");
    for (const member of asMember.body.items) {
      expect(member).not.toHaveProperty("email");
    }

    const target = makeUser("removable");
    await registerUser(new TestApiClient(), target);
    const targetIds = await getUserIds("removable");
    await seedOrgMember(orgId, targetIds);
    await client.login(user.username, user.password);

    expect(
      (
        await client
          .post("/api/orgs/members-org/delete_member")
          .send({ member_id: targetIds.id_int })
      ).status
    ).toBe(200);

    const afterRemove = await client.get("/api/orgs/members-org/users");
    expect(
      afterRemove.body.items.map((m: { id: number }) => m.id)
    ).not.toContain(targetIds.id_int);
  });

  it("lists organizations with pagination and item shape", async () => {
    await seedOrg("Test Org", "test-org");
    const resp = await new TestApiClient().get("/api/orgs");
    expect(resp.status).toBe(200);

    const { pagination, items } = resp.body;

    expect(typeof pagination.total).toBe("number");
    expect(typeof pagination.page).toBe("number");
    expect(typeof pagination.per_page).toBe("number");

    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);

    const item = items[0];
    expect(item).toHaveProperty("id");
    expect(item).toHaveProperty("name");
    expect(item).toHaveProperty("slug");
    expect(item).toHaveProperty("member_count");
    expect(item).toHaveProperty("publication_count");
    expect(item).toHaveProperty("doi_minting_enabled");
    expect(item).toHaveProperty("unlisted");
  });

  it("lists organization publications", async () => {
    // GET /api/orgs/:slug/publications returns published pubs linked to the org.
    const { client, userIds } = await registerUserWithId();
    const { orgIdInt: orgId } = await seedOrg("Pub Org", "pub-org");
    await seedOrgMember(orgId, userIds);

    const pubId = await seedPublishedPub({
      slug: "org-article-pub",
      ownerId: userIds.id_int,
      title: "Org Article Title",
    });
    await execute(
      `INSERT INTO org_publication_map (org_id_int, publication_id_int) VALUES (${orgId}, ${pubId})`
    );

    const resp = await client.get("/api/orgs/pub-org/publications");
    expect(resp.status).toBe(200);
    expect(resp.body.items).toHaveLength(1);
    const pub = resp.body.items[0];
    expect(pub.slug).toBe("org-article-pub");
    expect(pub.title).toBe("Org Article Title");
  });

  it("auto-slugifies org name when no slug provided", async () => {
    // POST /api/orgs without a slug auto-generates one from the org name.
    const { client } = await createAdminClient();

    const resp = await client.post("/api/orgs").send({ name: "Auto Slug Org" });
    expect(resp.status).toBe(201);
    expect(resp.body.slug).toBe("auto-slug-org");
  });

  it("edits an organization as a site admin only", async () => {
    // POST /api/orgs/:slug lets a site admin update org fields and a
    // subsequent GET reflects the changes; regular users get 403 and
    // unauthenticated requests get 401.
    const { orgIdInt: orgId } = await seedOrg("Edit Org", "edit-org");
    const { client } = await createAdminClient();

    const editResp = await client.post("/api/orgs/edit-org").send({
      name: "Renamed Org",
      profile: "Updated profile text",
      ror_id: "https://ror.org/xyz789",
      doi_prefix: "10.1234",
      doi_minting_enabled: true,
      unlisted: true,
    });
    expect(editResp.status).toBe(200);
    expect(editResp.body.org_id).toBe(orgId);
    expect(editResp.body.slug).toBe("edit-org");

    const getResp = await new TestApiClient().get("/api/orgs/edit-org");
    expect(getResp.status).toBe(200);
    expect(getResp.body.name).toBe("Renamed Org");
    expect(getResp.body.profile).toBe("Updated profile text");
    expect(getResp.body.ror_id).toBe("https://ror.org/xyz789");
    expect(getResp.body.doi_prefix).toBe("10.1234");
    expect(getResp.body.doi_minting_enabled).toBe(1);
    expect(getResp.body.unlisted).toBe(1);

    const regular = new TestApiClient();
    const regularUser = await registerUser(regular, makeUser("regular"));
    await regular.login(regularUser.username, regularUser.password);
    expect(
      (await regular.post("/api/orgs/edit-org").send({ name: "Hacked" })).status
    ).toBe(403);

    expect(
      (
        await new TestApiClient()
          .post("/api/orgs/edit-org")
          .send({ name: "Nope" })
      ).status
    ).toBe(401);
  });

  it("auto-suffixes the slug when editing to a slug already taken", async () => {
    // Editing an org's slug to one already taken by another org appends a
    // numeric suffix instead of colliding.
    await seedOrg("First Org", "org-slug");
    const { orgIdInt: secondOrgId } = await seedOrg("Second Org", "second-org");
    const { client } = await createAdminClient();

    const editResp = await client.post("/api/orgs/second-org").send({
      name: "Second Org",
      slug: "org-slug",
    });
    expect(editResp.status).toBe(200);
    expect(editResp.body.org_id).toBe(secondOrgId);
    expect(editResp.body.slug).toBe("org-slug-1");

    const suffixedResp = await new TestApiClient().get("/api/orgs/org-slug-1");
    expect(suffixedResp.status).toBe(200);
    expect(suffixedResp.body.id).toBe(secondOrgId);
    expect(suffixedResp.body.name).toBe("Second Org");

    const firstOrgResp = await new TestApiClient().get("/api/orgs/org-slug");
    expect(firstOrgResp.status).toBe(200);
    expect(firstOrgResp.body.name).toBe("First Org");
  });

  it("changes an org's slug via POST /:slug", async () => {
    // Changing the slug makes the org accessible at the new slug and 404s
    // at the old one.
    const { orgIdInt: orgId } = await seedOrg("Slug Change Org", "old-slug");
    const { client } = await createAdminClient();

    const editResp = await client.post("/api/orgs/old-slug").send({
      name: "Slug Change Org",
      slug: "new-slug",
    });
    expect(editResp.status).toBe(200);
    expect(editResp.body.org_id).toBe(orgId);
    expect(editResp.body.slug).toBe("new-slug");

    const newSlugResp = await new TestApiClient().get("/api/orgs/new-slug");
    expect(newSlugResp.status).toBe(200);
    expect(newSlugResp.body.id).toBe(orgId);
    expect(newSlugResp.body.slug).toBe("new-slug");
    expect(newSlugResp.body.name).toBe("Slug Change Org");

    const oldSlugResp = await new TestApiClient().get("/api/orgs/old-slug");
    expect(oldSlugResp.status).toBe(404);
  });

  it("paginates organization members and exposes their role", async () => {
    // GET /api/orgs/:slug/users paginates active members and derives a
    // role field from the roles column.
    const { orgIdInt: orgId } = await seedOrg(
      "Pagination Org",
      "pagination-org"
    );
    const memberUsernames = [
      "member1",
      "member2",
      "member3",
      "member4",
      "member5",
    ];
    for (const [i, username] of memberUsernames.entries()) {
      await registerUser(new TestApiClient(), makeUser(username));
      const userIds = await getUserIds(username);
      await seedOrgMember(orgId, userIds, i === 0 ? "ADMIN" : "");
    }

    const firstPage = await new TestApiClient().get(
      "/api/orgs/pagination-org/users?per_page=2&page=1"
    );
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.items).toHaveLength(2);
    expect(firstPage.body.pagination.total).toBe(5);
    expect(firstPage.body.pagination.page).toBe(1);
    expect(firstPage.body.pagination.per_page).toBe(2);

    const secondPage = await new TestApiClient().get(
      "/api/orgs/pagination-org/users?per_page=2&page=2"
    );
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.items).toHaveLength(2);
    expect(secondPage.body.pagination.total).toBe(5);
    expect(secondPage.body.pagination.page).toBe(2);

    const thirdPage = await new TestApiClient().get(
      "/api/orgs/pagination-org/users?per_page=2&page=3"
    );
    expect(thirdPage.status).toBe(200);
    expect(thirdPage.body.items).toHaveLength(1);
    expect(thirdPage.body.pagination.total).toBe(5);
    expect(thirdPage.body.pagination.page).toBe(3);

    const allMembers = [
      ...firstPage.body.items,
      ...secondPage.body.items,
      ...thirdPage.body.items,
    ];
    const allUsernames = allMembers.map(
      (m: { username: string }) => m.username
    );
    expect(new Set(allUsernames).size).toBe(5);
    for (const username of memberUsernames) {
      expect(allUsernames).toContain(username);
    }

    const adminMember = allMembers.find(
      (m: { username: string }) => m.username === "member1"
    );
    expect(adminMember.role).toBe("ADMIN");
    const regularMember = allMembers.find(
      (m: { username: string }) => m.username === "member2"
    );
    expect(regularMember.role).toBe("MEMBER");
  });

  it("uploads an org avatar as an org admin, forbids others, and validates file type", async () => {
    // POST /api/orgs/:slug/avatar lets an org admin upload an image and
    // returns an avatar_url; non-admins get 403, bad file types get 400.
    const { orgIdInt: orgId } = await seedOrg("Avatar Org", "avatar-org");
    const client = new TestApiClient();
    const user = await registerUser(client, makeUser("avataradmin"));
    const userIds = await getUserIds(user.username);
    await seedOrgMember(orgId, userIds, "ADMIN");
    await client.login(user.username, user.password);

    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    const uploadResp = await client
      .post("/api/orgs/avatar-org/avatar")
      .attach("avatar", pngBuffer, "avatar.png");
    expect(uploadResp.status).toBe(200);
    expect(uploadResp.body.avatar_url).toMatch(
      /^\/api\/files\/avatars\/orgs\/org_\d+_\d+\.png$/
    );

    const getResp = await new TestApiClient().get("/api/orgs/avatar-org");
    expect(getResp.body.avatar).toBe(
      uploadResp.body.avatar_url.replace("/api/files/", "")
    );

    const regular = new TestApiClient();
    const regularUser = await registerUser(regular, makeUser("regular"));
    await regular.login(regularUser.username, regularUser.password);
    const forbidden = await regular
      .post("/api/orgs/avatar-org/avatar")
      .attach("avatar", pngBuffer, "avatar.png");
    expect(forbidden.status).toBe(403);

    const badType = await client
      .post("/api/orgs/avatar-org/avatar")
      .attach("avatar", pngBuffer, "avatar.exe");
    expect(badType.status).toBe(400);
  });
});
