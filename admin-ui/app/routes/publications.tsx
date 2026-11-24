import type {
  AdminPublicationListResponse,
  AdminPublicationStateFilter,
  GetAdminPublicationListQuery,
} from "@raven/backend-ts/types";
import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router";
import { ApiError, unwrap } from "~/api/api-error";
import { apiV1 } from "~/api/hono-client";
import SiteAdminOnly from "~/components/SiteAdminOnly";
import PageHeader from "~/components/stacks-ui/PageHeader";
import PublicationStatusBadge from "~/components/stacks-ui/PublicationStatusBadge";
import SearchInput from "~/components/stacks-ui/SearchInput";
import TableEmptyState from "~/components/stacks-ui/TableEmptyState";
import TablePagination from "~/components/stacks-ui/TablePagination";
import ToggleButton from "~/components/stacks-ui/ToggleButton";
import { useAuth } from "~/hooks/useAuth";
import { usePaginatedData } from "~/hooks/usePaginatedData";
import { rethrowForRoute } from "~/lib/rethrow-for-route";
import { formatDate, paginationInfo } from "~/lib/utils";
import type { Route } from "./+types/publications";

const PER_PAGE = 10;

const FILTER_PILLS: { value: AdminPublicationStateFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "removed", label: "Removed" },
];

type StateCounts = Record<AdminPublicationStateFilter, number>;

function fetchPublications(
  params: GetAdminPublicationListQuery,
  signal?: AbortSignal
) {
  return unwrap(
    apiV1.admin.publications.$get({ query: params }, { init: { signal } })
  );
}

// The endpoint has no counts field, so each pill's count is the `total` of a
// one-row page for that state.
async function fetchStateTotal(
  state: AdminPublicationStateFilter,
  q?: string,
  signal?: AbortSignal
) {
  const { pagination } = await fetchPublications(
    { page: 1, perPage: 1, state, q },
    signal
  );
  return pagination.total;
}

async function fetchStateCounts(
  q: string,
  signal?: AbortSignal
): Promise<StateCounts> {
  const [all, published, draft, removed] = await Promise.all([
    fetchStateTotal("all", q, signal),
    fetchStateTotal("published", q, signal),
    fetchStateTotal("draft", q, signal),
    fetchStateTotal("removed", q, signal),
  ]);
  return { all, published, draft, removed };
}

let loadCount = 0;

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const { signal } = request;
  try {
    const [data, published, draft, removed] = await Promise.all([
      fetchPublications({ page: 1, perPage: PER_PAGE, state: "all" }, signal),
      fetchStateTotal("published", undefined, signal),
      fetchStateTotal("draft", undefined, signal),
      fetchStateTotal("removed", undefined, signal),
    ]);
    const counts: StateCounts = {
      all: data.pagination.total,
      published,
      draft,
      removed,
    };
    return {
      forbidden: false as const,
      data,
      counts,
      loadId: ++loadCount,
    };
  } catch (e) {
    // Returned rather than thrown so the layout still renders and its auth
    // guard can redirect a signed-out visitor to /login.
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      return { forbidden: true as const };
    }
    rethrowForRoute(e);
  }
}

export default function Publications({ loaderData }: Route.ComponentProps) {
  if (loaderData.forbidden) {
    return (
      <div className="p-8">
        <SiteAdminOnly />
      </div>
    );
  }

  // usePaginatedData only reads `initial` on mount, so remount on each load to
  // keep the table in step with the counts a revalidation brings.
  return (
    <PublicationsTable
      key={loaderData.loadId}
      initial={loaderData.data}
      counts={loaderData.counts}
    />
  );
}

function PublicationsTable({
  initial,
  counts: initialCounts,
}: {
  initial: AdminPublicationListResponse;
  counts: StateCounts;
}) {
  const { user } = useAuth();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AdminPublicationStateFilter>("all");
  const [searchCounts, setSearchCounts] = useState<{
    q: string;
    counts: StateCounts;
  } | null>(null);
  const { data, page, setPage, loading, error } = usePaginatedData(
    apiV1.admin.publications,
    { query: { state: filter, q: search || undefined } },
    PER_PAGE,
    initial
  );

  // Debounce free-text search.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, setPage]);

  useEffect(() => {
    if (!search) return;
    const controller = new AbortController();
    void fetchStateCounts(search, controller.signal)
      .then((counts) => setSearchCounts({ q: search, counts }))
      .catch(() => {
        // The table fetch surfaces request errors; the pills keep the
        // unfiltered counts.
      });
    return () => controller.abort();
  }, [search]);

  function handleFilterChange(value: AdminPublicationStateFilter) {
    setFilter(value);
    setPage(1);
  }

  const counts =
    search && searchCounts?.q === search ? searchCounts.counts : initialCounts;
  const { pagination, items: publications } = data;
  const { totalPages, rangeStart, rangeEnd } = paginationInfo(
    pagination.page,
    pagination.perPage,
    pagination.total
  );
  const scopeLabel =
    user?.state === "SITE_ADMIN" ? "all organizations" : "your organizations";

  return (
    <div className="p-8">
      <PageHeader>
        <PageHeader.Title
          title="Publications"
          subtitle={`${initialCounts.all} publications across ${scopeLabel}`}
        />
      </PageHeader>

      <div className="mb-4 flex items-center justify-between gap-4">
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Filter by title or slug..."
          label="Search publications"
        />

        <div className="inline-flex shrink-0 rounded-full bg-gray-200 p-1 font-mono">
          {FILTER_PILLS.map(({ value, label }) => (
            <ToggleButton
              key={value}
              active={filter === value}
              onClick={() => handleFilterChange(value)}
              count={counts[value]}
            >
              {label}
            </ToggleButton>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto overflow-y-hidden rounded-lg border border-carbon-100 bg-white">
        <table className="w-full min-w-[960px]">
          <thead>
            <tr className="border-b border-carbon-100 bg-warm-sand-100">
              <th className="text-caption-20 px-4 py-3 text-left font-normal uppercase tracking-widest text-carbon-400">
                Title
              </th>
              <th className="text-caption-20 px-4 py-3 text-left font-normal uppercase tracking-widest text-carbon-400">
                Organizations
              </th>
              <th className="text-caption-20 px-4 py-3 text-left font-normal uppercase tracking-widest text-carbon-400">
                Slug
              </th>
              <th className="text-caption-20 px-4 py-3 text-center font-normal uppercase tracking-widest text-carbon-400">
                Latest Version
              </th>
              <th className="text-caption-20 px-4 py-3 text-center font-normal uppercase tracking-widest text-carbon-400">
                Date
              </th>
              <th className="text-caption-20 px-4 py-3 text-center font-normal uppercase tracking-widest text-carbon-400">
                Status
              </th>
            </tr>
          </thead>
          <tbody className={loading ? "opacity-50" : ""}>
            {error ? (
              <tr>
                <td
                  colSpan={6}
                  className="text-body-20 px-4 py-8 text-center text-carbon-400"
                >
                  {error}
                </td>
              </tr>
            ) : publications.length === 0 ? (
              <TableEmptyState colSpan={6} label="publications" />
            ) : (
              publications.map((pub) => (
                <tr
                  key={pub.id}
                  className="border-b border-carbon-100 transition-colors last:border-0 hover:bg-warm-sand-100"
                >
                  <td className="px-4 py-3">
                    <Link
                      to={`/publications/${pub.slug}`}
                      className="text-body-20 line-clamp-2 font-medium text-foreground hover:underline"
                    >
                      {pub.title || "Untitled"}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {pub.orgs.length === 0 ? (
                      <span className="text-body-20 text-carbon-300">—</span>
                    ) : (
                      <span className="text-body-20">
                        {pub.orgs.map((org, i) => (
                          <Fragment key={org.orgId}>
                            {i > 0 && ", "}
                            <Link
                              to={`/orgs/${org.slug}`}
                              className="text-foreground hover:underline"
                            >
                              {org.name}
                            </Link>
                          </Fragment>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-caption-20 line-clamp-2 font-mono text-carbon-400">
                      {pub.slug}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-body-20 text-carbon-400">
                      {pub.versionNumber == null
                        ? "—"
                        : `v${pub.versionNumber}`}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-body-20 whitespace-nowrap text-carbon-400">
                      {formatDate(pub.createdAt, "MMM D, YYYY")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <PublicationStatusBadge state={pub.state} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {!error && (
            <tfoot>
              <TablePagination
                total={pagination.total}
                page={page}
                totalPages={totalPages}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                label="publications"
                onPrev={() => setPage((p) => p - 1)}
                onNext={() => setPage((p) => p + 1)}
              />
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
