import type { AdminPublicationResponse } from "@raven/backend-ts/types";
import { useLayoutEffect, useRef } from "react";
import { Link, matchPath, useNavigation } from "react-router";
import {
  AuthorsTable,
  DoiStat,
  LIGHT_BUTTON_CLASSES,
  SectionTable,
  StacksMetadataTable,
  StatsBar,
} from "~/components/PublicationDetailSections";
import SiteAdminOnly from "~/components/SiteAdminOnly";
import CopyButton from "~/components/stacks-ui/CopyButton";
import PageHeader from "~/components/stacks-ui/PageHeader";
import PublicationStatusBadge from "~/components/stacks-ui/PublicationStatusBadge";
import { loadAdminPublication } from "~/lib/loadAdminPublication";
import { cn, formatDate } from "~/lib/utils";
import type { Route } from "./+types/publications.$slug.versions.$versionNumber";

const VERSION_PATH = "/publications/:slug/versions/:versionNumber";
// Past this many versions the switcher scrolls inside a fixed width instead
// of growing, so it never squeezes the page title.
const MAX_INLINE_VERSIONS = 5;

/**
 * A pill switcher across the publication's listed versions, oldest first. The
 * highlight slides to a version as soon as its navigation starts, and settles
 * back on the loaded version if that navigation doesn't complete.
 */
function VersionSwitcher({
  slug,
  versions,
  currentVersionNumber,
}: {
  slug: string;
  versions: AdminPublicationResponse["versions"];
  currentVersionNumber: number;
}) {
  const navigation = useNavigation();
  const pending = navigation.location
    ? matchPath(VERSION_PATH, navigation.location.pathname)
    : null;
  const selected =
    pending?.params.slug === slug && pending.params.versionNumber
      ? Number(pending.params.versionNumber)
      : currentVersionNumber;
  const ordered = [...versions].sort(
    (a, b) => a.versionNumber - b.versionNumber
  );
  const scrolls = ordered.length > MAX_INLINE_VERSIONS;

  const linkRefs = useRef(new Map<number, HTMLAnchorElement>());
  const highlightRef = useRef<HTMLSpanElement>(null);
  const isPlaced = useRef(false);

  // Positioned from the selected link's box and written straight to the
  // element, so sliding needs no re-render. The ResizeObserver re-measures
  // once the label's size settles, e.g. after the mono font loads.
  useLayoutEffect(() => {
    const link = linkRefs.current.get(selected);
    const highlight = highlightRef.current;
    if (!link || !highlight) return;
    const place = () => {
      highlight.style.width = `${link.offsetWidth}px`;
      highlight.style.transform = `translateX(${link.offsetLeft}px)`;
    };
    if (isPlaced.current) {
      place();
    } else {
      // The first placement jumps into position instead of sliding in from
      // the left edge; reading layout applies it before transitions resume.
      highlight.style.transitionDuration = "0ms";
      place();
      highlight.getBoundingClientRect();
      highlight.style.transitionDuration = "";
      highlight.style.opacity = "1";
      isPlaced.current = true;
    }
    if (scrolls) link.scrollIntoView({ block: "nearest", inline: "nearest" });
    const observer = new ResizeObserver(place);
    observer.observe(link);
    return () => observer.disconnect();
  }, [selected, scrolls]);

  return (
    <nav
      aria-label="Versions"
      className={cn(
        scrolls &&
          "max-w-[20rem] overflow-x-auto rounded-full [scrollbar-width:thin]"
      )}
    >
      <div className="relative inline-flex rounded-full bg-gray-200 p-1 font-mono">
        <span
          ref={highlightRef}
          aria-hidden
          className="absolute inset-y-1 left-0 rounded-full bg-white opacity-0 shadow-sm transition-[transform,width] duration-300 ease-out"
        />
        {ordered.map(({ versionNumber }) => (
          <Link
            key={versionNumber}
            ref={(link) => {
              if (link) linkRefs.current.set(versionNumber, link);
              else linkRefs.current.delete(versionNumber);
            }}
            to={`/publications/${slug}/versions/${versionNumber}`}
            aria-current={
              versionNumber === currentVersionNumber ? "page" : undefined
            }
            className={cn(
              "text-body-20 relative rounded-full px-4 py-1.5 font-medium transition-colors",
              versionNumber === selected
                ? "text-carbon-800"
                : "text-gray-blue-300 hover:text-carbon-800"
            )}
          >
            v{versionNumber}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function ReleaseNotesTable({ versionDesc }: { versionDesc: string | null }) {
  return (
    <SectionTable
      title="Release notes"
      colCount={1}
      emptyLabel="release notes"
      isEmpty={!versionDesc?.trim()}
    >
      <tr>
        <td className="px-4 py-3">
          <p className="text-body-20 whitespace-pre-wrap text-foreground">
            {versionDesc}
          </p>
        </td>
      </tr>
    </SectionTable>
  );
}

function BodyTable({ body }: { body: string | null }) {
  const isEmpty = !body?.trim();
  return (
    <SectionTable
      title="Body"
      colCount={1}
      emptyLabel="body"
      isEmpty={isEmpty}
      action={
        <CopyButton
          text={body ?? ""}
          size="sm"
          intent="secondary"
          pill={false}
          className={cn("w-16 rounded-md px-0", LIGHT_BUTTON_CLASSES)}
          disabled={isEmpty}
          aria-label="Copy body"
        >
          {null}
        </CopyButton>
      }
    >
      <tr>
        <td className="bg-off-white px-4 py-3">
          <pre className="text-caption-20 max-h-[40rem] overflow-auto whitespace-pre-wrap break-words font-mono text-carbon-400">
            {body}
          </pre>
        </td>
      </tr>
    </SectionTable>
  );
}

export async function clientLoader({
  params,
  request,
}: Route.ClientLoaderArgs) {
  return loadAdminPublication(params, request.signal);
}

/**
 * Why the version DOI comparison can't cover the version being viewed, or
 * null when it can. Mirrors the version branch of v1's `lookupDoiComparison`:
 * it only accepts a PUBLISHED version's DOI, and only for the highest
 * PUBLISHED version number, the one `reconstructPublicationMetadata` rebuilds.
 */
function versionMetadataPendingMessage(
  publication: AdminPublicationResponse
): string | null {
  const version = publication.versions.find(
    (v) => v.versionNumber === publication.versionNumber
  );
  if (version?.state !== "PUBLISHED") {
    return "Available once this version is published.";
  }
  const latestPublished = Math.max(
    ...publication.versions
      .filter((v) => v.state === "PUBLISHED")
      .map((v) => v.versionNumber)
  );
  if (version.versionNumber !== latestPublished) {
    return "Only the latest published version can be compared.";
  }
  return null;
}

export default function PublicationVersionPage({
  loaderData,
}: Route.ComponentProps) {
  if (loaderData.forbidden) {
    return (
      <div className="p-8">
        <SiteAdminOnly />
      </div>
    );
  }

  const { publication } = loaderData;
  const listedVersion = publication.versions.find(
    (version) => version.versionNumber === publication.versionNumber
  );
  // Publishing (in v0 and v1) overwrites a version's `createdAt` with the
  // publish time, so it is the publish date once published and the creation
  // date while a draft.
  const versionDate =
    listedVersion &&
    `${listedVersion.state === "PUBLISHED" ? "Published on" : "Created on"} ${formatDate(listedVersion.createdAt, "MMM DD YYYY")}`;
  const metadataPendingMessage = versionMetadataPendingMessage(publication);

  return (
    <div className="p-8">
      <Link
        to={`/publications/${publication.slug}`}
        className="text-body-20 font-mono mb-6 inline-block text-carbon-400 transition-colors hover:text-foreground"
      >
        ‹ Back to publication
      </Link>

      <PageHeader>
        <div className="max-w-4xl">
          <PageHeader.Title
            title={publication.title || "Untitled"}
            subtitle={
              <span className="text-caption-20 font-mono text-carbon-400">
                {publication.slug} · v{publication.versionNumber}
                {versionDate && ` · ${versionDate}`}
              </span>
            }
          />
        </div>
        <PageHeader.Action>
          <div className="flex items-center gap-3">
            {listedVersion && (
              <PublicationStatusBadge state={listedVersion.state} />
            )}
            <VersionSwitcher
              key={publication.id}
              slug={publication.slug}
              versions={publication.versions}
              currentVersionNumber={publication.versionNumber}
            />
          </div>
        </PageHeader.Action>
      </PageHeader>

      <StatsBar
        stats={[
          {
            label: "Version DOI",
            value: (
              <DoiStat doi={publication.versionDoi} fallback="No version DOI" />
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

      <ReleaseNotesTable versionDesc={publication.versionDesc} />

      <AuthorsTable contributors={publication.contributors} />

      <StacksMetadataTable
        key={`${publication.id}-${publication.versionNumber}`}
        title="Version Metadata"
        doiType="version"
        doi={publication.versionDoi}
        pendingMessage={metadataPendingMessage}
        noDoiMessage="Available once this version has a DOI."
      />

      <BodyTable body={publication.body} />
    </div>
  );
}
