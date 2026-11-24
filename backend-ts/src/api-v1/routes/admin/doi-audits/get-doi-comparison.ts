import { dataciteWebUrl } from "#src/lib/datacite/client.js";
import { DataciteRequestError } from "#src/lib/errors/datacite-request-error.js";
import { makeRepositories } from "#v1/db-repositories/index.js";
import { createAdminRoute } from "#v1/lib/create-admin-route.js";
import {
  applicationError,
  errorContent,
} from "#v1/lib/route-responses/error-content.js";
import { type AdminEnv } from "#v1/routes/admin/middleware/require-admin-scope.js";
import {
  type HandlerContext,
  type HandlerReturnType,
} from "#v1/types/handler.js";
import { pushableDiffFields } from "./helpers/build-push-attributes.js";
import { comparisonFingerprint } from "./helpers/comparison-fingerprint.js";
import { formatComparisonAsText } from "./helpers/format-comparison-as-text.js";
import {
  lookupDoiComparison,
  toDoiLookupError,
  type DoiComparisonLookup,
} from "./helpers/lookup-doi-comparison.js";
import { GetDoiComparisonQuerySchema } from "./route-requests/get-doi-comparison.js";
import { AdminDoiComparisonResponseSchema } from "./route-responses/doi-comparison.js";

// ---------------------------------------------------------------------------
// GET /doi-comparisons — compare one DOI with its DataCite record
// ---------------------------------------------------------------------------

export const getDoiComparisonRoute = createAdminRoute({
  method: "get",
  path: "/doi-comparisons",
  tags: ["doi-audits"],
  summary: "Compare a DOI with its DataCite record",
  description:
    "Compares DataCite's record for a publication's canonical DOI, or its " +
    "latest version's DOI, with the metadata The Stacks would send for it. " +
    "Covers published and removed publications. Org admins can only compare " +
    "DOIs of publications in the orgs they administer.",
  request: { query: GetDoiComparisonQuerySchema },
  responses: {
    200: {
      description: "The comparison.",
      content: {
        "application/json": { schema: AdminDoiComparisonResponseSchema },
      },
    },
    404: {
      description:
        "No publication in the caller's admin scope has this DOI, it has no " +
        "published version, or a `version` DOI isn't its latest version's DOI.",
      content: errorContent("publication", "doi"),
    },
    502: {
      description:
        "DataCite couldn't be queried: no response, an error status such as " +
        "a rate limit, or an unreadable body.",
      content: errorContent("datacite"),
    },
  },
});

export async function getDoiComparisonHandler(
  c: HandlerContext<typeof getDoiComparisonRoute, AdminEnv>
): HandlerReturnType<typeof getDoiComparisonRoute> {
  const { type, doi } = c.req.valid("query");
  let lookup: DoiComparisonLookup;
  try {
    lookup = await lookupDoiComparison(
      makeRepositories(),
      c.var.adminScope,
      type,
      doi
    );
  } catch (e) {
    if (!(e instanceof DataciteRequestError)) throw e;
    c.var.logger.error({ err: e, doi }, "DataCite GET failed");
    return c.json(
      applicationError({
        datacite: { message: "Could not query DataCite for this DOI" },
      }),
      502
    );
  }

  if (!lookup.ok) {
    return c.json(applicationError(toDoiLookupError(lookup.reason)), 404);
  }

  const { publication, orgName, result } = lookup;
  return c.json(
    {
      publicationId: publication.id,
      slug: publication.slug,
      orgName,
      type,
      ...result,
      text: formatComparisonAsText(result),
      pushableFields: pushableDiffFields(result),
      dataciteUrl: dataciteWebUrl(result.doi),
      fingerprint: comparisonFingerprint(result),
    },
    200
  );
}
