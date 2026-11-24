import { type TestCase } from "@harness/types.ts";
import { afterAll, beforeAll, describe } from "vitest";
import {
  bootstrapWorker,
  defineCase,
  teardown,
  type WorkerHarness,
} from "../../harness/runner.ts";

describe("auth", () => {
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

  const defineAuthCase = (testCase: TestCase) =>
    defineCase("auth", testCase, workerHarnessRef);

  defineAuthCase({
    name: "GET /auth/me returns the current user",
    fixtures: ["user-alice"],
    auth: { kind: "better-auth", as: "alice" },
    request: { method: "GET", path: "/auth/me" },
    maskFields: [
      "user.id",
      "user.created_at",
      "user.updated_at",
      "user.login_at",
    ],
    assert: { status: 200 },
  });

  defineAuthCase({
    name: "GET /auth/me without token returns 401",
    fixtures: ["empty"],
    request: { method: "GET", path: "/auth/me" },
    assert: { status: 401 },
  });
});
