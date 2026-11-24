import { type TestCase } from "@harness/types.ts";
import { afterAll, beforeAll, describe } from "vitest";
import {
  bootstrapWorker,
  defineCase,
  teardown,
  type WorkerHarness,
} from "../../harness/runner.ts";

const maskPubItems = [
  "items.*.id",
  "items.*.created_at",
  "items.*.updated_at",
  "items.*.owner.id",
];

describe("publications", () => {
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

  const definePublicationsCase = (testCase: TestCase) =>
    defineCase("publications", testCase, workerHarnessRef);

  definePublicationsCase({
    name: "GET list publications on empty DB returns empty result",
    fixtures: ["empty"],
    request: {
      method: "GET",
      path: "/publications",
      query: { page: 1, per_page: 10 },
    },
    assert: { status: 200 },
  });

  definePublicationsCase({
    name: "GET list publications with one published pub",
    fixtures: ["users-basic", "pub-published"],
    request: {
      method: "GET",
      path: "/publications",
      query: { page: 1, per_page: 10 },
    },
    maskFields: maskPubItems,
    assert: { status: 200 },
  });

  // ---- pagination -------------------------------------------------------
  // `pubs-multi` seeds three pubs ordered by created_at DESC (calorimetry,
  // phylogeny, neutron). Page 1 of size 2 should return the two newest;
  // page 2 should return the oldest.

  definePublicationsCase({
    name: "GET list publications page 1 of 2",
    fixtures: ["users-multi", "pubs-multi"],
    request: {
      method: "GET",
      path: "/publications",
      query: { page: 1, per_page: 2 },
    },
    maskFields: maskPubItems,
    assert: { status: 200 },
  });

  definePublicationsCase({
    name: "GET list publications page 2 of 2",
    fixtures: ["users-multi", "pubs-multi"],
    request: {
      method: "GET",
      path: "/publications",
      query: { page: 2, per_page: 2 },
    },
    maskFields: maskPubItems,
    assert: { status: 200 },
  });

  definePublicationsCase({
    name: "GET list publications page beyond end returns empty items",
    fixtures: ["users-multi", "pubs-multi"],
    request: {
      method: "GET",
      path: "/publications",
      query: { page: 99, per_page: 2 },
    },
    maskFields: maskPubItems,
    assert: { status: 200 },
  });

  // ---- search (q=) ------------------------------------------------------
  // Each seeded pub has a distinctive token in its title/abstract so we
  // can hit exactly one row, several, or none.

  definePublicationsCase({
    name: "GET list publications q=neutron returns one match",
    fixtures: ["users-multi", "pubs-multi"],
    request: {
      method: "GET",
      path: "/publications",
      query: { q: "neutron", page: 1, per_page: 10 },
    },
    maskFields: maskPubItems,
    assert: { status: 200 },
  });

  definePublicationsCase({
    name: "GET list publications q=nomatchterm returns empty",
    fixtures: ["users-multi", "pubs-multi"],
    request: {
      method: "GET",
      path: "/publications",
      query: { q: "zzzzznopematch", page: 1, per_page: 10 },
    },
    maskFields: maskPubItems,
    assert: { status: 200 },
  });

  // ---- tag filter (t=) --------------------------------------------------
  // pub 1 + pub 2 are tagged "biology"; pub 3 is "chemistry".

  definePublicationsCase({
    name: "GET list publications t=biology returns two matches",
    fixtures: ["users-multi", "pubs-multi"],
    request: {
      method: "GET",
      path: "/publications",
      query: { t: "biology", page: 1, per_page: 10 },
    },
    maskFields: maskPubItems,
    assert: { status: 200 },
  });

  definePublicationsCase({
    name: "GET list publications t=chemistry returns one match",
    fixtures: ["users-multi", "pubs-multi"],
    request: {
      method: "GET",
      path: "/publications",
      query: { t: "chemistry", page: 1, per_page: 10 },
    },
    maskFields: maskPubItems,
    assert: { status: 200 },
  });

  definePublicationsCase({
    name: "GET list publications t=unknown returns empty",
    fixtures: ["users-multi", "pubs-multi"],
    request: {
      method: "GET",
      path: "/publications",
      query: { t: "no-such-tag", page: 1, per_page: 10 },
    },
    maskFields: maskPubItems,
    assert: { status: 200 },
  });

  // ---- state filtering --------------------------------------------------
  // List endpoint joins `publications.state = 'PUBLISHED'`. A DRAFT pub
  // sitting in the same DB must not appear.

  definePublicationsCase({
    name: "GET list publications excludes drafts",
    fixtures: ["users-basic", "pub-published", "pub-draft"],
    request: {
      method: "GET",
      path: "/publications",
      query: { page: 1, per_page: 10 },
    },
    maskFields: maskPubItems,
    assert: { status: 200 },
  });
  // No query string at all -- defaults to page=1, per_page=18 per
  // `getPagination`. Locks in the default behaviour rather than
  // assuming the client always supplies the params.
  definePublicationsCase({
    name: "GET list publications with default pagination",
    fixtures: ["users-multi", "pubs-multi"],
    request: { method: "GET", path: "/publications" },
    maskFields: maskPubItems,
    assert: { status: 200 },
  });

  // per_page is hard-capped at 100. Asking for more shouldn't error;
  // the response should reflect the clamped value.
  definePublicationsCase({
    name: "GET list publications with per_page above cap",
    fixtures: ["users-multi", "pubs-multi"],
    request: {
      method: "GET",
      path: "/publications",
      query: { page: 1, per_page: 9999 },
    },
    maskFields: maskPubItems,
    assert: { status: 200 },
  });
});
