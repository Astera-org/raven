import {
  type AdminDoiComparisonResponse,
  type DoiComparisonType,
} from "@raven/backend-ts/types";
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
  TestApiClient,
  UNAUTHENTICATED,
  type RouteCase,
} from "./helpers.js";

const DOI_PUSHES = "/api/v1/admin/doi-pushes";
const DOI_COMPARISONS = "/api/v1/admin/doi-comparisons";
// Well-formed, but never the fingerprint of a real comparison.
const UNREVIEWED_FINGERPRINT = "0".repeat(64);

function push(
  client: TestApiClient,
  body: { type: string; doi: string; fingerprint: string }
) {
  return client.post(DOI_PUSHES).send(body);
}

// The comparison an admin reviews, and takes the fingerprint from, before
// pushing.
async function reviewComparison(
  client: TestApiClient,
  doi: string,
  type: DoiComparisonType = "canonical"
): Promise<AdminDoiComparisonResponse> {
  const resp = await client.get(DOI_COMPARISONS).query({ type, doi });
  expect(resp.status).toBe(200);
  return resp.body as AdminDoiComparisonResponse;
}

async function dataciteCallsFor(doi: string, method?: string) {
  return (await getDataciteMockCalls()).filter(
    (call) =>
      call.doi === doi && (method === undefined || call.method === method)
  );
}

const DOI_PUSH_ROUTES: RouteCase<{ doi: string }>[] = [
  {
    name: "POST /doi-pushes",
    send: (client, { doi }) =>
      push(client, {
        type: "canonical",
        doi,
        fingerprint: UNREVIEWED_FINGERPRINT,
      }),
  },
];

describe("/api/v1/admin/doi-pushes authorization gate", () => {
  // A DOI in the gate's org, so a rejection can be checked to have happened
  // before any DataCite request.
  itEnforcesAdminGate(DOI_PUSH_ROUTES, async () => {
    const owner = await registerUserWithId(makeUser("owner"));
    const org = await seedOrg("Target Org", "target-org");
    const pub = await seedComparedPublication(owner.userId, "push-gate");
    await linkOrg(org, pub);
    await resetDataciteMock();
    return {
      org,
      target: { doi: pub.canonicalDoi },
      async expectUntouched() {
        expect(await dataciteCallsFor(pub.canonicalDoi)).toEqual([]);
      },
    };
  });

  it("rejects a signed-out push before validating the body", async () => {
    const resp = await new TestApiClient()
      .post(DOI_PUSHES)
      .send({ type: "draft", doi: "not-a-doi", fingerprint: "abc" });
    expect(resp.status).toBe(401);
    expect(resp.body).toEqual(UNAUTHENTICATED);
  });
});

describe("POST /v1/admin/doi-pushes", () => {
  it.each([
    ["a fingerprint that isn't 64 hex characters", "canonical", "abc123"],
    ["an unknown type", "draft", UNREVIEWED_FINGERPRINT],
  ])("rejects %s", async (_label, type, fingerprint) => {
    const admin = await loggedInUser("siteadmin");
    await seedSiteAdmin(admin.userId);

    expectValidationError(
      await push(admin.client, { type, doi: "10.83972/x", fingerprint })
    );
  });

  it("pushes the reviewed differing fields to DataCite", async () => {
    const admin = await loggedInUser("siteadmin");
    await seedSiteAdmin(admin.userId);
    const pub = await seedComparedPublication(admin.userId, "push-ok");
    // DataCite holds exactly what The Stacks sends, except the fields this
    // fixture makes stale: title and language, which a push fixes, and url,
    // which a push never sends.
    const { stacksMetadata } = await reviewComparison(
      admin.client,
      pub.canonicalDoi
    );
    await seedDataciteRecord(pub.canonicalDoi, {
      ...stacksMetadata,
      titles: [{ title: "A Stale Title" }],
      language: "fr",
      url: "https://example.org/elsewhere",
    });
    const reviewed = await reviewComparison(admin.client, pub.canonicalDoi);
    await resetDataciteMock();

    const resp = await push(admin.client, {
      type: "canonical",
      doi: pub.canonicalDoi,
      fingerprint: reviewed.fingerprint,
    });
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({ pushedFields: ["title", "language"] });

    const puts = await dataciteCallsFor(pub.canonicalDoi, "PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0]?.status).toBe(200);
    const sent = puts[0]?.body?.data?.attributes;
    expect(sent).toEqual({
      titles: [{ lang: "en", title: "Comparison Title" }],
      language: "en",
    });
    // `event` would publish the DOI, and `url` is never pushed.
    expect(sent).not.toHaveProperty("event");
    expect(sent).not.toHaveProperty("url");

    // DataCite now agrees on everything a push can change, so a second push
    // has nothing to send.
    const after = await reviewComparison(admin.client, pub.canonicalDoi);
    expect(after.pushableFields).toEqual([]);
    const again = await push(admin.client, {
      type: "canonical",
      doi: pub.canonicalDoi,
      fingerprint: after.fingerprint,
    });
    expect(again.status).toBe(409);
    expect(again.body).toEqual({
      type: "application_error",
      errors: { root: { message: "No differing fields to push" } },
    });
  });

  it("pushes a version DOI's differing fields as a version payload", async () => {
    const admin = await loggedInUser("siteadmin");
    await seedSiteAdmin(admin.userId);
    const pub = await seedComparedPublication(admin.userId, "push-version");
    // DataCite holds exactly what The Stacks sends for the version, except the
    // fields this fixture makes stale: title, version and the relation to the
    // canonical DOI, which a push fixes, and url, which a push never sends.
    // Only a version payload carries `version` and `IsVersionOf`.
    const { stacksMetadata } = await reviewComparison(
      admin.client,
      pub.versionDoi,
      "version"
    );
    await seedDataciteRecord(pub.versionDoi, {
      ...stacksMetadata,
      titles: [{ title: "A Stale Title" }],
      version: "9",
      relatedIdentifiers: [],
      url: "https://example.org/elsewhere",
    });
    const reviewed = await reviewComparison(
      admin.client,
      pub.versionDoi,
      "version"
    );
    await resetDataciteMock();

    const resp = await push(admin.client, {
      type: "version",
      doi: pub.versionDoi,
      fingerprint: reviewed.fingerprint,
    });
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({
      pushedFields: ["title", "version", "relatedIdentifiers"],
    });

    const puts = await dataciteCallsFor(pub.versionDoi, "PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0]?.status).toBe(200);
    const sent = puts[0]?.body?.data?.attributes;
    expect(sent).toEqual({
      titles: [{ lang: "en", title: "Comparison Title" }],
      version: "1",
      relatedIdentifiers: [
        {
          relatedIdentifier: pub.canonicalDoi,
          relatedIdentifierType: "DOI",
          relationType: "IsVersionOf",
        },
      ],
    });
    // `event` would publish the DOI, and `url` is never pushed.
    expect(sent).not.toHaveProperty("event");
    expect(sent).not.toHaveProperty("url");
    expect(await dataciteCallsFor(pub.canonicalDoi, "PUT")).toEqual([]);

    const after = await reviewComparison(
      admin.client,
      pub.versionDoi,
      "version"
    );
    expect(after.pushableFields).toEqual([]);
  });

  it("returns 404 for a version DOI whose publication has no canonical DOI", async () => {
    const admin = await loggedInUser("siteadmin");
    await seedSiteAdmin(admin.userId);
    const pub = await seedComparedPublication(
      admin.userId,
      "push-no-canonical"
    );
    await execute(
      `UPDATE publications SET doi = NULL WHERE id_int = ${pub.intId}`
    );
    await resetDataciteMock();

    const resp = await push(admin.client, {
      type: "version",
      doi: pub.versionDoi,
      fingerprint: UNREVIEWED_FINGERPRINT,
    });
    expect(resp.status).toBe(404);
    expect(resp.body).toEqual({
      type: "application_error",
      errors: {
        publication: {
          message: "Publication has no canonical DOI or published version",
        },
      },
    });
    expect(await dataciteCallsFor(pub.versionDoi)).toEqual([]);
  });

  it("refuses a push whose comparison changed since it was reviewed", async () => {
    const admin = await loggedInUser("siteadmin");
    await seedSiteAdmin(admin.userId);
    const pub = await seedComparedPublication(admin.userId, "push-stale");
    await seedDataciteRecord(pub.canonicalDoi, {
      titles: [{ title: "A Stale Title" }],
    });
    const reviewed = await reviewComparison(admin.client, pub.canonicalDoi);
    // Someone edits DataCite's record after the admin reviewed the comparison.
    await seedDataciteRecord(pub.canonicalDoi, {
      titles: [{ title: "Edited Meanwhile" }],
    });
    await resetDataciteMock();

    const resp = await push(admin.client, {
      type: "canonical",
      doi: pub.canonicalDoi,
      fingerprint: reviewed.fingerprint,
    });
    expect(resp.status).toBe(409);
    expect(resp.body).toEqual({
      type: "application_error",
      errors: {
        fingerprint: {
          message:
            "This comparison changed since you reviewed it. Reload and confirm the push again.",
        },
      },
    });
    expect(await dataciteCallsFor(pub.canonicalDoi, "PUT")).toEqual([]);
  });

  it("refuses to push when DataCite has no record for the DOI", async () => {
    const admin = await loggedInUser("siteadmin");
    await seedSiteAdmin(admin.userId);
    const pub = await seedComparedPublication(admin.userId, "push-missing");
    const reviewed = await reviewComparison(admin.client, pub.canonicalDoi);
    await resetDataciteMock();

    const resp = await push(admin.client, {
      type: "canonical",
      doi: pub.canonicalDoi,
      fingerprint: reviewed.fingerprint,
    });
    expect(resp.status).toBe(409);
    expect(resp.body).toEqual({
      type: "application_error",
      errors: {
        datacite: {
          message: "Could not retrieve metadata from DataCite for this DOI",
        },
      },
    });
    expect(await dataciteCallsFor(pub.canonicalDoi, "PUT")).toEqual([]);
  });

  it("returns 404 for a DOI outside the org admin's orgs, without asking DataCite", async () => {
    const admin = await loggedInUser("orgadmin");
    const ownOrg = await seedOrg("Own Org", "own-org");
    const otherOrg = await seedOrg("Other Org", "other-org");
    await seedOrgMember(ownOrg.orgIdInt, admin.userIds, "ADMIN");
    const otherPub = await seedComparedPublication(admin.userId, "push-other");
    await linkOrg(otherOrg, otherPub);
    await resetDataciteMock();

    const resp = await push(admin.client, {
      type: "canonical",
      doi: otherPub.canonicalDoi,
      fingerprint: UNREVIEWED_FINGERPRINT,
    });
    expect(resp.status).toBe(404);
    expect(resp.body).toEqual({
      type: "application_error",
      errors: { publication: { message: "No publication found for this DOI" } },
    });
    expect(await dataciteCallsFor(otherPub.canonicalDoi)).toEqual([]);
  });
});
