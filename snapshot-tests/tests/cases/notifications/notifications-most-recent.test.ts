import { type TestCase } from "@harness/types.ts";
import { afterAll, beforeAll, describe } from "vitest";
import {
  bootstrapWorker,
  defineCase,
  teardown,
  type WorkerHarness,
} from "../../harness/runner.ts";

// Fixture notes: the `notification` fixture seeds alice-owned notifications
// 202 (20:10:41), 203 (20:11:41), 204 (20:12:41), in ascending created_at
// order. Using 203 as `mostRecentNotificationId` should scope a bulk action
// to 202+203 (at or before 203's created_at) and leave 204 untouched.

describe("notifications-most-recent", () => {
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

  const defineNotificationsMostRecentCase = (testCase: TestCase) =>
    defineCase("notifications-most-recent", testCase, workerHarnessRef);

  const sharedFixtures = [
    "users-multi",
    "pub-published",
    "pub-with-comments",
    "notification",
  ];

  defineNotificationsMostRecentCase({
    name: "PATCH all notifications scoped to mostRecentNotificationId only updates at-or-before that time",
    fixtures: sharedFixtures,
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PATCH",
      path: "/notifications/",
      body: { all: true, mostRecentNotificationId: 203 },
    },
    assert: { status: 200 },
  });

  defineNotificationsMostRecentCase({
    name: "PATCH all notifications with a nonexistent mostRecentNotificationId returns 404",
    fixtures: sharedFixtures,
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PATCH",
      path: "/notifications/",
      body: { all: true, mostRecentNotificationId: 999999 },
    },
    assert: { status: 404 },
  });

  defineNotificationsMostRecentCase({
    name: "DELETE all notifications scoped to mostRecentNotificationId only deletes at-or-before that time",
    fixtures: sharedFixtures,
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "DELETE",
      path: "/notifications/",
      body: { all: true, mostRecentNotificationId: 203 },
    },
    assert: { status: 200 },
  });

  defineNotificationsMostRecentCase({
    name: "DELETE all notifications with a nonexistent mostRecentNotificationId returns 404",
    fixtures: sharedFixtures,
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "DELETE",
      path: "/notifications/",
      body: { all: true, mostRecentNotificationId: 999999 },
    },
    assert: { status: 404 },
  });
});
