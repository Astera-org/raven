import type {
  AdminPublicationListResponse,
  AdminUserCommentResponse,
  AdminUserOrgResponse,
  AdminUserResponse,
} from "@raven/backend-ts/types";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ApiError, unwrap } from "~/api/api-error";
import { apiV1 } from "~/api/hono-client";
import EditUserPanel from "~/components/EditUserPanel";
import SiteAdminOnly from "~/components/SiteAdminOnly";
import Avatar from "~/components/stacks-ui/Avatar";
import Badge from "~/components/stacks-ui/Badge";
import DataTableHeader from "~/components/stacks-ui/DataTableHeader";
import DataTableRow from "~/components/stacks-ui/DataTableRow";
import PublicationStatusBadge from "~/components/stacks-ui/PublicationStatusBadge";
import TabBar from "~/components/stacks-ui/TabBar";
import TableEmptyState from "~/components/stacks-ui/TableEmptyState";
import TableErrorState from "~/components/stacks-ui/TableErrorState";
import TablePagination, {
  type TablePaginationProps,
} from "~/components/stacks-ui/TablePagination";
import { usePaginatedData } from "~/hooks/usePaginatedData";
import { ROLE_LABELS } from "~/lib/constants";
import { rethrowForRoute } from "~/lib/rethrow-for-route";
import { formatDate, formatState, paginationInfo } from "~/lib/utils";
import type { Route } from "./+types/users.$id";

// ---------- constants ----------

// The organizations table isn't paged, so it loads the largest page the API
// allows.
const ORGS_PER_PAGE = 100;
const PUBS_PER_PAGE = 5;
const COMMENTS_PER_PAGE = 5;

// ---------- loader ----------

let loadCount = 0;

export async function clientLoader({
  params,
  request,
}: Route.ClientLoaderArgs) {
  const user = apiV1.admin.users[":id"];
  const param = { id: params.id };
  const opts = { init: { signal: request.signal } };

  try {
    const [profile, orgs, publications, comments] = await Promise.all([
      unwrap(user.$get({ param }, opts)),
      unwrap(
        user.orgs.$get({ param, query: { perPage: ORGS_PER_PAGE } }, opts)
      ),
      unwrap(
        user.publications.$get(
          { param, query: { page: 1, perPage: PUBS_PER_PAGE } },
          opts
        )
      ),
      unwrap(
        user.comments.$get(
          { param, query: { page: 1, perPage: COMMENTS_PER_PAGE } },
          opts
        )
      ),
    ]);
    return {
      forbidden: false as const,
      user: profile,
      orgs: orgs.items,
      publications,
      comments,
      loadId: ++loadCount,
    };
  } catch (e) {
    // A pre-ULID integer id fails validation with a 422, so it's treated as
    // not found too. An aborted navigation keeps the status of the response
    // it cut off, so it's rethrown as is rather than mapped.
    if (e instanceof ApiError && e.kind !== "aborted") {
      if (e.isNotFound || e.status === 422) {
        throw new Response("Not found", { status: 404 });
      }
      if (e.status === 401 || e.status === 403) {
        return { forbidden: true as const };
      }
    }
    rethrowForRoute(e);
  }
}

// ---------- sub-components ----------

// -- UserHeader --

function UserHeader({
  user,
  onEdit,
  onResetPassword,
}: {
  user: AdminUserResponse;
  onEdit: () => void;
  onResetPassword: () => void;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Avatar
            src={user.avatar}
            alt={`${user.firstName} ${user.lastName}`}
            className="relative z-0 size-16 shrink-0"
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-headline-40 text-foreground">
                {user.firstName} {user.lastName}
              </h1>
              {user.state === "ACTIVE" ? (
                <Badge variant="success">Active</Badge>
              ) : user.state === "SITE_ADMIN" ? (
                <Badge variant="info">Site Admin</Badge>
              ) : (
                <Badge variant="neutral">{formatState(user.state)}</Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-caption-20 font-mono text-carbon-400">
                @{user.username}
                {user.email ? ` · ${user.email}` : ""}
                {user.orcid ? ` · ORCID ${user.orcid}` : ""}
              </p>
              {user.emailVerified ? (
                <Badge variant="success">Email verified</Badge>
              ) : (
                <Badge variant="warning">Email unverified</Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="text-body-20 rounded-full border border-carbon-200 px-4 py-1.5 text-carbon-400 transition-colors hover:border-carbon-300 hover:text-foreground"
          >
            Edit user
          </button>
          <button
            type="button"
            onClick={onResetPassword}
            className="text-body-20 rounded-full border border-carbon-200 px-4 py-1.5 text-carbon-400 transition-colors hover:border-carbon-300 hover:text-foreground"
          >
            Reset password
          </button>
        </div>
      </div>
    </div>
  );
}

// -- OrgAffiliationsTable --

function OrgAffiliationsTable({ items }: { items: AdminUserOrgResponse[] }) {
  const colCount = 3;
  return (
    <table className="w-full bg-white min-w-[420px]">
      <thead>
        <tr className="border-b border-carbon-100">
          <th
            scope="colgroup"
            colSpan={colCount}
            className="px-4 py-3 text-left"
          >
            <span className="text-body-20 font-bold text-foreground">
              Organizations and Roles
            </span>
          </th>
        </tr>
        <tr className="border-b font-mono border-carbon-100">
          <DataTableHeader>Organization</DataTableHeader>
          <DataTableHeader>Role</DataTableHeader>
          <DataTableHeader>Since</DataTableHeader>
        </tr>
      </thead>
      <tbody>
        {items.length === 0 ? (
          <TableEmptyState colSpan={colCount} label="organizations" />
        ) : (
          items.map((org) => (
            <DataTableRow key={org.orgId} className="h-12">
              <td className="px-4 py-2 align-top">
                <Link
                  to={`/orgs/${org.slug}`}
                  className="text-body-20 font-medium text-foreground hover:underline"
                >
                  {org.name}
                </Link>
              </td>
              <td className="px-4 py-2 align-top text-left">
                <Badge variant={org.isAdmin ? "primary" : "neutral"}>
                  {org.isAdmin ? ROLE_LABELS["ADMIN"] : ROLE_LABELS["MEMBER"]}
                </Badge>
              </td>
              <td className="px-4 py-2 align-top text-left">
                <span className="text-body-20 text-carbon-400">
                  {org.startAt ? formatDate(org.startAt, "MMM D, YYYY") : "—"}
                </span>
              </td>
            </DataTableRow>
          ))
        )}
      </tbody>
    </table>
  );
}

// -- PublicationsTable --

function PublicationsTable({
  items,
  loading,
  error,
  pagination,
}: {
  items: AdminPublicationListResponse["items"];
  loading: boolean;
  error: string | null;
  pagination: TablePaginationProps;
}) {
  const colCount = 2;
  return (
    <table className="w-full bg-white min-w-[420px]">
      <tbody className={loading ? "opacity-50" : ""}>
        {error ? (
          <TableErrorState colSpan={colCount} message={error} />
        ) : items.length === 0 ? (
          <TableEmptyState colSpan={colCount} label="publications" />
        ) : (
          items.map((pub) => (
            <DataTableRow key={pub.id} className="h-14">
              <td className="px-4 py-4 align-top">
                <Link
                  to={`/publications/${pub.slug}`}
                  className="text-body-20 line-clamp-3 overflow-hidden font-medium text-foreground hover:underline"
                >
                  {pub.title ?? "Untitled publication"}
                </Link>
              </td>
              <td className="px-4 py-4 align-top text-center">
                <PublicationStatusBadge state={pub.state} />
              </td>
            </DataTableRow>
          ))
        )}
      </tbody>
      <tfoot>
        <TablePagination {...pagination} />
      </tfoot>
    </table>
  );
}

// -- CommentsTable --

function CommentsTable({
  items,
  loading,
  error,
  pagination,
}: {
  items: AdminUserCommentResponse[];
  loading: boolean;
  error: string | null;
  pagination: TablePaginationProps;
}) {
  const colCount = 1;
  return (
    <table className="w-full bg-white min-w-[420px]">
      <tbody className={loading ? "opacity-50" : ""}>
        {error ? (
          <TableErrorState colSpan={colCount} message={error} />
        ) : items.length === 0 ? (
          <TableEmptyState colSpan={colCount} label="comments" />
        ) : (
          items.map((comment) => (
            <DataTableRow key={comment.id}>
              <td className="px-4 py-4 align-top">
                <p className="text-body-20 line-clamp-3 h-[3.675rem] overflow-hidden font-medium text-foreground">
                  {comment.body}
                </p>
                <Link
                  to={`/publications/${comment.publication.slug}`}
                  className="text-caption-20 mt-1 line-clamp-1 overflow-hidden font-mono text-carbon-400 hover:underline"
                >
                  {comment.publication.title ?? comment.publication.slug}
                </Link>
              </td>
            </DataTableRow>
          ))
        )}
      </tbody>
      <tfoot>
        <TablePagination {...pagination} />
      </tfoot>
    </table>
  );
}

// ---------- main component ----------

type UserDetailLoaderData = Extract<
  Route.ComponentProps["loaderData"],
  { forbidden: false }
>;

export default function UserDetail({ loaderData }: Route.ComponentProps) {
  if (loaderData.forbidden) {
    return (
      <div className="p-8">
        <SiteAdminOnly />
      </div>
    );
  }

  // usePaginatedData only reads `initial` on mount, so remount on each load;
  // another user and a reload of the same one both start from the loader's
  // data.
  return <UserDetailContent key={loaderData.loadId} loaderData={loaderData} />;
}

function UserDetailContent({
  loaderData,
}: {
  loaderData: UserDetailLoaderData;
}) {
  const {
    orgs,
    publications: initialPubs,
    comments: initialComments,
  } = loaderData;
  // Edits update this copy rather than revalidating, since a reload bumps
  // `loadId` and remounts the page, resetting the tab and pagination.
  const [user, setUser] = useState(loaderData.user);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"publications" | "comments">(
    "publications"
  );

  const pubs = usePaginatedData(
    apiV1.admin.users[":id"].publications,
    { param: { id: user.id } },
    PUBS_PER_PAGE,
    initialPubs
  );

  const comments = usePaginatedData(
    apiV1.admin.users[":id"].comments,
    { param: { id: user.id } },
    COMMENTS_PER_PAGE,
    initialComments
  );

  function handleResetPassword() {
    // Not implemented yet — see ticket. This is a pure UI stub; no backend
    // call is wired up.
    toast.success("Reset password isn't implemented yet.");
  }

  const pubsPag = paginationInfo(
    pubs.page,
    PUBS_PER_PAGE,
    pubs.data.pagination.total
  );

  const commentsPag = paginationInfo(
    comments.page,
    COMMENTS_PER_PAGE,
    comments.data.pagination.total
  );

  return (
    <div className="p-8">
      <Link
        to="/users"
        className="text-body-20 font-mono mb-6 inline-block text-carbon-400 transition-colors hover:text-foreground"
      >
        ‹ Back to users
      </Link>

      <UserHeader
        user={user}
        onEdit={() => setIsEditOpen(true)}
        onResetPassword={handleResetPassword}
      />

      <div className="mb-8 overflow-x-auto overflow-y-hidden rounded-lg border border-carbon-100">
        <OrgAffiliationsTable items={orgs} />
      </div>

      <TabBar
        tabs={[
          {
            value: "publications",
            label: "Publications",
            count: pubs.data.pagination.total,
          },
          {
            value: "comments",
            label: "Comments",
            count: comments.data.pagination.total,
          },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        aria-label="User publications and comments"
        className="mb-4"
      />

      {activeTab === "publications" && (
        <div className="overflow-x-auto overflow-y-hidden rounded-lg border border-carbon-100">
          <PublicationsTable
            items={pubs.data.items}
            loading={pubs.loading}
            error={pubs.error}
            pagination={{
              total: pubs.data.pagination.total,
              page: pubs.page,
              ...pubsPag,
              label: "publications",
              onPrev: () => pubs.setPage((p) => p - 1),
              onNext: () => pubs.setPage((p) => p + 1),
            }}
          />
        </div>
      )}

      {activeTab === "comments" && (
        <div className="overflow-x-auto overflow-y-hidden rounded-lg border border-carbon-100">
          <CommentsTable
            items={comments.data.items}
            loading={comments.loading}
            error={comments.error}
            pagination={{
              total: comments.data.pagination.total,
              page: comments.page,
              ...commentsPag,
              label: "comments",
              onPrev: () => comments.setPage((p) => p - 1),
              onNext: () => comments.setPage((p) => p + 1),
            }}
          />
        </div>
      )}

      <EditUserPanel
        isOpen={isEditOpen}
        user={user}
        onClose={() => setIsEditOpen(false)}
        onSaved={(updated) => {
          setUser(updated);
          setIsEditOpen(false);
        }}
      />
    </div>
  );
}
