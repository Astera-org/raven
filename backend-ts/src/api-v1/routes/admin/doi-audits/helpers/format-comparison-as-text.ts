import { type DoiAttributes } from "#src/types/datacite.js";
import {
  toComparable,
  type ComparableMetadata,
  type MetadataComparisonResult,
  type StacksAttributes,
} from "./to-comparable.js";

// Mirrors the admin UI's side-by-side view: every diff field name is also its
// raw attribute key, except title/subtitle/abstract, which DataCite nests in
// arrays -- those are pulled out as plain strings the same way toComparable
// does.
function renderRawFieldValue(
  attrs: StacksAttributes | DoiAttributes | null,
  field: keyof ComparableMetadata
): string {
  if (field === "title" || field === "subtitle" || field === "abstract") {
    return (attrs ? toComparable(attrs)[field] : null) ?? "null";
  }
  return JSON.stringify(attrs?.[field] ?? null, null, 2);
}

export function formatComparisonAsText(
  result: MetadataComparisonResult
): string {
  const header = `=== ${result.doi} ===`;
  if (!result.found) return `${header}\n\nDataCite record unavailable\n`;
  if (result.matches) return `${header}\n\nNo differing fields\n`;

  const fieldBlocks = result.diffs.map(({ field }) =>
    [
      field,
      `The Stacks:\n${renderRawFieldValue(result.stacksMetadata, field)}`,
      `DataCite:\n${renderRawFieldValue(result.dataciteMetadata, field)}`,
    ].join("\n\n")
  );
  return `${[header, ...fieldBlocks].join("\n\n")}\n`;
}
