import { ConfigError, getConfig, type Config } from "#src/config.js";
import {
  DoiMetadataSchema,
  type DoiMetadata,
  type DoiMetadataSubjectSchema,
  type DoiMetadataTypesSchema,
} from "#src/db/schema.js";
import { DataciteRequestError } from "#src/lib/errors/datacite-request-error.js";
import { logger } from "#src/lib/logger.js";
import {
  DEFAULT_LICENSE,
  getLicense,
  type LicenseInfo,
} from "#src/lib/utils/licenses.js";
import { markdownToText } from "#src/lib/utils/markdown.js";
import {
  type DateEntrySchema,
  type DateTypeSchema,
  type DescriptionSchema,
  type DoiAttributes,
  type RelatedIdentifierSchema,
  type ResourceTypeGeneralSchema,
} from "#src/types/datacite.js";
import {
  type ContributorsRepository,
  type ListForDataciteAffiliation,
} from "#v1/db-repositories/contributors-repository.js";
import { type Repos } from "#v1/db-repositories/index.js";
import { z } from "zod";
import { DOI_REGEX } from "./doi-regex.js";

/**
 * @todo This client is keyed by int IDs and should be upgraded to use ULIDS
 */

type ExternalServiceAccessStatus = "success" | "failure" | "inaccessible";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VersionMetadataBase {
  abstract: string;
  contributors: DataCitePerson[];
  creators: DataCitePerson[];
  doiMetadata: DoiMetadata;
  license: string;
  publicationYear: number;
  publishDate: string;
  references: Array<{ url: string }>;
  slug: string;
  supplements: Array<{ type: string; url: string; name: string | null }>;
  title: string;
  subtitle: string;
}

export interface VersionMetadataFirst extends VersionMetadataBase {
  canonicalDoi: string | null;
  previousVersionDoi: null;
  versionDesc: string | null;
  versionNumber: 1;
}

export interface VersionMetadataSubsequent extends VersionMetadataBase {
  canonicalDoi: string;
  previousVersionDoi: string | null;
  versionDesc: string;
  versionNumber: number;
}

export type VersionMetadata = VersionMetadataFirst | VersionMetadataSubsequent;

type Nullable<T> = {
  [K in keyof T]: T[K] | null;
};

// A draft's version fields may still be null, but its slug and its
// publication's DOI metadata never are.
type UpdateDraftVersionMetadataBase = Nullable<
  Omit<VersionMetadataBase, "doiMetadata" | "slug">
> &
  Pick<VersionMetadataBase, "doiMetadata" | "slug">;

type UpdateDraftVersionMetadataFirst = UpdateDraftVersionMetadataBase & {
  canonicalDoi: string | null;
  previousVersionDoi: null;
  versionDesc: string | null;
  versionNumber: 1;
};

type UpdateDraftVersionMetadataSubsequent = UpdateDraftVersionMetadataBase & {
  canonicalDoi: string;
  previousVersionDoi: string | null;
  versionDesc: string | null;
  versionNumber: number;
};

type UpdateDraftVersionMetadata =
  | UpdateDraftVersionMetadataFirst
  | UpdateDraftVersionMetadataSubsequent;

export interface CanonicalMetadata {
  contributors: DataCitePerson[];
  creators: DataCitePerson[];
  dates: Array<{
    date: string;
    dateType: z.infer<typeof DateTypeSchema>;
    dateInformation?: string;
  }>;
  references: Array<{ url: string }>;
  supplements: Array<{ type: string; url: string; name: string | null }>;
  versionDois: string[];
}

export type UpdateDraftCanonicalMetadata = Omit<CanonicalMetadata, "dates"> & {
  dates: Array<{
    date?: string | undefined;
    dateType: z.infer<typeof DateTypeSchema>;
    dateInformation?: string;
  }>;
};

type VersionPayload = {
  contributors?: DataCitePerson[] | undefined;
  creators?: DataCitePerson[] | null;
  dates?: z.infer<typeof DateEntrySchema>[] | undefined;
  descriptions?: z.infer<typeof DescriptionSchema>[] | undefined;
  doi?: string | undefined;
  event?: "publish" | "hide" | undefined;
  language?: string;
  prefix?: string | undefined;
  publicationYear?: number | null;
  publisher?: DataCitePublisher;
  relatedIdentifiers?: z.infer<typeof RelatedIdentifierSchema>[];
  rightsList?: DataCiteRights[] | null;
  subjects?: z.infer<typeof DoiMetadataSubjectSchema>[];
  titles?: {
    lang: string;
    title: string;
    titleType?: "Subtitle" | undefined;
  }[];
  types?: z.infer<typeof DoiMetadataTypesSchema>;
  url?: string;
  version?: string;
};

const SUPPLEMENT_TYPE_MAP: Record<
  string,
  z.infer<typeof ResourceTypeGeneralSchema>
> = {
  code: "Software",
  data: "Dataset",
  "3d-printing-design": "Model",
  "physical-material": "PhysicalObject",
};

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

function buildTitles(title: string, subtitle: string, lang: string) {
  const titles: Array<{
    lang: string;
    title: string;
    titleType?: "Subtitle" | undefined;
  }> = [{ lang, title }];
  if (subtitle) {
    titles.push({
      lang,
      title: subtitle,
      titleType: "Subtitle" as const,
    });
  }
  return titles;
}

async function fetchAllPublishedVersions(repos: Repos, publicationId: string) {
  const versions = await repos.versions.listPublished(publicationId);
  return versions;
}

type PublishedVersionRow = Awaited<
  ReturnType<typeof fetchAllPublishedVersions>
>[number];

export async function fetchDoiMetadata(
  repos: Repos,
  publicationId: string
): Promise<DoiMetadata> {
  const doiMetadata = await repos.publications.findDoiMetadata(publicationId);
  if (doiMetadata === undefined) {
    throw new Error(`Publication ${publicationId} not found`);
  }
  return DoiMetadataSchema.parse(doiMetadata);
}

type CreatorRow = Awaited<
  ReturnType<ContributorsRepository["listForDatacite"]>
>[number];

export async function fetchCreators(
  repos: Repos,
  publicationId: string,
  versionId: string
): Promise<CreatorRow[]> {
  const rows = await repos.contributors.listForDatacite(
    publicationId,
    versionId
  );
  return rows;
}

export async function fetchReferences(repos: Repos, versionId: string) {
  return (await repos.versions.listReferences(versionId))
    .map((r) => ({ url: r.url }))
    .filter((r): r is { url: string } => r.url !== null);
}

export async function fetchSupplements(repos: Repos, versionId: string) {
  return await repos.versions.listLinkedAssets(versionId);
}

/**
 * Every contributor the publication has ever published with, for the concept
 * DOI — which stands for the publication as a whole, not for one version.
 * `fetchCreators` is the version-scoped counterpart, for a version's own DOI.
 *
 * A person is in the byline if they were in it on any published version, and
 * takes the highest billing (lowest `priority`) they were ever given; ties
 * break alphabetically, as they do within a single version.
 */
export async function fetchAllCreators(
  repos: Repos,
  publicationId: string
): Promise<CreatorRow[]> {
  const rows =
    await repos.contributors.listAllPublishedForDatacite(publicationId);
  return rows;
}

export async function fetchAllReferences(repos: Repos, publicationId: string) {
  return await repos.publications.listPublishedReferences(publicationId);
}

export async function fetchAllSupplements(repos: Repos, publicationId: string) {
  return await repos.publications.listPublishedLinkedAssets(publicationId);
}

// ---------------------------------------------------------------------------
// Metadata builders
// ---------------------------------------------------------------------------

export type DataCiteAffiliation = {
  name: string;
  affiliationIdentifier?: string;
  affiliationIdentifierScheme?: string;
  schemeUri?: string;
};

export type DataCiteNameIdentifier = {
  nameIdentifier: string;
  nameIdentifierScheme: string;
  // Optional: a "URL" scheme (unlike ORCID/ROR) has no registry home page of
  // its own to point at.
  schemeUri?: string;
};

type DataCitePerson = {
  name: string;
  nameType?: "Personal" | "Organizational";
  givenName?: string;
  familyName?: string;
  nameIdentifiers?: DataCiteNameIdentifier[];
  affiliation?: DataCiteAffiliation[];
  contributorType?: string;
};

type DataCitePublisher = {
  name: string;
};

const ASTERA_INSTITUTE_ROR = "https://ror.org/00ydx1s47";
const ROR_SCHEME_URI = "https://ror.org";

function buildAffiliation(
  dbAff: ListForDataciteAffiliation
): DataCiteAffiliation {
  const aff: DataCiteAffiliation = { name: dbAff.name };

  if (dbAff.name == "Astera Institute") {
    aff.affiliationIdentifier = ASTERA_INSTITUTE_ROR;
    aff.affiliationIdentifierScheme = "ROR";
    aff.schemeUri = ROR_SCHEME_URI;
  }

  if (dbAff.rorId) {
    aff.affiliationIdentifier = dbAff.rorId;
    aff.affiliationIdentifierScheme = "ROR";
    aff.schemeUri = ROR_SCHEME_URI;
  }
  return aff;
}

function buildPublisher(name: string): DataCitePublisher {
  return { name };
}

// Fixed HostingInstitution contributor (see buildContributorsField).
const ASTERA_INSTITUTE_CONTRIBUTOR: DataCitePerson = {
  name: "Astera Institute",
  nameType: "Organizational",
  affiliation: [],
  contributorType: "HostingInstitution",
  nameIdentifiers: [
    { nameIdentifier: "https://astera.org", nameIdentifierScheme: "URL" },
    {
      nameIdentifier: ASTERA_INSTITUTE_ROR,
      nameIdentifierScheme: "ROR",
      schemeUri: ROR_SCHEME_URI,
    },
  ],
};

// Astera Institute is only added as a contributor on The Stacks itself.
function buildContributorsField(
  contributors: DataCitePerson[],
  publisher: string
): DataCitePerson[] | undefined {
  if (publisher === "The Stacks") {
    return [...contributors, ASTERA_INSTITUTE_CONTRIBUTOR];
  }
  return contributors.length > 0 ? contributors : undefined;
}

/**
 *
 * @param creatorRows
 * @returns {[DataCitePerson[], DataCitePerson[]]} `[byline, contributors]`
 */
export function buildCreatorsMetadata(creatorRows: CreatorRow[]) {
  const byline: DataCitePerson[] = [];
  const contributors: DataCitePerson[] = [];

  for (const row of creatorRows) {
    const first = row.firstName.trim();
    const last = row.lastName.trim();
    if (!first && !last) continue;

    const person: DataCitePerson = {
      name: last && first ? `${last}, ${first}` : last || first,
      nameType: "Personal",
    };
    if (first) person.givenName = first;
    if (last) person.familyName = last;

    if (row["orcid"]) {
      person.nameIdentifiers = [
        {
          nameIdentifier: `https://orcid.org/${row["orcid"]}`,
          nameIdentifierScheme: "ORCID",
          schemeUri: "https://orcid.org",
        },
      ];
    }

    if (row.affiliations.length) {
      person.affiliation = row.affiliations.map(buildAffiliation);
    }

    if (row.inByline) {
      byline.push(person);
    } else {
      person.contributorType = "Other";
      contributors.push(person);
    }
  }

  if (byline.length === 0) byline.push({ name: "Unknown" });
  return [byline, contributors] as const;
}

function landingUrl(slug: string, versionNumber?: number): string {
  const base = `${getConfig().BASE_URL_WEB}/publications/${slug}`;
  return versionNumber != null ? `${base}/v${versionNumber}` : base;
}

type DataCiteRights = {
  rights: string;
  rightsIdentifier: string;
  rightsUri: string;
  schemeUri: string;
  rightsIdentifierScheme: string;
};

const SPDX_SCHEME_URI = "https://spdx.org/licenses/";

function toDataCiteRights(info: LicenseInfo): DataCiteRights {
  return {
    rights: info.rightsStatement,
    rightsIdentifier: info.spdxIdentifier,
    rightsUri: info.link,
    schemeUri: SPDX_SCHEME_URI,
    rightsIdentifierScheme: "SPDX",
  };
}

function rightsList(license: string) {
  const info = getLicense(license);
  if (!info) {
    logger.warn(
      { license },
      "Unrecognized publication license; reporting CC BY to DataCite"
    );
  }
  return [toDataCiteRights(info ?? getLicense(DEFAULT_LICENSE)!)];
}

const DOI_RESOLVER_PREFIXES = [
  "https://doi.org/",
  "http://doi.org/",
  "https://dx.doi.org/",
  "http://dx.doi.org/",
  "doi:",
] as const;

function identifierAndType(url: string) {
  const stripped = url.trim();
  const lowered = stripped.toLowerCase();
  for (const prefix of DOI_RESOLVER_PREFIXES) {
    if (lowered.startsWith(prefix)) {
      return {
        relatedIdentifier: stripped.slice(prefix.length),
        relatedIdentifierType: "DOI" as const,
      };
    }
  }
  if (DOI_REGEX.test(stripped)) {
    return {
      relatedIdentifier: stripped,
      relatedIdentifierType: "DOI" as const,
    };
  }
  return {
    relatedIdentifier: stripped,
    relatedIdentifierType: "URL" as const,
  };
}

function buildReferenceRelated(
  refs: Array<{ url: string }>
): z.infer<typeof RelatedIdentifierSchema>[] {
  return refs
    .filter((r) => r.url)
    .map((r) => ({
      ...identifierAndType(r.url),
      relationType: "References",
    }));
}

function buildSupplementRelated(
  sups: Array<{ type: string; url: string; name: string | null }>
): z.infer<typeof RelatedIdentifierSchema>[] {
  const related: z.infer<typeof RelatedIdentifierSchema>[] = [];
  for (const sup of sups) {
    if (!sup.url) continue;
    const resourceType =
      SUPPLEMENT_TYPE_MAP[sup.type?.toLowerCase()] ?? "Other";
    const identifier = identifierAndType(sup.url);
    if (sup.type?.toLowerCase() === "data+code") {
      related.push({
        ...identifier,
        relationType: "IsSupplementedBy",
        resourceTypeGeneral: "Software",
      });
      related.push({
        ...identifier,
        relationType: "IsSupplementedBy",
        resourceTypeGeneral: "Dataset",
      });
    } else {
      related.push({
        ...identifier,
        relationType: "IsSupplementedBy",
        resourceTypeGeneral: resourceType,
      });
    }
  }
  return related;
}

function deriveVersionDoi(
  cfg: Config,
  canonicalDoi: string,
  versionNumber: number
): string {
  // The concept DOI's prefix may not be the one we're currently configured
  // to mint under (e.g. it predates a prefix change), so the version DOI
  // always uses our own configured prefix with the concept DOI's suffix,
  // never the concept DOI's own prefix.
  const prefix = cfg.DATACITE_PREFIX.trim();
  const suffix = canonicalDoi.split("/").slice(1).join("/");
  return `${prefix}/${suffix}.${versionNumber}`;
}

export async function buildVersionPayload(
  meta: VersionMetadata | UpdateDraftVersionMetadata,
  opts: { draft?: boolean; newVersionDoi?: string; doi?: string } = {}
): Promise<{ data: { type: "dois"; attributes: VersionPayload } }> {
  const [title, subtitle, abstract] = await Promise.all([
    meta.title ? markdownToText(meta.title) : "",
    meta.subtitle ? markdownToText(meta.subtitle) : "",
    meta.abstract ? markdownToText(meta.abstract) : "",
  ]);

  const date = meta.publishDate ?? undefined;
  const dates: z.infer<typeof DateEntrySchema>[] = [
    { date, dateType: "Issued" },
  ];
  if (meta.versionDesc) {
    dates.push({
      date,
      dateType: "Updated",
      dateInformation: meta.versionDesc,
    });
  }

  const related: z.infer<typeof RelatedIdentifierSchema>[] = [
    ...(meta.references ? buildReferenceRelated(meta.references) : []),
    ...(meta.supplements ? buildSupplementRelated(meta.supplements) : []),
  ];

  if (meta.canonicalDoi) {
    related.push({
      relatedIdentifier: meta.canonicalDoi,
      relatedIdentifierType: "DOI",
      relationType: "IsVersionOf",
    });
  }
  if (meta.previousVersionDoi) {
    related.push({
      relatedIdentifier: meta.previousVersionDoi,
      relatedIdentifierType: "DOI",
      relationType: "IsNewVersionOf",
    });
  }
  if (opts.newVersionDoi) {
    related.push({
      relatedIdentifier: opts.newVersionDoi,
      relatedIdentifierType: "DOI",
      relationType: "IsPreviousVersionOf",
    });
  }

  const cfg = getConfig();
  const { content } = meta.doiMetadata;
  const attrs: VersionPayload = {
    titles: buildTitles(title, subtitle, content.language),
    creators: meta.creators,
    publisher: buildPublisher(cfg.DATACITE_PUBLISHER),
    publicationYear: meta.publicationYear,
    types: content.types,
    url: landingUrl(meta.slug, meta.versionNumber),
    language: content.language,
    version: String(meta.versionNumber),
    subjects: content.subjects,
    rightsList: meta.license ? rightsList(meta.license) : null,
    dates,
    relatedIdentifiers: related,
  };
  // The version DOI's suffix always derives from the concept DOI's suffix
  // (e.g. 10.82153/pff0-ck46.1) rather than being auto-generated by
  // DataCite; the caller is responsible for deciding and passing it in,
  // since which DOI to mint under is a business decision, not something
  // this payload builder should infer from `meta`.
  if (opts.doi) {
    attrs["doi"] = opts.doi;
  } else {
    attrs["prefix"] = cfg.DATACITE_PREFIX.trim();
  }
  if (!opts.draft) attrs["event"] = "publish";
  if (abstract) {
    attrs["descriptions"] = [
      {
        description: abstract,
        descriptionType: "Abstract",
        lang: content.language,
      },
    ];
  }
  const contributorsField = buildContributorsField(
    meta.contributors ?? [
      {
        name: "Unknown",
      },
    ],
    cfg.DATACITE_PUBLISHER
  );
  if (contributorsField) attrs["contributors"] = contributorsField;

  return { data: { type: "dois", attributes: attrs } };
}

export async function buildCanonicalPayload(
  meta: CanonicalMetadata | UpdateDraftCanonicalMetadata,
  versionMeta: VersionMetadata | UpdateDraftVersionMetadata,
  opts: { draft?: boolean } = {}
) {
  const [title, subtitle, abstract] = await Promise.all([
    versionMeta.title ? markdownToText(versionMeta.title) : "",
    versionMeta.subtitle ? markdownToText(versionMeta.subtitle) : "",
    versionMeta.abstract ? markdownToText(versionMeta.abstract) : "",
  ]);

  const related: z.infer<typeof RelatedIdentifierSchema>[] = [
    ...buildReferenceRelated(meta.references),
    ...buildSupplementRelated(meta.supplements),
    ...meta.versionDois.map(
      (doi): z.infer<typeof RelatedIdentifierSchema> => ({
        relatedIdentifier: doi,
        relatedIdentifierType: "DOI",
        relationType: "HasVersion",
      })
    ),
  ];

  const cfg = getConfig();
  const { content } = versionMeta.doiMetadata;
  const attrs: VersionPayload = {
    titles: buildTitles(title, subtitle, content.language),
    creators: meta.creators,
    publisher: buildPublisher(cfg.DATACITE_PUBLISHER),
    publicationYear: versionMeta.publicationYear,
    types: content.types,
    url: versionMeta.slug ? landingUrl(versionMeta.slug) : versionMeta.slug,
    language: content.language,
    subjects: content.subjects,
    rightsList:
      versionMeta.license !== null ? rightsList(versionMeta.license) : null,
    dates: meta.dates,
    relatedIdentifiers: related,
    prefix: versionMeta.canonicalDoi?.split("/")[0] ?? cfg.DATACITE_PREFIX,
  };
  if (!opts.draft) attrs["event"] = "publish";
  if (abstract) {
    attrs["descriptions"] = [
      {
        description: abstract,
        descriptionType: "Abstract",
        lang: content.language,
      },
    ];
  }
  const contributorsField = buildContributorsField(
    meta.contributors,
    cfg.DATACITE_PUBLISHER
  );
  if (contributorsField) attrs["contributors"] = contributorsField;

  return { data: { type: "dois", attributes: attrs } };
}

// Builds the concept DOI's `dates` array from a publication's published
// version history. allPublished is pre-filtered to state = 'PUBLISHED', so
// a version still in DRAFT gets no entry until it's actually published.
export function buildCanonicalDates(
  allPublished: Array<{
    versionNumber: number;
    createdAt: Date | string | null;
    versionDesc: string | null;
  }>,
  fallbackDate: string | null,
  pendingVersion?: { date: string | null; versionDesc: string | null }
): Array<{
  date: string | undefined;
  dateType: z.infer<typeof DateTypeSchema>;
  dateInformation?: string;
}> {
  const dates: Array<{
    date: string | undefined;
    dateType: z.infer<typeof DateTypeSchema>;
    dateInformation?: string;
  }> = [];
  for (const v of allPublished) {
    const created = v.createdAt;
    const dateStr = created
      ? created instanceof Date
        ? created.toISOString().slice(0, 10)
        : String(created).slice(0, 10)
      : fallbackDate;
    if (v.versionNumber === 1) {
      dates.push({ date: dateStr ?? undefined, dateType: "Issued" });
    } else {
      const entry: {
        date: string | undefined;
        dateType: z.infer<typeof DateTypeSchema>;
        dateInformation?: string;
      } = { date: dateStr ?? undefined, dateType: "Updated" };
      if (v.versionDesc) entry.dateInformation = v.versionDesc;
      dates.push(entry);
    }
  }

  if (pendingVersion) {
    // Not in allPublished, so the loop above never produced an entry for it
    // -- this is the only entry it gets.
    const entry: {
      date: string | undefined;
      dateType: z.infer<typeof DateTypeSchema>;
      dateInformation?: string;
    } = { date: pendingVersion.date ?? undefined, dateType: "Updated" };
    if (pendingVersion.versionDesc)
      entry.dateInformation = pendingVersion.versionDesc;
    dates.push(entry);
    return dates;
  }

  return dates;
}

// ---------------------------------------------------------------------------
// DataCite HTTP helpers
// ---------------------------------------------------------------------------

function dataciteAuthHeader(cfg: Config): string {
  return (
    "Basic " +
    Buffer.from(`${cfg.DATACITE_NAME}:${cfg.DATACITE_PASSWORD}`).toString(
      "base64"
    )
  );
}

// Only the envelope is checked: DataCite returns nulls and keys that
// DoiAttributesSchema doesn't model, so the attributes pass through as-is.
const DoiRecordEnvelopeSchema = z.object({
  data: z.object({ attributes: z.looseObject({}) }),
});

/**
 * DataCite's record for the DOI, or null only when DataCite answers 404.
 * Every other failure throws `DataciteRequestError`, so a caller can retry
 * rather than mistake an outage or rate limit for a missing record.
 */
export async function dataciteRawGet(
  doi: string
): Promise<DoiAttributes | null> {
  const cfg = getConfig();
  if (!cfg.DATACITE_NAME || !cfg.DATACITE_PASSWORD) {
    // Dev and test servers commonly run without DataCite.
    if (cfg.ENVIRONMENT !== "production") return null;
    throw new ConfigError(
      "DATACITE_NAME",
      "DataCite credentials are not configured"
    );
  }

  let resp: Response;
  try {
    resp = await fetch(
      `${cfg.DATACITE_API}/${doi}?publisher=true&affiliation=true`,
      {
        method: "GET",
        headers: { Authorization: dataciteAuthHeader(cfg) },
        signal: AbortSignal.timeout(60000),
      }
    );
  } catch (e) {
    throw new DataciteRequestError(
      doi,
      null,
      `DataCite GET for ${doi} got no response`,
      { cause: e }
    );
  }

  if (resp.status === 404) return null;
  if (resp.status !== 200) {
    throw new DataciteRequestError(
      doi,
      resp.status,
      `DataCite GET for ${doi} returned ${resp.status}`
    );
  }

  let body: unknown;
  try {
    body = await resp.json();
  } catch (e) {
    throw new DataciteRequestError(
      doi,
      resp.status,
      `DataCite GET for ${doi} returned an unreadable body`,
      { cause: e }
    );
  }

  // A null or missing record must throw, not return null: null means 404.
  const parsed = DoiRecordEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    throw new DataciteRequestError(
      doi,
      resp.status,
      `DataCite GET for ${doi} returned no record attributes`,
      { cause: parsed.error }
    );
  }
  return parsed.data.data.attributes as DoiAttributes;
}

// DataCite serves its web UI (Fabrica) from the API host with "api." swapped
// for "doi.", e.g. api.test.datacite.org -> doi.test.datacite.org.
function dataciteWebOrigin(): string {
  const api = new URL(getConfig().DATACITE_API);
  api.hostname = api.hostname.replace(/^api\./, "doi.");
  return api.origin;
}

/** The DOI's record page in DataCite's web UI (Fabrica). */
export function dataciteWebUrl(doi: string): string {
  return `${dataciteWebOrigin()}/dois/${encodeURIComponent(doi)}`;
}

async function dataciteCreate(
  payload: {
    data: {
      type: string;
      attributes: VersionPayload;
    };
  },
  expectedDoi?: string | null,
  expectedVersion?: { canonicalDoi: string; landingUrl: string }
): Promise<string | null> {
  const cfg = getConfig();
  if (!cfg.DATACITE_NAME || !cfg.DATACITE_PASSWORD) return null;
  try {
    const resp = await fetch(cfg.DATACITE_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/vnd.api+json",
        Authorization: dataciteAuthHeader(cfg),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000),
    });
    if (resp.status !== 200 && resp.status !== 201) {
      const body = await resp.text();
      if (expectedDoi && isDoiAlreadyTakenError(resp.status, body)) {
        // Retry of a request that actually succeeded server-side already --
        // confirm the record exists and treat it as success.
        const existing = await dataciteRawGet(expectedDoi);
        const expectedCanonicalDoi =
          expectedVersion?.canonicalDoi.toLowerCase();
        const belongsToVersion =
          existing &&
          existing.doi?.toLowerCase() === expectedDoi.toLowerCase() &&
          existing.url === expectedVersion?.landingUrl &&
          existing.relatedIdentifiers?.some(
            (relation) =>
              relation.relatedIdentifierType === "DOI" &&
              relation.relationType === "IsVersionOf" &&
              relation.relatedIdentifier?.toLowerCase() === expectedCanonicalDoi
          );
        if (belongsToVersion) {
          logger.warn(
            `DataCite create for ${expectedDoi} reported it was already taken; found the matching version record and recovered instead of failing`
          );
          return existing.doi!;
        }
      }
      logger.error({ status: resp.status, body }, "DataCite create failed");
      return null;
    }
    const data = (await resp.json()) as {
      data: { attributes: { doi: string } };
    };
    return data.data.attributes.doi;
  } catch (e) {
    logger.error({ err: e }, "DataCite API request failed");
    return null;
  }
}

function isDoiAlreadyTakenError(status: number, body: string): boolean {
  // DataCite returns 422 (not 409) for a duplicate DOI create.
  if (status !== 422) return false;
  try {
    const parsed = JSON.parse(body) as { errors?: Array<{ title?: string }> };
    return (parsed.errors ?? []).some((e) =>
      e.title?.toLowerCase().includes("already been taken")
    );
  } catch {
    return false;
  }
}

/**
 * Check if the DataCite API can access and modify the given DOI.
 * This serves as a probe for write access without altering the record.
 * @param doi The DOI to check.
 * @returns "success" if access is granted, "inaccessible" for confirmed denial, "failure" for an operational error.
 */
async function getDataCiteAccessDoiStatus(
  doi: string
): Promise<ExternalServiceAccessStatus> {
  const cfg = getConfig();
  try {
    const resp = await fetch(`${cfg.DATACITE_API}/${doi}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/vnd.api+json",
        Authorization: dataciteAuthHeader(cfg),
      },
      // An empty attributes object is a no-op update -- DataCite leaves
      // every unspecified field as-is -- so this doubles as a write-access
      // probe with no risk of changing the record. Confirmed empirically
      // against the sandbox: our own DOI returns 200, a DOI owned by a
      // different DataCite client returns 403.
      body: JSON.stringify({ data: { type: "dois", attributes: {} } }),
      signal: AbortSignal.timeout(60000),
    });
    if (resp.status === 200) return "success";
    return resp.status === 403 ? "inaccessible" : "failure";
  } catch (e) {
    logger.error(
      { err: e, doi },
      "DataCite PUT ownership check failed for DOI"
    );
    return "failure";
  }
}

/**
 * Check if we can write to the given canonical DOI.
 * TODO: This check can be removed once Arcadia DOIs are migrated to the configured account.
 * @param prefix The configured DOI prefix for our account.
 * @param canonicalDoi The canonical DOI to check write access for.
 * @returns "success" for access, "inaccessible" for confirmed denial, "failure" for an operational error.
 */
async function getWriteToCanonicalDoiStatus(
  prefix: string,
  canonicalDoi: string
): Promise<ExternalServiceAccessStatus> {
  // If the DOI starts with our configured prefix, we can write to it
  if (canonicalDoi.startsWith(`${prefix}/`)) return "success";

  // It is possible that the DOI has been migrated to be under the control of our account
  return getDataCiteAccessDoiStatus(canonicalDoi);
}

function getConfiguredDataCitePrefix(prefix: string): string | null {
  const p = prefix.trim();
  return p || null;
}

// A PUT leaves omitted attributes unchanged; null or [] clears one.
export type DataCiteAttributesPatch = {
  [K in keyof VersionPayload]?: VersionPayload[K] | null;
};

export async function dataciteUpdate(
  doi: string,
  payload: {
    data: {
      type: string;
      attributes: DataCiteAttributesPatch;
    };
  }
): Promise<boolean> {
  const cfg = getConfig();
  if (!cfg.DATACITE_NAME || !cfg.DATACITE_PASSWORD) return false;
  try {
    const resp = await fetch(`${cfg.DATACITE_API}/${doi}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/vnd.api+json",
        Authorization: dataciteAuthHeader(cfg),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000),
    });
    if (resp.status !== 200 && resp.status !== 201) {
      logger.error(
        { doi, status: resp.status, body: await resp.text() },
        "DataCite update failed"
      );
      return false;
    }
    return true;
  } catch (e) {
    logger.error({ err: e, doi }, "DataCite update failed for DOI");
    return false;
  }
}

async function mintDois(
  canonicalMeta: CanonicalMetadata | UpdateDraftCanonicalMetadata,
  versionMeta: VersionMetadata | UpdateDraftVersionMetadata,
  opts: { draft?: boolean; updateCanonical: boolean }
): Promise<[string | null, string | null]> {
  const cfg = getConfig();
  if (!cfg.DATACITE_NAME || !cfg.DATACITE_PASSWORD) return [null, null];

  // The concept DOI must exist before the version DOI can be minted, since
  // the version DOI's suffix derives from it (see deriveVersionDoi). For a
  // new publication it's created here, still auto-generated by DataCite;
  // for a new version of an existing publication it's already known.
  let canonicalDoi = versionMeta.canonicalDoi;
  if (canonicalDoi === null) {
    const initialCanonicalPayload = await buildCanonicalPayload(
      canonicalMeta,
      versionMeta,
      { draft: opts.draft }
    );
    canonicalDoi = await dataciteCreate(initialCanonicalPayload);
    if (!canonicalDoi) return [null, null];
    versionMeta.canonicalDoi = canonicalDoi;
  }

  const expectedVersionDoi = deriveVersionDoi(
    cfg,
    canonicalDoi,
    versionMeta.versionNumber
  );
  const versionPayload = await buildVersionPayload(versionMeta, {
    draft: opts.draft,
    doi: expectedVersionDoi,
  });
  const versionDoi = await dataciteCreate(versionPayload, expectedVersionDoi, {
    canonicalDoi,
    landingUrl: landingUrl(versionMeta.slug, versionMeta.versionNumber),
  });
  if (!versionDoi) return [canonicalDoi, null];

  // Skip syncing the concept DOI's metadata when it already represents a
  // published version — a draft's in-progress title/abstract/etc. must not
  // overwrite the public record of the currently-published version.
  if (!opts.updateCanonical) return [canonicalDoi, versionDoi];

  canonicalMeta.versionDois.push(versionDoi);
  const canonicalPayload = await buildCanonicalPayload(
    canonicalMeta,
    versionMeta,
    { draft: opts.draft }
  );
  if (!(await dataciteUpdate(canonicalDoi, canonicalPayload))) {
    // Do not let callers persist the version DOI until the concept record
    // links to it. A retry can recover the already-created deterministic DOI
    // and attempt this required update again.
    return [canonicalDoi, null];
  }

  return [canonicalDoi, versionDoi];
}

// When a new version is published, the previous version's own DataCite
// record needs to be updated to point forward at it (IsPreviousVersionOf).
async function updatePreviousVersionLink(
  publicationId: string | null,
  previousDoi: string,
  newVersionDoi: string
): Promise<void> {
  try {
    const existing = await dataciteRawGet(previousDoi);
    if (!existing) {
      logger.error(
        { publicationId, previousDoi, newVersionDoi },
        "Failed to fetch previous version DOI record to add IsPreviousVersionOf relation"
      );
      return;
    }

    const relatedIdentifiers: z.infer<typeof RelatedIdentifierSchema>[] =
      existing.relatedIdentifiers ?? [];
    const alreadyLinked = relatedIdentifiers.some(
      (r) =>
        r.relationType === "IsPreviousVersionOf" &&
        r.relatedIdentifierType === "DOI" &&
        r.relatedIdentifier?.toLowerCase() === newVersionDoi.toLowerCase()
    );
    if (alreadyLinked) return;

    const previousVersionLink: z.infer<typeof RelatedIdentifierSchema> = {
      relatedIdentifier: newVersionDoi,
      relatedIdentifierType: "DOI",
      relationType: "IsPreviousVersionOf",
    };
    const payload = {
      data: {
        type: "dois",
        attributes: {
          relatedIdentifiers: [...relatedIdentifiers, previousVersionLink],
        },
      },
    };

    if (!(await dataciteUpdate(previousDoi, payload))) {
      logger.error(
        { publicationId, previousDoi, newVersionDoi },
        "Failed to add IsPreviousVersionOf relation to previous version DOI"
      );
    }
  } catch (e) {
    logger.error(
      { err: e, publicationId, previousDoi, newVersionDoi },
      "Failed to add IsPreviousVersionOf relation to previous version DOI"
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function mintDoisForNewPubOrDraft(
  repos: Repos,
  publicationId: string,
  versionId: string,
  opts: {
    slug: string;
    title: string | null;
    subtitle: string | null;
    abstract: string | null;
    license: string;
    versionDesc: string | null;
    publishDate: string | null;
    draft?: boolean;
  }
): Promise<[string | null, string | null]> {
  const cfg = getConfig();
  if (!cfg.DATACITE_NAME || !cfg.DATACITE_PASSWORD) return [null, null];
  if (!getConfiguredDataCitePrefix(cfg.DATACITE_PREFIX)) {
    logger.warn(
      { publicationId },
      "Skipping DOI mint for publication: DATACITE_PREFIX is not configured"
    );
    return [null, null];
  }

  const [creatorRows, references, supplements, doiMetadata] = await Promise.all(
    [
      fetchCreators(repos, publicationId, versionId),
      fetchReferences(repos, versionId),
      fetchSupplements(repos, versionId),
      fetchDoiMetadata(repos, publicationId),
    ]
  );
  const [creators, contributors] = buildCreatorsMetadata(creatorRows);
  const year = opts.publishDate
    ? parseInt(opts.publishDate.slice(0, 4), 10)
    : null;

  const versionMeta: VersionMetadataFirst | UpdateDraftVersionMetadataFirst = {
    abstract: opts.abstract,
    title: opts.title,
    subtitle: opts.subtitle,
    creators,
    contributors,
    doiMetadata,
    license: opts.license,
    publicationYear: year,
    slug: opts.slug,
    references,
    supplements,
    publishDate: opts.publishDate,
    versionDesc: opts.versionDesc,
    canonicalDoi: null,
    previousVersionDoi: null,
    versionNumber: 1,
  };
  const canonicalMeta: CanonicalMetadata | UpdateDraftCanonicalMetadata = {
    creators,
    contributors,
    references,
    supplements,
    versionDois: [],
    dates: [{ date: opts.publishDate ?? undefined, dateType: "Issued" }],
  };
  return mintDois(canonicalMeta, versionMeta, {
    draft: opts.draft,
    // The concept DOI doesn't exist yet (this is a brand-new publication),
    // so this always creates it rather than overwriting a published record.
    updateCanonical: true,
  });
}

export async function mintDoisForNewPub(
  repos: Repos,
  publicationId: string,
  versionId: string,
  opts: {
    slug: string;
    title: string;
    subtitle: string;
    abstract: string;
    license: string;
    versionDesc: string | null;
    publishDate: string;
    draft?: false;
  }
): Promise<[string | null, string | null]> {
  return mintDoisForNewPubOrDraft(repos, publicationId, versionId, opts);
}

export async function mintDoisForNewPubDraft(
  repos: Repos,
  publicationId: string,
  versionId: string,
  opts: {
    slug: string;
    title: string | null;
    subtitle: string | null;
    abstract: string | null;
    license: string;
    versionDesc: string | null;
    publishDate: string | null;
    draft: true;
  }
): Promise<[string | null, string | null]> {
  return mintDoisForNewPubOrDraft(repos, publicationId, versionId, opts);
}

async function mintDoiForNewVersionOrDraft(
  repos: Repos,
  publicationId: string,
  versionId: string,
  opts: {
    slug: string;
    title: string | null;
    subtitle: string | null;
    abstract: string | null;
    license: string;
    versionNumber: number;
    versionDesc: string | null;
    publishDate: string | null;
    canonicalDoi: string;
    draft?: boolean;
    // Pass false when a prior version of this publication is already
    // published, so this draft's metadata doesn't overwrite the concept
    // DOI's public record. Required so callers must consciously decide.
    updateCanonical: boolean;
  }
): Promise<string | null> {
  const cfg = getConfig();
  if (!cfg.DATACITE_NAME || !cfg.DATACITE_PASSWORD) return null;
  const prefix = getConfiguredDataCitePrefix(cfg.DATACITE_PREFIX);
  if (!prefix) {
    logger.warn(
      { publicationId, versionId, versionNumber: opts.versionNumber },
      "Skipping DOI mint for publication: DATACITE_PREFIX is not configured"
    );
    return null;
  }
  if (
    (await getWriteToCanonicalDoiStatus(prefix, opts.canonicalDoi)) !==
    "success"
  ) {
    logger.warn(
      { publicationId, versionId, canonicalDoi: opts.canonicalDoi },
      "Skipping DOI mint for publication: concept DOI is not under our configured prefix and we do not have access to it"
    );
    return null;
  }

  const [
    creatorRows,
    references,
    supplements,
    allPublished,
    allCreatorRows,
    allReferences,
    allSupplements,
    doiMetadata,
  ] = await Promise.all([
    fetchCreators(repos, publicationId, versionId),
    fetchReferences(repos, versionId),
    fetchSupplements(repos, versionId),
    fetchAllPublishedVersions(repos, publicationId),
    fetchAllCreators(repos, publicationId),
    fetchAllReferences(repos, publicationId),
    fetchAllSupplements(repos, publicationId),
    fetchDoiMetadata(repos, publicationId),
  ]);
  const [creators, contributors] = buildCreatorsMetadata(creatorRows);
  const [allCreators, allContributors] = buildCreatorsMetadata(allCreatorRows);
  const year = opts.publishDate
    ? parseInt(opts.publishDate.slice(0, 4), 10)
    : null;

  const dates: Array<{
    date: string | undefined;
    dateType: z.infer<typeof DateTypeSchema>;
    dateInformation?: string;
  }> = [];
  let previousVersionDoi: string | null = null;
  let previousVersionRow: PublishedVersionRow | null = null;
  if (opts.versionNumber === 1) {
    // A concept DOI may already have been persisted after a partial first
    // mint. Retrying still needs to create the deterministic `.1` DOI and
    // must not require a previous version that cannot exist.
    dates.push({ date: opts.publishDate ?? undefined, dateType: "Issued" });
  } else {
    for (const v of allPublished) {
      if (v.versionNumber < opts.versionNumber && v.doi) {
        previousVersionRow = v;
      }
    }
    if (!previousVersionRow) {
      logger.error(
        `Cannot mint version ${opts.versionNumber}: no previous version DOI`
      );
      return null;
    }
    previousVersionDoi = previousVersionRow.doi!;
    dates.push(...buildCanonicalDates(allPublished, opts.publishDate));
  }

  const versionDois = allPublished.filter((v) => v.doi).map((v) => v.doi!);

  const versionMetaBase: VersionMetadataBase | UpdateDraftVersionMetadataBase =
    {
      abstract: opts.abstract,
      title: opts.title,
      subtitle: opts.subtitle,
      creators,
      contributors,
      doiMetadata,
      license: opts.license,
      publicationYear: year,
      slug: opts.slug,
      references,
      supplements,
      publishDate: opts.publishDate,
    };
  const versionMeta: VersionMetadata | UpdateDraftVersionMetadata =
    opts.versionNumber === 1
      ? {
          ...versionMetaBase,
          versionDesc: opts.versionDesc,
          previousVersionDoi: null,
          canonicalDoi: opts.canonicalDoi,
          versionNumber: 1,
        }
      : {
          ...versionMetaBase,
          versionDesc: opts.versionDesc ?? "Updated version",
          previousVersionDoi: previousVersionDoi!,
          canonicalDoi: opts.canonicalDoi,
          versionNumber: opts.versionNumber,
        };
  // A first version can be minted as a draft before anything is published
  // (retrying a mint whose concept DOI succeeded), when the publication-wide
  // queries find nothing; the concept DOI then describes this version alone,
  // as in `updateDois`.
  const canonicalMeta: CanonicalMetadata | UpdateDraftCanonicalMetadata =
    opts.versionNumber === 1
      ? { creators, contributors, references, supplements, versionDois, dates }
      : {
          creators: allCreators,
          contributors: allContributors,
          references: allReferences,
          supplements: allSupplements,
          versionDois,
          dates,
        };
  const [, versionDoi] = await mintDois(canonicalMeta, versionMeta, {
    draft: opts.draft,
    updateCanonical: opts.updateCanonical,
  });

  // Only link back from a version that is actually published; a draft new
  // version isn't publicly resolvable yet, so the previous version's record
  // shouldn't point at it.
  if (versionDoi && !opts.draft && previousVersionRow?.doi) {
    await updatePreviousVersionLink(
      publicationId,
      previousVersionRow.doi,
      versionDoi
    );
  }

  return versionDoi;
}

export async function mintDoiForNewVersion(
  repos: Repos,
  publicationId: string,
  versionId: string,
  opts: {
    slug: string;
    title: string;
    subtitle: string;
    abstract: string;
    license: string;
    versionNumber: number;
    versionDesc: string | null;
    publishDate: string;
    canonicalDoi: string;
    draft?: false;
    updateCanonical: boolean;
  }
): Promise<string | null> {
  return mintDoiForNewVersionOrDraft(repos, publicationId, versionId, {
    ...opts,
    // Actually publishing a version must always bring the concept DOI's
    // metadata in line with the newly published version.
    updateCanonical: true,
  });
}

export async function mintDoiForNewVersionDraft(
  repos: Repos,
  publicationId: string,
  versionId: string,
  opts: {
    slug: string;
    title: string | null;
    subtitle: string | null;
    abstract: string | null;
    license: string;
    versionNumber: number;
    versionDesc: string | null;
    publishDate: string | null;
    canonicalDoi: string;
    draft?: true;
    updateCanonical: boolean;
  }
): Promise<string | null> {
  return mintDoiForNewVersionOrDraft(repos, publicationId, versionId, opts);
}

async function updateDois(
  repos: Repos,
  publicationId: string,
  versionId: string,
  opts: {
    slug: string;
    title: string | null;
    subtitle: string | null;
    abstract: string | null;
    license: string | null;
    versionNumber: number;
    versionDesc: string | null;
    publishDate: string | null;
    canonicalDoi: string;
    versionDoi: string;
  },
  draft: boolean,
  updateCanonical: boolean
): Promise<ExternalServiceAccessStatus> {
  const cfg = getConfig();
  if (!cfg.DATACITE_NAME || !cfg.DATACITE_PASSWORD) return "failure";
  const prefix = getConfiguredDataCitePrefix(cfg.DATACITE_PREFIX);
  if (!prefix) {
    logger.warn(
      { publicationId, versionId, versionNumber: opts.versionNumber },
      "Skipping DOI mint for publication: DATACITE_PREFIX is not configured"
    );
    return "failure";
  }
  const canWrite = await getWriteToCanonicalDoiStatus(
    prefix,
    opts.canonicalDoi
  );
  if (canWrite === "failure") return "failure";
  if (canWrite === "inaccessible") {
    logger.warn(
      { publicationId, versionId, canonicalDoi: opts.canonicalDoi },
      "Skipping DOI publish: concept DOI is not under our configured prefix and we do not have access to it"
    );
    return "inaccessible";
  }

  const [creatorRows, references, supplements, doiMetadata] = await Promise.all(
    [
      fetchCreators(repos, publicationId, versionId),
      fetchReferences(repos, versionId),
      fetchSupplements(repos, versionId),
      fetchDoiMetadata(repos, publicationId),
    ]
  );
  const [creators, contributors] = buildCreatorsMetadata(creatorRows);
  const year = opts.publishDate
    ? parseInt(opts.publishDate.slice(0, 4), 10)
    : null;

  let versionMeta:
    | VersionMetadataSubsequent
    | UpdateDraftVersionMetadataSubsequent;
  let canonicalMeta: CanonicalMetadata | UpdateDraftCanonicalMetadata;
  let prevRow: PublishedVersionRow | null = null;
  let allPublished: PublishedVersionRow[] = [];

  if (opts.versionNumber === 1) {
    versionMeta = {
      abstract: opts.abstract,
      title: opts.title,
      subtitle: opts.subtitle,
      creators,
      contributors,
      doiMetadata,
      license: opts.license,
      publicationYear: year,
      slug: opts.slug,
      references,
      supplements,
      publishDate: opts.publishDate,
      versionDesc: opts.versionDesc,
      canonicalDoi: opts.canonicalDoi,
      previousVersionDoi: null,
      versionNumber: 1,
    };
    canonicalMeta = {
      creators,
      contributors,
      references,
      supplements,
      versionDois: [opts.versionDoi],
      dates: [{ date: opts.publishDate ?? undefined, dateType: "Issued" }],
    };
  } else {
    const [publishedRows, allCreatorRows, allReferences, allSupplements] =
      await Promise.all([
        fetchAllPublishedVersions(repos, publicationId),
        fetchAllCreators(repos, publicationId),
        fetchAllReferences(repos, publicationId),
        fetchAllSupplements(repos, publicationId),
      ]);
    const [allCreators, allContributors] =
      buildCreatorsMetadata(allCreatorRows);
    allPublished = publishedRows;
    for (const v of allPublished) {
      if (v.versionNumber < opts.versionNumber && v.doi) prevRow = v;
    }

    const dates = buildCanonicalDates(allPublished, opts.publishDate);

    const vdois = allPublished.filter((v) => v.doi).map((v) => v.doi!);
    if (!vdois.includes(opts.versionDoi)) vdois.push(opts.versionDoi);

    versionMeta = {
      abstract: opts.abstract,
      title: opts.title,
      subtitle: opts.subtitle,
      creators,
      contributors,
      doiMetadata,
      license: opts.license,
      publicationYear: year,
      slug: opts.slug,
      versionNumber: opts.versionNumber,
      references,
      supplements,
      publishDate: opts.publishDate,
      versionDesc: opts.versionDesc ?? "Updated version",
      previousVersionDoi: prevRow?.doi ?? "",
      canonicalDoi: opts.canonicalDoi,
    };
    canonicalMeta = {
      creators: allCreators,
      contributors: allContributors,
      references: allReferences,
      supplements: allSupplements,
      versionDois: vdois,
      dates,
    };
  }

  const versionPayload = await buildVersionPayload(versionMeta, {
    draft,
    doi: opts.versionDoi,
  });

  // Skip syncing the concept DOI's metadata when it already represents a
  // published version — a draft's in-progress title/abstract/etc. must not
  // overwrite the public record of the currently-published version.
  if (!updateCanonical) return "success";

  const canonicalPayload = await buildCanonicalPayload(
    canonicalMeta,
    versionMeta,
    { draft }
  );

  if (!(await dataciteUpdate(opts.versionDoi, versionPayload)))
    return "failure";
  if (!(await dataciteUpdate(opts.canonicalDoi, canonicalPayload)))
    return "failure";

  // Best-effort back-link from the previous version's own DataCite record
  // to this one; see updatePreviousVersionLink.
  if (prevRow?.doi) {
    await updatePreviousVersionLink(
      publicationId,
      prevRow.doi,
      opts.versionDoi
    );
  }

  return "success";
}

export async function publishDraftDois(
  repos: Repos,
  publicationId: string,
  versionId: string,
  opts: {
    slug: string;
    title: string;
    subtitle: string;
    abstract: string;
    license: string;
    versionNumber: number;
    versionDesc: string | null;
    publishDate: string;
    canonicalDoi: string;
    versionDoi: string;
  }
): Promise<ExternalServiceAccessStatus> {
  // Actually publishing a version must always bring the concept DOI's
  // metadata in line with the newly published version.
  return updateDois(repos, publicationId, versionId, opts, false, true);
}

export async function updateDraftDois(
  repos: Repos,
  publicationId: string,
  versionId: string,
  opts: {
    slug: string;
    title: string | null;
    subtitle: string | null;
    abstract: string | null;
    license: string | null;
    versionNumber: number;
    versionDesc: string | null;
    publishDate: string | null;
    canonicalDoi: string;
    versionDoi: string;
  },
  // Pass false when a prior version of this publication is already
  // published, so this draft's metadata doesn't overwrite the concept
  // DOI's public record. Required so callers must consciously decide.
  updateCanonical: boolean
): Promise<ExternalServiceAccessStatus> {
  return updateDois(
    repos,
    publicationId,
    versionId,
    opts,
    true,
    updateCanonical
  );
}

/**
 * Moves DOIs between DataCite's findable and registered states: `hide`
 * takes a findable DOI out of DataCite's search/discovery while it keeps
 * resolving, `publish` makes a registered DOI findable again. DOIs we can't
 * write to (e.g. a foreign concept DOI) are skipped.
 * Does nothing when DataCite isn't configured.
 * @returns false if any accessible DOI failed to update.
 */
export async function setDoisFindable(
  dois: string[],
  findable: boolean
): Promise<boolean> {
  const cfg = getConfig();
  if (!cfg.DATACITE_NAME || !cfg.DATACITE_PASSWORD) return true;
  const prefix = getConfiguredDataCitePrefix(cfg.DATACITE_PREFIX);
  if (!prefix) return true;

  const event = findable ? "publish" : "hide";
  let allUpdated = true;
  for (const doi of dois) {
    if ((await getWriteToCanonicalDoiStatus(prefix, doi)) !== "success") {
      logger.warn(
        { doi, event },
        "Skipping DataCite state change: no write access to DOI"
      );
      continue;
    }
    const updated = await dataciteUpdate(doi, {
      data: { type: "dois", attributes: { event } },
    });
    allUpdated &&= updated;
  }
  return allUpdated;
}

/**
 * Deletes draft-state DOIs under our own prefix. DataCite only permits
 * deleting drafts; DOIs under any other prefix are never touched. Stops at
 * the first failure. A DOI DataCite no longer has (404) counts as deleted,
 * so a retry after a partial failure can finish the job.
 * Does nothing when DataCite isn't configured.
 * @returns false if one of our DOIs could not be deleted.
 */
export async function deleteDraftDois(dois: string[]): Promise<boolean> {
  const cfg = getConfig();
  if (!cfg.DATACITE_NAME || !cfg.DATACITE_PASSWORD) return true;
  const prefix = getConfiguredDataCitePrefix(cfg.DATACITE_PREFIX);
  if (!prefix) return true;

  for (const doi of dois) {
    if (!doi.startsWith(`${prefix}/`)) continue;
    try {
      const resp = await fetch(`${cfg.DATACITE_API}/${doi}`, {
        method: "DELETE",
        headers: { Authorization: dataciteAuthHeader(cfg) },
        signal: AbortSignal.timeout(60000),
      });
      if (resp.status !== 204 && resp.status !== 404) {
        logger.error(
          { doi, status: resp.status, body: await resp.text() },
          "DataCite draft DOI delete failed"
        );
        return false;
      }
    } catch (e) {
      logger.error({ err: e, doi }, "DataCite draft DOI delete failed");
      return false;
    }
  }
  return true;
}

export {
  buildCanonicalDates as _buildCanonicalDates,
  buildCanonicalPayload as _buildCanonicalPayload,
  buildCreatorsMetadata as _buildCreatorsMetadata,
  buildReferenceRelated as _buildReferenceRelated,
  buildSupplementRelated as _buildSupplementRelated,
  buildVersionPayload as _buildVersionPayload,
  dataciteUpdate as _dataciteUpdate,
  deriveVersionDoi as _deriveVersionDoi,
  mintDois as _mintDois,
};
