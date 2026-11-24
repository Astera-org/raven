import type {
  AdminDoiAuditResponse,
  AdminDoiAuditResult,
  DoiComparisonSummary,
  DoiComparisonType,
} from "@raven/backend-ts/types";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { firstErrorMessage, safe, unwrap } from "~/api/api-error";
import { apiV1 } from "~/api/hono-client";
import Badge from "~/components/stacks-ui/Badge";
import Button from "~/components/stacks-ui/Button";
import PageHeader from "~/components/stacks-ui/PageHeader";
import TableEmptyState from "~/components/stacks-ui/TableEmptyState";
import ToggleButton from "~/components/stacks-ui/ToggleButton";
import { useAuth } from "~/hooks/useAuth";
import { cn, formatUtcDateTime } from "~/lib/utils";

export function clientLoader() {
  return null;
}

// A full run makes up to two DataCite calls per publication, batched five at
// a time server-side -- polling this often stays responsive without being
// wasteful.
const POLL_INTERVAL_MS = 1500;

// Module-level (not component state) so a run survives navigating to a
// pub's detail page and back -- react-query's cache already survives that
// (it lives in the root QueryClient), but the component's own `useState`
// would otherwise forget which jobId to look up and force a re-run.
let lastJobId: string | null = null;
let lastActiveTab: DoiComparisonType = "canonical";

const TAB_LABELS: Record<DoiComparisonType, string> = {
  canonical: "Canonical DOIs",
  version: "Version DOIs",
};

// The backend runs the exact same diff (ComparableMetadata in
// api-v1/routes/admin/doi-audits/helpers/to-comparable.ts) for both
// canonical and version DOIs -- same fields, no branching by type -- so the
// "fields checked" copy below is identical for both cards.
const FIELDS_CHECKED_LABELS = [
  "title",
  "subtitle",
  "abstract",
  "publisher",
  "publication year",
  "URL",
  "version",
  "language",
  "resource type",
  "subjects",
  "rights",
  "creators",
  "contributors",
  "dates",
  "related identifiers (references, supplements, and version links)",
];
const FIELDS_CHECKED = `Fields checked: ${new Intl.ListFormat("en", { type: "conjunction" }).format(FIELDS_CHECKED_LABELS)}.`;
const FIELDS_CHECKED_COUNT = FIELDS_CHECKED_LABELS.length;

type DoiAuditScope = AdminDoiAuditResponse["scope"];

const SCOPE_LABELS: Record<DoiAuditScope, string> = {
  all: "all organizations",
  "administered-orgs": "organizations you administer",
};

const CARD_COPY: Record<
  DoiComparisonType,
  {
    heading: string;
    description: string;
    unitLabel: string;
    fieldCount: number;
  }
> = {
  canonical: {
    heading: "Compare canonical DOI metadata",
    description: `Compares each publication's canonical (concept) DOI record on The Stacks against DataCite. ${FIELDS_CHECKED}`,
    unitLabel: "canonical DOIs",
    fieldCount: FIELDS_CHECKED_COUNT,
  },
  version: {
    heading: "Compare version DOI metadata",
    description: `Compares each publication's latest published version's DOI record on The Stacks against DataCite. ${FIELDS_CHECKED}`,
    unitLabel: "version DOIs",
    fieldCount: FIELDS_CHECKED_COUNT,
  },
};

function statusLine(
  job: AdminDoiAuditResponse | undefined,
  tab: DoiComparisonType
): string {
  const label = TAB_LABELS[tab];
  if (!job) return `${label} · not yet compared in this session`;
  if (job.status === "running") return `${label} · Comparing now…`;
  if (job.status === "failed") return `${label} · Last run failed`;
  return `${label} · Last full run ${formatUtcDateTime(job.finishedAt!)}`;
}

// An AdminDoiAuditResult carries both a canonical and a version comparison --
// these pick out whichever one the active tab cares about, so callers don't
// each re-derive the same branch.
function comparisonFor(
  result: AdminDoiAuditResult,
  type: DoiComparisonType
): DoiComparisonSummary | null {
  return type === "canonical" ? result.canonical : result.version;
}

function doiFor(
  result: AdminDoiAuditResult,
  type: DoiComparisonType
): string | null {
  return type === "canonical" ? result.canonicalDoi : result.versionDoi;
}

interface TabSummary {
  total: number;
  matches: number;
  discrepancies: number;
}

function summarize(
  job: AdminDoiAuditResponse | undefined,
  type: DoiComparisonType
): TabSummary {
  const summary: TabSummary = { total: 0, matches: 0, discrepancies: 0 };
  if (!job) return summary;
  for (const result of job.results) {
    const comparison = comparisonFor(result, type);
    if (!comparison) continue;
    summary.total += 1;
    // found:false always implies matches:false, so this one check covers
    // both "metadata differs" and "DataCite has no record at all" -- both
    // are discrepancies worth surfacing.
    if (comparison.matches) summary.matches += 1;
    else summary.discrepancies += 1;
  }
  return summary;
}

interface DiscrepancyRow extends Pick<
  AdminDoiAuditResult,
  "publicationId" | "slug"
> {
  doi: string;
  comparison: DoiComparisonSummary;
}

function discrepancyRows(
  job: AdminDoiAuditResponse | undefined,
  type: DoiComparisonType
): DiscrepancyRow[] {
  if (!job) return [];
  const rows: DiscrepancyRow[] = [];
  for (const result of job.results) {
    const comparison = comparisonFor(result, type);
    if (!comparison || comparison.matches) continue;
    const doi = doiFor(result, type);
    if (!doi) continue;
    rows.push({
      publicationId: result.publicationId,
      slug: result.slug,
      doi,
      comparison,
    });
  }
  return rows;
}

function StatCard({
  label,
  value,
  unit,
  valueClassName,
}: {
  label: string;
  value: number;
  unit: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-carbon-100 bg-white p-4">
      <p className="text-caption-20 mb-2 font-mono uppercase tracking-widest text-carbon-400">
        {label}
      </p>
      <p
        className={cn(
          "font-serif text-headline-20 text-foreground",
          valueClassName
        )}
      >
        {value.toLocaleString()}
      </p>
      <p className="text-caption-20 mt-1 font-mono text-carbon-300">{unit}</p>
    </div>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
      <div
        className="h-full rounded-full bg-gray-blue-900 transition-[width] duration-300 ease-out"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function ComparisonCard({
  type,
  job,
  scope,
  isRunning,
  onRun,
}: {
  type: DoiComparisonType;
  job: AdminDoiAuditResponse | undefined;
  scope: DoiAuditScope;
  isRunning: boolean;
  onRun: () => void;
}) {
  const copy = CARD_COPY[type];
  // We only know a real scope count once a job has told us -- job.total for
  // canonical (exactly the publications it selected), and the count of
  // results carrying a version comparison for version. Nothing is fetched
  // just to populate this number before a first run.
  const scopeCount = job
    ? type === "canonical"
      ? job.total
      : job.results.filter((r) => r.version !== null).length
    : null;

  const buttonLabel = isRunning
    ? "Running…"
    : job
      ? "Run again"
      : "Run comparison";

  const scopeLine = [
    `Scope: ${SCOPE_LABELS[scope]}`,
    scopeCount !== null
      ? `${scopeCount.toLocaleString()} ${copy.unitLabel}`
      : null,
    `${copy.fieldCount} fields compared`,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

  return (
    <div className="mb-8 flex items-center justify-between gap-6 rounded-lg border border-carbon-100 bg-white p-6">
      <div>
        <h2 className="font-serif text-headline-10 mb-2 text-foreground">
          {copy.heading}
        </h2>
        <p className="text-body-20 mb-2 max-w-2xl text-carbon-400">
          {copy.description}
        </p>
        <p className="text-caption-20 font-mono text-carbon-300">{scopeLine}</p>
      </div>
      <Button onClick={onRun} disabled={isRunning} className="shrink-0">
        {buttonLabel}
      </Button>
    </div>
  );
}

export default function DoiAudit() {
  const [activeTab, setActiveTabState] =
    useState<DoiComparisonType>(lastActiveTab);
  const [jobId, setJobIdState] = useState<string | null>(lastJobId);
  const [starting, setStarting] = useState(false);
  const { user } = useAuth();

  function setActiveTab(tab: DoiComparisonType) {
    lastActiveTab = tab;
    setActiveTabState(tab);
  }

  function setJobId(id: string | null) {
    lastJobId = id;
    setJobIdState(id);
  }

  const { data: job } = useQuery({
    queryKey: ["doiAuditJob", jobId],
    queryFn: ({ signal }) =>
      unwrap(
        apiV1.admin["doi-audits"][":jobId"].$get(
          { param: { jobId: jobId! } },
          { init: { signal } }
        )
      ),
    enabled: jobId !== null,
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? POLL_INTERVAL_MS : false,
  });

  const isRunning = starting || job?.status === "running";
  // Before any run, predict the scope the backend will apply from the
  // caller's role; once a job exists, its reported scope is authoritative.
  const scope: DoiAuditScope =
    job?.scope ?? (user?.state === "SITE_ADMIN" ? "all" : "administered-orgs");
  const percent =
    job && job.total > 0 ? Math.round((job.completed / job.total) * 100) : 0;

  const canonicalSummary = useMemo(() => summarize(job, "canonical"), [job]);
  const versionSummary = useMemo(() => summarize(job, "version"), [job]);
  const activeSummary =
    activeTab === "canonical" ? canonicalSummary : versionSummary;
  const rows = useMemo(() => discrepancyRows(job, activeTab), [job, activeTab]);

  async function handleRun() {
    setStarting(true);
    const r = await safe(apiV1.admin["doi-audits"].$post());
    setStarting(false);
    if (!r.ok) {
      toast.error(
        firstErrorMessage(r.error, "Failed to start the comparison.")
      );
      return;
    }
    setJobId(r.data.id);
  }

  return (
    <div className="p-8">
      <PageHeader className="mb-2">
        <PageHeader.Title title="DOI Metadata Check" />
      </PageHeader>

      <p className="text-caption-20 mb-4 font-mono text-carbon-400">
        {statusLine(job, activeTab)}
      </p>

      <div className="mb-4 inline-flex rounded-full bg-gray-200 p-1">
        <ToggleButton
          active={activeTab === "canonical"}
          onClick={() => setActiveTab("canonical")}
          count={job ? canonicalSummary.discrepancies : undefined}
        >
          Canonical DOIs
        </ToggleButton>
        <ToggleButton
          active={activeTab === "version"}
          onClick={() => setActiveTab("version")}
          count={job ? versionSummary.discrepancies : undefined}
        >
          Version DOIs
        </ToggleButton>
      </div>

      <ComparisonCard
        type={activeTab}
        job={job}
        scope={scope}
        isRunning={isRunning}
        onRun={handleRun}
      />

      {job && (
        <div className="mb-8">
          {job.status === "running" && (
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-body-20 text-carbon-400">
                  {job.total > 0
                    ? `Checked ${job.completed} of ${job.total} publications`
                    : "Starting…"}
                </span>
                <span className="text-body-20 font-medium text-foreground">
                  {percent}%
                </span>
              </div>
              <ProgressBar percent={percent} />
            </div>
          )}

          {job.status === "failed" && (
            <p className="text-body-20 mb-4 text-error-900">
              Comparison failed: {job.error ?? "Unknown error"}
            </p>
          )}

          {job.status === "completed" && job.failures.length > 0 && (
            <p className="text-body-20 mb-4 text-carbon-400">
              {job.failures.length} publication
              {job.failures.length === 1 ? "" : "s"} could not be checked.
            </p>
          )}

          <div className="grid grid-cols-3 gap-4">
            <StatCard
              label="Total Checked"
              value={activeSummary.total}
              unit={CARD_COPY[activeTab].unitLabel}
            />
            <StatCard
              label="Equivalent"
              value={activeSummary.matches}
              unit="records match DataCite"
              valueClassName="text-mint-green-dark"
            />
            <StatCard
              label="Discrepancies"
              value={activeSummary.discrepancies}
              unit="records need review"
              valueClassName="text-error-900"
            />
          </div>
        </div>
      )}

      {job && (
        <div className="overflow-x-auto overflow-y-hidden rounded-lg border border-carbon-100 bg-white">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-carbon-100 bg-warm-sand-100">
                <th className="text-caption-20 px-4 py-3 text-left font-normal uppercase tracking-widest text-carbon-400">
                  Publication
                </th>
                <th className="text-caption-20 px-4 py-3 text-left font-normal uppercase tracking-widest text-carbon-400">
                  DOI
                </th>
                <th className="text-caption-20 px-4 py-3 text-left font-normal uppercase tracking-widest text-carbon-400">
                  Fields
                </th>
                <th className="text-caption-20 px-4 py-3 text-center font-normal uppercase tracking-widest text-carbon-400">
                  Diffs
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <TableEmptyState colSpan={4} label="discrepancies" />
              ) : (
                rows.map((row) => {
                  const href = `/doi-audit/compare/${activeTab}/${encodeURIComponent(row.doi)}`;
                  return (
                    <tr
                      key={row.publicationId}
                      className="border-b border-carbon-100 transition-colors last:border-0 hover:bg-warm-sand-100"
                    >
                      <td className="p-0">
                        <Link
                          to={href}
                          className="text-body-20 block px-4 py-3 font-medium text-foreground"
                        >
                          {row.slug}
                        </Link>
                      </td>
                      <td className="p-0">
                        <Link
                          to={href}
                          tabIndex={-1}
                          className="text-caption-20 block px-4 py-3 font-mono text-carbon-400"
                        >
                          {row.doi}
                        </Link>
                      </td>
                      <td className="p-0">
                        <Link
                          to={href}
                          tabIndex={-1}
                          className="text-body-20 block px-4 py-3 text-carbon-400"
                        >
                          {row.comparison.found
                            ? row.comparison.diffs
                                .map((d) => d.field)
                                .join(", ")
                            : "—"}
                        </Link>
                      </td>
                      <td className="p-0">
                        <Link
                          to={href}
                          tabIndex={-1}
                          className="block px-4 py-3 text-center"
                        >
                          {row.comparison.found ? (
                            <Badge variant="error">
                              {row.comparison.diffs.length}
                            </Badge>
                          ) : (
                            <Badge variant="error">Not found</Badge>
                          )}
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
