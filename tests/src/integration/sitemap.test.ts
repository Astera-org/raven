import { describe, expect, it } from "vitest";
import {
  TestApiClient,
  registerUserWithId,
  seedOrg,
  seedPublication,
} from "./helpers.js";

describe("/api/sitemap", () => {
  it("redirects the /api/sitemap/ to /api/sitemap", async () => {
    const resp = await new TestApiClient().get("/api/sitemap/");
    expect(resp.status).toBe(308);
    expect(resp.header["location"]?.split("/").slice(-2).join("/")).toBe(
      "api/sitemap"
    );
  });

  it("returns the sitemap index as XML", async () => {
    const resp = await new TestApiClient().get("/api/sitemap");
    expect(resp.status).toBe(200);
    expect(resp.header["content-type"]?.toLowerCase()).toContain("xml");
    expect(
      resp.text.includes("<?xml") || resp.text.includes("<sitemapindex")
    ).toBe(true);
  });

  it("returns publication, organization, and user sitemaps", async () => {
    const { client, userId } = await registerUserWithId();
    await seedPublication({
      slug: "sitemap-new-pub",
      ownerId: userId,
      state: "PUBLISHED",
    });
    await seedOrg("Sitemap Org", "sitemap-org");

    const pubs = await client.get("/api/sitemap/publications");
    expect(pubs.status).toBe(200);
    expect(pubs.header["content-type"]?.toLowerCase()).toContain("xml");
    expect(pubs.text).toContain("sitemap-new-pub");

    const orgs = await client.get("/api/sitemap/organizations");
    expect(orgs.status).toBe(200);
    expect(orgs.header["content-type"]?.toLowerCase()).toContain("xml");
    expect(orgs.text).toContain("sitemap-org");

    const users = await client.get("/api/sitemap/users");
    expect(users.status).toBe(200);
    expect(users.header["content-type"]?.toLowerCase()).toContain("xml");
  });
});
