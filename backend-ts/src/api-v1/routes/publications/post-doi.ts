import {
  mintDoiForNewVersionDraft,
  mintDoisForNewPubDraft,
  updateDraftDois,
} from "#src/lib/datacite/client.js";
import {
  DoiLockTimeoutError,
  withPublicationDoiLock,
} from "#src/lib/publication-doi-lock.js";
import { Repositories } from "#v1/db-repositories/index.js";
import { createAuthedRoute } from "#v1/lib/create-authed-route.js";
import {
  applicationError,
  errorContent,
} from "#v1/lib/route-responses/error-content.js";
import { ulidSchema } from "#v1/lib/schemas/ulid-schema.js";
import {
  type HandlerContext,
  type HandlerReturnType,
} from "#v1/types/handler.js";
import { z } from "@hono/zod-openapi";
import { PostDoiResponseSchema } from "./route-responses/doi.js";

export const postDoiRoute = createAuthedRoute({
  method: "post",
  path: "/id/{id}/doi",
  stability: "stable",
  tags: ["publications"],
  summary: "Mint or update draft DOI metadata",
  description:
    "Mints a DOI for the publication draft if one is not already present, " +
    "or updates existing DOI metadata in DataCite.",
  request: {
    params: z.object({ id: ulidSchema({ fieldName: "id" }) }),
  },
  responses: {
    200: {
      description:
        "A DOI now exists for the publication (either newly minted or " +
        "already present) and the draft was promoted.",
      content: {
        "application/json": {
          schema: PostDoiResponseSchema,
        },
      },
    },
    403: {
      description:
        "The authenticated user does not have edit permission on this " +
        "publication.",
      content: errorContent("auth"),
    },
    404: {
      description: "No publication exists for the given ID.",
      content: errorContent("publication"),
    },
    409: {
      description:
        "Publication DOI can only be added or updated if a new version " +
        "draft already exists, or a DOI operation for this publication is " +
        "already in progress",
      content: errorContent("draft", "doi"),
    },
    500: {
      description: "DOI minting failed on our end",
      content: errorContent("datacite"),
    },
  },
});

export async function postDoiHandler(
  c: HandlerContext<typeof postDoiRoute>
): HandlerReturnType<typeof postDoiRoute> {
  const user = c.var.user;
  const id = c.req.valid("param").id;
  const repos = new Repositories();
  const publication = await repos.publications.findById(id);
  if (!publication) {
    return c.json(
      applicationError({ publication: { message: "Publication not found" } }),
      404
    );
  }

  if (
    !(await repos.publications.canEdit(
      user.id,
      publication.id,
      publication.ownerId
    ))
  ) {
    return c.json(
      applicationError({ auth: { message: "Permission denied" } }),
      403
    );
  }

  const version = await repos.versions.findDraftForPublication(publication.id);

  if (!version) {
    return c.json(
      applicationError({
        draft: { message: "No open draft found for publication" },
      }),
      409
    );
  }

  const versionId = version.id;

  // If the publication has already been published (this draft is a
  // subsequent version), the concept DOI is already public and must keep
  // reflecting that published version's metadata — only the version DOI
  // should be touched while this draft is being edited.
  const updateCanonical = publication.state !== "PUBLISHED";

  let canonicalDoi = publication.doi;
  let versionDoi = version.doi;

  const potentialOrgs = await repos.orgs.listPotentialOrgsForPublication(
    publication.id,
    publication.ownerId
  );

  const mintingEnabledForDraft = potentialOrgs.some((o) => o.doiMintingEnabled);

  if (!mintingEnabledForDraft) {
    return c.json(
      applicationError({ auth: { message: "Permission denied" } }),
      403
    );
  }

  let updateFailed = false;

  try {
    await withPublicationDoiLock(publication.id, async () => {
      // Re-read DOI state now that we hold the per-publication lock: the
      // values fetched above may be stale if another request minted DOIs
      // for this publication while we were waiting for the lock.
      const [freshPublication, freshVersion] = await Promise.all([
        repos.publications.findById(id),
        repos.versions.findById(versionId),
      ]);
      canonicalDoi = freshPublication?.doi ?? null;
      versionDoi = freshVersion?.doi ?? null;

      if (canonicalDoi && versionDoi) {
        const published = await updateDraftDois(
          repos,
          publication.id,
          version.id,
          {
            slug: publication.slug,
            // It's passed readiness so we know it has a title
            title: version.title!,
            subtitle: version.subtitle,
            abstract: version.abstract,
            license: publication.license,
            versionNumber: version.versionNumber,
            versionDesc: version.versionDesc,
            publishDate: null,
            canonicalDoi,
            versionDoi,
          },
          updateCanonical
        );
        if (published === "inaccessible") {
          // Clear the association only after confirmed access denial.
          // Operational failures must preserve the existing DOI for recovery.
          await repos.versions.update(versionId, { doi: null });
          versionDoi = null;
        } else if (published === "failure") {
          updateFailed = true;
        }
      } else if (canonicalDoi) {
        const vDoi = await mintDoiForNewVersionDraft(
          repos,
          publication.id,
          version.id,
          {
            slug: publication.slug,
            title: version.title ?? "",
            subtitle: version.subtitle ?? "",
            abstract: version.abstract ?? "",
            license: publication.license,
            versionNumber: version.versionNumber,
            versionDesc: version.versionDesc ?? "",
            publishDate: null,
            canonicalDoi,
            draft: true,
            updateCanonical,
          }
        );
        if (vDoi) {
          await repos.versions.update(versionId, { doi: vDoi });
          versionDoi = vDoi;
        }
      } else {
        const [cDoi, vDoi] = await mintDoisForNewPubDraft(
          repos,
          publication.id,
          version.id,
          {
            slug: publication.slug,
            title: version.title ?? "",
            subtitle: version.subtitle ?? "",
            abstract: version.abstract ?? "",
            license: publication.license,
            versionDesc: version.versionDesc ?? "",
            publishDate: null,
            draft: true,
          }
        );
        if (cDoi) {
          await repos.publications.update(id, { doi: cDoi });
          canonicalDoi = cDoi;
        }
        if (vDoi) {
          await repos.versions.update(versionId, { doi: vDoi });
          versionDoi = vDoi;
        }
      }
    });
  } catch (e) {
    if (e instanceof DoiLockTimeoutError) {
      return c.json(
        applicationError({
          doi: {
            message:
              "A DOI operation for this publication is already in progress",
          },
        }),
        409
      );
    }
    c.var.logger.error({ err: e }, "DOI minting error");
  }

  if (updateFailed) {
    c.var.logger.error(
      "Server failed to update DOI metadata, are your datacite environment variables set?"
    );
    return c.json(
      applicationError({
        datacite: { message: "Server failed to update DOI metadata" },
      }),
      500
    );
  }

  if (canonicalDoi === null) {
    c.var.logger.error(
      "DOI not minted, are your datacite environment variables set?"
    );
    return c.json(
      applicationError({
        datacite: { message: "Server failed to mint a DOI" },
      }),
      500
    );
  }

  return c.json(
    {
      publicationId: publication.id,
      slug: publication.slug,
      versionNumber: version.versionNumber,
      doi: canonicalDoi,
      versionDoi: versionDoi,
    },
    200
  );
}
