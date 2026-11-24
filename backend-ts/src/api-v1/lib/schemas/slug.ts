import { z } from "@hono/zod-openapi";

export const MAX_SLUG_LENGTH = 255;

function slugSchema(minLength: number) {
  return z
    .string()
    .regex(/^[a-z0-9-]+$/, {
      error: "Slug can only contain lowercase letters, numbers, and hyphens",
    })
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
      error:
        "Slug must not start or end with a hyphen and must not have consecutive hyphens",
    })
    .min(minLength, `Slug must be at least ${minLength} characters long`)
    .max(MAX_SLUG_LENGTH, `Slug must be ${MAX_SLUG_LENGTH} characters or less`);
}

export const SlugSchema = slugSchema(12);

export const OrgSlugSchema = slugSchema(3);
