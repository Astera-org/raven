import { afterAll, beforeAll, describe } from "vitest";
import {
  bootstrapWorker,
  defineCase,
  defineCaseGroup,
  teardown,
  type WorkerHarness,
} from "../../harness/runner.ts";

describe("notifications-get", () => {
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

  // None of these cases write to the DB, so they share one fixture load
  // instead of resetting between cases.
  defineCaseGroup(
    "notifications-get",
    ["users-multi", "pub-published", "pub-with-comments", "notification"],
    [
      // GET /notifications/:note_id -- single notification

      {
        name: "GET notification with no auth returns 401",
        request: { method: "GET", path: "/notifications/202" },
        assert: { status: 401 },
        maskFields: ["updated_at"],
      },

      {
        name: "GET notification owned by caller",
        auth: { kind: "better-auth", as: "alice" },
        request: { method: "GET", path: "/notifications/202" },
        assert: { status: 200 },
        maskFields: ["updated_at"],
      },

      {
        name: "GET notification owned by another user returns 404",
        auth: { kind: "better-auth", as: "bob" },
        request: { method: "GET", path: "/notifications/202" },
        assert: { status: 404 },
        maskFields: ["updated_at"],
      },

      {
        name: "GET notification that does not exist returns 404",
        auth: { kind: "better-auth", as: "alice" },
        request: { method: "GET", path: "/notifications/999999" },
        assert: { status: 404 },
        maskFields: ["updated_at"],
      },

      // GET /notifications/ -- batch/list

      {
        name: "GET all seen notifications",
        auth: { kind: "better-auth", as: "alice" },
        request: {
          method: "GET",
          path: "/notifications/",
          query: { seen: "true" },
        },
        assert: { status: 200 },
        maskFields: ["items.*.updated_at"],
      },

      {
        name: "GET all unseen notifications",
        auth: { kind: "better-auth", as: "alice" },
        request: {
          method: "GET",
          path: "/notifications/",
          query: { seen: "false" },
        },
        assert: { status: 200 },
        maskFields: ["items.*.updated_at"],
      },

      {
        name: "GET all notifications with 'any'",
        auth: { kind: "better-auth", as: "alice" },
        request: {
          method: "GET",
          path: "/notifications/",
          query: { seen: "any" },
        },
        assert: { status: 200 },
        maskFields: ["items.*.updated_at"],
      },

      {
        name: "GET all notifications with no query",
        auth: { kind: "better-auth", as: "alice" },
        request: {
          method: "GET",
          path: "/notifications/",
          query: {},
        },
        assert: { status: 200 },
        maskFields: ["items.*.updated_at"],
      },

      {
        name: "GET all notifications with pagination",
        auth: { kind: "better-auth", as: "alice" },
        request: {
          method: "GET",
          path: "/notifications/",
          query: { seen: "any", per_page: 2 },
        },
        assert: { status: 200 },
        maskFields: ["items.*.updated_at"],
      },
    ],
    workerHarnessRef
  );

  defineCase(
    "notifications-get",
    {
      name: "GET all notifications strips markdown from the comment excerpt without re-escaping it",
      fixtures: [
        "users-multi",
        "pub-published",
        "pub-with-comments",
        "notification-markdown-comment",
      ],
      auth: { kind: "better-auth", as: "alice" },
      request: {
        method: "GET",
        path: "/notifications/",
        query: { seen: "any" },
      },
      assert: {
        status: 200,
        bodyContains: [
          "this thing in italics, my_variable_name and foo_bar, plus a [note] and 50% done.",
        ],
      },
      maskFields: ["items.*.updated_at"],
    },
    workerHarnessRef
  );
});
