import { canRejectRequest, createV1Route } from "#v1/lib/create-v1-route.js";
import { ulidSchema } from "#v1/lib/schemas/ulid-schema.js";
import { z } from "@hono/zod-openapi";
import { describe, expect, expectTypeOf, it } from "vitest";

const ok = { 200: { description: "OK" } };

describe("canRejectRequest", () => {
  it("is false without request input", () => {
    expect(canRejectRequest(undefined)).toBe(false);
    expect(canRejectRequest({})).toBe(false);
  });

  it("is false for check-free string path params", () => {
    expect(
      canRejectRequest({
        params: z.object({
          slug: z.string().openapi({ description: "Slug" }),
          ext: z.string().optional(),
        }),
      })
    ).toBe(false);
  });

  it("is true for path params with checks, transforms, or non-strings", () => {
    for (const field of [
      ulidSchema(),
      z.string().regex(/^v\d+$/),
      z.string().min(1),
      z.enum(["a", "b"]),
      z.coerce.number(),
    ]) {
      expect(canRejectRequest({ params: z.object({ field }) })).toBe(true);
    }
  });

  it("is true for strict objects, which reject unknown keys", () => {
    expect(
      canRejectRequest({ params: z.strictObject({ id: z.string() }) })
    ).toBe(true);
  });

  it("only accepts optional check-free strings in query, headers, cookies", () => {
    const optional = z.object({ q: z.string().optional() });
    const required = z.object({ q: z.string() });

    expect(canRejectRequest({ query: optional })).toBe(false);
    expect(canRejectRequest({ headers: optional })).toBe(false);
    expect(canRejectRequest({ cookies: optional })).toBe(false);
    expect(canRejectRequest({ query: required })).toBe(true);
    expect(canRejectRequest({ headers: required })).toBe(true);
    expect(canRejectRequest({ cookies: required })).toBe(true);
    expect(
      canRejectRequest({
        query: z.object({ page: z.coerce.number().int().optional() }),
      })
    ).toBe(true);
  });

  it("is true for any body, required or not", () => {
    const content = {
      "application/json": { schema: z.object({ note: z.string().optional() }) },
    };
    expect(canRejectRequest({ body: { required: true, content } })).toBe(true);
    expect(canRejectRequest({ body: { required: false, content } })).toBe(true);
  });
});

describe("createV1Route", () => {
  it("adds the 422 response when the request can be rejected", () => {
    const route = createV1Route({
      method: "get",
      path: "/{id}",
      request: { params: z.object({ id: ulidSchema() }) },
      responses: ok,
    });

    expect(Object.keys(route.responses)).toEqual(["200", "422"]);
    expectTypeOf(route.responses).toHaveProperty(422);
  });

  it("leaves responses alone when the request can't be rejected", () => {
    const route = createV1Route({
      method: "get",
      path: "/{slug}",
      request: { params: z.object({ slug: z.string() }) },
      responses: ok,
    });
    const noRequest = createV1Route({
      method: "get",
      path: "/",
      responses: ok,
    });

    expect(Object.keys(route.responses)).toEqual(["200"]);
    expect(Object.keys(noRequest.responses)).toEqual(["200"]);
    // Types can't see zod checks, so any request input allows a 422.
    expectTypeOf(route.responses).toHaveProperty(422);
    expectTypeOf(noRequest.responses).not.toHaveProperty(422);
  });

  it("keeps a route's own 422 over the default", () => {
    const route = createV1Route({
      method: "post",
      path: "/",
      request: {
        body: {
          content: { "application/json": { schema: z.object({}) } },
        },
      },
      responses: { ...ok, 422: { description: "Custom" } },
    });

    expect(route.responses[422].description).toBe("Custom");
  });

  it("records stability as x-stability-level, alpha by default", () => {
    const stable = createV1Route({
      method: "get",
      path: "/",
      stability: "stable",
      responses: ok,
    });
    const alpha = createV1Route({
      method: "get",
      path: "/",
      responses: ok,
    });

    expect(stable["x-stability-level"]).toBe("stable");
    expect(stable).not.toHaveProperty("stability");
    expect(alpha["x-stability-level"]).toBe("alpha");
  });

  it("doesn't make an alias of a stable route stable", () => {
    const stable = createV1Route({
      method: "get",
      path: "/",
      stability: "stable",
      responses: ok,
    });
    const alias = createV1Route({ ...stable, path: "/alias" });

    expect(alias["x-stability-level"]).toBe("alpha");
  });
});
