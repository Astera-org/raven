import { describe, expect, it } from "vitest";
import { authClientWithId } from "./helpers.js";

// Matches EXTRA_ALLOWED_ORIGIN_PATTERN in backend-ts/tests/raven.test.toml,
// like a Vercel preview that proxies /api through its own origin.
const PREVIEW_ORIGIN = "https://raven-abc123-preview.example.com";

const PROFILE = {
  first_name: "Test",
  last_name: "User",
  email: "test@example.com",
  profile: "Saved from a preview",
};

describe("writes with an Origin header", () => {
  it("are allowed from a preview matching EXTRA_ALLOWED_ORIGIN_PATTERN", async () => {
    const { client, userId } = await authClientWithId();
    const resp = await client
      .put(`/api/users/${userId}`)
      .set("Origin", PREVIEW_ORIGIN)
      .send(PROFILE);
    expect(resp.status).toBe(200);
  });

  it("are refused from any other origin", async () => {
    const { client, userId } = await authClientWithId();
    const resp = await client
      .put(`/api/users/${userId}`)
      .set("Origin", "https://attacker.example")
      .send(PROFILE);
    expect(resp.status).toBe(403);
    expect(resp.body.errors).toHaveProperty("auth");
  });
});
