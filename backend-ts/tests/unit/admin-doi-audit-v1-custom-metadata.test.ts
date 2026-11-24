import { compareCanonicalDoiMetadata } from "#src/api-v1/routes/admin/doi-audits/helpers/compare-canonical-doi-metadata.js";
import { compareVersionDoiMetadata } from "#src/api-v1/routes/admin/doi-audits/helpers/compare-version-doi-metadata.js";
import { type MetadataComparisonResult } from "#src/api-v1/routes/admin/doi-audits/helpers/to-comparable.js";
import { initConfig } from "#src/config.js";
import {
  DEFAULT_DOI_METADATA,
  type DoiMetadataDataCite,
} from "#src/db/schema.js";
import {
  type CanonicalMetadata,
  type VersionMetadata,
} from "#src/lib/datacite/client.js";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const CANONICAL_DOI = "10.83972/custom-metadata";
const VERSION_DOI = `${CANONICAL_DOI}.1`;

const customDoiMetadata: DoiMetadataDataCite = {
  type: "datacite",
  content: {
    language: "fr",
    types: { resourceTypeGeneral: "Dataset", resourceType: "Survey data" },
    subjects: [
      {
        subject: "FOS: Earth and related environmental sciences",
        subjectScheme: "Fields of Science and Technology (FOS)",
      },
    ],
  },
};

const versionMeta: VersionMetadata = {
  abstract: "An abstract.",
  title: "A Test Title",
  subtitle: "",
  license: "CC BY",
  creators: [{ name: "Doe, Jane" }],
  contributors: [],
  doiMetadata: customDoiMetadata,
  publicationYear: 2025,
  slug: "custom-metadata",
  references: [],
  supplements: [],
  publishDate: "2025-09-25",
  versionDesc: null,
  canonicalDoi: CANONICAL_DOI,
  previousVersionDoi: null,
  versionNumber: 1,
};

const canonicalMeta: CanonicalMetadata = {
  creators: [{ name: "Doe, Jane" }],
  contributors: [],
  references: [],
  supplements: [],
  versionDois: [VERSION_DOI],
  dates: [{ date: "2025-09-25", dateType: "Issued" }],
};

const comparisons = [
  {
    name: "compareVersionDoiMetadata",
    compare: () => compareVersionDoiMetadata(VERSION_DOI, versionMeta),
  },
  {
    name: "compareCanonicalDoiMetadata",
    compare: () =>
      compareCanonicalDoiMetadata(CANONICAL_DOI, canonicalMeta, versionMeta),
  },
];

describe("v1 DOI comparison with a publication's stored DOI metadata", () => {
  const fetchMock = vi.fn();
  const originalDataciteName = process.env.DATACITE_NAME;
  const originalDatacitePassword = process.env.DATACITE_PASSWORD;

  beforeAll(() => {
    process.env.DATACITE_NAME = "test-datacite-name";
    process.env.DATACITE_PASSWORD = "test-datacite-password";
    initConfig("tests/raven.test.toml");
  });

  afterAll(() => {
    if (originalDataciteName === undefined) delete process.env.DATACITE_NAME;
    else process.env.DATACITE_NAME = originalDataciteName;
    if (originalDatacitePassword === undefined)
      delete process.env.DATACITE_PASSWORD;
    else process.env.DATACITE_PASSWORD = originalDatacitePassword;
    initConfig("tests/raven.test.toml");
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  function dataciteReturns(attributes: Record<string, unknown>) {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ data: { attributes } }),
    });
  }

  // What The Stacks would send for this DOI: a comparison against a DOI
  // DataCite doesn't have still returns it.
  async function stacksAttributes(
    compare: () => Promise<MetadataComparisonResult>
  ) {
    fetchMock.mockResolvedValueOnce({ status: 404 });
    const { found, stacksMetadata } = await compare();
    expect(found).toBe(false);
    return stacksMetadata;
  }

  it.each(comparisons)(
    "$name sends the stored language, types and subjects",
    async ({ compare }) => {
      const sent = await stacksAttributes(compare);

      expect(sent).toMatchObject(customDoiMetadata.content);
    }
  );

  it.each(comparisons)(
    "$name reports a match when DataCite has the stored values",
    async ({ compare }) => {
      dataciteReturns(await stacksAttributes(compare));

      const result = await compare();

      expect(result.found).toBe(true);
      expect(result.matches).toBe(true);
      expect(result.diffs).toEqual([]);
    }
  );

  it.each(comparisons)(
    "$name reports only language, types and subjects when DataCite still has the defaults",
    async ({ compare }) => {
      dataciteReturns({
        ...(await stacksAttributes(compare)),
        ...DEFAULT_DOI_METADATA.content,
      });

      const result = await compare();

      expect(result.matches).toBe(false);
      expect(result.diffs).toEqual([
        { field: "language", expected: "fr", actual: "en" },
        {
          field: "types",
          expected: {
            resourceTypeGeneral: "Dataset",
            resourceType: "Survey data",
          },
          actual: { resourceTypeGeneral: "Other", resourceType: "Article" },
        },
        {
          field: "subjects",
          expected: [
            expect.objectContaining({
              subject: "FOS: Earth and related environmental sciences",
              subjectScheme: "Fields of Science and Technology (FOS)",
            }),
          ],
          actual: [
            expect.objectContaining({
              subject: "FOS: Biological sciences",
              subjectScheme: "Fields of Science and Technology (FOS)",
            }),
          ],
        },
      ]);
    }
  );
});
