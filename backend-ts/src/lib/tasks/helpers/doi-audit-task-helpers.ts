import { type Publication } from "#src/db/schema.js";
import { DataciteRequestError } from "#src/lib/errors/datacite-request-error.js";
import { logger } from "#src/lib/logger.js";
import { getBoss } from "#src/lib/queue/pg-boss.js";
import {
  DOI_AUDIT,
  DOI_AUDIT_PUBLICATION,
} from "#src/lib/tasks/queue-names.js";
import { type Repositories } from "#v1/db-repositories/index.js";
import { compareCanonicalDoiMetadata } from "#v1/routes/admin/doi-audits/helpers/compare-canonical-doi-metadata.js";
import { compareVersionDoiMetadata } from "#v1/routes/admin/doi-audits/helpers/compare-version-doi-metadata.js";
import { reconstructPublicationMetadata } from "#v1/routes/admin/doi-audits/helpers/reconstruct-publication-metadata.js";
import { type MetadataComparisonResult } from "#v1/routes/admin/doi-audits/helpers/to-comparable.js";
import {
  AdminDoiAuditFailureSchema,
  AdminDoiAuditResultSchema,
  DOI_AUDIT_SCOPES,
  type DoiComparisonSummary,
} from "#v1/routes/admin/doi-audits/route-responses/doi-audit.js";
import { AssertionError } from "node:assert";
import {
  type FindJobsOptions,
  type JobInsert,
  type JobWithMetadata,
} from "pg-boss";
import { z } from "zod";

const FIND_JOBS_PAGE_SIZE = 1000;

/** Enough to name a publication in a report; its row is read when it runs. */
const DoiAuditPublicationRefSchema = z.object({
  id: z.string(),
  slug: z.string(),
  doi: z.string().nullable(),
});
export type DoiAuditPublicationRef = z.infer<
  typeof DoiAuditPublicationRefSchema
>;

/** Publications are selected at start, so no job re-derives the caller's orgs. */
export const DoiAuditJobDataSchema = z.object({
  ownerId: z.string(),
  scope: z.enum(DOI_AUDIT_SCOPES),
  publications: z.array(DoiAuditPublicationRefSchema),
});
export type DoiAuditJobData = z.infer<typeof DoiAuditJobDataSchema>;

export const DoiAuditPublicationJobDataSchema = z.object({
  auditId: z.string(),
  publication: DoiAuditPublicationRefSchema,
});
export type DoiAuditPublicationJobData = z.infer<
  typeof DoiAuditPublicationJobDataSchema
>;

const DoiAuditPublicationOutcomeSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("result"),
    result: AdminDoiAuditResultSchema,
  }),
  z.object({
    outcome: z.literal("failure"),
    failure: AdminDoiAuditFailureSchema,
  }),
]);
export type DoiAuditPublicationOutcome = z.infer<
  typeof DoiAuditPublicationOutcomeSchema
>;

function toSummary(result: MetadataComparisonResult): DoiComparisonSummary {
  const { doi, found, matches, diffs } = result;
  return { doi, found, matches, diffs };
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Unknown error";
}

/** Null, 429 or 5xx: retrying may help, per `DataciteRequestError`. */
function isRetryableDataciteError(e: unknown): boolean {
  return (
    e instanceof DataciteRequestError &&
    (e.status === null || e.status === 429 || e.status >= 500)
  );
}

function failureOutcome(
  { id: publicationId, slug }: { id: Publication["id"]; slug: string },
  error: string
): DoiAuditPublicationOutcome {
  return { outcome: "failure", failure: { publicationId, slug, error } };
}

/**
 * One failure for the publication, naming every comparison that rejected, and
 * logs each rejection with its own error. Throws the same message instead
 * when any rejection may succeed on retry, so pg-boss retries the publication.
 */
function comparisonFailure(
  publication: Publication,
  comparisons: [
    label: "canonical" | "version",
    result: PromiseSettledResult<MetadataComparisonResult | null>,
  ][]
): DoiAuditPublicationOutcome {
  const errors: string[] = [];
  for (const [label, result] of comparisons) {
    if (result.status === "fulfilled") continue;
    logger.error(
      { err: result.reason, publicationId: publication.id },
      `DOI metadata audit: ${label} DOI comparison failed`
    );
    errors.push(`${label} DOI: ${errorMessage(result.reason)}`);
  }

  const error = errors.join("; ");
  const retryable = comparisons.some(
    ([, result]) =>
      result.status === "rejected" && isRetryableDataciteError(result.reason)
  );
  if (retryable) throw new Error(error);
  return failureOutcome(publication, error);
}

/**
 * Returns the publication's result, or its failure when it's gone, has no DOI,
 * has no published version, or DataCite answers 4xx. Throws on anything
 * retrying may fix.
 */
export async function auditOnePublication(
  repos: Repositories,
  ref: DoiAuditPublicationRef
): Promise<DoiAuditPublicationOutcome> {
  // Found even once removed (`DELETED`): its DOI stays registered, so it's
  // still audited.
  const publication = await repos.publications.findById(ref.id);
  if (!publication) {
    const gone = "Publication no longer exists";
    return failureOutcome(ref, ref.doi ? `${gone} (DOI ${ref.doi})` : gone);
  }
  if (!publication.doi) {
    return failureOutcome(publication, "Publication no longer has a DOI");
  }

  /**
   * @todo The DataCite client (`#src/lib/datacite/client.ts`) is keyed by
   * legacy integer ids and shared with v0, so `idInt` is passed through to
   * its fetchers here. Convert the client to ULIDs when v0 retires and the
   * int-keyed exception goes away.
   */
  const reconstructed = await reconstructPublicationMetadata(
    repos,
    publication
  );
  if (!reconstructed) {
    return failureOutcome(publication, "No published version found");
  }

  // allSettled, not all: a comparison that rejects early must not release
  // this publication's worker slot while the other's DataCite request is
  // still in flight.
  const [canonical, version] = await Promise.allSettled([
    compareCanonicalDoiMetadata(
      reconstructed.canonicalDoi,
      reconstructed.canonicalMeta,
      reconstructed.versionMeta
    ),
    reconstructed.versionDoi
      ? compareVersionDoiMetadata(
          reconstructed.versionDoi,
          reconstructed.versionMeta
        )
      : null,
  ]);
  if (canonical.status === "rejected" || version.status === "rejected") {
    return comparisonFailure(publication, [
      ["canonical", canonical],
      ["version", version],
    ]);
  }

  return {
    outcome: "result",
    result: {
      publicationId: publication.id,
      slug: publication.slug,
      canonicalDoi: reconstructed.canonicalDoi,
      versionDoi: reconstructed.versionDoi,
      canonical: toSummary(canonical.value),
      version: version.value ? toSummary(version.value) : null,
    },
  };
}

export function doiAuditPublicationJobs(
  auditId: string,
  publications: DoiAuditPublicationRef[]
): JobInsert<DoiAuditPublicationJobData>[] {
  return publications.map((publication) => ({
    data: { auditId, publication },
    singletonKey: `${auditId}:${publication.id}`,
  }));
}

// The shapes pg-boss stores as a failed job's output: a thrown error, an
// expiry (`{ value: { message } }`), or a shutdown (`{ value: "..." }`).
const FailedJobOutputSchema = z.union([
  z.object({ message: z.string() }),
  z
    .object({ value: z.object({ message: z.string() }) })
    .transform(({ value }) => value),
  z
    .object({ value: z.string() })
    .transform(({ value }) => ({ message: value })),
]);

export function failedJobMessage(output: object | null): string {
  const parsed = FailedJobOutputSchema.safeParse(output);
  return parsed.success ? parsed.data.message : "Unknown error";
}

export function isSettled(state: JobWithMetadata["state"]): boolean {
  return state === "completed" || state === "failed" || state === "cancelled";
}

function settledOutcome(
  job: JobWithMetadata<object>,
  publication: DoiAuditPublicationRef
): DoiAuditPublicationOutcome {
  if (job.state !== "completed") {
    return failureOutcome(publication, failedJobMessage(job.output));
  }
  const output = DoiAuditPublicationOutcomeSchema.safeParse(job.output);
  return output.success
    ? output.data
    : failureOutcome(publication, "The audit recorded no outcome");
}

export interface SettledPublication {
  outcome: DoiAuditPublicationOutcome;
  completedOn: Date | null;
}

/** One outcome per settled publication; a duplicate keeps its first job's. */
export function settledOutcomes(
  jobs: JobWithMetadata<object>[]
): Map<Publication["id"], SettledPublication> {
  const outcomes = new Map<Publication["id"], SettledPublication>();
  for (const job of jobs) {
    const data = DoiAuditPublicationJobDataSchema.safeParse(job.data);
    if (!data.success || !isSettled(job.state)) continue;
    const { publication } = data.data;
    if (outcomes.has(publication.id)) continue;
    outcomes.set(publication.id, {
      outcome: settledOutcome(job, publication),
      completedOn: job.completedOn,
    });
  }
  return outcomes;
}

async function readAllPages(
  name: string,
  options: Pick<FindJobsOptions, "key" | "data">
): Promise<JobWithMetadata<object>[]> {
  const jobs: JobWithMetadata<object>[] = [];
  for (;;) {
    const page = await getBoss().findJobs<object>(name, {
      ...options,
      limit: FIND_JOBS_PAGE_SIZE,
      after: jobs.at(-1)?.id,
    });
    jobs.push(...page);
    if (page.length < FIND_JOBS_PAGE_SIZE) return jobs;
  }
}

/** Every matching job, oldest first, a page at a time. */
async function findAllJobs(
  name: string,
  options: Pick<FindJobsOptions, "key" | "data">
): Promise<JobWithMetadata<object>[]> {
  try {
    return await readAllPages(name, options);
  } catch (e) {
    // pg-boss asserts "findJobs: after names a row that no longer exists"
    // when it deleted the previous page's last job mid-read; read once more
    // from the start.
    if (!(
      e instanceof AssertionError && e.message.startsWith("findJobs: after")
    )) {
      throw e;
    }
    return readAllPages(name, options);
  }
}

/** Null when the owner's parent job still holds the singletonKey. */
export function sendDoiAudit(data: DoiAuditJobData): Promise<string | null> {
  return getBoss().send(DOI_AUDIT, data, { singletonKey: data.ownerId });
}

export function findDoiAuditParent(
  auditId: string
): Promise<JobWithMetadata<object> | null> {
  return getBoss().getJobById<object>(DOI_AUDIT, auditId);
}

/** The owner's audits, oldest first. */
export function listDoiAuditParents(
  ownerId: string
): Promise<JobWithMetadata<object>[]> {
  return findAllJobs(DOI_AUDIT, { key: ownerId });
}

export function listDoiAuditPublicationJobs(
  auditId: string
): Promise<JobWithMetadata<object>[]> {
  return findAllJobs(DOI_AUDIT_PUBLICATION, { data: { auditId } });
}
