import { type TestCase } from "@harness/types.ts";
import { afterAll, beforeAll, describe } from "vitest";
import {
  bootstrapWorker,
  defineCase,
  defineCaseGroup,
  teardown,
  type WorkerHarness,
} from "../../harness/runner.ts";

// Fixture notes: the "notification" fixture seeds alice-owned notifications 202/203/204.
// Some cases below also exercise nonexistent/soft-deleted IDs (e.g. 205) to
// ensure the API returns 404 for notifications that are not visible to the caller.

describe("notifications-patch", () => {
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

  const defineNotificationsPatchCase = (testCase: TestCase) =>
    defineCase("notifications-patch", testCase, workerHarnessRef);

  // ---------------------------------------------------------------------
  // Non-mutating cases -- none of these change a notification's row data
  // (auth/validation guards short-circuit before any UPDATE, or the
  // UPDATE's WHERE clause matches nothing), so they share one fixture
  // load instead of resetting between cases.
  // ---------------------------------------------------------------------

  defineCaseGroup(
    "notifications-patch",
    ["users-multi", "pub-published", "pub-with-comments", "notification"],
    [
      // PATCH /notifications/ -- bulk

      {
        name: "PATCH all notifications with no auth returns 401",
        request: {
          method: "PATCH",
          path: "/notifications/",
          body: { all: true },
        },
        assert: { status: 401 },
      },

      {
        name: "PATCH notifications with missing ids returns 400",
        auth: { kind: "better-auth", as: "alice" },
        request: {
          method: "PATCH",
          path: "/notifications/",
          body: {},
        },
        assert: { status: 400 },
      },

      {
        name: "PATCH notifications with empty ids array returns 400",
        auth: { kind: "better-auth", as: "alice" },
        request: {
          method: "PATCH",
          path: "/notifications/",
          body: { ids: [] },
        },
        assert: { status: 400 },
      },

      {
        name: "PATCH notifications with non-array ids returns 400",
        auth: { kind: "better-auth", as: "alice" },
        request: {
          method: "PATCH",
          path: "/notifications/",
          body: { ids: "202" },
        },
        assert: { status: 400 },
      },

      {
        name: "PATCH notifications with an id owned by another user returns 404",
        auth: { kind: "better-auth", as: "bob" },
        request: {
          method: "PATCH",
          path: "/notifications/",
          body: { ids: [202] },
        },
        assert: { status: 404 },
      },

      {
        name: "PATCH notifications with a nonexistent id returns 404",
        auth: { kind: "better-auth", as: "alice" },
        request: {
          method: "PATCH",
          path: "/notifications/",
          body: { ids: [999999] },
        },
        assert: { status: 404 },
      },

      {
        name: "PATCH notifications with a soft-deleted id returns 404",
        auth: { kind: "better-auth", as: "alice" },
        request: {
          method: "PATCH",
          path: "/notifications/",
          body: { ids: [205] },
        },
        assert: { status: 404 },
      },

      {
        name: "PATCH notifications with only non-numeric ids returns 404",
        auth: { kind: "better-auth", as: "alice" },
        request: {
          method: "PATCH",
          path: "/notifications/",
          body: { ids: ["abc", "def"] },
        },
        assert: { status: 404 },
      },

      {
        name: "PATCH notifications with no body returns 400",
        auth: { kind: "better-auth", as: "alice" },
        request: {
          method: "PATCH",
          path: "/notifications/",
        },
        assert: { status: 400 },
      },

      {
        name: "PATCH all notifications for a user with none marks zero updated",
        auth: { kind: "better-auth", as: "bob" },
        request: {
          method: "PATCH",
          path: "/notifications/",
          body: { all: true },
        },
        maskFields: ["updated_at"],
        assert: { status: 200 },
      },

      // PATCH /notifications/:note_id -- single

      {
        name: "PATCH notification with no auth returns 401",
        request: {
          method: "PATCH",
          path: "/notifications/202",
          body: {},
        },
        assert: { status: 401 },
      },

      {
        name: "PATCH notification owned by another user returns 404",
        auth: { kind: "better-auth", as: "bob" },
        request: {
          method: "PATCH",
          path: "/notifications/202",
          body: {},
        },
        assert: { status: 404 },
      },

      {
        name: "PATCH notification that does not exist returns 404",
        auth: { kind: "better-auth", as: "alice" },
        request: {
          method: "PATCH",
          path: "/notifications/999999",
          body: {},
        },
        assert: { status: 404 },
      },

      {
        name: "PATCH notification that is soft-deleted returns 404",
        auth: { kind: "better-auth", as: "alice" },
        request: {
          method: "PATCH",
          path: "/notifications/205",
          body: {},
        },
        assert: { status: 404 },
      },

      {
        name: "PATCH notification with non-numeric note_id returns 404",
        auth: { kind: "better-auth", as: "alice" },
        request: {
          method: "PATCH",
          path: "/notifications/abc",
          body: {},
        },
        assert: { status: 404 },
      },
    ],
    workerHarnessRef
  );

  // ---------------------------------------------------------------------
  // Mutating cases -- each one changes a notification's row data, so it
  // gets its own `defineCase` (and, once fixtures are wired up, its own
  // fixture reset) rather than sharing a load with the others.
  // ---------------------------------------------------------------------

  // PATCH /notifications/ -- bulk

  defineNotificationsPatchCase({
    name: "PATCH all notifications marks everything seen by default",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "notification",
    ],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PATCH",
      path: "/notifications/",
      body: { all: true },
    },
    maskFields: ["items.*.updated_at"],
    assert: { status: 200 },
  });

  defineNotificationsPatchCase({
    name: "PATCH all notifications with seen false marks everything unseen",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "notification",
    ],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PATCH",
      path: "/notifications/",
      body: { all: true, seen: false },
    },
    maskFields: ["items.*.updated_at"],
    assert: { status: 200 },
  });

  defineNotificationsPatchCase({
    name: "PATCH notifications ignores ids when all is true",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "notification",
    ],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PATCH",
      path: "/notifications/",
      body: { all: true, ids: [202] },
    },
    maskFields: ["items.*.updated_at"],
    assert: { status: 200 },
  });

  defineNotificationsPatchCase({
    name: "PATCH notifications by ids marks them seen by default",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "notification",
    ],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PATCH",
      path: "/notifications/",
      body: { ids: [202, 203] },
    },
    maskFields: ["items.*.updated_at"],
    assert: { status: 200 },
  });

  defineNotificationsPatchCase({
    name: "PATCH notifications by ids with seen false marks them unseen",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "notification",
    ],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PATCH",
      path: "/notifications/",
      body: { ids: [202, 203], seen: false },
    },
    maskFields: ["items.*.updated_at"],
    assert: { status: 200 },
  });

  defineNotificationsPatchCase({
    name: "PATCH notifications with duplicate ids",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "notification",
    ],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PATCH",
      path: "/notifications/",
      body: { ids: [202, 202] },
    },
    maskFields: ["items.*.updated_at"],
    assert: { status: 200 },
  });

  defineNotificationsPatchCase({
    name: "PATCH notifications with mixed valid and non-numeric ids",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "notification",
    ],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PATCH",
      path: "/notifications/",
      body: { ids: ["202", "abc"] },
    },
    maskFields: ["items.*.updated_at"],
    assert: { status: 200 },
  });

  defineNotificationsPatchCase({
    name: "PATCH notifications with ids as numeric strings",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "notification",
    ],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PATCH",
      path: "/notifications/",
      body: { ids: ["202", "203"] },
    },
    maskFields: ["items.*.updated_at"],
    assert: { status: 200 },
  });

  defineNotificationsPatchCase({
    name: "PATCH notifications with non-boolean truthy seen value marks seen true",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "notification",
    ],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PATCH",
      path: "/notifications/",
      body: { ids: [202], seen: "false" },
    },
    maskFields: ["items.*.updated_at"],
    assert: { status: 200 },
  });

  // PATCH /notifications/:note_id -- single

  defineNotificationsPatchCase({
    name: "PATCH notification marks it seen by default",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "notification",
    ],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PATCH",
      path: "/notifications/202",
      body: {},
    },
    maskFields: ["updated_at"],
    assert: { status: 200 },
  });

  defineNotificationsPatchCase({
    name: "PATCH notification with seen false marks it unseen",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "notification",
    ],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PATCH",
      path: "/notifications/203",
      body: { seen: false },
    },
    maskFields: ["updated_at"],
    assert: { status: 200 },
  });

  defineNotificationsPatchCase({
    name: "PATCH notification with non-boolean truthy seen value marks it seen",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "notification",
    ],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PATCH",
      path: "/notifications/204",
      body: { seen: "false" },
    },
    maskFields: ["updated_at"],
    assert: { status: 200 },
  });

  defineNotificationsPatchCase({
    name: "PATCH notification with no body still marks it seen",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "notification",
    ],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PATCH",
      path: "/notifications/202",
    },
    maskFields: ["updated_at"],
    assert: { status: 200 },
  });
});
