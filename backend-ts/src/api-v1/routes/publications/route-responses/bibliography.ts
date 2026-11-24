import { z } from "@hono/zod-openapi";

/**
 * A version's bibliography as a reader sees it: which files it has, and the
 * entries the document cites, parsed. The files themselves are only served
 * from the draft, to those who can see it, since a project's `.bib` files may
 * hold far more than the document cites.
 */
export const PublicationBibliographyResponseSchema = z.object({
  files: z.array(z.string()).openapi({
    description: "The names of the BibTeX files the bibliography was sent as.",
    example: ["refs.bib"],
  }),
  entries: z.record(z.string(), z.record(z.string(), z.unknown())).openapi({
    description:
      "The cited entries as CSL-JSON, by citation key. Entries the " +
      "document doesn't cite are left out.",
  }),
});

export const BibliographyResponseSchema = z.object({
  files: z
    .array(
      z.object({
        filename: z.string().openapi({ example: "refs.bib" }),
        content: z
          .string()
          .openapi({ description: "The file's BibTeX, as it was sent." }),
      })
    )
    .openapi({
      description:
        "The draft's BibTeX files, in the order they were sent. Empty for " +
        "a draft without a bibliography.",
    }),
});
