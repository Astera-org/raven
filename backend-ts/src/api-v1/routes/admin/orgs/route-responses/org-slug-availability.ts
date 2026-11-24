import { z } from "@hono/zod-openapi";

export const AdminOrgSlugAvailabilityResponseSchema = z
  .object({
    available: z.boolean().openapi({
      description:
        "False when any organization holds the slug, whatever its state. " +
        "Creating or renaming an organization to a taken slug suffixes it.",
    }),
  })
  .openapi("AdminOrgSlugAvailability");
