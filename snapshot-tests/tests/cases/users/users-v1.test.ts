import { type TestCase } from "@harness/types.ts";
import { afterAll, beforeAll, describe } from "vitest";
import {
  bootstrapWorker,
  defineCase,
  teardown,
  type WorkerHarness,
} from "../../harness/runner.ts";

// v1's public user list and search (GET /v1/users). Search by email (exact
// or prefix) is for signed-in callers only, so anonymous callers can't check
// which emails have accounts or recover an address by prefix.

/** Matches a response body that contains no email address or `email` key. */
const NO_EMAIL = /^(?![\s\S]*(@example\.com|"email"))/;

describe("users v1", () => {
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
    name: "GET v1 list users never includes emails",
    fixtures: ["users-multi"],
    request: { method: "GET", path: "/v1/users" },
    assert: { status: 200, bodyContains: ['"username":"bob"', NO_EMAIL] },
  });

  defineUsersCase({
    name: "GET v1 search users by email when signed out matches no one",
    fixtures: ["users-multi"],
    request: {
      method: "GET",
      path: "/v1/users",
      query: { q: "bob@example.com" },
    },
    assert: { status: 200, bodyContains: ['"items":[]'] },
  });

  defineUsersCase({
    name: "GET v1 search users by email prefix when signed in",
    fixtures: ["users-multi"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "GET",
      path: "/v1/users",
      query: { q: "bob@" },
    },
    assert: { status: 200, bodyContains: ['"username":"bob"', NO_EMAIL] },
  });

  defineUsersCase({
    name: "GET v1 search users by exact email when signed in",
    fixtures: ["users-multi"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "GET",
      path: "/v1/users",
      query: { q: "bob@example.com" },
    },
    assert: { status: 200, bodyContains: ['"username":"bob"', NO_EMAIL] },
  });
});
