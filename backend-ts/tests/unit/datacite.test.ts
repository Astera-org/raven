import { type Repositories } from "#src/api-v1/db-repositories/index.js";
import { ConfigError, getConfig, initConfig } from "#src/config.js";
import {
  DEFAULT_DOI_METADATA,
  DoiMetadataSchema,
  type DoiMetadata,
  type DoiMetadataDataCite,
} from "#src/db/schema.js";
import {
  _buildCanonicalDates,
  _buildCanonicalPayload,
  _buildCreatorsMetadata,
  _buildReferenceRelated,
  _buildSupplementRelated,
  _buildVersionPayload,
  _deriveVersionDoi,
  _mintDois,
  dataciteRawGet,
  dataciteWebUrl,
  fetchDoiMetadata,
  mintDoiForNewVersion,
  mintDoiForNewVersionDraft,
  mintDoisForNewPub,
  publishDraftDois,
  type CanonicalMetadata,
} from "#src/lib/datacite/client.js";
import { DataciteRequestError } from "#src/lib/errors/datacite-request-error.js";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const listForDataciteMock = vi.fn<
  Repositories["contributors"]["listForDatacite"]
>(async () => []);
const listPublishedVersionsMock = vi.fn<
  Repositories["versions"]["listPublished"]
>(async () => []);
const findDoiMetadataMock = vi.fn<
  Repositories["publications"]["findDoiMetadata"]
>(async () => DEFAULT_DOI_METADATA);
const reposMock = {
  contributors: {
    listForDatacite: listForDataciteMock,
    listAllPublishedForDatacite: vi.fn(async () => []),
  },
  versions: {
    listPublished: listPublishedVersionsMock,
    listReferences: vi.fn(async () => []),
    listLinkedAssets: vi.fn(async () => []),
  },
  publications: {
    findDoiMetadata: findDoiMetadataMock,
    listPublishedReferences: vi.fn(async () => []),
    listPublishedLinkedAssets: vi.fn(async () => []),
  },
} as unknown as Repositories;

type VersionMetaFirst = Extract<
  Parameters<typeof _buildVersionPayload>[0],
  { versionNumber: 1 }
>;

function baseVersionMeta(): VersionMetaFirst {
  return {
    abstract: "",
    license: "CC BY",
    title: "Test",
    subtitle: "Test subtitle",
    creators: [],
    contributors: [],
    doiMetadata: DEFAULT_DOI_METADATA,
    publicationYear: 2026,
    slug: "test-new-pub",
    references: [],
    supplements: [],
    publishDate: "2026-03-09",
    versionDesc: null,
    canonicalDoi: null,
    previousVersionDoi: null,
    versionNumber: 1,
  };
}

function baseMintOpts() {
  return {
    slug: "test",
    title: "Test",
    subtitle: "Test subtitle",
    abstract: "",
    license: "CC BY",
    versionDesc: null as string | null,
    publishDate: "2026-03-09",
  };
}

beforeAll(() => {
  initConfig("tests/raven.test.toml");
});

describe("DoiMetadataSchema", () => {
  function withContent(
    overrides: Partial<DoiMetadata["content"]> | Record<string, unknown>
  ) {
    return {
      ...DEFAULT_DOI_METADATA,
      content: { ...DEFAULT_DOI_METADATA.content, ...overrides },
    };
  }

  it("accepts the default DOI metadata", () => {
    expect(DoiMetadataSchema.safeParse(DEFAULT_DOI_METADATA).success).toBe(
      true
    );
  });

  it("rejects an empty subjects array", () => {
    expect(
      DoiMetadataSchema.safeParse(withContent({ subjects: [] })).success
    ).toBe(false);
  });

  it("rejects an empty subject string", () => {
    expect(
      DoiMetadataSchema.safeParse(withContent({ subjects: [{ subject: "" }] }))
        .success
    ).toBe(false);
  });

  it.each(["EN", "eng", "e", "", "e1", "en-US"])(
    "rejects the language code %j",
    (language) => {
      expect(
        DoiMetadataSchema.safeParse(withContent({ language })).success
      ).toBe(false);
    }
  );
});

describe("fetchDoiMetadata", () => {
  beforeEach(() => {
    findDoiMetadataMock.mockClear();
  });

  it("returns the publication's custom DOI metadata, parsed", async () => {
    const custom: DoiMetadataDataCite = {
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
    findDoiMetadataMock.mockResolvedValueOnce({
      ...custom,
      unexpectedKey: "dropped",
    } as DoiMetadata);

    await expect(fetchDoiMetadata(reposMock, "42")).resolves.toEqual(custom);
    expect(findDoiMetadataMock).toHaveBeenCalledTimes(1);
    expect(findDoiMetadataMock).toHaveBeenCalledWith("42");
  });

  it("throws when the publication is not found", async () => {
    findDoiMetadataMock.mockResolvedValueOnce(undefined);

    await expect(fetchDoiMetadata(reposMock, "404")).rejects.toThrow(
      "Publication 404 not found"
    );
    expect(findDoiMetadataMock).toHaveBeenCalledTimes(1);
    expect(findDoiMetadataMock).toHaveBeenCalledWith("404");
  });
});

describe("DataCite metadata builders", () => {
  it("splits byline creators from contributors", () => {
    const [byline, contributors] = _buildCreatorsMetadata([
      {
        firstName: "Jane",
        lastName: "Doe",
        orcid: null,
        inByline: true,
        priority: 0,
        affiliations: [],
      },
      {
        firstName: "Bob",
        lastName: "Smith",
        orcid: null,
        inByline: false,
        priority: 1,
        affiliations: [],
      },
    ]);
    expect(byline).toHaveLength(1);
    expect(byline[0]!.name).toBe("Doe, Jane");
    expect(contributors).toHaveLength(1);
    expect(contributors[0]!.name).toBe("Smith, Bob");
    expect(contributors[0]!.contributorType).toBe("Other");
  });

  it("adds ORCID and ROR affiliations", () => {
    const [byline] = _buildCreatorsMetadata([
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
    ]);
    expect(byline[0]!.nameIdentifiers).toEqual([
      {
        nameIdentifier: "https://orcid.org/0000-0001-2345-6789",
        nameIdentifierScheme: "ORCID",
        schemeUri: "https://orcid.org",
      },
    ]);
    expect(byline[0]!.affiliation).toHaveLength(2);
    expect(byline[0]!.affiliation![0]?.affiliationIdentifier).toBe(
      "https://ror.org/052zd4v68"
    );
    expect(byline[0]!.affiliation![1]).not.toHaveProperty(
      "affiliationIdentifier"
    );
  });

  it("returns Unknown when no creator names are available", () => {
    expect(_buildCreatorsMetadata([])[0]).toEqual([{ name: "Unknown" }]);
    expect(
      _buildCreatorsMetadata([
        {
          firstName: "",
          lastName: "",
          orcid: null,
          inByline: true,
          priority: 0,
          affiliations: [],
        },
      ])[0]
    ).toEqual([{ name: "Unknown" }]);
  });

  it("builds supplemental related identifiers", () => {
    expect(
      _buildSupplementRelated([
        { type: "code", url: "https://github.com/repo", name: "Code" },
      ])[0]!.resourceTypeGeneral
    ).toBe("Software");
    expect(
      _buildSupplementRelated([
        { type: "data", url: "https://zenodo.org/123", name: "Data" },
      ])[0]!.resourceTypeGeneral
    ).toBe("Dataset");
    expect(
      _buildSupplementRelated([
        { type: "data+code", url: "https://github.com/repo", name: "Both" },
      ])
        .map((r) => r.resourceTypeGeneral)
        .sort()
    ).toEqual(["Dataset", "Software"]);
    expect(
      _buildSupplementRelated([
        { type: "protocol", url: "https://protocol.io/123", name: "Protocol" },
      ])[0]!.resourceTypeGeneral
    ).toBe("Other");
    expect(
      _buildSupplementRelated([{ type: "code", url: "", name: "Empty" }])
    ).toEqual([]);
    const doiSupplement = _buildSupplementRelated([
      {
        type: "data",
        url: "https://dx.doi.org/10.5121/ijdms.2023.15101",
        name: "DOI Data",
      },
    ])[0]!;
    expect(doiSupplement.relatedIdentifierType).toBe("DOI");
    expect(doiSupplement.relatedIdentifier).toBe("10.5121/ijdms.2023.15101");
  });

  it("builds reference related identifiers", () => {
    const doiUrl = _buildReferenceRelated([
      { url: "https://doi.org/10.1234/test" },
    ])[0]!;
    expect(doiUrl.relatedIdentifierType).toBe("DOI");
    expect(doiUrl.relatedIdentifier).toBe("10.1234/test");

    const bareDoi = _buildReferenceRelated([{ url: "10.1234/test" }])[0]!;
    expect(bareDoi.relatedIdentifierType).toBe("DOI");
    expect(bareDoi.relatedIdentifier).toBe("10.1234/test");

    const dxDoi = _buildReferenceRelated([
      { url: "https://dx.doi.org/10.5121/ijdms.2023.15101" },
    ])[0]!;
    expect(dxDoi.relatedIdentifierType).toBe("DOI");
    expect(dxDoi.relatedIdentifier).toBe("10.5121/ijdms.2023.15101");

    const doiScheme = _buildReferenceRelated([{ url: "doi:10.1234/test" }])[0]!;
    expect(doiScheme.relatedIdentifierType).toBe("DOI");
    expect(doiScheme.relatedIdentifier).toBe("10.1234/test");

    const regularUrl = _buildReferenceRelated([
      { url: "https://example.com/paper" },
    ])[0]!;
    expect(regularUrl.relatedIdentifierType).toBe("URL");
    expect(regularUrl.relatedIdentifier).toBe("https://example.com/paper");
    expect(_buildReferenceRelated([{ url: "" }])).toEqual([]);
  });

  it("includes standard fields and version description dates in version payloads", async () => {
    const payload = await _buildVersionPayload({
      ...baseVersionMeta(),
      abstract: "A test abstract.",
      creators: [{ name: "Doe, Jane" }],
      versionDesc: "Initial release",
    });
    const attrs = payload.data.attributes;
    const publisherName = process.env.DATACITE_PUBLISHER || "The Stacks";
    expect(attrs.publisher).toEqual({ name: publisherName });
    expect(attrs.version).toBe("1");
    expect(attrs.language).toBe("en");
    expect(attrs.types).toEqual({
      resourceTypeGeneral: "Other",
      resourceType: "Article",
    });
    expect(attrs.dates).toContainEqual({
      date: "2026-03-09",
      dateType: "Updated",
      dateInformation: "Initial release",
    });
    expect(attrs.rightsList).toEqual([
      {
        rights: "Creative Commons Attribution 4.0 International",
        rightsIdentifier: "CC-BY-4.0",
        rightsUri: "https://creativecommons.org/licenses/by/4.0/",
        schemeUri: "https://spdx.org/licenses/",
        rightsIdentifierScheme: "SPDX",
      },
    ]);
    expect(attrs.descriptions).toEqual([
      {
        description: "A test abstract.",
        descriptionType: "Abstract",
        lang: "en",
      },
    ]);
  });

  it("tags titles and abstract in both payloads with the publication's DOI metadata language", async () => {
    const doiMetadata: DoiMetadata = {
      ...DEFAULT_DOI_METADATA,
      content: { ...DEFAULT_DOI_METADATA.content, language: "de" },
    };
    const versionMeta = {
      ...baseVersionMeta(),
      abstract: "Zusammenfassung",
      doiMetadata,
    };
    const canonicalMeta: CanonicalMetadata = {
      creators: [],
      contributors: [],
      references: [],
      supplements: [],
      versionDois: [],
      dates: [{ date: "2026-03-09", dateType: "Issued" }],
    };

    const [versionPayload, canonicalPayload] = await Promise.all([
      _buildVersionPayload(versionMeta),
      _buildCanonicalPayload(canonicalMeta, versionMeta),
    ]);

    for (const { attributes } of [versionPayload.data, canonicalPayload.data]) {
      const langs = [
        ...(attributes.titles as Array<{ lang: string }>),
        ...(attributes.descriptions as Array<{ lang: string }>),
      ].map((entry) => entry.lang);
      expect(langs).toEqual(["de", "de", "de"]);
    }
  });

  it("takes language, types and subjects in both payloads from the publication's DOI metadata", async () => {
    const doiMetadata: DoiMetadata = {
      type: "datacite",
      content: {
        language: "de",
        types: { resourceTypeGeneral: "Preprint", resourceType: "Preprint" },
        subjects: [
          {
            subject: "FOS: Computer and information sciences",
            subjectScheme: "Fields of Science and Technology (FOS)",
          },
        ],
      },
    };
    const versionMeta = { ...baseVersionMeta(), doiMetadata };
    const canonicalMeta: CanonicalMetadata = {
      creators: [],
      contributors: [],
      references: [],
      supplements: [],
      versionDois: [],
      dates: [{ date: "2026-03-09", dateType: "Issued" }],
    };

    const [versionPayload, canonicalPayload] = await Promise.all([
      _buildVersionPayload(versionMeta),
      _buildCanonicalPayload(canonicalMeta, versionMeta),
    ]);

    for (const { attributes } of [versionPayload.data, canonicalPayload.data]) {
      expect(attributes.language).toBe(doiMetadata.content.language);
      expect(attributes.types).toEqual(doiMetadata.content.types);
      expect(attributes.subjects).toEqual(doiMetadata.content.subjects);
    }
  });

  it.each(["CC BY", "CC0"] as const)(
    "reports the correct DataCite rights for a %s-licensed version payload",
    async (license) => {
      const payload = await _buildVersionPayload({
        ...baseVersionMeta(),
        license,
      });
      const attrs = payload.data.attributes;
      expect(attrs.rightsList).toEqual([
        license === "CC BY"
          ? {
              rights: "Creative Commons Attribution 4.0 International",
              rightsIdentifier: "CC-BY-4.0",
              rightsUri: "https://creativecommons.org/licenses/by/4.0/",
              schemeUri: "https://spdx.org/licenses/",
              rightsIdentifierScheme: "SPDX",
            }
          : {
              rights: "CC0 1.0 Universal",
              rightsIdentifier: "CC0-1.0",
              rightsUri: "https://creativecommons.org/publicdomain/zero/1.0/",
              schemeUri: "https://spdx.org/licenses/",
              rightsIdentifierScheme: "SPDX",
            },
      ]);
    }
  );

  it.each(["CC BY", "CC0"] as const)(
    "reports the correct DataCite rights for a %s-licensed canonical payload",
    async (license) => {
      const canonicalMeta: CanonicalMetadata = {
        creators: [],
        contributors: [],
        references: [],
        supplements: [],
        versionDois: [],
        dates: [{ date: "2026-03-09", dateType: "Issued" }],
      };
      const payload = await _buildCanonicalPayload(canonicalMeta, {
        ...baseVersionMeta(),
        license,
      });
      const attrs = payload.data.attributes;
      expect(attrs.rightsList).toEqual([
        license === "CC BY"
          ? expect.objectContaining({ rightsIdentifier: "CC-BY-4.0" })
          : expect.objectContaining({ rightsIdentifier: "CC0-1.0" }),
      ]);
    }
  );

  it("falls back to CC BY rights for an unrecognized license", async () => {
    const payload = await _buildVersionPayload({
      ...baseVersionMeta(),
      license: "CC BY-NC",
    });
    const attrs = payload.data.attributes;
    expect(attrs.rightsList).toEqual([
      expect.objectContaining({ rightsIdentifier: "CC-BY-4.0" }),
    ]);
  });

  describe("Astera Institute HostingInstitution contributor", () => {
    const originalPublisher = process.env.DATACITE_PUBLISHER;

    afterEach(() => {
      if (originalPublisher === undefined)
        delete process.env.DATACITE_PUBLISHER;
      else process.env.DATACITE_PUBLISHER = originalPublisher;
      initConfig("tests/raven.test.toml");
    });

    const ASTERA_CONTRIBUTOR = {
      name: "Astera Institute",
      nameType: "Organizational",
      affiliation: [] as unknown[],
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
    };

    it("is added in version payloads only when DATACITE_PUBLISHER is 'The Stacks'", async () => {
      process.env.DATACITE_PUBLISHER = "The Stacks";
      initConfig("tests/raven.test.toml");

      const payload = await _buildVersionPayload({
        ...baseVersionMeta(),
        contributors: [{ name: "Smith, Bob", contributorType: "Other" }],
      });
      expect(payload.data.attributes.contributors).toEqual([
        { name: "Smith, Bob", contributorType: "Other" },
        ASTERA_CONTRIBUTOR,
      ]);
    });

    it("is added in canonical payloads only when DATACITE_PUBLISHER is 'The Stacks', even with no human contributors", async () => {
      process.env.DATACITE_PUBLISHER = "The Stacks";
      initConfig("tests/raven.test.toml");

      const canonicalMeta: CanonicalMetadata = {
        creators: [],
        contributors: [],
        references: [],
        supplements: [],
        versionDois: [],
        dates: [{ date: "2026-03-09", dateType: "Issued" }],
      };
      const payload = await _buildCanonicalPayload(
        canonicalMeta,
        baseVersionMeta()
      );
      expect(payload.data.attributes.contributors).toEqual([
        ASTERA_CONTRIBUTOR,
      ]);
    });

    it("is omitted from both payloads when DATACITE_PUBLISHER is not 'The Stacks'", async () => {
      process.env.DATACITE_PUBLISHER = "Astera Institute";
      initConfig("tests/raven.test.toml");

      const versionPayload = await _buildVersionPayload({
        ...baseVersionMeta(),
        contributors: [{ name: "Smith, Bob", contributorType: "Other" }],
      });
      expect(versionPayload.data.attributes.contributors).toEqual([
        { name: "Smith, Bob", contributorType: "Other" },
      ]);

      const canonicalMeta: CanonicalMetadata = {
        creators: [],
        contributors: [],
        references: [],
        supplements: [],
        versionDois: [],
        dates: [{ date: "2026-03-09", dateType: "Issued" }],
      };
      const canonicalPayload = await _buildCanonicalPayload(
        canonicalMeta,
        baseVersionMeta()
      );
      expect(canonicalPayload.data.attributes).not.toHaveProperty(
        "contributors"
      );
    });
  });

  it("strips Markdown from the title and abstract in version payloads", async () => {
    const payload = await _buildVersionPayload({
      ...baseVersionMeta(),
      abstract:
        "A **bold** abstract with _italic_ text and a [link](https://example.com).",
      title: "# A Title\n\nwith **bold** and _italic_ text",
      subtitle: "Subtitle with **bold** and _italic_ text",
    });
    const attrs = payload.data.attributes;
    expect(attrs.titles).toEqual([
      {
        lang: "en",
        title: "A Title\n\nwith bold and italic text",
      },
      {
        lang: "en",
        title: "Subtitle with bold and italic text",
        titleType: "Subtitle",
      },
    ]);
    expect(attrs.descriptions).toEqual([
      {
        description: "A bold abstract with italic text and a link.",
        descriptionType: "Abstract",
        lang: "en",
      },
    ]);
  });

  it("normalizes non-canonicalized UTF strings in version payloads", async () => {
    // Decomposed: "e" + combining acute accent (U+0301) -- not canonicalized.
    const decomposedTitle = "cafe\u0301";
    const decomposedSubtitle = decomposedTitle.slice();
    const decomposedAbstract = decomposedTitle.slice();
    // Composed: precomposed "e with acute" (U+00E9) -- what DataCite should
    // actually receive, after NFC normalization.
    const composedTitle = "caf\u00e9";
    const composedSubtitle = composedTitle.slice();
    const composedAbstract = composedTitle.slice();
    expect(decomposedTitle).not.toEqual(composedTitle);
    expect(decomposedAbstract).not.toEqual(composedAbstract);
    expect(decomposedSubtitle).not.toEqual(composedSubtitle);

    const payload = await _buildVersionPayload({
      ...baseVersionMeta(),
      abstract: decomposedAbstract,
      title: decomposedTitle,
      subtitle: decomposedSubtitle,
    });
    const attrs = payload.data.attributes;
    expect(attrs.titles).toEqual([
      { lang: "en", title: composedTitle },
      { lang: "en", title: composedSubtitle, titleType: "Subtitle" },
    ]);
    expect(attrs.descriptions).toEqual([
      {
        description: composedAbstract,
        descriptionType: "Abstract",
        lang: "en",
      },
    ]);
  });

  it("omits the subtitle title entry when the subtitle is empty in version payloads", async () => {
    const payload = await _buildVersionPayload({
      ...baseVersionMeta(),
      subtitle: "",
    });
    const attrs = payload.data.attributes;
    expect(attrs.titles).toEqual([{ lang: "en", title: "Test" }]);
  });

  it("strips Markdown from the title and abstract in canonical payloads", async () => {
    const canonicalMeta: CanonicalMetadata = {
      creators: [],
      contributors: [],
      references: [],
      supplements: [],
      versionDois: [],
      dates: [{ date: "2026-03-09", dateType: "Issued" }],
    };
    const payload = await _buildCanonicalPayload(canonicalMeta, {
      ...baseVersionMeta(),
      abstract:
        "A **bold** abstract with _italic_ text and a [link](https://example.com).",
      title: "# A Title\n\nwith **bold** and _italic_ text",
      subtitle: "A Subtitle\n\nwith **bold** and _italic_ text",
    });
    const attrs = payload.data.attributes;
    expect(attrs.titles).toEqual([
      {
        lang: "en",
        title: "A Title\n\nwith bold and italic text",
      },
      {
        lang: "en",
        title: "A Subtitle\n\nwith bold and italic text",
        titleType: "Subtitle",
      },
    ]);
    expect(attrs.descriptions).toEqual([
      {
        description: "A bold abstract with italic text and a link.",
        descriptionType: "Abstract",
        lang: "en",
      },
    ]);
    const publisherName = process.env.DATACITE_PUBLISHER || "The Stacks";
    expect(attrs.publisher).toEqual({ name: publisherName });
  });

  it("normalizes non-canonicalized UTF strings in canonical payloads", async () => {
    // Decomposed: "e" + combining acute accent (U+0301) -- not canonicalized.
    const decomposedTitle = "cafe\u0301";
    const decomposedSubtitle = decomposedTitle.slice();
    const decomposedAbstract = decomposedTitle.slice();
    // Composed: precomposed "e with acute" (U+00E9) -- what DataCite should
    // actually receive, after NFC normalization.
    const composedTitle = "caf\u00e9";
    const composedSubtitle = composedTitle.slice();
    const composedAbstract = "caf\u00e9";
    expect(decomposedTitle).not.toEqual(composedTitle);
    expect(decomposedAbstract).not.toEqual(composedAbstract);
    expect(decomposedSubtitle).not.toEqual(composedSubtitle);

    const canonicalMeta: CanonicalMetadata = {
      creators: [],
      contributors: [],
      references: [],
      supplements: [],
      versionDois: [],
      dates: [{ date: "2026-03-09", dateType: "Issued" }],
    };
    const payload = await _buildCanonicalPayload(canonicalMeta, {
      ...baseVersionMeta(),
      abstract: decomposedAbstract,
      title: decomposedTitle,
      subtitle: decomposedSubtitle,
    });
    const attrs = payload.data.attributes;
    expect(attrs.titles).toEqual([
      { lang: "en", title: composedTitle },
      { lang: "en", title: composedSubtitle, titleType: "Subtitle" },
    ]);
    expect(attrs.descriptions).toEqual([
      {
        description: composedAbstract,
        descriptionType: "Abstract",
        lang: "en",
      },
    ]);
  });

  it("omits the subtitle title entry when the subtitle is empty in canonical payloads", async () => {
    const canonicalMeta: CanonicalMetadata = {
      creators: [],
      contributors: [],
      references: [],
      supplements: [],
      versionDois: [],
      dates: [{ date: "2026-03-09", dateType: "Issued" }],
    };
    const payload = await _buildCanonicalPayload(canonicalMeta, {
      ...baseVersionMeta(),
      subtitle: "",
    });
    const attrs = payload.data.attributes;
    expect(attrs.titles).toEqual([{ lang: "en", title: "Test" }]);
  });

  it("uses the DOI passed in opts instead of deriving one itself", async () => {
    const payload = await _buildVersionPayload(
      { ...baseVersionMeta(), canonicalDoi: "10.82153/pff0-ck46" },
      { doi: "10.83972/pff0-ck46.1" }
    );
    const attrs = payload.data.attributes;
    expect(attrs.doi).toBe("10.83972/pff0-ck46.1");
    expect(attrs).not.toHaveProperty("prefix");
  });

  it("falls back to prefix-based auto-generation before a concept DOI exists", async () => {
    const payload = await _buildVersionPayload(baseVersionMeta());
    const attrs = payload.data.attributes;
    expect(attrs.prefix).toBe(getConfig().DATACITE_PREFIX);
    expect(attrs).not.toHaveProperty("doi");
  });

  it("derives the version DOI using our own configured prefix, not the concept DOI's", () => {
    // The concept DOI's prefix (10.82153) differs from the one we're
    // configured to mint under (tests/raven.test.toml sets 10.83972) --
    // we may not own the concept DOI's prefix, so the version DOI must be
    // built from our own prefix plus the concept DOI's suffix.
    expect(_deriveVersionDoi(getConfig(), "10.82153/pff0-ck46", 1)).toBe(
      `${getConfig().DATACITE_PREFIX}/pff0-ck46.1`
    );
  });
});

describe("buildCanonicalDates", () => {
  it("returns a single Issued entry for a publication with only one published version", () => {
    const dates = _buildCanonicalDates(
      [{ versionNumber: 1, createdAt: "2026-01-01", versionDesc: null }],
      "2026-01-01"
    );

    expect(dates).toEqual([{ date: "2026-01-01", dateType: "Issued" }]);
  });

  it("adds exactly one Updated entry for the version just published, not two", () => {
    const dates = _buildCanonicalDates(
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

    expect(dates).toEqual([
      { date: "2025-06-01", dateType: "Issued" },
      {
        date: "2026-03-09",
        dateType: "Updated",
        dateInformation: "Added supplementary data",
      },
    ]);
  });

  it("gives every version in the history exactly one entry", () => {
    const dates = _buildCanonicalDates(
      [
        { versionNumber: 1, createdAt: "2025-06-01", versionDesc: null },
        { versionNumber: 2, createdAt: "2025-09-01", versionDesc: null },
        {
          versionNumber: 3,
          createdAt: "2026-03-09",
          versionDesc: "Latest version",
        },
      ],
      "2026-03-09"
    );

    expect(dates).toEqual([
      { date: "2025-06-01", dateType: "Issued" },
      { date: "2025-09-01", dateType: "Updated" },
      {
        date: "2026-03-09",
        dateType: "Updated",
        dateInformation: "Latest version",
      },
    ]);
  });

  it("falls back to the given date when a version has no createdAt", () => {
    const dates = _buildCanonicalDates(
      [
        { versionNumber: 1, createdAt: null, versionDesc: null },
        { versionNumber: 2, createdAt: null, versionDesc: null },
      ],
      "2026-03-09"
    );

    expect(dates).toEqual([
      { date: "2026-03-09", dateType: "Issued" },
      { date: "2026-03-09", dateType: "Updated" },
    ]);
  });

  it("excludes a draft version entirely, since allPublished never contains one", () => {
    const dates = _buildCanonicalDates(
      [{ versionNumber: 1, createdAt: "2025-06-01", versionDesc: null }],
      "2026-03-09"
    );

    expect(dates).toEqual([{ date: "2025-06-01", dateType: "Issued" }]);
  });
});

describe("mintDois", () => {
  const fetchMock = vi.fn();

  beforeAll(() => {
    process.env.DATACITE_NAME = "test-datacite-name";
    process.env.DATACITE_PASSWORD = "test-datacite-password";
    initConfig("tests/raven.test.toml");
  });

  afterAll(() => {
    delete process.env.DATACITE_NAME;
    delete process.env.DATACITE_PASSWORD;
    initConfig("tests/raven.test.toml");
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  function createdResponse(doi: string) {
    return {
      status: 201,
      json: async () => ({ data: { attributes: { doi } } }),
      text: async () => "",
    };
  }

  function updatedResponse() {
    return { status: 200, json: async () => ({}), text: async () => "" };
  }

  function failedUpdateResponse() {
    return {
      status: 500,
      json: async () => ({}),
      text: async () => "update failed",
    };
  }

  function foundVersionResponse(
    doi: string,
    canonicalDoi = "10.82153/pff0-ck46",
    url = `${getConfig().BASE_URL_WEB}/publications/test-new-pub/v1`
  ) {
    return {
      status: 200,
      json: async () => ({
        data: {
          attributes: {
            doi,
            url,
            relatedIdentifiers: [
              {
                relatedIdentifier: canonicalDoi,
                relatedIdentifierType: "DOI",
                relationType: "IsVersionOf",
              },
            ],
          },
        },
      }),
      text: async () => "",
    };
  }

  function alreadyTakenResponse(doi: string) {
    return {
      status: 422,
      json: async () => ({}),
      text: async () =>
        JSON.stringify({
          errors: [
            {
              source: "doi",
              title: "This DOI has already been taken",
              uid: doi,
            },
          ],
        }),
    };
  }

  function unrelatedValidationErrorResponse() {
    return {
      status: 422,
      json: async () => ({}),
      text: async () =>
        JSON.stringify({
          errors: [{ source: "title", title: "can't be blank" }],
        }),
    };
  }

  function notFoundResponse() {
    return {
      status: 404,
      json: async () => ({}),
      text: async () => "not found",
    };
  }

  const baseCanonicalMeta = (): CanonicalMetadata => ({
    creators: [{ name: "Doe, Jane" }],
    contributors: [],
    references: [],
    supplements: [],
    versionDois: [] as string[],
    dates: [{ date: "2026-03-09", dateType: "Issued" }],
  });

  it("creates the concept DOI first, then derives and creates the version DOI from it", async () => {
    // The concept DOI comes back under a different prefix than we're
    // configured to mint under (tests/raven.test.toml sets 10.83972) --
    // the version DOI must use our own prefix, not the concept DOI's.
    fetchMock
      .mockResolvedValueOnce(createdResponse("10.82153/pff0-ck46"))
      .mockResolvedValueOnce(createdResponse("10.83972/pff0-ck46.1"))
      .mockResolvedValueOnce(updatedResponse());

    const [canonicalDoi, versionDoi] = await _mintDois(
      baseCanonicalMeta(),
      {
        ...baseVersionMeta(),
        creators: [{ name: "Doe, Jane" }],
      },
      { updateCanonical: true }
    );

    expect(canonicalDoi).toBe("10.82153/pff0-ck46");
    expect(versionDoi).toBe("10.83972/pff0-ck46.1");
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [, versionCreateInit] = fetchMock.mock.calls[1] as [
      string,
      { body: string },
    ];
    expect(JSON.parse(versionCreateInit.body).data.attributes.doi).toBe(
      "10.83972/pff0-ck46.1"
    );

    const [updateUrl] = fetchMock.mock.calls[2] as [string, unknown];
    expect(updateUrl).toBe(`${getConfig().DATACITE_API}/10.82153/pff0-ck46`);
  });

  it("retries a missing first-version DOI when the concept DOI is already known", async () => {
    fetchMock
      .mockResolvedValueOnce(createdResponse("10.83972/pff0-ck46.1"))
      .mockResolvedValueOnce(updatedResponse());

    // Under our own configured prefix (unlike the cross-prefix fixtures used
    // elsewhere) so this retry-focused test doesn't also trip the ownership
    // check's write-access probe, which is unrelated to what's under test
    // here.
    const versionDoi = await mintDoiForNewVersion(reposMock, "1", "2", {
      ...baseMintOpts(),
      versionNumber: 1,
      canonicalDoi: "10.83972/pff0-ck46",
      updateCanonical: true,
    });

    expect(versionDoi).toBe("10.83972/pff0-ck46.1");
    const [, versionCreateInit] = fetchMock.mock.calls[0] as [
      string,
      { body: string },
    ];
    const attrs = JSON.parse(versionCreateInit.body).data.attributes;
    expect(attrs.relatedIdentifiers).toContainEqual({
      relatedIdentifier: "10.83972/pff0-ck46",
      relatedIdentifierType: "DOI",
      relationType: "IsVersionOf",
    });
    expect(attrs.relatedIdentifiers).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relationType: "IsNewVersionOf" }),
      ])
    );
  });

  it("derives the version DOI from an already-known concept DOI for a later version", async () => {
    // Same cross-prefix setup as above: the concept DOI is under 10.82153,
    // but the new version DOI must be minted under our own configured
    // prefix (10.83972), not the concept DOI's.
    fetchMock
      .mockResolvedValueOnce(createdResponse("10.83972/pff0-ck46.2"))
      .mockResolvedValueOnce(updatedResponse());

    const [canonicalDoi, versionDoi] = await _mintDois(
      { ...baseCanonicalMeta(), versionDois: ["10.82153/pff0-ck46.1"] },
      {
        ...baseVersionMeta(),
        title: "Test v2",
        publishDate: "2026-04-01",
        versionDesc: "Updated version",
        canonicalDoi: "10.82153/pff0-ck46",
        previousVersionDoi: "10.82153/pff0-ck46.1",
        versionNumber: 2,
      },
      { updateCanonical: true }
    );

    expect(canonicalDoi).toBe("10.82153/pff0-ck46");
    expect(versionDoi).toBe("10.83972/pff0-ck46.2");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [, versionCreateInit] = fetchMock.mock.calls[0] as [
      string,
      { body: string },
    ];
    expect(JSON.parse(versionCreateInit.body).data.attributes.doi).toBe(
      "10.83972/pff0-ck46.2"
    );
  });

  it("does not touch the concept DOI when updateCanonical is false", async () => {
    // Regression test: minting/updating a draft version of an already-
    // published publication must not roll the concept DOI's public record
    // back to the still-unpublished draft's metadata.
    fetchMock.mockResolvedValueOnce(createdResponse("10.83972/pff0-ck46.2"));

    const [canonicalDoi, versionDoi] = await _mintDois(
      { ...baseCanonicalMeta(), versionDois: ["10.82153/pff0-ck46.1"] },
      {
        ...baseVersionMeta(),
        title: "Test v2",
        publishDate: "2026-04-01",
        versionDesc: "Updated version",
        canonicalDoi: "10.82153/pff0-ck46",
        previousVersionDoi: "10.82153/pff0-ck46.1",
        versionNumber: 2,
      },
      { updateCanonical: false }
    );

    expect(canonicalDoi).toBe("10.82153/pff0-ck46");
    expect(versionDoi).toBe("10.83972/pff0-ck46.2");
    // Only the version DOI create -- no PUT to the concept DOI.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not report the version DOI when linking it from the concept fails", async () => {
    fetchMock
      .mockResolvedValueOnce(createdResponse("10.82153/pff0-ck46"))
      .mockResolvedValueOnce(createdResponse("10.83972/pff0-ck46.1"))
      .mockResolvedValueOnce(failedUpdateResponse());

    const [canonicalDoi, versionDoi] = await _mintDois(
      baseCanonicalMeta(),
      baseVersionMeta(),
      { updateCanonical: true }
    );

    expect(canonicalDoi).toBe("10.82153/pff0-ck46");
    expect(versionDoi).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("recovers when the version DOI create reports it's already taken by fetching the existing record", async () => {
    fetchMock
      .mockResolvedValueOnce(createdResponse("10.82153/pff0-ck46")) // concept create
      .mockResolvedValueOnce(alreadyTakenResponse("10.83972/pff0-ck46.1")) // version create: already taken
      .mockResolvedValueOnce(foundVersionResponse("10.83972/pff0-ck46.1")) // GET recovery
      .mockResolvedValueOnce(updatedResponse()); // concept update

    const [canonicalDoi, versionDoi] = await _mintDois(
      baseCanonicalMeta(),
      baseVersionMeta(),
      { updateCanonical: true }
    );

    expect(canonicalDoi).toBe("10.82153/pff0-ck46");
    expect(versionDoi).toBe("10.83972/pff0-ck46.1");
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const [getUrl, getInit] = fetchMock.mock.calls[2] as [
      string,
      { method: string },
    ];
    expect(getUrl).toBe(
      `${getConfig().DATACITE_API}/10.83972/pff0-ck46.1?publisher=true&affiliation=true`
    );
    expect(getInit.method).toBe("GET");
  });

  it("rejects an occupied DOI that belongs to a different version", async () => {
    fetchMock
      .mockResolvedValueOnce(createdResponse("10.82153/pff0-ck46"))
      .mockResolvedValueOnce(alreadyTakenResponse("10.83972/pff0-ck46.1"))
      .mockResolvedValueOnce(
        foundVersionResponse(
          "10.83972/pff0-ck46.1",
          "10.99999/unrelated",
          `${getConfig().BASE_URL_WEB}/publications/unrelated/v1`
        )
      );

    const [canonicalDoi, versionDoi] = await _mintDois(
      baseCanonicalMeta(),
      baseVersionMeta(),
      { updateCanonical: true }
    );

    expect(canonicalDoi).toBe("10.82153/pff0-ck46");
    expect(versionDoi).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("keeps the newly-created concept DOI when an already-taken version DOI create can't be confirmed", async () => {
    fetchMock
      .mockResolvedValueOnce(createdResponse("10.82153/pff0-ck46")) // concept create
      .mockResolvedValueOnce(alreadyTakenResponse("10.83972/pff0-ck46.1")) // version create: already taken
      .mockResolvedValueOnce(notFoundResponse()); // GET recovery: not actually there

    const [canonicalDoi, versionDoi] = await _mintDois(
      baseCanonicalMeta(),
      baseVersionMeta(),
      { updateCanonical: true }
    );

    // The concept DOI was actually created at DataCite, so it must be
    // returned (and thus persisted by the caller) even though the version
    // DOI failed -- otherwise it's silently orphaned with no way to find
    // it again, and a retry would mint a second, different concept DOI.
    expect(canonicalDoi).toBe("10.82153/pff0-ck46");
    expect(versionDoi).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not attempt recovery for an unrelated 422 validation error", async () => {
    fetchMock
      .mockResolvedValueOnce(createdResponse("10.82153/pff0-ck46")) // concept create
      .mockResolvedValueOnce(unrelatedValidationErrorResponse()); // version create: unrelated failure

    const [canonicalDoi, versionDoi] = await _mintDois(
      baseCanonicalMeta(),
      baseVersionMeta(),
      { updateCanonical: true }
    );

    expect(canonicalDoi).toBe("10.82153/pff0-ck46");
    expect(versionDoi).toBeNull();
    // No GET recovery attempt should be made for a validation error that
    // isn't actually an "already taken" conflict.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("mintDoiForNewVersion", () => {
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

  it.each([403, 500, "timeout"])(
    "distinguishes ownership denial from probe failure (%s)",
    async (status) => {
      if (status === "timeout")
        fetchMock.mockRejectedValueOnce(new Error("timeout"));
      else fetchMock.mockResolvedValueOnce({ status });
      const result = await publishDraftDois(reposMock, "1", "1", {
        ...baseMintOpts(),
        versionNumber: 1,
        canonicalDoi: "10.1234/not-ours",
        versionDoi: "10.83972/test.1",
      });
      expect(result).toBe(status === 403 ? "inaccessible" : "failure");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  it.each([0, 1])(
    "preserves the failure outcome when DOI update %s fails",
    async (failedIndex) => {
      if (failedIndex === 1) fetchMock.mockResolvedValueOnce({ status: 200 });
      fetchMock.mockResolvedValueOnce({
        status: 500,
        text: async () => "server error",
      });
      expect(
        await publishDraftDois(reposMock, "1", "1", {
          ...baseMintOpts(),
          versionNumber: 1,
          canonicalDoi: "10.83972/test",
          versionDoi: "10.83972/test.1",
        })
      ).toBe("failure");
      expect(fetchMock).toHaveBeenCalledTimes(failedIndex + 1);
    }
  );

  it.each(["10.83972/test", "10.1234/migrated"])(
    "publishes both draft DOIs after access succeeds for %s",
    async (canonicalDoi) => {
      fetchMock.mockResolvedValue({ status: 200 });
      expect(
        await publishDraftDois(reposMock, "1", "1", {
          ...baseMintOpts(),
          versionNumber: 1,
          canonicalDoi,
          versionDoi: "10.83972/test.1",
        })
      ).toBe("success");
      expect(fetchMock).toHaveBeenCalledTimes(
        canonicalDoi.startsWith("10.83972/") ? 2 : 3
      );
      const updates = fetchMock.mock.calls.slice(-2);
      expect(updates.map(([url]) => url)).toEqual([
        `${getConfig().DATACITE_API}/10.83972/test.1`,
        `${getConfig().DATACITE_API}/${canonicalDoi}`,
      ]);
      for (const [, init] of updates) {
        expect(init.method).toBe("PUT");
        expect(JSON.parse(init.body).data.attributes.event).toBe("publish");
      }
    }
  );

  it("skips minting when the concept DOI is outside our configured prefix and we don't own it", async () => {
    // Configured prefix is "10.83972" (tests/raven.test.toml); this concept
    // DOI belongs to a different, unowned prefix on purpose.
    const foreignCanonicalDoi = "10.1234/not-ours";
    // DataCite returns 403 for a write attempt against a DOI owned by a
    // different client, confirmed empirically against the sandbox.
    fetchMock.mockResolvedValueOnce({
      status: 403,
      json: async () => ({}),
      text: async () => "forbidden",
    });

    const result = await mintDoiForNewVersion(reposMock, "1", "1", {
      ...baseMintOpts(),
      versionNumber: 2,
      canonicalDoi: foreignCanonicalDoi,
      updateCanonical: true,
    });

    expect(result).toBeNull();
    // A prefix mismatch alone doesn't skip immediately -- it falls back to
    // an empty (no-op) PUT as a write-access probe before giving up.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { method: string; body: string },
    ];
    expect(url).toBe(`${getConfig().DATACITE_API}/${foreignCanonicalDoi}`);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({
      data: { type: "dois", attributes: {} },
    });
  });

  it("proceeds with minting when the concept DOI is outside our configured prefix but the write-access probe succeeds", async () => {
    const foreignCanonicalDoi = "10.1234/migrated-doi";
    fetchMock
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({}),
        text: async () => "",
      }) // write-access probe: we own it
      .mockResolvedValueOnce({
        status: 201,
        json: async () => ({
          data: { attributes: { doi: "10.83972/migrated-doi.1" } },
        }),
        text: async () => "",
      }) // version create
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({}),
        text: async () => "",
      }); // concept update

    const result = await mintDoiForNewVersion(reposMock, "1", "2", {
      ...baseMintOpts(),
      versionNumber: 1,
      canonicalDoi: foreignCanonicalDoi,
      updateCanonical: true,
    });

    expect(result).toBe("10.83972/migrated-doi.1");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("skips minting when DATACITE_PREFIX is blank", async () => {
    const originalPrefix = process.env.DATACITE_PREFIX;
    process.env.DATACITE_PREFIX = "";
    initConfig("tests/raven.test.toml");

    try {
      const result = await mintDoiForNewVersion(reposMock, "1", "2", {
        ...baseMintOpts(),
        versionNumber: 2,
        canonicalDoi: "10.83972/pff0-ck46",
        updateCanonical: true,
      });

      expect(result).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      if (originalPrefix === undefined) delete process.env.DATACITE_PREFIX;
      else process.env.DATACITE_PREFIX = originalPrefix;
      initConfig("tests/raven.test.toml");
    }
  });

  it("links the previous version's DataCite record back to the newly minted version", async () => {
    // Only the previous, published v1
    listPublishedVersionsMock.mockResolvedValueOnce([
      {
        id: "10",
        idInt: 10,
        versionNumber: 1,
        doi: "10.83972/pff0-ck46.1",
        versionDesc: null,
        abstract: "Abstract v1",
        title: "Title v1",
        subtitle: "",
        createdAt: new Date("2026-01-01").toISOString(),
      },
    ]);

    fetchMock
      .mockResolvedValueOnce({
        status: 201,
        json: async () => ({
          data: { attributes: { doi: "10.83972/pff0-ck46.2" } },
        }),
        text: async () => "",
      }) // version create
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({}),
        text: async () => "",
      }) // concept update
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          data: {
            attributes: {
              doi: "10.83972/pff0-ck46.1",
              relatedIdentifiers: [
                {
                  relatedIdentifier: "10.83972/pff0-ck46",
                  relatedIdentifierType: "DOI",
                  relationType: "IsVersionOf",
                },
              ],
            },
          },
        }),
        text: async () => "",
      }) // GET previous version record
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({}),
        text: async () => "",
      }); // previous version update

    const result = await mintDoiForNewVersion(reposMock, "1", "2", {
      ...baseMintOpts(),
      versionNumber: 2,
      canonicalDoi: "10.83972/pff0-ck46",
      updateCanonical: true,
    });

    expect(result).toBe("10.83972/pff0-ck46.2");
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const [getUrl, getInit] = fetchMock.mock.calls[2] as [
      string,
      { method: string },
    ];
    expect(getUrl).toBe(
      `${getConfig().DATACITE_API}/10.83972/pff0-ck46.1?publisher=true&affiliation=true`
    );
    expect(getInit.method).toBe("GET");

    const [url, init] = fetchMock.mock.calls[3] as [string, { body: string }];
    expect(url).toBe(`${getConfig().DATACITE_API}/10.83972/pff0-ck46.1`);
    const attrs = JSON.parse(init.body).data.attributes;
    // The update only patches relatedIdentifiers, preserving the existing
    // IsVersionOf relation and adding the new IsPreviousVersionOf one --
    // it does not resend the previous version's title, creators, etc.
    expect(Object.keys(attrs)).toEqual(["relatedIdentifiers"]);
    expect(attrs.relatedIdentifiers).toContainEqual({
      relatedIdentifier: "10.83972/pff0-ck46",
      relatedIdentifierType: "DOI",
      relationType: "IsVersionOf",
    });
    expect(attrs.relatedIdentifiers).toContainEqual({
      relatedIdentifier: "10.83972/pff0-ck46.2",
      relatedIdentifierType: "DOI",
      relationType: "IsPreviousVersionOf",
    });
  });

  it("does not touch the concept DOI when minting a draft version of an already-published publication", async () => {
    // Regression test: drafting a new version of a publication that's
    // already published must not roll the concept DOI's public record back
    // to this in-progress draft's metadata.
    // Only the previous, published v1
    listPublishedVersionsMock.mockResolvedValueOnce([
      {
        id: "10",
        idInt: 10,
        versionNumber: 1,
        doi: "10.83972/pff0-ck46.1",
        versionDesc: null,
        abstract: "Abstract v1",
        title: "Title v1",
        subtitle: "",
        createdAt: new Date("2026-01-01").toISOString(),
      },
    ]);

    fetchMock.mockResolvedValueOnce({
      status: 201,
      json: async () => ({
        data: { attributes: { doi: "10.83972/pff0-ck46.2" } },
      }),
      text: async () => "",
    }); // version create only

    const result = await mintDoiForNewVersionDraft(reposMock, "1", "2", {
      ...baseMintOpts(),
      versionNumber: 2,
      canonicalDoi: "10.83972/pff0-ck46",
      draft: true,
      updateCanonical: false,
    });

    expect(result).toBe("10.83972/pff0-ck46.2");
    // No PUT to the concept DOI, and no back-link to the previous version --
    // an unpublished draft isn't publicly resolvable yet.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives the concept DOI the first version's authors when retrying its draft mint", async () => {
    // Nothing is published yet, so the publication-wide queries come back
    // empty; the concept DOI must not fall back to an "Unknown" author.
    listForDataciteMock.mockResolvedValueOnce([
      {
        firstName: "Ada",
        lastName: "Lovelace",
        orcid: null,
        inByline: true,
        priority: 1,
        affiliations: [],
      },
    ]);
    fetchMock
      .mockResolvedValueOnce({
        status: 201,
        json: async () => ({
          data: { attributes: { doi: "10.83972/pff0-ck46.1" } },
        }),
        text: async () => "",
      }) // version create
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({}),
        text: async () => "",
      }); // concept update

    const result = await mintDoiForNewVersionDraft(reposMock, "1", "1", {
      ...baseMintOpts(),
      versionNumber: 1,
      canonicalDoi: "10.83972/pff0-ck46",
      draft: true,
      updateCanonical: true,
    });

    expect(result).toBe("10.83972/pff0-ck46.1");
    const [url, init] = fetchMock.mock.calls[1] as [string, { body: string }];
    expect(url).toBe(`${getConfig().DATACITE_API}/10.83972/pff0-ck46`);
    expect(JSON.parse(init.body).data.attributes.creators).toEqual([
      expect.objectContaining({ givenName: "Ada", familyName: "Lovelace" }),
    ]);
  });
});

describe("mintDoisForNewPub", () => {
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

  it("skips minting when DATACITE_PREFIX is blank, without calling DataCite", async () => {
    const originalPrefix = process.env.DATACITE_PREFIX;
    process.env.DATACITE_PREFIX = "  ";
    initConfig("tests/raven.test.toml");

    try {
      const [canonicalDoi, versionDoi] = await mintDoisForNewPub(
        reposMock,
        "1",
        "1",
        baseMintOpts()
      );

      expect(canonicalDoi).toBeNull();
      expect(versionDoi).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      if (originalPrefix === undefined) delete process.env.DATACITE_PREFIX;
      else process.env.DATACITE_PREFIX = originalPrefix;
      initConfig("tests/raven.test.toml");
    }
  });
});

describe("dataciteRawGet", () => {
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

  it("returns null without making a request when credentials are missing outside production", async () => {
    delete process.env.DATACITE_NAME;
    delete process.env.DATACITE_PASSWORD;
    initConfig("tests/raven.test.toml");

    try {
      const result = await dataciteRawGet("10.83972/pff0-ck46.1");
      expect(result).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      process.env.DATACITE_NAME = "test-datacite-name";
      process.env.DATACITE_PASSWORD = "test-datacite-password";
      initConfig("tests/raven.test.toml");
    }
  });

  it("throws a ConfigError without making a request when credentials are missing in production", async () => {
    const originalEnvironment = process.env.ENVIRONMENT;
    delete process.env.DATACITE_NAME;
    delete process.env.DATACITE_PASSWORD;
    process.env.ENVIRONMENT = "production";
    initConfig("tests/raven.test.toml");

    try {
      await expect(dataciteRawGet("10.83972/pff0-ck46.1")).rejects.toThrow(
        ConfigError
      );
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      if (originalEnvironment === undefined) delete process.env.ENVIRONMENT;
      else process.env.ENVIRONMENT = originalEnvironment;
      process.env.DATACITE_NAME = "test-datacite-name";
      process.env.DATACITE_PASSWORD = "test-datacite-password";
      initConfig("tests/raven.test.toml");
    }
  });

  const DOI = "10.83972/pff0-ck46.1";

  function recordBody() {
    return { data: { attributes: { doi: DOI, url: "https://example.com" } } };
  }

  // Non-200 responses still carry a readable record, so a status check that
  // fell through to parsing would return it instead of the expected outcome.
  function responseWithRecord(status: number) {
    return { status, json: async () => recordBody() };
  }

  it("returns null when DataCite has no record for the DOI (404)", async () => {
    fetchMock.mockResolvedValueOnce(responseWithRecord(404));

    const result = await dataciteRawGet(DOI);

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([400, 401, 403, 429, 500, 503])(
    "rejects with a DataciteRequestError carrying the DOI and status on a %s response",
    async (status) => {
      fetchMock.mockResolvedValueOnce(responseWithRecord(status));

      const error: unknown = await dataciteRawGet(DOI).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DataciteRequestError);
      expect(error).toMatchObject({
        doi: DOI,
        status,
        message: `DataCite GET for ${DOI} returned ${status}`,
      });
    }
  );

  it("rejects with a DataciteRequestError with no status when the request times out", async () => {
    const timeout = new DOMException(
      "The operation was aborted due to timeout",
      "TimeoutError"
    );
    fetchMock.mockRejectedValueOnce(timeout);

    const error: unknown = await dataciteRawGet(DOI).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DataciteRequestError);
    expect(error).toMatchObject({
      doi: DOI,
      status: null,
      message: `DataCite GET for ${DOI} got no response`,
      cause: timeout,
    });
  });

  it("rejects with a DataciteRequestError with no status on a network failure", async () => {
    const networkError = new TypeError("fetch failed");
    fetchMock.mockRejectedValueOnce(networkError);

    const error: unknown = await dataciteRawGet(DOI).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DataciteRequestError);
    expect(error).toMatchObject({
      status: null,
      message: `DataCite GET for ${DOI} got no response`,
      cause: networkError,
    });
  });

  it("rejects with a DataciteRequestError when a 200 response's body isn't JSON", async () => {
    const parseError = new SyntaxError("Unexpected token '<'");
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => {
        throw parseError;
      },
    });

    const error: unknown = await dataciteRawGet(DOI).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DataciteRequestError);
    expect(error).toMatchObject({
      status: 200,
      message: `DataCite GET for ${DOI} returned an unreadable body`,
      cause: parseError,
    });
  });

  it.each([
    { case: "a null body", body: null },
    { case: "an array body", body: [] },
    { case: "no data", body: {} },
    { case: "null data", body: { data: null } },
    { case: "no attributes", body: { data: {} } },
    { case: "null attributes", body: { data: { attributes: null } } },
    { case: "string attributes", body: { data: { attributes: "record" } } },
    { case: "array attributes", body: { data: { attributes: [] } } },
  ])(
    "rejects with a DataciteRequestError instead of returning a record for a 200 response with $case",
    async ({ body }) => {
      fetchMock.mockResolvedValueOnce({ status: 200, json: async () => body });

      const error: unknown = await dataciteRawGet(DOI).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DataciteRequestError);
      expect(error).toMatchObject({
        doi: DOI,
        status: 200,
        message: `DataCite GET for ${DOI} returned no record attributes`,
      });
    }
  );

  it("returns the record's attributes on a 200 response", async () => {
    fetchMock.mockResolvedValueOnce(responseWithRecord(200));

    const result = await dataciteRawGet(DOI);

    expect(result).toEqual({ doi: DOI, url: "https://example.com" });
  });
});

describe("dataciteWebUrl", () => {
  afterEach(() => {
    delete process.env.DATACITE_API;
    initConfig("tests/raven.test.toml");
  });

  it("links to the DOI's record page with the DOI URL-encoded", () => {
    initConfig("tests/raven.test.toml");

    expect(dataciteWebUrl("10.83972/abcd-1234.1")).toBe(
      "https://doi.test.datacite.org/dois/10.83972%2Fabcd-1234.1"
    );
  });

  it("derives the production web host from the production API", () => {
    process.env.DATACITE_API = "https://api.datacite.org/dois";
    initConfig("tests/raven.test.toml");

    expect(dataciteWebUrl("10.83972/abcd")).toBe(
      "https://doi.datacite.org/dois/10.83972%2Fabcd"
    );
  });
});
