import { escape } from "mysql2";
import { describe, expect, it } from "vitest";
import { itEnforcesAdminGate } from "./admin-gate.js";
import {
  execute,
  expectValidationError,
  getDataciteMockCalls,
  linkOrg,
  loggedInUser,
  makeUser,
  registerUserWithId,
  resetDataciteMock,
  seedComparedPublication,
  seedDataciteRecord,
  seedOrg,
  seedOrgMember,
  seedSiteAdmin,
  type RouteCase,
  type TestApiClient,
} from "./helpers.js";

const DOI_COMPARISONS = "/api/v1/admin/doi-comparisons";

function compare(client: TestApiClient, type: string, doi: string) {
  return client.get(DOI_COMPARISONS).query({ type, doi });
}

async function requestedDois() {
  return (await getDataciteMockCalls()).map((call) => call.doi);
}

const PUBLICATION_NOT_FOUND = {
  type: "application_error",
  errors: { publication: { message: "No publication found for this DOI" } },
};

const DOI_COMPARISON_ROUTES: RouteCase<{ doi: string }>[] = [
  {
    name: "GET /doi-comparisons",
    send: (client, { doi }) => compare(client, "canonical", doi),
  },
];

describe("/api/v1/admin/doi-comparisons authorization gate", () => {
  // A DOI in the gate's org, so a rejection can be checked to have happened
  // before any DataCite request.
  itEnforcesAdminGate(DOI_COMPARISON_ROUTES, async () => {
    const owner = await registerUserWithId(makeUser("owner"));
    const org = await seedOrg("Target Org", "target-org");
    const pub = await seedComparedPublication(owner.userId, "gate-pub");
    await linkOrg(org, pub);
    await resetDataciteMock();
    return {
      org,
      target: { doi: pub.canonicalDoi },
      async expectUntouched() {
        expect(await requestedDois()).not.toContain(pub.canonicalDoi);
      },
    };
  });
});

describe("GET /v1/admin/doi-comparisons", () => {
  it.each([
    ["an unknown type", "draft", "10.83972/x"],
    ["a value that isn't a DOI", "canonical", "not-a-doi"],
  ])("rejects %s", async (_label, type, doi) => {
    const admin = await loggedInUser("siteadmin");
    await seedSiteAdmin(admin.userId);

    expectValidationError(await compare(admin.client, type, doi));
  });

  it("compares a canonical DOI for a site admin", async () => {
    const admin = await loggedInUser("siteadmin");
    await seedSiteAdmin(admin.userId);
    const org = await seedOrg("Own Org", "own-org");
    const pub = await seedComparedPublication(admin.userId, "site-canonical");
    await linkOrg(org, pub);
    await resetDataciteMock();

    const resp = await compare(admin.client, "canonical", pub.canonicalDoi);
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({
      publicationId: pub.id,
      slug: "site-canonical",
      orgName: "Own Org",
      type: "canonical",
      doi: pub.canonicalDoi,
      found: false,
      matches: false,
      diffs: [],
      stacksMetadata: expect.objectContaining({
        titles: expect.arrayContaining([
          expect.objectContaining({ title: "Comparison Title" }),
        ]),
      }),
      dataciteMetadata: null,
      text: `=== ${pub.canonicalDoi} ===\n\nDataCite record unavailable\n`,
      pushableFields: [],
      dataciteUrl: expect.stringMatching(
        new RegExp(`/dois/${encodeURIComponent(pub.canonicalDoi)}$`)
      ),
      fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(await requestedDois()).toContain(pub.canonicalDoi);
  });

  it("reports the differing fields when DataCite has a record", async () => {
    const admin = await loggedInUser("siteadmin");
    await seedSiteAdmin(admin.userId);
    const pub = await seedComparedPublication(admin.userId, "datacite-found");
    // Stale where a push would fix it (title, language), and different where
    // it never pushes (url).
    await seedDataciteRecord(pub.canonicalDoi, {
      titles: [{ title: "A Stale Title" }],
      language: "fr",
      url: "https://example.org/elsewhere",
    });

    const resp = await compare(admin.client, "canonical", pub.canonicalDoi);
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual(
      expect.objectContaining({
        doi: pub.canonicalDoi,
        found: true,
        matches: false,
        dataciteMetadata: expect.objectContaining({
          titles: [{ title: "A Stale Title" }],
          language: "fr",
          url: "https://example.org/elsewhere",
        }),
        fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      })
    );
    expect(resp.body.diffs).toContainEqual({
      field: "title",
      expected: "Comparison Title",
      actual: "A Stale Title",
    });
    expect(resp.body.diffs).toContainEqual({
      field: "language",
      expected: "en",
      actual: "fr",
    });
    expect(resp.body.diffs).toContainEqual({
      field: "url",
      expected: expect.stringContaining("/publications/datacite-found"),
      actual: "https://example.org/elsewhere",
    });
    expect(resp.body.pushableFields).toEqual(
      expect.arrayContaining(["title", "language"])
    );
    expect(resp.body.pushableFields).not.toContain("url");
    expect(resp.body.text).toContain(
      "title\n\nThe Stacks:\nComparison Title\n\nDataCite:\nA Stale Title"
    );
  });

  it("compares the latest version's DOI", async () => {
    const admin = await loggedInUser("siteadmin");
    await seedSiteAdmin(admin.userId);
    const pub = await seedComparedPublication(admin.userId, "site-version");
    await resetDataciteMock();

    const resp = await compare(admin.client, "version", pub.versionDoi);
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual(
      expect.objectContaining({
        publicationId: pub.id,
        orgName: null,
        type: "version",
        doi: pub.versionDoi,
        found: false,
      })
    );
    expect(await requestedDois()).toContain(pub.versionDoi);
  });

  it("returns 404 for a version DOI that isn't the latest version's", async () => {
    const admin = await loggedInUser("siteadmin");
    await seedSiteAdmin(admin.userId);
    const pub = await seedComparedPublication(admin.userId, "old-version");
    await execute(
      `INSERT INTO versions (publication_id_int, version_number, title, version_desc, doi, state) VALUES (${pub.intId}, 2, 'Comparison Title', 'Second version.', ${escape(`${pub.canonicalDoi}.2`)}, 'PUBLISHED')`
    );

    const resp = await compare(admin.client, "version", pub.versionDoi);
    expect(resp.status).toBe(404);
    expect(resp.body).toEqual({
      type: "application_error",
      errors: {
        doi: {
          message:
            "This DOI is not the publication's current latest version DOI",
        },
      },
    });
  });

  it("expects every published version's contributors on the canonical DOI, and only the latest's on the version DOI", async () => {
    const admin = await loggedInUser("siteadmin");
    await seedSiteAdmin(admin.userId);
    const bob = await registerUserWithId(makeUser("bobcmp"));
    const pub = await seedComparedPublication(admin.userId, "creator-union");
    // v2's byline replaces the v1 author with bob, so the union differs from
    // either version's own byline.
    const v2 = await execute(
      `INSERT INTO versions (publication_id_int, version_number, title, version_desc, doi, state) VALUES (${pub.intId}, 2, 'Comparison Title', 'Second version.', ${escape(`${pub.canonicalDoi}.2`)}, 'PUBLISHED')`
    );
    await execute(
      `INSERT INTO contributors (version_id_int, user_id_int, roles, in_byline, priority) VALUES (${v2.insertId}, ${bob.userId}, '["Writing"]', true, 1)`
    );

    const creatorNames = (resp: { body: { stacksMetadata: unknown } }) =>
      (
        resp.body.stacksMetadata as { creators: Array<{ name: string }> }
      ).creators.map((creator) => creator.name);

    const canonical = await compare(
      admin.client,
      "canonical",
      pub.canonicalDoi
    );
    expect(canonical.status).toBe(200);
    expect(creatorNames(canonical)).toEqual([
      "User, Bobcmp",
      "User, Siteadmin",
    ]);

    const version = await compare(
      admin.client,
      "version",
      `${pub.canonicalDoi}.2`
    );
    expect(version.status).toBe(200);
    expect(creatorNames(version)).toEqual(["User, Bobcmp"]);
  });

  it("compares a removed publication's DOI", async () => {
    const admin = await loggedInUser("siteadmin");
    await seedSiteAdmin(admin.userId);
    const pub = await seedComparedPublication(admin.userId, "removed-pub");
    await execute(
      `UPDATE publications SET state = 'DELETED' WHERE id_int = ${pub.intId}`
    );

    const resp = await compare(admin.client, "canonical", pub.canonicalDoi);
    expect(resp.status).toBe(200);
    expect(resp.body.publicationId).toBe(pub.id);
  });

  it.each([
    ["a draft publication's DOI", "DRAFT"],
    ["an unknown DOI", null],
  ])("returns 404 for %s", async (_label, state) => {
    const admin = await loggedInUser("siteadmin");
    await seedSiteAdmin(admin.userId);
    const doi = state
      ? (await seedComparedPublication(admin.userId, "draft-pub", state))
          .canonicalDoi
      : "10.83972/cmp-unknown";

    const resp = await compare(admin.client, "canonical", doi);
    expect(resp.status).toBe(404);
    expect(resp.body).toEqual(PUBLICATION_NOT_FOUND);
  });

  // orgName is the org with the lowest priority. MySQL sorts NULL before any
  // number in ascending order, and v0's lookup relied on that.
  it.each([
    {
      label: "the lowest priority",
      links: [
        { name: "Second Org", priority: 2 },
        { name: "First Org", priority: 1 },
      ],
      expected: "First Org",
    },
    {
      label: "a null priority ahead of any number",
      links: [
        { name: "Ranked Org", priority: 0 },
        { name: "Unranked Org", priority: null },
      ],
      expected: "Unranked Org",
    },
  ])("names the org with $label as orgName", async ({ links, expected }) => {
    const admin = await loggedInUser("siteadmin");
    await seedSiteAdmin(admin.userId);
    const pub = await seedComparedPublication(admin.userId, "primary-org");
    for (const [index, { name, priority }] of links.entries()) {
      const org = await seedOrg(name, `primary-org-${index}`);
      await execute(
        `INSERT INTO org_publication_map (org_id_int, org_id, publication_id_int, publication_id, priority) VALUES (${org.orgIdInt}, ${escape(org.orgId)}, ${pub.intId}, ${escape(pub.id)}, ${priority ?? "NULL"})`
      );
    }

    const resp = await compare(admin.client, "canonical", pub.canonicalDoi);
    expect(resp.status).toBe(200);
    expect(resp.body.orgName).toBe(expected);
  });

  it("compares a DOI in the org admin's own org", async () => {
    const admin = await loggedInUser("orgadmin");
    const org = await seedOrg("Own Org", "own-org");
    await seedOrgMember(org.orgIdInt, admin.userIds, "ADMIN");
    const pub = await seedComparedPublication(admin.userId, "own-pub");
    await linkOrg(org, pub);

    const resp = await compare(admin.client, "canonical", pub.canonicalDoi);
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual(
      expect.objectContaining({ publicationId: pub.id, orgName: "Own Org" })
    );
  });

  it("returns 404 for a DOI outside the org admin's orgs, without asking DataCite", async () => {
    const admin = await loggedInUser("orgadmin");
    const ownOrg = await seedOrg("Own Org", "own-org");
    const otherOrg = await seedOrg("Other Org", "other-org");
    await seedOrgMember(ownOrg.orgIdInt, admin.userIds, "ADMIN");
    const otherPub = await seedComparedPublication(admin.userId, "other-pub");
    await linkOrg(otherOrg, otherPub);
    await resetDataciteMock();

    for (const [type, doi] of [
      ["canonical", otherPub.canonicalDoi],
      ["version", otherPub.versionDoi],
    ] as const) {
      const resp = await compare(admin.client, type, doi);
      expect(resp.status).toBe(404);
      expect(resp.body).toEqual(PUBLICATION_NOT_FOUND);
    }
    expect(await requestedDois()).not.toContain(otherPub.canonicalDoi);
    expect(await requestedDois()).not.toContain(otherPub.versionDoi);
  });
});
