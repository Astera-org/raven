import { normalizeCrockfordBase32 } from "#src/lib/utils/normalize-crockford-base-32.js";
import { z } from "@hono/zod-openapi";

export function ulidSchema(opts?: { fieldName?: string }) {
  return z
    .string()
    .transform(normalizeCrockfordBase32)
    .refine((val) => /^[0-9A-HJKMNP-TV-Z]{26}$/.test(val), {
      message: opts?.fieldName
        ? `Invalid ULID for ${opts.fieldName}`
        : "Invalid ULID",
    });
}
