import { type TestCase } from "@harness/types.ts";
import { afterAll, beforeAll, describe } from "vitest";
import {
  bootstrapWorker,
  defineCase,
  teardown,
  type WorkerHarness,
} from "../../harness/runner.ts";

describe("users", () => {
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

  const defineUsersCase = (testCase: TestCase) =>
    defineCase("users", testCase, workerHarnessRef);

  defineUsersCase({
    name: "GET list users on empty DB",
    fixtures: ["empty"],
    request: {
      method: "GET",
      path: "/users/",
      query: { page: 1, per_page: 10 },
    },
    assert: { status: 200 },
  });

  defineUsersCase({
    name: "GET list users with one active user",
    fixtures: ["users-basic"],
    request: {
      method: "GET",
      path: "/users/",
      query: { page: 1, per_page: 10 },
    },
    maskFields: ["items.*.id", "items.*.created_at", "items.*.updated_at"],
    assert: { status: 200 },
  });

  defineUsersCase({
    name: "GET list users page 1 of 2 with three users",
    fixtures: ["users-multi"],
    request: {
      method: "GET",
      path: "/users/",
      query: { page: 1, per_page: 2 },
    },
    maskFields: ["items.*.id", "items.*.created_at", "items.*.updated_at"],
    assert: { status: 200 },
  });

  defineUsersCase({
    name: "GET list users page 2 of 2 with three users",
    fixtures: ["users-multi"],
    request: {
      method: "GET",
      path: "/users/",
      query: { page: 2, per_page: 2 },
    },
    maskFields: ["items.*.id", "items.*.created_at", "items.*.updated_at"],
    assert: { status: 200 },
  });

  defineUsersCase({
    name: "GET user by id returns user",
    fixtures: ["users-basic"],
    request: { method: "GET", path: "/users/1" },
    maskFields: ["id", "created_at", "updated_at"],
    assert: { status: 200 },
  });

  defineUsersCase({
    name: "GET user by id returns 404 for unknown id",
    fixtures: ["empty"],
    request: { method: "GET", path: "/users/9999" },
    assert: { status: 404 },
  });

  defineUsersCase({
    name: "GET user by username returns user",
    fixtures: ["users-basic"],
    request: { method: "GET", path: "/users/alice" },
    maskFields: ["id", "created_at", "updated_at"],
    assert: { status: 200 },
  });

  defineUsersCase({
    name: "GET user by username returns 404 for unknown username",
    fixtures: ["empty"],
    request: { method: "GET", path: "/users/nobody" },
    assert: { status: 404 },
  });

  defineUsersCase({
    name: "GET user publications on empty DB",
    fixtures: ["users-basic"],
    request: {
      method: "GET",
      path: "/users/1/publications",
      query: { page: 1, per_page: 10 },
    },
    assert: { status: 200 },
  });

  defineUsersCase({
    name: "GET user publications with one published pub",
    fixtures: ["users-basic", "pub-published"],
    request: {
      method: "GET",
      path: "/users/1/publications",
      query: { page: 1, per_page: 10 },
    },
    maskFields: ["items.*.id", "items.*.created_at", "items.*.updated_at"],
    assert: { status: 200 },
  });

  // The user-publications endpoint reuses `get_publications_list`, so it
  // honours the same q= / t= filters as /publications. A miss must still
  // return an empty paginated envelope, not 404.
  defineUsersCase({
    name: "GET user publications with q= no match returns empty",
    fixtures: ["users-basic", "pub-published"],
    request: {
      method: "GET",
      path: "/users/1/publications",
      query: { q: "zzzznopematch", page: 1, per_page: 10 },
    },
    maskFields: ["items.*.id", "items.*.created_at", "items.*.updated_at"],
    assert: { status: 200 },
  });

  // Pubs the user does NOT own should be excluded from THIS user's list.
  // With users-multi + pubs-multi, only pub 1 (owner=1) belongs to alice.
  defineUsersCase({
    name: "GET user publications excludes pubs owned by other users",
    fixtures: ["users-multi", "pubs-multi"],
    request: {
      method: "GET",
      path: "/users/1/publications",
      query: { page: 1, per_page: 10 },
    },
    maskFields: ["items.*.id", "items.*.created_at", "items.*.updated_at"],
    assert: { status: 200 },
  });

  defineUsersCase({
    name: "GET user orgs returns empty array when none",
    fixtures: ["users-basic"],
    request: { method: "GET", path: "/users/1/orgs" },
    assert: { status: 200 },
  });

  defineUsersCase({
    name: "GET match users by username",
    fixtures: ["users-basic"],
    request: {
      method: "GET",
      path: "/users/match",
      query: { id: "alice" },
    },
    maskFields: ["*.id", "items.*.id"],
    assert: { status: 200 },
  });
  // The /users/match endpoint dispatches on identifier shape. Cover each
  // kind separately so a regression in any one branch surfaces clearly.

  defineUsersCase({
    name: "GET match users by full name",
    fixtures: ["users-multi"],
    request: {
      method: "GET",
      path: "/users/match",
      query: { id: "Alice Example" },
    },
    maskFields: ["*.id", "items.*.id"],
    assert: { status: 200 },
  });

  defineUsersCase({
    name: "GET match users by email",
    fixtures: ["users-multi"],
    request: {
      method: "GET",
      path: "/users/match",
      query: { id: "bob@example.com" },
    },
    maskFields: ["*.id", "items.*.id"],
    assert: { status: 200 },
  });

  defineUsersCase({
    name: "GET match users by orcid",
    fixtures: ["users-multi", "user-with-orcid"],
    request: {
      method: "GET",
      path: "/users/match",
      query: { id: "0000-0001-2345-6789" },
    },
    maskFields: ["*.id", "items.*.id"],
    assert: { status: 200 },
  });

  defineUsersCase({
    name: "GET match users with no matches",
    fixtures: ["users-multi"],
    request: {
      method: "GET",
      path: "/users/match",
      query: { id: "nobody-matches-this" },
    },
    assert: { status: 200 },
  });

  defineUsersCase({
    name: "PUT update user profile",
    fixtures: ["user-alice"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PUT",
      path: "/users/1",
      body: {
        first_name: "Alicia",
        last_name: "Example",
        email: "alice@example.com",
        profile: "Hello",
      },
    },
    assert: { status: 200 },
  });

  defineUsersCase({
    name: "PUT update other user returns 403",
    fixtures: ["users-multi"],
    auth: { kind: "better-auth", as: "bob" },
    request: {
      method: "PUT",
      path: "/users/1",
      body: { first_name: "Hacked", last_name: "Example" },
    },
    assert: { status: 403 },
  });

  defineUsersCase({
    name: "PUT update other user as site admin returns 403",
    fixtures: ["users-multi"],
    auth: { kind: "better-auth", as: "charlie" },
    request: {
      method: "PUT",
      path: "/users/1",
      body: { first_name: "AdminEdit", last_name: "Example" },
    },
    assert: { status: 403 },
  });

  // Skipped: multipart/form-data uploads + S3-backed avatar storage are
  // not yet wired into the harness or api-v1 test path.
  defineUsersCase({
    name: "POST upload user avatar",
    fixtures: ["user-alice"],
    knownFailure: true,
    auth: { kind: "better-auth", as: "alice" },
    request: { method: "POST", path: "/users/1/avatar" },
    assert: { status: 200 },
  });

  defineUsersCase({
    name: "GET user notifications (unread)",
    fixtures: ["user-alice"],
    auth: { kind: "better-auth", as: "alice" },
    request: { method: "GET", path: "/users/notes" },
    assert: { status: 200 },
  });

  defineUsersCase({
    name: "GET user notifications (unauthenticated)",
    fixtures: ["empty"],
    request: { method: "GET", path: "/users/notes" },
    assert: { status: 401 },
  });

  defineUsersCase({
    name: "GET user notifications (unread) - with unread data",
    fixtures: ["users-basic", "notification-unread"],
    auth: { kind: "better-auth", as: "alice" },
    request: { method: "GET", path: "/users/notes" },
    maskFields: ["*.updated_at"],
    assert: { status: 200 },
  });

  defineUsersCase({
    name: "GET user notifications (unread) - excludes soft-deleted",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "notification",
    ],
    auth: { kind: "better-auth", as: "alice" },
    request: { method: "GET", path: "/users/notes" },
    maskFields: ["*.updated_at"],
    assert: { status: 200 },
  });

  defineUsersCase({
    name: "GET user notifications (?all) - empty",
    fixtures: ["users-basic"],
    auth: { kind: "better-auth", as: "alice" },
    request: { method: "GET", path: "/users/notes", query: { all: "1" } },
    assert: { status: 200 },
  });

  defineUsersCase({
    name: "GET user notifications (?all) - with data",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "notification",
    ],
    auth: { kind: "better-auth", as: "alice" },
    request: { method: "GET", path: "/users/notes", query: { all: "1" } },
    maskFields: ["items.*.updated_at"],
    assert: { status: 200 },
  });

  defineUsersCase({
    name: "POST mark notification",
    fixtures: ["user-alice"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "POST",
      path: "/users/mark_note",
      body: { note_id: 1, seen: true },
    },
    assert: { status: 200 },
  });
});
