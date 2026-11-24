import { getConfig } from "#src/config.js";
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
import {
  lookupDoiComparison,
  toDoiLookupError,
  type DoiComparisonLookup,
} from "./helpers/lookup-doi-comparison.js";
import { pushDiffsToDataCite } from "./helpers/push-diffs-to-data-cite.js";
import { PostDoiPushBodySchema } from "./route-requests/post-doi-push.js";
import { AdminDoiPushResponseSchema } from "./route-responses/doi-push.js";

// ---------------------------------------------------------------------------
// POST /doi-pushes — push The Stacks' metadata for one DOI to DataCite
// ---------------------------------------------------------------------------

export const postDoiPushRoute = createAdminRoute({
  method: "post",
  path: "/doi-pushes",
  tags: ["doi-audits"],
  summary: "Push a DOI's differing fields to DataCite",
  description:
    "Sends DataCite the differing fields of the comparison `GET " +
    "/doi-comparisons` returns for the same `type` and `doi`, so its record " +
    "matches The Stacks. The comparison is rerun first, and the push is " +
    "refused unless its fingerprint still matches the one the caller " +
    "reviewed. Never sends `event`, so a removed publication's DOI stays " +
    "hidden.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: PostDoiPushBodySchema } },
    },
  },
  responses: {
    200: {
      description: "DataCite accepted the update.",
      content: { "application/json": { schema: AdminDoiPushResponseSchema } },
    },
    404: {
      description:
        "No publication in the caller's admin scope has this DOI, it has no " +
        "published version, or a `version` DOI isn't its latest version's DOI.",
      content: errorContent("publication", "doi"),
    },
    409: {
      description:
        "DataCite has no record for the DOI, the comparison changed since " +
        "the caller reviewed it, or no differing fields are left to push.",
      content: errorContent("datacite", "fingerprint", "root"),
    },
    502: {
      description:
        "DataCite couldn't be queried for the comparison (no response, an " +
        "error status such as a rate limit, or an unreadable body), or it " +
        "rejected the update.",
      content: errorContent("datacite"),
    },
    503: {
      description: "DataCite credentials are not configured on this server.",
      content: errorContent("datacite"),
    },
  },
});

/**
 * Reruns the comparison rather than trusting the client, and only pushes if it
 * still matches the fingerprint the admin confirmed, so nothing it sends can
 * differ from what they reviewed. It doesn't take the publication's DOI lock,
 * so it can interleave with a concurrent publish.
 */
export async function postDoiPushHandler(
  c: HandlerContext<typeof postDoiPushRoute, AdminEnv>
): HandlerReturnType<typeof postDoiPushRoute> {
  const { DATACITE_NAME, DATACITE_PASSWORD } = getConfig();
  if (!DATACITE_NAME || !DATACITE_PASSWORD) {
    return c.json(
      applicationError({
        datacite: {
          message: "DataCite credentials are not configured on this server",
        },
      }),
      503
    );
  }

  const { type, doi, fingerprint } = c.req.valid("json");
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
  const { result } = lookup;

  if (!result.found) {
    return c.json(
      applicationError({
        datacite: {
          message: "Could not retrieve metadata from DataCite for this DOI",
        },
      }),
      409
    );
  }
  if (comparisonFingerprint(result) !== fingerprint) {
    return c.json(
      applicationError({
        fingerprint: {
          message:
            "This comparison changed since you reviewed it. Reload and confirm the push again.",
        },
      }),
      409
    );
  }

  const pushedFields = pushableDiffFields(result);
  if (pushedFields.length === 0) {
    return c.json(
      applicationError({ root: { message: "No differing fields to push" } }),
      409
    );
  }

  if (!(await pushDiffsToDataCite(result))) {
    return c.json(
      applicationError({
        datacite: { message: "DataCite rejected the update" },
      }),
      502
    );
  }
  return c.json({ pushedFields }, 200);
}
