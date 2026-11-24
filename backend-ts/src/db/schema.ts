import {
  type ImportDiagnostic,
  type ImportedFileMedia,
  type ImportedUrlMedia,
  type MystFrontmatter,
} from "@raven/core-import-format";
import { sql } from "drizzle-orm";
import {
  type AnyMySqlColumn,
  bigint,
  boolean,
  char,
  customType,
  datetime,
  foreignKey,
  index,
  int,
  json,
  mediumtext,
  mysqlEnum,
  mysqlTable,
  type MySqlUpdateSetSource,
  primaryKey,
  text,
  tinyint,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { ulid } from "ulid";
import { z } from "zod";
// drizzle-kit loads this file without the @raven/backend-source condition, so
// `#src/` would resolve to dist/, which CI doesn't build before
// db:check-migrations.
// eslint-disable-next-line no-restricted-imports
import { ResourceTypeGeneralSchema } from "../types/datacite.js";

export const LICENSES = [
  "CC BY",
  "CC BY-SA",
  "CC BY-ND",
  "CC BY-NC",
  "CC BY-NC-SA",
  "CC BY-NC-ND",
  "CC0",
] as const;
export const PUBLICATION_STATES = ["DRAFT", "PUBLISHED", "DELETED"] as const;
export type PublicationState = (typeof PUBLICATION_STATES)[number];
export const COMMENT_STATES = [
  "PUBLISHED",
  "MODERATED",
  "DELETED",
  "WITHDRAWN",
] as const;
export type CommentState = (typeof COMMENT_STATES)[number];

export const USER_STATES = [
  "ACTIVE",
  "SITE_ADMIN",
  "MODERATED",
  "DELETED",
] as const;
export type UserState = (typeof USER_STATES)[number];

export const MEDIA_ASSET_TYPES = ["audio", "file", "image", "video"] as const;
export type MediaAssetType = (typeof MEDIA_ASSET_TYPES)[number];

export const MEDIA_IMPORT_ITEM_STATUSES = [
  "pending",
  "active",
  "completed",
  "failed",
] as const;
export type MediaImportItemStatus = (typeof MEDIA_IMPORT_ITEM_STATUSES)[number];

/** Why a media import item failed. `lib/media/media-import-errors.ts` maps them to messages. */
export const MEDIA_IMPORT_ERROR_CODES = [
  "unavailable",
  "unsupported",
  "unreadable",
  "retries-exhausted",
  "failed",
  "media-type-mismatch",
  "too-large",
] as const;
export type MediaImportErrorCode = (typeof MEDIA_IMPORT_ERROR_CODES)[number];

/** The version fields an import writes, which the editor may change after. */
export const IMPORTED_VERSION_FIELDS = [
  "title",
  "subtitle",
  "abstract",
  "body",
] as const;
export type ImportedVersionField = (typeof IMPORTED_VERSION_FIELDS)[number];

/** A BibTeX file of a MyST version's bibliography, as it was sent. */
export const BibliographyFileSchema = z.object({
  filename: z.string().min(1),
  content: z.string(),
});
/**
 * The BibTeX files a MyST version cites entries of, stored as sent rather than
 * parsed: parser output is lossy, and the files are served back verbatim. The
 * entries are derived where they're needed (the AST, v1 responses).
 */
export const VersionBibliographySchema = z.object({
  files: z.array(BibliographyFileSchema),
});
export type BibliographyFile = z.infer<typeof BibliographyFileSchema>;
export type VersionBibliography = z.infer<typeof VersionBibliographySchema>;

export const DoiMetadataTypesSchema = z.object({
  resourceTypeGeneral: ResourceTypeGeneralSchema,
  resourceType: z.string().optional(),
});
export const DoiMetadataSubjectSchema = z.object({
  subject: z.string().min(1),
  subjectScheme: z.string().min(1).optional(),
});
/** The DataCite `language`, `types` and `subjects` sent for a publication's DOIs. */
export const DoiMetadataDataCiteSchema = z.object({
  type: z.literal("datacite"),
  content: z.object({
    language: z.string().regex(/^[a-z]{2}$/),
    types: DoiMetadataTypesSchema,
    subjects: z.array(DoiMetadataSubjectSchema).min(1),
  }),
});
export const DoiMetadataSchema = z.discriminatedUnion("type", [
  DoiMetadataDataCiteSchema,
]);
export type DoiMetadataTypes = z.infer<typeof DoiMetadataTypesSchema>;
export type DoiMetadataSubject = z.infer<typeof DoiMetadataSubjectSchema>;
export type DoiMetadataDataCite = z.infer<typeof DoiMetadataDataCiteSchema>;
export type DoiMetadata = z.infer<typeof DoiMetadataSchema>;

export const DEFAULT_DOI_METADATA: DoiMetadata = {
  type: "datacite",
  content: {
    language: "en",
    types: { resourceTypeGeneral: "Other", resourceType: "Article" },
    subjects: [
      {
        subject: "FOS: Biological sciences",
        subjectScheme: "Fields of Science and Technology (FOS)",
      },
    ],
  },
};

const mysqlSet = <T extends string>(name: string, values: readonly T[]) =>
  customType<{ data: T[]; driverData: string }>({
    dataType() {
      return `set(${values.map((v) => `'${v}'`).join(", ")})`;
    },
    fromDriver(value: string): T[] {
      return value ? (value.split(",") as T[]) : [];
    },
    toDriver(value: T[]): string {
      return value.join(",");
    },
  })(name);

const customMediumBlob = customType<{ data: Buffer }>({
  dataType() {
    return "mediumblob";
  },
  fromDriver(value: unknown) {
    if (value instanceof Buffer) return value;
    if (typeof value === "string") return Buffer.from(value);
    return value as Buffer;
  },
});

/**
 * Users table is a special table for better auth.
 * But Raven has some of its own required values.
 *
 * We expect users to be hard deleted in only the rarest of circumstances.
 * Therefore the default for FK relationships to users is "restrict" on delete
 * (not cascade). This is to force handling related data before deleting a user.
 */

export const users = mysqlTable(
  "users",
  {
    // Generated by better auth
    id: varchar("id", { length: 26 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    createdAt: datetime("created_at", { fsp: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .notNull(),
    updatedAt: datetime("updated_at", { fsp: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdate(() => /* @__PURE__ */ sql`NOW(3)`)
      .notNull(),
    username: varchar("username", { length: 255 }).notNull().unique(),
    displayUsername: text("display_username"),
    firstName: varchar("first_name", { length: 255 }).notNull(),
    lastName: varchar("last_name", { length: 255 }).notNull(),
    profile: text("profile"),

    // Remaining Raven columns
    idInt: int("id_int").autoincrement().notNull().primaryKey(),
    password: varchar("password", { length: 255 }),
    orcid: varchar("orcid", { length: 255 }),
    approved: boolean("approved").default(false),
    state: mysqlEnum("state", USER_STATES).notNull().default("ACTIVE"),
    loginAt: datetime("login_at", { fsp: 3, mode: "string" }),
  },
  (table) => [
    index("orcid_idx").on(table.orcid),
    index("first_last_name_idx").on(table.firstName, table.lastName),
    index("last_name_idx").on(table.lastName),
    index("state_username_idx").on(table.state, table.username),
  ]
);
export type User = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
export type UserUpdate = MySqlUpdateSetSource<typeof users>;

//////////////////////////////////////////////////
// Special Better Auth required + generated tables
//////////////////////////////////////////////////

export const sessions = mysqlTable(
  "sessions",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    expiresAt: datetime("expires_at", { fsp: 3 }).notNull(),
    token: varchar("token", { length: 255 }).notNull().unique(),
    createdAt: datetime("created_at", { fsp: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .notNull(),
    updatedAt: datetime("updated_at", { fsp: 3 })
      .$onUpdate(() => /* @__PURE__ */ sql`NOW(3)`)
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: varchar("user_id", { length: 26 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)]
);
export type Session = typeof sessions.$inferSelect;
export type SessionInsert = typeof sessions.$inferInsert;
export type SessionUpdate = MySqlUpdateSetSource<typeof sessions>;

export const accounts = mysqlTable(
  "accounts",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: varchar("user_id", { length: 26 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: datetime("access_token_expires_at", { fsp: 3 }),
    refreshTokenExpiresAt: datetime("refresh_token_expires_at", { fsp: 3 }),
    scope: text("scope"),
    password: text("password"),
    createdAt: datetime("created_at", { fsp: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .notNull(),
    updatedAt: datetime("updated_at", { fsp: 3 })
      .$onUpdate(() => /* @__PURE__ */ sql`NOW(3)`)
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)]
);
export type Account = typeof accounts.$inferSelect;
export type AccountInsert = typeof accounts.$inferInsert;
export type AccountUpdate = MySqlUpdateSetSource<typeof accounts>;

export const verifications = mysqlTable(
  "verifications",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    identifier: varchar("identifier", { length: 255 }).notNull(),
    value: text("value").notNull(),
    expiresAt: datetime("expires_at", { fsp: 3 }).notNull(),
    createdAt: datetime("created_at", { fsp: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .notNull(),
    updatedAt: datetime("updated_at", { fsp: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdate(() => /* @__PURE__ */ sql`NOW(3)`)
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);
export type Verification = typeof verifications.$inferSelect;
export type VerificationInsert = typeof verifications.$inferInsert;
export type VerificationUpdate = MySqlUpdateSetSource<typeof verifications>;

export const deviceCodes = mysqlTable(
  "device_codes",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    deviceCode: varchar("device_code", { length: 255 }).notNull().unique(),
    userCode: varchar("user_code", { length: 255 }).notNull(),
    userId: text("user_id"),
    expiresAt: datetime("expires_at", { fsp: 3 }).notNull(),
    status: text("status").notNull(),
    lastPolledAt: datetime("last_polled_at", { fsp: 3 }),
    pollingInterval: int("polling_interval"),
    clientId: text("client_id"),
    scope: text("scope"),
  },
  (table) => [index("device_codes_user_code_idx").on(table.userCode)]
);
export type DeviceCode = typeof deviceCodes.$inferSelect;
export type DeviceCodeInsert = typeof deviceCodes.$inferInsert;
export type DeviceCodeUpdate = MySqlUpdateSetSource<typeof deviceCodes>;

/** Written by the `sessionElevation` plugin (`src/lib/session-elevation.ts`). */
export const sessionElevations = mysqlTable("session_elevations", {
  id: varchar("id", { length: 26 }).primaryKey(),
  sessionId: varchar("session_id", { length: 26 })
    .notNull()
    .unique()
    .references(() => sessions.id, { onDelete: "cascade" }),
  expiresAt: datetime("expires_at", { fsp: 3 }).notNull(),
  createdAt: datetime("created_at", { fsp: 3 })
    .default(sql`CURRENT_TIMESTAMP(3)`)
    .notNull(),
});
export type SessionElevation = typeof sessionElevations.$inferSelect;

////////////////////////
// Raven specific tables
////////////////////////

/**
 * Publications table schema
 * We expect publications to be hard deleted in only the rarest of circumstances. Therefore the default for FK relationships to publications is "restrict" on delete (not cascade).
 * This is to force handling related data before deleting a publication.
 */
export const publications = mysqlTable(
  "publications",
  {
    idInt: int("id_int").autoincrement().primaryKey(),
    id: varchar("id", { length: 26 }).notNull().unique(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    latestVersionNumber: tinyint("latest_version_number", { unsigned: true })
      .notNull()
      .default(1),
    state: mysqlEnum("state", ["DRAFT", "PUBLISHED", "DELETED"])
      .notNull()
      .default("DRAFT"),
    ownerIdInt: int("owner_id_int").references(() => users.idInt, {
      onDelete: "restrict",
    }),
    ownerId: varchar("owner_id", { length: 26 }).references(() => users.id, {
      onDelete: "restrict",
    }),
    doi: varchar("doi", { length: 255 }).unique(),
    metadata: json("metadata"),
    doiMetadata: json("doi_metadata")
      .$type<DoiMetadata>()
      .notNull()
      .default(DEFAULT_DOI_METADATA),
    createdAt: datetime("created_at", { fsp: 3, mode: "string" })
      .default(sql`(NOW(3))`)
      .notNull(),
    updatedAt: datetime("updated_at", { fsp: 3, mode: "string" })
      .default(sql`(NOW(3))`)
      .$onUpdate(() => /* @__PURE__ */ sql`NOW(3)`)
      .notNull(),
    deletedAt: datetime("deleted_at", { fsp: 3, mode: "string" }),
    license: mysqlEnum("license", LICENSES).notNull().default("CC BY"),
    feedbackFormEmbedSrc: text("feedback_form_embed_src"),
    socialPostsEmbedSrc: text("social_posts_embed_src"),
  },
  (table) => [index("owner_id_int").on(table.ownerIdInt)]
);
export type Publication = typeof publications.$inferSelect;
export type PublicationInsert = typeof publications.$inferInsert;
export type PublicationUpdate = MySqlUpdateSetSource<typeof publications>;

export const versions = mysqlTable(
  "versions",
  {
    idInt: int("id_int").autoincrement().primaryKey(),
    id: varchar("id", { length: 26 }).notNull().unique(),
    publicationIdInt: int("publication_id_int")
      .notNull()
      .references(() => publications.idInt, { onDelete: "restrict" }),
    publicationId: varchar("publication_id", {
      length: 26,
    })
      .notNull()
      .references(() => publications.id, { onDelete: "restrict" }),
    versionNumber: tinyint("version_number", { unsigned: true })
      .notNull()
      .default(1),
    title: varchar("title", { length: 255 }),
    subtitle: varchar("subtitle", { length: 300 }),
    abstract: text("abstract"),
    body: mediumtext("body"),
    /**
     * The version's BibTeX files, for MyST versions that cite entries of their
     * own bibliography. Part of the version's content, like `body`, so it is
     * immutable once the version is published.
     */
    bibliography: json("bibliography").$type<VersionBibliography>(),
    /**
     * A MyST version's `numbering` and `math` frontmatter, which the body
     * renders with but no column holds. Part of the version's content, like
     * `body`. MySQL normalises a JSON column's key order, so hash it with
     * `frontmatterHashInput`.
     */
    frontmatter: json("frontmatter").$type<MystFrontmatter>(),
    versionDesc: text("version_desc"),
    state: mysqlEnum("state", PUBLICATION_STATES).notNull().default("DRAFT"),
    pdfState: mysqlEnum("pdf_state", ["PROCESSING", "GENERATED", "FAILED"]),
    pdfUrl: text("pdf_url"),
    importDocumentFilename: text("import_document_filename"),
    importDocumentUrl: text("import_document_url"),
    /**
     * This is the file format in its simplest form, not mime type. That lets us
     * use both `commonmark` and `mystmd` as original formats, rather than just
     * `text/markdown`. So google docs will be `gdoc` but another generic
     * website would be `html`.
     * The docs call `gdoc` the "Google Docs format" and `mystmd` MyST. A
     * version's `content.format` is `myst` for MyST Markdown (`contentFormat`).
     */
    importDocumentFormat: varchar("import_document_format", {
      length: 255,
    }),
    importDocumentBody: mediumtext("import_document_body"),
    importDocumentSyncDate: datetime("import_document_sync_date", { fsp: 3 }),
    currentImportId: varchar("current_import_id", { length: 26 }).references(
      (): AnyMySqlColumn => versionImports.id,
      { onDelete: "set null" }
    ),
    /**
     * Imported fields a draft edit has changed since the current import.
     * Every import resets it to empty (`createVersionImport`).
     */
    editedFields: json("edited_fields")
      .$type<ImportedVersionField[]>()
      .notNull()
      .default([]),
    createdAt: datetime("created_at", { fsp: 3, mode: "string" })
      .default(sql`(NOW(3))`)
      .notNull(),
    updatedAt: datetime("updated_at", { fsp: 3, mode: "string" })
      .default(sql`(NOW(3))`)
      .$onUpdate(() => /* @__PURE__ */ sql`NOW(3)`)
      .notNull(),
    doi: varchar("doi", { length: 255 }).unique(),
  },
  (table) => [
    /**
     * NOTE: This is a fulltext index, which is not supported by Drizzle's index
     * builder, so we needed to create our own migration for it in
     * backend-ts/drizzle/migrations/0004_fulltext-index.sql
     *
     * We also needed to make the 0004_snapshot.json appear as if it was just a
     * regular index, so that Drizzle would not try to drop it and re-create it
     * as a non-fulltext index.
     *
     * So for future reference, create a normal index here, run
     * `drizzle-kit generate` and then modify the generated migration sql file
     * to use `CREATE FULLTEXT INDEX` instead of `CREATE INDEX`.
     */
    index("ft_search").on(table.title, table.abstract, table.body),
    uniqueIndex("idx_publication_version").on(
      table.publicationIdInt,
      table.versionNumber
    ),
  ]
);
export type Version = typeof versions.$inferSelect;
export type VersionInsert = typeof versions.$inferInsert;
export type VersionUpdate = MySqlUpdateSetSource<typeof versions>;

export const contributorsLegacy = mysqlTable(
  "contributors_legacy",
  {
    publicationIdInt: int("publication_id_int")
      .notNull()
      .references(() => publications.idInt, { onDelete: "cascade" }), // contributors should **not** prevent a pub from getting deleted
    publicationId: varchar("publication_id", {
      length: 26,
    })
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }), // contributors should **not** prevent a pub from getting deleted
    userIdInt: int("user_id_int")
      .notNull()
      .references(() => users.idInt, { onDelete: "restrict" }),
    userId: varchar("user_id", { length: 26 })
      .notNull()
      .references(() => users.id, {
        onDelete: "restrict",
      }),
    role: varchar("role", { length: 255 }).notNull(),
    inByline: boolean("in_byline").default(false),
    priority: int("priority"),
  },
  (table) => [
    index("idx_publication_id_int").on(table.publicationIdInt),
    index("idx_user_id_int").on(table.userIdInt),
    unique("pub_user_role_int").on(
      table.publicationIdInt,
      table.userIdInt,
      table.role
    ),
  ]
);
export type ContributorLegacy = typeof contributorsLegacy.$inferSelect;
export type ContributorLegacyInsert = typeof contributorsLegacy.$inferInsert;
export type ContributorLegacyUpdate = MySqlUpdateSetSource<
  typeof contributorsLegacy
>;

/**
 * Contributors belong to a version, not a publication: a new draft starts as
 * a copy of the one it supersedes, and editing its contributors leaves the
 * published version's byline alone.
 *
 * The legacy table stored one row per (publication, user, role); this one
 * stores a user's roles on a version as an array, so a contributor is one row.
 */
export const contributors = mysqlTable(
  "contributors",
  {
    versionIdInt: int("version_id_int")
      .notNull()
      .references(() => versions.idInt, { onDelete: "cascade" }), // contributors should **not** prevent a pub from getting deleted
    versionId: varchar("version_id", { length: 26 })
      .notNull()
      .references(() => versions.id, { onDelete: "cascade" }),
    userIdInt: int("user_id_int")
      .notNull()
      .references(() => users.idInt, { onDelete: "restrict" }),
    userId: varchar("user_id", { length: 26 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    roles: json("roles").$type<string[]>().notNull(),
    inByline: boolean("in_byline").default(false),
    priority: int("priority"),
  },
  (table) => [
    index("idx_contributors_version_id_int").on(table.versionIdInt),
    index("idx_contributors_user_id_int").on(table.userIdInt),
    index("idx_contributors_user_id").on(table.userId),
    unique("uq_version_user_int").on(table.versionIdInt, table.userIdInt),
    unique("uq_version_user").on(table.versionId, table.userId),
  ]
);
export type Contributor = typeof contributors.$inferSelect;
export type ContributorInsert = typeof contributors.$inferInsert;
export type ContributorUpdate = MySqlUpdateSetSource<typeof contributors>;

export const contributorAffiliations = mysqlTable(
  "contributor_affiliations",
  {
    idInt: int("id_int").autoincrement().primaryKey(),
    id: varchar("id", { length: 26 }).notNull().unique(),
    versionIdInt: int("version_id_int")
      .notNull()
      .references(() => versions.idInt, { onDelete: "cascade" }), // an affiliation should not prevent a pub from getting deleted
    versionId: varchar("version_id", { length: 26 })
      .notNull()
      .references(() => versions.id, { onDelete: "cascade" }), // an affiliation should not prevent a pub from getting deleted
    userIdInt: int("user_id_int")
      .notNull()
      .references(() => users.idInt, { onDelete: "restrict" }),
    userId: varchar("user_id", { length: 26 })
      .notNull()
      .references(() => users.id, {
        onDelete: "restrict",
      }),
    affiliatedOrgIdInt: int("affiliated_org_id_int").notNull(),
    affiliatedOrgId: varchar("affiliated_org_id", {
      length: 26,
    }).notNull(),
  },
  (table) => [
    index("user_id_int").on(table.userIdInt),
    index("affiliated_org_id_int").on(table.affiliatedOrgIdInt),
    unique("idx_version_user_org").on(
      table.versionIdInt,
      table.userIdInt,
      table.affiliatedOrgIdInt
    ),
    // Generated name is too long for MySQL, use shortened version here
    foreignKey({
      name: "ca_affiliated_org_id_int_organizations_id_int_fk",
      columns: [table.affiliatedOrgIdInt],
      foreignColumns: [organizations.idInt],
    }).onDelete("restrict"),
    foreignKey({
      name: "ca_affiliated_org_id_organizations_id_fk",
      columns: [table.affiliatedOrgId],
      foreignColumns: [organizations.id],
    }).onDelete("restrict"),
  ]
);
export type ContributorAffiliation =
  typeof contributorAffiliations.$inferSelect;
export type ContributorAffiliationInsert =
  typeof contributorAffiliations.$inferInsert;
export type ContributorAffiliationUpdate = MySqlUpdateSetSource<
  typeof contributorAffiliations
>;

/**
 * Organizations table schema
 * We expect organizations to be hard deleted in only the rarest of circumstances. Therefore the default for FK relationships to organizations is "restrict" on delete (not cascade).
 * This is to force handling related data before deleting an organization.
 */
export const organizations = mysqlTable(
  "organizations",
  {
    idInt: int("id_int").autoincrement().primaryKey(),
    id: varchar("id", { length: 26 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    avatar: varchar("avatar", { length: 255 }),
    profile: text("profile"),
    rorId: varchar("ror_id", { length: 255 }),
    doiMintingEnabled: boolean("doi_minting_enabled").default(false),
    doiPrefix: varchar("doi_prefix", { length: 50 }),
    unlisted: boolean("unlisted").default(false),
    approved: boolean("approved").default(false),
    state: mysqlEnum("state", ["ACTIVE", "MODERATED", "DELETED"])
      .notNull()
      .default("ACTIVE"),
    createdAt: datetime("created_at", { fsp: 3, mode: "string" }).default(
      sql`(NOW(3))`
    ),
    updatedAt: datetime("updated_at", { fsp: 3, mode: "string" }).$onUpdate(
      () => /* @__PURE__ */ sql`NOW(3)`
    ),
  },
  (table) => [unique("idx_slug").on(table.slug)]
);
export type Organization = typeof organizations.$inferSelect;
export type OrganizationInsert = typeof organizations.$inferInsert;
export type OrganizationUpdate = MySqlUpdateSetSource<typeof organizations>;

export const orgUserMap = mysqlTable(
  "org_user_map",
  {
    orgIdInt: int("org_id_int")
      .notNull()
      .references(() => organizations.idInt, { onDelete: "restrict" }),
    orgId: varchar("org_id", { length: 26 })
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    userIdInt: int("user_id_int")
      .notNull()
      .references(() => users.idInt, { onDelete: "restrict" }),
    userId: varchar("user_id", { length: 26 })
      .notNull()
      .references(() => users.id, {
        onDelete: "restrict",
      }),
    roles: mysqlSet("roles", ["ADMIN"] as const),
    startAt: datetime("start_at", { fsp: 3, mode: "string" }),
    endAt: datetime("end_at", { fsp: 3, mode: "string" }),
  },
  (table) => [
    uniqueIndex("idx_org_user").on(table.orgIdInt, table.userIdInt),
    index("idx_user_id_int").on(table.userIdInt),
  ]
);
export type OrgUserConnection = typeof orgUserMap.$inferSelect;
export type OrgUserConnectionInsert = typeof orgUserMap.$inferInsert;
export type OrgUserConnectionUpdate = MySqlUpdateSetSource<typeof orgUserMap>;

export const orgPublicationMap = mysqlTable(
  "org_publication_map",
  {
    orgIdInt: int("org_id_int")
      .notNull()
      .references(() => organizations.idInt, { onDelete: "restrict" }),
    orgId: varchar("org_id", { length: 26 })
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    publicationIdInt: int("publication_id_int")
      .notNull()
      .references(() => publications.idInt, { onDelete: "cascade" }), // an org association should not prevent a pub from getting deleted
    publicationId: varchar("publication_id", {
      length: 26,
    })
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }), // an org association should not prevent a pub from getting deleted
    priority: int("priority"),
  },
  (table) => [
    uniqueIndex("idx_org_publication").on(
      table.orgIdInt,
      table.publicationIdInt
    ),
    index("idx_publication_id_int").on(table.publicationIdInt),
  ]
);
export type OrgPublicationConnection = typeof orgPublicationMap.$inferSelect;
export type OrgPublicationConnectionInsert =
  typeof orgPublicationMap.$inferInsert;
export type OrgPublicationConnectionUpdate = MySqlUpdateSetSource<
  typeof orgPublicationMap
>;

export const comments = mysqlTable(
  "comments",
  {
    idInt: int("id_int").autoincrement().primaryKey(),
    id: varchar("id", { length: 26 }).notNull().unique(),
    publicationIdInt: int("publication_id_int")
      .notNull()
      .references(() => publications.idInt, { onDelete: "restrict" }),
    publicationId: varchar("publication_id", {
      length: 26,
    })
      .notNull()
      .references(() => publications.id, { onDelete: "restrict" }),
    versionIdInt: int("version_id_int").references(() => versions.idInt, {
      onDelete: "restrict",
    }),
    versionId: varchar("version_id", { length: 26 }).references(
      () => versions.id,
      { onDelete: "restrict" }
    ),
    userIdInt: int("user_id_int")
      .notNull()
      .references(() => users.idInt, { onDelete: "restrict" }),
    userId: varchar("user_id", { length: 26 })
      .notNull()
      .references(() => users.id, {
        onDelete: "restrict",
      }),
    parentIdInt: int("parent_id_int"),
    parentId: varchar("parent_id", { length: 26 }),
    body: text("body").notNull(),
    anchorText: varchar("anchor_text", { length: 1024 }),
    preText: varchar("pre_text", { length: 128 }),
    postText: varchar("post_text", { length: 128 }),
    approved: boolean("approved").default(false),
    state: mysqlEnum("state", COMMENT_STATES).notNull().default("PUBLISHED"),
    createdAt: datetime("created_at", { fsp: 3, mode: "string" }).default(
      sql`(NOW(3))`
    ),
    updatedAt: datetime("updated_at", { fsp: 3, mode: "string" }).$onUpdate(
      () => /* @__PURE__ */ sql`NOW(3)`
    ),
  },
  (table) => [
    index("idx_publication_state").on(table.publicationIdInt, table.state),
    foreignKey({
      columns: [table.parentIdInt],
      foreignColumns: [table.idInt],
      name: "fk_comments_parent_int",
    }).onDelete("set null"), // if a parent comment is deleted, the child becomes a top-level comment
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: "fk_comments_parent",
    }).onDelete("set null"), // if a parent comment is deleted, the child becomes a top-level comment
  ]
);
export type Comment = typeof comments.$inferSelect;
export type CommentInsert = typeof comments.$inferInsert;
export type CommentUpdate = MySqlUpdateSetSource<typeof comments>;

export const publicationTags = mysqlTable("publication_tags", {
  publicationIdInt: int("publication_id_int")
    .notNull()
    .references(() => publications.idInt, { onDelete: "cascade" }), // tags are not critical information
  publicationId: varchar("publication_id", {
    length: 26,
  })
    .notNull()
    .references(() => publications.id, { onDelete: "cascade" }), // tags are not critical information
  tag: varchar("tag", { length: 255 }).notNull(),
});
export type PublicationTag = typeof publicationTags.$inferSelect;
export type PublicationTagInsert = typeof publicationTags.$inferInsert;
export type PublicationTagUpdate = MySqlUpdateSetSource<typeof publicationTags>;

export const references = mysqlTable("references", {
  idInt: int("id_int").autoincrement().primaryKey(),
  id: varchar("id", { length: 26 }).notNull().unique(),
  // Actual column collation is utf8mb4_bin (case-sensitive), set by migration
  // 0012_make_reference_url_case_sensitive.sql. drizzle-orm's varchar() has no
  // collate option, so this can't be reflected here — don't let a future
  // generated migration touching this column drop it back to the table default.
  url: varchar("url", { length: 512 }).notNull().unique(),
  text: text("text"),
  updatedAt: datetime("updated_at", { fsp: 3, mode: "string" }).$onUpdate(
    () => /* @__PURE__ */ sql`NOW(3)`
  ),
});
export type Reference = typeof references.$inferSelect;
export type ReferenceInsert = typeof references.$inferInsert;
export type ReferenceUpdate = MySqlUpdateSetSource<typeof references>;

export const versionReferences = mysqlTable(
  "version_references",
  {
    idInt: int("id_int").autoincrement().primaryKey(),
    id: varchar("id", { length: 26 }).notNull().unique(),
    versionIdInt: int("version_id_int")
      .notNull()
      .references(() => versions.idInt, { onDelete: "cascade" }), // references should **not** prevent a version from being deleted
    versionId: varchar("version_id", { length: 26 })
      .notNull()
      .references(() => versions.id, { onDelete: "cascade" }), // references should **not** prevent a version from being deleted
    referenceIdInt: int("reference_id_int")
      .notNull()
      .references(() => references.idInt, { onDelete: "cascade" }), // version references should not prevent a reference from being deleted
    referenceId: varchar("reference_id", { length: 26 })
      .notNull()
      .references(() => references.id, { onDelete: "cascade" }), // version references should **not** prevent a reference from being deleted
  },
  (table) => [
    index("reference_id_int").on(table.referenceIdInt),
    unique("version_id_int").on(table.versionIdInt, table.referenceIdInt),
  ]
);
export type VersionReference = typeof versionReferences.$inferSelect;
export type VersionReferenceInsert = typeof versionReferences.$inferInsert;
export type VersionReferenceUpdate = MySqlUpdateSetSource<
  typeof versionReferences
>;

export const linkedAssets = mysqlTable(
  "linked_assets",
  {
    versionIdInt: int("version_id_int")
      .notNull()
      .references(() => versions.idInt, { onDelete: "cascade" }), // linked assets should **not** prevent a version from being deleted
    versionId: varchar("version_id", { length: 26 })
      .notNull()
      .references(() => versions.id, { onDelete: "cascade" }), // linked assets should **not** prevent a version from being deleted
    type: varchar("type", { length: 255 }).notNull(),
    url: varchar("url", { length: 512 }).notNull(),
    name: varchar("name", { length: 255 }),
  },
  (table) => [
    unique("version_id_int").on(table.versionIdInt, table.type, table.url),
  ]
);
export type LinkedAsset = typeof linkedAssets.$inferSelect;
export type LinkedAssetInsert = typeof linkedAssets.$inferInsert;
export type LinkedAssetUpdate = MySqlUpdateSetSource<typeof linkedAssets>;

export const notifications = mysqlTable("notifications", {
  idInt: int("id_int").autoincrement().primaryKey(),
  id: varchar("id", { length: 26 }).notNull().unique(),
  userIdInt: int("user_id_int")
    .notNull()
    .references(() => users.idInt, { onDelete: "cascade" }), // notifications are not critical data
  userId: varchar("user_id", { length: 26 })
    .notNull()
    .references(() => users.id, {
      onDelete: "cascade",
    }), // notifications are not critical data
  publicationIdInt: int("publication_id_int").references(
    () => publications.idInt,
    {
      onDelete: "cascade",
    }
  ), // notifications are not critical data
  publicationId: varchar("publication_id", {
    length: 26,
  }).references(() => publications.id, { onDelete: "cascade" }), // notifications are not critical data
  commentIdInt: int("comment_id_int").references(() => comments.idInt, {
    onDelete: "cascade",
  }), // notifications are not critical data
  commentId: varchar("comment_id", { length: 26 }).references(
    () => comments.id,
    { onDelete: "cascade" }
  ), // notifications are not critical data
  message: text("message"),
  state: mysqlEnum("state", [
    "NEW_PUBLICATION",
    "UPDATED_PUBLICATION",
    "COMMENT",
    "REPLY",
    "MESSAGE",
  ])
    .notNull()
    .default("NEW_PUBLICATION"),
  seen: tinyint("seen").default(0),
  createdAt: datetime("created_at", { fsp: 3, mode: "string" }).default(
    sql`(NOW(3))`
  ),
  updatedAt: datetime("updated_at", { fsp: 3, mode: "string" })
    .default(sql`(NOW(3))`)
    .$onUpdate(() => /* @__PURE__ */ sql`NOW(3)`),
  deletedAt: datetime("deleted_at"),
});
export type Notification = typeof notifications.$inferSelect;
export type NotificationInsert = typeof notifications.$inferInsert;
export type NotificationUpdate = MySqlUpdateSetSource<typeof notifications>;

export const notificationTypes = mysqlTable("notification_types", {
  idInt: int("id_int").autoincrement().primaryKey(),
  id: varchar("id", { length: 26 }).notNull().unique(),
  type: varchar("type", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  state: mysqlEnum("state", ["ACTIVE", "DEPRECATED"])
    .notNull()
    .default("ACTIVE"),
  trigger: mysqlEnum("trigger", ["NEW_COMMENT"]),
  priority: int("priority"),
  createdAt: datetime("created_at", { fsp: 3, mode: "string" }).default(
    sql`(NOW(3))`
  ),
  updatedAt: datetime("updated_at", { fsp: 3, mode: "string" })
    .default(sql`(NOW(3))`)
    .$onUpdate(() => /* @__PURE__ */ sql`NOW(3)`),
});
export type NotificationType = typeof notificationTypes.$inferSelect;
export type NotificationTypeInsert = typeof notificationTypes.$inferInsert;
export type NotificationTypeUpdate = MySqlUpdateSetSource<
  typeof notificationTypes
>;

export const userNotificationSettings = mysqlTable(
  "user_notification_settings",
  {
    idInt: int("id_int").autoincrement().primaryKey(),
    id: varchar("id", { length: 26 }).notNull().unique(),
    userIdInt: int("user_id_int")
      .notNull()
      .references(() => users.idInt, { onDelete: "cascade" }), // notifications are not critical data
    userId: varchar("user_id", { length: 26 })
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
      }), // notifications are not critical data
    notificationTypeIdInt: int("notification_type_id_int").notNull(),
    notificationTypeId: varchar("notification_type_id", {
      length: 26,
    }).notNull(),
    deliveryMethod: mysqlEnum("delivery_method", ["EMAIL", "IN_APP"]).notNull(),
    isSubscribed: boolean("is_subscribed").notNull().default(true),
    createdAt: datetime("created_at", { fsp: 3, mode: "string" }).default(
      sql`(NOW(3))`
    ),
    updatedAt: datetime("updated_at", { fsp: 3, mode: "string" })
      .default(sql`(NOW(3))`)
      .$onUpdate(() => /* @__PURE__ */ sql`NOW(3)`),
  },
  (table) => [
    index("notification_type_id_int").on(table.notificationTypeIdInt),
    uniqueIndex("idx_user_type_method").on(
      table.userIdInt,
      table.notificationTypeIdInt,
      table.deliveryMethod
    ),
    foreignKey({
      name: "uns_nti_notification_types_id_int_fk",
      columns: [table.notificationTypeIdInt],
      foreignColumns: [notificationTypes.idInt],
    }).onDelete("cascade"), // Notifications are not critical data
    // Generated name is too long for MySQL, use shortened version here
    foreignKey({
      name: "uns_nti_notification_types_id_fk",
      columns: [table.notificationTypeId],
      foreignColumns: [notificationTypes.id],
    }).onDelete("cascade"), // Notifications are not critical data
  ]
);
export type UserNotificationSetting =
  typeof userNotificationSettings.$inferSelect;
export type UserNotificationSettingInsert =
  typeof userNotificationSettings.$inferInsert;
export type UserNotificationSettingUpdate = MySqlUpdateSetSource<
  typeof userNotificationSettings
>;

export const tempLinks = mysqlTable("temp_links", {
  idInt: int("id_int").autoincrement().primaryKey(),
  id: varchar("id", { length: 26 }).notNull().unique(),
  userIdInt: int("user_id_int")
    .notNull()
    .references(() => users.idInt, { onDelete: "cascade" }), // temp links are not critical data
  userId: varchar("user_id", { length: 26 })
    .notNull()
    .references(() => users.id, {
      onDelete: "cascade",
    }), // temp links are not critical data
  code: varchar("code", { length: 255 }).notNull(),
  createdAt: datetime("created_at", { fsp: 3, mode: "string" }).default(
    sql`(NOW(3))`
  ),
});
export type TempLink = typeof tempLinks.$inferSelect;
export type TempLinkInsert = typeof tempLinks.$inferInsert;
export type TempLinkUpdate = MySqlUpdateSetSource<typeof tempLinks>;

export const followers = mysqlTable("followers", {
  idInt: int("id_int").autoincrement().primaryKey(),
  id: varchar("id", { length: 26 }).notNull().unique(),
  leaderIdInt: int("leader_id_int")
    .notNull()
    .references(() => users.idInt, { onDelete: "cascade" }), // followers are not critical data
  leaderId: varchar("leader_id", { length: 26 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }), // followers are not critical data
  followerIdInt: int("follower_id_int")
    .notNull()
    .references(() => users.idInt, { onDelete: "cascade" }), // followers are not critical data
  followerId: varchar("follower_id", { length: 26 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }), // followers are not critical data
});
export type Follower = typeof followers.$inferSelect;
export type FollowerInsert = typeof followers.$inferInsert;
export type FollowerUpdate = MySqlUpdateSetSource<typeof followers>;

export const orgFollowers = mysqlTable("org_followers", {
  idInt: int("id_int").autoincrement().primaryKey(),
  id: varchar("id", { length: 26 }).notNull().unique(),
  orgIdInt: int("org_id_int")
    .notNull()
    .references(() => organizations.idInt, { onDelete: "cascade" }), // followers are not critical data
  orgId: varchar("org_id", { length: 26 })
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }), // followers are not critical data
  followerIdInt: int("follower_id_int")
    .notNull()
    .references(() => users.idInt, { onDelete: "cascade" }), // followers are not critical data
  followerId: varchar("follower_id", { length: 26 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }), // followers are not critical data
});
export type OrgFollower = typeof orgFollowers.$inferSelect;
export type OrgFollowerInsert = typeof orgFollowers.$inferInsert;
export type OrgFollowerUpdate = MySqlUpdateSetSource<typeof orgFollowers>;

export const mediaAssets = mysqlTable(
  "media_assets",
  {
    id: varchar("id", { length: 26 })
      .primaryKey()
      .$defaultFn(() => ulid()),
    parentId: varchar("parent_id", { length: 26 }), // null for originals
    variant: varchar("variant", { length: 64 }), // "original", "thumb-400", "720p"...
    recipe: varchar("recipe", { length: 64 }), // "video-720p@v2"
    storageKey: varchar("storage_key", { length: 512 }).notNull(),
    sha256: char("sha256", { length: 64 }).notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    mimeType: varchar("mime_type", { length: 128 }).notNull(),
    kind: mysqlEnum("kind", MEDIA_ASSET_TYPES).notNull(),
    originUrl: text("origin_url").notNull(),
    publicUrl: text("public_url").notNull(),
    width: int("width"),
    height: int("height"),
    status: mysqlEnum("status", [
      "pending",
      "processing",
      "ready",
      "failed",
    ]).notNull(),
    probe: json("probe"), // raw ffprobe/sharp output
    probeTool: varchar("probe_tool", { length: 64 }),
    createdAt: datetime("created_at", { fsp: 3 })
      .default(sql`(NOW(3))`)
      .notNull(),
    deletedAt: datetime("deleted_at", { fsp: 3 }),

    // audio/video
    durationMs: int("duration_ms"),

    // video
    videoCodec: varchar("video_codec", { length: 32 }),
    videoCodecString: varchar("video_codec_string", { length: 255 }),
    pixelFormat: varchar("pixel_format", { length: 32 }),
    colorTransfer: varchar("color_transfer", { length: 32 }),
    rotation: int("rotation"),

    // audio
    audioCodec: varchar("audio_codec", { length: 32 }),
    audioCodecString: varchar("audio_codec_string", { length: 255 }),
  },
  (table) => [
    // Includes soft-deleted rows: re-adding the same media restores the row.
    uniqueIndex("idx_media_assets_storage_key").on(table.storageKey),
  ]
);
export type MediaAsset = typeof mediaAssets.$inferSelect;
export type MediaAssetInsert = typeof mediaAssets.$inferInsert;
export type MediaAssetUpdate = MySqlUpdateSetSource<typeof mediaAssets>;

export const versionMediaAssetMap = mysqlTable(
  "version_media_asset_map",
  {
    versionId: varchar("version_id", { length: 26 })
      .notNull()
      .references(() => versions.id, { onDelete: "cascade" }),
    mediaAssetId: varchar("media_asset_id", {
      length: 26,
    })
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.versionId, table.mediaAssetId] }),
    index("idx_version_id_int").on(table.versionId),
  ]
);
export type VersionMediaAssetConnection =
  typeof versionMediaAssetMap.$inferSelect;
export type VersionMediaAssetConnectionInsert =
  typeof versionMediaAssetMap.$inferInsert;
export type VersionMediaAssetConnectionUpdate = MySqlUpdateSetSource<
  typeof versionMediaAssetMap
>;

export const mediaImportBatches = mysqlTable("media_import_batches", {
  id: varchar("id", { length: 26 })
    .primaryKey()
    .$defaultFn(() => ulid()),
  publicationId: varchar("publication_id", { length: 26 })
    .notNull()
    .references(() => publications.id, { onDelete: "cascade" }),
  versionId: varchar("version_id", { length: 26 })
    .notNull()
    .references(() => versions.id, { onDelete: "cascade" }),
  importId: varchar("import_id", { length: 26 })
    .notNull()
    .references(() => versionImports.id, { onDelete: "cascade" }),
  status: mysqlEnum("status", [
    "processing",
    "finalizing",
    "completed",
    "failed",
  ])
    .notNull()
    .default("processing"),
  error: text("error"),
  total: int("total").notNull(),
  createdAt: datetime("created_at", { fsp: 3 })
    .default(sql`(NOW(3))`)
    .notNull(),
});
export type MediaImportBatch = typeof mediaImportBatches.$inferSelect;
export type MediaImportBatchInsert = typeof mediaImportBatches.$inferInsert;
export type MediaImportBatchUpdate = MySqlUpdateSetSource<
  typeof mediaImportBatches
>;

/** Imported media as queued: a `bytes` source's data lives in the `data` column. */
export type QueuedImportedMedia =
  | ImportedUrlMedia
  | (Omit<ImportedFileMedia, "source"> & {
      source: Omit<ImportedFileMedia["source"], "data">;
    });

export const mediaImportItems = mysqlTable(
  "media_import_items",
  {
    id: varchar("id", { length: 26 })
      .primaryKey()
      .$defaultFn(() => ulid()),
    batchId: varchar("batch_id", { length: 26 })
      .references(() => mediaImportBatches.id, { onDelete: "cascade" })
      .notNull(),
    ref: varchar("ref", { length: 255 }).notNull(),
    media: json("media").$type<QueuedImportedMedia>().notNull(),
    /** The bytes of a `bytes` source, which `media` can't hold as JSON. */
    data: customMediumBlob("data"),
    status: mysqlEnum("status", MEDIA_IMPORT_ITEM_STATUSES)
      .notNull()
      .default("pending"),
    s3Url: text("s3_url"),
    /** The last attempt's error, for logs and debugging. */
    error: text("error"),
    /** Set when the item fails; what clients see instead of `error`. */
    errorCode: mysqlEnum("error_code", MEDIA_IMPORT_ERROR_CODES),
  },
  (t) => [index("batch_status_idx").on(t.batchId, t.status)]
);
export type MediaImportItem = typeof mediaImportItems.$inferSelect;
export type MediaImportItemInsert = typeof mediaImportItems.$inferInsert;
export type MediaImportItemUpdate = MySqlUpdateSetSource<
  typeof mediaImportItems
>;

export const versionImports = mysqlTable(
  "version_imports",
  {
    id: varchar("id", { length: 26 })
      .primaryKey()
      .$defaultFn(() => ulid()),
    versionId: varchar("version_id", { length: 26 })
      .notNull()
      .references(() => versions.id, { onDelete: "cascade" }),
    /**
     * File format in its simplest form, not mime type
     * (`gdoc`, `mystmd`, `commonmark`, `html`, `latex`, `ipynb`, ...).
     */
    format: varchar("format", { length: 255 }).notNull(),
    filename: text("filename"),
    url: text("url"),
    /** Raw source as received. Never select this in list queries. */
    body: customMediumBlob("body").notNull(),
    diagnostics: json("diagnostics").$type<ImportDiagnostic[]>(),
    /** When the source was fetched. For uploads this equals createdAt. */
    syncedAt: datetime("synced_at", { fsp: 3, mode: "string" })
      .default(sql`(NOW(3))`)
      .notNull(),
    createdAt: datetime("created_at", { fsp: 3, mode: "string" })
      .default(sql`(NOW(3))`)
      .notNull(),
  },
  (table) => [
    // "latest import for this version" and "history for this version"
    index("idx_version_imports_version_created").on(
      table.versionId,
      table.createdAt
    ),
  ]
);
export type VersionImport = typeof versionImports.$inferSelect;
export type VersionImportInsert = typeof versionImports.$inferInsert;
export type VersionImportUpdate = MySqlUpdateSetSource<typeof versionImports>;
