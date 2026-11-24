import { describe, expect, it } from "vitest";
import {
  TestApiClient,
  markEmailVerified,
  registerUserWithId,
  seedOrg,
  seedSiteAdmin,
} from "./helpers.js";

// Smoke tests locking in that /api/v0/* is a byte-for-byte alias of the
// unprefixed /api/* routes (see backend-ts/src/app.ts). Not a full duplicate
// of every existing integration test -- just enough representative endpoints
// (health, an unauthenticated GET, an authed POST) to catch the mount
// breaking, not to re-verify route behavior already covered elsewhere.
describe("/api/v0 alias", () => {
  it("responds to /api/v0/health the same as /api/health", async () => {
    const client = new TestApiClient();
    const versioned = await client.get("/api/v0/health");
    expect(versioned.status).toBe(200);
    expect(versioned.body).toEqual({ status: "ok" });

    const unversioned = await client.get("/api/health");
    expect(unversioned.body).toEqual(versioned.body);
  });

  it("serves an unauthenticated GET route under /api/v0", async () => {
    await seedOrg("V0 Alias Org", "v0-alias-org");

    const resp = await new TestApiClient().get("/api/v0/orgs/v0-alias-org");
    expect(resp.status).toBe(200);
    expect(resp.body.slug).toBe("v0-alias-org");
  });

  it("serves an authenticated POST route under /api/v0", async () => {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);

    const resp = await client.post("/api/v0/orgs").send({
      name: "New V0 Org",
    });
    expect(resp.status).toBe(201);
    expect(resp.body.slug).toBe("new-v0-org");
  });

  // Regression test for the /api/v0/auth2 mount since better-auth's router
  // dispatches by matching its fixed basePath ("/api/auth2")
  it("serves the auth2 router under /api/v0/auth2", async () => {
    const client = new TestApiClient();
    const resp = await client.post("/api/v0/auth2/sign-up/email").send({
      name: "V0 Auth User",
      email: "v0auth@example.com",
      password: "password123",
      username: "v0authuser",
      firstName: "V0",
      lastName: "Auth",
    });
    expect(resp.status).toBe(200);
    expect(resp.body.user.username).toBe("v0authuser");

    await markEmailVerified("v0auth@example.com");
    const signIn = await client
      .post("/api/v0/auth2/sign-in/email")
      .send({ email: "v0auth@example.com", password: "password123" });
    expect(signIn.status).toBe(200);

    client.setToken(signIn.body.token);
    const session = await client.get("/api/v0/auth2/get-session");
    expect(session.status).toBe(200);
    expect(session.body.user.username).toBe("v0authuser");
  });

  // Regression test for the files router under /api/v0/files: it used to
  // strip a hardcoded "/api/files/" prefix from the full request path, which
  // doesn't match a request mounted at "/api/v0/files" (see files.ts).
  it("serves an uploaded file under /api/v0/files", async () => {
    const { client, user, userId } = await registerUserWithId();
    await client.login(user.username, user.password);

    const uploadResp = await client
      .post(`/api/users/${userId}/avatar`)
      .attach("avatar", Buffer.from("fake-png-bytes"), "avatar.png");
    expect(uploadResp.status).toBe(200);
    const avatarUrl = uploadResp.body.avatar_url as string;
    const v0Url = avatarUrl.replace("/api/files/", "/api/v0/files/");
    expect(v0Url).not.toBe(avatarUrl);

    const versioned = await client.get(v0Url);
    expect(versioned.status).toBe(200);

    const unversioned = await client.get(avatarUrl);
    expect(unversioned.status).toBe(200);
    expect(versioned.body).toEqual(unversioned.body);
  });
});
