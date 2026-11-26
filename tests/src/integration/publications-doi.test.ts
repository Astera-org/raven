/**
 * DOI-minting integration tests for the publish flow. These hit a mocked
 * DataCite API (see docker-compose.test.yml's datacite-mock service and
 * datacite-mock/server.js) instead of the real DataCite service.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  type DataciteMockCall,
  execute,
  getDataciteMockCalls,
  makeUser,
  query,
  registerUser,
  registerUserWithId,
  resetDataciteMock,
  seedDoiMintingOrg,
  seedOrgMember,
  seedSiteAdmin,
  TestApiClient,
} from "./helpers.js";

// A freshly auto-generated canonical DOI, e.g. "10.83972/mock-1".
const CANONICAL_DOI_PATTERN = /^10\.83972\/mock-\d+$/;
// A version DOI derived from a canonical DOI's suffix, e.g. "10.83972/mock-1.2".
const VERSION_DOI_PATTERN = /^10\.83972\/mock-\d+\.\d+$/;
// A DOI on a prefix distinct from the mock's own ("10.83972") - as if a user
// supplied it at publication-creation time and it belongs to a different
// DataCite account.
const FOREIGN_DOI = "10.5555/external-canonical-doi";

function attrs(
  call: DataciteMockCall | undefined
): Record<string, unknown> | undefined {
  return call?.body?.data?.attributes;
}

beforeEach(async () => {
  // Every test starts from a clean call log, regardless of what a previous
  // test in this file left behind.
  await resetDataciteMock();
});

describe("DOI minting on publish (org has doi_minting_enabled = true)", () => {
  it("mints a canonical DOI and a version DOI for a brand-new publication", async () => {
    const { client, user, userId, userIds } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);

    const { orgIdInt: orgId } = await seedDoiMintingOrg(
      "Minting Org",
      "minting-org-slug"
    );
    await seedOrgMember(orgId, userIds);

    const createResp = await client.post("/api/publications").send({
      slug: "doi-mint-new-pub",
      title: "DOI Mint New Pub",
      subtitle: "Subtitle text.",
      abstract: "Abstract text.",
      body: "Body text.",
    });
    expect(createResp.status).toBe(201);
    const addOrgResp = await client
      .post("/api/publications/add_org")
      .send({ slug: "doi-mint-new-pub", org_id: orgId });
    expect(addOrgResp.status).toBe(200);
    // Publishing requires at least one byline contributor.
    await client.post("/api/publications/add_contrib").send({
      slug: "doi-mint-new-pub",
      username: user.username,
      role: "author",
      in_byline: true,
    });

    await resetDataciteMock();
    const publishResp = await client.post(
      "/api/publications/doi-mint-new-pub/publish"
    );
    expect(publishResp.status).toBe(200);
    expect(publishResp.body.doi).toMatch(CANONICAL_DOI_PATTERN);
    expect(publishResp.body.version_doi).toMatch(VERSION_DOI_PATTERN);
    expect(publishResp.body.doi).not.toBe(publishResp.body.version_doi);

    const pubRows = await query<{ doi: string | null }>(
      `SELECT doi FROM publications WHERE slug = 'doi-mint-new-pub'`
    );
    expect(pubRows[0]!.doi).toBe(publishResp.body.doi);
    const versionRows = await query<{ doi: string | null }>(
      `SELECT doi FROM versions WHERE publication_id_int = (SELECT id_int FROM publications WHERE slug = 'doi-mint-new-pub') AND version_number = 1`
    );
    expect(versionRows[0]!.doi).toBe(publishResp.body.version_doi);

    // mintDoisForNewPub -> mintDois(): POST the canonical DOI (auto-generated
    // under our prefix, since none exists yet), POST the version DOI
    // (deterministically derived from the canonical's suffix), then PUT the
    // canonical DOI to fold the new version into its metadata.
    const calls = await getDataciteMockCalls();
    expect(calls.map((c) => c.method)).toEqual(["POST", "POST", "PUT"]);
    expect(attrs(calls[0])?.["prefix"]).toBe("10.83972");
    expect(attrs(calls[0])?.["titles"]).toEqual([
      { lang: "en", title: "DOI Mint New Pub" },
      { lang: "en", title: "Subtitle text.", titleType: "Subtitle" },
    ]);
    expect(attrs(calls[1])?.["doi"]).toBe(publishResp.body.version_doi);
    expect(calls[2]!.doi).toBe(publishResp.body.doi);

    // Every one of these payloads (the initial canonical create, the
    // version's own record, and the canonical's own follow-up update)
    // carries only an Issued date, dated today - there's no prior version
    // yet to be "Updated".
    const today = new Date().toISOString().slice(0, 10);
    for (const call of calls) {
      expect(attrs(call)?.["dates"]).toEqual([
        { date: today, dateType: "Issued" },
      ]);
    }
  });

  it("does not mint when the account cannot access the canonical DOI's prefix", async () => {
    const { client, user, userId, userIds } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);

    const { orgIdInt: orgId } = await seedDoiMintingOrg(
      "Foreign Canonical Org",
      "foreign-canonical-org"
    );
    await seedOrgMember(orgId, userIds);

    // The publication is created with a canonical DOI the user already
    // has, on a prefix Raven's configured DataCite account does not
    // control. Version 1 itself has no DOI yet.
    const createResp = await client.post("/api/publications").send({
      slug: "doi-foreign-canonical-pub",
      title: "DOI Foreign Canonical Pub",
      abstract: "Abstract text.",
      body: "Body text.",
      doi: FOREIGN_DOI,
    });
    expect(createResp.status).toBe(201);
    await client
      .post("/api/publications/add_org")
      .send({ slug: "doi-foreign-canonical-pub", org_id: orgId });
    // Publishing requires at least one byline contributor.
    await client.post("/api/publications/add_contrib").send({
      slug: "doi-foreign-canonical-pub",
      username: user.username,
      role: "author",
      in_byline: true,
    });

    await resetDataciteMock();
    const publishResp = await client.post(
      "/api/publications/doi-foreign-canonical-pub/publish"
    );
    // Publishing itself still succeeds - a DOI-minting failure is logged,
    // not fatal (see the try/catch around the minting block in the route).
    expect(publishResp.status).toBe(200);
    expect(publishResp.body.doi).toBe(FOREIGN_DOI);
    expect(publishResp.body.version_doi).toBeNull();

    const pubRows = await query<{ doi: string | null; state: string }>(
      `SELECT doi, state FROM publications WHERE slug = 'doi-foreign-canonical-pub'`
    );
    expect(pubRows[0]!.state).toBe("PUBLISHED");
    expect(pubRows[0]!.doi).toBe(FOREIGN_DOI);
    const versionRows = await query<{ doi: string | null }>(
      `SELECT doi FROM versions WHERE publication_id_int = (SELECT id_int FROM publications WHERE slug = 'doi-foreign-canonical-pub') AND version_number = 1`
    );
    expect(versionRows[0]!.doi).toBeNull();

    // mintDoiForNewVersion probes write access to the canonical DOI first
    // (a no-op PUT with empty attributes) before ever attempting to mint
    // anything. The mock rejects it, since FOREIGN_DOI's prefix is not our
    // own - so minting is skipped entirely, and no POST is ever attempted.
    const calls = await getDataciteMockCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("PUT");
    expect(calls[0]!.doi).toBe(FOREIGN_DOI);
    expect(calls[0]!.status).toBe(403);
  });

  it("does not mint when the DOI is changed to an inaccessible foreign DOI prefix", async () => {
    const { client, user, userId, userIds } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);

    const { orgIdInt: orgId } = await seedDoiMintingOrg(
      "Foreign Canonical Org",
      "foreign-canonical-org"
    );
    await seedOrgMember(orgId, userIds);

    const createResp = await client.post("/api/publications").send({
      slug: "doi-foreign-canonical-pub",
      title: "DOI Foreign Canonical Pub",
      abstract: "Abstract text.",
      body: "Body text.",
    });
    expect(createResp.status).toBe(201);
    await client
      .post("/api/publications/add_org")
      .send({ slug: "doi-foreign-canonical-pub", org_id: orgId });
    // Publishing requires at least one byline contributor.
    await client.post("/api/publications/add_contrib").send({
      slug: "doi-foreign-canonical-pub",
      username: user.username,
      role: "author",
      in_byline: true,
    });
    // Set the DOI after creation

    await resetDataciteMock();

    const updateResponse1 = await client
      .put("/api/publications/doi-foreign-canonical-pub")
      .send({
        title: "DOI Foreign Canonical Pub, late set",
        abstract: "Abstract text.",
        body: "Body text.",
      });
    expect(updateResponse1.status).toBe(200);

    // Update triggers DOI minting: canonical via prefix-based auto-generation, then version via deterministic DOI.
    let calls = await getDataciteMockCalls();
    expect(calls.map((c) => c.method)).toEqual(["POST", "POST", "PUT"]);
    expect(attrs(calls[0])?.["prefix"]).toBe("10.83972");
    expect(attrs(calls[0])?.["titles"]).toEqual([
      {
        lang: "en",
        title: "DOI Foreign Canonical Pub, late set",
      },
    ]);
    expect(attrs(calls[0])?.["doi"]).toBeUndefined();
    expect(attrs(calls[1])?.["doi"]).toMatch(VERSION_DOI_PATTERN);
    expect(attrs(calls[2])?.["doi"]).toBeUndefined();
    await resetDataciteMock();

    const updateResponse2 = await client
      .put("/api/publications/doi-foreign-canonical-pub")
      .send({
        title: "DOI Foreign Canonical Pub, late set",
        abstract: "Abstract text.",
        body: "Body text.",
        doi: FOREIGN_DOI,
      });
    expect(updateResponse2.status).toBe(200);
    const publishResp = await client.post(
      "/api/publications/doi-foreign-canonical-pub/publish"
    );
    // Publishing itself still succeeds - a DOI-minting failure is logged,
    // not fatal (see the try/catch around the minting block in the route).
    expect(publishResp.status).toBe(200);
    expect(publishResp.body.doi).toBe(FOREIGN_DOI);
    expect(publishResp.body.version_doi).toBeNull();

    const pubRows = await query<{ doi: string | null; state: string }>(
      `SELECT doi, state FROM publications WHERE slug = 'doi-foreign-canonical-pub'`
    );
    expect(pubRows[0]!.state).toBe("PUBLISHED");
    expect(pubRows[0]!.doi).toBe(FOREIGN_DOI);
    const versionRows = await query<{ doi: string | null }>(
      `SELECT doi FROM versions WHERE publication_id_int = (SELECT id_int FROM publications WHERE slug = 'doi-foreign-canonical-pub') AND version_number = 1`
    );
    expect(versionRows[0]!.doi).toBeNull();

    // mintDoiForNewVersion probes write access to the canonical DOI first
    // (a no-op PUT with empty attributes) before ever attempting to mint
    // anything. The mock rejects it, since FOREIGN_DOI's prefix is not our
    // own, so the DOIs are left in DRAFT and not made findable.
    calls = await getDataciteMockCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("PUT");
    expect(calls[0]!.doi).toBe(FOREIGN_DOI);
    expect(calls[0]!.status).toBe(403);
  });
});

describe("DOI minting and metadata updates on a new version's publish", () => {
  it("mints a new version DOI and updates the canonical DOI's metadata", async () => {
    const { client, user, userId, userIds } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);

    const { orgIdInt: orgId } = await seedDoiMintingOrg(
      "New Version Minting Org",
      "new-version-minting-org"
    );
    await seedOrgMember(orgId, userIds);

    await client.post("/api/publications").send({
      slug: "doi-new-version-pub",
      title: "DOI New Version Pub",
      subtitle: "Subtitle text.",
      abstract: "Abstract text.",
      body: "Body text.",
    });
    await client
      .post("/api/publications/add_org")
      .send({ slug: "doi-new-version-pub", org_id: orgId });
    // Publishing requires at least one byline contributor.
    await client.post("/api/publications/add_contrib").send({
      slug: "doi-new-version-pub",
      username: user.username,
      role: "author",
      in_byline: true,
    });

    const v1Publish = await client.post(
      "/api/publications/doi-new-version-pub/publish"
    );
    expect(v1Publish.status).toBe(200);
    const canonicalDoi = v1Publish.body.doi;
    const v1VersionDoi = v1Publish.body.version_doi;
    expect(canonicalDoi).toMatch(CANONICAL_DOI_PATTERN);
    expect(v1VersionDoi).toMatch(VERSION_DOI_PATTERN);

    // Creating a new draft version, and editing it while it stays a draft,
    // must not touch DataCite at all - the canonical DOI's metadata is only
    // updated once the new version is actually published, below.
    await resetDataciteMock();
    const draftResp = await client.post(
      "/api/publications/doi-new-version-pub/draft"
    );
    expect(draftResp.status).toBe(201);
    expect(draftResp.body.publication.version_number).toBe(2);
    expect(await getDataciteMockCalls()).toHaveLength(0);

    const updateResp = await client
      .put("/api/publications/doi-new-version-pub")
      .send({
        // DOI can only change while drafting, so an unchanged publication
        // must echo its existing (canonical) DOI back, or the route treats
        // the omission as an attempted clear and rejects the update.
        doi: canonicalDoi,
        subtitle: "Updated subtitle text.",
        abstract: "Updated abstract text.",
        version_desc: "Fixed a typo.",
      });
    expect(updateResp.status).toBe(200);
    expect(await getDataciteMockCalls()).toHaveLength(0);

    await resetDataciteMock();
    const v2Publish = await client
      .post("/api/publications/doi-new-version-pub/publish")
      .send({ note: "New version please!" });
    expect(v2Publish.status).toBe(200);
    expect(v2Publish.body.version_number).toBe(2);
    // The canonical DOI is unchanged; a new, distinct version DOI is minted.
    expect(v2Publish.body.doi).toBe(canonicalDoi);
    expect(v2Publish.body.version_doi).toMatch(VERSION_DOI_PATTERN);
    expect(v2Publish.body.version_doi).not.toBe(v1VersionDoi);
    const v2VersionDoi = v2Publish.body.version_doi;

    const v2Rows = await query<{ doi: string | null }>(
      `SELECT doi FROM versions WHERE publication_id_int = (SELECT id_int FROM publications WHERE slug = 'doi-new-version-pub') AND version_number = 2`
    );
    expect(v2Rows[0]!.doi).toBe(v2VersionDoi);

    // mintDoiForNewVersion -> mintDois(): POST the new version's DOI, then
    // PUT the *existing* canonical DOI to fold the new version into its
    // metadata (relatedIdentifiers gains a HasVersion entry for it), then
    // GET the previous (v1) version's own DOI record and PUT it back to add
    // an IsPreviousVersionOf back-link to v2.
    let calls = await getDataciteMockCalls();
    expect(calls.map((c) => c.method)).toEqual(["POST", "PUT", "GET", "PUT"]);
    expect(attrs(calls[0])?.["version"]).toBe("2");
    expect(calls[1]!.doi).toBe(canonicalDoi);
    const canonicalUpdateAttrs = attrs(calls[1]) as
      { relatedIdentifiers?: Array<{ relatedIdentifier: string }> } | undefined;
    expect(
      canonicalUpdateAttrs?.relatedIdentifiers?.some(
        (r) => r.relatedIdentifier === v2VersionDoi
      )
    ).toBe(true);
    // The published v2 carries the updated subtitle/abstract, and both the
    // version DOI and the canonical DOI update draw their title/subtitle/
    // abstract from that same version metadata within this one publish.
    expect(attrs(calls[0])?.["titles"]).toEqual([
      { lang: "en", title: "DOI New Version Pub" },
      { lang: "en", title: "Updated subtitle text.", titleType: "Subtitle" },
    ]);
    expect(attrs(calls[1])?.["titles"]).toEqual([
      { lang: "en", title: "DOI New Version Pub" },
      { lang: "en", title: "Updated subtitle text.", titleType: "Subtitle" },
    ]);
    expect(attrs(calls[0])?.["descriptions"]).toEqual([
      {
        description: "Updated abstract text.",
        descriptionType: "Abstract",
        lang: "en",
      },
    ]);
    expect(attrs(calls[1])?.["descriptions"]).toEqual([
      {
        description: "Updated abstract text.",
        descriptionType: "Abstract",
        lang: "en",
      },
    ]);
    const today = new Date().toISOString().slice(0, 10);
    // v1's original Issued date is preserved, and v2 contributes a new
    // Updated entry carrying its version description.
    expect(attrs(calls[1])?.["dates"]).toEqual([
      { date: today, dateType: "Issued" },
      { date: today, dateType: "Updated", dateInformation: "Fixed a typo." },
    ]);

    // v1's own DOI record gains the IsPreviousVersionOf back-link to v2 (the
    // GET/PUT pair above).
    const v1BacklinkGet = calls[2]!;
    expect(v1BacklinkGet.doi).toBe(v1VersionDoi);
    const v1BacklinkCall = calls[3]!;
    expect(v1BacklinkCall.doi).toBe(v1VersionDoi);
    const v1BacklinkAttrs = attrs(v1BacklinkCall) as
      | {
          relatedIdentifiers?: Array<{
            relatedIdentifier: string;
            relatedIdentifierType: string;
            relationType: string;
          }>;
        }
      | undefined;
    expect(v1BacklinkAttrs?.relatedIdentifiers).toContainEqual({
      relatedIdentifier: v2VersionDoi,
      relatedIdentifierType: "DOI",
      relationType: "IsPreviousVersionOf",
    });
    // The back-link PUT patches only relatedIdentifiers - it does not
    // resend v1's title, version, or other metadata.
    expect(Object.keys(v1BacklinkAttrs ?? {})).toEqual(["relatedIdentifiers"]);

    // --- Publish v3: v2's own DOI record should gain a back-link to v3,
    // while v1's DOI is left untouched (only the immediately preceding
    // version is re-linked on each publish). ---
    const draft3 = await client.post(
      "/api/publications/doi-new-version-pub/draft"
    );
    expect(draft3.body.publication.version_number).toBe(3);
    await client.put("/api/publications/doi-new-version-pub").send({
      doi: canonicalDoi,
      abstract: "Abstract text, v3.",
    });

    await resetDataciteMock();
    const v3Publish = await client.post(
      "/api/publications/doi-new-version-pub/publish"
    );
    expect(v3Publish.status).toBe(200);
    const v3VersionDoi = v3Publish.body.version_doi;
    expect(v3VersionDoi).toMatch(VERSION_DOI_PATTERN);

    calls = await getDataciteMockCalls();
    expect(calls.map((c) => c.method)).toEqual(["POST", "PUT", "GET", "PUT"]);
    const v2BacklinkCall = calls[3]!;
    expect(v2BacklinkCall.doi).toBe(v2VersionDoi);
    const v2BacklinkAttrs = attrs(v2BacklinkCall) as
      | {
          relatedIdentifiers?: Array<{
            relatedIdentifier: string;
            relatedIdentifierType: string;
            relationType: string;
          }>;
        }
      | undefined;
    expect(v2BacklinkAttrs?.relatedIdentifiers).toContainEqual({
      relatedIdentifier: v3VersionDoi,
      relatedIdentifierType: "DOI",
      relationType: "IsPreviousVersionOf",
    });
    // v2's own back-link IsNewVersionOf -> v1, fetched from its existing
    // DataCite record, is preserved alongside the new IsPreviousVersionOf ->
    // v3, even though the PUT itself only patches relatedIdentifiers.
    expect(v2BacklinkAttrs?.relatedIdentifiers).toContainEqual({
      relatedIdentifier: v1VersionDoi,
      relatedIdentifierType: "DOI",
      relationType: "IsNewVersionOf",
    });
    expect(Object.keys(v2BacklinkAttrs ?? {})).toEqual(["relatedIdentifiers"]);
    // v1's own DOI is not re-touched for v3's publish.
    expect(calls.some((c) => c.doi === v1VersionDoi)).toBe(false);

    // --- Version 4: editing the draft with a title mints the draft's own
    // version DOI (see the PUT /:slug handler in routes/publications.ts),
    // but the publication is already PUBLISHED, so updateCanonical is false
    // and the canonical DOI - and its dates - must not be touched while
    // this version is still only a draft.
    await resetDataciteMock();
    const draft4 = await client.post(
      "/api/publications/doi-new-version-pub/draft"
    );
    expect(draft4.body.publication.version_number).toBe(4);
    expect(await getDataciteMockCalls()).toHaveLength(0);

    const draftEditResp = await client
      .put("/api/publications/doi-new-version-pub")
      .send({
        doi: canonicalDoi,
        title: "DOI New Version Pub, v4 title",
        abstract: "Abstract text, v4.",
      });
    expect(draftEditResp.status).toBe(200);
    const draftEditCalls = await getDataciteMockCalls();
    expect(draftEditCalls.length).toBeGreaterThan(0);
    expect(draftEditCalls.some((c) => c.doi === canonicalDoi)).toBe(false);

    // Editing it again mints nothing further - the draft's own version DOI
    // already exists now (see the `if (!draftVersionDoi)` guard) - so the
    // canonical is still never touched.
    await resetDataciteMock();
    const draftEditResp2 = await client
      .put("/api/publications/doi-new-version-pub")
      .send({
        doi: canonicalDoi,
        title: "DOI New Version Pub, v4 title",
        abstract: "Abstract text, v4, again.",
      });
    expect(draftEditResp2.status).toBe(200);
    expect(await getDataciteMockCalls()).toHaveLength(0);

    // Only actually publishing the draft adds the Updated date to the
    // canonical DOI's metadata.
    await resetDataciteMock();
    const v4Publish = await client.post(
      "/api/publications/doi-new-version-pub/publish"
    );
    expect(v4Publish.status).toBe(200);

    calls = await getDataciteMockCalls();
    const v4CanonicalPut = calls.find(
      (c) => c.method === "PUT" && c.doi === canonicalDoi
    );
    expect(attrs(v4CanonicalPut)?.["dates"]).toEqual([
      { date: today, dateType: "Issued" },
      { date: today, dateType: "Updated", dateInformation: "Fixed a typo." },
      { date: today, dateType: "Updated" },
      { date: today, dateType: "Updated" },
    ]);
  });

  it("gives the concept DOI every published version's contributors, and each version DOI only its own", async () => {
    const { client, user, userId, userIds } = await registerUserWithId(
      makeUser("alicedoi")
    );
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);
    const bob = await registerUser(new TestApiClient(), makeUser("bobdoi"));

    const { orgIdInt: orgId } = await seedDoiMintingOrg(
      "Union Creators Org",
      "union-creators-org"
    );
    await seedOrgMember(orgId, userIds);

    const slug = "doi-creator-union-pub";
    await client.post("/api/publications").send({
      slug,
      title: "DOI Creator Union Pub",
      subtitle: "Subtitle text.",
      abstract: "Abstract text.",
      body: "Body text.",
    });
    await client
      .post("/api/publications/add_org")
      .send({ slug, org_id: orgId });
    await client.post("/api/publications/add_contrib").send({
      slug,
      username: user.username,
      role: "author",
      in_byline: true,
    });

    const v1Publish = await client.post(`/api/publications/${slug}/publish`);
    expect(v1Publish.status).toBe(200);
    const canonicalDoi = v1Publish.body.doi;

    // v2's byline replaces alice with bob entirely, so the two versions share
    // no contributor and the union is visibly different from either one.
    expect((await client.post(`/api/publications/${slug}/draft`)).status).toBe(
      201
    );
    await client.post("/api/publications/add_contrib").send({
      slug,
      username: bob.username,
      role: "author",
      in_byline: true,
    });
    const removed = await client
      .post("/api/publications/remove_contrib")
      .send({ slug, user_id: userIds.id_int, role: "author" });
    expect(removed.status).toBe(200);

    await resetDataciteMock();
    const v2Publish = await client
      .post(`/api/publications/${slug}/publish`)
      .send({ note: "Second version." });
    expect(v2Publish.status).toBe(200);
    expect(v2Publish.body.version_number).toBe(2);

    const calls = await getDataciteMockCalls();
    const names = (call: DataciteMockCall | undefined) =>
      ((attrs(call)?.["creators"] ?? []) as Array<{ name: string }>).map(
        (c) => c.name
      );

    // The version DOI POST carries v2's byline alone. (The mock only records
    // `doi` on PUT/GET, so match the POST on the DOI in its payload.)
    const versionPost = calls.find(
      (c) =>
        c.method === "POST" && attrs(c)?.["doi"] === v2Publish.body.version_doi
    );
    expect(versionPost).toBeDefined();
    expect(names(versionPost)).toEqual(["User, Bobdoi"]);

    // The concept DOI stands for the publication, so it carries both.
    const canonicalPut = calls.find(
      (c) => c.method === "PUT" && c.doi === canonicalDoi
    );
    expect(names(canonicalPut)).toEqual(["User, Alicedoi", "User, Bobdoi"]);
  });

  it("links each version's own DOI back to the version published after it (IsPreviousVersionOf)", async () => {
    const { client, user, userId, userIds } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);

    const { orgIdInt } = await seedDoiMintingOrg(
      "Back-link Minting Org",
      "back-link-minting-org"
    );
    await seedOrgMember(orgIdInt, userIds);

    await client.post("/api/publications").send({
      slug: "doi-backlink-pub",
      title: "DOI Backlink Pub",
      abstract: "Abstract text.",
      body: "Body text.",
    });
    await client
      .post("/api/publications/add_org")
      .send({ slug: "doi-backlink-pub", org_id: orgIdInt });

    await client.post("/api/publications/add_contrib").send({
      slug: "doi-backlink-pub",
      username: user.username,
      role: "author",
      in_byline: true,
    });

    const v1Publish = await client.post(
      "/api/publications/doi-backlink-pub/publish"
    );
    expect(v1Publish.status).toBe(200);
    const canonicalDoi = v1Publish.body.doi;
    const v1VersionDoi = v1Publish.body.version_doi;
    expect(v1VersionDoi).toMatch(VERSION_DOI_PATTERN);

    // --- Publish v2: v1's own DOI record should gain a back-link to v2. ---
    const draft2 = await client.post(
      "/api/publications/doi-backlink-pub/draft"
    );
    expect(draft2.body.publication.version_number).toBe(2);
    await client.put("/api/publications/doi-backlink-pub").send({
      doi: canonicalDoi,
      abstract: "Abstract text, v2.",
    });

    await resetDataciteMock();
    const v2Publish = await client.post(
      "/api/publications/doi-backlink-pub/publish"
    );
    expect(v2Publish.status).toBe(200);
    const v2VersionDoi = v2Publish.body.version_doi;
    expect(v2VersionDoi).toMatch(VERSION_DOI_PATTERN);
  });

  it("does not mint or update metadata for a subsequent version when the account cannot access the canonical DOI's prefix", async () => {
    const { client, user, userId, userIds } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);

    const { orgIdInt: orgId } = await seedDoiMintingOrg(
      "Foreign Canonical New Version Org",
      "foreign-canonical-new-version-org"
    );
    await seedOrgMember(orgId, userIds);

    await client.post("/api/publications").send({
      slug: "doi-foreign-canonical-v2",
      title: "DOI Foreign Canonical V2",
      abstract: "Abstract text.",
      body: "Body text.",
      doi: FOREIGN_DOI,
    });
    await client
      .post("/api/publications/add_org")
      .send({ slug: "doi-foreign-canonical-v2", org_id: orgId });
    // Publishing requires at least one byline contributor.
    await client.post("/api/publications/add_contrib").send({
      slug: "doi-foreign-canonical-v2",
      username: user.username,
      role: "author",
      in_byline: true,
    });

    // v1's own publish already could not mint anything either (see the
    // sibling describe block above) - version 1 has no DOI, and the
    // canonical DOI stays the original foreign one throughout.
    const v1Publish = await client.post(
      "/api/publications/doi-foreign-canonical-v2/publish"
    );
    expect(v1Publish.status).toBe(200);
    expect(v1Publish.body.doi).toBe(FOREIGN_DOI);
    expect(v1Publish.body.version_doi).toBeNull();

    const draftResp = await client.post(
      "/api/publications/doi-foreign-canonical-v2/draft"
    );
    expect(draftResp.status).toBe(201);
    expect(draftResp.body.publication.version_number).toBe(2);

    await resetDataciteMock();
    const v2Publish = await client
      .post("/api/publications/doi-foreign-canonical-v2/publish")
      .send({ note: "This new version is even more better." });
    expect(v2Publish.status).toBe(200);
    // Canonical DOI is still the original foreign one; no version DOI is
    // minted for v2 either.
    expect(v2Publish.body.doi).toBe(FOREIGN_DOI);
    expect(v2Publish.body.version_doi).toBeNull();

    const v2Rows = await query<{ doi: string | null }>(
      `SELECT doi FROM versions WHERE publication_id_int = (SELECT id_int FROM publications WHERE slug = 'doi-foreign-canonical-v2') AND version_number = 2`
    );
    expect(v2Rows[0]!.doi).toBeNull();

    // The write-access probe against the foreign canonical DOI runs before
    // any version-number-specific logic, so it rejects here exactly as it
    // did for v1 - minting is skipped, no POST is ever attempted.
    const calls = await getDataciteMockCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("PUT");
    expect(calls[0]!.doi).toBe(FOREIGN_DOI);
    expect(calls[0]!.status).toBe(403);
  });
});

describe("no DOI minting without doi_minting_enabled", () => {
  it("does not call DataCite when the publication has no org mapping", async () => {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);

    await client.post("/api/publications").send({
      slug: "doi-no-org-mapping",
      title: "DOI No Org Mapping",
      abstract: "Abstract text.",
      body: "Body text.",
    });
    // Publishing requires at least one byline contributor.
    await client.post("/api/publications/add_contrib").send({
      slug: "doi-no-org-mapping",
      username: user.username,
      role: "author",
      in_byline: true,
    });

    await resetDataciteMock();
    const publishResp = await client.post(
      "/api/publications/doi-no-org-mapping/publish"
    );
    expect(publishResp.status).toBe(200);
    expect(publishResp.body.doi).toBeNull();
    expect(publishResp.body.version_doi).toBeNull();
    expect(await getDataciteMockCalls()).toHaveLength(0);
  });

  it("does not call DataCite when the org has doi_minting_enabled = false", async () => {
    const { client, user, userId, userIds } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);

    const { orgIdInt: orgId } = await seedDoiMintingOrg(
      "Minting Disabled Org",
      "minting-disabled-org"
    );
    await execute(
      `UPDATE organizations SET doi_minting_enabled = FALSE WHERE id_int = ${orgId}`
    );
    await seedOrgMember(orgId, userIds);

    await client.post("/api/publications").send({
      slug: "doi-minting-disabled",
      title: "DOI Minting Disabled",
      abstract: "Abstract text.",
      body: "Body text.",
    });
    await client
      .post("/api/publications/add_org")
      .send({ slug: "doi-minting-disabled", org_id: orgId });
    // Publishing requires at least one byline contributor.
    await client.post("/api/publications/add_contrib").send({
      slug: "doi-minting-disabled",
      username: user.username,
      role: "author",
      in_byline: true,
    });

    await resetDataciteMock();
    const publishResp = await client.post(
      "/api/publications/doi-minting-disabled/publish"
    );
    expect(publishResp.status).toBe(200);
    expect(publishResp.body.doi).toBeNull();
    expect(await getDataciteMockCalls()).toHaveLength(0);
  });
});
