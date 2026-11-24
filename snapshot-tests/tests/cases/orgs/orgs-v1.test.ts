import { type TestCase } from "@harness/types.ts";
import { afterAll, beforeAll, describe } from "vitest";
import {
  bootstrapWorker,
  defineCase,
  teardown,
  type WorkerHarness,
} from "../../harness/runner.ts";
import { TINY_PNG } from "../../harness/test-assets.ts";

// v1's better-auth-only orgs resource (backend-ts/src/api-v1/routes/orgs).
// Unlike the v0 suite in orgs.test.ts, there is no JWT variant of each case
// -- v1 routes only read the better-auth session, so a JWT bearer token
// leaves `c.get("user")` null and the route behaves as unauthenticated.
describe("orgs v1", () => {
  const workerHarnessRef: { harness: WorkerHarness } = {
    harness: null as unknown as WorkerHarness,
  };
  beforeAll(async () => {
    console.log("Booting test harness...");
    const workerHarness = await bootstrapWorker();
    workerHarnessRef.harness = workerHarness;
  });

  afterAll(async () => {
    console.log("Tearing down test harness...");
    await teardown(workerHarnessRef.harness);
  });

  const defineOrgsV1Case = (testCase: TestCase) =>
    defineCase("orgs-v1", testCase, workerHarnessRef);

  // ---- read paths --------------------------------------------------------

  defineOrgsV1Case({
    name: "GET orgs unauthenticated lists only listed orgs",
    fixtures: ["org-arcadia", "org-unlisted"],
    request: { method: "GET", path: "/v1/orgs" },
    assert: { status: 200 },
  });

  defineOrgsV1Case({
    name: "GET orgs as non-admin excludes unlisted orgs",
    fixtures: ["users-multi", "org-arcadia", "org-unlisted"],
    auth: { kind: "better-auth", as: "alice" },
    request: { method: "GET", path: "/v1/orgs" },
    assert: { status: 200 },
  });

  defineOrgsV1Case({
    name: "GET orgs as site admin includes unlisted orgs",
    fixtures: ["users-multi", "org-arcadia", "org-unlisted"],
    auth: { kind: "better-auth", as: "charlie" },
    request: { method: "GET", path: "/v1/orgs" },
    assert: { status: 200 },
  });

  defineOrgsV1Case({
    name: "GET orgs second page as site admin",
    fixtures: ["users-multi", "org-arcadia", "org-unlisted"],
    auth: { kind: "better-auth", as: "charlie" },
    request: {
      method: "GET",
      path: "/v1/orgs",
      query: { page: 2, perPage: 1 },
    },
    assert: { status: 200 },
  });

  defineOrgsV1Case({
    name: "GET org by slug returns org",
    fixtures: ["org-arcadia"],
    request: { method: "GET", path: "/v1/orgs/arcadia-science" },
    assert: { status: 200 },
  });

  defineOrgsV1Case({
    name: "GET org by id returns org",
    fixtures: ["org-arcadia"],
    request: {
      method: "GET",
      path: "/v1/orgs/00000000020000000000000001",
    },
    assert: { status: 200 },
  });

  defineOrgsV1Case({
    name: "GET org by unknown slug returns 404",
    fixtures: ["empty"],
    request: { method: "GET", path: "/v1/orgs/no-such-org" },
    assert: { status: 404 },
  });

  defineOrgsV1Case({
    name: "GET org members returns empty list rather than 404",
    fixtures: ["org-arcadia"],
    request: { method: "GET", path: "/v1/orgs/arcadia-science/members" },
    assert: { status: 200 },
  });

  defineOrgsV1Case({
    name: "GET org members with two members",
    fixtures: ["users-multi", "org-arcadia", "org-with-members"],
    request: { method: "GET", path: "/v1/orgs/arcadia-science/members" },
    assert: { status: 200 },
  });

  defineOrgsV1Case({
    name: "GET org members as org admin returns full records",
    fixtures: ["users-multi", "org-arcadia", "org-with-members"],
    auth: { kind: "better-auth", as: "alice" },
    request: { method: "GET", path: "/v1/orgs/arcadia-science/members" },
    assert: { status: 200 },
  });

  defineOrgsV1Case({
    name: "GET org members for unknown org returns 404",
    fixtures: ["empty"],
    request: { method: "GET", path: "/v1/orgs/no-such-org/members" },
    assert: { status: 404 },
  });

  defineOrgsV1Case({
    name: "GET org publications on empty DB",
    fixtures: ["org-arcadia"],
    request: {
      method: "GET",
      path: "/v1/orgs/arcadia-science/publications",
      query: { page: 1, perPage: 10 },
    },
    assert: { status: 200 },
  });

  defineOrgsV1Case({
    name: "GET org publications for unknown org returns 404",
    fixtures: ["empty"],
    request: {
      method: "GET",
      path: "/v1/orgs/no-such-org/publications",
      query: { page: 1, perPage: 10 },
    },
    assert: { status: 404 },
  });

  // ---- create -------------------------------------------------------------

  defineOrgsV1Case({
    name: "POST create org as site admin",
    fixtures: ["users-multi"],
    auth: { kind: "better-auth", as: "charlie" },
    request: { method: "POST", path: "/v1/orgs", body: { name: "New Org" } },
    maskFields: ["id", "createdAt", "updatedAt"],
    assert: { status: 201 },
  });

  defineOrgsV1Case({
    name: "POST create org unauthenticated returns 401",
    fixtures: ["empty"],
    request: { method: "POST", path: "/v1/orgs", body: { name: "Anon" } },
    assert: { status: 401 },
  });

  defineOrgsV1Case({
    name: "POST create org as non-admin returns 403",
    fixtures: ["users-multi"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "POST",
      path: "/v1/orgs",
      body: { name: "Sneaky Org" },
    },
    assert: { status: 403 },
  });

  // ---- update --------------------------------------------------------------

  defineOrgsV1Case({
    name: "PATCH org as admin member",
    fixtures: ["users-multi", "org-arcadia", "org-with-members"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PATCH",
      path: "/v1/orgs/arcadia-science",
      body: { name: "Arcadia Science (renamed)" },
    },
    maskFields: ["updatedAt"],
    assert: { status: 200 },
  });

  defineOrgsV1Case({
    name: "PATCH org leaves omitted fields untouched",
    fixtures: ["users-multi", "org-arcadia", "org-with-members"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PATCH",
      path: "/v1/orgs/arcadia-science",
      body: { avatar: null },
    },
    maskFields: ["updatedAt"],
    assert: { status: 200 },
  });

  defineOrgsV1Case({
    name: "PATCH org unauthenticated returns 401",
    fixtures: ["users-multi", "org-arcadia", "org-with-members"],
    request: {
      method: "PATCH",
      path: "/v1/orgs/arcadia-science",
      body: { name: "Anon" },
    },
    assert: { status: 401 },
  });

  defineOrgsV1Case({
    name: "PATCH org as non-admin member returns 403",
    fixtures: ["users-multi", "org-arcadia", "org-with-members"],
    auth: { kind: "better-auth", as: "bob" },
    request: {
      method: "PATCH",
      path: "/v1/orgs/arcadia-science",
      body: { name: "Hijacked" },
    },
    assert: { status: 403 },
  });

  defineOrgsV1Case({
    name: "PATCH unknown org returns 404",
    fixtures: ["users-multi"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PATCH",
      path: "/v1/orgs/no-such-org",
      body: { name: "X" },
    },
    assert: { status: 404 },
  });

  // ---- delete ---------------------------------------------------------------

  defineOrgsV1Case({
    name: "DELETE org as admin",
    fixtures: ["users-multi", "org-arcadia", "org-with-members"],
    auth: { kind: "better-auth", as: "alice" },
    request: { method: "DELETE", path: "/v1/orgs/arcadia-science" },
    assert: { status: 204 },
  });

  defineOrgsV1Case({
    name: "DELETE org as non-admin returns 403",
    fixtures: ["users-multi", "org-arcadia", "org-with-members"],
    auth: { kind: "better-auth", as: "bob" },
    request: { method: "DELETE", path: "/v1/orgs/arcadia-science" },
    assert: { status: 403 },
  });

  defineOrgsV1Case({
    name: "DELETE org unauthenticated returns 401",
    fixtures: ["org-arcadia"],
    request: { method: "DELETE", path: "/v1/orgs/arcadia-science" },
    assert: { status: 401 },
  });

  // ---- members (admin) --------------------------------------------------------------

  defineOrgsV1Case({
    name: "POST members adds a new member",
    fixtures: ["users-multi", "org-arcadia", "org-with-members"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "POST",
      path: "/v1/admin/orgs/arcadia-science/members",
      body: { username: "charlie" },
    },
    assert: { status: 201 },
  });

  defineOrgsV1Case({
    name: "POST members with duplicate user returns 409",
    fixtures: ["users-multi", "org-arcadia", "org-with-members"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "POST",
      path: "/v1/admin/orgs/arcadia-science/members",
      body: { username: "bob" },
    },
    assert: { status: 409 },
  });

  defineOrgsV1Case({
    name: "POST members with unknown username returns 404",
    fixtures: ["users-multi", "org-arcadia", "org-with-members"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "POST",
      path: "/v1/admin/orgs/arcadia-science/members",
      body: { username: "no-such-user" },
    },
    assert: { status: 404 },
  });

  defineOrgsV1Case({
    name: "POST members as non-admin returns 403",
    fixtures: ["users-multi", "org-arcadia", "org-with-members"],
    auth: { kind: "better-auth", as: "bob" },
    request: {
      method: "POST",
      path: "/v1/admin/orgs/arcadia-science/members",
      body: { username: "charlie" },
    },
    assert: { status: 403 },
  });

  defineOrgsV1Case({
    name: "DELETE member removes membership",
    fixtures: ["users-multi", "org-arcadia", "org-with-members"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "DELETE",
      path: "/v1/admin/orgs/arcadia-science/members/00000000010000000000000002",
    },
    assert: { status: 204 },
  });

  defineOrgsV1Case({
    name: "DELETE member not found returns 404",
    fixtures: ["users-multi", "org-arcadia", "org-with-members"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "DELETE",
      path: "/v1/admin/orgs/arcadia-science/members/00000000010000000000000003",
    },
    assert: { status: 404 },
  });

  defineOrgsV1Case({
    name: "DELETE member as non-admin returns 403",
    fixtures: ["users-multi", "org-arcadia", "org-with-members"],
    auth: { kind: "better-auth", as: "bob" },
    request: {
      method: "DELETE",
      path: "/v1/admin/orgs/arcadia-science/members/00000000010000000000000001",
    },
    assert: { status: 403 },
  });

  // ---- avatar -----------------------------------------------------------

  defineOrgsV1Case({
    name: "PUT avatar replaces org avatar",
    fixtures: ["users-multi", "org-arcadia", "org-with-members"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PUT",
      path: "/v1/orgs/arcadia-science/avatar",
      multipart: {
        avatar: {
          filename: "avatar.png",
          data: TINY_PNG,
          contentType: "image/png",
        },
      },
    },
    maskFields: ["avatarUrl"],
    assert: {
      status: 200,
      bodyContains: [
        /"avatarUrl":\s*"\/api\/v1\/files\/avatars\/orgs\/org_00000000020000000000000001_\d+\.png"/m,
      ],
    },
  });

  defineOrgsV1Case({
    name: "PUT avatar with unsupported file type returns 400",
    fixtures: ["users-multi", "org-arcadia", "org-with-members"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PUT",
      path: "/v1/orgs/arcadia-science/avatar",
      multipart: {
        avatar: {
          filename: "avatar.txt",
          data: Buffer.from("not an image"),
          contentType: "text/plain",
        },
      },
    },
    assert: { status: 400 },
  });

  defineOrgsV1Case({
    name: "PUT avatar with no file returns 400",
    fixtures: ["users-multi", "org-arcadia", "org-with-members"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PUT",
      path: "/v1/orgs/arcadia-science/avatar",
      multipart: {},
    },
    assert: { status: 400 },
  });

  defineOrgsV1Case({
    name: "PUT avatar as non-admin returns 403",
    fixtures: ["users-multi", "org-arcadia", "org-with-members"],
    auth: { kind: "better-auth", as: "bob" },
    request: {
      method: "PUT",
      path: "/v1/orgs/arcadia-science/avatar",
      multipart: {
        avatar: {
          filename: "avatar.png",
          data: TINY_PNG,
          contentType: "image/png",
        },
      },
    },
    assert: { status: 403 },
  });

  defineOrgsV1Case({
    name: "PUT avatar unauthenticated returns 401",
    fixtures: ["org-arcadia"],
    request: {
      method: "PUT",
      path: "/v1/orgs/arcadia-science/avatar",
      multipart: {
        avatar: {
          filename: "avatar.png",
          data: TINY_PNG,
          contentType: "image/png",
        },
      },
    },
    assert: { status: 401 },
  });
});
