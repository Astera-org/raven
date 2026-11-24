import {
  buildVersionPayload,
  dataciteRawGet,
  type VersionMetadata,
} from "#src/lib/datacite/client.js";
import {
  diffComparable,
  toComparable,
  type MetadataComparisonResult,
} from "./to-comparable.js";

export async function compareVersionDoiMetadata(
  doi: string,
  meta: VersionMetadata
): Promise<MetadataComparisonResult> {
  // allSettled, so a failed payload build can't return while the DataCite
  // request is still in flight. The DataCite error wins if both fail.
  const [actual, expected] = await Promise.allSettled([
    dataciteRawGet(doi),
    buildVersionPayload(meta, { doi, draft: false }),
  ]);
  if (actual.status === "rejected") throw actual.reason;
  if (expected.status === "rejected") throw expected.reason;
  const actualAttrs = actual.value;
  const stacksMetadata = expected.value.data.attributes;
  if (!actualAttrs) {
    return {
      doi,
      found: false,
      matches: false,
      diffs: [],
      stacksMetadata,
      dataciteMetadata: null,
    };
  }

  const diffs = diffComparable(
    toComparable(stacksMetadata),
    toComparable(actualAttrs)
  );
  return {
    doi,
    found: true,
    matches: diffs.length === 0,
    diffs,
    stacksMetadata,
    dataciteMetadata: actualAttrs,
  };
}
