/**
 * Reference-URL casing integration tests for the publish flow (src/lib/references.ts,
 * exercised via POST /api/publications, PUT /api/publications/:slug, and
 * POST /api/publications/:slug/publish). The reconciliation-order test also
 * exercises the DataCite mock to verify the metadata generated during publish.
 *
 * `references.url` is a case-sensitive column (utf8mb4_bin collation, set by
 * migration 0012_make_reference_url_case_sensitive.sql) because some sources
 * (e.g. YouTube) mint URLs whose casing is significant, while doi.org URLs
 * are deliberately normalized to lowercase in extractRefUrls/normalizeUrl so
 * that re-submitting the same DOI under different casing still collapses
 * onto a single row instead of piling up duplicates.
 *
 * A unit test can verify the normalization logic in isolation, but not that
 * the real database actually enforces the uniqueness/collation behavior this
 * relies on - that's what these tests exist to catch. This is exactly the
 * kind of gap that bit the earlier DOI-backlink fix: logic that looked right
 * in isolation but depended on real DB behavior no unit test exercised.
 */
import { describe, expect, it } from "vitest";
import {
  getDataciteMockCalls,
  query,
  registerUserWithId,
  resetDataciteMock,
  seedDoiMintingOrg,
  seedOrgMember,
  seedSiteAdmin,
  waitForRows,
} from "./helpers.js";

const YOUTUBE_URL = "https://www.YouTube.com/watch?v=AbCdEfGhIjK";
const YOUTUBE_URL_RECASED = "https://www.youtube.com/watch?v=abcdefghijk";
const DOI_URL_MIXED = "https://doi.org/10.1234/MixedCase-Ref-Test";
const DOI_URL_RECASED = "https://DOI.ORG/10.1234/MIXEDCASE-REF-TEST";
const DOI_URL_LOWER = "https://doi.org/10.1234/mixedcase-ref-test";
const REMOVED_REFERENCE_URL = "https://example.com/removed-reference";
const CURRENT_REFERENCE_URL = "https://example.com/current-reference";

describe("reference URL casing on publish (depends on real DB collation)", () => {
  it("preserves non-DOI URL casing, lowercases DOI URLs, and dedupes a re-cased DOI onto one row", async () => {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);

    const slug = "ref-case-pub-longer";
    const createResp = await client.post("/api/publications").send({
      slug,
      title: "Ref Case Pub",
      abstract: "Abstract text.",
      body: `See [](${YOUTUBE_URL}) and [](${DOI_URL_MIXED}).`,
    });
    expect(createResp.status).toBe(201);

    // extractAndStoreReferencesFast runs fire-and-forget after create; wait for it.
    await waitForRows(
      `SELECT id_int FROM \`references\` WHERE url = '${DOI_URL_LOWER}'`,
      { timeoutMs: 6000 }
    );

    const getResp = await client.get(`/api/publications/${slug}`);
    expect(getResp.status).toBe(200);
    const urls = (
      getResp.body.publication.references as Array<{ url: string }>
    ).map((r) => r.url);
    // Non-DOI casing is preserved exactly as submitted.
    expect(urls).toContain(YOUTUBE_URL);
    // DOI casing is fully lowercased, never stored as originally submitted.
    expect(urls).toContain(DOI_URL_LOWER);
    expect(urls).not.toContain(DOI_URL_MIXED);

    // Update with differently-cased URLs.
    const draftResp = await client.post(`/api/publications/${slug}/draft`);
    expect(draftResp.status).toBe(200);

    const updateResp = await client.put(`/api/publications/${slug}`).send({
      abstract: "Abstract text.",
      body: `See [](${YOUTUBE_URL}) and [](${YOUTUBE_URL_RECASED}). and [](${DOI_URL_RECASED}).`,
    });
    expect(updateResp.status).toBe(200);

    await client.post("/api/publications/add_contrib").send({
      slug,
      username: user.username,
      role: "author",
      in_byline: true,
    });

    // Test that updating the publication with differently-cased URLs works correctly
    const republishResp = await client.post(
      `/api/publications/${slug}/publish`
    );
    expect(republishResp.status).toBe(200);

    // There is no way to await the DELETE and re-INSERT that
    // `extractAndStoreReferences` runs, because the beginning and end states
    // are the same.
    // This hopes that 1s is long enough to run those queries.
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const postPublishGetResp = await client.get(`/api/publications/${slug}`);
    expect(postPublishGetResp.status).toBe(200);
    const postPublishUrls = (
      postPublishGetResp.body.publication.references as Array<{ url: string }>
    ).map((r) => r.url);
    // The DOI should be converted to lowercase
    expect(postPublishUrls).toContain(DOI_URL_LOWER);
    // The YouTube URLs should preserve their original casing
    expect(postPublishUrls).toContain(YOUTUBE_URL);
    expect(postPublishUrls).toContain(YOUTUBE_URL_RECASED);

    // Only one row for the DOI
    const doiRefRows = await query<{ url: string }>(
      `SELECT url FROM \`references\` WHERE LOWER(url) = LOWER('${DOI_URL_LOWER}')`
    );
    expect(doiRefRows).toHaveLength(1);
    expect(doiRefRows[0]!.url).toBe(DOI_URL_LOWER);

    const ytRefRows = await query<{ url: string }>(
      `SELECT url FROM \`references\` WHERE LOWER(url) = LOWER('${YOUTUBE_URL}')`
    );
    expect(ytRefRows).toHaveLength(2);
  });

  it("keeps the body link's casing when a bibtex block's url differs only in case", async () => {
    const { client, user, userId } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);

    // The bibtex url={} field is looked up case-insensitively against the
    // body's actual link (see buildBibtexUrlToFormattedTextMap /
    // extractAndStoreReferences), but the reference that gets stored must
    // keep the body link's own casing - never the bibtex block's casing,
    // and never a lowercased form.
    const bibtexUrl = "https://Example.com/Paper";
    const bodyLink = "https://example.com/paper";
    const slug = "ref-bibtex-case-pub";

    const createResp = await client.post("/api/publications").send({
      slug,
      title: "Ref Bibtex Case Pub",
      abstract: "Abstract text.",
      body: `See [](${bodyLink}).

:::bibtex
@article{sample-paper,
  title = {Sample Paper},
  author = {Doe, Jane},
  year = {2023},
  url = {${bibtexUrl}}
}
:::`,
    });
    expect(createResp.status).toBe(201);

    await client.post("/api/publications/add_contrib").send({
      slug,
      username: user.username,
      role: "author",
      in_byline: true,
    });

    const publishResp = await client.post(`/api/publications/${slug}/publish`);
    expect(publishResp.status).toBe(200);

    await waitForRows(
      `SELECT 1 FROM \`references\` WHERE url like 'https://%'`,
      {
        timeoutMs: 6000,
      }
    );

    const getResp = await client.get(`/api/publications/${slug}`);
    expect(getResp.status).toBe(200);

    const refs = getResp.body.publication.references as Array<{
      url: string;
      text: string;
    }>;

    const matched = refs.find((r) => r.url === bodyLink);
    expect(matched).toBeDefined();
    expect(matched!.text).toBe("Doe J. (2023). Sample Paper.");
    expect(refs.map((r) => r.url)).not.toContain(bibtexUrl);
  });
});

describe("reference reconciliation before DOI minting", () => {
  it("excludes references removed from a draft from the DataCite payload", async () => {
    const { client, user, userId, userIds } = await registerUserWithId();
    await seedSiteAdmin(userId);
    await client.login(user.username, user.password);

    const slug = "ref-reconcile-before-mint";
    const createResp = await client.post("/api/publications").send({
      slug,
      title: "Reference Reconciliation Before Minting",
      abstract: "Abstract text.",
      body: `See [](${REMOVED_REFERENCE_URL}).`,
    });
    expect(createResp.status).toBe(201);

    // The create fast path runs asynchronously. Wait until the initial
    // reference is linked before updating. The initial link should exist in the database.
    const initialLinks = await waitForRows<{ url: string }>(
      `SELECT r.url FROM version_references vr JOIN \`references\` r ON r.id_int = vr.reference_id_int JOIN versions v ON v.id_int = vr.version_id_int JOIN publications p ON p.id_int = v.publication_id_int WHERE p.slug = '${slug}' AND r.url = '${REMOVED_REFERENCE_URL}'`,
      { timeoutMs: 6000 }
    );
    expect(initialLinks).toHaveLength(1);
    expect(initialLinks.map((row) => row.url)).toEqual([REMOVED_REFERENCE_URL]);

    const updateResp = await client.put(`/api/publications/${slug}`).send({
      abstract: "Abstract text.",
      body: `See [](${CURRENT_REFERENCE_URL}).`,
    });
    expect(updateResp.status).toBe(200);

    // **Only** the updated link should exist in the database.
    const currentLinks = await waitForRows<{ url: string }>(
      `SELECT r.url FROM version_references vr JOIN \`references\` r ON r.id_int = vr.reference_id_int JOIN versions v ON v.id_int = vr.version_id_int JOIN publications p ON p.id_int = v.publication_id_int WHERE p.slug = '${slug}' AND r.url = '${CURRENT_REFERENCE_URL}'`,
      { timeoutMs: 6000 }
    );
    expect(currentLinks).toHaveLength(1);
    const prePublishLinks = await query<{ url: string }>(
      `SELECT r.url FROM version_references vr JOIN \`references\` r ON r.id_int = vr.reference_id_int JOIN versions v ON v.id_int = vr.version_id_int JOIN publications p ON p.id_int = v.publication_id_int WHERE p.slug = '${slug}' ORDER BY r.url`
    );
    expect(prePublishLinks.map((row) => row.url)).toEqual([
      CURRENT_REFERENCE_URL,
    ]);

    const { orgIdInt } = await seedDoiMintingOrg(
      "Reference Reconciliation Org",
      "reference-reconciliation-org"
    );
    await seedOrgMember(orgIdInt, userIds);
    const addOrgResp = await client
      .post("/api/publications/add_org")
      .send({ slug, org_id: orgIdInt });
    expect(addOrgResp.status).toBe(200);

    await client.post("/api/publications/add_contrib").send({
      slug,
      username: user.username,
      role: "author",
      in_byline: true,
    });

    await resetDataciteMock();
    const publishResp = await client.post(`/api/publications/${slug}/publish`);
    expect(publishResp.status).toBe(200);
    expect(publishResp.body.doi).toBeTruthy();

    const calls = await getDataciteMockCalls();
    const canonicalCreate = calls.find(
      (call) =>
        call.method === "POST" &&
        call.body?.data?.attributes?.["prefix"] === "10.83972"
    );
    expect(canonicalCreate).toBeDefined();
    const relatedIdentifiers = canonicalCreate!.body?.data?.attributes?.[
      "relatedIdentifiers"
    ] as Array<{ relatedIdentifier: string; relationType: string }>;
    const referenceUrls = relatedIdentifiers
      .filter((relation) => relation.relationType === "References")
      .map((relation) => relation.relatedIdentifier);
    expect(referenceUrls).toEqual([CURRENT_REFERENCE_URL]);
  });
});
