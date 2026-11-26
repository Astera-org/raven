import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_USER,
  TestApiClient,
  authClient,
  authClientWithId,
  execute,
  makeUser,
  query,
  registerUser,
  registerUserWithId,
  seedOrg,
  seedOrgMember,
} from "./helpers.js";

const JWT_SECRET_KEY = "test-secret-key-do-not-use-in-production";

/** A token the retired `/api/auth/login` would have issued for `userId`. */
function legacyAccessToken(userId: number): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const unsigned = `${encode({ alg: "HS256" })}.${encode({ sub: String(userId), exp })}`;
  const signature = createHmac("sha256", JWT_SECRET_KEY)
    .update(unsigned)
    .digest("base64url");
  return `${unsigned}.${signature}`;
}

describe("retired legacy JWT endpoints", () => {
  it("are gone", async () => {
    const user = await registerUser(undefined, makeUser("legacyuser"));
    const bodies: Record<string, object> = {
      "/api/auth/register": DEFAULT_USER,
      "/api/auth/login": { username: user.username, password: user.password },
      "/api/auth/refresh": {},
      "/api/auth/change_password": {
        current_password: user.password,
        new_password: "new-password-123",
      },
      "/api/auth/logout": {},
    };
    for (const [path, body] of Object.entries(bodies)) {
      const resp = await new TestApiClient().post(path).send(body);
      expect(resp.status, path).toBe(410);
      expect(resp.body.access_token, path).toBeUndefined();

      // Every endpoint a migration hint names must exist.
      const hinted = resp.body.error.match(/\/api\/auth2\/[\w/-]+/g) ?? [];
      expect(hinted.length, path).toBeGreaterThan(0);
      for (const endpoint of hinted) {
        const hintResp = await new TestApiClient().post(endpoint).send({});
        expect(hintResp.status, `${path} -> ${endpoint}`).not.toBe(404);
      }
    }
    const rows = await query(
      `SELECT 1 FROM users WHERE username = '${DEFAULT_USER.username}'`
    );
    expect(rows).toHaveLength(0);
  });

  it("no longer accepts a legacy access token", async () => {
    const { userId } = await registerUserWithId();
    const client = new TestApiClient();
    client.setToken(legacyAccessToken(userId));
    const resp = await client.get("/api/auth/me");
    expect(resp.status).toBe(401);
  });
});

describe("/api/auth/me", () => {
  it("returns the authenticated user", async () => {
    const { client } = await authClient();
    const resp = await client.get("/api/auth/me");
    expect(resp.status).toBe(200);
    expect(resp.body.user.username).toBe(DEFAULT_USER.username);
    expect(resp.body.user.email).toBe(DEFAULT_USER.email);
  });

  it("rejects unauthenticated requests", async () => {
    const resp = await new TestApiClient().get("/api/auth/me");
    expect(resp.status).toBe(401);
    expect(resp.body).toEqual({
      msg: "No session. Sign in via /api/auth2/sign-in/email or /api/auth2/sign-in/username.",
    });
  });

  it("sets is_org_admin when the user has an active ADMIN membership", async () => {
    const { client, userIds } = await authClientWithId();
    const { orgIdInt: orgId } = await seedOrg();
    await seedOrgMember(orgId, userIds, "ADMIN");

    const resp = await client.get("/api/auth/me");
    expect(resp.status).toBe(200);
    expect(resp.body.user.is_org_admin).toBe(true);
  });

  it("omits is_org_admin when the user's membership is not ADMIN", async () => {
    const { client, userIds } = await authClientWithId();
    const { orgIdInt: orgId } = await seedOrg();
    await seedOrgMember(orgId, userIds, "");

    const resp = await client.get("/api/auth/me");
    expect(resp.status).toBe(200);
    expect(resp.body.user.is_org_admin).toBeUndefined();
  });

  it("omits is_org_admin when the ADMIN membership has ended", async () => {
    const { client, userIds } = await authClientWithId();
    const { orgIdInt: orgId } = await seedOrg();
    await seedOrgMember(orgId, userIds, "ADMIN");
    await execute(
      `UPDATE org_user_map SET end_at = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE org_id_int = ${orgId} AND user_id_int = ${userIds.id_int}`
    );

    const resp = await client.get("/api/auth/me");
    expect(resp.status).toBe(200);
    expect(resp.body.user.is_org_admin).toBeUndefined();
  });
});
