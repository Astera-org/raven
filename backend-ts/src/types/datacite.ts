/**
 * Zod schemas for the DataCite REST API response to:
 *   GET https://api.datacite.org/dois/{id}
 *   GET https://api.test.datacite.org/dois/{id}
 *
 * Derived from the OpenAPI definition (REST API v2.3.0), `DoiDetailItem`.
 * Media type: application/vnd.api+json
 *
 * Schemas are suffixed `Schema`; the inferred types are exported under the
 * same names as the hand-written interfaces, so this file is a drop-in
 * replacement for `datacite-doi.ts`.
 *
 * Written against APIs that are stable across Zod 3 and 4 (no `.merge()`,
 * no `.passthrough()`, no `z.looseObject`).
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Controlled vocabularies
// ---------------------------------------------------------------------------

export const DoiStateSchema = z.enum(["findable", "registered", "draft"]);

export const DoiSourceSchema = z.enum([
  "mds",
  "api",
  "fabricaForm",
  "fabrica",
  "ez",
]);

export const NameTypeSchema = z.enum(["Personal", "Organizational"]);

export const TitleTypeSchema = z.enum([
  "AlternativeTitle",
  "Subtitle",
  "TranslatedTitle",
  "Other",
]);

export const DateTypeSchema = z.enum([
  "Accepted",
  "Available",
  "Copyrighted",
  "Collected",
  "Coverage",
  "Created",
  "Issued",
  "Submitted",
  "Updated",
  "Valid",
  "Withdrawn",
  "Other",
]);

export const DescriptionTypeSchema = z.enum([
  "Abstract",
  "Methods",
  "SeriesInformation",
  "TableOfContents",
  "TechnicalInfo",
  "Other",
]);

export const NumberTypeSchema = z.enum([
  "Article",
  "Chapter",
  "Report",
  "Other",
]);

export const FunderIdentifierTypeSchema = z.enum([
  "Crossref Funder ID",
  "GRID",
  "ISNI",
  "ROR",
  "Other",
]);

export const ResourceTypeGeneralSchema = z.enum([
  "Audiovisual",
  "Award",
  "Book",
  "BookChapter",
  "Collection",
  "ComputationalNotebook",
  "ConferencePaper",
  "ConferenceProceeding",
  "DataPaper",
  "Dataset",
  "Dissertation",
  "Event",
  "Image",
  "Instrument",
  "InteractiveResource",
  "Journal",
  "JournalArticle",
  "Model",
  "OutputManagementPlan",
  "PeerReview",
  "PhysicalObject",
  "Poster",
  "Preprint",
  "Presentation",
  "Project",
  "Report",
  "Service",
  "Software",
  "Sound",
  "Standard",
  "StudyRegistration",
  "Text",
  "Workflow",
  "Other",
]);

export const ContributorTypeSchema = z.enum([
  "ContactPerson",
  "DataCollector",
  "DataCurator",
  "DataManager",
  "Distributor",
  "Editor",
  "HostingInstitution",
  "Producer",
  "ProjectLeader",
  "ProjectManager",
  "ProjectMember",
  "RegistrationAgency",
  "RegistrationAuthority",
  "RelatedPerson",
  "Researcher",
  "ResearchGroup",
  "RightsHolder",
  "Sponsor",
  "Supervisor",
  "Translator",
  "WorkPackageLeader",
  "Other",
]);

export const RelatedIdentifierTypeSchema = z.enum([
  "ARK",
  "arXiv",
  "bibcode",
  "CSTR",
  "DOI",
  "EAN13",
  "EISSN",
  "Handle",
  "IGSN",
  "ISBN",
  "ISSN",
  "ISTC",
  "LISSN",
  "LSID",
  "PMID",
  "PURL",
  "RAiD",
  "RRID",
  "SWHID",
  "UPC",
  "URL",
  "URN",
  "w3id",
]);

export const RelationTypeSchema = z.enum([
  "IsCitedBy",
  "Cites",
  "IsSupplementTo",
  "IsSupplementedBy",
  "IsContinuedBy",
  "Continues",
  "IsDescribedBy",
  "Describes",
  "HasMetadata",
  "IsMetadataFor",
  "HasVersion",
  "IsVersionOf",
  "IsNewVersionOf",
  "IsPreviousVersionOf",
  "IsPartOf",
  "HasPart",
  "IsPublishedIn",
  "IsReferencedBy",
  "References",
  "IsDocumentedBy",
  "Documents",
  "IsCompiledBy",
  "Compiles",
  "IsVariantFormOf",
  "IsOriginalFormOf",
  "IsIdenticalTo",
  "IsReviewedBy",
  "Reviews",
  "IsDerivedFrom",
  "IsSourceOf",
  "IsRequiredBy",
  "Requires",
  "IsObsoletedBy",
  "Obsoletes",
  "IsCollectedBy",
  "Collects",
  "IsTranslationOf",
  "HasTranslation",
  "Other",
]);

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export const IdentifierSchema = z.object({
  identifier: z.string().optional(),
  identifierType: z.string().optional(),
});

export const AlternateIdentifierSchema = z.object({
  alternateIdentifierType: z.string().optional(),
  alternateIdentifier: z.string().optional(),
});

export const DoiIdentifierPropertiesSchema = z.object({
  /** The full DOI name. */
  doi: z.string().optional(),
  /** The DOI prefix. */
  prefix: z.string().optional(),
  /** The DOI suffix. Read-only. */
  suffix: z.string().optional(),
  /** Equivalent to the AlternateIdentifier property in the metadata schema. */
  identifiers: z.array(IdentifierSchema).optional(),
  alternateIdentifiers: z.array(AlternateIdentifierSchema).optional(),
});

// ---------------------------------------------------------------------------
// Metadata properties (DataCite Metadata Schema 4.x)
// ---------------------------------------------------------------------------

export const NameIdentifierSchema = z.object({
  nameIdentifier: z.string().optional(),
  nameIdentifierScheme: z.string().optional(),
  schemeUri: z.string().optional(),
});

/** Set `?affiliation=true` to get the identifier fields populated. */
export const AffiliationSchema = z.object({
  affiliationIdentifier: z.string().optional(),
  affiliationIdentifierScheme: z.string().optional(),
  name: z.string().optional(),
  schemeUri: z.string().optional(),
});

export const CreatorSchema = z.object({
  nameType: NameTypeSchema.optional(),
  nameIdentifiers: z.array(NameIdentifierSchema).optional(),
  name: z.string().optional(),
  givenName: z.string().optional(),
  familyName: z.string().optional(),
  affiliation: z.array(AffiliationSchema).optional(),
  lang: z.string().optional(),
});

export const ContributorSchema = CreatorSchema.extend({
  contributorType: ContributorTypeSchema.optional(),
});

export const TitleSchema = z.object({
  title: z.string().optional(),
  titleType: TitleTypeSchema.optional(),
  lang: z.string().optional(),
});

export const PublisherSchema = z.object({
  name: z.string().optional(),
  publisherIdentifier: z.string().optional(),
  publisherIdentifierScheme: z.string().optional(),
  schemeUri: z.string().optional(),
  lang: z.string().optional(),
});

export const ContainerSchema = z.object({
  type: z.string().optional(),
  identifier: z.string().optional(),
  identifierType: z.string().optional(),
  title: z.string().optional(),
  volume: z.string().optional(),
  issue: z.string().optional(),
  firstPage: z.string().optional(),
  lastPage: z.string().optional(),
});

export const SubjectSchema = z.object({
  subject: z.string().optional(),
  subjectScheme: z.string().optional(),
  schemeUri: z.string().optional(),
  valueUri: z.string().optional(),
  lang: z.string().optional(),
  classificationCode: z.string().optional(),
});

export const DateEntrySchema = z.object({
  date: z.string().optional(),
  dateType: DateTypeSchema.optional(),
  dateInformation: z.string().optional(),
});

export const TypesSchema = z.object({
  resourceTypeGeneral: ResourceTypeGeneralSchema.optional(),
  resourceType: z.string().optional(),
  schemaOrg: z.string().optional(),
  bibtex: z.string().optional(),
  citeproc: z.string().optional(),
  ris: z.string().optional(),
});

export const RelatedIdentifierSchema = z.object({
  relatedIdentifier: z.string().optional(),
  relatedIdentifierType: RelatedIdentifierTypeSchema.optional(),
  relationType: RelationTypeSchema.optional(),
  resourceTypeGeneral: ResourceTypeGeneralSchema.optional(),
  relatedMetadataScheme: z.string().optional(),
  schemeUri: z.string().optional(),
  schemeType: z.string().optional(),
  relationTypeInformation: z.string().optional(),
});

export const RelatedItemIdentifierSchema = z.object({
  relatedItemIdentifier: z.string().optional(),
  relatedItemIdentifierType: RelatedIdentifierTypeSchema.optional(),
  relatedMetadataScheme: z.string().optional(),
  schemeURI: z.string().optional(),
  schemeType: z.string().optional(),
});

export const RelatedItemCreatorSchema = z.object({
  name: z.string().optional(),
  givenName: z.string().optional(),
  familyName: z.string().optional(),
  nameType: NameTypeSchema.optional(),
});

export const RelatedItemContributorSchema = RelatedItemCreatorSchema.extend({
  contributorType: ContributorTypeSchema.optional(),
});

export const RelatedItemSchema = z.object({
  relatedItemType: ResourceTypeGeneralSchema.optional(),
  relationType: RelationTypeSchema.optional(),
  relatedItemIdentifier: RelatedItemIdentifierSchema.optional(),
  relationTypeInformation: z.string().optional(),
  creators: z.array(RelatedItemCreatorSchema).optional(),
  titles: z
    .array(TitleSchema.pick({ title: true, titleType: true }))
    .optional(),
  volume: z.string().optional(),
  issue: z.string().optional(),
  number: z.string().optional(),
  numberType: NumberTypeSchema.optional(),
  firstPage: z.string().optional(),
  lastPage: z.string().optional(),
  publisher: z.string().optional(),
  /** A string here, unlike the top-level `publicationYear`. */
  publicationYear: z.string().optional(),
  edition: z.string().optional(),
  contributors: z.array(RelatedItemContributorSchema).optional(),
});

export const RightsSchema = z.object({
  rights: z.string().optional(),
  rightsUri: z.string().optional(),
  schemeUri: z.string().optional(),
  rightsIdentifier: z.string().optional(),
  rightsIdentifierScheme: z.string().optional(),
  lang: z.string().optional(),
});

export const DescriptionSchema = z.object({
  description: z.string().optional(),
  descriptionType: DescriptionTypeSchema.optional(),
  lang: z.string().optional(),
});

export const GeoLocationPointSchema = z.object({
  pointLongitude: z.number().optional(),
  pointLatitude: z.number().optional(),
});

export const GeoLocationBoxSchema = z.object({
  westBoundLongitude: z.number().optional(),
  eastBoundLongitude: z.number().optional(),
  southBoundLatitude: z.number().optional(),
  northBoundLatitude: z.number().optional(),
});

export const GeoLocationPolygonPointSchema = z.union([
  z.object({ polygonPoint: GeoLocationPointSchema.optional() }),
  z.object({ inPolygonPoint: GeoLocationPointSchema.optional() }),
]);

export const GeoLocationSchema = z.object({
  geoLocationBox: GeoLocationBoxSchema.optional(),
  geoLocationPlace: z.string().optional(),
  geoLocationPoint: GeoLocationPointSchema.optional(),
  geoLocationPolygon: z.array(GeoLocationPolygonPointSchema).optional(),
});

export const FundingReferenceSchema = z.object({
  funderName: z.string().optional(),
  funderIdentifier: z.string().optional(),
  funderIdentifierType: FunderIdentifierTypeSchema.optional(),
  awardNumber: z.string().optional(),
  awardUri: z.string().optional(),
  awardTitle: z.string().optional(),
});

export const DoiPropertiesMetadataSchema = z.object({
  creators: z.array(CreatorSchema).optional(),
  titles: z.array(TitleSchema).optional(),
  /**
   * A bare string unless the request sets `?publisher=true`, in which case
   * the object form with the publisher identifier is returned.
   */
  publisher: z.union([PublisherSchema, z.string()]).optional(),
  container: ContainerSchema.optional(),
  publicationYear: z.number().int().optional(),
  subjects: z.array(SubjectSchema).optional(),
  contributors: z.array(ContributorSchema).optional(),
  dates: z.array(DateEntrySchema).optional(),
  language: z.string().optional(),
  types: TypesSchema.optional(),
  relatedIdentifiers: z.array(RelatedIdentifierSchema).optional(),
  relatedItems: z.array(RelatedItemSchema).optional(),
  sizes: z.array(z.string()).optional(),
  formats: z.array(z.string()).optional(),
  version: z.string().optional(),
  rightsList: z.array(RightsSchema).optional(),
  descriptions: z.array(DescriptionSchema).optional(),
  geoLocations: z.array(GeoLocationSchema).optional(),
  fundingReferences: z.array(FundingReferenceSchema).optional(),
});

// ---------------------------------------------------------------------------
// Other attribute groups
// ---------------------------------------------------------------------------

export const DoiPropertiesXmlSchema = z.object({
  /** Full DataCite Metadata Schema XML, Base64-encoded. */
  xml: z.string().optional(),
});

export const DoiPropertiesOtherSchema = z.object({
  /** The landing page URL of the DOI. */
  url: z.string().optional(),
  contentUrl: z.array(z.string()).optional(),
  metadataVersion: z.number().optional(),
  schemaVersion: z.string().optional(),
  source: DoiSourceSchema.optional(),
  /** True if the DOI is in Findable state. */
  isActive: z.boolean().optional(),
  state: DoiStateSchema.optional(),
  /** Legacy attribute for EZID compatibility. */
  reason: z.string().optional(),
});

export const DoiPropertiesDatesSchema = z.object({
  created: z.string().optional(),
  registered: z.string().optional(),
  updated: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Usage and citation statistics (sourced from Event Data)
// ---------------------------------------------------------------------------

export const MonthlyTotalSchema = z.object({
  yearMonth: z.string().optional(),
  total: z.number().optional(),
});

export const YearlyTotalSchema = z.object({
  year: z.string().optional(),
  total: z.number().optional(),
});

export const LandingPageSchema = z.object({
  checked: z.string().optional(),
  url: z.string().optional(),
  contentType: z.string().optional(),
  error: z.string().optional(),
  redirectCount: z.number().optional(),
  redirectUrls: z.array(z.string()).optional(),
  downloadLatency: z.number().optional(),
  hasSchemaOrg: z.boolean().optional(),
  schemaOrgid: z.string().optional(),
  dcIdentifier: z.string().optional(),
  citationDoi: z.string().optional(),
  bodyhasPid: z.boolean().optional(),
});

export const DoiPropertiesStatsSchema = z.object({
  viewCount: z.number().optional(),
  viewsOverTime: z.array(MonthlyTotalSchema).optional(),
  downloadCount: z.number().optional(),
  downloadsOverTime: z.array(MonthlyTotalSchema).optional(),
  referenceCount: z.number().optional(),
  citationCount: z.number().optional(),
  citationsOverTime: z.array(YearlyTotalSchema).optional(),
  partCount: z.number().optional(),
  partOfCount: z.number().optional(),
  versionCount: z.number().optional(),
  versionOfCount: z.number().optional(),
  /** Data describing the landing page, used by link checking. */
  landingPage: LandingPageSchema.optional(),
});

// ---------------------------------------------------------------------------
// Attributes (the spec composes these with allOf)
// ---------------------------------------------------------------------------

export const DoiAttributesSchema = z.object({
  ...DoiIdentifierPropertiesSchema.shape,
  ...DoiPropertiesMetadataSchema.shape,
  ...DoiPropertiesXmlSchema.shape,
  ...DoiPropertiesOtherSchema.shape,
  ...DoiPropertiesStatsSchema.shape,
  ...DoiPropertiesDatesSchema.shape,
});

// ---------------------------------------------------------------------------
// Relationships (JSON:API resource linkage)
// ---------------------------------------------------------------------------

export const DataObjectSchema = z.object({
  id: z.string().optional(),
  type: z.string().optional(),
});

export const ToOneRelationshipSchema = z.object({
  data: DataObjectSchema.optional(),
});

export const ToManyRelationshipSchema = z.object({
  data: z.array(DataObjectSchema).optional(),
});

export const DoiRelationshipsSchema = z.object({
  /** The DataCite client (repository) associated with the DOI. */
  client: ToOneRelationshipSchema.optional(),
  /** The DataCite provider (Direct Member or Consortium Organization). */
  provider: ToOneRelationshipSchema.optional(),
  /** Legacy attribute for media support. */
  media: ToOneRelationshipSchema.optional(),
  references: ToManyRelationshipSchema.optional(),
  citations: ToManyRelationshipSchema.optional(),
  parts: ToManyRelationshipSchema.optional(),
  partOf: ToManyRelationshipSchema.optional(),
  versions: ToManyRelationshipSchema.optional(),
  versionOf: ToManyRelationshipSchema.optional(),
});

// ---------------------------------------------------------------------------
// Top level
// ---------------------------------------------------------------------------

export const DoiResourceSchema = z.object({
  /** The DOI name, e.g. "10.5438/0014". */
  id: z.string().optional(),
  type: z.literal("dois"),
  attributes: DoiAttributesSchema.optional(),
  relationships: DoiRelationshipsSchema.optional(),
});

export const DoiDetailItemSchema = z.object({
  data: DoiResourceSchema,
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type DoiDetailItem = z.infer<typeof DoiDetailItemSchema>;
export type DoiResource = z.infer<typeof DoiResourceSchema>;
export type DoiAttributes = z.infer<typeof DoiAttributesSchema>;
export type DoiRelationships = z.infer<typeof DoiRelationshipsSchema>;
export type DoiIdentifierProperties = z.infer<
  typeof DoiIdentifierPropertiesSchema
>;
export type DoiPropertiesMetadata = z.infer<typeof DoiPropertiesMetadataSchema>;
export type DoiPropertiesXml = z.infer<typeof DoiPropertiesXmlSchema>;
export type DoiPropertiesOther = z.infer<typeof DoiPropertiesOtherSchema>;
export type DoiPropertiesStats = z.infer<typeof DoiPropertiesStatsSchema>;
export type DoiPropertiesDates = z.infer<typeof DoiPropertiesDatesSchema>;

export type Identifier = z.infer<typeof IdentifierSchema>;
export type AlternateIdentifier = z.infer<typeof AlternateIdentifierSchema>;
export type NameIdentifier = z.infer<typeof NameIdentifierSchema>;
export type Affiliation = z.infer<typeof AffiliationSchema>;
export type Creator = z.infer<typeof CreatorSchema>;
export type Contributor = z.infer<typeof ContributorSchema>;
export type Title = z.infer<typeof TitleSchema>;
export type Publisher = z.infer<typeof PublisherSchema>;
export type Container = z.infer<typeof ContainerSchema>;
export type Subject = z.infer<typeof SubjectSchema>;
export type DateEntry = z.infer<typeof DateEntrySchema>;
export type Types = z.infer<typeof TypesSchema>;
export type RelatedIdentifier = z.infer<typeof RelatedIdentifierSchema>;
export type RelatedItem = z.infer<typeof RelatedItemSchema>;
export type RelatedItemIdentifier = z.infer<typeof RelatedItemIdentifierSchema>;
export type RelatedItemCreator = z.infer<typeof RelatedItemCreatorSchema>;
export type RelatedItemContributor = z.infer<
  typeof RelatedItemContributorSchema
>;
export type Rights = z.infer<typeof RightsSchema>;
export type Description = z.infer<typeof DescriptionSchema>;
export type GeoLocation = z.infer<typeof GeoLocationSchema>;
export type GeoLocationBox = z.infer<typeof GeoLocationBoxSchema>;
export type GeoLocationPoint = z.infer<typeof GeoLocationPointSchema>;
export type GeoLocationPolygonPoint = z.infer<
  typeof GeoLocationPolygonPointSchema
>;
export type FundingReference = z.infer<typeof FundingReferenceSchema>;
export type LandingPage = z.infer<typeof LandingPageSchema>;
export type MonthlyTotal = z.infer<typeof MonthlyTotalSchema>;
export type YearlyTotal = z.infer<typeof YearlyTotalSchema>;
export type DataObject = z.infer<typeof DataObjectSchema>;
export type ToOneRelationship = z.infer<typeof ToOneRelationshipSchema>;
export type ToManyRelationship = z.infer<typeof ToManyRelationshipSchema>;

export type DoiState = z.infer<typeof DoiStateSchema>;
export type DoiSource = z.infer<typeof DoiSourceSchema>;
export type NameType = z.infer<typeof NameTypeSchema>;
export type TitleType = z.infer<typeof TitleTypeSchema>;
export type DateType = z.infer<typeof DateTypeSchema>;
export type DescriptionType = z.infer<typeof DescriptionTypeSchema>;
export type NumberType = z.infer<typeof NumberTypeSchema>;
export type FunderIdentifierType = z.infer<typeof FunderIdentifierTypeSchema>;
export type ResourceTypeGeneral = z.infer<typeof ResourceTypeGeneralSchema>;
export type ContributorType = z.infer<typeof ContributorTypeSchema>;
export type RelatedIdentifierType = z.infer<typeof RelatedIdentifierTypeSchema>;
export type RelationType = z.infer<typeof RelationTypeSchema>;

/*
 * Notes
 * -----
 * 1. Objects strip unknown keys by default. DataCite adds attributes from time
 *    to time; if you'd rather keep them, use `.passthrough()` (Zod 3) or
 *    `z.looseObject` (Zod 4) on `DoiAttributesSchema`. Conversely, `.strict()`
 *    will make new fields a loud failure, which is useful in tests.
 * 2. The enums are hard failures on unrecognized values. DataCite does extend
 *    its vocabularies (`Award`, `Project` and `Instrument` in resourceTypeGeneral
 *    are recent additions), so for a read path you may want
 *    `ResourceTypeGeneralSchema.or(z.string())` or `.catch("Other")` rather
 *    than rejecting the whole record.
 * 3. `z.union([PublisherSchema, z.string()])` tries the object first. Because
 *    every field on `PublisherSchema` is optional, a non-string value like `{}`
 *    would pass — fine in practice, since the API returns one or the other.
 * 4. Date fields are typed as plain strings, matching the spec. If you want
 *    real `Date` objects, `z.string().transform((s) => new Date(s))` on
 *    `created`/`registered`/`updated` is the usual move, but note that it makes
 *    the schema no longer round-trip for serialization.
 * 5. For OpenAPIHono you'd wrap these with `.openapi()` from `@hono/zod-openapi`
 *    rather than importing `z` from `zod` directly.
 */
