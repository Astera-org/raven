import type {
  AdminUserListItemResponse,
  AdminUserListResponse,
  AdminUserStatsResponse,
  GetAdminUserListQuery,
} from "@raven/backend-ts/types";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ApiError, unwrap } from "~/api/api-error";
import { apiV1 } from "~/api/hono-client";
import SiteAdminOnly from "~/components/SiteAdminOnly";
import Badge from "~/components/stacks-ui/Badge";
import PageHeader from "~/components/stacks-ui/PageHeader";
import SearchInput from "~/components/stacks-ui/SearchInput";
import TableEmptyState from "~/components/stacks-ui/TableEmptyState";
import TablePagination from "~/components/stacks-ui/TablePagination";
import ToggleButton from "~/components/stacks-ui/ToggleButton";
import UserDisplay from "~/components/stacks-ui/UserDisplay";
import { usePaginatedData } from "~/hooks/usePaginatedData";
import { ROLE_LABELS } from "~/lib/constants";
import { rethrowForRoute } from "~/lib/rethrow-for-route";
import {
  formatDate,
  formatState,
  paginationInfo,
  relativeTimeFromNow,
} from "~/lib/utils";
import type { Route } from "./+types/users";

const PER_PAGE = 10;

type StateFilter = "ALL" | NonNullable<GetAdminUserListQuery["state"]>;

const FILTER_PILLS: {
  value: StateFilter;
  label: string;
  countKey: keyof AdminUserStatsResponse;
}[] = [
  { value: "ALL", label: "All", countKey: "totalUsers" },
  { value: "SITE_ADMIN", label: "Site Admins", countKey: "totalSiteAdmins" },
  { value: "DELETED", label: "Deleted", countKey: "totalDeleted" },
];

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  try {
    const data = await unwrap(
      apiV1.admin.users.$get(
        { query: { page: 1, perPage: PER_PAGE } },
        { init: { signal: request.signal } }
      )
    );
    return { forbidden: false as const, data };
  } catch (e) {
    // Returned rather than thrown so the layout still renders and its auth
    // guard can redirect a signed-out visitor to /login.
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      return { forbidden: true as const };
    }
    rethrowForRoute(e);
  }
}

function StatusBadge({ state }: { state: AdminUserListItemResponse["state"] }) {
  if (state === "SITE_ADMIN") return <Badge variant="info">Site Admin</Badge>;
  if (state === "ACTIVE") return <Badge variant="success">Active</Badge>;
  if (state === "DELETED") return <Badge variant="neutral">Deleted</Badge>;
  return <Badge variant="neutral">{formatState(state)}</Badge>;
}

export default function Users({ loaderData }: Route.ComponentProps) {
  if (loaderData.forbidden) {
    return (
      <div className="p-8">
        <SiteAdminOnly />
      </div>
    );
  }

  return <UsersTable initial={loaderData.data} />;
}

function UsersTable({ initial }: { initial: AdminUserListResponse }) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StateFilter>("ALL");
  const { data, page, setPage, loading, error } = usePaginatedData(
    apiV1.admin.users,
    {
      query: {
        state: filter === "ALL" ? undefined : filter,
        q: search || undefined,
      },
    },
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

  function handleFilterChange(value: StateFilter) {
    setFilter(value);
    setPage(1);
  }

  const { pagination, stats, items: users } = data;
  const { totalPages, rangeStart, rangeEnd } = paginationInfo(
    pagination.page,
    pagination.perPage,
    pagination.total
  );

  return (
    <div className="p-8">
      <PageHeader>
        <PageHeader.Title
          title="Users"
          subtitle={`${stats.totalUsers} users · ${stats.totalSiteAdmins} site admins · ${stats.totalDeleted} deleted`}
        />
      </PageHeader>

      <div className="mb-4 flex items-center justify-between gap-4">
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search by name, username, or email"
          label="Search users"
        />

        <div className="inline-flex shrink-0 rounded-full bg-gray-200 p-1">
          {FILTER_PILLS.map(({ value, label, countKey }) => (
            <ToggleButton
              key={value}
              active={filter === value}
              onClick={() => handleFilterChange(value)}
              count={stats[countKey]}
            >
              {label}
            </ToggleButton>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto overflow-y-hidden rounded-lg border border-carbon-100 bg-white">
        <table className="w-full min-w-[840px]">
          <thead>
            <tr className="border-b border-carbon-100 bg-warm-sand-100">
              <th className="text-caption-20 px-4 py-3 text-left font-normal uppercase tracking-widest text-carbon-400">
                User
              </th>
              <th className="text-caption-20 px-4 py-3 text-left font-normal uppercase tracking-widest text-carbon-400">
                Organization
              </th>
              <th className="text-caption-20 px-4 py-3 text-center font-normal uppercase tracking-widest text-carbon-400">
                Role
              </th>
              <th className="text-caption-20 px-4 py-3 text-center font-normal uppercase tracking-widest text-carbon-400">
                Status
              </th>
              <th className="text-caption-20 px-4 py-3 text-center font-normal uppercase tracking-widest text-carbon-400">
                Last Active
              </th>
            </tr>
          </thead>
          <tbody className={loading ? "opacity-50" : ""}>
            {error ? (
              <tr>
                <td
                  colSpan={5}
                  className="text-body-20 px-4 py-8 text-center text-carbon-400"
                >
                  {error}
                </td>
              </tr>
            ) : users.length === 0 ? (
              <TableEmptyState colSpan={5} label="users" />
            ) : (
              users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-carbon-100 transition-colors last:border-0 hover:bg-warm-sand-100"
                >
                  <td className="px-4 py-3">
                    <Link to={`/users/${user.id}`} className="group block">
                      <UserDisplay user={user} showEmail />
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {user.organization ? (
                      <Link
                        to={`/orgs/${user.organization.slug}`}
                        className="text-body-20 text-foreground hover:underline"
                      >
                        {user.organization.name}
                      </Link>
                    ) : (
                      <span className="text-body-20 text-carbon-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {user.organization ? (
                      <Badge
                        variant={
                          user.organization.isAdmin ? "primary" : "neutral"
                        }
                      >
                        {user.organization.isAdmin
                          ? ROLE_LABELS["ADMIN"]
                          : ROLE_LABELS["MEMBER"]}
                      </Badge>
                    ) : (
                      <span className="text-body-20 text-carbon-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge state={user.state} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className="text-body-20 text-carbon-400"
                      title={
                        user.loginAt ? formatDate(user.loginAt) : undefined
                      }
                    >
                      {user.loginAt
                        ? relativeTimeFromNow(user.loginAt)
                        : "Never"}
                    </span>
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
                label="users"
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
