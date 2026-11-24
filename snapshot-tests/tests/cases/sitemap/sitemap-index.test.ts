import { type TestCase } from "@harness/types.ts";
import { afterAll, beforeAll, describe } from "vitest";
import {
  bootstrapWorker,
  defineCase,
  teardown,
  type WorkerHarness,
} from "../../harness/runner.ts";

// Sitemap responses include today's date in <lastmod>. Scrub to keep
// snapshots stable across days.
const maskLastmod = [
  {
    pattern: /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g,
    replacement: "<lastmod><<date>></lastmod>",
  },
];

describe("sitemap", () => {
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

  const defineSitemapCase = (testCase: TestCase) =>
    defineCase("sitemap", testCase, workerHarnessRef);

  defineSitemapCase({
    name: "GET sitemap index returns XML",
    fixtures: ["empty"],
    request: { method: "GET", path: "/sitemap/" },
    bodyTextReplacements: maskLastmod,
    assert: { status: 200 },
  });

  defineSitemapCase({
    name: "GET sitemap index with seeded data",
    fixtures: ["users-basic", "org-arcadia", "pub-published"],
    request: { method: "GET", path: "/sitemap/" },
    bodyTextReplacements: maskLastmod,
    assert: { status: 200 },
  });

  defineSitemapCase({
    name: "GET sitemap publications on empty DB",
    fixtures: ["empty"],
    request: { method: "GET", path: "/sitemap/publications" },
    bodyTextReplacements: maskLastmod,
    assert: { status: 200 },
  });

  defineSitemapCase({
    name: "GET sitemap publications with one published pub",
    fixtures: ["users-basic", "pub-published"],
    request: { method: "GET", path: "/sitemap/publications" },
    bodyTextReplacements: maskLastmod,
    assert: { status: 200 },
  });

  defineSitemapCase({
    name: "GET sitemap organizations on empty DB",
    fixtures: ["empty"],
    request: { method: "GET", path: "/sitemap/organizations" },
    bodyTextReplacements: maskLastmod,
    assert: { status: 200 },
  });

  defineSitemapCase({
    name: "GET sitemap organizations with one org",
    fixtures: ["org-arcadia"],
    request: { method: "GET", path: "/sitemap/organizations" },
    bodyTextReplacements: maskLastmod,
    assert: { status: 200 },
  });

  defineSitemapCase({
    name: "GET sitemap users on empty DB",
    fixtures: ["empty"],
    request: { method: "GET", path: "/sitemap/users" },
    bodyTextReplacements: maskLastmod,
    assert: { status: 200 },
  });

  defineSitemapCase({
    name: "GET sitemap users with one active user",
    fixtures: ["users-basic"],
    request: { method: "GET", path: "/sitemap/users" },
    bodyTextReplacements: maskLastmod,
    assert: { status: 200 },
  });

  // ---- exclusion variants ----------------------------------------------
  // Non-PUBLISHED publications, unlisted orgs, and non-ACTIVE users must
  // not appear in their respective sitemaps.

  defineSitemapCase({
    name: "GET sitemap publications excludes drafts",
    fixtures: ["users-basic", "pub-published", "pub-draft"],
    request: { method: "GET", path: "/sitemap/publications" },
    bodyTextReplacements: maskLastmod,
    assert: { status: 200 },
  });

  defineSitemapCase({
    name: "GET sitemap organizations excludes unlisted",
    fixtures: ["org-arcadia", "org-unlisted"],
    request: { method: "GET", path: "/sitemap/organizations" },
    bodyTextReplacements: maskLastmod,
    assert: { status: 200 },
  });
});
