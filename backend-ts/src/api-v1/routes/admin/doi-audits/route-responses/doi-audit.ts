import { z } from "@hono/zod-openapi";

const UtcDateTimeSchema = z.iso.datetime({ precision: 3 });

export const DOI_AUDIT_JOB_STATUSES = [
  "running",
  "completed",
  "failed",
] as const;

export const DOI_AUDIT_SCOPES = ["all", "administered-orgs"] as const;

const DoiFieldDiffSchema = z
  .object({
    field: z.string(),
    expected: z.unknown(),
    actual: z.unknown(),
  })
  .openapi("DoiFieldDiff");

export const DoiComparisonSummarySchema = z
  .object({
    doi: z.string(),
    found: z.boolean().openapi({
      description:
        "False when DataCite has no record for the DOI. In an audit, a " +
        "publication DataCite couldn't be queried for is listed under " +
        "`failures` instead.",
    }),
    matches: z.boolean(),
    diffs: z.array(DoiFieldDiffSchema),
  })
  .openapi("DoiComparisonSummary");
export type DoiComparisonSummary = z.infer<typeof DoiComparisonSummarySchema>;

export const AdminDoiAuditResultSchema = z
  .object({
    publicationId: z.string(),
    slug: z.string(),
    canonicalDoi: z.string(),
    versionDoi: z.string().nullable(),
    canonical: DoiComparisonSummarySchema,
    version: DoiComparisonSummarySchema.nullable().openapi({
      description:
        "Null when the latest published version has no DOI of its own.",
    }),
  })
  .openapi("AdminDoiAuditResult");
export type AdminDoiAuditResult = z.infer<typeof AdminDoiAuditResultSchema>;

export const AdminDoiAuditFailureSchema = z
  .object({
    publicationId: z.string(),
    slug: z.string(),
    error: z.string(),
  })
  .openapi("AdminDoiAuditFailure");
export type AdminDoiAuditFailure = z.infer<typeof AdminDoiAuditFailureSchema>;

export const AdminDoiAuditResponseSchema = z
  .object({
    id: z.string(),
    scope: z.enum(DOI_AUDIT_SCOPES).openapi({
      description:
        "The scope the audit was started with: `all` when started by a site " +
        "admin, covering every publication, or `administered-orgs` when " +
        "started by an org admin, covering the orgs they administered at the " +
        "start. A site admin reading the audit gets that recorded scope with " +
        "every result. An org admin always gets `administered-orgs`, with " +
        "results further limited to the orgs they administer now.",
    }),
    status: z.enum(DOI_AUDIT_JOB_STATUSES),
    total: z.int(),
    completed: z.int(),
    startedAt: UtcDateTimeSchema,
    finishedAt: UtcDateTimeSchema.nullable(),
    results: z.array(AdminDoiAuditResultSchema),
    failures: z.array(AdminDoiAuditFailureSchema),
    error: z.string().nullable(),
  })
  .openapi("AdminDoiAudit");
export type AdminDoiAuditResponse = z.infer<typeof AdminDoiAuditResponseSchema>;
