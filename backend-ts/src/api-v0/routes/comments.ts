import { getConfig } from "#src/config.js";
import { getS3PresigningClient } from "#src/lib/media/s3-client.js";
import { getS3PublicUrl } from "#src/lib/media/s3-public-url.js";
import { emptyToNull } from "#src/lib/utils/string.js";
import type { AppEnv } from "#src/types/hono.js";
import { newComment } from "#v0/helpers/notifications-logic.js";
import { dbInsert } from "#v0/lib/db/db-insert.js";
import { dbSelectValue } from "#v0/lib/db/db-select-value.js";
import { dbSelect, type Row } from "#v0/lib/db/db-select.js";
import { dbUpdate } from "#v0/lib/db/db-update.js";
import {
  dbDateStringToIso,
  getSessionUserId,
  NO_SESSION_MSG,
} from "#v0/lib/rutils.js";
import {
  reconcileIntIdsToId,
  reconcileIntIdToId,
} from "#v0/lib/utils/reconcile-int-id.js";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { sql, type SQL } from "drizzle-orm";
import { Hono, type Context } from "hono";

const app = new Hono<AppEnv>();

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};
const PRESIGNED_URL_EXPIRY = 300;
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
const VISIBLE_COMMENT_STATES = sql`('PUBLISHED', 'WITHDRAWN')`;
const WITHDRAWN_COMMENT_BODY = "Comment has been withdrawn by the author";

type BuildListCommentsQueryArgs =
  | { perPage: number; offset: number; pubId: number }
  | { commentIds: Set<number> };

function buildListCommentsQuery(args: BuildListCommentsQueryArgs): SQL {
  const baseSelect = sql`SELECT c.id_int as comment_id_int, c.parent_id_int, c.version_id_int, c.state, c.body, c.anchor_text, c.pre_text, c.post_text, c.created_at, c.updated_at, u.id_int as user_id_int, u.first_name, u.last_name, u.image as avatar FROM comments AS c JOIN users AS u ON u.id_int = c.user_id_int`;
  if ("commentIds" in args) {
    const { commentIds } = args;
    const idList = sql.join(
      [...commentIds].map((id) => sql`${id}`),
      sql`, `
    );
    return sql`${baseSelect} WHERE c.id_int IN (${idList}) AND c.state IN ${VISIBLE_COMMENT_STATES} ORDER BY c.created_at DESC`;
  }
  const { pubId, perPage, offset } = args;
  return sql`${baseSelect} WHERE c.publication_id_int = ${pubId} AND c.state IN ${VISIBLE_COMMENT_STATES} ORDER BY c.created_at DESC LIMIT ${perPage} OFFSET ${offset}`;
}

// Withdrawn comments stay visible (thread continuity) with the author
// masked and body replaced; the DB keeps the original, only this response
// is redacted. user_id_int is nulled too so the raw id can't de-anonymize
// the author; the withdraw UPDATE matches ownership in the DB, so it's unaffected.
function withMaskedWithdrawnAuthor(row: Row): Row {
  if (row["state"] !== "WITHDRAWN") return row;
  return {
    ...row,
    user_id: null,
    user_id_int: null,
    first_name: "[author]",
    last_name: "",
    avatar: null,
    body: WITHDRAWN_COMMENT_BODY,
  };
}

function withIsoTimestamps(row: Row): Row {
  return {
    ...row,
    created_at: dbDateStringToIso(
      row["created_at"] as string | null | undefined
    ),
    updated_at: dbDateStringToIso(
      row["updated_at"] as string | null | undefined
    ),
  };
}

async function includeParentComments(comments: Row[]): Promise<Row[]> {
  let toScan = comments;
  while (true) {
    const idsWeHave = new Set(comments.map((c) => c["comment_id_int"]));
    const idsNeeded = new Set(
      toScan
        .filter((c) => c["parent_id_int"] && !idsWeHave.has(c["parent_id_int"]))
        .map((c) => c["parent_id_int"] as number)
    );
    if (idsNeeded.size === 0) break;
    const query = buildListCommentsQuery({ commentIds: idsNeeded });
    const rows = await dbSelect(query);
    comments.push(...rows);
    toScan = rows;
  }
  return comments;
}

async function canEditComment(
  commentId: number,
  userId: number
): Promise<boolean> {
  const own = await dbSelectValue(
    sql`SELECT 1 FROM comments WHERE id_int = ${commentId} AND user_id_int = ${userId} LIMIT 1`
  );
  if (own) return true;
  const isAdmin = await dbSelectValue(
    sql`SELECT 1 FROM users WHERE state='SITE_ADMIN' AND id_int = ${userId} LIMIT 1`
  );
  return Boolean(isAdmin);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get("/publication/:publication_id", async (c) => {
  const pubId = parseInt(c.req.param("publication_id"), 10);

  if (isNaN(pubId))
    return c.var.jsonErrors({ comment: ["Invalid publication_id"] }, 400);

  const page = parseInt(c.req.query("page") ?? "1", 10);
  if (isNaN(page) || page < 1)
    return c.var.jsonErrors({ page: ["page must be a positive integer"] }, 400);

  const perPageRaw = parseInt(c.req.query("per_page") ?? "250", 10);
  const perPage = Math.min(isNaN(perPageRaw) ? 250 : perPageRaw, 250);
  if (perPage < 1)
    return c.var.jsonErrors(
      { per_page: ["per_page must be a positive integer"] },
      400
    );

  const offset = (page - 1) * perPage;

  const total = await dbSelectValue(
    sql`SELECT COUNT(1) FROM comments WHERE publication_id_int = ${pubId} AND state IN ${VISIBLE_COMMENT_STATES}`
  );
  const query = buildListCommentsQuery({ perPage, offset, pubId });
  let rows = await dbSelect(query);
  rows = await includeParentComments(rows);
  return c.json({
    pagination: { total, page, per_page: perPage },
    items: reconcileIntIdsToId(
      rows.map(withMaskedWithdrawnAuthor).map(withIsoTimestamps)
    ),
  });
});

app.post("/publication/:publication_id", async (c) => {
  const pubId = parseInt(c.req.param("publication_id"), 10);
  if (isNaN(pubId))
    return c.var.jsonErrors({ comment: ["Invalid publication_id"] }, 400);

  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ msg: NO_SESSION_MSG }, 401);

  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const commentBody = body["body"] as string;
  const parentId = (body["parent_id"] as number | null) ?? null;
  const anchorText = emptyToNull(body["anchor_text"] as string | null);
  const preText = emptyToNull(body["pre_text"] as string | null);
  const postText = emptyToNull(body["post_text"] as string | null);

  if (!commentBody) return c.json({ error: "Missing body" }, 400);
  if (anchorText && parentId)
    return c.json(
      { error: "Cannot specify both anchor_text and parent_id" },
      400
    );
  if ((preText || postText) && !anchorText)
    return c.json(
      {
        error:
          "anchor_text is required when pre_text or post_text are specified",
      },
      400
    );
  if (anchorText && anchorText.length > 1024)
    return c.json({ error: "anchor_text is too long" }, 400);
  if (preText && preText.length > 128)
    return c.json({ error: "pre_text is too long" }, 400);
  if (postText && postText.length > 128)
    return c.json({ error: "post_text is too long" }, 400);

  const pubRows = await dbSelect(
    sql`SELECT id FROM publications WHERE id_int = ${pubId}`
  );
  if (pubRows.length === 0)
    return c.json({ error: "Publication not found" }, 404);
  const pubUlid = pubRows[0]!["id"] as string | null;

  const versionRows = await dbSelect(
    sql`SELECT v.id_int, v.id FROM versions v JOIN publications p ON p.id_int = v.publication_id_int AND v.version_number = p.latest_version_number WHERE p.id_int = ${pubId}`
  );
  const versionId =
    versionRows.length > 0 ? (versionRows[0]!["id_int"] as number) : null;
  const versionUlid =
    versionRows.length > 0 ? (versionRows[0]!["id"] as string) : null;

  const userUlid = await dbSelectValue(
    sql`SELECT id FROM users WHERE id_int = ${userId}`
  );

  let parentUlid: unknown = null;
  if (parentId) {
    parentUlid = await dbSelectValue(
      sql`SELECT id FROM comments WHERE id_int = ${parentId}`
    );
  }

  const commentId = await dbInsert(
    sql`INSERT INTO comments (publication_id_int, version_id_int, user_id_int, body, parent_id_int, anchor_text, pre_text, post_text, id, publication_id, version_id, user_id, parent_id) VALUES (${pubId}, ${versionId ?? null}, ${userId}, ${commentBody}, ${parentId ?? null}, ${anchorText || null}, ${preText || null}, ${postText || null}, ULID(), ${pubUlid}, ${versionUlid}, ${userUlid}, ${parentUlid})`
  );

  const log = c.var.logger;
  newComment(commentId, pubId).catch((e) =>
    log.error(
      { err: e, commentId, pubId },
      "Failed to send comment notifications"
    )
  );

  return c.json({ comment_id: commentId }, 201);
});

app.get("/upload-url", async (c) => {
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const slug = c.req.query("slug");
  const contentType = c.req.query("content_type");
  const fileSizeStr = c.req.query("file_size");

  if (!slug) return c.json({ error: "Missing required parameter: slug" }, 400);
  if (!contentType)
    return c.json({ error: "Missing required parameter: content_type" }, 400);
  if (!fileSizeStr)
    return c.json({ error: "Missing required parameter: file_size" }, 400);

  const fileSize = parseInt(fileSizeStr, 10);
  if (isNaN(fileSize) || fileSize <= 0)
    return c.json({ error: "file_size must be a positive integer" }, 400);
  if (fileSize > MAX_UPLOAD_SIZE)
    return c.json(
      {
        error: `File size exceeds maximum allowed (${MAX_UPLOAD_SIZE / 1024 / 1024} MB)`,
      },
      400
    );
  if (!ALLOWED_IMAGE_TYPES.has(contentType))
    return c.json(
      {
        error: `Invalid content type '${contentType}'. Allowed types: ${[...ALLOWED_IMAGE_TYPES].sort().join(", ")}`,
      },
      400
    );

  const cfg = getConfig();
  if (!cfg.AWS_S3_BUCKET_NAME)
    return c.json({ error: "Media storage is not configured." }, 500);

  const ext = MIME_TO_EXT[contentType];
  const uniqueId =
    Math.random().toString(36).slice(2) + Date.now().toString(36);
  const s3Key = `publications/${slug}/comments/${uniqueId}.${ext}`;

  try {
    const client = getS3PresigningClient();
    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: cfg.AWS_S3_BUCKET_NAME,
        Key: s3Key,
        ContentType: contentType,
      }),
      { expiresIn: PRESIGNED_URL_EXPIRY }
    );
    const publicUrl = getS3PublicUrl(s3Key);
    return c.json({ upload_url: uploadUrl, public_url: publicUrl });
  } catch (e) {
    c.var.logger.error({ err: e }, "Failed to generate presigned URL");
    return c.json({ error: "Failed to generate upload URL." }, 500);
  }
});

app.get("/:comment_id{[0-9]+}", async (c) => {
  const commentId = parseInt(c.req.param("comment_id"), 10);
  const rows = await dbSelect(
    buildListCommentsQuery({ commentIds: new Set([commentId]) })
  );
  if (rows.length === 0) return c.json({ error: "Comment not found" }, 404);
  return c.json(
    reconcileIntIdToId(withIsoTimestamps(withMaskedWithdrawnAuthor(rows[0]!)))
  );
});

async function getEditRejection(
  commentId: number,
  userId: number
): Promise<string | null> {
  const editRows = await dbSelect(
    sql`SELECT state, created_at >= NOW() - INTERVAL 1 HOUR AS within_edit_window, EXISTS (SELECT 1 FROM comments AS child WHERE child.parent_id_int = ${commentId}) AS has_replies FROM comments WHERE id_int = ${commentId} AND user_id_int = ${userId} LIMIT 1`
  );
  const editInfo = editRows[0];
  if (!editInfo || editInfo["state"] !== "PUBLISHED")
    return "Not authorised to edit this comment";
  if (!editInfo["within_edit_window"])
    return "Comments can only be edited within 1 hour of posting";
  if (editInfo["has_replies"]) return "Cannot edit a comment that has replies";
  return null;
}

async function withdrawComment(
  c: Context<AppEnv>,
  commentId: number,
  userId: number
): Promise<Response> {
  const { affectedRows } = await dbUpdate(
    sql`UPDATE comments SET state = 'WITHDRAWN' WHERE id_int = ${commentId} AND user_id_int = ${userId} AND state = 'PUBLISHED'`
  );
  if (affectedRows === 0)
    return c.var.jsonErrors(
      { comment: ["Not authorised to withdraw this comment"] },
      403
    );
  return c.json({ status: "withdrawn", comment_id: commentId });
}

app.put("/:comment_id{[0-9]+}", async (c) => {
  const commentId = parseInt(c.req.param("comment_id"), 10);
  const userId = await getSessionUserId(c);
  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }
  if (!(await canEditComment(commentId, userId))) {
    return c.json({ error: "Not authorised to update this comment" }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  await dbUpdate(
    sql`UPDATE comments SET body = ${String(body["body"] ?? "")}, updated_at = CURRENT_TIMESTAMP WHERE id_int = ${commentId}`
  );
  return c.json({ comment_id: commentId });
});

app.patch("/:comment_id{[0-9]+}", async (c) => {
  const commentId = parseInt(c.req.param("comment_id"), 10);
  const userId = await getSessionUserId(c);
  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }
  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (body["state"] !== undefined && body["body"] !== undefined) {
    return c.var.jsonErrors(
      { comment: ["Cannot specify both body and state"] },
      400
    );
  }

  if (body["state"] !== undefined) {
    if (body["state"] !== "WITHDRAWN")
      return c.var.jsonErrors({ state: ["Invalid state"] }, 400);
    return withdrawComment(c, commentId, userId);
  }

  if (body["body"] !== undefined) {
    const newBody = body["body"];
    if (typeof newBody !== "string" || newBody === "")
      return c.var.jsonErrors({ body: ["Must be a non-empty string"] }, 400);
    const editRejection = await getEditRejection(commentId, userId);
    if (editRejection) return c.json({ error: editRejection }, 403);
    // The checks above can race with a reply landing (or the edit window
    // closing) between the SELECT and this UPDATE, so re-enforce every
    // condition atomically in the UPDATE's own WHERE clause. The EXISTS
    // subquery is wrapped in a derived table because MySQL otherwise
    // rejects a subquery that reads the same table an UPDATE is targeting
    // ("You can't specify target table 'comments' for update in FROM
    // clause"); routing it through a materialized derived table sidesteps
    // that restriction.
    const { affectedRows } = await dbUpdate(
      sql`UPDATE comments SET body = ${newBody}, updated_at = CURRENT_TIMESTAMP WHERE id_int = ${commentId} AND user_id_int = ${userId} AND state = 'PUBLISHED' AND created_at >= NOW() - INTERVAL 1 HOUR AND NOT EXISTS (SELECT 1 FROM (SELECT parent_id_int FROM comments) AS child WHERE child.parent_id_int = ${commentId})`
    );
    if (affectedRows === 0) {
      const lateRejection =
        (await getEditRejection(commentId, userId)) ??
        "Not authorised to edit this comment";
      return c.json({ error: lateRejection }, 403);
    }
    return c.json({ comment_id: commentId });
  }

  return c.var.jsonErrors({ comment: ["Must provide body or state"] }, 400);
});

// Kept so the backend can be deployed before the frontend switches to PATCH;
// deleting a comment now withdraws it.
app.delete("/:comment_id{[0-9]+}", async (c) => {
  const commentId = parseInt(c.req.param("comment_id"), 10);
  const userId = await getSessionUserId(c);
  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }
  return withdrawComment(c, commentId, userId);
});

export default app;
