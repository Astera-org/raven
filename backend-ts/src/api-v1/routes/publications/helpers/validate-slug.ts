import { type ValidationIssue } from "#src/lib/middleware/validation-errors.js";
import { Repositories } from "#v1/db-repositories/index.js";
import { SlugSchema } from "#v1/lib/schemas/slug.js";
import { type PatchPublicationPermissive } from "#v1/routes/publications/route-requests/patch-publication.js";
import { z } from "@hono/zod-openapi";
import { findAvailableSlug } from "./find-available-slug.js";

/** Issue code for the warning sent when a taken slug is swapped for a free one. */
export const SLUG_REPLACED_CODE = "slug_replaced";

type SlugValidation = {
  /** The slug to store: the current one, the requested one, or a free variant of it. */
  slug: string;
  /** Set when the requested slug cannot be stored at all. */
  rejection?: ValidationIssue;
  /** Set when a taken slug was swapped for a free variant. */
  warning?: ValidationIssue;
};

export async function validateSlug(
  slug: string,
  body: PatchPublicationPermissive,
  pubState?: string | null
): Promise<SlugValidation> {
  if (!("slug" in body)) {
    return { slug };
  }

  const providedSlug = body["slug"];
  const newSlug = (typeof providedSlug === "string" ? providedSlug : "")
    .trim()
    .toLowerCase();
  if (newSlug === slug) {
    return { slug };
  }

  if (pubState && pubState !== "DRAFT") {
    return {
      slug,
      rejection: {
        code: "custom",
        path: ["slug"],
        message:
          "Slug can only be updated while the publication is being drafted",
      },
    };
  }

  const slugResult = z
    .object({ slug: SlugSchema })
    .safeParse({ slug: newSlug });
  if (!slugResult.success) {
    return { slug, rejection: slugResult.error.issues[0] };
  }

  if (!(await new Repositories().publications.findBySlug(newSlug))) {
    return { slug: newSlug };
  }

  const availableSlug = await findAvailableSlug(newSlug, slug);
  return {
    slug: availableSlug,
    warning: {
      code: SLUG_REPLACED_CODE,
      path: ["slug"],
      message: `The slug "${newSlug}" is already taken, so "${availableSlug}" was used instead`,
    },
  };
}
