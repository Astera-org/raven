import { describe, expect, it } from "vitest";
import { api } from "./helpers.js";

describe("v1 error envelope outside createV1Route", () => {
  it("returns an application_error for a missing file", async () => {
    const resp = await api().get("/api/v1/files/does-not-exist.png");
    expect(resp.status).toBe(404);
    expect(resp.body).toEqual({
      type: "application_error",
      errors: { file: { message: "File not found" } },
    });
  });

  it("returns an application_error for an unknown v1 path", async () => {
    const resp = await api().get("/api/v1/no-such-resource");
    expect(resp.status).toBe(404);
    expect(resp.body).toEqual({
      type: "application_error",
      errors: { root: { message: "Not found" } },
    });
  });

  it("leaves the v0 file 404 shape unchanged", async () => {
    const resp = await api().get("/api/v0/files/does-not-exist.png");
    expect(resp.status).toBe(404);
    expect(resp.body).toEqual({ errors: { file: ["Not found"] } });
  });

  it("leaves non-v1 unknown paths as plain-text 404s", async () => {
    const resp = await api().get("/api/v0/no-such-resource");
    expect(resp.status).toBe(404);
    expect(resp.text).toBe("404 Not Found");
  });
});
