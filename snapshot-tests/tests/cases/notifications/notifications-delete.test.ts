import { type TestCase } from "@harness/types.ts";
import { afterAll, beforeAll, describe } from "vitest";
import {
  bootstrapWorker,
  defineCase,
  defineCaseGroup,
  teardown,
  type WorkerHarness,
} from "../../harness/runner.ts";

describe("notifications-delete", () => {
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

  const defineNotificationsDeleteCase = (testCase: TestCase) =>
    defineCase("notifications-delete", testCase, workerHarnessRef);

  // ---------------------------------------------------------------------
  // Non-mutating cases -- `deleteNotification`/`deleteNotifications` both
  // check ownership (existence for the single route, `allOwned` for the
  // bulk route) BEFORE issuing any UPDATE, so every failure path here is a
  // genuine no-op. They share one fixture load instead of resetting
  // between cases.
  // ---------------------------------------------------------------------

  defineCaseGroup(
    "notifications-delete",
    ["users-multi", "pub-published", "pub-with-comments", "notification"],
    [
      // DELETE /notifications/ -- bulk

      {
        name: "DELETE all notifications with no auth returns 401",
        request: {
          method: "DELETE",
          path: "/notifications/",
          body: { all: true },
        },
        assert: { status: 401 },
      },

      {
        name: "DELETE notifications with missing ids returns 400",
        auth: { kind: "better-auth", as: "alice" },
        request: {
          method: "DELETE",
          path: "/notifications/",
          body: {},
        },
        assert: { status: 400 },
      },

      {
        name: "DELETE notifications with empty ids array returns 400",
        auth: { kind: "better-auth", as: "alice" },
        request: {
          method: "DELETE",
          path: "/notifications/",
          body: { ids: [] },
        },
        assert: { status: 400 },
      },

      {
        name: "DELETE notifications with non-array ids returns 400",
        auth: { kind: "better-auth", as: "alice" },
        request: {
          method: "DELETE",
          path: "/notifications/",
          body: { ids: "202" },
        },
        assert: { status: 400 },
      },

      {
        name: "DELETE notifications with an id owned by another user returns 404",
        auth: { kind: "better-auth", as: "bob" },
        request: {
          method: "DELETE",
          path: "/notifications/",
          body: { ids: [202] },
        },
        assert: { status: 404 },
      },

      {
        name: "DELETE notifications with a nonexistent id returns 404",
        auth: { kind: "better-auth", as: "alice" },
        request: {
          method: "DELETE",
          path: "/notifications/",
          body: { ids: [999999] },
        },
        assert: { status: 404 },
      },

      {
        name: "DELETE notifications with an already-deleted id returns 404",
        auth: { kind: "better-auth", as: "alice" },
        request: {
          method: "DELETE",
          path: "/notifications/",
          body: { ids: [205] },
        },
        assert: { status: 404 },
      },

      {
        name: "DELETE notifications with only non-numeric ids returns 404",
        auth: { kind: "better-auth", as: "alice" },
        request: {
          method: "DELETE",
          path: "/notifications/",
          body: { ids: ["abc", "def"] },
        },
        assert: { status: 404 },
      },

      {
        name: "DELETE notifications with no body returns 400",
        auth: { kind: "better-auth", as: "alice" },
        request: {
          method: "DELETE",
          path: "/notifications/",
        },
        assert: { status: 400 },
      },

      {
        name: "DELETE all notifications for a user with none marks zero deleted",
        auth: { kind: "better-auth", as: "bob" },
        request: {
          method: "DELETE",
          path: "/notifications/",
          body: { all: true },
        },
        assert: { status: 200 },
      },

      // DELETE /notifications/:note_id -- single

      {
        name: "DELETE notification with no auth returns 401",
        request: {
          method: "DELETE",
          path: "/notifications/202",
        },
        assert: { status: 401 },
      },

      {
        name: "DELETE notification owned by another user returns 404",
        auth: { kind: "better-auth", as: "bob" },
        request: {
          method: "DELETE",
          path: "/notifications/202",
        },
        assert: { status: 404 },
      },

      {
        name: "DELETE notification that does not exist returns 404",
        auth: { kind: "better-auth", as: "alice" },
        request: {
          method: "DELETE",
          path: "/notifications/999999",
        },
        assert: { status: 404 },
      },

      {
        name: "DELETE notification that is already deleted returns 404",
        auth: { kind: "better-auth", as: "alice" },
        request: {
          method: "DELETE",
          path: "/notifications/205",
        },
        assert: { status: 404 },
      },

      {
        name: "DELETE notification with non-numeric note_id returns 404",
        auth: { kind: "better-auth", as: "alice" },
        request: {
          method: "DELETE",
          path: "/notifications/abc",
        },
        assert: { status: 404 },
      },
    ],
    workerHarnessRef
  );

  // ---------------------------------------------------------------------
  // Mutating cases -- each one soft-deletes a notification row, so it
  // gets its own `defineCase` (and its own fixture reset) rather than
  // sharing a load with the others.
  // ---------------------------------------------------------------------

  // DELETE /notifications/ -- bulk

  defineNotificationsDeleteCase({
    name: "DELETE all notifications",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "notification",
    ],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "DELETE",
      path: "/notifications/",
      body: { all: true },
    },
    assert: { status: 200 },
  });

  defineNotificationsDeleteCase({
    name: "DELETE notifications ignores ids when all is true",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "notification",
    ],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "DELETE",
      path: "/notifications/",
      body: { all: true, ids: [202] },
    },
    assert: { status: 200 },
  });

  defineNotificationsDeleteCase({
    name: "DELETE notifications by ids",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "notification",
    ],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "DELETE",
      path: "/notifications/",
      body: { ids: [202, 203] },
    },
    assert: { status: 200 },
  });

  defineNotificationsDeleteCase({
    name: "DELETE notifications with duplicate ids",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "notification",
    ],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "DELETE",
      path: "/notifications/",
      body: { ids: [202, 202] },
    },
    assert: { status: 200 },
  });

  defineNotificationsDeleteCase({
    name: "DELETE notifications with mixed valid and non-numeric ids",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "notification",
    ],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "DELETE",
      path: "/notifications/",
      body: { ids: ["202", "abc"] },
    },
    assert: { status: 200 },
  });

  defineNotificationsDeleteCase({
    name: "DELETE notifications with ids as numeric strings",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "notification",
    ],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "DELETE",
      path: "/notifications/",
      body: { ids: ["202", "203"] },
    },
    assert: { status: 200 },
  });

  // DELETE /notifications/:note_id -- single

  defineNotificationsDeleteCase({
    name: "DELETE notification owned by caller",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "notification",
    ],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "DELETE",
      path: "/notifications/202",
    },
    assert: { status: 200 },
  });
});
