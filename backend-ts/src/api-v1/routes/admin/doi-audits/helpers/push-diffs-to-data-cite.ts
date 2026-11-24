import { dataciteUpdate } from "#src/lib/datacite/client.js";
import { buildPushAttributes } from "./build-push-attributes.js";
import { type MetadataComparisonResult } from "./to-comparable.js";

export async function pushDiffsToDataCite(
  result: MetadataComparisonResult
): Promise<boolean> {
  return dataciteUpdate(result.doi, {
    data: { type: "dois", attributes: buildPushAttributes(result) },
  });
}
