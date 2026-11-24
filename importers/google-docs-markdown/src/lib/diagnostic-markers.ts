import type {
  ImportDiagnostic,
  ImportDiagnosticInput,
  SourceRange,
} from "@raven/core-import-format";

/**
 * Diagnostics are found in intermediate text whose positions don't survive the
 * rest of the pipeline, so the converter wraps the affected content in
 * invisible markers and the final text is searched for them afterwards.
 * Private Use Area characters, distinct from the ones `protectNonProse` uses.
 */
const START = "\uE002";
const END = "\uE003";
const ID_END = "\uE004";
const MARKER_PATTERN = /([\uE002\uE003])(\d+)\uE004/g;

/** `markerId` is left out for diagnostics that aren't about a span of text. */
export type PendingDiagnostic = Omit<ImportDiagnosticInput, "range"> & {
  markerId?: number;
};

/**
 * Collects diagnostics and hands out their marker ids. Shared by every step
 * that adds markers to the same text, so their ids don't collide.
 */
export class DiagnosticCollector {
  readonly pending: PendingDiagnostic[] = [];
  private nextMarkerId = 1;

  /** An id for markers whose diagnostic is reported later. */
  newMarkerId(): number {
    return this.nextMarkerId++;
  }

  /** Records a diagnostic, returning the id its markers should use. */
  report(
    diagnostic: Omit<PendingDiagnostic, "markerId">,
    markerId = this.newMarkerId()
  ): number {
    this.pending.push({ ...diagnostic, markerId });
    return markerId;
  }

  /**
   * Drops the diagnostics whose markers are in `text`, for output that was
   * thrown away and redone, so they aren't reported twice.
   */
  discardMarkedIn(text: string): void {
    const discarded = markerIds(text);
    const kept = this.pending.filter(
      ({ markerId }) => markerId === undefined || !discarded.has(markerId)
    );
    this.pending.splice(0, this.pending.length, ...kept);
  }
}

export function markerIds(text: string): Set<number> {
  return new Set(
    Array.from(text.matchAll(MARKER_PATTERN), (match) => Number(match[2]))
  );
}

export function startMarker(id: number): string {
  return `${START}${id}${ID_END}`;
}

export function endMarker(id: number): string {
  return `${END}${id}${ID_END}`;
}

export function stripMarkers(text: string): string {
  return text.replace(MARKER_PATTERN, "");
}

/**
 * Removes the markers from each field and turns every pending diagnostic into
 * one located in the field its markers ended up in. A diagnostic whose markers
 * were dropped along with their content keeps its own path and no range.
 */
export function resolveDiagnosticMarkers<K extends string>(
  fields: Record<K, string>,
  fieldPaths: Record<K, ImportDiagnostic["path"]>,
  pending: PendingDiagnostic[]
): { fields: Record<K, string>; diagnostics: ImportDiagnosticInput[] } {
  const stripped = {} as Record<K, string>;
  const located = new Map<number, { key: K; range: SourceRange }>();

  for (const key of Object.keys(fields) as K[]) {
    const { text, ranges } = extractMarkers(fields[key]);
    stripped[key] = text;
    for (const [id, range] of ranges) located.set(id, { key, range });
  }

  const diagnostics = pending.map(({ markerId, ...diagnostic }) => {
    const location = markerId === undefined ? undefined : located.get(markerId);
    if (!location) return diagnostic;
    return {
      ...diagnostic,
      path: fieldPaths[location.key],
      range: location.range,
    };
  });

  return { fields: stripped, diagnostics };
}

function extractMarkers(marked: string): {
  text: string;
  ranges: Map<number, SourceRange>;
} {
  // A marker given a line of its own, so it couldn't break the content next to
  // it, attaches to that content instead of leaving a blank line behind.
  marked = marked
    .replace(/^(\uE002\d+\uE004)\n+/gm, "$1")
    .replace(/\n+(\uE003\d+\uE004)$/gm, "$1");

  const starts = new Map<number, { line: number; column: number }>();
  const ranges = new Map<number, SourceRange>();
  let text = "";
  let line = 1;
  let column = 1;
  let lastIndex = 0;

  const advance = (chunk: string) => {
    text += chunk;
    const lines = chunk.split("\n");
    if (lines.length > 1) {
      line += lines.length - 1;
      column = 1;
    }
    column += lines.at(-1)!.length;
  };

  for (const match of marked.matchAll(MARKER_PATTERN)) {
    advance(marked.slice(lastIndex, match.index));
    lastIndex = match.index + match[0].length;

    const id = Number(match[2]);
    if (match[1] === START) {
      starts.set(id, { line, column });
      continue;
    }
    const start = starts.get(id);
    if (!start) continue;
    ranges.set(id, {
      startLine: start.line,
      startColumn: start.column,
      endLine: line,
      endColumn: column,
    });
  }
  advance(marked.slice(lastIndex));

  return { text, ranges };
}
