import { type TestCase } from "@harness/types.ts";
import { afterAll, beforeAll, describe } from "vitest";
import {
  bootstrapWorker,
  defineCase,
  teardown,
  type WorkerHarness,
} from "../../harness/runner.ts";

describe("comments", () => {
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

  const defineCommentsCase = (testCase: TestCase) =>
    defineCase("comments", testCase, workerHarnessRef);

  defineCommentsCase({
    name: "GET comments for publication with no comments",
    fixtures: ["users-basic", "pub-published"],
    request: {
      method: "GET",
      path: "/comments/publication/1",
      query: { page: 1, per_page: 50 },
    },
    assert: { status: 200 },
  });

  defineCommentsCase({
    name: "GET comments for publication with two comments",
    fixtures: ["users-multi", "pub-published", "pub-with-comments"],
    request: {
      method: "GET",
      path: "/comments/publication/1",
      query: { page: 1, per_page: 50 },
    },
    maskFields: [
      "items.*.id",
      "items.*.parent_id",
      "items.*.created_at",
      "items.*.updated_at",
      "items.*.user_id",
      "items.*.publication_id",
      "items.*.version_id",
    ],
    assert: { status: 200 },
  });
  // List query restricts to state='PUBLISHED'. A DELETED comment in the
  // same publication must not surface.
  defineCommentsCase({
    name: "GET comments excludes deleted comments",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "pub-with-deleted-comment",
    ],
    request: {
      method: "GET",
      path: "/comments/publication/1",
      query: { page: 1, per_page: 50 },
    },
    maskFields: [
      "items.*.id",
      "items.*.parent_id",
      "items.*.created_at",
      "items.*.updated_at",
      "items.*.user_id",
      "items.*.publication_id",
      "items.*.version_id",
    ],
    assert: { status: 200 },
  });

  defineCommentsCase({
    name: "GET comments page 1 of 2",
    fixtures: ["users-multi", "pub-published", "pub-with-comments"],
    request: {
      method: "GET",
      path: "/comments/publication/1",
      query: { page: 1, per_page: 1 },
    },
    maskFields: [
      "items.*.id",
      "items.*.parent_id",
      "items.*.created_at",
      "items.*.updated_at",
      "items.*.user_id",
      "items.*.publication_id",
      "items.*.version_id",
    ],
    assert: { status: 200 },
  });

  defineCommentsCase({
    name: "GET comments page 2 of 2",
    fixtures: ["users-multi", "pub-published", "pub-with-comments"],
    request: {
      method: "GET",
      path: "/comments/publication/1",
      query: { page: 2, per_page: 1 },
    },
    maskFields: [
      "items.*.id",
      "items.*.parent_id",
      "items.*.created_at",
      "items.*.updated_at",
      "items.*.user_id",
      "items.*.publication_id",
      "items.*.version_id",
    ],
    assert: { status: 200 },
  });
  defineCommentsCase({
    name: "GET single comment by id",
    fixtures: ["users-multi", "pub-published", "pub-with-comments"],
    request: { method: "GET", path: "/comments/1" },
    maskFields: [
      "id",
      "parent_id",
      "created_at",
      "updated_at",
      "user_id",
      "publication_id",
      "version_id",
    ],
    assert: { status: 200 },
  });

  defineCommentsCase({
    name: "GET single comment by unknown id returns 404",
    fixtures: ["empty"],
    request: { method: "GET", path: "/comments/9999" },
    assert: { status: 404 },
  });

  // List endpoint doesn't FK-check the publication id, so an unknown id
  // returns an empty paginated list rather than 404. Lock that in.
  defineCommentsCase({
    name: "GET comments for unknown publication returns empty list",
    fixtures: ["empty"],
    request: {
      method: "GET",
      path: "/comments/publication/9999",
      query: { page: 1, per_page: 50 },
    },
    assert: { status: 200 },
  });

  // Threading backfill: when a query window contains a reply but not its
  // parent, the route's `_include_parent_comments` helper walks up the
  // chain and includes the parent. With per_page=1, page 1 returns the
  // newest comment (the reply) plus its backfilled parent.
  defineCommentsCase({
    name: "GET comments page 1 with per_page=1 backfills parent",
    fixtures: ["users-multi", "pub-published", "pub-with-comments"],
    request: {
      method: "GET",
      path: "/comments/publication/1",
      query: { page: 1, per_page: 1 },
    },
    maskFields: [
      "items.*.id",
      "items.*.parent_id",
      "items.*.created_at",
      "items.*.updated_at",
      "items.*.user_id",
      "items.*.publication_id",
      "items.*.version_id",
    ],
    assert: { status: 200 },
  });

  // ---- write paths (auth-gated) -----------------------------------------

  defineCommentsCase({
    name: "POST create top-level comment",
    fixtures: ["users-multi", "pub-published"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "POST",
      path: "/comments/publication/1",
      body: { body: "Nice paper." },
    },
    assert: { status: 201 },
  });

  defineCommentsCase({
    name: "POST create reply to existing comment",
    fixtures: ["users-multi", "pub-published", "pub-with-comments"],
    auth: { kind: "better-auth", as: "bob" },
    request: {
      method: "POST",
      path: "/comments/publication/1",
      body: { body: "Replying.", parent_id: 1 },
    },
    assert: { status: 201 },
  });

  defineCommentsCase({
    name: "POST create comment with missing body returns 400",
    fixtures: ["users-multi", "pub-published"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "POST",
      path: "/comments/publication/1",
      body: {},
    },
    assert: { status: 400 },
  });

  defineCommentsCase({
    name: "POST create comment unauthenticated returns 401",
    fixtures: ["users-multi", "pub-published"],
    request: {
      method: "POST",
      path: "/comments/publication/1",
      body: { body: "Hi." },
    },
    assert: { status: 401 },
  });

  defineCommentsCase({
    name: "PUT update own comment",
    fixtures: ["users-multi", "pub-published", "pub-with-comments"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PUT",
      path: "/comments/1",
      body: { body: "Edited." },
    },
    assert: { status: 200 },
  });

  defineCommentsCase({
    name: "PUT update other user's comment is rejected",
    fixtures: ["users-multi", "pub-published", "pub-with-comments"],
    auth: { kind: "better-auth", as: "bob" },
    request: {
      method: "PUT",
      path: "/comments/1",
      body: { body: "Hijacked." },
    },
    assert: { status: 403 },
  });

  defineCommentsCase({
    name: "PATCH update own comment",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "pub-with-editable-comment",
    ],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PATCH",
      path: "/comments/3",
      body: { body: "Edited." },
    },
    assert: { status: 200 },
  });

  defineCommentsCase({
    name: "PATCH update other user's comment is rejected",
    fixtures: ["users-multi", "pub-published", "pub-with-comments"],
    auth: { kind: "better-auth", as: "bob" },
    request: {
      method: "PATCH",
      path: "/comments/1",
      body: { body: "Hijacked." },
    },
    assert: { status: 403 },
  });

  defineCommentsCase({
    name: "WITHDRAW own comment",
    fixtures: ["users-multi", "pub-published", "pub-with-comments"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PATCH",
      path: "/comments/1",
      body: { state: "WITHDRAWN" },
    },
    assert: { status: 200 },
  });

  defineCommentsCase({
    name: "WITHDRAW other user's comment as random user returns 403",
    fixtures: ["users-multi", "pub-published", "pub-with-comments"],
    auth: { kind: "better-auth", as: "bob" },
    request: {
      method: "PATCH",
      path: "/comments/1",
      body: { state: "WITHDRAWN" },
    },
    assert: { status: 403 },
  });

  defineCommentsCase({
    name: "DELETE own comment withdraws it",
    fixtures: ["users-multi", "pub-published", "pub-with-comments"],
    auth: { kind: "better-auth", as: "alice" },
    request: { method: "DELETE", path: "/comments/1" },
    assert: { status: 200 },
  });

  defineCommentsCase({
    name: "DELETE other user's comment is rejected",
    fixtures: ["users-multi", "pub-published", "pub-with-comments"],
    auth: { kind: "better-auth", as: "bob" },
    request: { method: "DELETE", path: "/comments/1" },
    assert: { status: 403 },
  });

  // S3-presigned upload URL — defer pending S3 mock infrastructure.
  defineCommentsCase({
    name: "GET comments upload-url",
    fixtures: ["user-alice"],
    knownFailure: true,
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "GET",
      path: "/comments/upload-url",
      query: {
        slug: "hello-stacks",
        content_type: "image/png",
        file_size: 1024,
      },
    },
    assert: { status: 200 },
  });
});
