import { z } from "@hono/zod-openapi";

export const MediaAssetResponseSchema = z.object({
  url: z.string().openapi({
    description: "The file's public URL, to reference from the draft's body.",
  }),
  sha256: z.string().openapi({
    description: "The SHA-256 of the file's bytes, in hex.",
  }),
  draftCreated: z.boolean().openapi({
    description: "Whether this upload opened the draft.",
  }),
});
