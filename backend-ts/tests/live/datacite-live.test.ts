import { initConfig } from "#src/config.js";
import { DEFAULT_DOI_METADATA } from "#src/db/schema.js";
import {
  _buildCanonicalPayload,
  _buildCreatorsMetadata,
  _buildVersionPayload,
  _dataciteUpdate,
  _mintDois,
  dataciteRawGet,
  type CanonicalMetadata,
} from "#src/lib/datacite/client.js";
import { Buffer } from "node:buffer";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const DATACITE_API = "https://api.test.datacite.org/dois";
const DATACITE_NAME = process.env.DATACITE_NAME ?? "";
const DATACITE_PASSWORD = process.env.DATACITE_PASSWORD ?? "";
const DATACITE_PREFIX = process.env.DATACITE_PREFIX ?? "";
const DATACITE_PUBLISHER = process.env.DATACITE_PUBLISHER || "The Stacks";

const SAMPLE_CREATORS: Parameters<typeof _buildCreatorsMetadata>[0] = [
  {
    firstName: "Jane",
    lastName: "Doe",
    orcid: "0000-0001-2345-6789",
    inByline: true,
    priority: 0,
    affiliations: [
      {
        orgId: "org-1",
        name: "Arcadia Science",
        rorId: "https://ror.org/052zd4v68",
      },
      { orgId: "org-2", name: "University of Example", rorId: null },
    ],
  },
  {
    firstName: "Bob",
    lastName: "Smith",
    orcid: null,
    inByline: false,
    priority: 1,
    affiliations: [],
  },
];

async function getDoi(doi: string) {
  const resp = await fetch(`${DATACITE_API}/${doi}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${DATACITE_NAME}:${DATACITE_PASSWORD}`).toString("base64")}`,
    },
  });
  expect(resp.status).toBe(200);
  return resp.json() as Promise<{
    data: { attributes: Record<string, unknown> };
  }>;
}

async function hideDoi(doi: string | null) {
  if (!doi) return;
  await fetch(`${DATACITE_API}/${doi}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/vnd.api+json",
      Authorization: `Basic ${Buffer.from(`${DATACITE_NAME}:${DATACITE_PASSWORD}`).toString("base64")}`,
    },
    body: JSON.stringify({
      data: { type: "dois", attributes: { event: "hide" } },
    }),
  });
}

describe.skipIf(!(DATACITE_NAME && DATACITE_PASSWORD && DATACITE_PREFIX))(
  "DataCite live",
  () => {
    beforeAll(() => {
      const configPath = join(tmpdir(), "raven-datacite-live.toml");
      writeFileSync(
        configPath,
        `
DATABASE_URI = "mysql://unused"
SERVER_DEBUG = true
JWT_SECRET_KEY = "test"
DATACITE_API = "${DATACITE_API}"
BASE_URL_WEB = "https://test.thestacks.org"
`
      );
      initConfig(relative(process.cwd(), configPath));
    });

    it("mints canonical and version DOIs for an initial publish", async () => {
      const [creators, contributors] = _buildCreatorsMetadata(SAMPLE_CREATORS);
      let canonicalDoi: string | null = null;
      let versionDoi: string | null = null;

      try {
        [canonicalDoi, versionDoi] = await _mintDois(
          {
            creators,
            contributors,
            dates: [],
            references: [{ url: "https://doi.org/10.1234/fake-ref" }],
            supplements: [
              {
                type: "code",
                url: "https://github.com/test/repo",
                name: "Code",
              },
            ],
            versionDois: [],
          },
          {
            title: "Live Test Publication",
            subtitle: "Live test publication subtitle",
            abstract: "Live DataCite test.",
            license: "CC BY",
            creators,
            contributors,
            publicationYear: 2026,
            doiMetadata: DEFAULT_DOI_METADATA,
            slug: "test-live-pub",
            versionNumber: 1,
            references: [{ url: "https://doi.org/10.1234/fake-ref" }],
            supplements: [
              {
                type: "code",
                url: "https://github.com/test/repo",
                name: "Code",
              },
            ],
            publishDate: "2026-03-09",
            versionDesc: "Initial release",
            canonicalDoi: null,
            previousVersionDoi: null,
          },
          { updateCanonical: true }
        );

        expect(canonicalDoi).toBeTruthy();
        expect(versionDoi).toBeTruthy();

        // The version DOI must be derived from the concept DOI's own suffix
        // (i.e. {concept-suffix}.{version-number}), not an unrelated
        // DataCite-auto-generated suffix.
        expect(versionDoi).toBe(`${canonicalDoi}.1`);

        const versionAttrs = (await getDoi(versionDoi!)).data.attributes;
        // Plain GET (no ?publisher=true) DataCite flattens publisher to a string.
        expect(versionAttrs.publisher).toBe(DATACITE_PUBLISHER);
        expect(versionAttrs.version).toBe("1");
        expect(versionAttrs.relatedIdentifiers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              relatedIdentifier: canonicalDoi,
              relatedIdentifierType: "DOI",
              relationType: "IsVersionOf",
            }),
          ])
        );

        const canonicalAttrs = (await getDoi(canonicalDoi!)).data.attributes;
        expect(canonicalAttrs.relatedIdentifiers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              relatedIdentifier: versionDoi,
              relatedIdentifierType: "DOI",
              relationType: "HasVersion",
            }),
          ])
        );
      } finally {
        await hideDoi(versionDoi);
        await hideDoi(canonicalDoi);
      }
    });

    it("derives a second version DOI from the existing concept DOI", async () => {
      const [creators, contributors] = _buildCreatorsMetadata(SAMPLE_CREATORS);
      let canonicalDoi: string | null = null;
      let versionOneDoi: string | null = null;
      let versionTwoDoi: string | null = null;

      try {
        const canonicalMeta: CanonicalMetadata = {
          creators,
          contributors,
          dates: [{ date: "2026-03-09", dateType: "Issued" }],
          references: [{ url: "https://doi.org/10.1234/fake-ref" }],
          supplements: [
            { type: "code", url: "https://github.com/test/repo", name: "Code" },
          ],
          versionDois: [] as string[],
        };

        [canonicalDoi, versionOneDoi] = await _mintDois(
          canonicalMeta,
          {
            title: "Live Multi-Version Test",
            subtitle: "Live multi-version test subtitle",
            abstract: "Live DataCite multi-version test, v1.",
            license: "CC BY",
            creators,
            contributors,
            publicationYear: 2026,
            doiMetadata: DEFAULT_DOI_METADATA,
            slug: "test-live-multi-version",
            versionNumber: 1,
            references: [{ url: "https://doi.org/10.1234/fake-ref" }],
            supplements: [
              {
                type: "code",
                url: "https://github.com/test/repo",
                name: "Code",
              },
            ],
            publishDate: "2026-03-09",
            versionDesc: "Initial release",
            canonicalDoi: null,
            previousVersionDoi: null,
          },
          { updateCanonical: true }
        );
        expect(canonicalDoi).toBeTruthy();
        expect(versionOneDoi).toBeTruthy();

        // Reuses `canonicalMeta` (already carrying versionOneDoi in
        // `versionDois` from the first mint) to mirror how a real caller
        // re-queries all published version DOIs before minting the next one.
        [, versionTwoDoi] = await _mintDois(
          canonicalMeta,
          {
            title: "Live Multi-Version Test",
            subtitle: "Live multi-version test subtitle",
            abstract: "Live DataCite multi-version test, v2.",
            license: "CC BY",
            creators,
            contributors,
            publicationYear: 2026,
            doiMetadata: DEFAULT_DOI_METADATA,
            slug: "test-live-multi-version",
            versionNumber: 2,
            references: [{ url: "https://doi.org/10.1234/fake-ref" }],
            supplements: [
              {
                type: "code",
                url: "https://github.com/test/repo",
                name: "Code",
              },
            ],
            publishDate: "2026-03-10",
            versionDesc: "Second release",
            canonicalDoi: canonicalDoi!,
            previousVersionDoi: versionOneDoi!,
          },
          { updateCanonical: true }
        );

        // The second version's DOI must derive from the SAME concept suffix
        // as the first, just with ".2" instead of ".1" -- not a fresh,
        // unrelated DataCite-generated suffix.
        expect(versionTwoDoi).toBe(`${canonicalDoi}.2`);

        const canonicalAttrs = (await getDoi(canonicalDoi!)).data.attributes;
        expect(canonicalAttrs.relatedIdentifiers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              relatedIdentifier: versionOneDoi,
              relatedIdentifierType: "DOI",
              relationType: "HasVersion",
            }),
            expect.objectContaining({
              relatedIdentifier: versionTwoDoi,
              relatedIdentifierType: "DOI",
              relationType: "HasVersion",
            }),
          ])
        );
      } finally {
        await hideDoi(versionTwoDoi);
        await hideDoi(versionOneDoi);
        await hideDoi(canonicalDoi);
      }
    });

    it("recovers the existing version DOI on a 422 already-taken repeat mint", async () => {
      const [creators, contributors] = _buildCreatorsMetadata(SAMPLE_CREATORS);
      let canonicalDoi: string | null = null;
      let versionDoi: string | null = null;

      try {
        const canonicalMeta: CanonicalMetadata = {
          creators,
          contributors,
          dates: [{ date: "2026-03-09", dateType: "Issued" }],
          references: [{ url: "https://doi.org/10.1234/fake-ref" }],
          supplements: [
            { type: "code", url: "https://github.com/test/repo", name: "Code" },
          ],
          versionDois: [] as string[],
        };
        const versionMeta = {
          title: "Live 422 Recovery Test",
          subtitle: "Live 422 recovery test subtitle",
          abstract: "Live DataCite 422 recovery test.",
          license: "CC BY",
          creators,
          contributors,
          publicationYear: 2026,
          doiMetadata: DEFAULT_DOI_METADATA,
          slug: "test-live-422-recovery",
          versionNumber: 1 as const,
          references: [{ url: "https://doi.org/10.1234/fake-ref" }],
          supplements: [
            { type: "code", url: "https://github.com/test/repo", name: "Code" },
          ],
          publishDate: "2026-03-09",
          versionDesc: "Initial release",
          canonicalDoi: null,
          previousVersionDoi: null,
        };

        [canonicalDoi, versionDoi] = await _mintDois(
          canonicalMeta,
          versionMeta,
          {
            updateCanonical: true,
          }
        );
        expect(canonicalDoi).toBeTruthy();
        expect(versionDoi).toBeTruthy();

        // Re-mint with the same concept DOI and version number, so DataCite
        // is asked to create the identical version DOI a second time. This
        // simulates a retried publish request; it should recover the
        // existing DOI via our already-taken (422) recovery handling rather
        // than failing the mint.
        const [, recoveredVersionDoi] = await _mintDois(
          { ...canonicalMeta, versionDois: [] },
          { ...versionMeta, canonicalDoi: canonicalDoi! },
          { updateCanonical: true }
        );
        expect(recoveredVersionDoi).toBe(versionDoi);
      } finally {
        await hideDoi(versionDoi);
        await hideDoi(canonicalDoi);
      }
    });

    it("transitions draft DOIs to findable", async () => {
      const [creators, contributors] = _buildCreatorsMetadata(SAMPLE_CREATORS);
      let canonicalDoi: string | null = null;
      let versionDoi: string | null = null;
      const references = [{ url: "https://doi.org/10.1234/draft-ref" }];
      const supplements = [
        { type: "code", url: "https://github.com/test/draft", name: "Code" },
      ];

      try {
        const versionMeta = {
          title: "Draft Lifecycle Test",
          abstract: "Draft lifecycle test abstract.",
          subtitle: "Draft lifecycle test subtitle",
          license: "CC BY",
          creators,
          contributors,
          publicationYear: 2026,
          doiMetadata: DEFAULT_DOI_METADATA,
          slug: "test-live-draft",
          versionNumber: 1 as const,
          references,
          supplements,
          publishDate: "2026-03-09",
          versionDesc: "Initial draft",
          canonicalDoi: null,
          previousVersionDoi: null,
        };
        [canonicalDoi, versionDoi] = await _mintDois(
          {
            creators,
            contributors,
            dates: [{ date: "2026-03-09", dateType: "Issued" }],
            references,
            supplements,
            versionDois: [],
          },
          versionMeta,
          { draft: true, updateCanonical: true }
        );
        expect((await getDoi(versionDoi!)).data.attributes.state).toBe("draft");
        expect((await getDoi(canonicalDoi!)).data.attributes.state).toBe(
          "draft"
        );

        const findableVersionMeta = { ...versionMeta, canonicalDoi };
        expect(
          await _dataciteUpdate(
            versionDoi!,
            await _buildVersionPayload(findableVersionMeta, { draft: false })
          )
        ).toBe(true);
        expect(
          await _dataciteUpdate(
            canonicalDoi!,
            await _buildCanonicalPayload(
              {
                creators,
                contributors,
                dates: [{ date: "2026-03-09", dateType: "Issued" }],
                references,
                supplements,
                versionDois: [versionDoi!],
              },
              findableVersionMeta,
              { draft: false }
            )
          )
        ).toBe(true);
        expect((await getDoi(versionDoi!)).data.attributes.state).toBe(
          "findable"
        );
        expect((await getDoi(canonicalDoi!)).data.attributes.state).toBe(
          "findable"
        );
      } finally {
        await hideDoi(versionDoi);
        await hideDoi(canonicalDoi);
      }
    });

    it("dataciteRawGet returns rich publisher and affiliation objects, not flattened strings", async () => {
      const [creators, contributors] = _buildCreatorsMetadata(SAMPLE_CREATORS);
      let canonicalDoi: string | null = null;
      let versionDoi: string | null = null;

      try {
        [canonicalDoi, versionDoi] = await _mintDois(
          {
            creators,
            contributors,
            dates: [],
            references: [],
            supplements: [],
            versionDois: [],
          },
          {
            title: "Live Raw Get Test",
            subtitle: "Live raw get test subtitle",
            abstract: "Live DataCite raw-get test.",
            license: "CC BY",
            creators,
            contributors,
            publicationYear: 2026,
            doiMetadata: DEFAULT_DOI_METADATA,
            slug: "test-live-raw-get",
            versionNumber: 1,
            references: [],
            supplements: [],
            publishDate: "2026-03-09",
            versionDesc: "Initial release",
            canonicalDoi: null,
            previousVersionDoi: null,
          },
          { updateCanonical: true }
        );
        expect(canonicalDoi).toBeTruthy();
        expect(versionDoi).toBeTruthy();

        const attrs = await dataciteRawGet(versionDoi!);
        expect(attrs).not.toBeNull();

        // dataciteRawGet opts into ?publisher=true, so this returns the rich object.
        expect(attrs!["publisher"]).toEqual(
          DATACITE_PUBLISHER === "Astera Institute"
            ? {
                name: DATACITE_PUBLISHER,
                publisherIdentifier: "https://ror.org/00ydx1s47",
                publisherIdentifierScheme: "ROR",
                schemeUri: "https://ror.org",
              }
            : { name: DATACITE_PUBLISHER }
        );

        // ?affiliation=true returns affiliation objects, not plain name strings.
        const creatorsBack = attrs!["creators"] as Array<
          Record<string, unknown>
        >;
        const janeDoe = creatorsBack.find((c) => c["name"] === "Doe, Jane");
        expect(janeDoe).toBeDefined();
        expect(janeDoe!["affiliation"]).toEqual(
          expect.arrayContaining([
            {
              name: "Arcadia Science",
              affiliationIdentifier: "https://ror.org/052zd4v68",
              affiliationIdentifierScheme: "ROR",
              schemeUri: "https://ror.org",
            },
            { name: "University of Example" },
          ])
        );
      } finally {
        await hideDoi(versionDoi);
        await hideDoi(canonicalDoi);
      }
    });
  }
);
