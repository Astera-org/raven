import type { AdminPublicationResponse } from "@raven/backend-ts/types";
import { Fragment, useRef, useState } from "react";
import { Link, useRevalidator } from "react-router";
import EditDoiMetadataDialog from "~/components/EditDoiMetadataDialog";
import {
  AuthorsTable,
  DoiMetadataTable,
  DoiStat,
  ROW_CLASSES,
  SectionTable,
  StacksMetadataTable,
  StatsBar,
} from "~/components/PublicationDetailSections";
import SiteAdminOnly from "~/components/SiteAdminOnly";
import PageHeader from "~/components/stacks-ui/PageHeader";
import PublicationStatusBadge from "~/components/stacks-ui/PublicationStatusBadge";
import { loadAdminPublication } from "~/lib/loadAdminPublication";
import { cn, formatDate } from "~/lib/utils";
import type { Route } from "./+types/publications.$slug";

function VersionsTable({
  slug,
  versions,
  removedVersion,
}: {
  slug: string;
  versions: AdminPublicationResponse["versions"];
  // Set for a removed publication: every version is labelled, and the last
  // one, which it was removed with, is labelled Removed.
  removedVersion?: number;
}) {
  return (
    <SectionTable
      title="Versions"
      columns={["Version", "DOI", "Date"]}
      colCount={3}
      emptyLabel="versions"
      isEmpty={versions.length === 0}
    >
      {versions.map((version) => {
        // Every cell links to the version, like the orgs list, so the whole
        // row is clickable; only the first link takes keyboard focus.
        const href = `/publications/${slug}/versions/${version.versionNumber}`;
        const linkLabel = `View version ${version.versionNumber}`;
        return (
          <tr key={version.id} className={cn("group", ROW_CLASSES)}>
            <td className="w-px whitespace-nowrap p-0">
              <Link
                to={href}
                className="flex h-12 items-center gap-2 pl-4 pr-12"
              >
                <span className="text-body-20 font-medium text-foreground group-hover:underline">
                  v{version.versionNumber}
                </span>
                {removedVersion === undefined ? (
                  version.state === "DRAFT" && (
                    <PublicationStatusBadge state={version.state} />
                  )
                ) : version.versionNumber === removedVersion ? (
                  <PublicationStatusBadge state="DELETED" />
                ) : (
                  <PublicationStatusBadge state={version.state} />
                )}
              </Link>
            </td>
            <td className="p-0">
              <Link
                to={href}
                aria-label={`${linkLabel}, DOI: ${version.doi ?? "none"}`}
                tabIndex={-1}
                className="flex h-12 items-center px-4"
              >
                <span
                  className={cn(
                    "text-caption-20 font-mono",
                    version.doi ? "text-carbon-400" : "text-carbon-300"
                  )}
                >
                  {version.doi ?? "No version DOI"}
                </span>
              </Link>
            </td>
            <td className="p-0">
              <Link
                to={href}
                aria-label={`${linkLabel}, date: ${formatDate(version.createdAt, "MMM DD YYYY")}`}
                tabIndex={-1}
                className="flex h-12 items-center justify-end px-4"
              >
                <span className="text-body-20 whitespace-nowrap text-carbon-400">
                  {formatDate(version.createdAt, "MMM DD YYYY")}
                </span>
              </Link>
            </td>
          </tr>
        );
      })}
    </SectionTable>
  );
}

// The comparison endpoint rebuilds metadata from a published version, so
// drafts and publications removed before they were published have none.
function metadataPendingMessage(
  publication: AdminPublicationResponse
): string | null {
  if (publication.versions.some((v) => v.state === "PUBLISHED")) return null;
  return publication.state === "DELETED"
    ? "Not available: the publication was removed before it was published."
    : "Available once the publication is published.";
}

export async function clientLoader({
  params,
  request,
}: Route.ClientLoaderArgs) {
  // The admin route serves the published content (or the draft, if never
  // published, or its last version, if removed) and lists its versions.
  return loadAdminPublication(params, request.signal);
}

export default function PublicationDetailPage({
  loaderData,
}: Route.ComponentProps) {
  const revalidator = useRevalidator();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const doiMetadataMenuRef = useRef<HTMLButtonElement>(null);
  // Pub Metadata only fetches when its key changes, and its comparison is
  // built from the stored DOI metadata, so each save remounts it.
  const [doiMetadataSaves, setDoiMetadataSaves] = useState(0);

  if (loaderData.forbidden) {
    return (
      <div className="p-8">
        <SiteAdminOnly />
      </div>
    );
  }

  const { publication } = loaderData;
  const versionCount = publication.versions.length;
  const orgs = [...publication.orgs].sort((a, b) => a.priority - b.priority);

  return (
    <div className="p-8">
      <Link
        to="/publications"
        className="text-body-20 font-mono mb-6 inline-block text-carbon-400 transition-colors hover:text-foreground"
      >
        ‹ Back to publications
      </Link>

      <PageHeader>
        <div className="max-w-4xl">
          <PageHeader.Title
            title={publication.title || "Untitled"}
            subtitle={
              <span className="text-caption-20 font-mono text-carbon-400">
                {publication.slug} · {versionCount}{" "}
                {versionCount === 1 ? "version" : "versions"}
              </span>
            }
          />
        </div>
        <PageHeader.Action>
          <PublicationStatusBadge state={publication.state} />
        </PageHeader.Action>
      </PageHeader>

      <StatsBar
        stats={[
          {
            label: "Organization",
            value:
              orgs.length === 0 ? (
                <span className="text-caption-20 text-carbon-300">—</span>
              ) : (
                <span className="text-caption-20 text-foreground">
                  {orgs.map((org, i) => (
                    <Fragment key={org.orgId}>
                      {i > 0 && ", "}
                      <Link
                        to={`/orgs/${org.slug}`}
                        className="hover:underline"
                      >
                        {org.name}
                      </Link>
                    </Fragment>
                  ))}
                </span>
              ),
          },
          {
            label: "Concept DOI",
            value: (
              <DoiStat doi={publication.doi} fallback="No canonical DOI" />
            ),
          },
          {
            label: "Comments",
            value: (
              <span className="text-caption-20 font-mono text-foreground">
                {publication.commentsCount}
              </span>
            ),
          },
        ]}
      />

      <VersionsTable
        slug={publication.slug}
        versions={publication.versions}
        removedVersion={
          publication.state === "DELETED"
            ? publication.versionNumber
            : undefined
        }
      />

      <AuthorsTable contributors={publication.contributors} />

      <DoiMetadataTable
        title="Metadata Configuration"
        doiMetadata={publication.doiMetadata}
        onEdit={() => setIsEditOpen(true)}
        triggerRef={doiMetadataMenuRef}
      />

      <StacksMetadataTable
        key={`${publication.doi ?? publication.id}:${doiMetadataSaves}`}
        title="Pub Metadata"
        doiType="canonical"
        doi={publication.doi}
        pendingMessage={metadataPendingMessage(publication)}
        noDoiMessage="Available once the publication has a concept DOI."
      />

      <EditDoiMetadataDialog
        open={isEditOpen}
        publication={publication}
        onClose={() => setIsEditOpen(false)}
        returnFocusRef={doiMetadataMenuRef}
        onSaved={async () => {
          await revalidator.revalidate();
          setDoiMetadataSaves((saves) => saves + 1);
          setIsEditOpen(false);
        }}
      />
    </div>
  );
}
