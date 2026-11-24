import { z } from "@hono/zod-openapi";

/**
 * The file's path from the root of the author's project (the document's
 * directory for a single file), not from the page, whose bibliography may
 * sit above it. It names the file in `GET .../draft/bibliography` and in the
 * CLI, which may write it back to disk, so it stays a relative path that
 * can't leave that root.
 */
const BibliographyFilenameSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((name) => !name.startsWith("/") && !name.includes("\\"), {
    message: "Use a relative path, with / between its segments",
  })
  .refine((name) => !name.split("/").includes(".."), {
    message: "The path must not leave the project's directory",
  })
  .openapi({ example: "refs.bib" });

export const BibliographyFileRequestSchema = z.object({
  filename: BibliographyFilenameSchema,
  content: z.string().openapi({
    description: "The file's BibTeX, as written.",
    example:
      "@article{smith2020,\n  title = {On things},\n  year = {2020},\n}\n",
  }),
});

export const PutDraftBibliographyBodySchema = z.object({
  files: z
    .array(BibliographyFileRequestSchema)
    .superRefine((files, ctx) => {
      const seen = new Set<string>();
      files.forEach(({ filename }, index) => {
        if (seen.has(filename)) {
          ctx.addIssue({
            code: "custom",
            path: [index, "filename"],
            message: `The bibliography already has a file called ${filename}`,
          });
        }
        seen.add(filename);
      });
    })
    .openapi({
      description:
        "Every BibTeX file of the publication's bibliography. The list " +
        "replaces the draft's: an empty one removes its bibliography.",
    }),
});
