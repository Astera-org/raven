import { DEFAULT_DOI_METADATA } from "#src/db/schema.js";
import { DataciteRequestError } from "#src/lib/errors/datacite-request-error.js";
import { addDoiAudit } from "#src/lib/tasks/doi-audit.js";
import {
  type DoiAuditJobData,
  type DoiAuditPublicationOutcome,
  type DoiAuditPublicationRef,
} from "#src/lib/tasks/helpers/doi-audit-task-helpers.js";
import {
  DOI_AUDIT,
  DOI_AUDIT_PUBLICATION,
} from "#src/lib/tasks/queue-names.js";
import { type Repositories } from "#v1/db-repositories/index.js";
import { type DoiAuditPublicationRow } from "#v1/db-repositories/publications-repository.js";
import {
  buildDoiAuditResponse,
  findDoiAuditJob,
  startDoiAuditJob,
} from "#v1/routes/admin/doi-audits/helpers/doi-audit-jobs.js";
import { type MetadataComparisonResult } from "#v1/routes/admin/doi-audits/helpers/to-comparable.js";
import { AssertionError } from "node:assert";
import { type JobInsert, type PgBoss } from "pg-boss";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

type JobState =
  | "created"
  | "retry"
  | "active"
  | "completed"
  | "cancelled"
  | "failed";

/** The fields of a pg-boss job row the audit reads. */
interface StoredJob {
  id: string;
  name: string;
  data: Record<string, unknown>;
  state: JobState;
  output: object | null;
  singletonKey: string | null;
  createdOn: Date;
  completedOn: Date | null;
}

type Handler = (jobs: { id: string; data: object }[]) => Promise<unknown>;

const mocks = vi.hoisted(() => ({
  listAdministeredWithDoi: vi.fn(),
  listAdministeredIds: vi.fn(),
  findById: vi.fn(),
  reconstructPublicationMetadata:
    vi.fn<(repos: unknown, row: DoiAuditPublicationRow) => Promise<unknown>>(),
  compareCanonicalDoiMetadata: vi.fn(),
  compareVersionDoiMetadata: vi.fn(),
  logger: { error: vi.fn(), fatal: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// A stand-in for pg-boss's job table. Like pg-boss, an `exclusive` queue
// refuses a job whose singletonKey a queued or running job holds (the
// unique index job_i6, inserted with ON CONFLICT DO NOTHING), and findJobs
// pages oldest first, throwing when `after` names a deleted job.
const jobs: StoredJob[] = [];
const handlers = new Map<string, Handler>();
const queueOptions = new Map<string, Record<string, unknown>>();
const updatedQueueOptions = new Map<string, Record<string, unknown>>();
const workOptions = new Map<string, object | undefined>();
let nextJob = 0;

function isUnsettled(state: JobState) {
  return state === "created" || state === "retry" || state === "active";
}

function holdsKey(name: string, singletonKey: string | null) {
  return (
    queueOptions.get(name)?.policy === "exclusive" &&
    singletonKey !== null &&
    jobs.some(
      (job) =>
        job.name === name &&
        job.singletonKey === singletonKey &&
        isUnsettled(job.state)
    )
  );
}

function storeJob(
  name: string,
  data: object,
  singletonKey: string | null = null
): StoredJob | null {
  if (holdsKey(name, singletonKey)) return null;
  nextJob += 1;
  const job: StoredJob = {
    id: `00000000-0000-4000-8000-${String(nextJob).padStart(12, "0")}`,
    name,
    data: data as Record<string, unknown>,
    state: "created",
    output: null,
    singletonKey,
    createdOn: new Date(Date.UTC(2026, 10, 1, 0, 0, 0, nextJob)),
    completedOn: null,
  };
  jobs.push(job);
  return job;
}

function deleteJob(id: string) {
  jobs.splice(
    jobs.findIndex((job) => job.id === id),
    1
  );
}

async function findJobsInTable(
  name: string,
  {
    key,
    data = {},
    limit = 1000,
    after,
  }: { key?: string; data?: object; limit?: number; after?: string }
) {
  const matching = jobs.filter(
    (job) =>
      job.name === name &&
      (key === undefined || job.singletonKey === key) &&
      Object.entries(data).every(([k, value]) => job.data[k] === value)
  );
  if (after === undefined) return matching.slice(0, limit);
  const anchor = matching.findIndex((job) => job.id === after);
  if (anchor === -1) {
    throw new AssertionError({
      message: "findJobs: after names a row that no longer exists",
    });
  }
  return matching.slice(anchor + 1, anchor + 1 + limit);
}

const boss = {
  createQueue: async (name: string, options: Record<string, unknown>) => {
    queueOptions.set(name, options);
  },
  updateQueue: async (name: string, options: Record<string, unknown>) => {
    updatedQueueOptions.set(name, options);
  },
  // work(name, handler) or work(name, options, handler)
  work: async (name: string, ...rest: unknown[]) => {
    handlers.set(name, rest.at(-1) as Handler);
    workOptions.set(name, rest.length > 1 ? (rest[0] as object) : undefined);
  },
  send: vi.fn(
    async (
      name: string,
      data: object,
      options: { singletonKey?: string } = {}
    ) => storeJob(name, data, options.singletonKey ?? null)?.id ?? null
  ),
  insert: vi.fn(async (name: string, inserts: JobInsert<object>[]) => {
    for (const { data, singletonKey } of inserts) {
      storeJob(name, data ?? {}, singletonKey ?? null);
    }
    return null;
  }),
  getJobById: async (name: string, id: string) =>
    jobs.find((job) => job.name === name && job.id === id) ?? null,
  findJobs: vi.fn(findJobsInTable),
};

// Runs callers of the same lock one at a time, like MySQL's GET_LOCK, unless
// a test bypasses it to reach the singletonKey race underneath.
const lockTails = new Map<string, Promise<void>>();
const lockNames: string[] = [];
let bypassLocks = false;

async function withNamedLock<T>(name: string, fn: () => Promise<T>) {
  lockNames.push(name);
  if (bypassLocks) return fn();
  const run = (lockTails.get(name) ?? Promise.resolve()).then(fn);
  lockTails.set(
    name,
    run.then(
      () => undefined,
      () => undefined
    )
  );
  return run;
}

vi.mock("#src/lib/queue/pg-boss.js", () => ({ getBoss: () => boss }));
vi.mock("#src/lib/named-lock.js", () => ({ withNamedLock }));
vi.mock("#src/lib/logger.js", () => ({ logger: mocks.logger }));
vi.mock("#v1/db-repositories/index.js", () => ({
  makeRepositories: () => ({ publications: { findById: mocks.findById } }),
}));
vi.mock(
  "#v1/routes/admin/doi-audits/helpers/reconstruct-publication-metadata.js",
  () => ({
    reconstructPublicationMetadata: mocks.reconstructPublicationMetadata,
  })
);
vi.mock(
  "#v1/routes/admin/doi-audits/helpers/compare-canonical-doi-metadata.js",
  () => ({ compareCanonicalDoiMetadata: mocks.compareCanonicalDoiMetadata })
);
vi.mock(
  "#v1/routes/admin/doi-audits/helpers/compare-version-doi-metadata.js",
  () => ({ compareVersionDoiMetadata: mocks.compareVersionDoiMetadata })
);

beforeAll(async () => {
  await addDoiAudit(boss as unknown as PgBoss);
});

// Clears queued Once values, implementations and call history, so a test
// that fails early can't leak them.
beforeEach(() => {
  jobs.length = 0;
  lockTails.clear();
  lockNames.length = 0;
  for (const mock of [
    mocks.listAdministeredWithDoi,
    mocks.listAdministeredIds,
    mocks.findById,
    mocks.reconstructPublicationMetadata,
    mocks.compareCanonicalDoiMetadata,
    mocks.compareVersionDoiMetadata,
    ...Object.values(mocks.logger),
  ]) {
    mock.mockReset();
  }
  boss.send.mockClear();
  boss.insert.mockClear();
  boss.findJobs.mockClear();
  mocks.findById.mockImplementation(async (id: string) => knownRows.get(id));
  mocks.reconstructPublicationMetadata.mockImplementation(async (_repos, row) =>
    reconstructedFor(row)
  );
});

afterEach(() => {
  bypassLocks = false;
});

// The MySQL rows `publications.findById` returns, by id.
const knownRows = new Map<string, DoiAuditPublicationRow>();

function publicationRow(n: number): DoiAuditPublicationRow {
  const row: DoiAuditPublicationRow = {
    id: `01JABCDEFGHJKMNPQRSTV${String(n).padStart(5, "0")}`,
    idInt: n,
    slug: `pub-${n}`,
    doi: `10.83972/pub-${n}`,
    license: "CC BY",
    doiMetadata: DEFAULT_DOI_METADATA,
  };
  knownRows.set(row.id, row);
  return row;
}

function refOf({
  id,
  slug,
  doi,
}: DoiAuditPublicationRow): DoiAuditPublicationRef {
  return { id, slug, doi };
}

function reconstructedFor(row: DoiAuditPublicationRow) {
  return {
    publicationId: row.id,
    slug: row.slug,
    canonicalDoi: row.doi!,
    versionDoi: `${row.doi}.1`,
    versionNumber: 1,
    canonicalMeta: {},
    versionMeta: {},
  };
}

const publication = publicationRow(3);
const reconstructed = reconstructedFor(publication);

function matchingComparison(doi: string): MetadataComparisonResult {
  return {
    doi,
    found: true,
    matches: true,
    diffs: [],
    stacksMetadata: {},
    dataciteMetadata: {},
  };
}

function pending<T>() {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

function runPublicationJob(row: DoiAuditPublicationRow = publication) {
  return handlers.get(DOI_AUDIT_PUBLICATION)!([
    { id: "job-1", data: { auditId: "audit-1", publication: refOf(row) } },
  ]);
}

function failureOf(error: string): DoiAuditPublicationOutcome {
  return {
    outcome: "failure",
    failure: { publicationId: publication.id, slug: "pub-3", error },
  };
}

describe(DOI_AUDIT_PUBLICATION, () => {
  it("runs five publications at a time per server", () => {
    expect(workOptions.get(DOI_AUDIT_PUBLICATION)).toEqual({
      localConcurrency: 5,
    });
  });

  it("records each comparison's summary, without its full metadata, when both fulfill", async () => {
    mocks.compareCanonicalDoiMetadata.mockResolvedValueOnce({
      doi: reconstructed.canonicalDoi,
      found: true,
      matches: false,
      diffs: [
        { field: "title", expected: "Stacks title", actual: "Old title" },
      ],
      stacksMetadata: { titles: [{ lang: "en", title: "Stacks title" }] },
      dataciteMetadata: { titles: [{ title: "Old title" }] },
    } satisfies MetadataComparisonResult);
    mocks.compareVersionDoiMetadata.mockResolvedValueOnce({
      doi: reconstructed.versionDoi,
      found: false,
      matches: false,
      diffs: [],
      stacksMetadata: { titles: [{ lang: "en", title: "Stacks title" }] },
      dataciteMetadata: null,
    } satisfies MetadataComparisonResult);

    await expect(runPublicationJob()).resolves.toEqual({
      outcome: "result",
      result: {
        publicationId: publication.id,
        slug: "pub-3",
        canonicalDoi: "10.83972/pub-3",
        versionDoi: "10.83972/pub-3.1",
        canonical: {
          doi: "10.83972/pub-3",
          found: true,
          matches: false,
          diffs: [
            { field: "title", expected: "Stacks title", actual: "Old title" },
          ],
        },
        version: {
          doi: "10.83972/pub-3.1",
          found: false,
          matches: false,
          diffs: [],
        },
      },
    } satisfies DoiAuditPublicationOutcome);
  });

  it("waits for the version comparison to settle before recording a canonical comparison's failure", async () => {
    const version = pending<MetadataComparisonResult>();
    mocks.compareCanonicalDoiMetadata.mockRejectedValueOnce(
      new DataciteRequestError(reconstructed.canonicalDoi, 403, "forbidden")
    );
    mocks.compareVersionDoiMetadata.mockReturnValueOnce(version.promise);

    let settled = false;
    const run = runPublicationJob().finally(() => {
      settled = true;
    });
    await vi.waitFor(() =>
      expect(mocks.compareVersionDoiMetadata).toHaveBeenCalled()
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);

    version.settle(matchingComparison(reconstructed.versionDoi));
    await expect(run).resolves.toEqual(failureOf("canonical DOI: forbidden"));
  });

  it("records a DataCite 4xx as the publication's one failure without retrying", async () => {
    mocks.compareCanonicalDoiMetadata.mockResolvedValueOnce(
      matchingComparison(reconstructed.canonicalDoi)
    );
    mocks.compareVersionDoiMetadata.mockRejectedValueOnce(
      new DataciteRequestError(reconstructed.versionDoi, 400, "bad request")
    );

    await expect(runPublicationJob()).resolves.toEqual(
      failureOf("version DOI: bad request")
    );
  });

  it("names both comparisons in one failure when neither can succeed on retry", async () => {
    mocks.compareCanonicalDoiMetadata.mockRejectedValueOnce(
      new DataciteRequestError(reconstructed.canonicalDoi, 401, "unauthorized")
    );
    mocks.compareVersionDoiMetadata.mockRejectedValueOnce(
      new Error("payload build failed")
    );

    await expect(runPublicationJob()).resolves.toEqual(
      failureOf(
        "canonical DOI: unauthorized; version DOI: payload build failed"
      )
    );
  });

  it.each([
    { label: "sends no response", status: null },
    { label: "rate limits the request", status: 429 },
    { label: "fails with a 5xx", status: 503 },
  ])(
    "throws so pg-boss retries when DataCite $label, even if the other comparison failed for good",
    async ({ status }) => {
      mocks.compareCanonicalDoiMetadata.mockRejectedValueOnce(
        new DataciteRequestError(reconstructed.canonicalDoi, status, "outage")
      );
      mocks.compareVersionDoiMetadata.mockRejectedValueOnce(
        new DataciteRequestError(reconstructed.versionDoi, 404, "gone")
      );

      await expect(runPublicationJob()).rejects.toThrow(
        "canonical DOI: outage; version DOI: gone"
      );
    }
  );

  it("records a publication with no published version as a failure", async () => {
    mocks.reconstructPublicationMetadata.mockResolvedValueOnce(null);

    await expect(runPublicationJob()).resolves.toEqual(
      failureOf("No published version found")
    );
    expect(mocks.compareCanonicalDoiMetadata).not.toHaveBeenCalled();
  });

  it.each([
    {
      queued: "a DOI",
      doi: "10.83972/pub-3",
      error: "Publication no longer exists (DOI 10.83972/pub-3)",
    },
    {
      queued: "no DOI",
      doi: null,
      error: "Publication no longer exists",
    },
  ])(
    "records a publication that no longer exists as a failure named by its queued slug, with $queued",
    async ({ doi, error }) => {
      mocks.findById.mockResolvedValueOnce(undefined);

      await expect(runPublicationJob({ ...publication, doi })).resolves.toEqual(
        failureOf(error)
      );
      expect(mocks.findById).toHaveBeenCalledWith(publication.id);
      expect(mocks.reconstructPublicationMetadata).not.toHaveBeenCalled();
    }
  );

  it("rethrows the database error loading the publication, so pg-boss retries, without reconstructing its metadata", async () => {
    const dbError = new Error(
      "ER_LOCK_WAIT_TIMEOUT: Lock wait timeout exceeded"
    );
    mocks.findById.mockRejectedValueOnce(dbError);

    await expect(runPublicationJob()).rejects.toBe(dbError);
    expect(mocks.reconstructPublicationMetadata).not.toHaveBeenCalled();
  });

  it("records a publication whose DOI was removed as a failure", async () => {
    mocks.findById.mockResolvedValueOnce({ ...publication, doi: null });

    await expect(runPublicationJob()).resolves.toEqual(
      failureOf("Publication no longer has a DOI")
    );
    expect(mocks.reconstructPublicationMetadata).not.toHaveBeenCalled();
  });

  it("audits a publication removed after the audit started", async () => {
    const removed = { ...publication, state: "DELETED" };
    mocks.findById.mockResolvedValueOnce(removed);
    mocks.compareCanonicalDoiMetadata.mockResolvedValueOnce(
      matchingComparison(reconstructed.canonicalDoi)
    );
    mocks.compareVersionDoiMetadata.mockResolvedValueOnce(
      matchingComparison(reconstructed.versionDoi)
    );

    await expect(runPublicationJob()).resolves.toMatchObject({
      outcome: "result",
    });
    expect(mocks.reconstructPublicationMetadata).toHaveBeenCalledWith(
      expect.anything(),
      removed
    );
  });

  it("compares the publication's current row, not the one queued", async () => {
    const current = { ...publication, doi: "10.83972/changed" };
    mocks.findById.mockResolvedValueOnce(current);
    mocks.compareCanonicalDoiMetadata.mockImplementation(async (doi: string) =>
      matchingComparison(doi)
    );
    mocks.compareVersionDoiMetadata.mockImplementation(async (doi: string) =>
      matchingComparison(doi)
    );

    await expect(runPublicationJob()).resolves.toMatchObject({
      outcome: "result",
      result: { canonicalDoi: "10.83972/changed" },
    });
  });

  it("skips a job whose data is malformed, without comparing anything", async () => {
    await expect(
      handlers.get(DOI_AUDIT_PUBLICATION)!([
        { id: "job-1", data: { auditId: "audit-1" } },
      ])
    ).resolves.toBeUndefined();

    expect(mocks.reconstructPublicationMetadata).not.toHaveBeenCalled();
    expect(mocks.logger.error).toHaveBeenCalled();
  });
});

describe(DOI_AUDIT, () => {
  function runFanOut(id: string, publications: DoiAuditPublicationRow[]) {
    const data: DoiAuditJobData = {
      ownerId: "owner",
      scope: "all",
      publications: publications.map(refOf),
    };
    return handlers.get(DOI_AUDIT)!([{ id, data }]);
  }

  it("dedupes both queues by singletonKey while a job is queued or running", () => {
    expect(queueOptions.get(DOI_AUDIT)).toEqual(
      expect.objectContaining({ policy: "exclusive" })
    );
    expect(queueOptions.get(DOI_AUDIT_PUBLICATION)).toEqual(
      expect.objectContaining({ policy: "exclusive" })
    );
  });

  it("applies its options, but not its policy, to queues that already exist", () => {
    for (const name of [DOI_AUDIT, DOI_AUDIT_PUBLICATION]) {
      const { policy: _policy, ...mutable } = queueOptions.get(name)!;
      expect(updatedQueueOptions.get(name)).toEqual(mutable);
    }
  });

  it("keeps publication jobs a day past the parent's 7-day default", () => {
    expect(queueOptions.get(DOI_AUDIT)).not.toHaveProperty(
      "deleteAfterSeconds"
    );
    expect(queueOptions.get(DOI_AUDIT_PUBLICATION)).toEqual(
      expect.objectContaining({ deleteAfterSeconds: 8 * 24 * 60 * 60 })
    );
  });

  it("queues one job per publication carrying only its id, slug and DOI, keyed by audit and publication, and a retry queues no duplicate of a job still queued", async () => {
    const publications = [publicationRow(1), publicationRow(2)];

    await runFanOut("audit-1", publications);
    await runFanOut("audit-1", publications);

    const [first, retry] = boss.insert.mock.calls;
    expect(first![0]).toBe(DOI_AUDIT_PUBLICATION);
    expect(first![1]).toEqual([
      {
        data: {
          auditId: "audit-1",
          publication: {
            id: publications[0]!.id,
            slug: "pub-1",
            doi: "10.83972/pub-1",
          },
        },
        singletonKey: `audit-1:${publications[0]!.id}`,
      },
      {
        data: {
          auditId: "audit-1",
          publication: {
            id: publications[1]!.id,
            slug: "pub-2",
            doi: "10.83972/pub-2",
          },
        },
        singletonKey: `audit-1:${publications[1]!.id}`,
      },
    ]);
    expect(retry![1]).toEqual(first![1]);
    expect(jobs.map(({ singletonKey }) => singletonKey)).toEqual([
      `audit-1:${publications[0]!.id}`,
      `audit-1:${publications[1]!.id}`,
    ]);
  });

  it("queues nothing for an audit that covers no publications", async () => {
    await runFanOut("audit-1", []);

    expect(boss.insert).not.toHaveBeenCalled();
  });
});

describe("reading a DOI audit back from pg-boss", () => {
  const repos = {
    publications: {
      listAdministeredWithDoi: mocks.listAdministeredWithDoi,
      listAdministeredIds: mocks.listAdministeredIds,
    },
  } as unknown as Repositories;

  function startAs(ownerId: string) {
    return startDoiAuditJob(repos, { ownerId, scope: { kind: "site" } });
  }

  async function start(
    ownerId: string,
    publications: DoiAuditPublicationRow[]
  ) {
    mocks.listAdministeredWithDoi.mockResolvedValueOnce(publications);
    return startAs(ownerId);
  }

  function storedJob(id: string) {
    return jobs.find((job) => job.id === id)!;
  }

  function parentJobs() {
    return jobs.filter((job) => job.name === DOI_AUDIT);
  }

  function settle(job: StoredJob, state: JobState, output: object | null) {
    job.state = state;
    job.output = output;
    job.completedOn = new Date(job.createdOn.getTime() + 60_000);
  }

  /** Runs the fan-out for the audit and marks its parent job completed. */
  async function fanOut(auditId: string) {
    const parent = storedJob(auditId);
    await handlers.get(DOI_AUDIT)!([{ id: parent.id, data: parent.data }]);
    settle(parent, "completed", null);
  }

  function publicationJobs(auditId: string) {
    return jobs.filter(
      (job) =>
        job.name === DOI_AUDIT_PUBLICATION && job.data.auditId === auditId
    );
  }

  function resultFor(row: DoiAuditPublicationRow): DoiAuditPublicationOutcome {
    return {
      outcome: "result",
      result: {
        publicationId: row.id,
        slug: row.slug,
        canonicalDoi: row.doi!,
        versionDoi: null,
        canonical: { doi: row.doi!, found: false, matches: false, diffs: [] },
        version: null,
      },
    };
  }

  it("reports an audit as running until every publication's job settles, then completed in publication order", async () => {
    const [second, first] = [publicationRow(2), publicationRow(1)];
    const started = await start("owner", [second, first]);
    expect(started).toMatchObject({
      status: "running",
      total: 2,
      completed: 0,
      finishedAt: null,
    });

    await fanOut(started.id);
    const [secondJob, firstJob] = publicationJobs(started.id);
    settle(secondJob!, "completed", resultFor(second));

    expect(await findDoiAuditJob(started.id, "owner")).toMatchObject({
      status: "running",
      completed: 1,
      finishedAt: null,
    });

    settle(firstJob!, "completed", resultFor(first));
    const audit = await findDoiAuditJob(started.id, "owner");

    expect(audit).toMatchObject({
      status: "completed",
      total: 2,
      completed: 2,
      failures: [],
      error: null,
      startedAt: storedJob(started.id).createdOn.toISOString(),
      finishedAt: firstJob!.completedOn!.toISOString(),
      publicationIds: [second.id, first.id],
    });
    expect(audit?.results.map(({ slug }) => slug)).toEqual(["pub-1", "pub-2"]);
  });

  it("queues an audit carrying only each publication's id, slug and DOI", async () => {
    const started = await start("owner", [publication]);

    expect(storedJob(started.id).data).toEqual({
      ownerId: "owner",
      scope: "all",
      publications: [
        { id: publication.id, slug: "pub-3", doi: "10.83972/pub-3" },
      ],
    });
  });

  it("reports a publication whose retries ran out as a failure with the stored error", async () => {
    const started = await start("owner", [publication]);
    await fanOut(started.id);
    settle(publicationJobs(started.id)[0]!, "failed", {
      name: "Error",
      message: "canonical DOI: DataCite GET returned 503",
    });

    expect(await findDoiAuditJob(started.id, "owner")).toMatchObject({
      status: "completed",
      results: [],
      failures: [
        {
          publicationId: publication.id,
          slug: "pub-3",
          error: "canonical DOI: DataCite GET returned 503",
        },
      ],
    });
  });

  it("keeps an audit running while a timed-out publication job waits to retry", async () => {
    const started = await start("owner", [publication]);
    await fanOut(started.id);
    const [job] = publicationJobs(started.id);
    job!.state = "retry";
    job!.output = { value: { message: "job timed out" } };

    expect(await findDoiAuditJob(started.id, "owner")).toMatchObject({
      status: "running",
      completed: 0,
      finishedAt: null,
    });
  });

  async function startFinishedAudit(publications: DoiAuditPublicationRow[]) {
    const started = await start("owner", publications);
    await fanOut(started.id);
    const jobsOfAudit = publicationJobs(started.id);
    publications.forEach((row, i) =>
      settle(jobsOfAudit[i]!, "completed", resultFor(row))
    );
    return { started, jobsOfAudit };
  }

  function publicationRows(count: number) {
    return Array.from({ length: count }, (_, i) => publicationRow(i + 1));
  }

  it("reports an audit as failed once some of its results have expired", async () => {
    const { started, jobsOfAudit } = await startFinishedAudit(
      publicationRows(2)
    );

    deleteJob(jobsOfAudit[0]!.id);
    const audit = await findDoiAuditJob(started.id, "owner");

    expect(audit).toMatchObject({
      status: "failed",
      error: "1 of 2 publication results expired and were deleted",
      total: 2,
      completed: 1,
      finishedAt: jobsOfAudit[1]!.completedOn!.toISOString(),
    });
    expect(audit?.results.map(({ slug }) => slug)).toEqual(["pub-2"]);
  });

  it("reports an audit as failed with no results once all of them have expired", async () => {
    const { started, jobsOfAudit } = await startFinishedAudit(
      publicationRows(2)
    );

    jobsOfAudit.forEach(({ id }) => deleteJob(id));

    expect(await findDoiAuditJob(started.id, "owner")).toMatchObject({
      status: "failed",
      error: "2 of 2 publication results expired and were deleted",
      completed: 0,
      results: [],
      failures: [],
      finishedAt: storedJob(started.id).completedOn!.toISOString(),
    });
  });

  /** A finished 3-publication audit whose first `expired` results were deleted. */
  async function auditWithExpiredResults(expired: number) {
    const rows = publicationRows(3);
    const { started, jobsOfAudit } = await startFinishedAudit(rows);
    jobsOfAudit.slice(0, expired).forEach(({ id }) => deleteJob(id));
    return { rows, job: (await findDoiAuditJob(started.id, "owner"))! };
  }

  it("recounts expired results within an org admin's scope", async () => {
    const { rows, job } = await auditWithExpiredResults(2);
    mocks.listAdministeredIds.mockResolvedValueOnce([rows[1]!.id, rows[2]!.id]);

    const response = await buildDoiAuditResponse(repos, job, {
      kind: "org",
      orgs: [],
    });

    expect(response).toMatchObject({
      scope: "administered-orgs",
      status: "failed",
      error: "1 of 2 publication results expired and were deleted",
      total: 2,
      completed: 1,
    });
    expect(response.results.map(({ slug }) => slug)).toEqual(["pub-3"]);
    expect(response).not.toHaveProperty("resultsExpired");
    expect(
      await buildDoiAuditResponse(repos, job, { kind: "site" })
    ).toMatchObject({
      status: "failed",
      error: "2 of 3 publication results expired and were deleted",
    });
  });

  it("completes an org admin's audit when only results outside their scope expired", async () => {
    const { rows, job } = await auditWithExpiredResults(1);
    mocks.listAdministeredIds.mockResolvedValueOnce([rows[1]!.id, rows[2]!.id]);

    const response = await buildDoiAuditResponse(repos, job, {
      kind: "org",
      orgs: [],
    });

    expect(response).toMatchObject({
      status: "completed",
      error: null,
      total: 2,
      completed: 2,
    });
  });

  it("counts a publication re-queued after its first job finished once, by that first job", async () => {
    const started = await start("owner", [publication]);
    await fanOut(started.id);
    settle(
      publicationJobs(started.id)[0]!,
      "completed",
      resultFor(publication)
    );

    await handlers.get(DOI_AUDIT)!([
      { id: started.id, data: storedJob(started.id).data },
    ]);
    const [, duplicate] = publicationJobs(started.id);
    settle(duplicate!, "failed", { message: "should be ignored" });
    const audit = await findDoiAuditJob(started.id, "owner");

    expect(audit).toMatchObject({ status: "completed", completed: 1 });
    expect(audit?.results.map(({ publicationId }) => publicationId)).toEqual([
      publication.id,
    ]);
    expect(audit?.failures).toEqual([]);
  });

  it("reads every publication job, past one findJobs page", async () => {
    const { started } = await startFinishedAudit(publicationRows(1001));

    const audit = await findDoiAuditJob(started.id, "owner");

    expect(audit).toMatchObject({
      status: "completed",
      total: 1001,
      completed: 1001,
    });
    expect(audit?.results).toHaveLength(1001);
    expect(boss.findJobs).toHaveBeenCalledWith(
      DOI_AUDIT_PUBLICATION,
      expect.objectContaining({ after: expect.any(String) })
    );
  });

  /** Returns a first page as usual, then deletes its last job, as retention can. */
  async function deletingPageAnchor(
    ...args: Parameters<typeof findJobsInTable>
  ) {
    const page = await findJobsInTable(...args);
    deleteJob(page.at(-1)!.id);
    return page;
  }

  function publicationQueueReads() {
    return boss.findJobs.mock.calls
      .filter(([name]) => name === DOI_AUDIT_PUBLICATION)
      .map(([, { after }]) => (after === undefined ? "first page" : "next"));
  }

  it("reads again from the start when pg-boss deletes a page's last job mid-read", async () => {
    const { started } = await startFinishedAudit(publicationRows(1001));
    boss.findJobs.mockClear();
    boss.findJobs.mockImplementationOnce(deletingPageAnchor);

    const audit = await findDoiAuditJob(started.id, "owner");

    expect(publicationQueueReads()).toEqual([
      "first page",
      "next",
      "first page",
      "next",
    ]);
    expect(audit).toMatchObject({
      status: "failed",
      error: "1 of 1001 publication results expired and were deleted",
      completed: 1000,
    });
  });

  it("gives up when the anchor is deleted again on the retry", async () => {
    const { started } = await startFinishedAudit(publicationRows(1001));
    boss.findJobs
      .mockImplementationOnce(deletingPageAnchor)
      .mockImplementationOnce(findJobsInTable)
      .mockImplementationOnce(deletingPageAnchor);

    await expect(findDoiAuditJob(started.id, "owner")).rejects.toBeInstanceOf(
      AssertionError
    );
  });

  it("completes an audit that covers no publications once it's fanned out", async () => {
    const started = await start("owner", []);
    await fanOut(started.id);

    expect(await findDoiAuditJob(started.id, "owner")).toMatchObject({
      status: "completed",
      total: 0,
      completed: 0,
      finishedAt: storedJob(started.id).completedOn!.toISOString(),
    });
  });

  it("reports an audit whose publications couldn't be queued as failed", async () => {
    const started = await start("owner", [publication]);
    settle(storedJob(started.id), "failed", { message: "connection refused" });

    expect(await findDoiAuditJob(started.id, "owner")).toMatchObject({
      status: "failed",
      error: "connection refused",
      completed: 0,
    });
  });

  it.each([
    {
      state: "failed" as const,
      output: { message: "connection refused" },
      error: "connection refused",
    },
    { state: "cancelled" as const, output: null, error: "Unknown error" },
  ])(
    "keeps an audit whose parent $state after queueing running until its publication jobs settle, then reports it failed",
    async ({ state, output, error }) => {
      const [first, second] = [publicationRow(1), publicationRow(2)];
      const started = await start("owner", [first, second]);
      const parent = storedJob(started.id);
      await handlers.get(DOI_AUDIT)!([{ id: parent.id, data: parent.data }]);
      settle(parent, state, output);
      const [firstJob, secondJob] = publicationJobs(started.id);
      settle(firstJob!, "completed", resultFor(first));
      secondJob!.state = "active";

      expect(await findDoiAuditJob(started.id, "owner")).toMatchObject({
        status: "running",
        error: null,
        completed: 1,
        finishedAt: null,
      });
      expect((await start("owner", [first])).id).toBe(started.id);

      settle(secondJob!, "completed", resultFor(second));

      expect(await findDoiAuditJob(started.id, "owner")).toMatchObject({
        status: "failed",
        error,
        completed: 2,
        finishedAt: secondJob!.completedOn!.toISOString(),
      });
    }
  );

  it("hides another owner's audit", async () => {
    const started = await start("owner", [publication]);

    expect(await findDoiAuditJob(started.id, "someone-else")).toBeNull();
  });

  it("returns the owner's running audit instead of queueing another", async () => {
    const running = await start("owner", [publication]);

    const again = await start("owner", [publication]);

    expect(again.id).toBe(running.id);
    expect(parentJobs()).toHaveLength(1);
  });

  it("returns one audit to concurrent starts by the same owner, under the owner's lock", async () => {
    mocks.listAdministeredWithDoi.mockResolvedValue([publication]);

    const [first, second] = await Promise.all([
      startAs("owner"),
      startAs("owner"),
    ]);

    expect(second.id).toBe(first.id);
    expect(parentJobs()).toHaveLength(1);
    expect(lockNames).toEqual([
      "doi-audit:owner:owner",
      "doi-audit:owner:owner",
    ]);
  });

  it("returns the running audit to a start that loses the singletonKey race", async () => {
    bypassLocks = true;
    const publications = pending<DoiAuditPublicationRow[]>();
    mocks.listAdministeredWithDoi.mockReturnValue(publications.promise);

    const starts = Promise.all([startAs("owner"), startAs("owner")]);
    await vi.waitFor(() =>
      expect(mocks.listAdministeredWithDoi).toHaveBeenCalledTimes(2)
    );
    publications.settle([publication]);
    const [first, second] = await starts;

    expect(boss.send).toHaveBeenCalledTimes(2);
    expect(second.id).toBe(first.id);
    expect(parentJobs()).toHaveLength(1);
  });

  it("starts a new audit once the owner's newest has finished, ignoring other owners' running audits", async () => {
    const finished = await start("owner", []);
    await fanOut(finished.id);
    const othersRunning = await start("someone-else", [publication]);

    const next = await start("owner", [publication]);

    expect(next.id).not.toBe(finished.id);
    expect(next.id).not.toBe(othersRunning.id);
    expect(next.status).toBe("running");
  });
});
