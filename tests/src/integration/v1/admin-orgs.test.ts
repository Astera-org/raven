import { escape } from "mysql2";
import { describe, expect, it } from "vitest";
import { itEnforcesAdminGate } from "./admin-gate.js";
import {
  ADMIN_FORBIDDEN,
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

const ADMIN_ORGS = "/api/v1/admin/orgs";
const ORG_SLUG_AVAILABILITY = "/api/v1/admin/org-slug-availability";

type SeededOrg = { orgIdInt: number; orgId: string };
type UserIds = { id: string; id_int: number };

async function orgName(org: SeededOrg) {
  const rows = await query<{ name: string }>(
    `SELECT name FROM organizations WHERE id_int = ${org.orgIdInt}`
  );
  return rows[0]!.name;
}

async function memberRoles(org: SeededOrg, userIds: UserIds) {
  const rows = await query<{ roles: string }>(
    `SELECT roles FROM org_user_map WHERE org_id_int = ${org.orgIdInt} AND user_id = ${escape(userIds.id)}`
  );
  return rows[0]!.roles;
}

const OUT_OF_SCOPE = {
  type: "application_error",
  errors: { auth: { message: "Not authorized to access org" } },
};
const ORG_NOT_FOUND = {
  type: "application_error",
  errors: { org: { message: "Organization not found" } },
};

type RouteTarget = { org: string; memberId: string };
type AdminOrgRoute = RouteCase<RouteTarget>;

const LIST_ROUTE: AdminOrgRoute = {
  name: "GET /orgs",
  send: (client) => client.get(ADMIN_ORGS),
};

// Every route addressing a single org, so each one gets the cross-org checks.
const ORG_SCOPED_ROUTES: AdminOrgRoute[] = [
  {
    name: "GET /orgs/{idOrSlug}",
    send: (client, { org }) => client.get(`${ADMIN_ORGS}/${org}`),
  },
  {
    name: "PATCH /orgs/{idOrSlug}",
    send: (client, { org }) =>
      client.patch(`${ADMIN_ORGS}/${org}`).send({ name: "Hijacked" }),
  },
  {
    name: "GET /orgs/{idOrSlug}/members",
    send: (client, { org }) => client.get(`${ADMIN_ORGS}/${org}/members`),
  },
  {
    name: "PATCH /orgs/{idOrSlug}/members/{memberId}",
    send: (client, { org, memberId }) =>
      client
        .patch(`${ADMIN_ORGS}/${org}/members/${memberId}`)
        .send({ role: "ADMIN" }),
  },
  {
    name: "GET /orgs/{idOrSlug}/publications",
    send: (client, { org }) => client.get(`${ADMIN_ORGS}/${org}/publications`),
  },
];

// Org-scoped routes that change membership. They get the same rejection
// checks, but succeed with 201/204 and can't be repeated, so their success
// paths are tested separately.
const MEMBER_WRITE_ROUTES: AdminOrgRoute[] = [
  {
    name: "POST /orgs/{idOrSlug}/members",
    send: (client, { org }) =>
      client
        .post(`${ADMIN_ORGS}/${org}/members`)
        .send({ username: "targetmember" }),
  },
  {
    name: "DELETE /orgs/{idOrSlug}/members/{memberId}",
    send: (client, { org, memberId }) =>
      client.delete(`${ADMIN_ORGS}/${org}/members/${memberId}`),
  },
];

const ORG_SCOPED_REJECTION_ROUTES = [
  ...ORG_SCOPED_ROUTES,
  ...MEMBER_WRITE_ROUTES,
];

const CREATE_ROUTE: AdminOrgRoute = {
  name: "POST /orgs",
  send: (client) => client.post(ADMIN_ORGS).send({ name: "Created Org" }),
};

const SLUG_AVAILABILITY_ROUTE: AdminOrgRoute = {
  name: "GET /org-slug-availability",
  send: (client, { org }) =>
    client.get(ORG_SLUG_AVAILABILITY).query({ slug: org }),
};

const ALL_ROUTES = [
  LIST_ROUTE,
  CREATE_ROUTE,
  SLUG_AVAILABILITY_ROUTE,
  ...ORG_SCOPED_REJECTION_ROUTES,
];

/**
 * An org with one plain member, plus assertions that neither the org nor that
 * member was changed by a rejected PATCH.
 */
async function seedTargetOrg() {
  const org = await seedOrg("Target Org", "target-org");
  const member = await registerUserWithId(makeUser("targetmember"));
  await seedOrgMember(org.orgIdInt, member.userIds);
  return {
    org,
    member,
    target: { org: "target-org", memberId: member.userIds.id },
    async expectUntouched() {
      expect(await orgName(org)).toBe("Target Org");
      expect(await memberRoles(org, member.userIds)).toBe("");
    },
  };
}

describe("/api/v1/admin/orgs authorization gate", () => {
  itEnforcesAdminGate(ALL_ROUTES, seedTargetOrg);

  it("rejects a signed-out PATCH before validating the body", async () => {
    const { target } = await seedTargetOrg();
    const invalidBody = { name: "", role: "OWNER" };

    for (const path of [
      `${ADMIN_ORGS}/${target.org}`,
      `${ADMIN_ORGS}/${target.org}/members/${target.memberId}`,
    ]) {
      const resp = await new TestApiClient().patch(path).send(invalidBody);
      expect(resp.status).toBe(401);
      expect(resp.body).toEqual(UNAUTHENTICATED);
    }
  });
});

describe("/api/v1/admin/orgs/{idOrSlug} org scoping", () => {
  async function orgAdminOfOtherOrg() {
    const caller = await loggedInUser("orgadmin");
    const ownOrg = await seedOrg("Own Org", "own-org");
    await seedOrgMember(ownOrg.orgIdInt, caller.userIds, "ADMIN");
    return { ...caller, ownOrg };
  }

  it.each(ORG_SCOPED_REJECTION_ROUTES)(
    "$name forbids an org admin acting on an org they don't belong to",
    async (route) => {
      const { client } = await orgAdminOfOtherOrg();
      const { org, target, expectUntouched } = await seedTargetOrg();

      const bySlug = await route.send(client, target);
      expect(bySlug.status).toBe(403);
      expect(bySlug.body).toEqual(OUT_OF_SCOPE);

      const byId = await route.send(client, { ...target, org: org.orgId });
      expect(byId.status).toBe(403);
      expect(byId.body).toEqual(OUT_OF_SCOPE);

      await expectUntouched();
    }
  );

  it.each(ORG_SCOPED_REJECTION_ROUTES)(
    "$name forbids an org admin who is only a plain member of the target org",
    async (route) => {
      const { client, userIds } = await orgAdminOfOtherOrg();
      const { org, target, expectUntouched } = await seedTargetOrg();
      await seedOrgMember(org.orgIdInt, userIds);

      const resp = await route.send(client, target);
      expect(resp.status).toBe(403);
      expect(resp.body).toEqual(OUT_OF_SCOPE);
      await expectUntouched();
    }
  );

  it.each(ORG_SCOPED_REJECTION_ROUTES)(
    "$name forbids an org admin whose admin membership in the target org has ended",
    async (route) => {
      const { client, userIds } = await orgAdminOfOtherOrg();
      const { org, target, expectUntouched } = await seedTargetOrg();
      await seedOrgMember(org.orgIdInt, userIds, "ADMIN");
      await endMembership(org, userIds);

      const resp = await route.send(client, target);
      expect(resp.status).toBe(403);
      expect(resp.body).toEqual(OUT_OF_SCOPE);
      await expectUntouched();
    }
  );

  it.each(ORG_SCOPED_ROUTES)(
    "$name allows an org admin of the target org",
    async (route) => {
      const { client, userIds } = await orgAdminOfOtherOrg();
      const { org, target } = await seedTargetOrg();
      await seedOrgMember(org.orgIdInt, userIds, "ADMIN");

      const resp = await route.send(client, target);
      expect(resp.status).toBe(200);
    }
  );

  it.each(ORG_SCOPED_ROUTES)(
    "$name allows a site admin on any org",
    async (route) => {
      const { client, userId } = await loggedInUser("siteadmin");
      await seedSiteAdmin(userId);
      const { org, target } = await seedTargetOrg();

      const bySlug = await route.send(client, target);
      expect(bySlug.status).toBe(200);

      const byId = await route.send(client, { ...target, org: org.orgId });
      expect(byId.status).toBe(200);
    }
  );

  it.each(ORG_SCOPED_REJECTION_ROUTES)(
    "$name returns 404 for an unknown or deleted org",
    async (route) => {
      const { client, userIds } = await orgAdminOfOtherOrg();
      const { org, target } = await seedTargetOrg();
      await seedOrgMember(org.orgIdInt, userIds, "ADMIN");

      const unknown = await route.send(client, {
        ...target,
        org: "no-such-org",
      });
      expect(unknown.status).toBe(404);
      expect(unknown.body).toEqual(ORG_NOT_FOUND);

      await execute(
        `UPDATE organizations SET state = 'DELETED' WHERE id_int = ${org.orgIdInt}`
      );
      const deleted = await route.send(client, target);
      expect(deleted.status).toBe(404);
      expect(deleted.body).toEqual(ORG_NOT_FOUND);
    }
  );
});

describe("GET /api/v1/admin/orgs", () => {
  function slugsOf(body: { items: { slug: string }[] }) {
    return body.items.map((item) => item.slug).sort();
  }

  it("lists every active org, including unlisted ones, for a site admin", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    await seedOrg("Listed Org", "listed-org");
    const unlisted = await seedOrg("Unlisted Org", "unlisted-org");
    const deleted = await seedOrg("Deleted Org", "deleted-org");
    await execute(
      `UPDATE organizations SET unlisted = TRUE WHERE id_int = ${unlisted.orgIdInt}`
    );
    await execute(
      `UPDATE organizations SET state = 'DELETED' WHERE id_int = ${deleted.orgIdInt}`
    );

    const resp = await client.get(ADMIN_ORGS);
    expect(resp.status).toBe(200);
    expect(slugsOf(resp.body)).toEqual(["listed-org", "unlisted-org"]);
    expect(resp.body.pagination).toEqual({
      total: 2,
      page: 1,
      perPage: 20,
      totalUnlisted: 1,
    });
  });

  it("returns list items in the documented response shape", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    await seedOrg("Listed Org", "listed-org");

    const resp = await client.get(ADMIN_ORGS);
    expect(resp.status).toBe(200);
    const [item] = resp.body.items;
    expect(Object.keys(item).sort()).toEqual(
      [
        "avatar",
        "createdAt",
        "doiMintingEnabled",
        "doiPrefix",
        "currentMemberCount",
        "id",
        "name",
        "profile",
        "publishedPublicationCount",
        "rorId",
        "slug",
        "totalMemberCount",
        "totalPublicationCount",
        "unlisted",
        "updatedAt",
      ].sort()
    );
    expect(item.createdAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
  });

  it("scopes an org admin to active orgs they currently administer", async () => {
    const { client, userIds } = await loggedInUser("orgadmin");

    const adminOrg = await seedOrg("Admin Org", "admin-org");
    const memberOrg = await seedOrg("Member Org", "member-org");
    const expiredOrg = await seedOrg("Expired Org", "expired-org");
    const futureOrg = await seedOrg("Future Org", "future-org");
    const deletedOrg = await seedOrg("Deleted Org", "deleted-org");
    await seedOrg("Other Org", "other-org");
    await seedOrgMember(adminOrg.orgIdInt, userIds, "ADMIN");
    await seedOrgMember(memberOrg.orgIdInt, userIds);
    await seedOrgMember(expiredOrg.orgIdInt, userIds, "ADMIN");
    await endMembership(expiredOrg, userIds);
    await seedOrgMember(futureOrg.orgIdInt, userIds, "ADMIN");
    await execute(
      `UPDATE org_user_map SET start_at = NOW() + INTERVAL 1 DAY WHERE org_id_int = ${futureOrg.orgIdInt} AND user_id = ${escape(userIds.id)}`
    );
    await seedOrgMember(deletedOrg.orgIdInt, userIds, "ADMIN");
    await execute(
      `UPDATE organizations SET state = 'DELETED' WHERE id_int = ${deletedOrg.orgIdInt}`
    );

    const resp = await client.get(ADMIN_ORGS);
    expect(resp.status).toBe(200);
    expect(slugsOf(resp.body)).toEqual(["admin-org"]);
    expect(resp.body.pagination.total).toBe(1);
  });

  it("counts the unlisted orgs an org admin administers", async () => {
    const { client, userIds } = await loggedInUser("orgadmin");
    const listedOrg = await seedOrg("Listed Org", "listed-org");
    const unlistedOrg = await seedOrg("Unlisted Org", "unlisted-org");
    const otherUnlisted = await seedOrg("Other Unlisted", "other-unlisted");
    await seedOrgMember(listedOrg.orgIdInt, userIds, "ADMIN");
    await seedOrgMember(unlistedOrg.orgIdInt, userIds, "ADMIN");
    await execute(
      `UPDATE organizations SET unlisted = TRUE WHERE id_int IN (${unlistedOrg.orgIdInt}, ${otherUnlisted.orgIdInt})`
    );

    const resp = await client.get(ADMIN_ORGS);
    expect(resp.status).toBe(200);
    expect(slugsOf(resp.body)).toEqual(["listed-org", "unlisted-org"]);
    expect(resp.body.pagination).toMatchObject({ total: 2, totalUnlisted: 1 });
  });

  it("paginates an org admin's orgs with a matching total", async () => {
    const { client, userIds } = await loggedInUser("orgadmin");
    for (const slug of ["org-a", "org-b", "org-c"]) {
      const org = await seedOrg(slug, slug);
      await seedOrgMember(org.orgIdInt, userIds, "ADMIN");
    }

    const resp = await client.get(`${ADMIN_ORGS}?page=2&perPage=2`);
    expect(resp.status).toBe(200);
    expect(resp.body.items).toHaveLength(1);
    expect(resp.body.pagination).toEqual({
      total: 3,
      page: 2,
      perPage: 2,
      totalUnlisted: 0,
    });
  });

  it("lists newest first when no sort is given", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    for (const [slug, createdAt] of [
      ["middle-org", "2024-06-01 00:00:00"],
      ["oldest-org", "2023-01-01 00:00:00"],
      ["newest-org", "2025-01-01 00:00:00"],
    ]) {
      const org = await seedOrg(slug, slug);
      await execute(
        `UPDATE organizations SET created_at = '${createdAt}' WHERE id_int = ${org.orgIdInt}`
      );
    }

    const resp = await client.get(ADMIN_ORGS);
    expect(resp.status).toBe(200);
    expect(resp.body.items.map((item: { slug: string }) => item.slug)).toEqual([
      "newest-org",
      "middle-org",
      "oldest-org",
    ]);
  });

  it("pages through tied sort values without repeating or skipping orgs", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    const slugs = ["tie-a", "tie-b", "tie-c", "tie-d", "tie-e"];
    for (const slug of slugs) {
      const org = await seedOrg(slug, slug);
      await execute(
        `UPDATE organizations SET created_at = '2024-01-01 00:00:00' WHERE id_int = ${org.orgIdInt}`
      );
    }

    for (const sort of ["-publications", "members", "-created"]) {
      const seen: string[] = [];
      for (let page = 1; page <= 3; page++) {
        const resp = await client.get(
          `${ADMIN_ORGS}?sort=${sort}&page=${page}&perPage=2`
        );
        expect(resp.status).toBe(200);
        seen.push(
          ...resp.body.items.map((item: { slug: string }) => item.slug)
        );
      }
      expect(seen.sort()).toEqual(slugs);
    }
  });

  /** An org with one active and one ended member, and one published and one
   * draft publication, so only one of each should be counted. */
  async function seedCountedOrg(admin?: UserIds) {
    const org = await seedOrg("Counted Org", "counted-org");
    const active = await registerUserWithId(makeUser("activemember"));
    const ended = await registerUserWithId(makeUser("endedmember"));
    if (admin) {
      await seedOrgMember(org.orgIdInt, admin, "ADMIN");
    } else {
      await seedOrgMember(org.orgIdInt, active.userIds);
    }
    await seedOrgMember(org.orgIdInt, ended.userIds);
    await endMembership(org, ended.userIds);
    for (const state of ["PUBLISHED", "DRAFT"]) {
      const pub = await seedPublication({
        ownerId: active.userId,
        slug: `counted-${state.toLowerCase()}`,
        state,
      });
      await linkOrg(org, pub);
    }
    return org;
  }

  async function expectCountsMatchDetail(client: TestApiClient) {
    const list = await client.get(ADMIN_ORGS);
    expect(list.status).toBe(200);
    const item = list.body.items.find(
      (org: { slug: string }) => org.slug === "counted-org"
    );
    const counts = {
      currentMemberCount: 1,
      totalMemberCount: 2,
      publishedPublicationCount: 1,
      totalPublicationCount: 2,
    };
    expect(item).toMatchObject(counts);

    const detail = await client.get(`${ADMIN_ORGS}/counted-org`);
    expect(detail.body).toMatchObject(counts);
  }

  it("counts current and total members and publications for a site admin", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    await seedCountedOrg();

    await expectCountsMatchDetail(client);
  });

  it("counts current and total members and publications for an org admin", async () => {
    const { client, userIds } = await loggedInUser("orgadmin");
    await seedCountedOrg(userIds);

    await expectCountsMatchDetail(client);
  });

  it("ranks orgs by published publications, not drafts", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    const owner = await registerUserWithId(makeUser("pubowner"));
    const published = await seedOrg("Published Org", "published-org");
    const drafts = await seedOrg("Drafts Org", "drafts-org");
    await linkOrg(
      published,
      await seedPublication({
        ownerId: owner.userId,
        slug: "published-pub",
        state: "PUBLISHED",
      })
    );
    for (const slug of ["draft-a", "draft-b", "draft-c"]) {
      await linkOrg(
        drafts,
        await seedPublication({ ownerId: owner.userId, slug, state: "DRAFT" })
      );
    }

    const resp = await client.get(`${ADMIN_ORGS}?sort=-publications`);
    expect(resp.status).toBe(200);
    expect(
      resp.body.items.map(
        (org: { slug: string; publishedPublicationCount: number }) =>
          `${org.slug}:${org.publishedPublicationCount}`
      )
    ).toEqual(["published-org:1", "drafts-org:0"]);
  });

  it("sorts an org admin's orgs by name in either direction", async () => {
    const { client, userIds } = await loggedInUser("orgadmin");
    for (const name of ["Bravo", "Alpha", "Charlie"]) {
      const org = await seedOrg(name, name.toLowerCase());
      await seedOrgMember(org.orgIdInt, userIds, "ADMIN");
    }

    const names = async (sort: string) =>
      (await client.get(`${ADMIN_ORGS}?sort=${sort}`)).body.items.map(
        (item: { name: string }) => item.name
      );
    expect(await names("name")).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect(await names("-name")).toEqual(["Charlie", "Bravo", "Alpha"]);
  });
});

describe("GET /api/v1/admin/orgs/{idOrSlug}", () => {
  it("returns the org with current, published, and total counts", async () => {
    const { client, userIds } = await loggedInUser("orgadmin");
    const { org, member } = await seedTargetOrg();
    await seedOrgMember(org.orgIdInt, userIds, "ADMIN");
    const former = await registerUserWithId(makeUser("former"));
    await seedOrgMember(org.orgIdInt, former.userIds);
    await endMembership(org, former.userIds);

    const published = await seedPublication({
      ownerId: member.userId,
      slug: "published",
      state: "PUBLISHED",
    });
    const draft = await seedPublication({
      ownerId: member.userId,
      slug: "draft",
    });
    await linkOrg(org, published);
    await linkOrg(org, draft);

    const resp = await client.get(`${ADMIN_ORGS}/target-org`);
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({
      id: org.orgId,
      name: "Target Org",
      slug: "target-org",
      avatar: null,
      profile: null,
      rorId: null,
      unlisted: false,
      createdAt: expect.any(String),
      // seedOrg inserts the row without an updated_at.
      updatedAt: null,
      currentMemberCount: 2,
      totalMemberCount: 3,
      publishedPublicationCount: 1,
      totalPublicationCount: 2,
      doiMintingEnabled: false,
      doiPrefix: null,
      canEdit: true,
    });
  });

  it("fetches an org whose slug is slug-availability by that slug", async () => {
    const { client, userIds } = await loggedInUser("orgadmin");
    const org = await seedOrg("Slug Availability", "slug-availability");
    await seedOrgMember(org.orgIdInt, userIds, "ADMIN");

    const resp = await client.get(`${ADMIN_ORGS}/slug-availability`);
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual(
      expect.objectContaining({ id: org.orgId, slug: "slug-availability" })
    );
  });
});

describe("GET /api/v1/admin/org-slug-availability", () => {
  async function checkSlug(client: TestApiClient, slug: string) {
    return client.get(ORG_SLUG_AVAILABILITY).query({ slug });
  }

  async function orgAdminClient() {
    const caller = await loggedInUser("orgadmin");
    const ownOrg = await seedOrg("Own Org", "own-org");
    await seedOrgMember(ownOrg.orgIdInt, caller.userIds, "ADMIN");
    return caller.client;
  }

  it("reports an unused slug as available", async () => {
    const client = await orgAdminClient();

    const resp = await checkSlug(client, "unused-slug");
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({ available: true });
  });

  it.each(["ACTIVE", "MODERATED", "DELETED"])(
    "reports the slug of a %s org as taken",
    async (state) => {
      const client = await orgAdminClient();
      const org = await seedOrg("Held Org", "held-slug");
      await execute(
        `UPDATE organizations SET state = ${escape(state)} WHERE id_int = ${org.orgIdInt}`
      );

      const resp = await checkSlug(client, "held-slug");
      expect(resp.status).toBe(200);
      expect(resp.body).toEqual({ available: false });
    }
  );

  it("reports the slug of an org outside the caller's scope as taken", async () => {
    const client = await orgAdminClient();
    await seedOrg("Other Org", "other-org");

    const resp = await checkSlug(client, "other-org");
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({ available: false });
  });

  it("doesn't treat a slug matching an org's id as taken", async () => {
    const client = await orgAdminClient();
    const org = await seedOrg("Id Org", "id-org");

    const resp = await checkSlug(client, org.orgId.toLowerCase());
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({ available: true });
  });

  it("rejects a malformed slug", async () => {
    const client = await orgAdminClient();

    expectValidationError(await checkSlug(client, "Not A Slug"));
  });

  it("rejects a request without a slug", async () => {
    const client = await orgAdminClient();

    expectValidationError(await client.get(ORG_SLUG_AVAILABILITY));
  });
});

describe("POST /api/v1/admin/orgs", () => {
  async function orgBySlug(slug: string) {
    return query<{
      id: string;
      ror_id: string | null;
      doi_prefix: string | null;
      doi_minting_enabled: number;
      unlisted: number;
    }>(
      `SELECT id, ror_id, doi_prefix, doi_minting_enabled, unlisted FROM organizations WHERE slug = ${escape(slug)}`
    );
  }

  it("creates an org with admin-only fields and makes the caller its admin", async () => {
    const { client, userId, userIds } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);

    const resp = await client.post(ADMIN_ORGS).send({
      name: "Brand New Org",
      slug: "brand-new-org-slug",
      profile: "About us",
      rorId: "05dxps055",
      doiPrefix: "brand-new",
      doiMintingEnabled: true,
      unlisted: true,
    });
    expect(resp.status).toBe(201);
    expect(resp.body).toMatchObject({
      name: "Brand New Org",
      slug: "brand-new-org-slug",
      profile: "About us",
      rorId: "05dxps055",
      doiPrefix: "brand-new",
      doiMintingEnabled: true,
      unlisted: true,
      currentMemberCount: 1,
      totalMemberCount: 1,
      publishedPublicationCount: 0,
      totalPublicationCount: 0,
      canEdit: true,
    });

    const [row] = await orgBySlug("brand-new-org-slug");
    expect(row).toMatchObject({
      id: resp.body.id,
      ror_id: "05dxps055",
      doi_prefix: "brand-new",
      doi_minting_enabled: 1,
      unlisted: 1,
    });
    const orgIdInt = (
      await query<{ id_int: number }>(
        `SELECT id_int FROM organizations WHERE id = ${escape(resp.body.id)}`
      )
    )[0]!.id_int;
    expect(await memberRoles({ orgIdInt, orgId: resp.body.id }, userIds)).toBe(
      "ADMIN"
    );
  });

  it("derives the slug from the name when none is given", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);

    const resp = await client.post(ADMIN_ORGS).send({ name: "Derived Org" });
    expect(resp.status).toBe(201);
    expect(resp.body).toMatchObject({
      slug: "derived-org",
      doiMintingEnabled: false,
      unlisted: false,
    });
  });

  it("accepts a slug of at least 3 characters", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);

    const tooShort = await client
      .post(ADMIN_ORGS)
      .send({ name: "Short Org", slug: "ab" });
    expect(tooShort.status).toBe(422);
    expect(tooShort.body.errors).toEqual([
      expect.objectContaining({
        path: ["slug"],
        message: "Slug must be at least 3 characters long",
      }),
    ]);

    const created = await client
      .post(ADMIN_ORGS)
      .send({ name: "Short Org", slug: "abc" });
    expect(created.status).toBe(201);
    expect(created.body.slug).toBe("abc");
  });

  it("suffixes a requested slug that is already taken", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    await seedOrg("Existing Org", "taken-org-slug");

    const resp = await client
      .post(ADMIN_ORGS)
      .send({ name: "Another Org", slug: "taken-org-slug" });
    expect(resp.status).toBe(201);
    expect(resp.body.slug).toBe("taken-org-slug-1");
  });

  it("forbids an org admin who is not a site admin", async () => {
    const { client, userIds } = await loggedInUser("orgadmin");
    const { org } = await seedTargetOrg();
    await seedOrgMember(org.orgIdInt, userIds, "ADMIN");

    const resp = await client
      .post(ADMIN_ORGS)
      .send({ name: "Sneaky Org", slug: "sneaky-org-slug" });
    expect(resp.status).toBe(403);
    expect(resp.body).toEqual({
      type: "application_error",
      errors: { auth: { message: "Site admin permission required" } },
    });
    expect(await orgBySlug("sneaky-org-slug")).toHaveLength(0);
  });
});

describe("PATCH /api/v1/admin/orgs/{idOrSlug}", () => {
  it("applies a partial update for an org admin of that org", async () => {
    const { client, userIds } = await loggedInUser("orgadmin");
    const { org } = await seedTargetOrg();
    await seedOrgMember(org.orgIdInt, userIds, "ADMIN");

    const resp = await client
      .patch(`${ADMIN_ORGS}/${org.orgId}`)
      .send({ name: "Renamed Org", profile: "About us" });
    expect(resp.status).toBe(200);
    expect(resp.body).toMatchObject({
      id: org.orgId,
      name: "Renamed Org",
      slug: "target-org",
      profile: "About us",
    });
    expect(await orgName(org)).toBe("Renamed Org");
  });

  it("accepts a slug of at least 3 characters", async () => {
    const { client, userIds } = await loggedInUser("orgadmin");
    const { org } = await seedTargetOrg();
    await seedOrgMember(org.orgIdInt, userIds, "ADMIN");

    const tooShort = await client
      .patch(`${ADMIN_ORGS}/${org.orgId}`)
      .send({ slug: "ab" });
    expect(tooShort.status).toBe(422);

    const resp = await client
      .patch(`${ADMIN_ORGS}/${org.orgId}`)
      .send({ slug: "tgt" });
    expect(resp.status).toBe(200);
    expect(resp.body.slug).toBe("tgt");
  });

  it("does not let an org admin rename another org via its id", async () => {
    const { client, userIds } = await loggedInUser("orgadmin");
    const ownOrg = await seedOrg("Own Org", "own-org");
    await seedOrgMember(ownOrg.orgIdInt, userIds, "ADMIN");
    const { org, expectUntouched } = await seedTargetOrg();

    const resp = await client
      .patch(`${ADMIN_ORGS}/${org.orgId}`)
      .send({ name: "Hijacked", slug: "hijacked-org-slug" });
    expect(resp.status).toBe(403);
    expect(resp.body).toEqual(OUT_OF_SCOPE);
    await expectUntouched();
    expect(
      await query(
        `SELECT 1 FROM organizations WHERE slug = 'hijacked-org-slug'`
      )
    ).toHaveLength(0);
    expect(await orgName(ownOrg)).toBe("Own Org");
  });
});

describe("GET /api/v1/admin/orgs/{idOrSlug}/members", () => {
  it("lists all of the org's members, including inactive ones", async () => {
    const { client, userIds } = await loggedInUser("orgadmin");
    const { org, member } = await seedTargetOrg();
    await seedOrgMember(org.orgIdInt, userIds, "ADMIN");
    const former = await registerUserWithId(makeUser("former"));
    await seedOrgMember(org.orgIdInt, former.userIds);
    await endMembership(org, former.userIds);
    const outsider = await registerUserWithId(makeUser("outsider"));
    const otherOrg = await seedOrg("Other Org", "other-org");
    await seedOrgMember(otherOrg.orgIdInt, outsider.userIds);

    const resp = await client.get(`${ADMIN_ORGS}/target-org/members`);
    expect(resp.status).toBe(200);
    expect(resp.body.pagination).toEqual({ total: 3, page: 1, perPage: 20 });

    const byUserId = Object.fromEntries(
      resp.body.items.map((item: { userId: string }) => [item.userId, item])
    );
    expect(Object.keys(byUserId).sort()).toEqual(
      [userIds.id, member.userIds.id, former.userIds.id].sort()
    );
    expect(byUserId[userIds.id]).toMatchObject({
      isAdmin: true,
      role: "ADMIN",
    });
    expect(byUserId[member.userIds.id]).toMatchObject({
      username: "targetmember",
      isAdmin: false,
      role: "MEMBER",
      endAt: null,
    });
    expect(byUserId[former.userIds.id].endAt).not.toBeNull();
  });

  it("lists members alphabetically by last name, then first name", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    const org = await seedOrg("Sorted Org", "sorted-org");
    for (const [username, firstName, lastName] of [
      ["zara", "Zara", "Adams"],
      ["carl", "Carl", "Young"],
      ["anna", "Anna", "Adams"],
      ["beth", "Beth", "Moore"],
    ] as const) {
      const { userIds } = await registerUserWithId(makeUser(username));
      await execute(
        `UPDATE users SET first_name = ${escape(firstName)}, last_name = ${escape(lastName)} WHERE id = ${escape(userIds.id)}`
      );
      await seedOrgMember(org.orgIdInt, userIds);
    }

    const resp = await client.get(`${ADMIN_ORGS}/sorted-org/members`);
    expect(resp.status).toBe(200);
    expect(
      resp.body.items.map((item: { username: string }) => item.username)
    ).toEqual(["anna", "zara", "beth", "carl"]);
  });
});

describe("POST /api/v1/admin/orgs/{idOrSlug}/members", () => {
  it("adds a member, rejecting duplicates and unknown users", async () => {
    const { client, userIds } = await loggedInUser("orgadmin");
    const org = await seedOrg("Members Org", "members-org");
    await seedOrgMember(org.orgIdInt, userIds, "ADMIN");
    await registerUserWithId(makeUser("newmember"));

    const added = await client
      .post(`${ADMIN_ORGS}/members-org/members`)
      .send({ username: "newmember" });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ username: "newmember", isAdmin: false });

    const conflict = await client
      .post(`${ADMIN_ORGS}/members-org/members`)
      .send({ username: "newmember" });
    expect(conflict.status).toBe(409);

    const unknownUser = await client
      .post(`${ADMIN_ORGS}/members-org/members`)
      .send({ username: "no-such-user" });
    expect(unknownUser.status).toBe(404);

    const members = await client.get(`${ADMIN_ORGS}/members-org/members`);
    expect(members.body.items).toHaveLength(2);
  });

  it("rejects a start date later than the end date, but allows equal dates", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    const org = await seedOrg("Dates Org", "dates-org");
    const target = await registerUserWithId(makeUser("datesmember"));

    const invalid = await client.post(`${ADMIN_ORGS}/dates-org/members`).send({
      username: "datesmember",
      startAt: "2025-02-01T00:00:00Z",
      endAt: "2025-01-31T23:59:59Z",
    });
    expectValidationError(invalid);
    expect(invalid.body.errors).toEqual([
      expect.objectContaining({ path: ["endAt"] }),
    ]);
    expect(
      await query(
        `SELECT * FROM org_user_map WHERE org_id_int = ${org.orgIdInt} AND user_id_int = ${target.userId}`
      )
    ).toHaveLength(0);

    // The comparison is on the UTC instant, not the submitted text.
    const equal = await client.post(`${ADMIN_ORGS}/dates-org/members`).send({
      username: "datesmember",
      startAt: "2025-02-01T01:00:00+01:00",
      endAt: "2025-02-01T00:00:00Z",
    });
    expect(equal.status).toBe(201);
  });

  it("validates and stores member timestamps as UTC", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    const org = await seedOrg("Timestamp Org", "timestamp-org");
    const target = await registerUserWithId(makeUser("timestampmember"));

    const invalidCreate = await client
      .post(`${ADMIN_ORGS}/timestamp-org/members`)
      .send({ username: "timestampmember", startAt: "not-a-date" });
    expectValidationError(invalidCreate);
    expect(
      await query(
        `SELECT * FROM org_user_map WHERE org_id_int = ${org.orgIdInt} AND user_id_int = ${target.userId}`
      )
    ).toHaveLength(0);

    const added = await client
      .post(`${ADMIN_ORGS}/timestamp-org/members`)
      .send({
        username: "timestampmember",
        startAt: "2024-03-01T01:34:56+13:00",
      });
    expect(added.status).toBe(201);
    expect(added.body.startAt).toBe("2024-02-29T12:34:56.000Z");

    const memberPath = `${ADMIN_ORGS}/timestamp-org/members/${target.userIds.id}`;
    for (const body of [
      // No Feb 29 in non-leap years
      { startAt: "2025-02-29T12:34:56Z" },
      { endAt: "not-a-date" },
    ]) {
      const invalidPatch = await client.patch(memberPath).send(body);
      expectValidationError(invalidPatch);
    }

    const patched = await client
      .patch(memberPath)
      .send({ endAt: "2099-03-01T12:34:56" });
    expect(patched.status).toBe(200);
    expect(patched.body.endAt).toBe("2099-03-01T12:34:56.000Z");

    const listed = await client.get(`${ADMIN_ORGS}/timestamp-org/members`);
    expect(
      listed.body.items.find(
        (member: { userId: string }) => member.userId === target.userIds.id
      )
    ).toMatchObject({
      startAt: "2024-02-29T12:34:56.000Z",
      endAt: "2099-03-01T12:34:56.000Z",
    });

    const [membership] = await query<{
      start_at: string;
      end_at: string | null;
    }>(
      `SELECT DATE_FORMAT(start_at, '%Y-%m-%d %H:%i:%s') AS start_at, DATE_FORMAT(end_at, '%Y-%m-%d %H:%i:%s') AS end_at FROM org_user_map WHERE org_id_int = ${org.orgIdInt} AND user_id_int = ${target.userId}`
    );
    expect(membership?.start_at).toBe("2024-02-29 12:34:56");
    expect(membership?.end_at).toBe("2099-03-01 12:34:56");
  });

  it("rejects re-adding a previously removed member, which PATCH reactivates instead", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    const org = await seedOrg("Rejoin Org", "rejoin-org");
    const former = await registerUserWithId(makeUser("formermember"));
    // Simulate v0's soft-remove: end_at set in the past, row never deleted.
    await seedOrgMember(org.orgIdInt, former.userIds);
    await endMembership(org, former.userIds);

    const readded = await client
      .post(`${ADMIN_ORGS}/rejoin-org/members`)
      .send({ username: "formermember" });
    expect(readded.status).toBe(409);

    const reactivated = await client
      .patch(`${ADMIN_ORGS}/rejoin-org/members/${former.userIds.id}`)
      .send({ endAt: null });
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.endAt).toBeNull();

    const members = await client.get(`${ADMIN_ORGS}/rejoin-org/members`);
    expect(members.body.items).toHaveLength(1);
  });
});

describe("PATCH /api/v1/admin/orgs/{idOrSlug}/members/{memberId}", () => {
  it("promotes a member of an org the caller administers", async () => {
    const { client, userIds } = await loggedInUser("orgadmin");
    const { org, member } = await seedTargetOrg();
    await seedOrgMember(org.orgIdInt, userIds, "ADMIN");

    const resp = await client
      .patch(`${ADMIN_ORGS}/target-org/members/${member.userIds.id}`)
      .send({ role: "ADMIN" });
    expect(resp.status).toBe(200);
    expect(resp.body).toMatchObject({
      userId: member.userIds.id,
      isAdmin: true,
      role: "ADMIN",
    });
    expect(await memberRoles(org, member.userIds)).toBe("ADMIN");
  });

  it("treats an empty body as a no-op", async () => {
    const { client, userIds } = await loggedInUser("orgadmin");
    const { org, member, expectUntouched } = await seedTargetOrg();
    await seedOrgMember(org.orgIdInt, userIds, "ADMIN");
    const membership = () =>
      query(
        `SELECT roles, start_at, end_at FROM org_user_map WHERE org_id_int = ${org.orgIdInt} AND user_id = ${escape(member.userIds.id)}`
      );
    const before = await membership();

    const resp = await client
      .patch(`${ADMIN_ORGS}/target-org/members/${member.userIds.id}`)
      .send({});
    expect(resp.status).toBe(200);
    expect(resp.body).toMatchObject({
      userId: member.userIds.id,
      role: "MEMBER",
      endAt: null,
    });
    expect(await membership()).toEqual(before);
    await expectUntouched();
  });

  it("does not reach another org's member through the caller's own org", async () => {
    const { client, userIds } = await loggedInUser("orgadmin");
    const ownOrg = await seedOrg("Own Org", "own-org");
    await seedOrgMember(ownOrg.orgIdInt, userIds, "ADMIN");
    const { member, expectUntouched } = await seedTargetOrg();

    const resp = await client
      .patch(`${ADMIN_ORGS}/own-org/members/${member.userIds.id}`)
      .send({ role: "ADMIN" });
    expect(resp.status).toBe(404);
    expect(resp.body).toEqual({
      type: "application_error",
      errors: { member: { message: "Member not found" } },
    });
    await expectUntouched();
  });

  it("revokes admin access when a site admin demotes an org admin", async () => {
    const site = await loggedInUser("siteadmin");
    await seedSiteAdmin(site.userId);
    const orgAdmin = await loggedInUser("orgadmin");
    const { org } = await seedTargetOrg();
    await seedOrgMember(org.orgIdInt, orgAdmin.userIds, "ADMIN");
    expect((await orgAdmin.client.get(ADMIN_ORGS)).status).toBe(200);

    const resp = await site.client
      .patch(`${ADMIN_ORGS}/target-org/members/${orgAdmin.userIds.id}`)
      .send({ role: "MEMBER" });
    expect(resp.status).toBe(200);
    expect(resp.body).toMatchObject({ isAdmin: false, role: "MEMBER" });

    const after = await orgAdmin.client.get(`${ADMIN_ORGS}/target-org`);
    expect(after.status).toBe(403);
    expect(after.body).toEqual(ADMIN_FORBIDDEN);
  });

  it("revokes admin access when a site admin ends an org admin's membership", async () => {
    const site = await loggedInUser("siteadmin");
    await seedSiteAdmin(site.userId);
    const orgAdmin = await loggedInUser("orgadmin");
    const { org } = await seedTargetOrg();
    await seedOrgMember(org.orgIdInt, orgAdmin.userIds, "ADMIN");

    const resp = await site.client
      .patch(`${ADMIN_ORGS}/target-org/members/${orgAdmin.userIds.id}`)
      .send({ startAt: "2019-01-01T00:00:00Z", endAt: "2020-01-01T00:00:00Z" });
    expect(resp.status).toBe(200);
    expect(resp.body.endAt).toBe("2020-01-01T00:00:00.000Z");

    const after = await orgAdmin.client.get(`${ADMIN_ORGS}/target-org`);
    expect(after.status).toBe(403);
    expect(after.body).toEqual(ADMIN_FORBIDDEN);
  });

  it("rejects a patch that leaves the start date later than the end date", async () => {
    const { client, userIds } = await loggedInUser("orgadmin");
    const { org, member } = await seedTargetOrg();
    await seedOrgMember(org.orgIdInt, userIds, "ADMIN");
    const memberPath = `${ADMIN_ORGS}/target-org/members/${member.userIds.id}`;

    const set = await client.patch(memberPath).send({
      startAt: "2025-01-01T00:00:00Z",
      endAt: "2025-06-01T00:00:00Z",
    });
    expect(set.status).toBe(200);

    // Each date alone is checked against the stored other one.
    for (const body of [
      { endAt: "2024-12-31T00:00:00Z" },
      { startAt: "2025-06-02T00:00:00Z" },
      { startAt: "2025-07-01T00:00:00Z", endAt: "2025-06-30T00:00:00Z" },
    ]) {
      const invalid = await client.patch(memberPath).send(body);
      expectValidationError(invalid);
      expect(invalid.body.errors).toEqual([
        expect.objectContaining({ path: ["endAt"] }),
      ]);
    }

    const [membership] = await query<{ start_at: Date; end_at: Date }>(
      `SELECT start_at, end_at FROM org_user_map WHERE org_id_int = ${org.orgIdInt} AND user_id = ${escape(member.userIds.id)}`
    );
    expect(membership).toEqual({
      start_at: new Date("2025-01-01T00:00:00Z"),
      end_at: new Date("2025-06-01T00:00:00Z"),
    });

    // A patch that changes no date skips the check.
    await execute(
      `UPDATE org_user_map SET start_at = '2026-01-01 00:00:00' WHERE org_id_int = ${org.orgIdInt} AND user_id = ${escape(member.userIds.id)}`
    );
    const roleOnly = await client.patch(memberPath).send({ role: "ADMIN" });
    expect(roleOnly.status).toBe(200);

    // Clearing the end date removes the constraint.
    const cleared = await client
      .patch(memberPath)
      .send({ startAt: "2025-07-01T00:00:00Z", endAt: null });
    expect(cleared.status).toBe(200);
  });

  it("patches a member's role and end date, even when inactive", async () => {
    const { client, userIds } = await loggedInUser("orgadmin");
    const { org, member } = await seedTargetOrg();
    await seedOrgMember(org.orgIdInt, userIds, "ADMIN");
    const memberPath = `${ADMIN_ORGS}/target-org/members/${member.userIds.id}`;

    const promoted = await client.patch(memberPath).send({ role: "ADMIN" });
    expect(promoted.status).toBe(200);
    expect(promoted.body).toMatchObject({
      username: "targetmember",
      isAdmin: true,
    });

    // seedOrgMember starts memberships now; an end date must not precede it.
    await execute(
      `UPDATE org_user_map SET start_at = '2019-01-01 00:00:00' WHERE org_id_int = ${org.orgIdInt} AND user_id = ${escape(member.userIds.id)}`
    );

    // Omitting a field leaves it untouched. Setting endAt in the past also
    // makes the member inactive.
    const endAtOnly = await client
      .patch(memberPath)
      .send({ endAt: "2020-01-01 00:00:00" });
    expect(endAtOnly.status).toBe(200);
    expect(endAtOnly.body.isAdmin).toBe(true);
    expect(endAtOnly.body.endAt).toBe("2020-01-01T00:00:00.000Z");

    // Now inactive — still patchable, e.g. to reactivate by clearing endAt.
    const reactivated = await client.patch(memberPath).send({ endAt: null });
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.endAt).toBeNull();
    expect(await memberRoles(org, member.userIds)).toBe("ADMIN");

    const unknownMember = await client
      .patch(`${ADMIN_ORGS}/target-org/members/01M38TSERXFB09A2C2MSRMWYRW`)
      .send({ role: "MEMBER" });
    expect(unknownMember.status).toBe(404);
  });
});

describe("DELETE /api/v1/admin/orgs/{idOrSlug}/members/{memberId}", () => {
  it("removes a member, returning 404 once they are gone", async () => {
    const { client, userIds } = await loggedInUser("orgadmin");
    const { org, member } = await seedTargetOrg();
    await seedOrgMember(org.orgIdInt, userIds, "ADMIN");
    const memberPath = `${ADMIN_ORGS}/target-org/members/${member.userIds.id}`;

    const removed = await client.delete(memberPath);
    expect(removed.status).toBe(204);

    const members = await client.get(`${ADMIN_ORGS}/target-org/members`);
    expect(
      members.body.items.map((item: { userId: string }) => item.userId)
    ).toEqual([userIds.id]);

    expect((await client.delete(memberPath)).status).toBe(404);
  });

  it("hard-deletes a member even if their membership already expired", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);
    const { org, member } = await seedTargetOrg();
    await endMembership(org, member.userIds);
    const memberPath = `${ADMIN_ORGS}/target-org/members/${member.userIds.id}`;

    expect((await client.delete(memberPath)).status).toBe(204);
    expect(
      await query(
        `SELECT * FROM org_user_map WHERE org_id_int = ${org.orgIdInt} AND user_id = ${escape(member.userIds.id)}`
      )
    ).toHaveLength(0);

    expect((await client.delete(memberPath)).status).toBe(404);
  });

  it("does not reach another org's member through the caller's own org", async () => {
    const { client, userIds } = await loggedInUser("orgadmin");
    const ownOrg = await seedOrg("Own Org", "own-org");
    await seedOrgMember(ownOrg.orgIdInt, userIds, "ADMIN");
    const { member, expectUntouched } = await seedTargetOrg();

    const resp = await client.delete(
      `${ADMIN_ORGS}/own-org/members/${member.userIds.id}`
    );
    expect(resp.status).toBe(404);
    expect(resp.body).toEqual({
      type: "application_error",
      errors: { member: { message: "Member not found" } },
    });
    await expectUntouched();
  });
});

describe("GET /api/v1/admin/orgs/{idOrSlug}/publications", () => {
  it("lists the org's publications in every state", async () => {
    const { client, userIds } = await loggedInUser("orgadmin");
    const { org, member } = await seedTargetOrg();
    await seedOrgMember(org.orgIdInt, userIds, "ADMIN");
    const otherOrg = await seedOrg("Other Org", "other-org");

    const inOrg = await seedPublication({
      ownerId: member.userId,
      slug: "in-org",
      state: "PUBLISHED",
    });
    const draftInOrg = await seedPublication({
      ownerId: member.userId,
      slug: "draft-in-org",
    });
    const removedInOrg = await seedPublication({
      ownerId: member.userId,
      slug: "removed-in-org",
      state: "PUBLISHED",
    });
    await execute(
      `UPDATE publications SET state = 'DELETED' WHERE id_int = ${removedInOrg.intId}`
    );
    // A never-published publication whose only draft was deleted has no
    // version to show, so neither the list nor the counts include it.
    const deletedDraftInOrg = await seedPublication({
      ownerId: member.userId,
      slug: "deleted-draft-in-org",
    });
    await execute(
      `UPDATE versions SET state = 'DELETED' WHERE publication_id_int = ${deletedDraftInOrg.intId}`
    );
    const inOtherOrg = await seedPublication({
      ownerId: member.userId,
      slug: "in-other-org",
      state: "PUBLISHED",
    });
    await linkOrg(org, inOrg);
    await linkOrg(org, draftInOrg);
    await linkOrg(org, removedInOrg);
    await linkOrg(org, deletedDraftInOrg);
    await linkOrg(otherOrg, inOtherOrg);

    const resp = await client.get(`${ADMIN_ORGS}/target-org/publications`);
    expect(resp.status).toBe(200);
    expect(
      Object.fromEntries(
        resp.body.items.map((item: { slug: string; state: string }) => [
          item.slug,
          item.state,
        ])
      )
    ).toEqual({
      "in-org": "PUBLISHED",
      "draft-in-org": "DRAFT",
      "removed-in-org": "DELETED",
    });
    expect(resp.body.pagination.total).toBe(3);

    const detail = await client.get(`${ADMIN_ORGS}/target-org`);
    expect(detail.body).toMatchObject({
      publishedPublicationCount: 1,
      totalPublicationCount: 3,
    });
  });
});
