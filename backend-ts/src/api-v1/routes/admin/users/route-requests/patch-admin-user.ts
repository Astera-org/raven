import { z } from "@hono/zod-openapi";

const ORCID_REGEX = /^\d{4}-\d{4}-\d{4}-\d{3}[0-9X]$/;

export const AdminUpdateUserBodySchema = z
  .object({
    // Normalized the way BetterAuth stores emails at sign-up.
    email: z.string().trim().toLowerCase().pipe(z.email().max(255)).optional(),
    orcid: z
      .string()
      .regex(ORCID_REGEX, "ORCID iD must look like 0000-0002-1825-0097.")
      .nullable()
      .optional(),
    emailVerified: z.boolean().optional(),
  })
  .openapi("AdminUpdateUserBody");
