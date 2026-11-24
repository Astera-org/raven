import { describe, expect, it } from "vitest";
import {
  TestApiClient,
  authClientWithId,
  makeUser,
  registerUser,
  registerUserWithId,
  seedPublication,
} from "./helpers.js";

describe("/api/users", () => {
  it("returns the public profile for a user literally named admin", async () => {
    // GET /api/users/admin must resolve via the :username lookup.
    await registerUser(new TestApiClient(), makeUser("admin"));
    const resp = await new TestApiClient().get("/api/users/admin");
    expect(resp.status).toBe(200);
    expect(resp.body.username).toBe("admin");
  });

  it("lists users", async () => {
    const client = new TestApiClient();
    let resp = await client.get("/api/users");
    expect(resp.status).toBe(200);
    expect(resp.body.items).toBeDefined();
    expect(resp.body.pagination.total).toBe(0);

    await registerUser(client);
    resp = await client.get("/api/users");
    expect(resp.status).toBe(200);
    expect(resp.body.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it("gets users by id or username", async () => {
    const { client, user, userId } = await registerUserWithId();

    const byId = await client.get(`/api/users/${userId}`);
    expect(byId.status).toBe(200);
    expect(byId.body.username).toBe(user.username);

    expect((await client.get(`/api/users/${user.username}`)).status).toBe(200);
    expect((await client.get("/api/users/999999")).status).toBe(404);
  });

  it("updates the authenticated user's profile", async () => {
    const { client, userId } = await authClientWithId();
    const resp = await client
      .put(`/api/users/${userId}`)
      .send({ first_name: "Updated", last_name: "Name" });
    expect(resp.status).toBe(200);
  });

  it("rejects unauthenticated profile updates", async () => {
    const { userId } = await registerUserWithId();
    expect(
      (
        await new TestApiClient()
          .put(`/api/users/${userId}`)
          .send({ first_name: "Hacked" })
      ).status
    ).toBe(401);
  });

  it("lists user publications", async () => {
    const { client, userId } = await authClientWithId();
    await seedPublication({
      slug: "user-published-pub",
      ownerId: userId,
      state: "PUBLISHED",
      title: "My Article",
    });
    expect((await client.get(`/api/users/${userId}/publications`)).status).toBe(
      200
    );
  });
});
