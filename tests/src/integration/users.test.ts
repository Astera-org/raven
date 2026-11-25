import { describe, expect, it } from "vitest";
import {
  TestApiClient,
  authClientWithId,
  makeUser,
  registerUser,
  registerUserWithId,
  seedPublication,
  seedSiteAdmin,
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

  describe("email privacy", () => {
    // Emails are private: only the user themselves and site admins may see
    // one. Every list and lookup anyone else can call must leave them out.
    const bob = makeUser("bob");

    async function signedInAs(username: string) {
      const client = new TestApiClient();
      await client.login(username, "password123");
      return client;
    }

    it("never includes emails when listing users", async () => {
      await registerUser(new TestApiClient(), bob);
      await registerUser(new TestApiClient(), makeUser("alice"));

      for (const client of [new TestApiClient(), await signedInAs("alice")]) {
        const resp = await client.get("/api/users");
        expect(resp.status).toBe(200);
        expect(resp.body.items).toHaveLength(2);
        for (const item of resp.body.items) {
          expect(item).not.toHaveProperty("email");
        }
        expect(resp.text).not.toContain("@example.com");
      }
    });

    it("hides a user's email from anonymous callers and other users", async () => {
      const { userId } = await registerUserWithId(bob);
      await registerUser(new TestApiClient(), makeUser("alice"));

      for (const client of [new TestApiClient(), await signedInAs("alice")]) {
        for (const path of [`/api/users/${userId}`, "/api/users/bob"]) {
          const resp = await client.get(path);
          expect(resp.status).toBe(200);
          expect(resp.body.username).toBe("bob");
          expect(resp.body).not.toHaveProperty("email");
        }
      }
    });

    it("shows a user their own email", async () => {
      const { userId } = await registerUserWithId(bob);
      const client = await signedInAs("bob");

      for (const path of [`/api/users/${userId}`, "/api/users/bob"]) {
        const resp = await client.get(path);
        expect(resp.status).toBe(200);
        expect(resp.body.email).toBe(bob.email);
      }
    });

    it("shows a site admin any user's email", async () => {
      const { userId } = await registerUserWithId(bob);
      const admin = await registerUserWithId(makeUser("siteadmin"));
      await seedSiteAdmin(admin.userId);
      const client = await signedInAs("siteadmin");

      const resp = await client.get(`/api/users/${userId}`);
      expect(resp.status).toBe(200);
      expect(resp.body.email).toBe(bob.email);
    });
  });

  describe("GET /api/users/match", () => {
    // Matching by email (exact or prefix) is for signed-in callers only, so
    // anonymous callers can't check which addresses have accounts.
    const usernamesFor = async (client: TestApiClient, id: string) => {
      const resp = await client.get(
        `/api/users/match?id=${encodeURIComponent(id)}`
      );
      expect(resp.status).toBe(200);
      expect(resp.text).not.toContain("@example.com");
      return (resp.body as { username: string }[]).map((u) => u.username);
    };

    it("does not match by email for anonymous callers", async () => {
      await registerUser(new TestApiClient(), makeUser("bob"));
      const client = new TestApiClient();

      expect(await usernamesFor(client, "bob@example.com")).toEqual([]);
      expect(await usernamesFor(client, "bob@")).toEqual([]);
      // Other kinds of identifier still work.
      expect(await usernamesFor(client, "bob")).toEqual(["bob"]);
    });

    it("matches by exact email or email prefix for signed-in callers", async () => {
      await registerUser(new TestApiClient(), makeUser("bob"));
      const { client } = await authClientWithId();

      expect(await usernamesFor(client, "bob@example.com")).toEqual(["bob"]);
      expect(await usernamesFor(client, "bob@")).toEqual(["bob"]);
      expect(await usernamesFor(client, "nobody@example.com")).toEqual([]);
    });

    it("matches no one for an empty identifier", async () => {
      await registerUser(new TestApiClient(), makeUser("bob"));
      expect(await usernamesFor(new TestApiClient(), "")).toEqual([]);
    });
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
