import { notifications } from "#src/db/schema.js";
import { type JsonErrorsParams } from "#src/lib/middleware/json-error.js";
import { decodeUnsubscribeToken } from "#src/lib/unsubscribe.js";
import { markdownToText } from "#src/lib/utils/markdown.js";
import { snakeCaseKeys } from "#src/lib/utils/snake-case-keys.js";
import { emptyToNull } from "#src/lib/utils/string.js";
import type { AppEnv } from "#src/types/hono.js";
import { NotificationsRepository } from "#v0/db-repositories/notifications-repository.js";
import { dbInsert } from "#v0/lib/db/db-insert.js";
import { dbSelect } from "#v0/lib/db/db-select.js";
import {
  dbDateStringToIso,
  getPagination,
  getSessionUserId,
} from "#v0/lib/rutils.js";
import {
  reconcileIntIdsToId,
  reconcileIntIdToId,
} from "#v0/lib/utils/reconcile-int-id.js";
import { sql } from "drizzle-orm";
import { Hono } from "hono";

const app = new Hono<AppEnv>();

type WithIsoCreatedAt<T extends { created_at?: string | null }> = Omit<
  T,
  "created_at"
> & {
  created_at: string | null;
};

function withIsoCreatedAt<T extends { created_at?: string | null }>(
  obj: T
): WithIsoCreatedAt<T> {
  return {
    ...obj,
    created_at: dbDateStringToIso(obj.created_at),
  };
}

const DELIVERY_METHOD__EMAIL = "EMAIL";
const DELIVERY_METHOD__IN_APP = "IN_APP";

const COMMENT_EXCERPT_LENGTH = 140;

function truncateExcerpt(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > COMMENT_EXCERPT_LENGTH
    ? `${trimmed.slice(0, COMMENT_EXCERPT_LENGTH).trimEnd()}…`
    : trimmed;
}

const NOTIFICATION_STATES = notifications.state.enumValues;
type NotificationState = (typeof NOTIFICATION_STATES)[number];

function parseNotificationState(
  value: string | undefined
): NotificationState | null {
  return value && (NOTIFICATION_STATES as readonly string[]).includes(value)
    ? (value as NotificationState)
    : null;
}

function parseNotificationBulkState(
  value: unknown
): { ok: true; state: NotificationState | null } | { ok: false } {
  if (value == null) return { ok: true, state: null };
  if (typeof value !== "string") return { ok: false };
  const state = parseNotificationState(value);
  return state === null ? { ok: false } : { ok: true, state };
}

function parseNoteId(raw: string): number | null {
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

/**
 * Resolves `mostRecentNotificationId` (sent by the frontend to bound a
 * "select all" bulk action to the notifications it actually saw) to that
 * notification's `created_at`. Bounding by id would race with newly
 * arrived notifications shifting ids; bounding by timestamp doesn't.
 */
async function resolveBulkAtOrBefore(
  notificationsRepository: NotificationsRepository,
  userId: number,
  value: unknown
): Promise<{ ok: true; atOrBefore: string | null } | { ok: false }> {
  if (value == null) return { ok: true, atOrBefore: null };
  const noteId =
    typeof value === "number" || typeof value === "string"
      ? parseNoteId(String(value))
      : null;
  if (noteId === null) return { ok: false };

  const notification = await notificationsRepository.getNotification(
    userId,
    noteId
  );
  if (notification === null) return { ok: false };
  // A null createdAt must never be treated as "no bound requested" below,
  // which would make the bulk update/delete unscoped instead of failing.
  if (notification.createdAt === null) return { ok: false };

  return { ok: true, atOrBefore: notification.createdAt };
}

function serializeNotification<T extends Record<string, unknown>>(
  notification: T
) {
  return reconcileIntIdToId(withIsoCreatedAt(snakeCaseKeys(notification)));
}

const ERROR_AUTH_REQ: JsonErrorsParams = [
  { auth: ["Authentication required"] },
  401,
];
const ERROR_MISSING_IDS: JsonErrorsParams = [{ ids: ["Missing ids"] }, 400];
const ERROR_NOTIF_404: JsonErrorsParams = [
  { id: ["Notification not found"] },
  404,
];
const ERROR_NOTIFS_404: JsonErrorsParams = [
  { ids: ["Some notifications were not found"] },
  404,
];
const ERROR_INVALID_STATE: JsonErrorsParams = [
  { state: ["Invalid notification state"] },
  400,
];

function obfuscateEmail(email: string): string {
  const parts = email.split("@", 2);
  if (parts.length !== 2) return "****";
  const [local, domain] = parts as [string, string];
  let masked: string;
  if (local.length <= 1) masked = "*";
  else if (local.length === 2) masked = local[0]! + "*";
  else
    masked =
      local[0]! + "*".repeat(local.length - 2) + local[local.length - 1]!;
  return `${masked}@${domain}`;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.post("/unsubscribe", async (c) => {
  let token = c.req.query("token") ?? null;
  if (!token) {
    const body = (await c.req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    token = emptyToNull(body["token"] as string | null);
  }
  if (!token) return c.json({ error: "Missing token" }, 400);

  const decoded = decodeUnsubscribeToken(token);
  if (!decoded || !decoded["email"] || !decoded["type"])
    return c.json({ error: "Invalid token" }, 400);

  const email = decoded["email"] as string;
  const notificationType = decoded["type"] as string;

  const notifTypeRows = await dbSelect(
    sql`SELECT id_int, id, name FROM notification_types WHERE type = ${notificationType}`
  );
  if (notifTypeRows.length === 0)
    return c.json({ error: "Notification type not found" }, 404);
  const notifTypeId = notifTypeRows[0]!["id_int"] as number;
  const notifTypeUlid = notifTypeRows[0]!["id"] as string;
  const notifName = notifTypeRows[0]!["name"] as string;

  const userRows = await dbSelect(
    sql`SELECT id_int, id FROM users WHERE email = ${email} AND state != 'DELETED'`
  );
  if (userRows.length === 0) return c.json({ error: "User not found" }, 404);
  const userIdFromToken = userRows[0]!["id_int"] as number;
  const userUlidFromToken = userRows[0]!["id"] as string;

  await dbInsert(
    sql`INSERT INTO user_notification_settings (user_id_int, notification_type_id_int, delivery_method, is_subscribed, id, user_id, notification_type_id) VALUES (${userIdFromToken}, ${notifTypeId}, ${DELIVERY_METHOD__EMAIL}, FALSE, ULID(), ${userUlidFromToken}, ${notifTypeUlid}) ON DUPLICATE KEY UPDATE is_subscribed = FALSE`
  );

  let tokenMatchesAuthUser = false;
  const authUserId = await getSessionUserId(c);
  if (authUserId) {
    const authUserRows = await dbSelect(
      sql`SELECT email FROM users WHERE id_int = ${authUserId}`
    );
    if (authUserRows.length > 0 && authUserRows[0]!["email"] === email)
      tokenMatchesAuthUser = true;
  }

  const resp: Record<string, unknown> = {
    email: obfuscateEmail(email),
    notification_name: notifName,
    notification_type: notificationType,
  };
  if (tokenMatchesAuthUser) resp["token_matches_auth_user"] = true;
  return c.json(resp);
});

app.get("/get_user_settings", async (c) => {
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const rows = await dbSelect(
    sql`SELECT nt.type AS notification_type, nt.name AS notification_name, nt.description AS notification_description, COALESCE(uns_email.is_subscribed, TRUE) AS is_subscribed_email, COALESCE(uns_in_app.is_subscribed, TRUE) AS is_subscribed_in_app FROM notification_types nt LEFT JOIN user_notification_settings uns_email ON uns_email.notification_type_id_int = nt.id_int AND uns_email.user_id_int = ${userId} AND uns_email.delivery_method = 'EMAIL' LEFT JOIN user_notification_settings uns_in_app ON uns_in_app.notification_type_id_int = nt.id_int AND uns_in_app.user_id_int = ${userId} AND uns_in_app.delivery_method = 'IN_APP' WHERE nt.state = 'ACTIVE' AND (nt.type != 'NEW_COMMENT__ORG_ADMIN' OR EXISTS (SELECT 1 FROM org_user_map ou WHERE ou.user_id_int = ${userId} AND FIND_IN_SET('ADMIN', ou.roles) AND (ou.end_at IS NULL OR ou.end_at > NOW()))) ORDER BY nt.priority ASC`
  );
  return c.json(rows);
});

app.put("/update_user_setting", async (c) => {
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const notificationType = emptyToNull(
    body["notification_type"] as string | null
  );
  const deliveryMethod = emptyToNull(body["delivery_method"] as string | null);
  const isSubscribed = body["is_subscribed"];

  if (
    !notificationType ||
    (deliveryMethod !== DELIVERY_METHOD__EMAIL &&
      deliveryMethod !== DELIVERY_METHOD__IN_APP) ||
    typeof isSubscribed !== "boolean"
  ) {
    return c.json({ error: "Missing or invalid fields" }, 400);
  }

  const notifTypeRows = await dbSelect(
    sql`SELECT id_int, id FROM notification_types WHERE type = ${notificationType} AND state = 'ACTIVE'`
  );
  if (notifTypeRows.length === 0)
    return c.json({ error: "Notification type not found" }, 404);
  const notifTypeId = notifTypeRows[0]!["id_int"] as number;
  const notifTypeUlid = notifTypeRows[0]!["id"] as string;

  const userUlidRows = await dbSelect(
    sql`SELECT id FROM users WHERE id_int = ${userId}`
  );
  const userUlid = userUlidRows[0]!["id"] as string;

  await dbInsert(
    sql`INSERT INTO user_notification_settings (user_id_int, notification_type_id_int, delivery_method, is_subscribed, id, user_id, notification_type_id) VALUES (${userId}, ${notifTypeId}, ${deliveryMethod}, ${isSubscribed}, ULID(), ${userUlid}, ${notifTypeUlid}) ON DUPLICATE KEY UPDATE is_subscribed = ${isSubscribed}`
  );
  return c.json({ message: "Setting updated" });
});

app.get("/", async (c) => {
  const userId = await getSessionUserId(c);
  if (!userId) return c.var.jsonErrors(...ERROR_AUTH_REQ);

  const notificationsRepository = new NotificationsRepository();
  const seen =
    c.req.query("seen")?.toLowerCase() === "true"
      ? true
      : c.req.query("seen")?.toLowerCase() === "false"
        ? false
        : null;
  const state = parseNotificationState(c.req.query("state"));

  const query = Object.fromEntries(new URL(c.req.url).searchParams);
  const { page, perPage, offset } = getPagination(query);
  const { items, total } = await notificationsRepository.listNotifications({
    userId,
    seen,
    state,
    perPage,
    offset,
  });
  const mappedItems = await Promise.all(
    items.map(async ({ publication, comment, ...notification }) => {
      const org = publication?.orgPublicationMaps[0]?.organization;
      const publishedComment = comment?.state === "PUBLISHED" ? comment : null;
      const commentTextExcerpt = publishedComment
        ? truncateExcerpt(await markdownToText(publishedComment.body))
        : null;
      return {
        ...notification,
        publicationSlug: publication?.slug ?? null,
        publicationTitle: publication?.versions[0]?.title ?? null,
        publicationOrg: org
          ? {
              id: org.idInt,
              avatar: org.avatar,
            }
          : null,
        commentAuthor: publishedComment?.user
          ? {
              first_name: publishedComment.user.firstName,
              last_name: publishedComment.user.lastName,
              avatar: publishedComment.user.image,
            }
          : null,
        commentTextExcerpt,
        commentState: comment?.state ?? null,
      };
    })
  );
  return c.json({
    pagination: { total, page, per_page: perPage },
    items: reconcileIntIdsToId(
      mappedItems.map(snakeCaseKeys).map(withIsoCreatedAt)
    ),
  });
});

app.patch("/", async (c) => {
  const callerId = await getSessionUserId(c);
  if (!callerId) return c.var.jsonErrors(...ERROR_AUTH_REQ);

  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const seen = Number(Boolean(body["seen"] ?? true));

  const notificationsRepository = new NotificationsRepository();

  if (body["all"] === true) {
    const parsedState = parseNotificationBulkState(body["state"]);
    if (!parsedState.ok) return c.var.jsonErrors(...ERROR_INVALID_STATE);

    const atOrBefore = await resolveBulkAtOrBefore(
      notificationsRepository,
      callerId,
      body["mostRecentNotificationId"]
    );
    if (!atOrBefore.ok) return c.var.jsonErrors(...ERROR_NOTIF_404);

    const updated = await notificationsRepository.updateAllNotifications(
      callerId,
      { seen },
      parsedState.state,
      atOrBefore.atOrBefore
    );
    return c.json({ updated });
  }

  const ids = body["ids"];
  if (!Array.isArray(ids) || ids.length === 0)
    return c.var.jsonErrors(...ERROR_MISSING_IDS);

  const noteIds = ids
    .map((id) => String(id))
    .filter((id) => /^\d+$/.test(id))
    .map((id) => Number(id));

  const items = await notificationsRepository.updateNotifications(
    callerId,
    noteIds,
    { seen }
  );

  if (items === null) return c.var.jsonErrors(...ERROR_NOTIFS_404);

  return c.json({
    items: reconcileIntIdsToId(items.map(snakeCaseKeys).map(withIsoCreatedAt)),
  });
});

app.get("/types", async (c) => {
  const userId = await getSessionUserId(c);
  if (!userId) return c.var.jsonErrors(...ERROR_AUTH_REQ);

  const notificationsRepository = new NotificationsRepository();
  const states = await notificationsRepository.getDistinctStates(userId);
  return c.json(states);
});

app.get("/:note_id", async (c) => {
  const callerId = await getSessionUserId(c);
  if (!callerId) return c.var.jsonErrors(...ERROR_AUTH_REQ);

  const noteId = parseNoteId(c.req.param("note_id"));
  if (noteId === null) return c.var.jsonErrors(...ERROR_NOTIF_404);

  const notificationsRepository = new NotificationsRepository();
  const notification = await notificationsRepository.getNotification(
    callerId,
    noteId
  );

  if (notification === null) return c.var.jsonErrors(...ERROR_NOTIF_404);

  return c.json(serializeNotification(notification));
});

app.patch("/:note_id", async (c) => {
  const callerId = await getSessionUserId(c);
  if (!callerId) return c.var.jsonErrors(...ERROR_AUTH_REQ);

  const noteId = parseNoteId(c.req.param("note_id"));
  if (noteId === null) return c.var.jsonErrors(...ERROR_NOTIF_404);

  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const seen = Number(Boolean(body["seen"] ?? true));

  const notificationsRepository = new NotificationsRepository();
  const notification = await notificationsRepository.updateNotification(
    callerId,
    noteId,
    { seen }
  );

  if (notification === null) return c.var.jsonErrors(...ERROR_NOTIF_404);

  return c.json(serializeNotification(notification));
});

app.delete("/", async (c) => {
  const callerId = await getSessionUserId(c);
  if (!callerId) return c.var.jsonErrors(...ERROR_AUTH_REQ);

  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  const notificationsRepository = new NotificationsRepository();

  if (body["all"] === true) {
    const parsedState = parseNotificationBulkState(body["state"]);
    if (!parsedState.ok) return c.var.jsonErrors(...ERROR_INVALID_STATE);

    const atOrBefore = await resolveBulkAtOrBefore(
      notificationsRepository,
      callerId,
      body["mostRecentNotificationId"]
    );
    if (!atOrBefore.ok) return c.var.jsonErrors(...ERROR_NOTIF_404);

    const deleted = await notificationsRepository.deleteAllNotifications(
      callerId,
      parsedState.state,
      atOrBefore.atOrBefore
    );
    return c.json({ deleted });
  }

  const ids = body["ids"];
  if (!Array.isArray(ids) || ids.length === 0)
    return c.var.jsonErrors(...ERROR_MISSING_IDS);

  const noteIds = ids
    .map((id) => String(id))
    .filter((id) => /^\d+$/.test(id))
    .map((id) => Number(id));

  const deleted = await notificationsRepository.deleteNotifications(
    callerId,
    noteIds
  );

  if (deleted === null) return c.var.jsonErrors(...ERROR_NOTIFS_404);

  return c.json({ deleted });
});

app.delete("/:note_id", async (c) => {
  const callerId = await getSessionUserId(c);
  if (!callerId) return c.var.jsonErrors(...ERROR_AUTH_REQ);

  const noteId = parseNoteId(c.req.param("note_id"));
  if (noteId === null) return c.var.jsonErrors(...ERROR_NOTIF_404);

  const notificationsRepository = new NotificationsRepository();
  const deleted = await notificationsRepository.deleteNotification(
    callerId,
    noteId
  );

  if (!deleted) return c.var.jsonErrors(...ERROR_NOTIF_404);

  return c.json({ message: "Notification deleted" });
});

export default app;
