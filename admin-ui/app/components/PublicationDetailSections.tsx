import type {
  AdminPublicationResponse,
  DoiComparisonType,
} from "@raven/backend-ts/types";
import { ChevronDown, GitCompare, Pencil } from "lucide-react";
import { Fragment, type ReactNode, type Ref, useEffect, useState } from "react";
import { Link } from "react-router";
import { firstErrorMessage, safe } from "~/api/api-error";
import { apiV1 } from "~/api/hono-client";
import Avatar from "~/components/stacks-ui/Avatar";
import Button from "~/components/stacks-ui/Button";
import CopyButton from "~/components/stacks-ui/CopyButton";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
} from "~/components/stacks-ui/Dropdown";
import TableEmptyState from "~/components/stacks-ui/TableEmptyState";
import { cn, formatJson } from "~/lib/utils";

// Shared shell for the detail pages' section tables: a bordered table with a
// single bold title row, modelled on the user page's Organizations and Roles.
export function SectionTable({
  title,
  colCount,
  emptyLabel,
  isEmpty,
  action,
  columns,
  children,
}: {
  title: string;
  colCount: number;
  emptyLabel: string;
  isEmpty: boolean;
  action?: ReactNode;
  // Column headers for screen readers; hidden so the design keeps one title row.
  columns?: string[];
  children: ReactNode;
}) {
  return (
    <div className="mb-4 overflow-x-auto overflow-y-hidden rounded-lg border border-carbon-100">
      <table className="w-full min-w-[420px] bg-white">
        <thead>
          <tr className="border-b border-carbon-100">
            <th
              scope="colgroup"
              colSpan={colCount}
              className="px-4 py-3 text-left"
            >
              <div className="flex items-center justify-between gap-4">
                <span className="text-body-20 font-bold text-foreground">
                  {title}
                </span>
                {action}
              </div>
            </th>
          </tr>
          {columns && (
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col" className="sr-only">
                  {column}
                </th>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {isEmpty ? (
            <TableEmptyState colSpan={colCount} label={emptyLabel} />
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

export const ROW_CLASSES =
  "border-b border-carbon-100 transition-colors last:border-0 hover:bg-warm-sand-100";

// Softens the secondary button's dark outline and solid-dark hover.
export const LIGHT_BUTTON_CLASSES =
  "border-carbon-200 text-carbon-400 hover:bg-warm-sand-100 hover:text-foreground";

/** The bordered row of labelled values under a publication page's header. */
export function StatsBar({
  stats,
}: {
  stats: { label: string; value: ReactNode }[];
}) {
  return (
    <div className="mb-4 flex overflow-hidden rounded-lg border border-carbon-100 bg-white">
      {stats.map(({ label, value }, i) => (
        <Fragment key={label}>
          {i > 0 && <div className="my-3 w-px shrink-0 bg-carbon-100" />}
          <div className="flex-1 px-5 py-3">
            <p className="text-caption-20 mb-1 font-mono uppercase tracking-widest text-carbon-300">
              {label}
            </p>
            {value}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

export function DoiStat({
  doi,
  fallback,
}: {
  doi: string | null;
  fallback: string;
}) {
  return (
    <span
      className={cn(
        "text-caption-20 font-mono",
        doi ? "text-foreground" : "text-carbon-300"
      )}
    >
      {doi ?? fallback}
    </span>
  );
}

/**
 * @todo `in_byline` is one current flag per contributor, with no version link
 * or history, so each row can only say Byline or Non-byline. Show per-version
 * byline (e.g. "All versions", "v2 onward") once the contributors schema
 * tracks it.
 * @todo Link each author to their user detail page, like the users listing,
 * once the admin UI moves to v1. That page takes v0 integer ids, and v1
 * contributors only carry ULIDs.
 */
export function AuthorsTable({
  contributors,
}: {
  contributors: AdminPublicationResponse["contributors"];
}) {
  const sorted = [...contributors].sort(
    (a, b) =>
      (a.priority ?? Number.MAX_SAFE_INTEGER) -
      (b.priority ?? Number.MAX_SAFE_INTEGER)
  );
  return (
    <SectionTable
      title="Authors"
      columns={["Author", "Roles", "Byline"]}
      colCount={3}
      emptyLabel="authors"
      isEmpty={sorted.length === 0}
    >
      {sorted.map((author) => {
        const name =
          [author.firstName, author.lastName].filter(Boolean).join(" ") ||
          author.username;
        return (
          <tr key={author.userId} className={cn("align-middle", ROW_CLASSES)}>
            <td className="px-4 py-3">
              <div className="flex items-center gap-3">
                <Avatar
                  src={author.avatar}
                  alt={name}
                  className="size-8 shrink-0"
                />
                <div>
                  <p className="text-body-20 font-medium text-foreground">
                    {name}
                  </p>
                  <p className="text-caption-20 font-mono text-carbon-300">
                    @{author.username}
                  </p>
                </div>
              </div>
            </td>
            <td className="px-4 py-3">
              <span className="text-body-20 text-carbon-400">
                {[...author.roles]
                  .sort((a, b) => a.localeCompare(b))
                  .join(", ")}
              </span>
            </td>
            <td className="px-4 py-3 text-right">
              <span className="text-body-20 whitespace-nowrap text-carbon-400">
                {author.inByline ? "Byline" : "Non-byline"}
              </span>
            </td>
          </tr>
        );
      })}
    </SectionTable>
  );
}

type StacksMetadataState =
  | { status: "loading" }
  | { status: "ready"; json: string }
  | { status: "unavailable"; message: string };

export function StacksMetadataTable({
  title,
  doiType,
  doi,
  pendingMessage,
  noDoiMessage,
}: {
  title: string;
  doiType: DoiComparisonType;
  doi: string | null;
  // Why the comparison endpoint can't cover this DOI yet, or null when it can.
  pendingMessage: string | null;
  noDoiMessage: string;
}) {
  const comparable = doi !== null && pendingMessage === null;
  // A fetched result is stored with the DOI it was fetched for and only shown
  // for that DOI, so a reload never shows another request's data.
  const requestKey = `${doiType}:${doi}`;
  const [fetched, setFetched] = useState<{
    key: string;
    state: StacksMetadataState;
  } | null>(null);
  // Unavailability comes from the current props, never from stored state, so
  // a reload that makes the comparison unavailable replaces any old data.
  const state: StacksMetadataState = !comparable
    ? { status: "unavailable", message: pendingMessage ?? noDoiMessage }
    : fetched?.key === requestKey
      ? fetched.state
      : { status: "loading" };

  // Fetched after render (not in the loader) because the comparison also
  // calls DataCite, which shouldn't hold up the rest of the page.
  useEffect(() => {
    if (!comparable) return;
    const controller = new AbortController();
    void safe(
      apiV1.admin["doi-comparisons"].$get(
        { query: { type: doiType, doi } },
        { init: { signal: controller.signal } }
      )
    ).then((r) => {
      if (controller.signal.aborted) return;
      if (r.ok) {
        setFetched({
          key: requestKey,
          state: {
            status: "ready",
            json: formatJson(r.data.stacksMetadata),
          },
        });
        return;
      }
      setFetched({
        key: requestKey,
        state: {
          status: "unavailable",
          message: r.error.isNotFound
            ? "No published metadata found for this DOI."
            : firstErrorMessage(r.error, "Failed to load the pub metadata."),
        },
      });
    });
    return () => controller.abort();
  }, [doiType, doi, comparable, requestKey]);

  return (
    <MetadataTable
      title={title}
      json={state.status === "ready" ? state.json : null}
      message={
        state.status === "unavailable" ? state.message : "Loading metadata…"
      }
      copyLabel="Copy metadata"
      menuLabel="More actions"
      menuItems={
        comparable ? (
          <DropdownItem asChild>
            <Link
              to={`/doi-audit/compare/${doiType}/${encodeURIComponent(doi)}`}
            >
              <GitCompare className="size-4" aria-hidden />
              Compare metadata
            </Link>
          </DropdownItem>
        ) : (
          <DropdownItem disabled>
            <GitCompare className="size-4" aria-hidden />
            Compare metadata
          </DropdownItem>
        )
      }
    />
  );
}

/**
 * A publication's stored DOI metadata, laid out like the Pub Metadata section
 * but read from the loaded publication, so it never waits on DataCite.
 */
export function DoiMetadataTable({
  title,
  doiMetadata,
  onEdit,
  triggerRef,
}: {
  title: string;
  doiMetadata: AdminPublicationResponse["doiMetadata"];
  onEdit: () => void;
  /** The menu button, so the edit dialog can return focus to it. */
  triggerRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <MetadataTable
      title={title}
      json={formatJson(doiMetadata)}
      triggerRef={triggerRef}
      copyLabel="Copy metadata configuration"
      menuLabel="More metadata configuration actions"
      menuItems={
        <DropdownItem onSelect={onEdit}>
          <Pencil className="size-4" aria-hidden />
          Edit
        </DropdownItem>
      }
    />
  );
}

/**
 * The shell the metadata sections share: a title row with a copy button and a
 * menu of further actions, and the JSON (or a message in its place) below.
 */
function MetadataTable({
  title,
  json,
  message,
  copyLabel,
  menuLabel,
  menuItems,
  triggerRef,
}: {
  title: string;
  /** The JSON to show and copy, or null while `message` stands in for it. */
  json: string | null;
  message?: string;
  copyLabel: string;
  menuLabel: string;
  menuItems: ReactNode;
  triggerRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <SectionTable
      title={title}
      colCount={1}
      emptyLabel="metadata"
      isEmpty={false}
      action={
        <div className="flex w-16">
          <CopyButton
            text={json ?? ""}
            size="sm"
            intent="secondary"
            pill={false}
            className={cn(
              "w-[60%] rounded-l-md rounded-r-none px-0",
              LIGHT_BUTTON_CLASSES
            )}
            disabled={json === null}
            aria-label={copyLabel}
          >
            {null}
          </CopyButton>
          <Dropdown modal={false}>
            <DropdownTrigger asChild ref={triggerRef}>
              <Button
                size="sm"
                intent="secondary"
                pill={false}
                className={cn(
                  "w-[40%] rounded-l-none rounded-r-md border-l-0 px-0",
                  LIGHT_BUTTON_CLASSES
                )}
                aria-label={menuLabel}
              >
                <ChevronDown className="size-4" aria-hidden />
              </Button>
            </DropdownTrigger>
            <DropdownContent align="end">{menuItems}</DropdownContent>
          </Dropdown>
        </div>
      }
    >
      <tr>
        <td className="bg-off-white px-4 py-3">
          {json !== null ? (
            <pre className="text-caption-20 max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-carbon-400">
              {json}
            </pre>
          ) : (
            <p className="text-body-20 py-4 text-center text-carbon-400">
              {message}
            </p>
          )}
        </td>
      </tr>
    </SectionTable>
  );
}
