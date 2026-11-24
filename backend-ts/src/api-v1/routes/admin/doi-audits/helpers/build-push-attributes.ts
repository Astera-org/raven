import { type DataCiteAttributesPatch } from "#src/lib/datacite/client.js";
import {
  type ComparableMetadata,
  type MetadataComparisonResult,
  type StacksAttributes,
} from "./to-comparable.js";

// Every diff field name is also its DataCite attribute key, except these,
// which DataCite nests in arrays (see toComparable).
const DIFF_FIELD_ATTRIBUTE_KEYS = {
  title: "titles",
  subtitle: "titles",
  abstract: "descriptions",
} as const satisfies Partial<
  Record<keyof ComparableMetadata, keyof StacksAttributes>
>;

// A field The Stacks has no value for is cleared on DataCite: to [] for these
// array attributes, to null for the rest.
const ARRAY_ATTRIBUTES = new Set<keyof StacksAttributes>([
  "titles",
  "descriptions",
  "subjects",
  "rightsList",
  "creators",
  "contributors",
  "dates",
  "relatedIdentifiers",
]);

// Compared but never pushed: `url` is derived from BASE_URL_WEB, so outside
// production it would point the DOI's landing page at a non-public host.
// `event`, `doi` and `prefix` can't be pushed at all: toComparable doesn't
// compare them, so they never appear as diffs.
const NON_PUSHABLE_FIELDS: ReadonlySet<keyof ComparableMetadata> = new Set([
  "url",
]);

function isNestedDiffField(
  field: keyof ComparableMetadata
): field is keyof typeof DIFF_FIELD_ATTRIBUTE_KEYS {
  return Object.hasOwn(DIFF_FIELD_ATTRIBUTE_KEYS, field);
}

function attributeKeyFor(
  field: keyof ComparableMetadata
): keyof StacksAttributes {
  return isNestedDiffField(field) ? DIFF_FIELD_ATTRIBUTE_KEYS[field] : field;
}

/** The differing fields a push would actually send, in diff order. */
export function pushableDiffFields(
  result: MetadataComparisonResult
): Array<keyof ComparableMetadata> {
  return result.diffs
    .map((d) => d.field)
    .filter((field) => !NON_PUSHABLE_FIELDS.has(field));
}

/**
 * The attributes to PUT so DataCite matches The Stacks for every pushable
 * differing field. DataCite leaves attributes a PUT omits unchanged, so this
 * is a partial update; array attributes are sent, and replaced, whole.
 */
export function buildPushAttributes(
  result: MetadataComparisonResult
): DataCiteAttributesPatch {
  const attributes: DataCiteAttributesPatch = {};
  for (const field of pushableDiffFields(result)) {
    copyAttribute(attributes, result.stacksMetadata, attributeKeyFor(field));
  }
  return attributes;
}

// Generic over one key so TS checks each attribute's value against its own
// type, which it can't do when writing through a union of keys.
function copyAttribute<K extends keyof StacksAttributes>(
  target: DataCiteAttributesPatch,
  source: StacksAttributes,
  key: K
) {
  // TS can't tie ARRAY_ATTRIBUTES membership to K's type, so [] needs a cast.
  target[key] =
    source[key] ??
    ((ARRAY_ATTRIBUTES.has(key) ? [] : null) as DataCiteAttributesPatch[K]);
}
