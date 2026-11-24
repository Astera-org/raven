import { type Publication, type User } from "#src/db/schema.js";
import { withNamedLock } from "#src/lib/named-lock.js";
import {
  DoiAuditJobDataSchema,
  failedJobMessage,
  findDoiAuditParent,
  isSettled,
  listDoiAuditParents,
  listDoiAuditPublicationJobs,
  sendDoiAudit,
  settledOutcomes,
  type DoiAuditJobData,
} from "#src/lib/tasks/helpers/doi-audit-task-helpers.js";
import { type Repositories } from "#v1/db-repositories/index.js";
import { type AdminDoiAuditResponse } from "#v1/routes/admin/doi-audits/route-responses/doi-audit.js";
import { type AdminScope } from "#v1/routes/admin/middleware/require-admin-scope.js";
import { type JobWithMetadata } from "pg-boss";

/**
 * A run as stored. `publicationIds` is every publication the run selected, so
 * a read can narrow progress to the caller's current scope without
 * re-querying. `resultsExpired` marks a run failed by retention, so a read can
 * recount the expiry within the caller's scope. None of these nor `ownerId` is
 * part of the response.
 */
export type DoiAuditJob = AdminDoiAuditResponse & {
  ownerId: User["id"];
  publicationIds: Publication["id"][];
  resultsExpired: boolean;
};

/**
 * Running while any publication job is unsettled, even under a failed or
 * cancelled parent (one whose insert committed before it failed), and while
 * the parent itself is. Not while fewer than `total` have settled: pg-boss
 * deletes finished jobs, and the parent completes only after its insert
 * commits, so a missing job finished and its result has expired, which fails
 * the audit.
 */
function auditStatus(
  parent: JobWithMetadata<object>,
  publicationJobs: JobWithMetadata<object>[],
  settled: number,
  total: number
): DoiAuditJob["status"] {
  if (publicationJobs.some(({ state }) => !isSettled(state))) return "running";
  if (parent.state === "failed" || parent.state === "cancelled") {
    return "failed";
  }
  if (parent.state !== "completed") return "running";
  return settled < total ? "failed" : "completed";
}

function expiredResultsError(expired: number, total: number): string {
  return `${expired} of ${total} publication results expired and were deleted`;
}

function auditError(
  parent: JobWithMetadata<object>,
  status: DoiAuditJob["status"],
  settled: number,
  total: number
): string | null {
  if (status !== "failed") return null;
  if (parent.state !== "completed") return failedJobMessage(parent.output);
  return expiredResultsError(total - settled, total);
}

function latestDate(dates: (Date | null)[]): Date | null {
  return dates.reduce<Date | null>(
    (latest, date) => (date && (!latest || date > latest) ? date : latest),
    null
  );
}

function byPublicationId(
  a: { publicationId: string },
  b: { publicationId: string }
): number {
  return a.publicationId.localeCompare(b.publicationId);
}

/**
 * Someone else's job is reported as missing rather than forbidden, so job ids
 * can't be probed for existence.
 */
async function toDoiAuditJob(
  parent: JobWithMetadata<object>,
  ownerId: User["id"]
): Promise<DoiAuditJob | null> {
  const data = DoiAuditJobDataSchema.safeParse(parent.data);
  if (!data.success || data.data.ownerId !== ownerId) return null;
  const { scope, publications } = data.data;

  const publicationJobs = await listDoiAuditPublicationJobs(parent.id);
  const outcomes = settledOutcomes(publicationJobs);
  const settled = [...outcomes.values()];
  const total = publications.length;
  const status = auditStatus(parent, publicationJobs, outcomes.size, total);
  const finishedOn =
    status === "running"
      ? null
      : latestDate([
          parent.completedOn,
          ...settled.map(({ completedOn }) => completedOn),
        ]);

  return {
    id: parent.id,
    ownerId,
    scope,
    status,
    total,
    completed: outcomes.size,
    startedAt: parent.createdOn.toISOString(),
    finishedAt: finishedOn?.toISOString() ?? null,
    results: settled
      .flatMap(({ outcome }) =>
        outcome.outcome === "result" ? [outcome.result] : []
      )
      .sort(byPublicationId),
    failures: settled
      .flatMap(({ outcome }) =>
        outcome.outcome === "failure" ? [outcome.failure] : []
      )
      .sort(byPublicationId),
    error: auditError(parent, status, outcomes.size, total),
    publicationIds: publications.map(({ id }) => id),
    resultsExpired: status === "failed" && parent.state === "completed",
  };
}

export async function findDoiAuditJob(
  jobId: string,
  ownerId: User["id"]
): Promise<DoiAuditJob | null> {
  const parent = await findDoiAuditParent(jobId);
  return parent ? toDoiAuditJob(parent, ownerId) : null;
}

/** Only the newest can be running, since a start waits for it to finish. */
async function findRunningDoiAuditJob(
  ownerId: User["id"]
): Promise<DoiAuditJob | null> {
  const newest = (await listDoiAuditParents(ownerId)).at(-1);
  if (!newest) return null;
  const job = await toDoiAuditJob(newest, ownerId);
  return job?.status === "running" ? job : null;
}

/**
 * Queues a run and returns its job. An owner gets at most one running job --
 * a second start returns the one already running.
 *
 * The parent's singletonKey only blocks a second audit while the parent is
 * queued or running, and it completes once its publications are queued, so
 * the lock is what serializes starts for the audit's whole run.
 */
export async function startDoiAuditJob(
  repos: Repositories,
  { ownerId, scope }: { ownerId: User["id"]; scope: AdminScope }
): Promise<DoiAuditJob> {
  return withNamedLock(`doi-audit:owner:${ownerId}`, async () => {
    const running = await findRunningDoiAuditJob(ownerId);
    if (running) return running;

    const publications =
      await repos.publications.listAdministeredWithDoi(scope);
    const data: DoiAuditJobData = {
      ownerId,
      scope: scope.kind === "site" ? "all" : "administered-orgs",
      publications: publications.map(({ id, slug, doi }) => ({
        id,
        slug,
        doi,
      })),
    };
    const jobId = await sendDoiAudit(data);
    const job = jobId
      ? await findDoiAuditJob(jobId, ownerId)
      : await findRunningDoiAuditJob(ownerId);
    if (!job) throw new Error("pg-boss did not queue the DOI audit");
    return job;
  });
}

/**
 * The job as the caller may see it now, regardless of the scope it ran with:
 * an `org` scope narrows results, failures and progress to the publications it
 * administers now, so access lost since the run started stops applying and
 * out-of-scope counts don't leak.
 */
export async function buildDoiAuditResponse(
  repos: Repositories,
  job: DoiAuditJob,
  scope: AdminScope
): Promise<AdminDoiAuditResponse> {
  const { ownerId: _ownerId, publicationIds, resultsExpired, ...view } = job;
  if (scope.kind === "site") return view;

  const administered = new Set(
    await repos.publications.listAdministeredIds(scope, publicationIds)
  );
  const results = view.results.filter((result) =>
    administered.has(result.publicationId)
  );
  const failures = view.failures.filter((failure) =>
    administered.has(failure.publicationId)
  );
  const total = publicationIds.filter((id) => administered.has(id)).length;
  // auditOnePublication records exactly one result or failure per
  // publication it finishes, so this matches `completed` within scope.
  const completed = results.length + failures.length;
  return {
    ...view,
    ...(resultsExpired ? scopedExpiry(total - completed, total) : {}),
    scope: "administered-orgs",
    total,
    completed,
    results,
    failures,
  };
}

/**
 * An expired run's status and error, counted within the caller's scope, so
 * results expired outside it neither fail the audit nor show in the message.
 */
function scopedExpiry(
  expired: number,
  total: number
): Pick<AdminDoiAuditResponse, "status" | "error"> {
  if (expired === 0) return { status: "completed", error: null };
  return { status: "failed", error: expiredResultsError(expired, total) };
}
