import { describe, expect, it } from "vitest";
import {
  endMembership,
  execute,
  loggedInUser,
  seedOrg,
  seedOrgMember,
  seedSiteAdmin,
  setMembershipStart,
  TestApiClient,
  UNAUTHENTICATED,
} from "./helpers.js";

const ME = "/api/v1/users/me";

describe("GET /api/v1/users", () => {
  // The list and search are public, so they must never reveal emails, and
  // searching by email (exact or prefix) is for signed-in callers only.
  const usernamesFor = async (client: TestApiClient, q: string) => {
    const resp = await client.get(`/api/v1/users?q=${encodeURIComponent(q)}`);
    expect(resp.status).toBe(200);
    expect(resp.text).not.toContain("@example.com");
    return (resp.body.items as { username: string }[]).map((u) => u.username);
  };

  it("never includes emails when listing users", async () => {
    await loggedInUser("bob");
    const { client } = await loggedInUser("alice");

    for (const c of [new TestApiClient(), client]) {
      const resp = await c.get("/api/v1/users");
      expect(resp.status).toBe(200);
      expect(resp.body.items).toHaveLength(2);
      for (const item of resp.body.items) {
        expect(item).not.toHaveProperty("email");
      }
      expect(resp.text).not.toContain("@example.com");
    }
  });

  it("does not search by email for anonymous callers", async () => {
    await loggedInUser("bob");
    const anonymous = new TestApiClient();

    expect(await usernamesFor(anonymous, "bob@example.com")).toEqual([]);
    expect(await usernamesFor(anonymous, "bob@")).toEqual([]);
    // Other kinds of query still work.
    expect(await usernamesFor(anonymous, "bob")).toEqual(["bob"]);
  });

  it("searches by exact email or email prefix for signed-in callers", async () => {
    await loggedInUser("bob");
    const { client } = await loggedInUser("alice");

    expect(await usernamesFor(client, "bob@example.com")).toEqual(["bob"]);
    expect(await usernamesFor(client, "bob@")).toEqual(["bob"]);
    expect(await usernamesFor(client, "nobody@example.com")).toEqual([]);
  });
});

describe("GET /api/v1/users/me", () => {
  it("requires authentication", async () => {
    const resp = await new TestApiClient().get(ME);
    expect(resp.status).toBe(401);
    expect(resp.body).toEqual(UNAUTHENTICATED);
  });

  it("returns only the caller's profile and admin standing", async () => {
    const { client } = await loggedInUser("plainuser");

    const resp = await client.get(ME);
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({
      firstName: "Plainuser",
      lastName: "User",
      avatar: null,
      state: "ACTIVE",
      isOrgAdmin: false,
    });
  });

  it("returns the stored avatar path", async () => {
    const { client, userId } = await loggedInUser("withavatar");
    await execute(
      `UPDATE users SET image = 'avatars/users/user_1.png' WHERE id_int = ${userId}`
    );

    const resp = await client.get(ME);
    expect(resp.status).toBe(200);
    expect(resp.body.avatar).toBe("avatars/users/user_1.png");
  });

  it("reports SITE_ADMIN state", async () => {
    const { client, userId } = await loggedInUser("siteadmin");
    await seedSiteAdmin(userId);

    const resp = await client.get(ME);
    expect(resp.status).toBe(200);
    expect(resp.body.state).toBe("SITE_ADMIN");
    expect(resp.body.isOrgAdmin).toBe(false);
  });

  it("does not report a site admin's org admin membership", async () => {
    const org = await seedOrg();
    const { client, userId, userIds } = await loggedInUser("siteorgadmin");
    await seedOrgMember(org.orgIdInt, userIds, "ADMIN");
    await seedSiteAdmin(userId);

    const resp = await client.get(ME);
    expect(resp.body.state).toBe("SITE_ADMIN");
    expect(resp.body.isOrgAdmin).toBe(false);
  });

  it("reports an active org admin", async () => {
    const org = await seedOrg();
    const { client, userIds } = await loggedInUser("orgadmin");
    await seedOrgMember(org.orgIdInt, userIds, "ADMIN");

    const resp = await client.get(ME);
    expect(resp.status).toBe(200);
    expect(resp.body.isOrgAdmin).toBe(true);
  });

  it("does not count a plain org membership", async () => {
    const org = await seedOrg();
    const { client, userIds } = await loggedInUser("plainmember");
    await seedOrgMember(org.orgIdInt, userIds);

    const resp = await client.get(ME);
    expect(resp.body.isOrgAdmin).toBe(false);
  });

  it("does not count an ended admin membership", async () => {
    const org = await seedOrg();
    const { client, userIds } = await loggedInUser("endedadmin");
    await seedOrgMember(org.orgIdInt, userIds, "ADMIN");
    await endMembership(org, userIds);

    const resp = await client.get(ME);
    expect(resp.body.isOrgAdmin).toBe(false);
  });

  it("does not count a not-yet-started admin membership", async () => {
    const org = await seedOrg();
    const { client, userId, userIds } = await loggedInUser("futureadmin");
    await seedOrgMember(org.orgIdInt, userIds, "ADMIN");
    await setMembershipStart(org, userId, "2999-01-01 00:00:00");

    const resp = await client.get(ME);
    expect(resp.body.isOrgAdmin).toBe(false);
  });

  it("does not count an admin membership in a deleted org", async () => {
    const org = await seedOrg();
    const { client, userIds } = await loggedInUser("deletedorgadmin");
    await seedOrgMember(org.orgIdInt, userIds, "ADMIN");
    await execute(
      `UPDATE organizations SET state = 'DELETED' WHERE id_int = ${org.orgIdInt}`
    );

    const resp = await client.get(ME);
    expect(resp.body.isOrgAdmin).toBe(false);
  });

  it("does not count an admin membership of a moderated user", async () => {
    const org = await seedOrg();
    const { client, userId, userIds } = await loggedInUser("moderated");
    await seedOrgMember(org.orgIdInt, userIds, "ADMIN");
    await execute(
      `UPDATE users SET state = 'MODERATED' WHERE id_int = ${userId}`
    );

    const resp = await client.get(ME);
    expect(resp.status).toBe(200);
    expect(resp.body.state).toBe("MODERATED");
    expect(resp.body.isOrgAdmin).toBe(false);
  });
});
