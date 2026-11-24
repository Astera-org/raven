import { type TestCase } from "@harness/types.ts";
import { afterAll, beforeAll, describe } from "vitest";
import {
  bootstrapWorker,
  defineCase,
  teardown,
  type WorkerHarness,
} from "../../harness/runner.ts";
import { TINY_PNG } from "../../harness/test-assets.ts";

describe("orgs", () => {
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

  const defineOrgsCase = (testCase: TestCase) =>
    defineCase("orgs", testCase, workerHarnessRef);

  // ---- read paths --------------------------------------------------------

  defineOrgsCase({
    name: "GET org by slug returns org",
    fixtures: ["org-arcadia"],
    request: { method: "GET", path: "/orgs/arcadia-science" },
    maskFields: ["id", "id_int", "created_at", "updated_at"],
    assert: { status: 200 },
  });

  defineOrgsCase({
    name: "GET org by id returns org",
    fixtures: ["org-arcadia"],
    request: { method: "GET", path: "/orgs/1" },
    maskFields: ["id", "id_int", "created_at", "updated_at"],
    assert: { status: 200 },
  });

  defineOrgsCase({
    name: "GET org by unknown slug returns 404",
    fixtures: ["empty"],
    request: { method: "GET", path: "/orgs/no-such-org" },
    assert: { status: 404 },
  });

  defineOrgsCase({
    name: "GET org users returns 200 when org has no members",
    fixtures: ["org-arcadia"],
    request: { method: "GET", path: "/orgs/arcadia-science/users" },
    assert: { status: 200 },
  });

  defineOrgsCase({
    name: "GET org users with two members",
    fixtures: ["users-multi", "org-arcadia", "org-with-members"],
    request: { method: "GET", path: "/orgs/arcadia-science/users" },
    maskFields: ["*.id", "*.start_at", "*.end_at"],
    assert: { status: 200 },
  });
  // The query filters out memberships whose `end_at` is in the past.
  // `org-with-ended-member.sql` seeds three rows: alice (active),
  // bob (end_at past, must be excluded), charlie (end_at far future).
  defineOrgsCase({
    name: "GET org users excludes members with end_at in the past",
    fixtures: ["users-multi", "org-arcadia", "org-with-ended-member"],
    request: { method: "GET", path: "/orgs/arcadia-science/users" },
    maskFields: ["*.id", "*.start_at", "*.end_at"],
    assert: { status: 200 },
  });
  defineOrgsCase({
    name: "GET org users for unknown org returns 404",
    fixtures: ["empty"],
    request: { method: "GET", path: "/orgs/no-such-org/users" },
    assert: { status: 404 },
  });

  defineOrgsCase({
    name: "GET org publications on empty DB",
    fixtures: ["org-arcadia"],
    request: {
      method: "GET",
      path: "/orgs/arcadia-science/publications",
      query: { page: 1, per_page: 10 },
    },
    assert: { status: 200 },
  });

  defineOrgsCase({
    name: "GET org publications for unknown org returns 404",
    fixtures: ["empty"],
    request: {
      method: "GET",
      path: "/orgs/no-such-org/publications",
      query: { page: 1, per_page: 10 },
    },
    assert: { status: 404 },
  });

  // ---- write paths (auth-gated; skipped pending working login) ----------

  defineOrgsCase({
    name: "POST create org as site admin",
    fixtures: ["users-multi"],
    auth: { kind: "better-auth", as: "charlie" },
    request: {
      method: "POST",
      path: "/orgs/",
      body: { name: "New Org" },
    },
    assert: { status: 201 },
  });

  defineOrgsCase({
    name: "POST create org as non-admin returns 403",
    fixtures: ["users-multi"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "POST",
      path: "/orgs/",
      body: { name: "Sneaky Org" },
    },
    assert: { status: 403 },
  });

  defineOrgsCase({
    name: "POST update org as admin member",
    fixtures: ["users-multi", "org-arcadia", "org-with-members"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "POST",
      path: "/orgs/arcadia-science",
      body: { name: "Arcadia Science (renamed)" },
    },
    assert: { status: 200 },
  });

  defineOrgsCase({
    name: "POST update org as non-admin returns 403",
    fixtures: ["users-multi", "org-arcadia", "org-with-members"],
    auth: { kind: "better-auth", as: "bob" },
    request: {
      method: "POST",
      path: "/orgs/arcadia-science",
      body: { name: "Hijacked" },
    },
    assert: { status: 403 },
  });

  defineOrgsCase({
    name: "DELETE org as admin",
    fixtures: ["users-multi", "org-arcadia", "org-with-members"],
    auth: { kind: "better-auth", as: "alice" },
    request: { method: "DELETE", path: "/orgs/arcadia-science" },
    assert: { status: 200 },
  });

  defineOrgsCase({
    name: "POST add_member adds a new user",
    fixtures: ["users-multi", "org-arcadia", "org-with-members"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "POST",
      path: "/orgs/arcadia-science/add_member",
      body: { username: "charlie" },
    },
    assert: { status: 200 },
  });

  defineOrgsCase({
    name: "POST add_member with duplicate user returns 409",
    fixtures: ["users-multi", "org-arcadia", "org-with-members"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "POST",
      path: "/orgs/arcadia-science/add_member",
      body: { username: "bob" },
    },
    assert: { status: 409 },
  });

  defineOrgsCase({
    name: "POST remove_member sets end_at",
    fixtures: ["users-multi", "org-arcadia", "org-with-members"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "POST",
      path: "/orgs/arcadia-science/remove_member",
      body: { member_id: 2, end_at: "2026-06-01 00:00:00" },
    },
    assert: { status: 200 },
  });

  defineOrgsCase({
    name: "POST delete_member hard-deletes mapping",
    fixtures: ["users-multi", "org-arcadia", "org-with-members"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "POST",
      path: "/orgs/arcadia-science/delete_member",
      body: { member_id: 2 },
    },
    assert: { status: 200 },
  });

  defineOrgsCase({
    name: "POST upload org avatar",
    fixtures: ["users-multi", "org-arcadia", "org-with-members"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "POST",
      path: "/orgs/arcadia-science/avatar",
      multipart: {
        avatar: {
          filename: "avatar.png",
          data: TINY_PNG,
          contentType: "image/png",
        },
      },
    },
    maskFields: ["avatar_url"],
    assert: {
      status: 200,
      bodyContains: [
        /"avatar_url":\s*"\/api\/files\/avatars\/orgs\/org_1_\d+\.png"/m,
      ],
    },
  });
});
