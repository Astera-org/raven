import { makeRepositories } from "#v1/db-repositories/index.js";
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
import { loadDraftEtag } from "./helpers/draft-etag.js";
import { BibliographyResponseSchema } from "./route-responses/bibliography.js";

export const getDraftBibliographyRoute = createAuthedRoute({
  method: "get",
  path: "/id/{id}/draft/bibliography",
  tags: ["publications"],
  summary: "Get the draft's bibliography",
  description:
    "Returns the draft's BibTeX files as they were sent, for anyone who " +
    "can see the draft. A published version exposes only the entries its " +
    "document cites, parsed, as part of the version itself.",
  request: {
    params: z.object({ id: ulidSchema({ fieldName: "id" }) }),
  },
  responses: {
    200: {
      description: "The draft's bibliography, empty for a draft without one.",
      headers: z.object({
        ETag: z.string().openapi({
          description: "The draft's ETag, for `If-Match` on the next write.",
        }),
      }),
      content: {
        "application/json": { schema: BibliographyResponseSchema },
      },
    },
    403: {
      description:
        "The authenticated user does not have view permission on this " +
        "publication's draft.",
      content: errorContent("auth"),
    },
    404: {
      description:
        "No publication exists for the given ID, or it has no draft.",
      content: errorContent("publication", "draft"),
    },
  },
});

export async function getDraftBibliographyHandler(
  c: HandlerContext<typeof getDraftBibliographyRoute>
): HandlerReturnType<typeof getDraftBibliographyRoute> {
  const user = c.var.user;
  const { id } = c.req.valid("param");
  const repos = makeRepositories();
  const publication = await repos.publications.findById(id, {
    includeDeleted: false,
  });
  if (!publication) {
    return c.json(
      applicationError({ publication: { message: "Publication not found" } }),
      404
    );
  }
  if (
    !(await repos.publications.canViewDraft(user.id, id, publication.ownerId))
  ) {
    return c.json(
      applicationError({ auth: { message: "Permission denied" } }),
      403
    );
  }

  const draft = await repos.versions.findDraftForPublication(id);
  if (!draft) {
    return c.json(
      applicationError({ draft: { message: "No draft found" } }),
      404
    );
  }

  return c.json({ files: draft.bibliography?.files ?? [] }, 200, {
    ETag: await loadDraftEtag(repos, publication, draft),
  });
}
