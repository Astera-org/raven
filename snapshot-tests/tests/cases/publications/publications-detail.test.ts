import { type TestCase } from "@harness/types.ts";
import { afterAll, beforeAll, describe } from "vitest";
import {
  bootstrapWorker,
  defineCase,
  teardown,
  type WorkerHarness,
} from "../../harness/runner.ts";

describe("publications-detail", () => {
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
    name: "GET publication by slug returns publication",
    fixtures: ["users-basic", "pub-published"],
    request: { method: "GET", path: "/publications/hello-stacks" },
    maskFields: [
      "publication.id",
      "publication.created_at",
      "publication.updated_at",
      "publication.owner.id",
      "publication.versions.*.id",
      "publication.versions.*.created_at",
      "publication.versions.*.updated_at",
    ],
    assert: { status: 200 },
  });

  definePublicationsCase({
    name: "GET publication by unknown slug returns 404",
    fixtures: ["empty"],
    request: { method: "GET", path: "/publications/no-such-pub" },
    assert: { status: 404 },
  });

  definePublicationsCase({
    name: "GET publication v1 returns version",
    fixtures: ["users-basic", "pub-published"],
    request: { method: "GET", path: "/publications/hello-stacks/v1" },
    maskFields: [
      "publication.id",
      "publication.created_at",
      "publication.updated_at",
      "publication.owner.id",
      "publication.versions.*.id",
      "publication.versions.*.created_at",
      "publication.versions.*.updated_at",
    ],
    assert: { status: 200 },
  });

  definePublicationsCase({
    name: "GET publication v999 returns 404",
    fixtures: ["users-basic", "pub-published"],
    request: { method: "GET", path: "/publications/hello-stacks/v999" },
    assert: { status: 404 },
  });

  // Default (no /v<n>) returns the latest version (v2). /v1 returns the
  // historical version. Distinct titles per version make the snapshot
  // diff trivial.

  definePublicationsCase({
    name: "GET publication on multi-version pub returns latest",
    fixtures: ["users-basic", "pub-multi-version"],
    request: { method: "GET", path: "/publications/multi-version" },
    maskFields: [
      "publication.id",
      "publication.created_at",
      "publication.updated_at",
      "publication.owner.id",
      "publication.versions.*.id",
      "publication.versions.*.created_at",
      "publication.versions.*.updated_at",
    ],
    assert: { status: 200 },
  });

  definePublicationsCase({
    name: "GET publication v1 on multi-version pub returns first version",
    fixtures: ["users-basic", "pub-multi-version"],
    request: { method: "GET", path: "/publications/multi-version/v1" },
    maskFields: [
      "publication.id",
      "publication.created_at",
      "publication.updated_at",
      "publication.owner.id",
      "publication.versions.*.id",
      "publication.versions.*.created_at",
      "publication.versions.*.updated_at",
    ],
    assert: { status: 200 },
  });

  definePublicationsCase({
    name: "GET publication v2 on multi-version pub returns second version",
    fixtures: ["users-basic", "pub-multi-version"],
    request: { method: "GET", path: "/publications/multi-version/v2" },
    maskFields: [
      "publication.id",
      "publication.created_at",
      "publication.updated_at",
      "publication.owner.id",
      "publication.versions.*.id",
      "publication.versions.*.created_at",
      "publication.versions.*.updated_at",
    ],
    assert: { status: 200 },
  });

  // A DRAFT publication should look like "not found" to an unauthenticated
  // viewer. Locks in that DRAFT pubs aren't accidentally exposed via the
  // public detail endpoint.
  definePublicationsCase({
    name: "GET draft publication unauthenticated returns 403 or 404",
    fixtures: ["users-basic", "pub-draft"],
    request: { method: "GET", path: "/publications/unpublished-draft" },
  });
  definePublicationsCase({
    name: "GET publication user_perms unauthenticated returns empty",
    fixtures: ["users-basic", "pub-published"],
    request: { method: "GET", path: "/publications/hello-stacks/user_perms" },
    assert: { status: 200 },
  });

  definePublicationsCase({
    name: "GET publication user_perms for unknown slug returns 404",
    fixtures: ["empty"],
    request: { method: "GET", path: "/publications/no-such-pub/user_perms" },
    assert: { status: 404 },
  });

  definePublicationsCase({
    name: "GET publications RSS for unknown org returns 404 or empty feed",
    fixtures: ["empty"],
    request: { method: "GET", path: "/publications/rss/no-such-org" },
  });

  definePublicationsCase({
    name: "GET publications RSS with seeded org and pub",
    fixtures: ["users-basic", "org-arcadia", "pub-published"],
    request: { method: "GET", path: "/publications/rss/arcadia-science" },
    bodyTextReplacements: [
      {
        pattern: /<lastBuildDate>[^<]+<\/lastBuildDate>/g,
        replacement: "<lastBuildDate><<date>></lastBuildDate>",
      },
      {
        pattern: /<pubDate>[^<]+<\/pubDate>/g,
        replacement: "<pubDate><<date>></pubDate>",
      },
    ],
    assert: { status: 200 },
  });

  // RSS for an org whose publications haven't been linked still produces
  // a valid empty feed (not a 404), since the org exists.
  definePublicationsCase({
    name: "GET publications RSS for org with no publications",
    fixtures: ["org-arcadia"],
    request: { method: "GET", path: "/publications/rss/arcadia-science" },
    bodyTextReplacements: [
      {
        pattern: /<lastBuildDate>[^<]+<\/lastBuildDate>/g,
        replacement: "<lastBuildDate><<date>></lastBuildDate>",
      },
      {
        pattern: /<pubDate>[^<]+<\/pubDate>/g,
        replacement: "<pubDate><<date>></pubDate>",
      },
    ],
    maskFields: [],
    assert: { status: 200 },
  });

  definePublicationsCase({
    name: "GET draft publication as owner",
    fixtures: ["users-basic", "pub-draft"],
    auth: { kind: "better-auth", as: "alice" },
    request: { method: "GET", path: "/publications/unpublished-draft/draft" },
    maskFields: ["publication.created_at", "publication.updated_at"],
    assert: { status: 200 },
  });

  definePublicationsCase({
    name: "GET my drafts when one exists",
    fixtures: ["users-basic", "pub-draft"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "GET",
      path: "/publications/my/drafts",
      query: { page: 1, per_page: 10 },
    },
    maskFields: ["items.*.created_at"],
    assert: { status: 200 },
  });

  definePublicationsCase({
    name: "GET my drafts when none exist",
    fixtures: ["user-alice"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "GET",
      path: "/publications/my/drafts",
      query: { page: 1, per_page: 10 },
    },
    assert: { status: 200 },
  });

  definePublicationsCase({
    name: "GET potential_orgs lists orgs the user belongs to",
    fixtures: ["users-multi", "org-arcadia", "org-with-members", "pub-draft"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "GET",
      path: "/publications/potential_orgs",
      query: { slug: "unpublished-draft" },
    },
    assert: { status: 200 },
  });
});
