import type {
  AdminOrgMemberResponse,
  AdminOrgMembersListResponse,
  AdminOrgResponse,
  AdminPublicationListResponse,
} from "@raven/backend-ts/types";
import { AlertCircleIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { firstErrorMessage, orDefault, safe, unwrap } from "~/api/api-error";
import { apiV1 } from "~/api/hono-client";
import { uploadOrgAvatar } from "~/api/utils";
import AddMemberPanel from "~/components/AddMemberPanel";
import EditMemberPanel from "~/components/EditMemberPanel";
import EditOrgPanel from "~/components/EditOrgPanel";
import Avatar from "~/components/stacks-ui/Avatar";
import AvatarSelector from "~/components/stacks-ui/AvatarSelector";
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
import UserDisplay from "~/components/stacks-ui/UserDisplay";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { type PageData, usePaginatedData } from "~/hooks/usePaginatedData";
import { ROLE_LABELS } from "~/lib/constants";
import { rethrowForRoute } from "~/lib/rethrow-for-route";
import { cn, formatDate, formatState, paginationInfo } from "~/lib/utils";
import type { Route } from "./+types/orgs.$slug";

// ---------- constants ----------

declare const __API_FRONTEND_URL__: string | undefined;
const MEMBERS_PER_PAGE = 6;
const PUBS_PER_PAGE = 5;

// ---------- loader ----------

export async function clientLoader({
  params,
  request,
}: Route.ClientLoaderArgs): Promise<{
  org: AdminOrgResponse;
  members: AdminOrgMembersListResponse;
  publications: AdminPublicationListResponse;
}> {
  const { slug } = params;
  const org = apiV1.admin.orgs[":idOrSlug"];
  const opts = { init: { signal: request.signal } };
  const emptyPage = (perPage: number) => ({
    items: [],
    pagination: { total: 0, page: 1, perPage },
  });

  try {
    const [orgData, members, publications] = await Promise.all([
      unwrap(org.$get({ param: { idOrSlug: slug } }, opts)),
      orDefault(
        org.members.$get(
          {
            param: { idOrSlug: slug },
            query: { page: 1, perPage: MEMBERS_PER_PAGE },
          },
          opts
        ),
        emptyPage(MEMBERS_PER_PAGE)
      ),
      orDefault(
        org.publications.$get(
          {
            param: { idOrSlug: slug },
            query: { page: 1, perPage: PUBS_PER_PAGE },
          },
          opts
        ),
        emptyPage(PUBS_PER_PAGE)
      ),
    ]);
    return { org: orgData, members, publications };
  } catch (e) {
    rethrowForRoute(e);
  }
}

// -- MembersTable --

function MembersTable({
  members,
  loading,
  error,
  pagination,
  onEdit,
}: {
  members: AdminOrgMemberResponse[];
  loading: boolean;
  error: string | null;
  pagination: TablePaginationProps;
  onEdit: (member: AdminOrgMemberResponse) => void;
}) {
  const colCount = 6;
  return (
    <table className="w-full bg-white min-w-[640px]">
      <thead>
        <tr className="border-b border-carbon-100 bg-warm-sand-100">
          <DataTableHeader align="center">Member</DataTableHeader>
          <DataTableHeader align="center">Role</DataTableHeader>
          <DataTableHeader align="center">Status</DataTableHeader>
          <DataTableHeader align="center">Start Date</DataTableHeader>
          <DataTableHeader align="center">End Date</DataTableHeader>
          <DataTableHeader align="center" />
        </tr>
      </thead>
      <tbody className={loading ? "opacity-50" : ""}>
        {error ? (
          <TableErrorState colSpan={colCount} message={error} />
        ) : members.length === 0 ? (
          <TableEmptyState colSpan={colCount} label="members" />
        ) : (
          members.map((member) => (
            <DataTableRow key={member.userId}>
              <td className="px-4 py-4 align-top">
                <Link to={`/users/${member.userId}`} className="group block">
                  <UserDisplay
                    user={{
                      ...member,
                    }}
                    showEmail
                  />
                </Link>
              </td>
              <td className="px-4 py-4 align-top text-center">
                <Badge
                  variant={member.role === "ADMIN" ? "primary" : "neutral"}
                >
                  {ROLE_LABELS[member.role] ?? member.role}
                </Badge>
              </td>
              <td className="px-4 py-4 align-top text-center">
                {hasMembershipEnded(member) ? (
                  <Badge variant="warning">Former</Badge>
                ) : member.state === "ACTIVE" ? (
                  <Badge variant="success">Active</Badge>
                ) : member.state === "SITE_ADMIN" ? (
                  <Badge variant="info">Site Admin</Badge>
                ) : (
                  <Badge variant="neutral">
                    {member.state ? formatState(member.state) : "Inactive"}
                  </Badge>
                )}
              </td>
              <td className="px-4 py-4 align-top text-center">
                <span className="text-body-20 text-carbon-400">
                  {member.startAt
                    ? formatDate(member.startAt, "MMM D, YYYY")
                    : "—"}
                </span>
              </td>
              <td className="px-4 py-4 align-top text-center">
                <span className="text-body-20 text-carbon-400">
                  {member.endAt ? formatDate(member.endAt, "MMM D, YYYY") : "—"}
                </span>
              </td>
              <td className="px-4 py-4 align-top">
                <button
                  onClick={() => onEdit(member)}
                  className="text-body-20 rounded-full border border-carbon-200 px-3 py-1 text-carbon-400 transition-colors hover:border-carbon-300 hover:text-foreground"
                >
                  Edit
                </button>
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

function hasMembershipEnded(member: AdminOrgMemberResponse) {
  return member.endAt !== null && new Date(member.endAt) <= new Date();
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
  const colCount = 5;
  return (
    <table className="w-full bg-white min-w-[540px]">
      <thead>
        <tr className="border-b border-carbon-100 bg-warm-sand-100">
          <DataTableHeader align="center">Publication</DataTableHeader>
          <DataTableHeader align="center">Slug</DataTableHeader>
          <DataTableHeader align="center">Version</DataTableHeader>
          <DataTableHeader align="center">Date</DataTableHeader>
          <DataTableHeader align="center">Status</DataTableHeader>
        </tr>
      </thead>
      <tbody className={loading ? "opacity-50" : ""}>
        {error ? (
          <TableErrorState colSpan={colCount} message={error} />
        ) : items.length === 0 ? (
          <TableEmptyState colSpan={colCount} label="publications" />
        ) : (
          items.map((pub) => (
            <DataTableRow key={pub.id}>
              <td className="px-4 py-4 align-top">
                <Link
                  to={`/publications/${pub.slug}`}
                  className="text-body-20 line-clamp-3 overflow-hidden font-medium text-foreground hover:underline"
                >
                  {pub.title}
                </Link>
              </td>
              <td className="px-4 py-4 align-top">
                <span className="text-caption-20 line-clamp-2 overflow-hidden font-mono text-carbon-400">
                  {pub.slug}
                </span>
              </td>
              <td className="px-4 py-4 align-top">
                <span className="text-body-20 text-carbon-400">
                  {pub.versionNumber == null ? "—" : `v${pub.versionNumber}`}
                </span>
              </td>
              <td className="px-4 py-4 align-top">
                <span className="text-body-20 whitespace-nowrap text-carbon-400">
                  {formatDate(pub.createdAt, "MMM D")}
                </span>
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

// -- OrgHeader --

function OrgHeader({
  org,
  onEdit,
  onChangeAvatar,
  orgLoadError,
}: {
  org: AdminOrgResponse;
  onEdit: () => void;
  onChangeAvatar: () => void;
  orgLoadError: string | undefined;
}) {
  return (
    <div className="mb-8 flex flex-col gap-2">
      {orgLoadError && (
        <div className="flex flex-row items-center justify-center">
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Load Failure</AlertTitle>
            <AlertDescription>{orgLoadError}</AlertDescription>
          </Alert>
        </div>
      )}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Avatar
            src={org.avatar}
            alt={org.name}
            className="relative z-0 size-16 shrink-0"
          />
          <div>
            <h1 className="font-serif text-headline-40 text-foreground">
              {org.name}
            </h1>
            <p className="text-caption-20 font-mono text-carbon-400">
              {__API_FRONTEND_URL__ ? (
                <a
                  href={`${__API_FRONTEND_URL__}/organizations/${org.slug}`}
                  className="hover:underline"
                >
                  {org.slug}
                </a>
              ) : (
                org.slug
              )}{" "}
              · Created{" "}
              {
                // createdAt is strictly never null because of the database, but the types aren't up to date
                formatDate(org.createdAt ?? new Date(), "MMM D, YYYY")
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onChangeAvatar}
            className="text-body-20 rounded-full border border-carbon-200 px-4 py-1.5 text-carbon-400 transition-colors hover:border-carbon-300 hover:text-foreground"
          >
            Change avatar
          </button>
          <button
            onClick={onEdit}
            className="text-body-20 rounded-full border border-carbon-200 px-4 py-1.5 text-carbon-400 transition-colors hover:border-carbon-300 hover:text-foreground"
          >
            Edit
          </button>
        </div>
      </div>
      {org.profile && (
        <p className="text-body-20 mt-4 w-full text-left text-foreground">
          {org.profile}
        </p>
      )}
    </div>
  );
}

// -- OrgStats --

function OrgStats({ org }: { org: AdminOrgResponse }) {
  return (
    <div className="mb-4 flex overflow-hidden rounded-lg border border-carbon-100 bg-white">
      <div className="flex-1 px-5 py-3">
        <p className="text-caption-20 mb-1 font-mono uppercase tracking-widest text-carbon-300">
          Unlisted
        </p>
        {org.unlisted ? (
          <span className="text-caption-20 text-mint-green-dark">Yes</span>
        ) : (
          <span className="text-caption-20 text-carbon-400">No</span>
        )}
      </div>
      <div className="my-3 w-px shrink-0 bg-carbon-100" />
      <div className="flex-1 px-5 py-3">
        <p className="text-caption-20 mb-1 font-mono uppercase tracking-widest text-carbon-300">
          DOI Minting
        </p>
        {org.doiMintingEnabled ? (
          <span className="text-caption-20 text-mint-green-dark">Enabled</span>
        ) : (
          <span className="text-caption-20 text-carbon-400">Disabled</span>
        )}
      </div>
      <div className="my-3 w-px shrink-0 bg-carbon-100" />
      <div className="flex-1 px-5 py-3">
        <p className="text-caption-20 mb-1 font-mono uppercase tracking-widest text-carbon-300">
          ROR
        </p>
        <span
          className={cn(
            "text-caption-20 font-mono",
            org.rorId ? "text-foreground" : "text-carbon-300"
          )}
        >
          {org.rorId ?? "—"}
        </span>
      </div>
      <div className="my-3 w-px shrink-0 bg-carbon-100" />
      <div className="flex-1 px-5 py-3">
        <p className="text-caption-20 mb-1 font-mono uppercase tracking-widest text-carbon-300">
          DOI Suffix Prefix
        </p>
        <span
          className={cn(
            "text-caption-20 font-mono",
            org.doiPrefix ? "text-foreground" : "text-carbon-300"
          )}
        >
          {org.doiPrefix ?? "—"}
        </span>
      </div>
    </div>
  );
}

// -- CountCards --

function CountCards({
  org,
  onViewPublications,
}: {
  org: AdminOrgResponse;
  onViewPublications: () => void;
}) {
  return (
    <div className="mb-8 grid grid-cols-2 gap-4">
      <div className="rounded-lg border border-carbon-100 bg-white p-4">
        <p className="text-caption-20 mb-2 font-mono uppercase tracking-widest text-carbon-400">
          Current Members
        </p>
        <CountWithTotal
          count={org.currentMemberCount}
          total={org.totalMemberCount}
        />
      </div>
      <div className="rounded-lg border border-carbon-100 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-caption-20 font-mono uppercase tracking-widest text-carbon-400">
            Published
          </p>
          <button
            type="button"
            onClick={onViewPublications}
            className="text-body-20 text-periwinkle-700 transition-opacity hover:opacity-70"
          >
            View all ›
          </button>
        </div>
        <CountWithTotal
          count={org.publishedPublicationCount}
          total={org.totalPublicationCount}
        />
      </div>
    </div>
  );
}

function CountWithTotal({ count, total }: { count: number; total: number }) {
  return (
    <p className="font-serif text-headline-20 text-foreground">
      {count}
      <span className="text-body-20 ml-2 font-sans text-carbon-400">
        of {total} total
      </span>
    </p>
  );
}

function useOrg(initialOrg: AdminOrgResponse) {
  const [org, setOrg] = useState(initialOrg);
  const [error, setError] = useState<string | undefined>();
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    // Loader data is current until the first refresh is requested
    if (nonce === 0) return;

    const controller = new AbortController();
    // This effect doesn't have a dependency on setError, so this is ok
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(undefined);

    void safe(
      apiV1.admin.orgs[":idOrSlug"].$get(
        { param: { idOrSlug: initialOrg.id } },
        { init: { signal: controller.signal } }
      )
    ).then((r) => {
      if (controller.signal.aborted) return;
      if (r.ok) setOrg(r.data);
      else setError(firstErrorMessage(r.error, "Error fetching organization"));
    });

    return () => controller.abort();
  }, [nonce, initialOrg.id]);

  return { org, error, refresh };
}

// ---------- main component ----------

export default function OrgDetailRoute({ loaderData }: Route.ComponentProps) {
  return <OrgDetail key={loaderData.org.id} loaderData={loaderData} />;
}

function OrgDetail({
  loaderData,
}: {
  loaderData: Route.ComponentProps["loaderData"];
}) {
  const {
    org: initialOrg,
    members: initialMembers,
    publications: initialPubs,
  } = loaderData;
  const { org, error: orgLoadError, refresh: refreshOrg } = useOrg(initialOrg);

  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"members" | "publications">(
    "members"
  );

  const members = usePaginatedData(
    apiV1.admin.orgs[":idOrSlug"].members,
    { param: { idOrSlug: org.id } },
    MEMBERS_PER_PAGE,
    initialMembers
  );
  const pubs = usePaginatedData(
    apiV1.admin.orgs[":idOrSlug"].publications,
    { param: { idOrSlug: org.id } },
    PUBS_PER_PAGE,
    initialPubs as PageData<
      (typeof apiV1)["admin"]["orgs"][":idOrSlug"]["publications"]
    >
  );

  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isEditOrgOpen, setIsEditOrgOpen] = useState(false);
  const [isAvatarSelectorOpen, setIsAvatarSelectorOpen] = useState(false);
  const [editingMember, setEditingMember] =
    useState<AdminOrgMemberResponse | null>(null);

  function refreshMembers() {
    members.refetch();
    refreshOrg();
  }

  async function handleAvatarSaved(file: File) {
    try {
      await uploadOrgAvatar(org.slug, file);
      refreshOrg();
    } catch {
      toast.error("Failed to upload avatar. Please try again.");
    }
  }

  const membersPag = paginationInfo(
    members.page,
    MEMBERS_PER_PAGE,
    members.data.pagination.total
  );

  const pubsPag = paginationInfo(
    pubs.page,
    PUBS_PER_PAGE,
    pubs.data.pagination.total
  );

  return (
    <div className="p-8">
      <Link
        to="/orgs"
        className="text-body-20 font-mono mb-6 inline-block text-carbon-400 transition-colors hover:text-foreground"
      >
        ‹ Back to organizations
      </Link>

      <OrgHeader
        org={org}
        onEdit={() => setIsEditOrgOpen(true)}
        onChangeAvatar={() => setIsAvatarSelectorOpen(true)}
        orgLoadError={orgLoadError}
      />

      <OrgStats org={org} />

      <CountCards
        org={org}
        onViewPublications={() => setActiveTab("publications")}
      />

      <TabBar
        tabs={[
          {
            value: "members",
            label: "Members",
            count: members.data.pagination.total,
          },
          {
            value: "publications",
            label: "Publications",
            count: pubs.data.pagination.total,
          },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        aria-label="Organization members and publications"
        className="mb-4"
      />

      {activeTab === "members" && (
        <>
          <div className="mb-3 mt-4 flex justify-end">
            <button
              onClick={() => setIsAddMemberOpen(true)}
              className="text-body-20 rounded-full bg-gray-blue-900 px-4 py-2 text-white transition-colors hover:bg-gray-blue-700"
            >
              + Add member
            </button>
          </div>
          <div className="overflow-x-auto overflow-y-auto rounded-lg border border-carbon-100">
            <MembersTable
              members={members.data.items}
              loading={members.loading}
              error={members.error}
              onEdit={(member) => setEditingMember(member)}
              pagination={{
                total: members.data.pagination.total,
                page: members.page,
                ...membersPag,
                label: "members",
                onPrev: () => members.setPage((p) => p - 1),
                onNext: () => members.setPage((p) => p + 1),
              }}
            />
          </div>
        </>
      )}

      {activeTab === "publications" && (
        <div className="mt-4 overflow-x-auto overflow-y-auto rounded-lg border border-carbon-100">
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

      <AddMemberPanel
        isOpen={isAddMemberOpen}
        orgSlug={org.slug}
        onClose={() => setIsAddMemberOpen(false)}
        onAdded={() => {
          setIsAddMemberOpen(false);
          refreshMembers();
        }}
      />
      <EditMemberPanel
        isOpen={editingMember !== null}
        orgSlug={org.slug}
        member={editingMember}
        onClose={() => setEditingMember(null)}
        onSaved={() => {
          setEditingMember(null);
          refreshMembers();
        }}
      />
      <EditOrgPanel
        isOpen={isEditOrgOpen}
        org={org}
        onClose={() => setIsEditOrgOpen(false)}
        onSaved={() => {
          setIsEditOrgOpen(false);
          // Not as pretty, but effective. No need to query the slug to see what
          // eventually settled to, in case that one is already taken
          navigate(`/orgs/${org.id}`, { replace: true });
          refreshOrg();
        }}
      />
      <AvatarSelector
        isOpen={isAvatarSelectorOpen}
        onOpenChange={setIsAvatarSelectorOpen}
        currentAvatarSrc={org.avatar ?? undefined}
        currentAvatarFallback={org.name.charAt(0).toUpperCase()}
        onAvatarChange={handleAvatarSaved}
      />
    </div>
  );
}
