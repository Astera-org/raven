import { type AdminPublicationResponse } from "@raven/backend-ts/types";
import { safe } from "~/api/api-error";
import { apiV1 } from "~/api/hono-client";
import { rethrowForRoute } from "~/lib/rethrow-for-route";

export type AdminPublicationLoad =
  | { forbidden: false; publication: AdminPublicationResponse }
  | { forbidden: true };

/**
 * A 404 (or 422 for a bad version number) becomes a not-found route
 * response; 401/403 returns `forbidden` so the page shows site-admin only.
 */
export async function loadAdminPublication(
  { slug, versionNumber }: { slug: string; versionNumber?: string },
  signal: AbortSignal
): Promise<AdminPublicationLoad> {
  const publicationRoute = apiV1.admin.publications[":idOrSlug"];
  const versionRoute = publicationRoute.versions[":versionNumber"];
  const idOrSlug = encodeURIComponent(slug);
  const requestOptions = { init: { signal } };

  const fetchPublication = () =>
    safe(publicationRoute.$get({ param: { idOrSlug } }, requestOptions));
  const fetchVersion = (version: string) =>
    safe(
      versionRoute.$get(
        { param: { idOrSlug, versionNumber: encodeURIComponent(version) } },
        requestOptions
      )
    );

  const result =
    versionNumber === undefined
      ? await fetchPublication()
      : await fetchVersion(versionNumber);
  if (result.ok) {
    return { forbidden: false, publication: result.data.publication };
  }

  const { error } = result;
  // An abort while reading an error body keeps that response's status, so a
  // cancelled navigation would otherwise be mapped like the response.
  if (error.kind === "aborted") rethrowForRoute(error);
  if (
    error.isNotFound ||
    (versionNumber !== undefined && error.status === 422)
  ) {
    throw new Response("Not found", { status: 404 });
  }
  if (error.status === 401 || error.status === 403) {
    return { forbidden: true };
  }
  rethrowForRoute(error);
}
