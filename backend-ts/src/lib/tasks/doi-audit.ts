import { logger } from "#src/lib/logger.js";
import {
  auditOnePublication,
  DoiAuditJobDataSchema,
  DoiAuditPublicationJobDataSchema,
  doiAuditPublicationJobs,
  type DoiAuditJobData,
  type DoiAuditPublicationJobData,
} from "#src/lib/tasks/helpers/doi-audit-task-helpers.js";
import {
  DOI_AUDIT,
  DOI_AUDIT_PUBLICATION,
} from "#src/lib/tasks/queue-names.js";
import { makeRepositories } from "#v1/db-repositories/index.js";
import { type PgBoss, type UpdateQueueOptions } from "pg-boss";

const AUDIT_QUEUE_OPTIONS = {
  retryLimit: 4,
  retryDelay: 15,
  retryBackoff: true,
} satisfies UpdateQueueOptions;

const PUBLICATION_QUEUE_OPTIONS = {
  retryLimit: 3,
  retryDelay: 15,
  retryBackoff: true,
  // A day past the parent's 7-day default, so an audit is deleted before any
  // of its results are.
  deleteAfterSeconds: 60 * 60 * 24 * 8,
} satisfies UpdateQueueOptions;

// No dead letter queues: a job that runs out of retries is read back from its
// own `failed` state. ERROR MODE tags follow upload-url-media.ts.
//
// Both queues are `exclusive`, which makes each singletonKey unique while its
// job is queued or running; `standard` doesn't dedupe by key. createQueue
// leaves an existing queue as it is, so updateQueue applies changed options;
// a queue's policy can't be changed after creation.
export async function addDoiAudit(boss: PgBoss) {
  await boss.createQueue(DOI_AUDIT, {
    policy: "exclusive",
    ...AUDIT_QUEUE_OPTIONS,
  });
  await boss.updateQueue(DOI_AUDIT, AUDIT_QUEUE_OPTIONS);
  await boss.createQueue(DOI_AUDIT_PUBLICATION, {
    policy: "exclusive",
    ...PUBLICATION_QUEUE_OPTIONS,
  });
  await boss.updateQueue(DOI_AUDIT_PUBLICATION, PUBLICATION_QUEUE_OPTIONS);

  await boss.work<DoiAuditJobData>(DOI_AUDIT, async ([job]) => {
    if (!job) {
      return;
    }

    // ERROR MODE [HANDLED: SKIP + LOG]: malformed payload; GET reports the
    // audit as not found.
    const data = DoiAuditJobDataSchema.safeParse(job.data);
    if (!data.success) {
      logger.error(`Unexpected data for ${DOI_AUDIT} job.`);
      return;
    }

    const publicationJobs = doiAuditPublicationJobs(
      job.id,
      data.data.publications
    );
    if (publicationJobs.length === 0) {
      return;
    }

    // ERROR MODE [HANDLED: RETRY -> FAILED]: one statement, so it queues all
    // or none. [EDGE CASE]: a retry re-queues only publications whose first
    // job already finished; the reader keeps the first outcome.
    await boss.insert(DOI_AUDIT_PUBLICATION, publicationJobs);
  });

  // Each publication makes up to 2 DataCite requests.
  await boss.work<DoiAuditPublicationJobData>(
    DOI_AUDIT_PUBLICATION,
    { localConcurrency: 5 },
    async ([job]) => {
      if (!job) {
        return;
      }

      // ERROR MODE [HANDLED: SKIP + LOG]: malformed payload. [EDGE CASE]: the
      // audit stays running until pg-boss deletes it.
      const data = DoiAuditPublicationJobDataSchema.safeParse(job.data);
      if (!data.success) {
        logger.error(`Unexpected data for ${DOI_AUDIT_PUBLICATION} job.`);
        return;
      }

      const { auditId, publication } = data.data;
      try {
        // ERROR MODE [HANDLED: FAIL-NOW]: a publication gone or without a
        // DOI, no published version, and DataCite 4xx are returned as the
        // job's output.
        return await auditOnePublication(makeRepositories(), publication);
      } catch (e) {
        // ERROR MODE [HANDLED: RETRY -> FAILED + LOG]: DataCite 5xx, 429 or no
        // response, and database errors.
        logger.error(
          {
            err: e,
            auditId,
            publicationId: publication.id,
            jobId: job.id,
          },
          `${DOI_AUDIT_PUBLICATION}: attempt failed, retrying`
        );
        throw e;
      }
    }
  );
}
