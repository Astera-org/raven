import { type TestCase } from "@harness/types.ts";
import { afterAll, beforeAll, describe } from "vitest";
import {
  bootstrapWorker,
  defineCase,
  teardown,
  type WorkerHarness,
} from "../../harness/runner.ts";

describe("publications-write", () => {
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
    name: "POST create draft publication",
    fixtures: ["users-multi"],
    auth: { kind: "better-auth", as: "charlie" },
    request: {
      method: "POST",
      path: "/publications/",
      body: {
        slug: "min-12-char-slug",
        title: "New Publication",
        abstract: "Abstract.",
        body: "Body.",
      },
    },
    // publication_id_str is a freshly generated ulid, not a stable fixture id.
    maskFields: ["publication_id_str"],
    assert: { status: 201 },
  });

  definePublicationsCase({
    name: "POST create publication with missing fields returns 400",
    fixtures: ["users-multi"],
    auth: { kind: "better-auth", as: "charlie" },
    request: {
      method: "POST",
      path: "/publications/",
      body: { slug: "empty-new-pub" },
    },
    assert: { status: 400 },
  });

  definePublicationsCase({
    name: "PUT update publication as owner",
    fixtures: ["users-basic", "pub-published"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "PUT",
      path: "/publications/hello-stacks",
      body: {
        title: "Hello, Stacks (revised)",
        abstract: "Updated abstract.",
        body: "Updated body.",
      },
    },
    assert: { status: 200 },
  });

  definePublicationsCase({
    name: "PUT update publication as random user returns 403",
    fixtures: ["users-multi", "pub-published"],
    auth: { kind: "better-auth", as: "bob" },
    request: {
      method: "PUT",
      path: "/publications/hello-stacks",
      body: { title: "Hijacked" },
    },
    assert: { status: 403 },
  });

  definePublicationsCase({
    name: "POST get_or_create_draft for published pub creates draft",
    fixtures: ["users-basic", "pub-published"],
    auth: { kind: "better-auth", as: "alice" },
    request: { method: "POST", path: "/publications/hello-stacks/draft" },
    maskFields: ["publication.created_at", "publication.versions.*.created_at"],
    assert: { status: 201 },
  });

  definePublicationsCase({
    name: "DELETE draft as owner",
    fixtures: ["users-basic", "pub-draft"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "DELETE",
      path: "/publications/unpublished-draft/draft",
    },
    assert: { status: 204 },
  });

  definePublicationsCase({
    name: "DELETE publication as owner",
    fixtures: ["users-basic", "pub-published"],
    auth: { kind: "better-auth", as: "alice" },
    request: { method: "DELETE", path: "/publications/hello-stacks" },
    assert: { status: 204 },
  });

  definePublicationsCase({
    name: "DELETE publication as random user returns 403",
    fixtures: ["users-multi", "pub-published"],
    auth: { kind: "better-auth", as: "bob" },
    request: { method: "DELETE", path: "/publications/hello-stacks" },
    assert: { status: 403 },
  });

  definePublicationsCase({
    name: "POST add tags to publication",
    fixtures: ["users-basic", "pub-published"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "POST",
      path: "/publications/hello-stacks/tags",
      body: { tags: ["biology", "open-science"] },
    },
    assert: { status: 200 },
  });

  definePublicationsCase({
    name: "POST add_contrib adds a contributor",
    fixtures: ["users-multi", "pub-published"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "POST",
      path: "/publications/add_contrib",
      body: {
        slug: "hello-stacks",
        username: "bob",
        role: "Writing",
        in_byline: true,
      },
    },
    assert: { status: 200 },
  });

  definePublicationsCase({
    name: "POST remove_contrib removes a contributor",
    fixtures: ["users-multi", "pub-published"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "POST",
      path: "/publications/remove_contrib",
      body: {
        slug: "hello-stacks",
        role: "Supervision",
        user_id: 1,
      },
    },
    assert: { status: 200 },
  });

  definePublicationsCase({
    name: "POST contrib-affiliation adds an affiliation",
    fixtures: ["users-multi", "org-arcadia", "pub-draft"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "POST",
      path: "/publications/unpublished-draft/contrib-affiliation",
      body: { user_id: 1, org_slug: "arcadia-science" },
    },
    assert: { status: 200 },
  });

  definePublicationsCase({
    name: "DELETE contrib-affiliation removes an affiliation",
    fixtures: ["users-multi", "org-arcadia", "pub-draft"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "DELETE",
      path: "/publications/unpublished-draft/contrib-affiliation",
      query: { user_id: 1, org_slug: "arcadia-science" },
    },
    assert: { status: 200 },
  });

  definePublicationsCase({
    name: "POST add_org links an org to a publication",
    fixtures: ["users-multi", "org-arcadia", "pub-published"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "POST",
      path: "/publications/add_org",
      body: {
        publication_id: 1,
        org_id: 1,
        slug: "hello-stacks",
      },
    },
    assert: { status: 200 },
  });

  definePublicationsCase({
    name: "POST remove_org unlinks an org from a publication",
    fixtures: ["users-multi", "org-arcadia", "pub-published"],
    auth: { kind: "better-auth", as: "alice" },
    request: {
      method: "POST",
      path: "/publications/remove_org",
      body: { slug: "hello-stacks", org_id: 1 },
    },
    assert: { status: 200 },
  });

  // Defer: PDF generation and DataCite DOI minting hit external services
  // and are out of scope for this suite. publish/linked-assets have no
  // cases here -- they need fixtures and infra we don't have.
});
