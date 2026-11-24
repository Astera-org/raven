/**
 * DOI-minting integration tests for the v1 publish flow
 * (`POST /api/v1/publications/id/{id}/versions`), with every version created
 * through the v1 API. These hit a mocked DataCite API (see
 * docker-compose.test.yml's datacite-mock service and datacite-mock/server.js)
 * instead of the real DataCite service.
 */
import { escape } from "mysql2";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type DataciteMockCall,
  endMembership,
  execute,
  getDataciteMockCalls,
  makeUser,
  query,
  registerUser,
  registerUserWithId,
  resetDataciteMock,
  seedDoiMintingOrg,
  seedOrg,
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
// `PUT .../doi` only records an external DOI for publications of this org.
const EXTERNAL_DOI_ORG_NAME = "Arcadia Science";

type RelatedIdentifier = {
  relatedIdentifier: string;
  relatedIdentifierType: string;
  relationType: string;
};

function attrs(
  call: DataciteMockCall | undefined
): Record<string, unknown> | undefined {
  return call?.body?.data?.attributes;
}

function relatedIdentifiers(call: DataciteMockCall | undefined) {
  return (attrs(call)?.["relatedIdentifiers"] ?? []) as RelatedIdentifier[];
}

function creatorNames(call: DataciteMockCall | undefined) {
  return ((attrs(call)?.["creators"] ?? []) as Array<{ name: string }>).map(
    (c) => c.name
  );
}

/** Non-byline contributors, leaving out the fixed HostingInstitution entry. */
function otherContributorNames(call: DataciteMockCall | undefined) {
  return (
    (attrs(call)?.["contributors"] ?? []) as Array<{
      name: string;
      contributorType: string;
    }>
  )
    .filter((c) => c.contributorType === "Other")
    .map((c) => c.name);
}

/** Each creator's DataCite `affiliation`, keyed by name. */
function creatorAffiliations(call: DataciteMockCall | undefined) {
  return Object.fromEntries(
    (
      (attrs(call)?.["creators"] ?? []) as Array<{
        name: string;
        affiliation?: unknown;
      }>
    ).map((c) => [c.name, c.affiliation])
  );
}

function byline(userId: string, inByline = true, affiliations: string[] = []) {
  return { userId, roles: ["Writing"], inByline, affiliations };
}

/** Creates a draft in a DOI-minting org, with `userId` alone in its byline. */
async function createPublication(
  client: TestApiClient,
  opts: {
    orgId: string;
    userId: string;
    slug: string;
    title: string;
    subtitle?: string;
    doi?: string;
  }
): Promise<string> {
  const resp = await client.post("/api/v1/publications").send({
    slug: opts.slug,
    title: opts.title,
    subtitle: opts.subtitle,
    abstract: "Abstract text.",
    body: "Body text.",
    doi: opts.doi,
    orgs: [{ orgId: opts.orgId }],
    contributors: [byline(opts.userId)],
  });
  expect(resp.status, resp.text).toBe(201);
  return resp.body.publicationId as string;
}

function publish(client: TestApiClient, publicationId: string, note?: string) {
  return client
    .post(`/api/v1/publications/id/${publicationId}/versions`)
    .send(note === undefined ? {} : { note });
}

async function createDraft(
  client: TestApiClient,
  publicationId: string
): Promise<number> {
  const resp = await client.post(
    `/api/v1/publications/id/${publicationId}/draft`
  );
  expect(resp.status, resp.text).toBe(201);
  const rows = await query<{ version_number: number }>(
    `SELECT version_number FROM versions WHERE id = ${escape(resp.body.versionId)}`
  );
  return rows[0]!.version_number;
}

async function patchDraft(
  client: TestApiClient,
  publicationId: string,
  body: Record<string, unknown>
) {
  const resp = await client
    .patch(`/api/v1/publications/id/${publicationId}/draft`)
    .send(body);
  expect(resp.status, resp.text).toBe(200);
}

async function versionDoi(
  publicationId: string,
  versionNumber: number
): Promise<string | null> {
  const rows = await query<{ doi: string | null }>(
    `SELECT v.doi FROM versions v JOIN publications p ON p.id_int = v.publication_id_int WHERE p.id = ${escape(publicationId)} AND v.version_number = ${versionNumber}`
  );
  return rows[0]!.doi;
}

async function publicationRow(publicationId: string) {
  const rows = await query<{ doi: string | null; state: string }>(
    `SELECT doi, state FROM publications WHERE id = ${escape(publicationId)}`
  );
  return rows[0]!;
}

async function loggedInSiteAdmin(user = makeUser("doiadmin")) {
  const registered = await registerUserWithId(user);
  await seedSiteAdmin(registered.userId);
  await registered.client.login(
    registered.user.username,
    registered.user.password
  );
  return registered;
}

beforeEach(async () => {
  // Every test starts from a clean call log, regardless of what a previous
  // test in this file left behind.
  await resetDataciteMock();
});

describe("DOI minting on publish (org has doi_minting_enabled = true)", () => {
  it("mints a canonical DOI and a version DOI for a brand-new publication", async () => {
    const { client, user, userIds } = await loggedInSiteAdmin();
    const org = await seedDoiMintingOrg("Minting Org", "minting-org-slug");
    await seedOrgMember(org.orgIdInt, userIds);

    const publicationId = await createPublication(client, {
      orgId: org.orgId,
      userId: user.id,
      slug: "doi-mint-new-pub",
      title: "DOI Mint New Pub",
      subtitle: "Subtitle text.",
    });

    await resetDataciteMock();
    const publishResp = await publish(client, publicationId);
    expect(publishResp.status, publishResp.text).toBe(201);
    expect(publishResp.body.doi).toMatch(CANONICAL_DOI_PATTERN);
    expect(publishResp.body.versionDoi).toMatch(VERSION_DOI_PATTERN);
    expect(publishResp.body.doi).not.toBe(publishResp.body.versionDoi);

    expect((await publicationRow(publicationId)).doi).toBe(
      publishResp.body.doi
    );
    expect(await versionDoi(publicationId, 1)).toBe(
      publishResp.body.versionDoi
    );

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
    expect(attrs(calls[1])?.["doi"]).toBe(publishResp.body.versionDoi);
    expect(calls[2]!.doi).toBe(publishResp.body.doi);

    // Every payload carries only an Issued date, dated today - there's no
    // prior version yet to be "Updated".
    const today = new Date().toISOString().slice(0, 10);
    for (const call of calls) {
      expect(attrs(call)?.["dates"]).toEqual([
        { date: today, dateType: "Issued" },
      ]);
    }
  });

  it("does not mint when the account cannot access the canonical DOI's prefix", async () => {
    const { client, user, userIds } = await loggedInSiteAdmin();
    const org = await seedDoiMintingOrg(
      "Foreign Canonical Org",
      "foreign-canonical-org"
    );
    await seedOrgMember(org.orgIdInt, userIds);

    // The publication is created with a canonical DOI the user already has,
    // on a prefix Raven's configured DataCite account does not control.
    // Version 1 itself has no DOI yet.
    const publicationId = await createPublication(client, {
      orgId: org.orgId,
      userId: user.id,
      slug: "doi-foreign-canonical-pub",
      title: "DOI Foreign Canonical Pub",
      doi: FOREIGN_DOI,
    });

    await resetDataciteMock();
    const publishResp = await publish(client, publicationId);
    // Publishing itself still succeeds - a DOI-minting failure is logged,
    // not fatal.
    expect(publishResp.status, publishResp.text).toBe(201);
    expect(publishResp.body.doi).toBe(FOREIGN_DOI);
    expect(publishResp.body.versionDoi).toBeNull();

    expect(await publicationRow(publicationId)).toEqual({
      doi: FOREIGN_DOI,
      state: "PUBLISHED",
    });
    expect(await versionDoi(publicationId, 1)).toBeNull();

    // mintDoiForNewVersion probes write access to the canonical DOI first (a
    // no-op PUT with empty attributes) before attempting to mint anything.
    // The mock rejects it, since FOREIGN_DOI's prefix is not our own, so no
    // POST is ever attempted.
    const calls = await getDataciteMockCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("PUT");
    expect(calls[0]!.doi).toBe(FOREIGN_DOI);
    expect(calls[0]!.status).toBe(403);
  });

  it("does not publish draft DOIs once the DOI is changed to an inaccessible foreign DOI", async () => {
    const { client, user, userIds } = await loggedInSiteAdmin();
    const org = await seedDoiMintingOrg(
      EXTERNAL_DOI_ORG_NAME,
      "external-doi-org"
    );
    await seedOrgMember(org.orgIdInt, userIds);

    const publicationId = await createPublication(client, {
      orgId: org.orgId,
      userId: user.id,
      slug: "doi-foreign-canonical-pub",
      title: "DOI Foreign Canonical Pub, late set",
    });

    // Minting the draft's DOIs: canonical via prefix-based auto-generation,
    // then version via deterministic DOI, then the canonical's update.
    await resetDataciteMock();
    const mintResp = await client.post(
      `/api/v1/publications/id/${publicationId}/doi`
    );
    expect(mintResp.status, mintResp.text).toBe(200);
    expect(mintResp.body.doi).toMatch(CANONICAL_DOI_PATTERN);
    expect(mintResp.body.versionDoi).toMatch(VERSION_DOI_PATTERN);
    let calls = await getDataciteMockCalls();
    expect(calls.map((c) => c.method)).toEqual(["POST", "POST", "PUT"]);
    expect(attrs(calls[0])?.["prefix"]).toBe("10.83972");
    expect(attrs(calls[0])?.["titles"]).toEqual([
      { lang: "en", title: "DOI Foreign Canonical Pub, late set" },
    ]);
    expect(attrs(calls[0])?.["doi"]).toBeUndefined();
    expect(attrs(calls[1])?.["doi"]).toBe(mintResp.body.versionDoi);

    const putDoiResp = await client
      .put(`/api/v1/publications/id/${publicationId}/doi`)
      .send({ doi: FOREIGN_DOI });
    expect(putDoiResp.status, putDoiResp.text).toBe(200);

    await resetDataciteMock();
    const publishResp = await publish(client, publicationId);
    // Publishing itself still succeeds - a DOI failure is logged, not fatal.
    expect(publishResp.status, publishResp.text).toBe(201);
    expect(publishResp.body.doi).toBe(FOREIGN_DOI);
    expect(await publicationRow(publicationId)).toEqual({
      doi: FOREIGN_DOI,
      state: "PUBLISHED",
    });

    // The write-access probe against the foreign canonical DOI is rejected,
    // so the draft DOIs are left in DRAFT and not made findable.
    calls = await getDataciteMockCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("PUT");
    expect(calls[0]!.doi).toBe(FOREIGN_DOI);
    expect(calls[0]!.status).toBe(403);
  });
});

describe("DOI minting and metadata updates on a new version's publish", () => {
  it("mints a new version DOI and updates the canonical DOI's metadata", async () => {
    const { client, user, userIds } = await loggedInSiteAdmin();
    const org = await seedDoiMintingOrg(
      "New Version Minting Org",
      "new-version-minting-org"
    );
    await seedOrgMember(org.orgIdInt, userIds);

    const publicationId = await createPublication(client, {
      orgId: org.orgId,
      userId: user.id,
      slug: "doi-new-version-pub",
      title: "DOI New Version Pub",
      subtitle: "Subtitle text.",
    });

    const v1Publish = await publish(client, publicationId);
    expect(v1Publish.status, v1Publish.text).toBe(201);
    const canonicalDoi = v1Publish.body.doi;
    const v1VersionDoi = v1Publish.body.versionDoi;
    expect(canonicalDoi).toMatch(CANONICAL_DOI_PATTERN);
    expect(v1VersionDoi).toMatch(VERSION_DOI_PATTERN);

    // Creating a new draft version, and editing it while it stays a draft,
    // must not touch DataCite at all - the canonical DOI's metadata is only
    // updated once the new version is actually published, below.
    await resetDataciteMock();
    expect(await createDraft(client, publicationId)).toBe(2);
    expect(await getDataciteMockCalls()).toHaveLength(0);

    await patchDraft(client, publicationId, {
      subtitle: "Updated subtitle text.",
      abstract: "Updated abstract text.",
      versionDesc: "Fixed a typo.",
    });
    expect(await getDataciteMockCalls()).toHaveLength(0);

    await resetDataciteMock();
    const v2Publish = await publish(client, publicationId);
    expect(v2Publish.status, v2Publish.text).toBe(201);
    expect(v2Publish.body.versionNumber).toBe(2);
    // The canonical DOI is unchanged; a new, distinct version DOI is minted.
    expect(v2Publish.body.doi).toBe(canonicalDoi);
    expect(v2Publish.body.versionDoi).toMatch(VERSION_DOI_PATTERN);
    expect(v2Publish.body.versionDoi).not.toBe(v1VersionDoi);
    const v2VersionDoi = v2Publish.body.versionDoi;
    expect(await versionDoi(publicationId, 2)).toBe(v2VersionDoi);

    // mintDoiForNewVersion -> mintDois(): POST the new version's DOI, then
    // PUT the existing canonical DOI to fold the new version into its
    // metadata (relatedIdentifiers gains a HasVersion entry for it), then GET
    // the previous (v1) version's own DOI record and PUT it back to add an
    // IsPreviousVersionOf back-link to v2.
    let calls = await getDataciteMockCalls();
    expect(calls.map((c) => c.method)).toEqual(["POST", "PUT", "GET", "PUT"]);
    expect(attrs(calls[0])?.["version"]).toBe("2");
    expect(calls[1]!.doi).toBe(canonicalDoi);
    expect(
      relatedIdentifiers(calls[1]).some(
        (r) => r.relatedIdentifier === v2VersionDoi
      )
    ).toBe(true);
    // The version DOI and the canonical DOI both draw their title, subtitle
    // and abstract from the published v2.
    for (const call of calls.slice(0, 2)) {
      expect(attrs(call)?.["titles"]).toEqual([
        { lang: "en", title: "DOI New Version Pub" },
        { lang: "en", title: "Updated subtitle text.", titleType: "Subtitle" },
      ]);
      expect(attrs(call)?.["descriptions"]).toEqual([
        {
          description: "Updated abstract text.",
          descriptionType: "Abstract",
          lang: "en",
        },
      ]);
    }
    const today = new Date().toISOString().slice(0, 10);
    // v1's original Issued date is preserved, and v2 contributes a new
    // Updated entry carrying its version description.
    expect(attrs(calls[1])?.["dates"]).toEqual([
      { date: today, dateType: "Issued" },
      { date: today, dateType: "Updated", dateInformation: "Fixed a typo." },
    ]);

    // v1's own DOI record gains the IsPreviousVersionOf back-link to v2.
    expect(calls[2]!.doi).toBe(v1VersionDoi);
    expect(calls[3]!.doi).toBe(v1VersionDoi);
    expect(relatedIdentifiers(calls[3])).toContainEqual({
      relatedIdentifier: v2VersionDoi,
      relatedIdentifierType: "DOI",
      relationType: "IsPreviousVersionOf",
    });
    // The back-link PUT patches only relatedIdentifiers - it does not resend
    // v1's title, version, or other metadata.
    expect(Object.keys(attrs(calls[3]) ?? {})).toEqual(["relatedIdentifiers"]);

    // --- Publish v3: v2's own DOI record should gain a back-link to v3,
    // while v1's DOI is left untouched (only the immediately preceding
    // version is re-linked on each publish). ---
    expect(await createDraft(client, publicationId)).toBe(3);
    await patchDraft(client, publicationId, { abstract: "Abstract text, v3." });

    await resetDataciteMock();
    const v3Publish = await publish(client, publicationId, "Third version.");
    expect(v3Publish.status, v3Publish.text).toBe(201);
    const v3VersionDoi = v3Publish.body.versionDoi;
    expect(v3VersionDoi).toMatch(VERSION_DOI_PATTERN);

    calls = await getDataciteMockCalls();
    expect(calls.map((c) => c.method)).toEqual(["POST", "PUT", "GET", "PUT"]);
    expect(calls[3]!.doi).toBe(v2VersionDoi);
    expect(relatedIdentifiers(calls[3])).toContainEqual({
      relatedIdentifier: v3VersionDoi,
      relatedIdentifierType: "DOI",
      relationType: "IsPreviousVersionOf",
    });
    // v2's own back-link IsNewVersionOf -> v1, fetched from its existing
    // DataCite record, is preserved alongside the new IsPreviousVersionOf ->
    // v3, even though the PUT itself only patches relatedIdentifiers.
    expect(relatedIdentifiers(calls[3])).toContainEqual({
      relatedIdentifier: v1VersionDoi,
      relatedIdentifierType: "DOI",
      relationType: "IsNewVersionOf",
    });
    expect(Object.keys(attrs(calls[3]) ?? {})).toEqual(["relatedIdentifiers"]);
    expect(calls.some((c) => c.doi === v1VersionDoi)).toBe(false);

    // --- Version 4: minting the draft's own version DOI must not touch the
    // canonical DOI - or its dates - since the publication is already
    // PUBLISHED and this version is still only a draft. ---
    await resetDataciteMock();
    expect(await createDraft(client, publicationId)).toBe(4);
    expect(await getDataciteMockCalls()).toHaveLength(0);

    await patchDraft(client, publicationId, {
      title: "DOI New Version Pub, v4 title",
      abstract: "Abstract text, v4.",
    });
    const mintResp = await client.post(
      `/api/v1/publications/id/${publicationId}/doi`
    );
    expect(mintResp.status, mintResp.text).toBe(200);
    expect(mintResp.body.versionDoi).toMatch(VERSION_DOI_PATTERN);
    const draftMintCalls = await getDataciteMockCalls();
    expect(draftMintCalls.length).toBeGreaterThan(0);
    expect(draftMintCalls.some((c) => c.doi === canonicalDoi)).toBe(false);

    // Updating the draft's DOIs again sends nothing: the version DOI already
    // exists, and the canonical is not the draft's to update.
    await resetDataciteMock();
    await patchDraft(client, publicationId, {
      abstract: "Abstract text, v4, again.",
    });
    const updateResp = await client.post(
      `/api/v1/publications/id/${publicationId}/doi`
    );
    expect(updateResp.status, updateResp.text).toBe(200);
    expect(updateResp.body.versionDoi).toBe(mintResp.body.versionDoi);
    expect(await getDataciteMockCalls()).toHaveLength(0);

    // Only actually publishing the draft adds its Updated date to the
    // canonical DOI's metadata.
    await resetDataciteMock();
    const v4Publish = await publish(client, publicationId, "Fourth version.");
    expect(v4Publish.status, v4Publish.text).toBe(201);
    expect(v4Publish.body.versionDoi).toBe(mintResp.body.versionDoi);

    calls = await getDataciteMockCalls();
    const v4CanonicalPut = calls.find(
      (c) => c.method === "PUT" && c.doi === canonicalDoi
    );
    expect(attrs(v4CanonicalPut)?.["dates"]).toEqual([
      { date: today, dateType: "Issued" },
      { date: today, dateType: "Updated", dateInformation: "Fixed a typo." },
      { date: today, dateType: "Updated", dateInformation: "Third version." },
      { date: today, dateType: "Updated", dateInformation: "Fourth version." },
    ]);
  });

  it("gives the concept DOI every published version's contributors, and each version DOI only its own", async () => {
    const { client, user, userIds } = await loggedInSiteAdmin(
      makeUser("alicedoi")
    );
    const bob = await registerUser(new TestApiClient(), makeUser("bobdoi"));
    const org = await seedDoiMintingOrg(
      "Union Creators Org",
      "union-creators-org"
    );
    await seedOrgMember(org.orgIdInt, userIds);

    const publicationId = await createPublication(client, {
      orgId: org.orgId,
      userId: user.id,
      slug: "doi-creator-union-pub",
      title: "DOI Creator Union Pub",
      subtitle: "Subtitle text.",
    });

    const v1Publish = await publish(client, publicationId);
    expect(v1Publish.status, v1Publish.text).toBe(201);
    const canonicalDoi = v1Publish.body.doi;

    // v2's byline replaces alice with bob entirely, so the two versions share
    // no contributor and the union is visibly different from either one.
    expect(await createDraft(client, publicationId)).toBe(2);
    await patchDraft(client, publicationId, { contributors: [byline(bob.id)] });

    await resetDataciteMock();
    const v2Publish = await publish(client, publicationId, "Second version.");
    expect(v2Publish.status, v2Publish.text).toBe(201);
    expect(v2Publish.body.versionNumber).toBe(2);

    const calls = await getDataciteMockCalls();
    // The version DOI POST carries v2's byline alone. (The mock only records
    // `doi` on PUT/GET, so match the POST on the DOI in its payload.)
    const versionPost = calls.find(
      (c) =>
        c.method === "POST" && attrs(c)?.["doi"] === v2Publish.body.versionDoi
    );
    expect(versionPost).toBeDefined();
    expect(creatorNames(versionPost)).toEqual(["User, Bobdoi"]);

    // The concept DOI stands for the publication, so it carries both.
    const canonicalPut = calls.find(
      (c) => c.method === "PUT" && c.doi === canonicalDoi
    );
    expect(creatorNames(canonicalPut)).toEqual([
      "User, Alicedoi",
      "User, Bobdoi",
    ]);
  });

  /**
   * Creators (byline) / others (non-byline contributors) DataCite receives:
   *
   * | Version | Change                                     | Version DOI                | Concept DOI               |
   * | ------- | ------------------------------------------ | -------------------------- | ------------------------- |
   * | v1      | alice in byline, carol outside it          | Alice / Carol              | Alice / Carol             |
   * | v2      | bob added to the byline                    | Alice, Bob / Carol         | Alice, Bob / Carol        |
   * | v3      | bob ahead of alice; carol into the byline  | Bob, Alice, Carol / -      | Alice, Bob, Carol / -     |
   * | v4      | alice removed; bob out of the byline       | Carol / Bob                | Alice, Bob, Carol / -     |
   */
  it("tracks byline additions, removals, reordering and byline moves across versions", async () => {
    const { client, user, userIds } = await loggedInSiteAdmin(
      makeUser("alicedoi")
    );
    const bob = await registerUser(new TestApiClient(), makeUser("bobdoi"));
    const carol = await registerUser(new TestApiClient(), makeUser("caroldoi"));
    const org = await seedDoiMintingOrg(
      "Byline Changes Org",
      "byline-changes-org"
    );
    await seedOrgMember(org.orgIdInt, userIds);
    const alice = user;
    const [ALICE, BOB, CAROL] = [
      "User, Alicedoi",
      "User, Bobdoi",
      "User, Caroldoi",
    ];

    const publicationId = await createPublication(client, {
      orgId: org.orgId,
      userId: alice.id,
      slug: "doi-byline-changes-pub",
      title: "DOI Byline Changes Pub",
    });

    /**
     * Publishes the draft with `contributors`, returning the people on the new
     * version's DOI and on the concept DOI.
     */
    async function publishWith(
      contributors: ReturnType<typeof byline>[],
      note?: string
    ) {
      await patchDraft(client, publicationId, { contributors });
      await resetDataciteMock();
      const resp = await publish(client, publicationId, note);
      expect(resp.status, resp.text).toBe(201);
      const calls = await getDataciteMockCalls();
      const versionPost = calls.find(
        (c) => c.method === "POST" && attrs(c)?.["doi"] === resp.body.versionDoi
      );
      const conceptPut = calls.find(
        (c) => c.method === "PUT" && c.doi === resp.body.doi
      );
      expect(versionPost).toBeDefined();
      expect(conceptPut).toBeDefined();
      return {
        version: {
          creators: creatorNames(versionPost),
          others: otherContributorNames(versionPost),
        },
        concept: {
          creators: creatorNames(conceptPut),
          others: otherContributorNames(conceptPut),
        },
      };
    }

    const slug = "doi-byline-changes-pub";
    type ExpectedContributor = { firstName: string; inByline: boolean };
    const expectedByVersion: ExpectedContributor[][] = [];

    /**
     * Checks a version's contributors, in byline order, as both the v1 and v0
     * APIs return them. `latest` also checks the routes without a version.
     */
    async function expectContributors(
      versionNumber: number,
      expected: ExpectedContributor[],
      { latest }: { latest: boolean }
    ) {
      const withPriority = expected.map((c, i) => ({ ...c, priority: i + 1 }));
      const v1Paths = [
        `/api/v1/publications/id/${publicationId}/versions/v${versionNumber}`,
        ...(latest ? [`/api/v1/publications/id/${publicationId}`] : []),
      ];
      for (const path of v1Paths) {
        const resp = await client.get(path);
        expect(resp.status, `${path}: ${resp.text}`).toBe(200);
        expect(
          (
            resp.body.publication.contributors as Array<
              ExpectedContributor & { priority: number }
            >
          ).map(({ firstName, inByline, priority }) => ({
            firstName,
            inByline,
            priority,
          })),
          path
        ).toEqual(withPriority);
      }

      const v0Paths = [
        `/api/publications/${slug}/v${versionNumber}`,
        ...(latest ? [`/api/publications/${slug}`] : []),
      ];
      for (const path of v0Paths) {
        const resp = await client.get(path);
        expect(resp.status, `${path}: ${resp.text}`).toBe(200);
        expect(
          (
            resp.body.publication.contributors as Array<{
              first_name: string;
              in_byline: boolean | number;
              priority: number;
            }>
          ).map((c) => ({
            firstName: c.first_name,
            inByline: Boolean(c.in_byline),
            priority: c.priority,
          })),
          path
        ).toEqual(withPriority);
      }
    }

    async function publishAndCheck(
      versionNumber: number,
      contributors: ReturnType<typeof byline>[],
      expected: ExpectedContributor[],
      note?: string
    ) {
      const people = await publishWith(contributors, note);
      expectedByVersion[versionNumber] = expected;
      await expectContributors(versionNumber, expected, { latest: true });
      return people;
    }

    const aliceIn = { firstName: "Alicedoi", inByline: true };
    const bobIn = { firstName: "Bobdoi", inByline: true };
    const bobOut = { firstName: "Bobdoi", inByline: false };
    const carolIn = { firstName: "Caroldoi", inByline: true };
    const carolOut = { firstName: "Caroldoi", inByline: false };

    // v1: alice in the byline, carol a contributor outside it.
    expect(
      await publishAndCheck(
        1,
        [byline(alice.id), byline(carol.id, false)],
        [aliceIn, carolOut]
      )
    ).toEqual({
      version: { creators: [ALICE], others: [CAROL] },
      concept: { creators: [ALICE], others: [CAROL] },
    });

    // v2: bob joins the byline; everyone else keeps their place.
    expect(await createDraft(client, publicationId)).toBe(2);
    expect(
      await publishAndCheck(
        2,
        [byline(alice.id), byline(bob.id), byline(carol.id, false)],
        [aliceIn, bobIn, carolOut],
        "Added bob."
      )
    ).toEqual({
      version: { creators: [ALICE, BOB], others: [CAROL] },
      concept: { creators: [ALICE, BOB], others: [CAROL] },
    });

    // v3: bob moves ahead of alice, and carol moves into the byline. The
    // version DOI follows the byline order, not the alphabet. The concept DOI
    // ranks each person by the best billing they ever had (alice and bob
    // both led a version, so they tie and sort alphabetically).
    expect(await createDraft(client, publicationId)).toBe(3);
    expect(
      await publishAndCheck(
        3,
        [byline(bob.id), byline(alice.id), byline(carol.id)],
        [bobIn, aliceIn, carolIn],
        "Reordered the byline."
      )
    ).toEqual({
      version: { creators: [BOB, ALICE, CAROL], others: [] },
      concept: { creators: [ALICE, BOB, CAROL], others: [] },
    });

    // v4: alice is removed with no replacement, and bob moves out of the
    // byline. The version DOI reflects only v4, while the concept DOI keeps
    // alice, and keeps bob as a creator, since both were in the byline of an
    // earlier published version.
    expect(await createDraft(client, publicationId)).toBe(4);
    expect(
      await publishAndCheck(
        4,
        [byline(carol.id), byline(bob.id, false)],
        [carolIn, bobOut],
        "Removed alice; bob no longer in the byline."
      )
    ).toEqual({
      version: { creators: [CAROL], others: [BOB] },
      concept: { creators: [ALICE, BOB, CAROL], others: [] },
    });

    // Editing later versions left every earlier version's contributors as
    // they were published.
    for (const versionNumber of [1, 2, 3]) {
      await expectContributors(
        versionNumber,
        expectedByVersion[versionNumber]!,
        { latest: false }
      );
    }
  });

  /**
   * Affiliations DataCite receives, from explicit affiliations on the version
   * plus current memberships in the publication's org (Membership Org):
   *
   * | Person | Explicit on v1       | Explicit on v2                 | Membership |
   * | ------ | -------------------- | ------------------------------ | ---------- |
   * | alice  | Alpha Lab, Beta Lab  | Beta Lab, Membership Org       | current    |
   * | bob    | -                    | Gamma Institute (no ROR)       | ended      |
   * | carol  | -                    | -                              | -          |
   */
  it("sends explicit affiliations and current memberships, deduplicated, each with its own ROR", async () => {
    const { client, user, userIds } = await loggedInSiteAdmin(
      makeUser("aliceaff")
    );
    const bob = await registerUserWithId(makeUser("bobaff"));
    const carol = await registerUser(new TestApiClient(), makeUser("carolaff"));
    const MEMBERSHIP_ROR = "https://ror.org/01member";
    const ALPHA_ROR = "https://ror.org/02alpha";
    const BETA_ROR = "https://ror.org/03beta";

    const membershipOrg = await seedDoiMintingOrg(
      "Membership Org",
      "affiliations-membership-org"
    );
    const alphaLab = await seedOrg("Alpha Lab", "affiliations-alpha-lab");
    const betaLab = await seedOrg("Beta Lab", "affiliations-beta-lab");
    const gammaInstitute = await seedOrg(
      "Gamma Institute",
      "affiliations-gamma-institute"
    );
    for (const [org, ror] of [
      [membershipOrg, MEMBERSHIP_ROR],
      [alphaLab, ALPHA_ROR],
      [betaLab, BETA_ROR],
    ] as const) {
      await execute(
        `UPDATE organizations SET ror_id = ${escape(ror)} WHERE id_int = ${org.orgIdInt}`
      );
    }
    await seedOrgMember(membershipOrg.orgIdInt, userIds);
    await seedOrgMember(membershipOrg.orgIdInt, bob.userIds);
    await endMembership(membershipOrg, bob.userIds);

    const publicationId = await createPublication(client, {
      orgId: membershipOrg.orgId,
      userId: user.id,
      slug: "doi-affiliations-pub",
      title: "DOI Affiliations Pub",
    });

    async function publishWith(
      contributors: ReturnType<typeof byline>[],
      note?: string
    ) {
      await patchDraft(client, publicationId, { contributors });
      await resetDataciteMock();
      const resp = await publish(client, publicationId, note);
      expect(resp.status, resp.text).toBe(201);
      const calls = await getDataciteMockCalls();
      const versionPost = calls.find(
        (c) => c.method === "POST" && attrs(c)?.["doi"] === resp.body.versionDoi
      );
      const conceptPut = calls.find(
        (c) => c.method === "PUT" && c.doi === resp.body.doi
      );
      expect(versionPost).toBeDefined();
      expect(conceptPut).toBeDefined();
      return {
        version: creatorAffiliations(versionPost),
        concept: creatorAffiliations(conceptPut),
      };
    }

    const ror = (name: string, rorId: string) => ({
      name,
      affiliationIdentifier: rorId,
      affiliationIdentifierScheme: "ROR",
      schemeUri: "https://ror.org",
    });
    const membership = ror("Membership Org", MEMBERSHIP_ROR);
    const alpha = ror("Alpha Lab", ALPHA_ROR);
    const beta = ror("Beta Lab", BETA_ROR);
    const [ALICE, BOB, CAROL] = [
      "User, Aliceaff",
      "User, Bobaff",
      "User, Carolaff",
    ];

    // v1: alice's explicit affiliations join her current membership; bob's
    // membership has ended, so neither he nor carol has any.
    expect(
      await publishWith([
        byline(user.id, true, [alphaLab.orgId, betaLab.orgId]),
        byline(bob.userIds.id),
        byline(carol.id),
      ])
    ).toEqual({
      version: {
        [ALICE]: [alpha, beta, membership],
        [BOB]: undefined,
        [CAROL]: undefined,
      },
      concept: {
        [ALICE]: [alpha, beta, membership],
        [BOB]: undefined,
        [CAROL]: undefined,
      },
    });

    // v2: alice lists Membership Org explicitly as well, and drops Alpha Lab.
    // The concept DOI keeps Alpha Lab from v1 and lists Beta Lab and
    // Membership Org once each, though both now come from two sources.
    expect(await createDraft(client, publicationId)).toBe(2);
    expect(
      await publishWith(
        [
          byline(user.id, true, [betaLab.orgId, membershipOrg.orgId]),
          byline(bob.userIds.id, true, [gammaInstitute.orgId]),
          byline(carol.id),
        ],
        "Updated affiliations."
      )
    ).toEqual({
      version: {
        [ALICE]: [beta, membership],
        [BOB]: [{ name: "Gamma Institute" }],
        [CAROL]: undefined,
      },
      concept: {
        [ALICE]: [alpha, beta, membership],
        [BOB]: [{ name: "Gamma Institute" }],
        [CAROL]: undefined,
      },
    });
  });

  it("does not mint or update metadata for a subsequent version when the account cannot access the canonical DOI's prefix", async () => {
    const { client, user, userIds } = await loggedInSiteAdmin();
    const org = await seedDoiMintingOrg(
      "Foreign Canonical New Version Org",
      "foreign-canonical-new-version-org"
    );
    await seedOrgMember(org.orgIdInt, userIds);

    const publicationId = await createPublication(client, {
      orgId: org.orgId,
      userId: user.id,
      slug: "doi-foreign-canonical-v2",
      title: "DOI Foreign Canonical V2",
      doi: FOREIGN_DOI,
    });

    // v1's own publish could not mint anything either - version 1 has no DOI,
    // and the canonical DOI stays the original foreign one throughout.
    const v1Publish = await publish(client, publicationId);
    expect(v1Publish.status, v1Publish.text).toBe(201);
    expect(v1Publish.body.doi).toBe(FOREIGN_DOI);
    expect(v1Publish.body.versionDoi).toBeNull();

    expect(await createDraft(client, publicationId)).toBe(2);

    await resetDataciteMock();
    const v2Publish = await publish(
      client,
      publicationId,
      "This new version is even more better."
    );
    expect(v2Publish.status, v2Publish.text).toBe(201);
    // Canonical DOI is still the original foreign one; no version DOI is
    // minted for v2 either.
    expect(v2Publish.body.doi).toBe(FOREIGN_DOI);
    expect(v2Publish.body.versionDoi).toBeNull();
    expect(await versionDoi(publicationId, 2)).toBeNull();

    // The write-access probe against the foreign canonical DOI rejects here
    // exactly as it did for v1 - minting is skipped, no POST is attempted.
    const calls = await getDataciteMockCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("PUT");
    expect(calls[0]!.doi).toBe(FOREIGN_DOI);
    expect(calls[0]!.status).toBe(403);
  });
});

describe("no DOI minting without doi_minting_enabled", () => {
  it("does not call DataCite when the publication has no org mapping", async () => {
    const { client, user } = await loggedInSiteAdmin();

    const createResp = await client.post("/api/v1/publications").send({
      slug: "doi-no-org-mapping",
      title: "DOI No Org Mapping",
      abstract: "Abstract text.",
      body: "Body text.",
      contributors: [byline(user.id)],
    });
    expect(createResp.status, createResp.text).toBe(201);

    await resetDataciteMock();
    const publishResp = await publish(client, createResp.body.publicationId);
    expect(publishResp.status, publishResp.text).toBe(201);
    expect(publishResp.body.doi).toBeNull();
    expect(publishResp.body.versionDoi).toBeNull();
    expect(await getDataciteMockCalls()).toHaveLength(0);
  });

  it("does not call DataCite when the org has doi_minting_enabled = false", async () => {
    const { client, user, userIds } = await loggedInSiteAdmin();
    const org = await seedDoiMintingOrg(
      "Minting Disabled Org",
      "minting-disabled-org"
    );
    await execute(
      `UPDATE organizations SET doi_minting_enabled = FALSE WHERE id_int = ${org.orgIdInt}`
    );
    await seedOrgMember(org.orgIdInt, userIds);

    const publicationId = await createPublication(client, {
      orgId: org.orgId,
      userId: user.id,
      slug: "doi-minting-disabled",
      title: "DOI Minting Disabled",
    });

    await resetDataciteMock();
    const publishResp = await publish(client, publicationId);
    expect(publishResp.status, publishResp.text).toBe(201);
    expect(publishResp.body.doi).toBeNull();
    expect(await getDataciteMockCalls()).toHaveLength(0);
  });
});
