import { escape } from "mysql2";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { itEnforcesAdminGate } from "./admin-gate.js";
import {
  endMembership,
  execute,
  expectValidationError,
  getDataciteMockCalls,
  linkOrg,
  loggedInUser,
  resetDataciteMock,
  seedOrg,
  seedOrgMember,
  seedPublication,
  seedSiteAdmin,
  type RouteCase,
  type TestApiClient,
} from "./helpers.js";

const DOI_AUDITS = "/api/v1/admin/doi-audits";

// A published publication with canonical and version DOIs the DataCite mock
// has never seen, so an audit records both as not found.
async function seedAuditedPublication(ownerId: number, slug: string) {
  const pub = await seedPublication({ ownerId, slug, state: "PUBLISHED" });
  const canonicalDoi = `10.83972/audit-${slug}`;
  const versionDoi = `${canonicalDoi}.v1`;
  await execute(
    `UPDATE publications SET doi = ${escape(canonicalDoi)} WHERE id_int = ${pub.intId}`
  );
  await execute(
    `UPDATE versions SET doi = ${escape(versionDoi)} WHERE publication_id_int = ${pub.intId}`
  );
  return { ...pub, canonicalDoi, versionDoi };
}

// An audit passes through two pg-boss queues (the fan-out, then one job per
// publication), and a worker can take a polling interval to pick up each.
async function finishedAudit(client: TestApiClient, jobId: string) {
  const deadline = Date.now() + 20_000;
  for (;;) {
    const resp = await client.get(`${DOI_AUDITS}/${jobId}`);
    expect(resp.status).toBe(200);
    if (resp.body.status !== "running") return resp;
    if (Date.now() > deadline) throw new Error("DOI audit did not finish");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function publicationIdsOf(body: { results: { publicationId: string }[] }) {
  return body.results.map((result) => result.publicationId);
}

const AUDIT_NOT_FOUND = {
  type: "application_error",
  errors: { job: { message: "DOI audit not found" } },
};

/**
 * Two orgs, each with one audited publication, plus a published publication
 * without a DOI that no audit covers.
 */
async function seedTwoOrgs(ownerId: number) {
  const ownOrg = await seedOrg("Own Org", "own-org");
  const otherOrg = await seedOrg("Other Org", "other-org");
  const ownPub = await seedAuditedPublication(ownerId, "own-pub");
  const otherPub = await seedAuditedPublication(ownerId, "other-pub");
  const noDoiPub = await seedPublication({
    ownerId,
    slug: "no-doi-pub",
    state: "PUBLISHED",
  });
  await linkOrg(ownOrg, ownPub);
  await linkOrg(otherOrg, otherPub);
  await linkOrg(ownOrg, noDoiPub);
  return { ownOrg, otherOrg, ownPub, otherPub };
}

const DOI_AUDIT_ROUTES: RouteCase<{ jobId: string }>[] = [
  {
    name: "POST /doi-audits",
    send: (client) => client.post(DOI_AUDITS),
  },
  {
    name: "GET /doi-audits/{jobId}",
    send: (client, { jobId }) => client.get(`${DOI_AUDITS}/${jobId}`),
  },
];

describe("/api/v1/admin/doi-audits authorization gate", () => {
  itEnforcesAdminGate(DOI_AUDIT_ROUTES, async () => ({
    org: await seedOrg("Target Org", "target-org"),
    target: { jobId: randomUUID() },
  }));
});

describe("v1 admin DOI audits", () => {
  it("audits every published publication with a DOI for a site admin", async () => {
    const admin = await loggedInUser("siteadmin");
    await seedSiteAdmin(admin.userId);
    const { ownPub, otherPub } = await seedTwoOrgs(admin.userId);

    const started = await admin.client.post(DOI_AUDITS);
    expect(started.status).toBe(202);
    expect(started.body).toEqual(
      expect.objectContaining({ scope: "all", status: "running" })
    );
    expect(started.body).not.toHaveProperty("ownerId");
    expect(started.body).not.toHaveProperty("publicationIds");

    const { body } = await finishedAudit(admin.client, started.body.id);
    expect(body).toEqual(
      expect.objectContaining({
        id: started.body.id,
        scope: "all",
        status: "completed",
        total: 2,
        completed: 2,
        failures: [],
        error: null,
      })
    );
    expect(publicationIdsOf(body)).toEqual(
      [ownPub.id, otherPub.id].sort((a, b) => a.localeCompare(b))
    );
    expect(body.results).toContainEqual({
      publicationId: ownPub.id,
      slug: "own-pub",
      canonicalDoi: ownPub.canonicalDoi,
      versionDoi: ownPub.versionDoi,
      canonical: {
        doi: ownPub.canonicalDoi,
        found: false,
        matches: false,
        diffs: [],
      },
      version: {
        doi: ownPub.versionDoi,
        found: false,
        matches: false,
        diffs: [],
      },
    });
    expect(body).not.toHaveProperty("ownerId");
    expect(body).not.toHaveProperty("publicationIds");
  });

  it("limits an org admin's audit to the orgs they administer", async () => {
    const admin = await loggedInUser("orgadmin");
    const { ownOrg, ownPub, otherPub } = await seedTwoOrgs(admin.userId);
    await seedOrgMember(ownOrg.orgIdInt, admin.userIds, "ADMIN");
    await resetDataciteMock();

    const started = await admin.client.post(DOI_AUDITS);
    expect(started.status).toBe(202);
    expect(started.body.scope).toBe("administered-orgs");

    const { body } = await finishedAudit(admin.client, started.body.id);
    expect(body).toEqual(
      expect.objectContaining({
        scope: "administered-orgs",
        status: "completed",
        total: 1,
        completed: 1,
      })
    );
    expect(publicationIdsOf(body)).toEqual([ownPub.id]);

    // The other org's publication is never selected, so DataCite is never
    // asked about its DOIs.
    const requestedDois = (await getDataciteMockCalls()).map(
      (call) => call.doi
    );
    expect(requestedDois).toEqual(
      expect.arrayContaining([ownPub.canonicalDoi, ownPub.versionDoi])
    );
    expect(requestedDois).not.toContain(otherPub.canonicalDoi);
    expect(requestedDois).not.toContain(otherPub.versionDoi);
  });

  it("narrows a finished audit to the orgs the caller administers now", async () => {
    const admin = await loggedInUser("orgadmin");
    const { ownOrg, otherOrg, ownPub, otherPub } = await seedTwoOrgs(
      admin.userId
    );
    await seedOrgMember(ownOrg.orgIdInt, admin.userIds, "ADMIN");
    await seedOrgMember(otherOrg.orgIdInt, admin.userIds, "ADMIN");

    const started = await admin.client.post(DOI_AUDITS);
    const { body: before } = await finishedAudit(admin.client, started.body.id);
    expect(publicationIdsOf(before)).toEqual(
      [ownPub.id, otherPub.id].sort((a, b) => a.localeCompare(b))
    );

    await endMembership(otherOrg, admin.userIds);

    const after = await admin.client.get(`${DOI_AUDITS}/${started.body.id}`);
    expect(after.status).toBe(200);
    expect(after.body).toEqual(
      expect.objectContaining({
        scope: "administered-orgs",
        total: 1,
        completed: 1,
      })
    );
    expect(publicationIdsOf(after.body)).toEqual([ownPub.id]);
  });

  it("hides another user's audit as not found", async () => {
    const siteAdmin = await loggedInUser("siteadmin");
    await seedSiteAdmin(siteAdmin.userId);
    const orgAdmin = await loggedInUser("orgadmin");
    const { ownOrg } = await seedTwoOrgs(siteAdmin.userId);
    await seedOrgMember(ownOrg.orgIdInt, orgAdmin.userIds, "ADMIN");

    const started = await siteAdmin.client.post(DOI_AUDITS);
    expect(started.status).toBe(202);

    const resp = await orgAdmin.client.get(`${DOI_AUDITS}/${started.body.id}`);
    expect(resp.status).toBe(404);
    expect(resp.body).toEqual(AUDIT_NOT_FOUND);

    // Let the run finish so its DataCite calls can't leak into the next test.
    await finishedAudit(siteAdmin.client, started.body.id);
  });

  it("returns one audit to concurrent starts by the same admin", async () => {
    const admin = await loggedInUser("siteadmin");
    await seedSiteAdmin(admin.userId);
    await seedAuditedPublication(admin.userId, "concurrent-pub");

    const [first, second] = await Promise.all([
      admin.client.post(DOI_AUDITS),
      admin.client.post(DOI_AUDITS),
    ]);

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(second.body.id).toBe(first.body.id);

    // Let the run finish so its DataCite calls can't leak into the next test.
    await finishedAudit(admin.client, first.body.id);
  });

  it("completes an audit that covers no publications", async () => {
    const admin = await loggedInUser("siteadmin");
    await seedSiteAdmin(admin.userId);

    const started = await admin.client.post(DOI_AUDITS);
    expect(started.status).toBe(202);
    expect(started.body).toEqual(
      expect.objectContaining({ total: 0, completed: 0 })
    );

    const { body } = await finishedAudit(admin.client, started.body.id);
    expect(body).toEqual(
      expect.objectContaining({
        status: "completed",
        total: 0,
        completed: 0,
        results: [],
        failures: [],
        error: null,
      })
    );
    expect(body.finishedAt).not.toBeNull();
  });

  it("returns 404 for an audit that doesn't exist", async () => {
    const admin = await loggedInUser("siteadmin");
    await seedSiteAdmin(admin.userId);

    const resp = await admin.client.get(`${DOI_AUDITS}/${randomUUID()}`);
    expect(resp.status).toBe(404);
    expect(resp.body).toEqual(AUDIT_NOT_FOUND);
  });

  it("rejects a job id that isn't a UUID", async () => {
    const admin = await loggedInUser("siteadmin");
    await seedSiteAdmin(admin.userId);

    const resp = await admin.client.get(`${DOI_AUDITS}/not-a-uuid`);
    expectValidationError(resp);
  });
});
