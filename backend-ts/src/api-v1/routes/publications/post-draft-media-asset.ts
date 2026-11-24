import { getConfig } from "#src/config.js";
import { MalformedInputError } from "#src/lib/errors/malformed-input.js";
import { MediaTooLargeError } from "#src/lib/errors/media-too-large-error.js";
import { UnsupportedMediaError } from "#src/lib/errors/unsupported-media-error.js";
import { mediaS3Key } from "#src/lib/media/media-s3-key.js";
import { storeMedia } from "#src/lib/media/store-media.js";
import { requireTrustedOrigin } from "#src/lib/middleware/require-trusted-origin.js";
import { ValidationIssuesResponse } from "#src/lib/middleware/validation-errors.js";
import { isLockConflictError } from "#src/lib/utils/db-errors.js";
import { type AuthEnv } from "#src/types/hono.js";
import { makeRepositories } from "#v1/db-repositories/index.js";
import { createAuthedRoute } from "#v1/lib/create-authed-route.js";
import {
  applicationError,
  errorContent,
} from "#v1/lib/route-responses/error-content.js";
import { ulidSchema } from "#v1/lib/schemas/ulid-schema.js";
import {
  type HandlerContext,
  type HandlerReturnType,
} from "#v1/types/handler.js";
import { z } from "@hono/zod-openapi";
import { type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import { createHash } from "node:crypto";
import { extname } from "node:path";
import { getOrCreateDraft } from "./helpers/get-or-create-draft.js";
import { MediaAssetResponseSchema } from "./route-responses/media-asset.js";

// Room for the multipart boundaries and part headers around the file, so a
// file just under MEDIA_MAX_BYTES isn't turned away by the request limit.
// _uploadToS3 enforces MEDIA_MAX_BYTES on the file itself.
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

function fileTooLarge(c: Context, message: string) {
  return c.json(applicationError({ file: { message } }), 413);
}

// Typed with AuthEnv, since it runs after requireAuth; a plain
// MiddlewareHandler would widen the handler's `c.var.user` back to nullable.
const limitUploadSize = createMiddleware<AuthEnv>((c, next) => {
  const maxBytes = getConfig().MEDIA_MAX_BYTES;
  return bodyLimit({
    maxSize: maxBytes + MULTIPART_OVERHEAD_BYTES,
    onError: (c) =>
      fileTooLarge(c, new MediaTooLargeError("The file", maxBytes).message),
  })(c, next);
});

export const postDraftMediaAssetRoute = createAuthedRoute({
  method: "post",
  path: "/id/{id}/draft/media-assets",
  tags: ["publications"],
  summary: "Upload a file for the draft",
  description:
    "Stores one media file and links it to the draft, creating the draft if " +
    "none is open. The response's `url` is the file's public URL, for the " +
    "draft's body to reference; the body isn't changed, so the draft's ETag " +
    "stays the same. Files are stored by content and extension: uploading " +
    "the same bytes with the same extension again returns the same URL " +
    "without storing them twice. The URL keeps the file's extension, " +
    "lowercased, since MyST tells images, video and audio apart by it.",
  // The origin check runs first, so a cross-site upload is refused before
  // its body is read.
  middleware: [requireTrustedOrigin, limitUploadSize],
  request: {
    params: z.object({ id: ulidSchema({ fieldName: "id" }) }),
    body: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: z.object({
            file: z
              .custom<File>((v) => v instanceof File, "A file is required")
              .openapi({
                type: "string",
                format: "binary",
                description:
                  "The file. Its name's extension must be a supported media " +
                  "type, e.g. `.png` or `.mp4`.",
              }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "The file is stored and linked to the draft.",
      content: { "application/json": { schema: MediaAssetResponseSchema } },
    },
    403: {
      description:
        "The authenticated user does not have edit permission on this " +
        "publication, or the request's `Origin` header isn't one of the " +
        "site's own frontends.",
      content: errorContent("auth"),
    },
    404: {
      description:
        "No publication exists for the given ID, or it has no version.",
      content: errorContent("publication", "version"),
    },
    409: {
      description:
        "A push or publish of this publication held it for too long, or " +
        "would have deadlocked with this upload, while the draft was being " +
        "opened.",
      content: errorContent("draft"),
    },
    413: {
      description:
        "The file is larger than the server's limit (`MEDIA_MAX_BYTES`, " +
        "350 MiB by default).",
      content: errorContent("file"),
    },
    422: {
      ...ValidationIssuesResponse[422],
      description:
        "No file was given, its type isn't supported, or it can't be read " +
        "as the media its type claims.",
    },
  },
});

export async function postDraftMediaAssetHandler(
  c: HandlerContext<typeof postDraftMediaAssetRoute>
): HandlerReturnType<typeof postDraftMediaAssetRoute> {
  const user = c.var.user;
  const { id } = c.req.valid("param");
  const repos = makeRepositories();
  const publication = await repos.publications.findById(id, {
    includeDeleted: false,
  });
  if (!publication) {
    return c.json(
      applicationError({ publication: { message: "Publication not found" } }),
      404
    );
  }
  if (!(await repos.publications.canEdit(user.id, id, publication.ownerId))) {
    return c.json(
      applicationError({ auth: { message: "Permission denied" } }),
      403
    );
  }

  let draftResult;
  try {
    draftResult = await repos.transaction(async (txRepos) => {
      const latest = await txRepos.publications.findForUpdate(id);
      if (!latest || latest.state === "DELETED") return null;
      return getOrCreateDraft(txRepos, latest);
    });
  } catch (e) {
    if (!isLockConflictError(e)) throw e;
    return c.json(
      applicationError({
        draft: {
          message:
            "Another push or publish of this draft is taking too long; try again",
        },
      }),
      409
    );
  }
  if (!draftResult) {
    return c.json(
      applicationError({ publication: { message: "Publication not found" } }),
      404
    );
  }
  if (draftResult.status === "missing-latest-version") {
    return c.json(
      applicationError({ version: { message: "Publication has no version" } }),
      404
    );
  }

  const { file } = c.req.valid("form");
  const buffer = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(buffer).digest("hex");
  const extension = extname(file.name).toLowerCase();
  // The full hash: for an uploaded file the key is its only identity. The
  // extension stays in the URL because MyST tells images, video and audio
  // apart by the URL's extension.
  const s3Key = mediaS3Key({
    publicationId: id,
    suffix: `${hash}${extension}`,
  });
  try {
    // [EDGE CASE]: a publish or discard during the upload leaves the asset
    // linked to the now published or discarded version. Accepted: the window
    // is one upload long, and the extra link is harmless.
    const url = await storeMedia({
      buffer,
      extension,
      s3Key,
      hash,
      sourceLabel: file.name,
      versionId: draftResult.draft.id,
      repos,
    });
    return c.json(
      {
        url,
        sha256: hash,
        draftCreated: draftResult.status === "created",
      },
      200
    );
  } catch (e) {
    if (e instanceof MediaTooLargeError) {
      return fileTooLarge(c, e.message);
    }
    if (
      !(e instanceof UnsupportedMediaError) &&
      !(e instanceof MalformedInputError)
    ) {
      throw e;
    }
    return c.var.validationErrors([
      { code: "custom", path: ["file"], message: e.message },
    ]);
  }
}
