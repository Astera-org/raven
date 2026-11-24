import { type JsonValue } from "#src/types/generics.js";
import { createHash } from "node:crypto";
import { buildPushAttributes } from "./build-push-attributes.js";
import { type MetadataComparisonResult } from "./to-comparable.js";

// Attributes whose element order carries no meaning -- supplements, which end
// up in relatedIdentifiers, aren't even fetched in a fixed order -- so a
// reordering between requests isn't a change. Other arrays keep their order:
// creator order is the citation's author order, and titles/descriptions lead
// with the main entry.
const UNORDERED_ARRAY_ATTRIBUTES = new Set([
  "relatedIdentifiers",
  "subjects",
  "rightsList",
  "dates",
]);

// Sorts object keys at every depth, so key order never affects the result.
function withSortedKeys(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(withSortedKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, withSortedKeys(value[key])])
  );
}

function canonicalAttribute(key: string, value: JsonValue): JsonValue {
  const sorted = withSortedKeys(value ?? null);
  if (!UNORDERED_ARRAY_ATTRIBUTES.has(key) || !Array.isArray(sorted)) {
    return sorted;
  }
  return sorted
    .map((element) => JSON.stringify(element))
    .sort()
    .map((element) => JSON.parse(element) as JsonValue);
}

/**
 * Identifies exactly what a push would do: the raw attributes it would send
 * and DataCite's current values for those same attributes. The push route
 * refuses a push whose fingerprint no longer matches what the admin
 * reviewed, so nothing it writes can differ from what they confirmed --
 * including parts of a field the comparison itself ignores (non-Abstract
 * descriptions, contributor roles). Only pushed attributes are
 * read from DataCite's record, so fields it rewrites itself (updated,
 * registered, state, counters) never affect it.
 */
export function comparisonFingerprint(
  result: MetadataComparisonResult
): string {
  const outgoing = buildPushAttributes(result);
  const keys = Object.keys(outgoing).sort();
  const pick = (attrs: { [key: string]: JsonValue } | null) =>
    Object.fromEntries(
      keys.map((key) => [key, canonicalAttribute(key, attrs?.[key])])
    );
  const payload = JSON.stringify({
    doi: result.doi.toLowerCase(),
    outgoing: pick(outgoing),
    datacite: pick(result.dataciteMetadata),
  });
  return createHash("sha256").update(payload).digest("hex");
}
