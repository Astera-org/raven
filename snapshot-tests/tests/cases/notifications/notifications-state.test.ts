import { type TestCase } from "@harness/types.ts";
import { afterAll, beforeAll, describe } from "vitest";
import {
  bootstrapWorker,
  defineCase,
  defineCaseGroup,
  teardown,
  type WorkerHarness,
} from "../../harness/runner.ts";

// Fixture notes: `notification-mixed-states` adds alice-owned notifications
// 210 (NEW_PUBLICATION) and 211 (REPLY) on top of the `notification`
// fixture's 202/203/204 (all COMMENT), giving three distinct states to
// filter/scope by.

describe("notifications-state", () => {
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

  const defineNotificationsStateCase = (testCase: TestCase) =>
    defineCase("notifications-state", testCase, workerHarnessRef);

  // ---------------------------------------------------------------------
  // Non-mutating cases -- GET /notifications/?state= and
  // GET /notifications/types -- share one fixture load.
  // ---------------------------------------------------------------------

  defineCaseGroup(
    "notifications-state",
    [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "notification",
      "notification-mixed-states",
    ],
    [
      {
        name: "GET notifications filtered by state",
        auth: { kind: "better-auth", as: "alice" },
        request: {
          method: "GET",
          path: "/notifications/",
          query: { state: "COMMENT" },
        },
        assert: { status: 200 },
        maskFields: ["items.*.updated_at"],
      },

      {
        name: "GET notifications with an invalid state ignores the filter",
        auth: { kind: "better-auth", as: "alice" },
        request: {
          method: "GET",
          path: "/notifications/",
          query: { state: "NOT_A_REAL_STATE" },
        },
        assert: { status: 200 },
        maskFields: ["items.*.updated_at"],
      },

      {
        name: "GET distinct notification states",
        auth: { kind: "better-auth", as: "alice" },
        request: { method: "GET", path: "/notifications/types" },
        assert: { status: 200 },
      },

      {
        name: "GET distinct notification states with no auth returns 401",
        request: { method: "GET", path: "/notifications/types" },
        assert: { status: 401 },
      },
    ],
    workerHarnessRef
  );

  // ---------------------------------------------------------------------
  // Mutating cases -- state-scoped bulk PATCH/DELETE, each gets its own
  // fixture reset.
  // ---------------------------------------------------------------------

  defineNotificationsStateCase({
    name: "PATCH all notifications scoped to a state only updates that state",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "notification",
      "notification-mixed-states",
    ],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PATCH",
      path: "/notifications/",
      body: { all: true, state: "REPLY" },
    },
    assert: { status: 200 },
  });

  defineNotificationsStateCase({
    name: "PATCH all notifications with an invalid state returns 400",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "notification",
      "notification-mixed-states",
    ],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PATCH",
      path: "/notifications/",
      body: { all: true, state: "NOT_A_REAL_STATE" },
    },
    assert: { status: 400 },
  });

  defineNotificationsStateCase({
    name: "DELETE all notifications scoped to a state only deletes that state",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "notification",
      "notification-mixed-states",
    ],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "DELETE",
      path: "/notifications/",
      body: { all: true, state: "NEW_PUBLICATION" },
    },
    assert: { status: 200 },
  });

  defineNotificationsStateCase({
    name: "DELETE all notifications with an invalid state returns 400",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "notification",
      "notification-mixed-states",
    ],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "DELETE",
      path: "/notifications/",
      body: { all: true, state: "NOT_A_REAL_STATE" },
    },
    assert: { status: 400 },
  });
});
