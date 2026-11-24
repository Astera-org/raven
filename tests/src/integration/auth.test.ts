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
  seedOrg,
  seedOrgMember,
} from "./helpers.js";

describe("/api/auth/register", () => {
  it("is gone", async () => {
    const resp = await new TestApiClient()
      .post("/api/auth/register")
      .send(DEFAULT_USER);
    expect(resp.status).toBe(410);
    const rows = await query(
      `SELECT 1 FROM users WHERE username = '${DEFAULT_USER.username}'`
    );
    expect(rows).toHaveLength(0);
  });
});

describe("/api/auth/login", () => {
  it("rejects a user whose email is not verified", async () => {
    const client = new TestApiClient();
    const user = await registerUser(client, makeUser("unverified"));
    await execute(
      `UPDATE users SET email_verified = FALSE WHERE username = '${user.username}'`
    );

    const resp = await client
      .post("/api/auth/login")
      .send({ username: user.username, password: user.password });
    expect(resp.status).toBe(403);
    expect(resp.body.access_token).toBeUndefined();
  });

  it("logs in with username or email", async () => {
    const client = new TestApiClient();
    const user = await registerUser(client);

    const byUsername = await client
      .post("/api/auth/login")
      .send({ username: user.username, password: user.password });
    expect(byUsername.status).toBe(200);
    expect(byUsername.body.access_token).toBeDefined();
    expect(byUsername.body.refresh_token).toBeDefined();
    expect(byUsername.body.user.username).toBe(user.username);

    const byEmail = await client
      .post("/api/auth/login")
      .send({ username: user.email, password: user.password });
    expect(byEmail.status).toBe(200);
  });

  it("rejects bad credentials", async () => {
    const client = new TestApiClient();
    const user = await registerUser(client, makeUser("loginuser"));
    expect(
      (
        await client
          .post("/api/auth/login")
          .send({ username: user.username, password: "wrongpass" })
      ).status
    ).toBe(401);
    expect(
      (
        await client
          .post("/api/auth/login")
          .send({ username: "noone", password: "whatever" })
      ).status
    ).toBe(401);
    expect(
      (
        await client
          .post("/api/auth/login")
          .send({ username: "", password: "" })
      ).status
    ).toBe(400);
  });
});

describe("/api/auth/logout", () => {
  it("logs out", async () => {
    const resp = await new TestApiClient().post("/api/auth/logout");
    expect(resp.status).toBe(200);
    expect(resp.body.msg).toBe("logged out");
  });
});

describe("/api/auth/refresh", () => {
  it("refreshes an access token", async () => {
    const client = new TestApiClient();
    const user = await registerUser(client);
    const { refresh_token } = await client.login(user.username, user.password);
    client.setToken(refresh_token);
    const resp = await client.post("/api/auth/refresh");
    expect(resp.status).toBe(200);
    expect(resp.body.access_token).toBeDefined();
  });

  it("rejects missing tokens", async () => {
    expect((await new TestApiClient().post("/api/auth/refresh")).status).toBe(
      401
    );
  });
});

describe("/api/auth/change_password", () => {
  it("changes the authenticated user's password", async () => {
    const client = new TestApiClient();
    const user = await registerUser(client, makeUser("changepass"));
    await client.login(user.username, user.password);

    const resp = await client.post("/api/auth/change_password").send({
      current_password: user.password,
      new_password: "new-password-123",
    });
    expect(resp.status).toBe(200);
    expect(resp.body.msg).toBe("Password updated successfully");

    const oldPasswordLogin = await new TestApiClient()
      .post("/api/auth/login")
      .send({ username: user.username, password: user.password });
    expect(oldPasswordLogin.status).toBe(401);

    const newPasswordLogin = await new TestApiClient()
      .post("/api/auth/login")
      .send({ username: user.username, password: "new-password-123" });
    expect(newPasswordLogin.status).toBe(200);
  });

  it("rejects an invalid current password", async () => {
    const client = new TestApiClient();
    const user = await registerUser(client, makeUser("badcurrent"));
    await client.login(user.username, user.password);

    const resp = await client.post("/api/auth/change_password").send({
      current_password: "wrong-password",
      new_password: "new-password-123",
    });
    expect(resp.status).toBe(401);
    expect(resp.body.error).toBe("Invalid current password");
  });

  it("validates the request body", async () => {
    const client = new TestApiClient();
    const user = await registerUser(client, makeUser("badchangepayload"));
    await client.login(user.username, user.password);

    expect(
      (await client.post("/api/auth/change_password").send({})).status
    ).toBe(400);
    expect(
      (
        await client.post("/api/auth/change_password").send({
          current_password: user.password,
          new_password: "short",
        })
      ).status
    ).toBe(400);
  });

  it("rejects unauthenticated requests", async () => {
    const resp = await new TestApiClient()
      .post("/api/auth/change_password")
      .send({
        current_password: "password123",
        new_password: "new-password-123",
      });
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
    expect((await new TestApiClient().get("/api/auth/me")).status).toBe(401);
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
