import { z } from "@hono/zod-openapi";

/**
 * A hypermedia control: where to go next from a response, and why. `rel`
 * says what the link is for, e.g. `edit` for the web editor.
 */
export const LinkSchema = z
  .object({
    rel: z.string().openapi({ example: "edit" }),
    href: z.string().openapi({
      example:
        "https://thestacks.org/publications/01KX2C5W4Q8T3VZ9M6N7P1R0BD/edit",
    }),
  })
  .openapi("Link");

export const LinksSchema = z.array(LinkSchema).openapi({
  description: "Where to go next from this response, by `rel`.",
});
export type Links = z.infer<typeof LinksSchema>;
