import {
  buildPushAttributes,
  pushableDiffFields,
} from "#src/api-v1/routes/admin/doi-audits/helpers/build-push-attributes.js";
import { compareCanonicalDoiMetadata } from "#src/api-v1/routes/admin/doi-audits/helpers/compare-canonical-doi-metadata.js";
import { compareVersionDoiMetadata } from "#src/api-v1/routes/admin/doi-audits/helpers/compare-version-doi-metadata.js";
import { comparisonFingerprint } from "#src/api-v1/routes/admin/doi-audits/helpers/comparison-fingerprint.js";
import { formatComparisonAsText } from "#src/api-v1/routes/admin/doi-audits/helpers/format-comparison-as-text.js";
import { pushDiffsToDataCite } from "#src/api-v1/routes/admin/doi-audits/helpers/push-diffs-to-data-cite.js";
import {
  diffComparable,
  toComparable,
  type MetadataComparisonResult,
  type MetadataFieldDiff,
  type StacksAttributes,
} from "#src/api-v1/routes/admin/doi-audits/helpers/to-comparable.js";
import { getConfig, initConfig } from "#src/config.js";
import { DEFAULT_DOI_METADATA } from "#src/db/schema.js";
import {
  _buildCanonicalDates,
  type CanonicalMetadata,
  type VersionMetadata,
} from "#src/lib/datacite/client.js";
import {
  type DateEntry,
  type Description,
  type DoiAttributes,
  type RelatedIdentifier,
} from "#src/types/datacite.js";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// These fixtures differ from what The Stacks would send in every curated
// field, so every normalizer runs. The pinned fingerprints guard against a
// change that would refuse pushes an admin has already reviewed.
const VERSION_FINGERPRINT =
  "3fc7a2291110b2434ae425099bccfa024b6549902ce61a0dd200569d76dc21e3";
const CANONICAL_FINGERPRINT =
  "48f1fef583324581418334adafd9c3864255b907d25b661970457433006c8dd9";

const CANONICAL_DOI = "10.83972/pin-fixture";
const VERSION_DOI = `${CANONICAL_DOI}.2`;

const creators: VersionMetadata["creators"] = [
  {
    name: "Doe, Jane",
    givenName: "Jane",
    familyName: "Doe",
    nameType: "Personal",
    nameIdentifiers: [
      {
        nameIdentifier: "https://orcid.org/0000-0002-1825-0097",
        nameIdentifierScheme: "ORCID",
        schemeUri: "https://orcid.org",
      },
    ],
    affiliation: [{ name: "Zeta Lab" }, { name: "Alpha Institute" }],
  },
];

const versionMeta: VersionMetadata = {
  abstract: "An *abstract*.",
  title: "A Test Title",
  subtitle: "A Subtitle",
  license: "CC BY",
  creators,
  contributors: [],
  doiMetadata: DEFAULT_DOI_METADATA,
  publicationYear: 2025,
  slug: "pin-fixture",
  references: [{ url: "https://doi.org/10.1234/Ref" }],
  supplements: [{ type: "data", url: "https://example.org/d", name: "Data" }],
  publishDate: "2025-09-25",
  versionDesc: "Second version.",
  canonicalDoi: CANONICAL_DOI,
  previousVersionDoi: `${CANONICAL_DOI}.1`,
  versionNumber: 2,
};

const canonicalMeta: CanonicalMetadata = {
  creators,
  contributors: [],
  references: [{ url: "https://doi.org/10.1234/Ref" }],
  supplements: [{ type: "data", url: "https://example.org/d", name: "Data" }],
  versionDois: [`${CANONICAL_DOI}.1`, VERSION_DOI],
  dates: [
    { date: "2025-01-10", dateType: "Issued" },
    {
      date: "2025-09-25",
      dateType: "Updated",
      dateInformation: "Second version.",
    },
  ],
};

// A DataCite record as GET returns it: nulls where a value is unset, a
// stale title and subtitle, a different creator ORCID, a rights URI more
// specific than the one sent, and a relation The Stacks doesn't send.
const dataciteRecord = {
  doi: VERSION_DOI,
  titles: [
    { title: "A Stale Title", titleType: null, lang: null },
    { title: "A Stale Subtitle", titleType: "Subtitle" },
  ],
  descriptions: [{ description: "Old abstract.", descriptionType: "Abstract" }],
  publisher: { name: "Someone Else" },
  publicationYear: 2024,
  url: "https://example.com/elsewhere",
  version: "1",
  language: null,
  types: {
    resourceTypeGeneral: "Text",
    resourceType: "Article",
    schemaOrg: "ScholarlyArticle",
  },
  subjects: [],
  rightsList: [
    {
      rights: "Creative Commons Attribution 4.0 International",
      rightsIdentifier: "cc-by-4.0",
      rightsUri: "https://creativecommons.org/licenses/by/4.0/legalcode",
    },
  ],
  creators: [
    {
      name: "Doe, Jane",
      nameIdentifiers: [
        {
          nameIdentifier: "https://orcid.org/0000-0001-0000-0000",
          nameIdentifierScheme: "ORCID",
        },
      ],
      affiliation: [{ name: "Alpha Institute" }],
    },
  ],
  contributors: [],
  dates: [{ date: "2025-09-25", dateType: "Issued", dateInformation: null }],
  relatedIdentifiers: [
    {
      relatedIdentifier: "10.1234/REF",
      relatedIdentifierType: "DOI",
      relationType: "References",
    },
    {
      relatedIdentifier: "https://example.org/Extra",
      relatedIdentifierType: "URL",
      relationType: "IsSupplementedBy",
    },
  ],
};

// Every curated field differs from the stale record above.
const DIFF_FIELDS: string[] = [
  "title",
  "subtitle",
  "abstract",
  "publisher",
  "publicationYear",
  "url",
  "version",
  "language",
  "types",
  "subjects",
  "rightsList",
  "creators",
  "contributors",
  "dates",
  "relatedIdentifiers",
];
const PUSHABLE_FIELDS = DIFF_FIELDS.filter((field) => field !== "url");

function formattedField(field: string, stacks: string, datacite: string) {
  return `${field}\n\nThe Stacks:\n${stacks}\n\nDataCite:\n${datacite}`;
}

function expectDerivedFields(
  result: MetadataComparisonResult,
  {
    doi,
    pinnedFingerprint,
    url,
    version,
  }: { doi: string; pinnedFingerprint: string; url: string; version: string }
) {
  expect(result.diffs.map((diff) => diff.field)).toEqual(DIFF_FIELDS);
  expect(pushableDiffFields(result)).toEqual(PUSHABLE_FIELDS);
  expect(comparisonFingerprint(result)).toBe(pinnedFingerprint);

  const text = formatComparisonAsText(result);
  expect(text.startsWith(`=== ${doi} ===\n\n`)).toBe(true);
  expect(
    text.split("\n\n").filter((paragraph) => DIFF_FIELDS.includes(paragraph))
  ).toEqual(DIFF_FIELDS);
  expect(text).toContain(
    formattedField("title", "A Test Title", "A Stale Title")
  );
  expect(text).toContain(
    formattedField("subtitle", "A Subtitle", "A Stale Subtitle")
  );
  expect(text).toContain(
    formattedField("abstract", "An abstract.", "Old abstract.")
  );
  expect(text).toContain(
    formattedField("url", url, '"https://example.com/elsewhere"')
  );
  expect(text).toContain(formattedField("version", version, '"1"'));
}

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

describe("v1 DOI comparison", () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({ data: { attributes: dataciteRecord } }),
    });
  });

  it("compares a version DOI, with a pinned fingerprint", async () => {
    const result = await compareVersionDoiMetadata(VERSION_DOI, versionMeta);

    expectDerivedFields(result, {
      doi: VERSION_DOI,
      pinnedFingerprint: VERSION_FINGERPRINT,
      url: '"https://example.com/publications/pin-fixture/v2"',
      version: '"2"',
    });
  });

  it("compares a canonical DOI, with a pinned fingerprint", async () => {
    const result = await compareCanonicalDoiMetadata(
      CANONICAL_DOI,
      canonicalMeta,
      versionMeta
    );

    expectDerivedFields(result, {
      doi: CANONICAL_DOI,
      pinnedFingerprint: CANONICAL_FINGERPRINT,
      url: '"https://example.com/publications/pin-fixture"',
      version: "null",
    });
  });
});

// DataCite's GET returns null for unset values, which DoiAttributes (optional
// only) doesn't model.
function asDataciteAttributes(attrs: object): DoiAttributes {
  return attrs as DoiAttributes;
}

describe("toComparable", () => {
  it("extracts and normalizes DataCite attributes into a comparable shape", () => {
    const comparable = toComparable(
      asDataciteAttributes({
        titles: [
          { lang: "en", title: "A Test Subtitle", titleType: "Subtitle" },
          { lang: "en", title: "A Test Title", titleType: null },
        ],
        descriptions: [
          {
            lang: "en",
            description: "An abstract.",
            descriptionType: "Abstract",
          },
        ],
        publisher: "Astera Institute",
        publicationYear: 2025,
        url: "https://thestacks.org/publications/test",
        version: "1",
        language: "en",
        // ris/bibtex/citeproc/schemaOrg simulate DataCite's own GET-response
        // enrichment -- Stacks never sends these, so they must be dropped
        // rather than compared.
        types: {
          resourceTypeGeneral: "Other",
          resourceType: "Article",
          ris: "GEN",
          bibtex: "misc",
          citeproc: "article",
          schemaOrg: "CreativeWork",
        },
        subjects: [
          { subject: "B Subject", subjectScheme: "FOS" },
          {
            subject: "A Subject",
            subjectScheme: "FOS",
            schemeUri: "https://example.org/fos",
            classificationCode: "1.6",
          },
        ],
        rightsList: [
          {
            rights: "Creative Commons Attribution 4.0 International",
            rightsIdentifier: "cc-by-4.0",
            rightsUri: "https://creativecommons.org/licenses/by/4.0/legalcode",
            schemeUri: "https://spdx.org/licenses/",
            rightsIdentifierScheme: "SPDX",
          },
        ],
        creators: [
          {
            name: "Doe, Jane",
            nameType: "Personal",
            givenName: "Jane",
            familyName: "Doe",
            affiliation: [{ name: "Arcadia Science" }],
            nameIdentifiers: [
              {
                nameIdentifier: "https://orcid.org/0000-0001-2345-6789",
                nameIdentifierScheme: "ORCID",
                schemeUri: "https://orcid.org",
              },
            ],
          },
        ],
        contributors: [],
        // "Available" is DataCite-generated on registration, never something
        // Stacks submits -- it should be filtered out, not compared.
        dates: [
          { date: "2025-09-25", dateType: "Available", dateInformation: null },
          { date: "2025-09-25", dateType: "Issued" },
        ],
        relatedIdentifiers: [
          {
            relatedIdentifier: "https://doi.org/10.5281/ZENODO.123",
            relatedIdentifierType: "DOI",
            relationType: "IsSupplementedBy",
            resourceTypeGeneral: "Dataset",
          },
          {
            relatedIdentifier: "https://GitHub.com/Arcadia-Science/Repo",
            relatedIdentifierType: "URL",
            relationType: "References",
            resourceTypeGeneral: "Software",
          },
        ],
      })
    );

    // Picked by titleType, not position.
    expect(comparable.title).toBe("A Test Title");
    expect(comparable.subtitle).toBe("A Test Subtitle");
    expect(comparable.abstract).toBe("An abstract.");
    expect(comparable.publisher).toBe("Astera Institute");
    expect(comparable.publicationYear).toBe(2025);
    expect(comparable.url).toBe("https://thestacks.org/publications/test");
    expect(comparable.version).toBe("1");
    expect(comparable.language).toBe("en");
    // ris/bibtex/citeproc/schemaOrg dropped -- only what Stacks actually
    // submits is comparable.
    expect(comparable.types).toEqual({
      resourceTypeGeneral: "Other",
      resourceType: "Article",
    });
    // Sorted by subject, and classificationCode/schemeUri preserved (missing
    // on one side becomes a real, comparable null rather than being dropped).
    expect(comparable.subjects).toEqual([
      {
        subject: "A Subject",
        subjectScheme: "FOS",
        schemeUri: "https://example.org/fos",
        classificationCode: "1.6",
      },
      {
        subject: "B Subject",
        subjectScheme: "FOS",
        schemeUri: null,
        classificationCode: null,
      },
    ]);
    expect(comparable.rightsList).toEqual([
      {
        rights: "Creative Commons Attribution 4.0 International",
        rightsIdentifier: "cc-by-4.0",
        rightsUri: "https://creativecommons.org/licenses/by/4.0/legalcode",
        schemeUri: "https://spdx.org/licenses/",
        rightsIdentifierScheme: "SPDX",
      },
    ]);
    expect(comparable.creators).toEqual([
      {
        name: "Doe, Jane",
        givenName: "Jane",
        familyName: "Doe",
        orcid: "https://orcid.org/0000-0001-2345-6789",
        affiliations: ["Arcadia Science"],
      },
    ]);
    expect(comparable.contributors).toEqual([]);
    expect(comparable.dates).toEqual([
      { date: "2025-09-25", dateType: "Issued", dateInformation: null },
    ]);
    // DOIs are case-normalized, so a real casing difference from DataCite's
    // own DOI normalization doesn't show up as a false discrepancy -- but a
    // URL's path is case-sensitive, so its casing is left untouched.
    expect(comparable.relatedIdentifiers).toEqual([
      {
        relationType: "IsSupplementedBy",
        relatedIdentifierType: "DOI",
        relatedIdentifier: "https://doi.org/10.5281/zenodo.123",
        resourceTypeGeneral: "Dataset",
      },
      {
        relationType: "References",
        relatedIdentifierType: "URL",
        relatedIdentifier: "https://GitHub.com/Arcadia-Science/Repo",
        resourceTypeGeneral: "Software",
      },
    ]);
  });

  it("sorts relatedIdentifiers deterministically even when relationType+relatedIdentifier tie", () => {
    // Mirrors buildSupplementRelated's "data+code" case: two entries sharing
    // the same relationType/relatedIdentifier/relatedIdentifierType, differing
    // only in resourceTypeGeneral -- the two sides list them in opposite
    // order, which shouldn't register as a diff once sorted.
    const softwareThenDataset: RelatedIdentifier = {
      relatedIdentifier: "https://github.com/arcadia-science/repo",
      relatedIdentifierType: "URL",
      relationType: "IsSupplementedBy",
    };
    const expected = toComparable({
      relatedIdentifiers: [
        { ...softwareThenDataset, resourceTypeGeneral: "Software" },
        { ...softwareThenDataset, resourceTypeGeneral: "Dataset" },
      ],
    });
    const actual = toComparable({
      relatedIdentifiers: [
        { ...softwareThenDataset, resourceTypeGeneral: "Dataset" },
        { ...softwareThenDataset, resourceTypeGeneral: "Software" },
      ],
    });

    const normalizedSoftwareThenDataset = {
      relationType: "IsSupplementedBy",
      relatedIdentifierType: "URL",
      relatedIdentifier: "https://github.com/arcadia-science/repo",
    };
    const sorted = [
      { ...normalizedSoftwareThenDataset, resourceTypeGeneral: "Dataset" },
      { ...normalizedSoftwareThenDataset, resourceTypeGeneral: "Software" },
    ];
    expect(expected.relatedIdentifiers).toEqual(sorted);
    expect(actual.relatedIdentifiers).toEqual(sorted);
    expect(diffComparable(expected, actual)).toEqual([]);
  });

  it("sorts dates deterministically even when date+dateType tie", () => {
    // Two versions published on the same calendar day both produce an
    // "Updated" entry with the same date, differing only in dateInformation
    // (each version's own description) -- the two sides list them in
    // opposite order, which shouldn't register as a diff once sorted.
    const sameDayEntries: DateEntry[] = [
      {
        date: "2026-03-09",
        dateType: "Updated",
        dateInformation: "Fixed typo",
      },
      {
        date: "2026-03-09",
        dateType: "Updated",
        dateInformation: "Added dataset",
      },
    ];
    const expected = toComparable({ dates: sameDayEntries });
    const actual = toComparable({ dates: [...sameDayEntries].reverse() });

    const sorted = [
      {
        date: "2026-03-09",
        dateType: "Updated",
        dateInformation: "Added dataset",
      },
      {
        date: "2026-03-09",
        dateType: "Updated",
        dateInformation: "Fixed typo",
      },
    ];
    expect(expected.dates).toEqual(sorted);
    expect(actual.dates).toEqual(sorted);
    expect(diffComparable(expected, actual)).toEqual([]);
  });

  it("returns null/empty defaults when fields are missing", () => {
    expect(toComparable({})).toEqual({
      title: null,
      subtitle: null,
      abstract: null,
      publisher: null,
      publicationYear: null,
      url: null,
      version: null,
      language: null,
      types: { resourceTypeGeneral: null, resourceType: null },
      subjects: [],
      rightsList: [],
      creators: [],
      contributors: [],
      dates: [],
      relatedIdentifiers: [],
    });
  });
});

describe("diffComparable", () => {
  // Built via toComparable (rather than hand-typed) so it's guaranteed to be
  // the exact shape diffComparable expects.
  const base = () =>
    toComparable({
      titles: [{ title: "Same Title" }],
      descriptions: [
        { description: "Same abstract.", descriptionType: "Abstract" },
      ],
      publisher: "Astera Institute",
      publicationYear: 2025,
      url: "https://thestacks.org/publications/test",
      version: "1",
      creators: [{ name: "Doe, Jane", givenName: "Jane", familyName: "Doe" }],
      contributors: [],
      dates: [{ date: "2025-09-25", dateType: "Issued" }],
      relatedIdentifiers: [],
    });

  it("returns no diffs when both sides match", () => {
    expect(diffComparable(base(), base())).toEqual([]);
  });

  it("reports a diff for each field that differs", () => {
    const expected = base();
    const actual = {
      ...base(),
      title: "Different Title",
      publicationYear: 2024,
    };

    const diffs = diffComparable(expected, actual);

    expect(diffs).toHaveLength(2);
    expect(diffs).toContainEqual({
      field: "title",
      expected: "Same Title",
      actual: "Different Title",
    });
    expect(diffs).toContainEqual({
      field: "publicationYear",
      expected: 2025,
      actual: 2024,
    });
  });

  it("treats differing array contents (e.g. creators) as a diff", () => {
    const expected = base();
    const actual = { ...base(), creators: [] };

    expect(diffComparable(expected, actual)).toEqual([
      { field: "creators", expected: expected.creators, actual: [] },
    ]);
  });

  it("reports a subtitle missing on DataCite as a diff", () => {
    const expected = toComparable({
      titles: [
        { lang: "en", title: "Same Title" },
        { lang: "en", title: "A Subtitle", titleType: "Subtitle" },
      ],
    });
    const actual = toComparable({ titles: [{ title: "Same Title" }] });

    expect(diffComparable(expected, actual)).toEqual([
      { field: "subtitle", expected: "A Subtitle", actual: null },
    ]);
  });

  describe("rightsList rightsUri", () => {
    const withRightsUri = (rightsUri: string) => ({
      ...base(),
      rightsList: [
        {
          rights: "Creative Commons Attribution 4.0 International",
          rightsIdentifier: "cc-by-4.0",
          rightsUri,
          schemeUri: "https://spdx.org/licenses/",
          rightsIdentifierScheme: "SPDX",
        },
      ],
    });

    it("matches when DataCite's URI starts with Stacks' URI", () => {
      const expected = withRightsUri(
        "https://creativecommons.org/licenses/by/4.0/"
      );
      const actual = withRightsUri(
        "https://creativecommons.org/licenses/by/4.0/legalcode"
      );

      expect(diffComparable(expected, actual)).toEqual([]);
    });

    it("matches a real Stacks/DataCite pair differing in URI and identifier case", () => {
      const expected = toComparable({
        rightsList: [
          {
            rights: "Creative Commons Attribution 4.0 International",
            rightsIdentifier: "CC-BY-4.0",
            rightsUri: "https://creativecommons.org/licenses/by/4.0/",
            schemeUri: "https://spdx.org/licenses/",
            rightsIdentifierScheme: "SPDX",
          },
        ],
      });
      const actual = toComparable({
        rightsList: [
          {
            rights: "Creative Commons Attribution 4.0 International",
            rightsUri: "https://creativecommons.org/licenses/by/4.0/legalcode",
            schemeUri: "https://spdx.org/licenses/",
            rightsIdentifier: "cc-by-4.0",
            rightsIdentifierScheme: "SPDX",
          },
        ],
      });

      expect(diffComparable(expected, actual)).toEqual([]);
    });

    it("reports a diff when Stacks' URI is the more specific one", () => {
      const expected = withRightsUri(
        "https://creativecommons.org/licenses/by/4.0/legalcode"
      );
      const actual = withRightsUri(
        "https://creativecommons.org/licenses/by/4.0/"
      );

      expect(diffComparable(expected, actual)).toEqual([
        {
          field: "rightsList",
          expected: expected.rightsList,
          actual: actual.rightsList,
        },
      ]);
    });

    it("reports a diff when the URIs are unrelated", () => {
      const expected = withRightsUri(
        "https://creativecommons.org/licenses/by/4.0/"
      );
      const actual = withRightsUri(
        "https://creativecommons.org/publicdomain/zero/1.0/"
      );

      expect(diffComparable(expected, actual)).toHaveLength(1);
    });
  });
});

describe("compareVersionDoiMetadata / compareCanonicalDoiMetadata", () => {
  function matchingVersionMeta(): VersionMetadata {
    return {
      abstract: "An abstract.",
      title: "A Test Title",
      subtitle: "",
      license: "CC BY",
      creators: [{ name: "Doe, Jane" }],
      contributors: [],
      doiMetadata: DEFAULT_DOI_METADATA,
      publicationYear: 2025,
      slug: "test",
      references: [],
      supplements: [],
      publishDate: "2025-09-25",
      versionDesc: null,
      canonicalDoi: "10.83972/pff0-ck46",
      previousVersionDoi: null,
      versionNumber: 1,
    };
  }

  function matchingCanonicalMeta(): CanonicalMetadata {
    return {
      creators: [{ name: "Doe, Jane" }],
      contributors: [],
      references: [],
      supplements: [],
      versionDois: ["10.83972/pff0-ck46.1"],
      dates: [{ date: "2025-09-25", dateType: "Issued" }],
    };
  }

  function expectedPublisher() {
    const name = getConfig().DATACITE_PUBLISHER;
    return name === "Astera Institute"
      ? {
          name,
          publisherIdentifier: "https://ror.org/00ydx1s47",
          publisherIdentifierScheme: "ROR",
          schemeUri: "https://ror.org",
        }
      : { name };
  }

  // Mirrors buildContributorsField/ASTERA_INSTITUTE_CONTRIBUTOR in
  // datacite.ts -- only added when DATACITE_PUBLISHER is "The Stacks".
  function expectedContributors() {
    return getConfig().DATACITE_PUBLISHER === "The Stacks"
      ? [
          {
            name: "Astera Institute",
            nameType: "Organizational",
            affiliation: [],
            contributorType: "HostingInstitution",
            nameIdentifiers: [
              {
                nameIdentifier: "https://astera.org",
                nameIdentifierScheme: "URL",
              },
              {
                nameIdentifier: "https://ror.org/00ydx1s47",
                nameIdentifierScheme: "ROR",
                schemeUri: "https://ror.org",
              },
            ],
          },
        ]
      : [];
  }

  function dataciteVersionAttributes(overrides: Record<string, unknown> = {}) {
    return {
      titles: [{ title: "A Test Title" }],
      descriptions: [
        { description: "An abstract.", descriptionType: "Abstract" },
      ],
      publisher: expectedPublisher(),
      publicationYear: 2025,
      url: `${getConfig().BASE_URL_WEB}/publications/test/v1`,
      version: "1",
      language: "en",
      types: { resourceTypeGeneral: "Other", resourceType: "Article" },
      subjects: [
        {
          subject: "FOS: Biological sciences",
          subjectScheme: "Fields of Science and Technology (FOS)",
        },
      ],
      rightsList: [
        {
          rights: "Creative Commons Attribution 4.0 International",
          rightsIdentifier: "CC-BY-4.0",
          rightsUri: "https://creativecommons.org/licenses/by/4.0/",
          schemeUri: "https://spdx.org/licenses/",
          rightsIdentifierScheme: "SPDX",
        },
      ],
      creators: [{ name: "Doe, Jane" }],
      contributors: expectedContributors(),
      dates: [{ date: "2025-09-25", dateType: "Issued" }],
      // buildVersionPayload always adds this relation when
      // matchingVersionMeta()'s canonicalDoi is set, so a matching fixture
      // needs it too.
      relatedIdentifiers: [
        {
          relatedIdentifier: "10.83972/pff0-ck46",
          relatedIdentifierType: "DOI",
          relationType: "IsVersionOf",
        },
      ],
      ...overrides,
    };
  }

  function dataciteCanonicalAttributes(
    overrides: Record<string, unknown> = {}
  ) {
    return {
      titles: [{ title: "A Test Title" }],
      descriptions: [
        { description: "An abstract.", descriptionType: "Abstract" },
      ],
      publisher: expectedPublisher(),
      publicationYear: 2025,
      url: `${getConfig().BASE_URL_WEB}/publications/test`,
      language: "en",
      types: { resourceTypeGeneral: "Other", resourceType: "Article" },
      subjects: [
        {
          subject: "FOS: Biological sciences",
          subjectScheme: "Fields of Science and Technology (FOS)",
        },
      ],
      rightsList: [
        {
          rights: "Creative Commons Attribution 4.0 International",
          rightsIdentifier: "CC-BY-4.0",
          rightsUri: "https://creativecommons.org/licenses/by/4.0/",
          schemeUri: "https://spdx.org/licenses/",
          rightsIdentifierScheme: "SPDX",
        },
      ],
      creators: [{ name: "Doe, Jane" }],
      contributors: expectedContributors(),
      dates: [{ date: "2025-09-25", dateType: "Issued" }],
      relatedIdentifiers: [
        {
          relatedIdentifier: "10.83972/pff0-ck46.1",
          relatedIdentifierType: "DOI",
          relationType: "HasVersion",
        },
      ],
      ...overrides,
    };
  }

  // A version minted as a draft and published later: one Issued entry and one
  // Updated entry, with no duplicate.
  const draftThenPublishedDates = () =>
    _buildCanonicalDates(
      [
        { versionNumber: 1, createdAt: "2025-06-01", versionDesc: null },
        {
          versionNumber: 2,
          createdAt: "2026-03-09",
          versionDesc: "Added supplementary data",
        },
      ],
      "2026-03-09"
    );

  it("compareVersionDoiMetadata reports a match when DataCite agrees with what Stacks would submit", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ data: { attributes: dataciteVersionAttributes() } }),
    });

    const result = await compareVersionDoiMetadata(
      "10.83972/pff0-ck46.1",
      matchingVersionMeta()
    );

    expect(result.found).toBe(true);
    expect(result.matches).toBe(true);
    expect(result.diffs).toEqual([]);
    expect(result.dataciteMetadata).not.toBeNull();
  });

  it("compareVersionDoiMetadata reports a diff when DataCite's title is stale", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        data: {
          attributes: dataciteVersionAttributes({
            titles: [{ title: "A Stale Title" }],
          }),
        },
      }),
    });

    const result = await compareVersionDoiMetadata(
      "10.83972/pff0-ck46.1",
      matchingVersionMeta()
    );

    expect(result.found).toBe(true);
    expect(result.matches).toBe(false);
    expect(result.diffs).toContainEqual({
      field: "title",
      expected: "A Test Title",
      actual: "A Stale Title",
    });
  });

  it("compareVersionDoiMetadata reports not-found but still returns Stacks' expected metadata", async () => {
    fetchMock.mockResolvedValueOnce({ status: 404 });

    const result = await compareVersionDoiMetadata(
      "10.83972/pff0-ck46.1",
      matchingVersionMeta()
    );

    expect(result.found).toBe(false);
    expect(result.matches).toBe(false);
    expect(result.diffs).toEqual([]);
    expect(result.dataciteMetadata).toBeNull();
    expect(result.stacksMetadata["titles"]).toEqual([
      { lang: "en", title: "A Test Title" },
    ]);
  });

  it("compareCanonicalDoiMetadata reports a match when DataCite agrees with what Stacks would submit", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        data: { attributes: dataciteCanonicalAttributes() },
      }),
    });

    const result = await compareCanonicalDoiMetadata(
      "10.83972/pff0-ck46",
      matchingCanonicalMeta(),
      matchingVersionMeta()
    );

    expect(result.found).toBe(true);
    expect(result.matches).toBe(true);
    expect(result.diffs).toEqual([]);
  });

  it("compareCanonicalDoiMetadata reports a match for a version minted as a draft and published later", async () => {
    const dates = draftThenPublishedDates();
    // Sanity-check the fixture is the two-entry shape this test assumes,
    // rather than passing vacuously.
    expect(dates).toHaveLength(2);

    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        data: { attributes: dataciteCanonicalAttributes({ dates }) },
      }),
    });

    const result = await compareCanonicalDoiMetadata(
      "10.83972/pff0-ck46",
      { ...matchingCanonicalMeta(), dates },
      matchingVersionMeta()
    );

    expect(result.found).toBe(true);
    expect(result.matches).toBe(true);
    expect(result.diffs).toEqual([]);
  });

  it("compareCanonicalDoiMetadata reports a diff when DataCite still has a stale duplicated Updated entry", async () => {
    // A legacy record with the old (pre-fix) duplicate should no longer
    // match, not be silently tolerated.
    const dates = draftThenPublishedDates();
    const staleDuplicatedDates = [...dates, dates.at(-1)];

    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        data: {
          attributes: dataciteCanonicalAttributes({
            dates: staleDuplicatedDates,
          }),
        },
      }),
    });

    const result = await compareCanonicalDoiMetadata(
      "10.83972/pff0-ck46",
      { ...matchingCanonicalMeta(), dates },
      matchingVersionMeta()
    );

    expect(result.found).toBe(true);
    expect(result.matches).toBe(false);
    expect(result.diffs).toContainEqual(
      expect.objectContaining({ field: "dates" })
    );
  });

  it("compareCanonicalDoiMetadata reports a diff when a HasVersion link is missing at DataCite", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        data: {
          attributes: dataciteCanonicalAttributes({ relatedIdentifiers: [] }),
        },
      }),
    });

    const result = await compareCanonicalDoiMetadata(
      "10.83972/pff0-ck46",
      matchingCanonicalMeta(),
      matchingVersionMeta()
    );

    expect(result.matches).toBe(false);
    expect(result.diffs).toContainEqual(
      expect.objectContaining({ field: "relatedIdentifiers" })
    );
  });

  it("compareCanonicalDoiMetadata reports not-found but still returns Stacks' expected metadata", async () => {
    fetchMock.mockResolvedValueOnce({ status: 404 });

    const result = await compareCanonicalDoiMetadata(
      "10.83972/pff0-ck46",
      matchingCanonicalMeta(),
      matchingVersionMeta()
    );

    expect(result.found).toBe(false);
    expect(result.dataciteMetadata).toBeNull();
    expect(result.stacksMetadata["titles"]).toEqual([
      { lang: "en", title: "A Test Title" },
    ]);
  });
});

describe("pushableDiffFields / buildPushAttributes / pushDiffsToDataCite", () => {
  const stacksMetadata: StacksAttributes = {
    doi: "10.83972/abcd",
    prefix: "10.83972",
    event: "publish",
    titles: [
      { lang: "en", title: "Stacks Title" },
      { lang: "en", title: "Sub", titleType: "Subtitle" },
    ],
    publisher: { name: "Astera Institute" },
    subjects: [{ subject: "FOS: Biological sciences" }],
    url: "https://thestacks.org/publications/test",
  };

  function result(
    diffFields: MetadataFieldDiff["field"][]
  ): MetadataComparisonResult {
    return {
      doi: "10.83972/abcd",
      found: true,
      matches: false,
      diffs: diffFields.map((field) => ({
        field,
        expected: null,
        actual: null,
      })),
      stacksMetadata,
      dataciteMetadata: {},
    };
  }

  it("sends only differing fields, mapped to their attribute keys, arrays whole", () => {
    expect(buildPushAttributes(result(["title", "subjects"]))).toEqual({
      titles: stacksMetadata.titles,
      subjects: stacksMetadata.subjects,
    });
  });

  it("sends titles once when both title and subtitle differ", () => {
    expect(buildPushAttributes(result(["title", "subtitle"]))).toEqual({
      titles: stacksMetadata.titles,
    });
  });

  it("never sends url", () => {
    const attributes = buildPushAttributes(result(["title", "url"]));

    expect(Object.keys(attributes)).toEqual(["titles"]);
  });

  it("lists only the fields a push would send", () => {
    expect(pushableDiffFields(result(["title", "url", "subjects"]))).toEqual([
      "title",
      "subjects",
    ]);
    expect(pushableDiffFields(result(["url"]))).toEqual([]);
  });

  it("clears a field The Stacks has no value for", () => {
    expect(
      buildPushAttributes(result(["abstract", "contributors", "version"]))
    ).toEqual({ descriptions: [], contributors: [], version: null });
  });

  describe("pushDiffsToDataCite", () => {
    it("PUTs the push attributes to the DOI's DataCite record", async () => {
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));

      expect(await pushDiffsToDataCite(result(["title", "url"]))).toBe(true);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(`${getConfig().DATACITE_API}/10.83972/abcd`);
      expect(init.method).toBe("PUT");
      expect(JSON.parse(init.body)).toEqual({
        data: {
          type: "dois",
          attributes: { titles: stacksMetadata.titles },
        },
      });
    });

    it("reports failure when DataCite rejects the update", async () => {
      fetchMock.mockResolvedValue(new Response("forbidden", { status: 403 }));

      expect(await pushDiffsToDataCite(result(["subjects"]))).toBe(false);
    });
  });
});

describe("comparisonFingerprint", () => {
  const titles: StacksAttributes["titles"] = [
    { lang: "en", title: "Stacks Title" },
    { lang: "en", title: "Old Subtitle", titleType: "Subtitle" },
  ];
  const descriptions: Description[] = [
    { description: "Abstract.", descriptionType: "Abstract" },
    { description: "Methods note.", descriptionType: "Methods" },
  ];
  const contributors: VersionMetadata["contributors"] = [
    { name: "Astera Institute", contributorType: "Sponsor" },
  ];
  const related: RelatedIdentifier[] = [
    {
      relatedIdentifier: "10.1234/ref",
      relatedIdentifierType: "DOI",
      relationType: "References",
    },
    {
      relatedIdentifier: "https://example.org/data",
      relatedIdentifierType: "URL",
      relationType: "IsSupplementedBy",
    },
  ];
  const reviewedFields: MetadataFieldDiff["field"][] = [
    "title",
    "abstract",
    "contributors",
    "relatedIdentifiers",
  ];

  function result(
    stacks: StacksAttributes = {},
    datacite: DoiAttributes = {}
  ): MetadataComparisonResult {
    return {
      doi: "10.83972/abcd",
      found: true,
      matches: false,
      diffs: reviewedFields.map((field) => ({
        field,
        expected: null,
        actual: null,
      })),
      stacksMetadata: {
        titles,
        descriptions,
        contributors,
        relatedIdentifiers: related,
        ...stacks,
      },
      dataciteMetadata: {
        titles: [{ title: "DataCite Title" }],
        descriptions: [],
        contributors: [],
        relatedIdentifiers: [],
        updated: "2026-09-01T00:00:00Z",
        ...datacite,
      },
    };
  }

  const reviewed = comparisonFingerprint(result());

  it("is the same for the same comparison", () => {
    expect(comparisonFingerprint(result())).toBe(reviewed);
  });

  it.each<[string, StacksAttributes]>([
    [
      "a non-Abstract description",
      {
        descriptions: [
          descriptions[0]!,
          { description: "Rewritten note.", descriptionType: "Methods" },
        ],
      },
    ],
    [
      "a contributor role",
      { contributors: [{ ...contributors[0]!, contributorType: "Funder" }] },
    ],
  ])(
    "changes when %s the comparison ignores changes in what would be sent",
    (_label, stacks) => {
      expect(comparisonFingerprint(result(stacks))).not.toBe(reviewed);
    }
  );

  it("changes when DataCite's value for a pushed attribute changes", () => {
    const changed = result({}, { titles: [{ title: "Edited Meanwhile" }] });

    expect(comparisonFingerprint(changed)).not.toBe(reviewed);
  });

  it("changes when the set of attributes to push changes", () => {
    const fewer = result();
    fewer.diffs = fewer.diffs.filter((d) => d.field !== "abstract");

    expect(comparisonFingerprint(fewer)).not.toBe(reviewed);
  });

  it("keeps meaningful order: reordering creators changes it", () => {
    const creators = [{ name: "Doe, Jane" }, { name: "Roe, Rich" }];
    const withCreators = (order: typeof creators) => {
      const r = result({ creators: order });
      r.diffs.push({ field: "creators", expected: null, actual: null });
      return comparisonFingerprint(r);
    };

    expect(withCreators([...creators].reverse())).not.toBe(
      withCreators(creators)
    );
  });

  it("ignores unordered arrays, key order, and fields DataCite rewrites itself", () => {
    const equivalent = result(
      {
        relatedIdentifiers: [...related].reverse(),
        contributors: [
          { contributorType: "Sponsor", name: "Astera Institute" },
        ],
      },
      { updated: "2026-09-29T12:00:00Z", viewCount: 12, state: "findable" }
    );

    expect(comparisonFingerprint(equivalent)).toBe(reviewed);
  });
});
