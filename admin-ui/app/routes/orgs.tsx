import { AlertCircleIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { unwrap } from "~/api/api-error";
import { apiV1 } from "~/api/hono-client";
import NewOrgPanel from "~/components/NewOrgPanel";
import Avatar from "~/components/stacks-ui/Avatar";
import Button from "~/components/stacks-ui/Button";
import PageHeader from "~/components/stacks-ui/PageHeader";
import TableEmptyState from "~/components/stacks-ui/TableEmptyState";
import TablePagination from "~/components/stacks-ui/TablePagination";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { useAuth } from "~/hooks/useAuth";
import { usePaginatedData } from "~/hooks/usePaginatedData";
import { rethrowForRoute } from "~/lib/rethrow-for-route";
import { cn, formatDate, paginationInfo } from "~/lib/utils";
import type { Route } from "./+types/orgs";

function DisplayBoolean({
  value,
}: {
  value: number | boolean | undefined | null;
}) {
  return value ? (
    <span className="text-body-20 text-mint-green-dark">Yes</span>
  ) : (
    <span className="text-body-20 text-carbon-300">—</span>
  );
}

// Every page request must use the same sort, or rows repeat or go missing
// across pages.
const SORT = "-publications";
const PER_PAGE = 20;

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  try {
    return await unwrap(
      apiV1.admin.orgs.$get(
        { query: { page: 1, perPage: PER_PAGE, sort: SORT } },
        { init: { signal: request.signal } }
      )
    );
  } catch (e) {
    rethrowForRoute(e);
  }
}

export default function Orgs({ loaderData }: Route.ComponentProps) {
  const { user } = useAuth();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const { data, page, setPage, loading, error, refetch } = usePaginatedData(
    apiV1.admin.orgs,
    { query: { sort: SORT } },
    PER_PAGE,
    loaderData
  );

  const { pagination, items: orgs } = data;
  const { totalPages, rangeStart, rangeEnd } = paginationInfo(
    pagination.page,
    pagination.perPage,
    pagination.total
  );

  return (
    <div className="p-8">
      {error && (
        <div className="flex flex-row items-center justify-center">
          <Alert
            variant="destructive"
            className="p-1 [&>svg]:left-2 [&>svg]:top-2 max-w-100"
          >
            <AlertCircleIcon size={16} />
            <AlertTitle>Load Failure</AlertTitle>
            <AlertDescription className="text-caption-10">
              {error}
            </AlertDescription>
          </Alert>
        </div>
      )}
      <PageHeader>
        <PageHeader.Title
          title="Organizations"
          subtitle={`${pagination.total} organizations · ${pagination.totalUnlisted ?? 0} unlisted`}
        />
        {user?.state === "SITE_ADMIN" && (
          <PageHeader.Action>
            <Button onClick={() => setIsPanelOpen(true)}>
              + New Organization
            </Button>
          </PageHeader.Action>
        )}
      </PageHeader>

      <div className="overflow-x-auto overflow-y-hidden rounded-lg border border-carbon-100 bg-white">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="border-b border-carbon-100 bg-warm-sand-100">
              <th className="text-caption-20 px-4 py-3 text-left font-normal uppercase tracking-widest text-carbon-400">
                Organization
              </th>
              <th className="text-caption-20 px-4 py-3 text-center font-normal uppercase tracking-widest text-carbon-400">
                Members
                <span className="block normal-case tracking-normal text-carbon-300">
                  current / total
                </span>
              </th>
              <th className="text-caption-20 px-4 py-3 text-center font-normal uppercase tracking-widest text-carbon-400">
                Publications
                <span className="block normal-case tracking-normal text-carbon-300">
                  published / total
                </span>
              </th>
              <th className="text-caption-20 px-4 py-3 text-center font-normal uppercase tracking-widest text-carbon-400">
                Unlisted
              </th>
              <th className="text-caption-20 px-4 py-3 text-center font-normal uppercase tracking-widest text-carbon-400">
                DOI Minting
              </th>
              <th className="text-caption-20 px-4 py-3 text-center font-normal uppercase tracking-widest text-carbon-400">
                Created
              </th>
            </tr>
          </thead>
          <tbody className={cn(loading && "opacity-50")}>
            {orgs.length === 0 ? (
              <TableEmptyState colSpan={6} label="organizations" />
            ) : (
              orgs.map((org) => {
                const href = `/orgs/${org.slug}`;
                const linkLabel = `View ${org.name} organization`;
                // createdAt is strictly never null because of the database, but the types aren't up to date
                const createdDate = formatDate(
                  org.createdAt ?? new Date(),
                  "MMM D, YYYY"
                );
                return (
                  <tr
                    key={org.id}
                    className="border-b border-carbon-100 transition-colors last:border-0 hover:bg-warm-sand-100"
                  >
                    <td className="p-0">
                      <Link
                        to={href}
                        aria-label={`${linkLabel} (${org.slug})`}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        <Avatar
                          src={org.avatar}
                          alt={org.name}
                          className="size-8 shrink-0"
                        />
                        <div>
                          <p className="text-body-20 font-medium text-foreground hover:underline">
                            {org.name}
                          </p>
                          <p className="text-caption-40 font-mono text-carbon-400">
                            {org.slug}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link
                        to={href}
                        aria-label={`${linkLabel}, members: ${org.currentMemberCount} current, ${org.totalMemberCount} total`}
                        tabIndex={-1}
                        className="block px-4 py-3 text-center"
                      >
                        <span className="text-body-20 text-foreground">
                          {org.currentMemberCount}
                        </span>
                        <span className="text-body-20 text-carbon-400">
                          {" "}
                          / {org.totalMemberCount}
                        </span>
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link
                        to={href}
                        aria-label={`${linkLabel}, publications: ${org.publishedPublicationCount} published, ${org.totalPublicationCount} total`}
                        tabIndex={-1}
                        className="block px-4 py-3 text-center"
                      >
                        <span className="text-body-20 text-foreground">
                          {org.publishedPublicationCount}
                        </span>
                        <span className="text-body-20 text-carbon-400">
                          {" "}
                          / {org.totalPublicationCount}
                        </span>
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link
                        to={href}
                        aria-label={`${linkLabel}, unlisted: ${org.unlisted ? "Yes" : "No"}`}
                        tabIndex={-1}
                        className="block px-4 py-3 text-center"
                      >
                        <DisplayBoolean value={Boolean(org.unlisted)} />
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link
                        to={href}
                        aria-label={`${linkLabel}, DOI minting: ${org.doiMintingEnabled ? "Yes" : "No"}`}
                        tabIndex={-1}
                        className="block px-4 py-3 text-center"
                      >
                        <DisplayBoolean value={org.doiMintingEnabled} />
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link
                        to={href}
                        aria-label={`${linkLabel}, created: ${createdDate}`}
                        tabIndex={-1}
                        className="block px-4 py-3 text-center"
                      >
                        <span className="text-body-20 text-carbon-400">
                          {createdDate}
                        </span>
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <TablePagination
              total={pagination.total}
              page={page}
              totalPages={totalPages}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              label="organizations"
              onPrev={() => setPage((p) => p - 1)}
              onNext={() => setPage((p) => p + 1)}
            />
          </tfoot>
        </table>
      </div>
      <NewOrgPanel
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        onCreated={() => {
          setPage(1);
          refetch();
        }}
      />
    </div>
  );
}
