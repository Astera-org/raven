import { type TestCase } from "@harness/types.ts";
import { afterAll, beforeAll, describe } from "vitest";
import {
  bootstrapWorker,
  defineCase,
  teardown,
  type WorkerHarness,
} from "../../harness/runner.ts";

// v1's public publication list (GET /v1/publications). It is unauthenticated,
// so it must only ever show published work. `pub-draft` adds a DRAFT
// publication ("Unpublished Draft", body "Draft body.") next to the published
// `hello-stacks`; the draft must never appear, whether listing or searching.

/** Matches a response body that never mentions the draft publication. */
const NO_DRAFT = /^(?![\s\S]*(unpublished-draft|Unpublished Draft|"DRAFT"))/;

describe("publications v1 list", () => {
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

  const defineListCase = (testCase: TestCase) =>
    defineCase("publications", testCase, workerHarnessRef);

  defineListCase({
    name: "GET v1 list publications excludes drafts",
    fixtures: ["users-basic", "pub-published", "pub-draft"],
    request: { method: "GET", path: "/v1/publications" },
    assert: {
      status: 200,
      bodyContains: ['"slug":"hello-stacks"', '"total":1', NO_DRAFT],
    },
  });

  // The full-text search covers version bodies, so without the state filter
  // anyone could probe the text of unpublished drafts.
  defineListCase({
    name: "GET v1 list publications search does not match drafts",
    fixtures: ["users-basic", "pub-published", "pub-draft"],
    request: {
      method: "GET",
      path: "/v1/publications",
      query: { q: "draft" },
    },
    assert: { status: 200, bodyContains: ['"total":0', NO_DRAFT] },
  });

  defineListCase({
    name: "GET v1 list publications search still matches published work",
    fixtures: ["users-basic", "pub-published", "pub-draft"],
    request: {
      method: "GET",
      path: "/v1/publications",
      query: { q: "stacks" },
    },
    assert: {
      status: 200,
      bodyContains: ['"slug":"hello-stacks"', '"total":1', NO_DRAFT],
    },
  });
});
