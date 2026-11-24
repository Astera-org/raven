import { type buildVersionPayload } from "#src/lib/datacite/client.js";
import {
  type Creator,
  type Description,
  type DoiAttributes,
  type RelatedIdentifier,
  type Rights,
  type Subject,
  type Title,
  type Types,
} from "#src/types/datacite.js";

/**
 * The attributes The Stacks would send DataCite, as the DataCite client's
 * payload builders type them.
 */
export type StacksAttributes = Awaited<
  ReturnType<typeof buildVersionPayload>
>["data"]["attributes"];

export type ComparableValue = ComparableMetadata[keyof ComparableMetadata];

export interface MetadataFieldDiff {
  field: keyof ComparableMetadata;
  expected: ComparableValue;
  actual: ComparableValue;
}

export interface MetadataComparisonResult {
  doi: string;
  found: boolean;
  matches: boolean;
  diffs: MetadataFieldDiff[];
  // Full attribute objects for both sides, for a drill-down view -- diffs
  // above only cover the curated subset in toComparable.
  stacksMetadata: StacksAttributes;
  dataciteMetadata: DoiAttributes | null;
}

function normalizePerson(p: Creator) {
  const nameIds = p.nameIdentifiers ?? [];
  const affiliations = p.affiliation ?? [];
  return {
    name: p.name ?? null,
    givenName: p.givenName ?? null,
    familyName: p.familyName ?? null,
    orcid:
      nameIds.find((n) => n.nameIdentifierScheme === "ORCID")?.nameIdentifier ??
      null,
    // Sorted: our DB query and DataCite's stored order aren't guaranteed to
    // agree on affiliation order for a single person, and that's not a real
    // discrepancy worth surfacing.
    affiliations: affiliations.map((a) => a.name).sort(),
  };
}

function normalizeDates(
  dates:
    | Array<{
        date?: string | null;
        dateType: string;
        dateInformation?: string | null;
      }>
    | undefined
) {
  return (dates ?? [])
    .filter((d) => d.dateType === "Issued" || d.dateType === "Updated")
    .map((d) => ({
      // The Stacks omits a missing date; DataCite may return it as null.
      date: d.date ?? null,
      dateType: d.dateType,
      dateInformation: d.dateInformation ?? null,
    }))
    .sort((a, b) =>
      `${a.date}|${a.dateType}|${a.dateInformation}`.localeCompare(
        `${b.date}|${b.dateType}|${b.dateInformation}`
      )
    );
}

function normalizeRelatedIdentifiers(related: RelatedIdentifier[] | undefined) {
  return (related ?? [])
    .map((r) => {
      const relatedIdentifierType = r.relatedIdentifierType ?? null;
      const rawIdentifier = String(r.relatedIdentifier ?? "");
      return {
        relationType: r.relationType ?? null,
        relatedIdentifierType,
        // DOIs are case-insensitive, so casing differences there aren't a
        // real discrepancy -- but a URL's path is case-sensitive, so
        // lowercasing one would mask an actual mismatch.
        relatedIdentifier:
          relatedIdentifierType === "DOI"
            ? rawIdentifier.toLowerCase()
            : rawIdentifier,
        resourceTypeGeneral: r.resourceTypeGeneral ?? null,
      };
    })
    .sort((a, b) =>
      `${a.relationType}|${a.relatedIdentifierType}|${a.relatedIdentifier}|${a.resourceTypeGeneral}`.localeCompare(
        `${b.relationType}|${b.relatedIdentifierType}|${b.relatedIdentifier}|${b.resourceTypeGeneral}`
      )
    );
}

// DataCite's GET response adds ris/bibtex/citeproc/schemaOrg to every
// record; Stacks never sends them, so comparing raw objects would flag
// every DOI as mismatched forever. Keep only what Stacks submits.
function normalizeTypes(types: Types | undefined) {
  return {
    resourceTypeGeneral: types?.resourceTypeGeneral ?? null,
    resourceType: types?.resourceType ?? null,
  };
}

function normalizeSubjects(subjects: Subject[] | undefined) {
  return (subjects ?? [])
    .map((s) => ({
      subject: s.subject ?? null,
      subjectScheme: s.subjectScheme ?? null,
      schemeUri: s.schemeUri ?? null,
      classificationCode: s.classificationCode ?? null,
    }))
    .sort((a, b) => (a.subject ?? "").localeCompare(b.subject ?? ""));
}

// SPDX identifiers are case-insensitive, and DataCite lowercases the ones
// Stacks sends (e.g. "CC-BY-4.0" comes back as "cc-by-4.0").
function normalizeRightsList(rights: Rights[] | null | undefined) {
  return (rights ?? [])
    .map((r) => ({
      rights: r.rights ?? null,
      rightsIdentifier: r.rightsIdentifier?.toLowerCase() ?? null,
      rightsUri: r.rightsUri ?? null,
      schemeUri: r.schemeUri ?? null,
      rightsIdentifierScheme: r.rightsIdentifierScheme ?? null,
    }))
    .sort((a, b) =>
      (a.rightsIdentifier ?? a.rights ?? "").localeCompare(
        b.rightsIdentifier ?? b.rights ?? ""
      )
    );
}

export interface ComparableMetadata {
  title: string | null;
  subtitle: string | null;
  abstract: string | null;
  publisher: NonNullable<DoiAttributes["publisher"]> | null;
  publicationYear: number | null;
  url: string | null;
  version: string | null;
  language: string | null;
  types: ReturnType<typeof normalizeTypes>;
  subjects: ReturnType<typeof normalizeSubjects>;
  rightsList: ReturnType<typeof normalizeRightsList>;
  creators: ReturnType<typeof normalizePerson>[];
  contributors: ReturnType<typeof normalizePerson>[];
  dates: ReturnType<typeof normalizeDates>;
  relatedIdentifiers: ReturnType<typeof normalizeRelatedIdentifiers>;
}

// Normalizes to a fixed shape so array/key order never registers as a diff
// on its own -- only an actual missing or differing value does.
//
// The Stacks' side is the client's untyped payload, so each field is read as
// DataCite's type for it. The payload is built to DataCite's schema, but an
// unset value can be null where DataCite's type says only optional. Reads fall
// back with `??`.
export function toComparable(
  attrs: StacksAttributes | DoiAttributes
): ComparableMetadata {
  const titles = attrs["titles"] as Title[] | undefined;
  const descriptions = attrs["descriptions"] as Description[] | undefined;
  return {
    title: titles?.find((t) => !t.titleType)?.title ?? null,
    subtitle: titles?.find((t) => t.titleType === "Subtitle")?.title ?? null,
    abstract:
      descriptions?.find((d) => d.descriptionType === "Abstract")
        ?.description ?? null,
    publisher: (attrs["publisher"] as DoiAttributes["publisher"]) ?? null,
    publicationYear: (attrs["publicationYear"] as number | undefined) ?? null,
    url: (attrs["url"] as string | undefined) ?? null,
    version: (attrs["version"] as string | undefined) ?? null,
    language: (attrs["language"] as string | undefined) ?? null,
    types: normalizeTypes(attrs["types"] as Types | undefined),
    subjects: normalizeSubjects(attrs["subjects"] as Subject[] | undefined),
    rightsList: normalizeRightsList(
      attrs["rightsList"] as Rights[] | null | undefined
    ),
    creators: ((attrs["creators"] as Creator[] | undefined) ?? []).map(
      normalizePerson
    ),
    contributors: ((attrs["contributors"] as Creator[] | undefined) ?? []).map(
      normalizePerson
    ),
    dates: normalizeDates(
      attrs["dates"] as Array<{
        date?: string | null;
        dateType: string;
        dateInformation?: string | null;
      }>
    ),
    relatedIdentifiers: normalizeRelatedIdentifiers(
      attrs["relatedIdentifiers"] as RelatedIdentifier[] | undefined
    ),
  };
}

// DataCite stores a more specific rightsUri than Stacks sends (e.g. the
// license's ".../legalcode" URL), so DataCite's URI counts as matching when
// it starts with Stacks' URI. Only that direction is accepted.
function alignRightsUris(
  expected: ComparableMetadata["rightsList"],
  actual: ComparableMetadata["rightsList"]
): ComparableMetadata["rightsList"] {
  return actual.map((a, i) => {
    const expectedUri = expected[i]?.rightsUri;
    if (!expectedUri || !a.rightsUri?.startsWith(expectedUri)) return a;
    return { ...a, rightsUri: expectedUri };
  });
}

export function diffComparable(
  expected: ComparableMetadata,
  actual: ComparableMetadata
): MetadataFieldDiff[] {
  const diffs: MetadataFieldDiff[] = [];
  for (const field of Object.keys(expected) as Array<
    keyof ComparableMetadata
  >) {
    const e = expected[field];
    const a = actual[field];
    const comparableActual =
      field === "rightsList"
        ? alignRightsUris(expected.rightsList, actual.rightsList)
        : a;
    if (JSON.stringify(e) !== JSON.stringify(comparableActual)) {
      diffs.push({ field, expected: e, actual: a });
    }
  }
  return diffs;
}
