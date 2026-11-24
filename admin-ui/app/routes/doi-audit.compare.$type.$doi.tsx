import * as Dialog from "@radix-ui/react-dialog";
import type {
  AdminDoiComparisonResponse,
  DoiComparisonType,
} from "@raven/backend-ts/types";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  RotateCw,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useRevalidator } from "react-router";
import { toast } from "sonner";
import { firstErrorMessage, safe } from "~/api/api-error";
import { apiV1 } from "~/api/hono-client";
import Button from "~/components/stacks-ui/Button";
import CopyButton from "~/components/stacks-ui/CopyButton";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
} from "~/components/stacks-ui/Dropdown";
import { rethrowForRoute } from "~/lib/rethrow-for-route";
import { cn, formatUtcDateTime } from "~/lib/utils";
import type { Route } from "./+types/doi-audit.compare.$type.$doi";

// ---------------------------------------------------------------------------
// Full metadata comparison field config
// ---------------------------------------------------------------------------
//
// Stacks' and DataCite's raw attribute objects don't share a key order (each
// side constructs/returns its own), so rendering them independently made
// corresponding fields land in different row positions. Instead this walks
// ONE fixed field order and pulls each side's value for that field, so e.g.
// "creators" is always next to "creators", "dates" next to "dates", etc.

interface ComparableFieldDef {
  key: string;
  label: string;
}

// `label` matches the backend's diff field name (title, abstract, creators,
// ...) -- the backend's diffs array is the source of truth for every field
// here.
const COMPARABLE_FIELDS: ComparableFieldDef[] = [
  { key: "titles", label: "title" },
  { key: "titles", label: "subtitle" },
  { key: "descriptions", label: "abstract" },
  { key: "publisher", label: "publisher" },
  { key: "publicationYear", label: "publicationYear" },
  { key: "url", label: "url" },
  { key: "version", label: "version" },
  { key: "language", label: "language" },
  { key: "types", label: "types" },
  { key: "subjects", label: "subjects" },
  { key: "rightsList", label: "rightsList" },
  { key: "creators", label: "creators" },
  { key: "contributors", label: "contributors" },
  { key: "dates", label: "dates" },
  { key: "relatedIdentifiers", label: "relatedIdentifiers" },
];

// Everything is a direct `metadata[key]` lookup except title/subtitle/abstract,
// which DataCite nests in arrays: the main title is the entry without a
// titleType, and the subtitle is the entry typed "Subtitle".
function extractComparableScalar(
  metadata: Record<string, unknown> | null,
  def: ComparableFieldDef
): unknown {
  if (!metadata) return null;
  if (def.label === "title" || def.label === "subtitle") {
    const titles = metadata["titles"] as
      | Array<{ title: string; titleType?: string }>
      | undefined;
    const entry =
      def.label === "title"
        ? titles?.find((t) => !t.titleType)
        : titles?.find((t) => t.titleType === "Subtitle");
    return entry?.title ?? null;
  }
  if (def.key === "descriptions") {
    return (
      (
        metadata["descriptions"] as
          | Array<{ description: string; descriptionType: string }>
          | undefined
      )?.find((d) => d.descriptionType === "Abstract")?.description ?? null
    );
  }
  return metadata[def.key] ?? null;
}

// title/subtitle/abstract are plain strings -- show them as-is instead of via
// JSON.stringify, which would wrap them in quotes like every other field.
function renderComparableValue(
  value: unknown,
  def: ComparableFieldDef
): string {
  if (def.key === "titles" || def.key === "descriptions") {
    return (value as string | null) ?? "null";
  }
  return JSON.stringify(value, null, 2);
}

const DOI_TYPE_LABELS: Record<DoiComparisonType, string> = {
  canonical: "Canonical DOI",
  version: "Version DOI",
};

function isDoiComparisonType(value: string): value is DoiComparisonType {
  return Object.hasOwn(DOI_TYPE_LABELS, value);
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function clientLoader({
  params,
  request,
}: Route.ClientLoaderArgs) {
  if (!isDoiComparisonType(params.type)) {
    throw new Response("Not found", { status: 404 });
  }

  const r = await safe(
    apiV1.admin["doi-comparisons"].$get(
      { query: { type: params.type, doi: decodeURIComponent(params.doi) } },
      { init: { signal: request.signal } }
    )
  );
  const checkedAt = new Date().toISOString();
  if (r.ok) return { detail: r.data, error: null, checkedAt };

  // A 404 means this DOI can't be compared right now (its publication left the
  // caller's scope, or a newer version was published since the audit ran), so
  // it stays on the page with Recheck. Anything else goes to the boundary.
  if (!r.error.isNotFound) rethrowForRoute(r.error);
  return {
    detail: null,
    error: firstErrorMessage(r.error, "This comparison could not be loaded."),
    checkedAt,
  };
}

// ---------------------------------------------------------------------------
// Push confirmation
// ---------------------------------------------------------------------------

function PushConfirmDialog({
  open,
  onOpenChange,
  doi,
  fields,
  skippedFields,
  isPushing,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doi: string;
  fields: string[];
  skippedFields: string[];
  isPushing: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-carbon-900/30 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-carbon-100 px-6 py-5">
            <Dialog.Title className="text-carbon-800 font-serif text-headline-10">
              Push to DataCite?
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close dialog"
              className="flex size-8 items-center justify-center rounded text-carbon-300 transition-colors hover:bg-gray-200 hover:text-foreground"
            >
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <div className="px-6 py-6">
            <Dialog.Description className="text-body-20 mb-3 text-carbon-400">
              This updates DataCite&apos;s record for{" "}
              <span className="font-mono text-foreground">{doi}</span> so these
              fields match The Stacks. Each field is replaced as a whole; the
              DOI&apos;s state is not changed.
            </Dialog.Description>
            <ul className="text-caption-20 list-disc pl-5 font-mono text-carbon-700">
              {fields.map((field) => (
                <li key={field}>{field}</li>
              ))}
            </ul>
            {skippedFields.length > 0 && (
              <p className="text-caption-20 mt-3 text-carbon-300">
                Also differs but is never pushed:{" "}
                <span className="font-mono">{skippedFields.join(", ")}</span>
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-carbon-100 px-6 py-4">
            <Dialog.Close asChild>
              <Button size="sm" intent="secondary" disabled={isPushing}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button size="sm" disabled={isPushing} onClick={onConfirm}>
              {isPushing ? "Pushing…" : "Push"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DoiAuditCompare({ loaderData }: Route.ComponentProps) {
  const { detail, error, checkedAt } = loaderData;
  const revalidator = useRevalidator();
  const isRechecking = revalidator.state === "loading";
  const wasRecheckingRef = useRef(false);
  // Set when a push triggers the reload, which already toasted its own result.
  const skipRecheckToastRef = useRef(false);
  const [isPushDialogOpen, setIsPushDialogOpen] = useState(false);
  const [isPushing, setIsPushing] = useState(false);

  useEffect(() => {
    if (wasRecheckingRef.current && revalidator.state === "idle") {
      if (error) {
        toast.error(error);
      } else if (!skipRecheckToastRef.current) {
        toast.success("Recheck successful");
      }
      skipRecheckToastRef.current = false;
    }
    wasRecheckingRef.current = isRechecking;
  }, [revalidator.state, isRechecking, error]);

  async function handlePush({
    type,
    doi,
    fingerprint,
  }: AdminDoiComparisonResponse) {
    setIsPushing(true);
    const r = await safe(
      apiV1.admin["doi-pushes"].$post({ json: { type, doi, fingerprint } })
    );
    setIsPushing(false);
    if (r.ok) {
      const { pushedFields } = r.data;
      toast.success(
        `Pushed ${pushedFields.length} field${pushedFields.length === 1 ? "" : "s"} to DataCite`
      );
    } else {
      toast.error(firstErrorMessage(r.error, "Failed to push to DataCite."));
      // 409: what was reviewed is out of date. Reload so the admin sees the
      // current comparison before deciding whether to push again.
      if (r.error.status !== 409) return;
    }
    setIsPushDialogOpen(false);
    skipRecheckToastRef.current = true;
    revalidator.revalidate();
  }

  if (!detail) {
    return (
      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <Link
            to="/doi-audit"
            className="text-body-20 font-mono inline-block text-carbon-300 transition-colors hover:text-foreground"
          >
            ‹ Back to results
          </Link>
          <Button
            size="sm"
            intent="secondary"
            disabled={isRechecking}
            onClick={() => revalidator.revalidate()}
          >
            {isRechecking ? "Rechecking…" : "Recheck"}
          </Button>
        </div>
        <p className="text-body-20 text-error-900">{error}</p>
      </div>
    );
  }

  const titleDef = COMPARABLE_FIELDS.find((def) => def.label === "title")!;
  const pubTitle =
    (extractComparableScalar(detail.stacksMetadata, titleDef) as
      | string
      | null) ?? detail.slug;

  const found = detail.found;
  const matches = detail.matches;
  const resultText = !found
    ? "DataCite record unavailable"
    : matches
      ? "All fields match"
      : `${detail.diffs.length} field${detail.diffs.length === 1 ? "" : "s"} differ`;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <Link
          to="/doi-audit"
          className="text-body-20 font-mono inline-block text-carbon-300 transition-colors hover:text-foreground"
        >
          ‹ Back to results
        </Link>
        <div className="flex">
          <CopyButton
            text={detail.text}
            size="sm"
            intent="secondary"
            className="rounded-r-none px-3"
          >
            Copy
          </CopyButton>
          <Dropdown modal={false}>
            <DropdownTrigger asChild>
              <Button
                size="sm"
                intent="secondary"
                className="rounded-l-none border-l-0 px-2"
                aria-label="More actions"
              >
                <ChevronDown className="size-4" aria-hidden />
              </Button>
            </DropdownTrigger>
            <DropdownContent align="end">
              <DropdownItem
                disabled={isRechecking}
                onSelect={() => revalidator.revalidate()}
              >
                <RotateCw className="size-4" aria-hidden />
                {isRechecking ? "Rechecking…" : "Recheck"}
              </DropdownItem>
            </DropdownContent>
          </Dropdown>
        </div>
      </div>

      <h1 className="font-serif text-headline-40 text-foreground">
        {pubTitle}
      </h1>
      <p className="text-caption-20 mb-4 font-mono text-carbon-400">
        {detail.slug}
        {detail.orgName ? ` · ${detail.orgName}` : ""}
      </p>

      <div className="mb-8 flex overflow-hidden rounded-lg border border-carbon-100 bg-white">
        <div className="flex-1 px-5 py-3">
          <p className="text-caption-20 mb-1 font-mono uppercase tracking-widest text-carbon-300">
            DOI
          </p>
          <span className="text-caption-20 font-mono text-foreground">
            {detail.doi}
          </span>
        </div>
        <div className="my-3 w-px shrink-0 bg-carbon-100" />
        <div className="flex-1 px-5 py-3">
          <p className="text-caption-20 mb-1 font-mono uppercase tracking-widest text-carbon-300">
            DOI Type
          </p>
          <span className="text-caption-20 text-foreground">
            {DOI_TYPE_LABELS[detail.type]}
          </span>
        </div>
        <div className="my-3 w-px shrink-0 bg-carbon-100" />
        <div className="flex-1 px-5 py-3">
          <p className="text-caption-20 mb-1 font-mono uppercase tracking-widest text-carbon-300">
            Result
          </p>
          <span
            className={cn(
              "text-caption-20",
              matches ? "text-mint-green-dark" : "text-error-900"
            )}
          >
            {resultText}
          </span>
        </div>
        <div className="my-3 w-px shrink-0 bg-carbon-100" />
        <div className="flex-1 px-5 py-3">
          <p className="text-caption-20 mb-1 font-mono uppercase tracking-widest text-carbon-300">
            Last Checked
          </p>
          <span className="text-caption-20 font-mono text-foreground">
            {formatUtcDateTime(checkedAt)}
          </span>
        </div>
      </div>

      {!found && (
        <p className="text-caption-20 mb-3 font-mono text-carbon-300">
          DataCite record unavailable
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-carbon-100 bg-white">
        <div className="flex items-center justify-between border-b border-carbon-100 bg-warm-sand-100 px-4 py-3">
          <span className="text-caption-20 font-mono uppercase tracking-widest text-carbon-400">
            Side-by-Side Comparison
          </span>
          <span className="text-caption-20 font-mono text-carbon-400">
            {found
              ? `${detail.diffs.length} differ · ${COMPARABLE_FIELDS.length - detail.diffs.length} match`
              : "DataCite record unavailable"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 border-b border-carbon-100 px-4 py-2">
          <div className="flex items-center justify-between">
            <span className="text-caption-20 font-mono uppercase tracking-widest text-carbon-400">
              The Stacks
            </span>
            <Button
              size="sm"
              intent="secondary"
              className="gap-1.5 px-3"
              disabled={!found || detail.pushableFields.length === 0}
              onClick={() => setIsPushDialogOpen(true)}
            >
              Push
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-caption-20 font-mono uppercase tracking-widest text-carbon-400">
              DataCite
            </span>
            {found ? (
              <Button
                asChild
                size="sm"
                intent="secondary"
                className="gap-1.5 px-3"
              >
                <a
                  href={detail.dataciteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open
                  <ArrowUpRight className="size-4" aria-hidden />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </Button>
            ) : (
              <Button
                size="sm"
                intent="secondary"
                className="gap-1.5 px-3"
                disabled
              >
                Open
                <ArrowUpRight className="size-4" aria-hidden />
              </Button>
            )}
          </div>
        </div>
        {COMPARABLE_FIELDS.map((def) => {
          const isDiff = detail.diffs.some((d) => d.field === def.label);
          return (
            <div
              key={def.label}
              className={cn(
                "border-b border-b-carbon-100 border-l-2 px-4 py-3 last:border-b-0",
                isDiff
                  ? "border-l-error-900 bg-peach-100"
                  : "border-l-transparent"
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-caption-20 font-mono text-carbon-900">
                  {def.label}
                </span>
                {isDiff && (
                  <span className="text-caption-20 font-mono text-error-900">
                    differs
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-caption-20 mb-1 font-mono uppercase tracking-widest text-carbon-200">
                    The Stacks
                  </p>
                  <pre className="text-caption-20 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-carbon-100 bg-off-white px-2 py-1.5 font-mono text-carbon-700">
                    {renderComparableValue(
                      extractComparableScalar(detail.stacksMetadata, def),
                      def
                    )}
                  </pre>
                </div>
                <div>
                  <p className="text-caption-20 mb-1 font-mono uppercase tracking-widest text-carbon-200">
                    DataCite
                  </p>
                  <pre className="text-caption-20 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-carbon-100 bg-off-white px-2 py-1.5 font-mono text-carbon-700">
                    {renderComparableValue(
                      extractComparableScalar(detail.dataciteMetadata, def),
                      def
                    )}
                  </pre>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <PushConfirmDialog
        open={isPushDialogOpen}
        onOpenChange={setIsPushDialogOpen}
        doi={detail.doi}
        fields={detail.pushableFields}
        skippedFields={detail.diffs
          .map((d) => d.field)
          .filter((field) => !detail.pushableFields.includes(field))}
        isPushing={isPushing}
        onConfirm={() => handlePush(detail)}
      />
    </div>
  );
}
