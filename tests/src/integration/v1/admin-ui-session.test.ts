import { describe, expect, it } from "vitest";
import { type AdminUiClientHeaders } from "../../../../backend-ts/dist/lib/admin-ui-session.js";
import {
  endMembership,
  execute,
  loggedInUser,
  seedOrg,
  seedOrgMember,
  seedSiteAdmin,
  setMembershipStart,
  TestApiClient,
} from "./helpers.js";

const GET_SESSION = "/api/auth2/get-session";
const ADMIN_UI_HEADERS = {
  "x-raven-client": "admin-ui",
} satisfies AdminUiClientHeaders;

function getAdminUiSession(client: TestApiClient) {
  return client.get(GET_SESSION).set(ADMIN_UI_HEADERS);
}

/** Signs in for real, so the session travels as the cookie the admin UI sends. */
async function cookieSignedInUser(username: string) {
  const registered = await loggedInUser(username);
  await registered.client.login(
    registered.user.username,
    registered.user.password
  );
  return registered;
}

// The session's permissions must agree with the routes that enforce them:
// `isOrgAdmin` with `GET /api/v1/users/me` (users.test.ts) and
// `canCreatePublications` with `POST /api/v1/imports` (imports.test.ts).
describe("GET /api/auth2/get-session admin UI permissions", () => {
  it("leaves other clients' sessions unchanged", async () => {
    const org = await seedOrg();
    const { client, userIds } = await loggedInUser("otherclient");
    await seedOrgMember(org.orgIdInt, userIds, "ADMIN");

    const resp = await client.get(GET_SESSION);
    expect(resp.status).toBe(200);
    expect(resp.body.user.username).toBe("otherclient");
    expect(resp.body.user).not.toHaveProperty("isOrgAdmin");
    expect(resp.body.user).not.toHaveProperty("canCreatePublications");
  });

  it("returns null for the admin UI without a session", async () => {
    const resp = await getAdminUiSession(new TestApiClient());
    expect(resp.status).toBe(200);
    expect(resp.body).toBeNull();
  });

  it("reports no permissions for a user outside any org", async () => {
    const { client } = await cookieSignedInUser("plainsession");

    const resp = await getAdminUiSession(client);
    expect(resp.status).toBe(200);
    expect(resp.body.user).toEqual(
      expect.objectContaining({
        username: "plainsession",
        state: "ACTIVE",
        isOrgAdmin: false,
        canCreatePublications: false,
      })
    );
  });

  it("reports an active admin of a creator org", async () => {
    const org = await seedOrg();
    const { client, userIds } = await cookieSignedInUser("creatoradmin");
    await seedOrgMember(org.orgIdInt, userIds, "ADMIN");

    const resp = await getAdminUiSession(client);
    expect(resp.body.user.isOrgAdmin).toBe(true);
    expect(resp.body.user.canCreatePublications).toBe(true);
  });

  it("lets a plain creator org member create publications without org admin", async () => {
    const org = await seedOrg();
    const { client, userIds } = await loggedInUser("creatormember");
    await seedOrgMember(org.orgIdInt, userIds);

    const resp = await getAdminUiSession(client);
    expect(resp.body.user.isOrgAdmin).toBe(false);
    expect(resp.body.user.canCreatePublications).toBe(true);
  });

  it("lets a site admin create publications without org admin", async () => {
    const { client, userId } = await loggedInUser("sessionsiteadmin");
    await seedSiteAdmin(userId);

    const resp = await getAdminUiSession(client);
    expect(resp.body.user.state).toBe("SITE_ADMIN");
    expect(resp.body.user.isOrgAdmin).toBe(false);
    expect(resp.body.user.canCreatePublications).toBe(true);
  });

  it("does not count a not-yet-started creator org admin membership", async () => {
    const org = await seedOrg();
    const { client, userId, userIds } = await loggedInUser("futurecreator");
    await seedOrgMember(org.orgIdInt, userIds, "ADMIN");
    await setMembershipStart(org, userId, "2999-01-01 00:00:00");

    const resp = await getAdminUiSession(client);
    expect(resp.body.user.isOrgAdmin).toBe(false);
    expect(resp.body.user.canCreatePublications).toBe(false);
  });

  it("does not count an ended creator org admin membership", async () => {
    const org = await seedOrg();
    const { client, userIds } = await loggedInUser("endedcreator");
    await seedOrgMember(org.orgIdInt, userIds, "ADMIN");
    await endMembership(org, userIds);

    const resp = await getAdminUiSession(client);
    expect(resp.body.user.isOrgAdmin).toBe(false);
    expect(resp.body.user.canCreatePublications).toBe(false);
  });

  it("grants a moderated creator org admin nothing", async () => {
    const org = await seedOrg();
    const { client, userId, userIds } = await loggedInUser("moderatedcreator");
    await seedOrgMember(org.orgIdInt, userIds, "ADMIN");
    await execute(
      `UPDATE users SET state = 'MODERATED' WHERE id_int = ${userId}`
    );

    const resp = await getAdminUiSession(client);
    expect(resp.status).toBe(200);
    expect(resp.body.user.state).toBe("MODERATED");
    expect(resp.body.user.isOrgAdmin).toBe(false);
    expect(resp.body.user.canCreatePublications).toBe(false);
  });

  it("reflects a membership change on the next request", async () => {
    const org = await seedOrg();
    const { client, userIds } = await loggedInUser("latecreator");

    const before = await getAdminUiSession(client);
    expect(before.body.user.canCreatePublications).toBe(false);

    await seedOrgMember(org.orgIdInt, userIds, "ADMIN");

    const after = await getAdminUiSession(client);
    expect(after.body.user.isOrgAdmin).toBe(true);
    expect(after.body.user.canCreatePublications).toBe(true);
  });
});
