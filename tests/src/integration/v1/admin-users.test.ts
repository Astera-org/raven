import { escape } from "mysql2";
import { describe, expect, it } from "vitest";
import { itEnforcesAdminGate } from "./admin-gate.js";
import {
  endMembership,
  execute,
  expectValidationError,
  loggedInUser,
  makeUser,
  query,
  registerUserWithId,
  seedOrg,
  seedOrgMember,
  seedPublication,
  seedSiteAdmin,
  setMembershipStart,
  type RouteCase,
} from "./helpers.js";

const ADMIN_USERS = "/api/v1/admin/users";
const UNKNOWN_USER_ID = "01J9ZK3Q8M4V7W2X5Y6Z0A1B2C";

async function siteAdminClient() {
  const admin = await loggedInUser("siteadmin");
  await seedSiteAdmin(admin.userId);
  return admin;
}

async function setUserColumn(
  userIdInt: number,
  column: "created_at" | "login_at" | "state" | "orcid" | "email_verified",
  value: string | boolean
) {
  await execute(
    `UPDATE users SET ${column} = ${escape(value)} WHERE id_int = ${userIdInt}`
  );
}

async function addContributor(
  pub: { versionIdInt: number },
  user: { id: string; id_int: number },
  roles = ["Writing"]
) {
  await execute(
    `INSERT INTO contributors (version_id_int, user_id_int, roles, in_byline, priority) VALUES (${pub.versionIdInt}, ${user.id_int}, ${escape(JSON.stringify(roles))}, true, 1)`
  );
}

async function addComment(
  pub: { intId: number; id: string },
  author: { id: string; id_int: number },
  body: string,
  { state = "PUBLISHED", createdAt = "2024-01-01 00:00:00" } = {}
) {
  await execute(
    `INSERT INTO comments (id, publication_id_int, publication_id, user_id_int, user_id, body, state, created_at) VALUES (ULID(), ${pub.intId}, ${escape(pub.id)}, ${author.id_int}, ${escape(author.id)}, ${escape(body)}, ${escape(state)}, ${escape(createdAt)})`
  );
}

function usernamesOf(body: { items: { username: string }[] }) {
  return body.items.map((item) => item.username);
}

async function storedContactFields(userId: string) {
  const [row] = await query<{
    email: string | null;
    orcid: string | null;
    email_verified: number;
  }>(
    `SELECT email, orcid, email_verified FROM users WHERE id = ${escape(userId)}`
  );
  return row;
}

async function seedTargetUser() {
  const target = await registerUserWithId(makeUser("target"));
  return { id: target.userIds.id, idInt: target.userId };
}

const ADMIN_USER_DETAIL_ROUTES: RouteCase<{ id: string }>[] = [
  {
    name: "GET /users/{id}",
    send: (client, { id }) => client.get(`${ADMIN_USERS}/${id}`),
  },
  {
    name: "GET /users/{id}/publications",
    send: (client, { id }) => client.get(`${ADMIN_USERS}/${id}/publications`),
  },
  {
    name: "GET /users/{id}/comments",
    send: (client, { id }) => client.get(`${ADMIN_USERS}/${id}/comments`),
  },
  {
    name: "GET /users/{id}/orgs",
    send: (client, { id }) => client.get(`${ADMIN_USERS}/${id}/orgs`),
  },
  {
    name: "PATCH /users/{id}",
    send: (client, { id }) =>
      client.patch(`${ADMIN_USERS}/${id}`).send({ emailVerified: false }),
  },
];
const ADMIN_USER_ROUTES: RouteCase<{ id: string }>[] = [
  { name: "GET /users", send: (client) => client.get(ADMIN_USERS) },
  ...ADMIN_USER_DETAIL_ROUTES,
];

describe("/api/v1/admin/users authorization gate", () => {
  itEnforcesAdminGate(ADMIN_USER_ROUTES, async () => {
    const target = await seedTargetUser();
    return {
      org: await seedOrg("Target Org", "target-org"),
      target,
      async expectUntouched() {
        const stored = await storedContactFields(target.id);
        expect(stored?.email_verified).toBe(1);
      },
    };
  });

  it.each(ADMIN_USER_ROUTES)(
    "$name forbids an org admin who is not a site admin",
    async (route) => {
      const target = await seedTargetUser();
      const { client, userIds } = await loggedInUser("orgadmin");
      const org = await seedOrg("Target Org", "target-org");
      await seedOrgMember(org.orgIdInt, userIds, "ADMIN");

      const resp = await route.send(client, target);
      expect(resp.status).toBe(403);
      expect(resp.body).toEqual({
        type: "application_error",
        errors: { auth: { message: "Site admin permission required" } },
      });
      expect((await storedContactFields(target.id))?.email_verified).toBe(1);
    }
  );
});

describe("/api/v1/admin/users/{id} lookups", () => {
  it.each(ADMIN_USER_DETAIL_ROUTES)(
    "$name rejects an id that isn't a ULID",
    async (route) => {
      const { client } = await siteAdminClient();

      expectValidationError(await route.send(client, { id: "42" }));
    }
  );

  it.each(ADMIN_USER_DETAIL_ROUTES)(
    "$name returns 404 for an unknown user",
    async (route) => {
      const { client } = await siteAdminClient();

      const resp = await route.send(client, { id: UNKNOWN_USER_ID });
      expect(resp.status).toBe(404);
      expect(resp.body).toEqual({
        type: "application_error",
        errors: { user: { message: "User not found" } },
      });
    }
  );
});

describe("GET /api/v1/admin/users", () => {
  it("lists users in every state, newest first", async () => {
    const { client } = await siteAdminClient();
    for (const [username, state, createdAt] of [
      ["middleuser", "MODERATED", "2024-06-01 00:00:00"],
      ["oldestuser", "DELETED", "2023-01-01 00:00:00"],
      ["newestuser", "ACTIVE", "2025-01-01 00:00:00"],
    ] as const) {
      const { userId } = await registerUserWithId(makeUser(username));
      await setUserColumn(userId, "state", state);
      await setUserColumn(userId, "created_at", createdAt);
    }

    const resp = await client.get(ADMIN_USERS);
    expect(resp.status).toBe(200);
    expect(usernamesOf(resp.body)).toEqual([
      "siteadmin",
      "newestuser",
      "middleuser",
      "oldestuser",
    ]);
    expect(
      resp.body.items.map((item: { state: string }) => item.state)
    ).toEqual(["SITE_ADMIN", "ACTIVE", "MODERATED", "DELETED"]);
    expect(resp.body.pagination).toEqual({ total: 4, page: 1, perPage: 20 });
    expect(resp.body.stats).toEqual({
      totalUsers: 4,
      totalSiteAdmins: 1,
      totalDeleted: 1,
    });
  });

  it("keeps the stats unchanged by search and state filters", async () => {
    const { client } = await siteAdminClient();
    const deleted = await registerUserWithId(makeUser("deleteduser"));
    await setUserColumn(deleted.userId, "state", "DELETED");
    const moderated = await registerUserWithId(makeUser("moderateduser"));
    await setUserColumn(moderated.userId, "state", "MODERATED");
    await registerUserWithId(makeUser("activeuser"));

    for (const [query, filteredTotal] of [
      ["", 4],
      ["?q=deleted", 1],
      ["?state=SITE_ADMIN", 1],
      ["?state=ACTIVE&q=nobody", 0],
    ] as const) {
      const resp = await client.get(`${ADMIN_USERS}${query}`);
      expect(resp.status).toBe(200);
      expect(resp.body.pagination).toEqual({
        total: filteredTotal,
        page: 1,
        perPage: 20,
      });
      expect(resp.body.stats).toEqual({
        totalUsers: 4,
        totalSiteAdmins: 1,
        totalDeleted: 1,
      });
    }
  });

  it("narrows the list to one state", async () => {
    const { client } = await siteAdminClient();
    const deleted = await registerUserWithId(makeUser("deleteduser"));
    await setUserColumn(deleted.userId, "state", "DELETED");
    await registerUserWithId(makeUser("activeuser"));

    const resp = await client.get(`${ADMIN_USERS}?state=DELETED`);
    expect(resp.status).toBe(200);
    expect(usernamesOf(resp.body)).toEqual(["deleteduser"]);
    expect(resp.body.pagination.total).toBe(1);
  });

  it("rejects a state that isn't a user state", async () => {
    const { client } = await siteAdminClient();

    expectValidationError(await client.get(`${ADMIN_USERS}?state=removed`));
  });

  it("requires every search word to match a username, email or name", async () => {
    const { client } = await siteAdminClient();
    await registerUserWithId(
      makeUser("jane", { firstName: "Jane", lastName: "Doe" })
    );
    await registerUserWithId(
      makeUser("janet", { firstName: "Janet", lastName: "Smith" })
    );
    await registerUserWithId(makeUser("bob", { email: "doe.fan@example.com" }));

    const bothWords = await client.get(`${ADMIN_USERS}?q=jane%20doe`);
    expect(bothWords.status).toBe(200);
    expect(usernamesOf(bothWords.body)).toEqual(["jane"]);

    const oneWord = await client.get(`${ADMIN_USERS}?q=DOE`);
    expect(usernamesOf(oneWord.body).sort()).toEqual(["bob", "jane"]);
    expect(oneWord.body.pagination.total).toBe(2);
  });

  it("treats LIKE wildcards in the search as literal characters", async () => {
    const { client } = await siteAdminClient();
    await registerUserWithId(makeUser("plainuser"));

    for (const q of ["%25", "_"]) {
      const resp = await client.get(`${ADMIN_USERS}?q=${q}`);
      expect(resp.status).toBe(200);
      expect(resp.body.items).toEqual([]);
      expect(resp.body.pagination.total).toBe(0);
    }
  });

  it("ignores a search of only whitespace", async () => {
    const { client } = await siteAdminClient();
    await registerUserWithId(makeUser("plainuser"));

    const resp = await client.get(`${ADMIN_USERS}?q=%20%20`);
    expect(resp.status).toBe(200);
    expect(resp.body.pagination.total).toBe(2);
  });

  it("pages through users sharing a created date without repeating or skipping any", async () => {
    const { client } = await siteAdminClient();
    for (const username of ["tiea", "tieb", "tiec"]) {
      await registerUserWithId(makeUser(username));
    }
    await execute(`UPDATE users SET created_at = '2024-01-01 00:00:00'`);

    const seen: string[] = [];
    for (const page of [1, 2]) {
      const resp = await client.get(`${ADMIN_USERS}?page=${page}&perPage=2`);
      expect(resp.status).toBe(200);
      expect(resp.body.pagination).toMatchObject({
        total: 4,
        page,
        perPage: 2,
      });
      seen.push(...usernamesOf(resp.body));
    }
    expect(seen.sort()).toEqual(["siteadmin", "tiea", "tieb", "tiec"]);
  });

  it("shows the earliest current membership in an active org", async () => {
    const { client } = await siteAdminClient();
    const member = await registerUserWithId(makeUser("member"));
    await registerUserWithId(makeUser("loner"));

    const later = await seedOrg("Later Org", "later-org");
    const earliest = await seedOrg("Earliest Org", "earliest-org");
    const ended = await seedOrg("Ended Org", "ended-org");
    const deleted = await seedOrg("Deleted Org", "deleted-org");
    for (const [org, roles, startAt] of [
      [later, "", "2024-01-01 00:00:00"],
      [earliest, "ADMIN", "2023-01-01 00:00:00"],
      [ended, "", "2020-01-01 00:00:00"],
      [deleted, "", "2019-01-01 00:00:00"],
    ] as const) {
      await seedOrgMember(org.orgIdInt, member.userIds, roles);
      await setMembershipStart(org, member.userId, startAt);
    }
    await endMembership(ended, member.userIds);
    await execute(
      `UPDATE organizations SET state = 'DELETED' WHERE id_int = ${deleted.orgIdInt}`
    );

    const resp = await client.get(ADMIN_USERS);
    expect(resp.status).toBe(200);
    const byUsername = new Map(
      resp.body.items.map((item: { username: string }) => [item.username, item])
    );
    expect(byUsername.get("member")).toMatchObject({
      organization: {
        orgId: earliest.orgId,
        name: "Earliest Org",
        slug: "earliest-org",
        isAdmin: true,
      },
    });
    expect(byUsername.get("loner")).toMatchObject({ organization: null });
  });

  it("prefers a membership with a start date over one without", async () => {
    const { client } = await siteAdminClient();
    const member = await registerUserWithId(makeUser("member"));

    const undated = await seedOrg("Undated Org", "undated-org");
    const dated = await seedOrg("Dated Org", "dated-org");
    for (const [org, startAt] of [
      [undated, null],
      [dated, "2024-01-01 00:00:00"],
    ] as const) {
      await seedOrgMember(org.orgIdInt, member.userIds);
      await setMembershipStart(org, member.userId, startAt);
    }

    const resp = await client.get(`${ADMIN_USERS}?q=member`);
    expect(resp.status).toBe(200);
    expect(resp.body.items).toHaveLength(1);
    expect(resp.body.items[0].organization).toEqual({
      orgId: dated.orgId,
      name: "Dated Org",
      slug: "dated-org",
      isAdmin: false,
    });
  });

  it("returns UTC ISO dates and only the admin list fields", async () => {
    const { client } = await siteAdminClient();
    const user = await registerUserWithId(makeUser("dated"));
    await setUserColumn(user.userId, "created_at", "2024-01-02 03:04:05.678");
    await setUserColumn(user.userId, "login_at", "2024-05-06 07:08:09.123");

    const resp = await client.get(`${ADMIN_USERS}?q=dated`);
    expect(resp.status).toBe(200);
    const [item] = resp.body.items;
    expect(Object.keys(item).sort()).toEqual(
      [
        "avatar",
        "createdAt",
        "email",
        "firstName",
        "id",
        "lastName",
        "loginAt",
        "organization",
        "state",
        "username",
      ].sort()
    );
    expect(item).toMatchObject({
      id: user.userIds.id,
      username: "dated",
      email: "dated@example.com",
      createdAt: "2024-01-02T03:04:05.678Z",
      loginAt: "2024-05-06T07:08:09.123Z",
    });
    expect(item).not.toHaveProperty("password");
    expect(item).not.toHaveProperty("idInt");
  });
});

describe("GET /api/v1/admin/users/{id}", () => {
  it("returns a user in any state, with only the profile fields", async () => {
    const { client } = await siteAdminClient();
    const user = await registerUserWithId(
      makeUser("removeduser", { firstName: "Removed", lastName: "Person" })
    );
    await setUserColumn(user.userId, "state", "DELETED");
    await setUserColumn(user.userId, "created_at", "2024-01-02 03:04:05");
    await setUserColumn(user.userId, "login_at", "2024-05-06 07:08:09.123");

    const resp = await client.get(`${ADMIN_USERS}/${user.userIds.id}`);
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({
      id: user.userIds.id,
      username: "removeduser",
      email: "removeduser@example.com",
      firstName: "Removed",
      lastName: "Person",
      avatar: null,
      orcid: null,
      emailVerified: true,
      state: "DELETED",
      loginAt: "2024-05-06T07:08:09.123Z",
      createdAt: "2024-01-02T03:04:05.000Z",
    });
  });
});

describe("PATCH /api/v1/admin/users/{id}", () => {
  it("updates email, ORCID iD and verification together", async () => {
    const { client } = await siteAdminClient();
    const target = await seedTargetUser();

    const resp = await client.patch(`${ADMIN_USERS}/${target.id}`).send({
      email: "renamed@example.com",
      orcid: "0000-0002-1825-009X",
      emailVerified: false,
    });
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual(
      expect.objectContaining({
        id: target.id,
        username: "target",
        email: "renamed@example.com",
        orcid: "0000-0002-1825-009X",
        emailVerified: false,
      })
    );
    expect(await storedContactFields(target.id)).toEqual({
      email: "renamed@example.com",
      orcid: "0000-0002-1825-009X",
      email_verified: 0,
    });
  });

  it("leaves fields missing from the body untouched", async () => {
    const { client } = await siteAdminClient();
    const target = await seedTargetUser();

    const resp = await client
      .patch(`${ADMIN_USERS}/${target.id}`)
      .send({ orcid: "0000-0002-1825-0097" });
    expect(resp.status).toBe(200);
    expect(await storedContactFields(target.id)).toEqual({
      email: "target@example.com",
      orcid: "0000-0002-1825-0097",
      email_verified: 1,
    });
  });

  it.each([true, false])(
    "keeps emailVerified %s when only the email changes",
    async (verified) => {
      const { client } = await siteAdminClient();
      const target = await seedTargetUser();
      await setUserColumn(target.idInt, "email_verified", verified);

      const resp = await client
        .patch(`${ADMIN_USERS}/${target.id}`)
        .send({ email: "moved@example.com" });
      expect(resp.status).toBe(200);
      expect(resp.body.emailVerified).toBe(verified);
      expect(await storedContactFields(target.id)).toEqual({
        email: "moved@example.com",
        orcid: null,
        email_verified: verified ? 1 : 0,
      });
    }
  );

  it("marks an unverified user's email as verified", async () => {
    const { client } = await siteAdminClient();
    const target = await seedTargetUser();
    await setUserColumn(target.idInt, "email_verified", false);

    const resp = await client
      .patch(`${ADMIN_USERS}/${target.id}`)
      .send({ emailVerified: true });
    expect(resp.status).toBe(200);
    expect(resp.body.emailVerified).toBe(true);
    expect(await storedContactFields(target.id)).toEqual({
      email: "target@example.com",
      orcid: null,
      email_verified: 1,
    });
  });

  it("clears the ORCID iD when sent null", async () => {
    const { client } = await siteAdminClient();
    const target = await seedTargetUser();
    await setUserColumn(target.idInt, "orcid", "0000-0002-1825-0097");

    const resp = await client
      .patch(`${ADMIN_USERS}/${target.id}`)
      .send({ orcid: null });
    expect(resp.status).toBe(200);
    expect(resp.body.orcid).toBeNull();
    expect((await storedContactFields(target.id))?.orcid).toBeNull();
  });

  it("returns the user unchanged for an empty body", async () => {
    const { client } = await siteAdminClient();
    const target = await seedTargetUser();
    await setUserColumn(target.idInt, "orcid", "0000-0002-1825-0097");
    await setUserColumn(target.idInt, "email_verified", false);

    const resp = await client.patch(`${ADMIN_USERS}/${target.id}`).send({});
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual(
      expect.objectContaining({
        email: "target@example.com",
        orcid: "0000-0002-1825-0097",
        emailVerified: false,
      })
    );
    expect(await storedContactFields(target.id)).toEqual({
      email: "target@example.com",
      orcid: "0000-0002-1825-0097",
      email_verified: 0,
    });
  });

  it("refuses an email another user already has", async () => {
    const { client } = await siteAdminClient();
    const target = await seedTargetUser();
    await registerUserWithId(makeUser("other"));

    const resp = await client
      .patch(`${ADMIN_USERS}/${target.id}`)
      .send({ email: "other@example.com", emailVerified: false });
    expect(resp.status).toBe(409);
    expect(resp.body).toEqual({
      type: "application_error",
      errors: { email: { message: "A user with this email already exists" } },
    });
    expect(await storedContactFields(target.id)).toEqual({
      email: "target@example.com",
      orcid: null,
      email_verified: 1,
    });
  });

  it("accepts the user's own current email", async () => {
    const { client } = await siteAdminClient();
    const target = await seedTargetUser();

    const resp = await client
      .patch(`${ADMIN_USERS}/${target.id}`)
      .send({ email: "target@example.com" });
    expect(resp.status).toBe(200);
    expect(resp.body.email).toBe("target@example.com");
  });

  it("trims and lowercases the email", async () => {
    const { client } = await siteAdminClient();
    const target = await seedTargetUser();

    const resp = await client
      .patch(`${ADMIN_USERS}/${target.id}`)
      .send({ email: "  Renamed@Example.COM " });
    expect(resp.status).toBe(200);
    expect(resp.body.email).toBe("renamed@example.com");
    expect((await storedContactFields(target.id))?.email).toBe(
      "renamed@example.com"
    );
  });

  const ORCID_FORMAT_ISSUE = {
    path: ["orcid"],
    code: "invalid_format",
    message: "ORCID iD must look like 0000-0002-1825-0097.",
  };

  it.each([
    {
      label: "an ORCID iD in the wrong format",
      body: { orcid: "0000-0002-1825" },
      issue: ORCID_FORMAT_ISSUE,
    },
    {
      label: "an empty ORCID iD",
      body: { orcid: "" },
      issue: ORCID_FORMAT_ISSUE,
    },
    {
      label: "an invalid email",
      body: { email: "not-an-email" },
      issue: { path: ["email"], code: "invalid_format" },
    },
    {
      label: "a null email",
      body: { email: null },
      issue: { path: ["email"], code: "invalid_type" },
    },
    {
      label: "a non-boolean emailVerified",
      body: { emailVerified: "yes" },
      issue: { path: ["emailVerified"], code: "invalid_type" },
    },
  ])("rejects $label", async ({ body, issue }) => {
    const { client } = await siteAdminClient();
    const target = await seedTargetUser();

    const resp = await client.patch(`${ADMIN_USERS}/${target.id}`).send(body);
    expectValidationError(resp);
    expect(resp.body.errors).toEqual([expect.objectContaining(issue)]);
    expect(await storedContactFields(target.id)).toEqual({
      email: "target@example.com",
      orcid: null,
      email_verified: 1,
    });
  });
});

describe("GET /api/v1/admin/users/{id}/publications", () => {
  it("lists publications the user owns or contributes to, in every state", async () => {
    const { client } = await siteAdminClient();
    const author = await registerUserWithId(makeUser("author"));
    const other = await registerUserWithId(makeUser("other"));
    await seedPublication({ ownerId: author.userId, slug: "owned-draft" });
    const ownedOnly = await seedPublication({
      ownerId: author.userId,
      slug: "owned-published",
      state: "PUBLISHED",
    });
    // seedPublication also adds the owner as a contributor; without that row
    // this publication matches on ownership alone.
    await execute(
      `DELETE FROM contributors WHERE version_id_int = ${ownedOnly.versionIdInt}`
    );
    const removed = await seedPublication({
      ownerId: author.userId,
      slug: "owned-removed",
      state: "PUBLISHED",
    });
    await execute(
      `UPDATE publications SET state = 'DELETED' WHERE id_int = ${removed.intId}`
    );
    const contributed = await seedPublication({
      ownerId: other.userId,
      slug: "contributed",
      state: "PUBLISHED",
    });
    await addContributor(contributed, author.userIds);
    await seedPublication({
      ownerId: other.userId,
      slug: "not-theirs",
      state: "PUBLISHED",
    });

    const resp = await client.get(
      `${ADMIN_USERS}/${author.userIds.id}/publications`
    );
    expect(resp.status).toBe(200);
    expect(
      resp.body.items.map((item: { slug: string }) => item.slug).sort()
    ).toEqual([
      "contributed",
      "owned-draft",
      "owned-published",
      "owned-removed",
    ]);
    expect(resp.body.pagination.total).toBe(4);
  });

  it("lists a publication once when the user holds several contributor roles on it", async () => {
    const { client } = await siteAdminClient();
    const author = await registerUserWithId(makeUser("author"));
    const owner = await registerUserWithId(makeUser("owner"));
    const pub = await seedPublication({
      ownerId: owner.userId,
      slug: "multi-role",
      state: "PUBLISHED",
    });
    await addContributor(pub, author.userIds, ["Writing", "Editing"]);

    const resp = await client.get(
      `${ADMIN_USERS}/${author.userIds.id}/publications`
    );
    expect(resp.status).toBe(200);
    expect(resp.body.items.map((item: { slug: string }) => item.slug)).toEqual([
      "multi-role",
    ]);
    expect(resp.body.pagination.total).toBe(1);
  });

  it("pages through the user's publications without repeating or skipping any", async () => {
    const { client } = await siteAdminClient();
    const author = await registerUserWithId(makeUser("author"));
    for (const slug of ["pub-a", "pub-b", "pub-c"]) {
      await seedPublication({ ownerId: author.userId, slug });
    }

    const seen: string[] = [];
    for (const page of [1, 2]) {
      const resp = await client.get(
        `${ADMIN_USERS}/${author.userIds.id}/publications?page=${page}&perPage=2`
      );
      expect(resp.status).toBe(200);
      expect(resp.body.pagination).toEqual({ total: 3, page, perPage: 2 });
      seen.push(...resp.body.items.map((item: { slug: string }) => item.slug));
    }
    expect(seen.sort()).toEqual(["pub-a", "pub-b", "pub-c"]);
  });
});

describe("GET /api/v1/admin/users/{id}/comments", () => {
  it("lists only the user's published comments, newest first, with their publication", async () => {
    const { client } = await siteAdminClient();
    const commenter = await registerUserWithId(makeUser("commenter"));
    const other = await registerUserWithId(makeUser("other"));
    const pub = await seedPublication({
      ownerId: other.userId,
      slug: "commented-pub",
      title: "Commented Pub",
      state: "PUBLISHED",
    });
    await addComment(pub, commenter.userIds, "Older", {
      createdAt: "2024-01-01 00:00:00",
    });
    await addComment(pub, commenter.userIds, "Newer", {
      createdAt: "2024-06-01 00:00:00",
    });
    await addComment(pub, commenter.userIds, "Moderated", {
      state: "MODERATED",
    });
    await addComment(pub, commenter.userIds, "Deleted", { state: "DELETED" });
    await addComment(pub, other.userIds, "Someone else's");

    const resp = await client.get(
      `${ADMIN_USERS}/${commenter.userIds.id}/comments`
    );
    expect(resp.status).toBe(200);
    expect(resp.body.items.map((item: { body: string }) => item.body)).toEqual([
      "Newer",
      "Older",
    ]);
    expect(resp.body.pagination).toEqual({ total: 2, page: 1, perPage: 20 });
    expect(resp.body.items[0]).toEqual({
      id: expect.any(String),
      body: "Newer",
      createdAt: "2024-06-01T00:00:00.000Z",
      publication: {
        id: pub.id,
        slug: "commented-pub",
        title: "Commented Pub",
      },
    });
  });

  it("returns a null title when the publication's current version is untitled", async () => {
    const { client } = await siteAdminClient();
    const commenter = await registerUserWithId(makeUser("commenter"));
    const pub = await seedPublication({
      ownerId: commenter.userId,
      slug: "untitled-pub",
      state: "PUBLISHED",
    });
    await execute(
      `UPDATE versions SET title = NULL WHERE publication_id_int = ${pub.intId}`
    );
    await addComment(pub, commenter.userIds, "On an untitled pub");

    const resp = await client.get(
      `${ADMIN_USERS}/${commenter.userIds.id}/comments`
    );
    expect(resp.status).toBe(200);
    expect(resp.body.items[0].publication).toEqual({
      id: pub.id,
      slug: "untitled-pub",
      title: null,
    });
  });

  it("returns a null title when the publication has no current version", async () => {
    const { client } = await siteAdminClient();
    const commenter = await registerUserWithId(makeUser("commenter"));
    const pub = await seedPublication({
      ownerId: commenter.userId,
      slug: "versionless-pub",
    });
    // A never-published draft whose only version is deleted has no version
    // for the admin list to serve.
    await execute(
      `UPDATE versions SET state = 'DELETED' WHERE publication_id_int = ${pub.intId}`
    );
    await addComment(pub, commenter.userIds, "On a versionless pub");

    const resp = await client.get(
      `${ADMIN_USERS}/${commenter.userIds.id}/comments`
    );
    expect(resp.status).toBe(200);
    expect(resp.body.pagination.total).toBe(1);
    expect(resp.body.items[0].publication).toEqual({
      id: pub.id,
      slug: "versionless-pub",
      title: null,
    });
  });

  it("pages through the user's comments", async () => {
    const { client } = await siteAdminClient();
    const commenter = await registerUserWithId(makeUser("commenter"));
    const pub = await seedPublication({
      ownerId: commenter.userId,
      state: "PUBLISHED",
    });
    for (const [body, createdAt] of [
      ["First", "2024-01-01 00:00:00"],
      ["Second", "2024-02-01 00:00:00"],
      ["Third", "2024-03-01 00:00:00"],
    ] as const) {
      await addComment(pub, commenter.userIds, body, { createdAt });
    }

    const resp = await client.get(
      `${ADMIN_USERS}/${commenter.userIds.id}/comments?page=2&perPage=2`
    );
    expect(resp.status).toBe(200);
    expect(resp.body.pagination).toEqual({ total: 3, page: 2, perPage: 2 });
    expect(resp.body.items.map((item: { body: string }) => item.body)).toEqual([
      "First",
    ]);
  });
});

describe("GET /api/v1/admin/users/{id}/orgs", () => {
  async function seedMemberships() {
    const member = await registerUserWithId(makeUser("member"));
    const later = await seedOrg("Later Org", "later-org");
    const earliest = await seedOrg("Earliest Org", "earliest-org");
    const undated = await seedOrg("Undated Org", "undated-org");
    const ended = await seedOrg("Ended Org", "ended-org");
    const deleted = await seedOrg("Deleted Org", "deleted-org");
    for (const [org, roles, startAt] of [
      [later, "", "2024-01-01 00:00:00"],
      [earliest, "ADMIN", "2023-01-01 00:00:00"],
      [undated, "", null],
      [ended, "", "2020-01-01 00:00:00"],
      [deleted, "", "2019-01-01 00:00:00"],
    ] as const) {
      await seedOrgMember(org.orgIdInt, member.userIds, roles);
      await setMembershipStart(org, member.userId, startAt);
    }
    await endMembership(ended, member.userIds);
    await execute(
      `UPDATE organizations SET state = 'DELETED' WHERE id_int = ${deleted.orgIdInt}`
    );
    return { member, later, earliest, undated };
  }

  it("lists only the user's current memberships in active orgs, earliest first and undated last", async () => {
    const { client } = await siteAdminClient();
    const { member, later, earliest, undated } = await seedMemberships();
    const outsider = await registerUserWithId(makeUser("outsider"));
    const outsiderOrg = await seedOrg("Outsider Org", "outsider-org");
    await seedOrgMember(outsiderOrg.orgIdInt, outsider.userIds, "ADMIN");
    await seedOrgMember(later.orgIdInt, outsider.userIds);

    const resp = await client.get(`${ADMIN_USERS}/${member.userIds.id}/orgs`);
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({
      pagination: { total: 3, page: 1, perPage: 20 },
      items: [
        {
          orgId: earliest.orgId,
          name: "Earliest Org",
          slug: "earliest-org",
          isAdmin: true,
          startAt: "2023-01-01T00:00:00.000Z",
        },
        {
          orgId: later.orgId,
          name: "Later Org",
          slug: "later-org",
          isAdmin: false,
          startAt: "2024-01-01T00:00:00.000Z",
        },
        {
          orgId: undated.orgId,
          name: "Undated Org",
          slug: "undated-org",
          isAdmin: false,
          startAt: null,
        },
      ],
    });
  });

  it("starts with the membership the users list shows as the user's organization", async () => {
    const { client } = await siteAdminClient();
    const { member } = await seedMemberships();

    const [orgsResp, listResp] = await Promise.all([
      client.get(`${ADMIN_USERS}/${member.userIds.id}/orgs`),
      client.get(`${ADMIN_USERS}?q=member`),
    ]);
    const [first] = orgsResp.body.items;
    expect(listResp.body.items[0].organization).toEqual({
      orgId: first.orgId,
      name: first.name,
      slug: first.slug,
      isAdmin: first.isAdmin,
    });
  });

  it("excludes a not-yet-started membership from the org list and the users list's organization", async () => {
    const { client } = await siteAdminClient();
    const member = await registerUserWithId(makeUser("member"));
    const undated = await seedOrg("Undated Org", "undated-org");
    const future = await seedOrg("Future Org", "future-org");
    // A dated membership sorts before an undated one, so a future-dated one
    // would otherwise be listed first and picked as the user's organization.
    for (const [org, roles, startAt] of [
      [undated, "", null],
      [future, "ADMIN", "2999-01-01 00:00:00"],
    ] as const) {
      await seedOrgMember(org.orgIdInt, member.userIds, roles);
      await setMembershipStart(org, member.userId, startAt);
    }

    const [orgsResp, listResp] = await Promise.all([
      client.get(`${ADMIN_USERS}/${member.userIds.id}/orgs`),
      client.get(`${ADMIN_USERS}?q=member`),
    ]);
    expect(orgsResp.status).toBe(200);
    expect(orgsResp.body).toEqual({
      pagination: { total: 1, page: 1, perPage: 20 },
      items: [
        {
          orgId: undated.orgId,
          name: "Undated Org",
          slug: "undated-org",
          isAdmin: false,
          startAt: null,
        },
      ],
    });
    expect(listResp.status).toBe(200);
    expect(listResp.body.items).toHaveLength(1);
    expect(listResp.body.items[0].organization).toEqual({
      orgId: undated.orgId,
      name: "Undated Org",
      slug: "undated-org",
      isAdmin: false,
    });
  });

  it("pages through the user's memberships", async () => {
    const { client } = await siteAdminClient();
    const { member, undated } = await seedMemberships();

    const resp = await client.get(
      `${ADMIN_USERS}/${member.userIds.id}/orgs?page=2&perPage=2`
    );
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({
      pagination: { total: 3, page: 2, perPage: 2 },
      items: [
        {
          orgId: undated.orgId,
          name: "Undated Org",
          slug: "undated-org",
          isAdmin: false,
          startAt: null,
        },
      ],
    });
  });

  it("returns an empty page for a user with no current memberships", async () => {
    const { client } = await siteAdminClient();
    const loner = await registerUserWithId(makeUser("loner"));

    const resp = await client.get(`${ADMIN_USERS}/${loner.userIds.id}/orgs`);
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({
      pagination: { total: 0, page: 1, perPage: 20 },
      items: [],
    });
  });
});
