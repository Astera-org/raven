import {
  JsonValidationErrorsMiddlewareReturnSchema,
  ValidationIssuesResponse,
} from "#src/lib/middleware/validation-errors.js";
import { errorContent } from "#v1/lib/route-responses/error-content.js";
import { MDAST_MEDIA_TYPE } from "#v1/routes/publications/helpers/negotiate-mdast.js";
import { z } from "@hono/zod-openapi";

export const MdastResponseSchema = z
  .object({
    schema: z.int().openapi({
      description:
        "The version of this wrapper and of Raven's conventions inside the " +
        "tree. Request one with the `schema` parameter of `Accept`.",
    }),
    version: z.int().openapi({
      description:
        "The MyST AST version, as `myst-migrate` counts it " +
        "(`MIGRATIONS.length`). Request an older one with the `version` " +
        "parameter of `Accept`; a client on a newer version upgrades the " +
        "tree with `migrate()`.",
    }),
    tree: z.record(z.string(), z.unknown()).openapi({
      description:
        "The MyST AST (`myst-spec`): a root with two blocks, " +
        '`data.part` `"abstract"` and `"body"`. Nodes carry deterministic ' +
        "`key`s and no `position`; math is not pre-rendered; `cite` nodes " +
        "are labelled with the reference URL and numbered.",
    }),
    citations: z.object({
      order: z.array(z.string()).openapi({
        description:
          "Reference URLs in citation order; a `cite` node's " +
          "`enumerator` is its position here, counting from 1.",
      }),
    }),
    frontmatter: z
      .object({
        math: z
          .record(z.string(), z.looseObject({ macro: z.string() }))
          .optional()
          .openapi({
            description:
              "LaTeX macros by name (`\\R`), from the document's `math` " +
              "frontmatter, for rendering its math with KaTeX.",
          }),
      })
      .optional()
      .openapi({
        description:
          "The frontmatter needed to render the tree. Absent when there is none.",
      }),
    messages: z
      .array(
        z.object({
          severity: z.enum(["error", "warning"]),
          message: z.string(),
          part: z.enum(["abstract", "body"]).optional(),
          line: z
            .int()
            .optional()
            .openapi({
              description:
                "Counting from 1 within `part`. For inline content, the line " +
                "its paragraph starts on.",
            }),
        })
      )
      .optional()
      .openapi({
        description: "Problems found while building; drafts only.",
      }),
  })
  .openapi({
    description:
      `The \`${MDAST_MEDIA_TYPE}\` representation, for rendering MyST ` +
      "publications.",
  });

export const mdastContent = {
  [MDAST_MEDIA_TYPE]: { schema: MdastResponseSchema },
};

export const MDAST_ACCEPT_DESCRIPTION =
  `With \`Accept: ${MDAST_MEDIA_TYPE}; schema=1; version=3\`, a MyST ` +
  "version comes back as its MyST AST, for rendering. `schema` and " +
  "`version` are optional (default: the latest) and must come before any " +
  "`q`; an older `version` is migrated down, a newer one gets the latest. " +
  "The AST is only sent when its type is named explicitly and preferred " +
  "over the other types offered. Its `ETag` is for `If-None-Match`, not " +
  "`If-Match`.";

export const mdastResponses = {
  304: {
    description: "The AST matches `If-None-Match`.",
  },
  422: {
    description:
      `${ValidationIssuesResponse[422].description} Or: the AST could not ` +
      "be built, or the abstract and body are too large for it.",
    content: {
      "application/json": {
        schema: z.union([
          JsonValidationErrorsMiddlewareReturnSchema,
          errorContent()["application/json"].schema,
        ]),
      },
    },
  },
};
