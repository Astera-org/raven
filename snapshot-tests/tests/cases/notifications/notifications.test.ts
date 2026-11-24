import { type TestCase } from "@harness/types.ts";
import { afterAll, beforeAll, describe } from "vitest";
import {
  bootstrapWorker,
  defineCase,
  teardown,
  type WorkerHarness,
} from "../../harness/runner.ts";

describe("notifications", () => {
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

  const defineNotificationsCase = (testCase: TestCase) =>
    defineCase("notifications", testCase, workerHarnessRef);

  // POST /notifications/unsubscribe accepts the token in either query
  // params (Gmail's 1-click) or JSON body. Without a real token signer
  // wired into the harness, we exercise the validation paths here and
  // skip the success path until token minting is supported.

  defineNotificationsCase({
    name: "POST unsubscribe with no token returns 400",
    fixtures: ["empty"],
    request: { method: "POST", path: "/notifications/unsubscribe", body: {} },
    assert: { status: 400 },
  });

  defineNotificationsCase({
    name: "POST unsubscribe with malformed token returns 400",
    fixtures: ["empty"],
    request: {
      method: "POST",
      path: "/notifications/unsubscribe",
      body: { token: "not-a-real-token" },
    },
    assert: { status: 400 },
  });

  // The token can also arrive as a query param (Gmail's 1-click). Same
  // malformed-token guard should fire.
  defineNotificationsCase({
    name: "POST unsubscribe with malformed token in query returns 400",
    fixtures: ["empty"],
    request: {
      method: "POST",
      path: "/notifications/unsubscribe",
      query: { token: "not-a-real-token" },
    },
    assert: { status: 400 },
  });

  // The success path requires a token signed with the server's
  // JWT_SECRET_KEY. Adding it needs a harness-side helper that mints the
  // token (`generateUnsubscribeToken` in backend-ts/src/lib/unsubscribe.ts
  // should be the source of truth). Tracked separately; no skipped
  // case here because we don't have a request body that actually
  // exercises the success branch.

  defineNotificationsCase({
    name: "GET user notification settings",
    fixtures: ["user-alice"],
    auth: { kind: "better-auth", as: "alice" },
    request: { method: "GET", path: "/notifications/get_user_settings" },
    assert: { status: 200 },
  });

  defineNotificationsCase({
    name: "PUT update user notification setting with valid fields",
    fixtures: [
      "users-multi",
      "pub-published",
      "pub-with-comments",
      "notification",
    ],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PUT",
      path: "/notifications/update_user_setting",
      body: {
        notification_type: "NEW_COMMENT__NON_BYLINE_CONTRIB",
        delivery_method: "EMAIL",
        is_subscribed: false,
      },
    },
    assert: { status: 200 },
  });

  defineNotificationsCase({
    name: "PUT update user notification setting with invalid fields returns 400",
    fixtures: ["user-alice"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PUT",
      path: "/notifications/update_user_setting",
      body: {
        notification_type: "NEW_COMMENT__NON_BYLINE_CONTRIB",
        delivery_method: "BAD",
        is_subscribed: false,
      },
    },
    assert: { status: 400 },
  });
});
