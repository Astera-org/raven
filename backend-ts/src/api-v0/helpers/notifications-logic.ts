import { getDb } from "#src/db/index.js";
import { users } from "#src/db/schema.js";
import { logger } from "#src/lib/logger.js";
import {
  emailBylinesAboutNewComment,
  emailCommenterAboutReply,
  emailNonBylinesAboutNewComment,
  emailOrgAdminsAboutNewComment,
  type CommentData,
  type PublicationData,
  type UserInfo,
} from "#src/lib/mail.js";
import { dbInsert } from "#v0/lib/db/db-insert.js";
import { dbSelectValue } from "#v0/lib/db/db-select-value.js";
import { dbSelect } from "#v0/lib/db/db-select.js";
import { inArray, sql } from "drizzle-orm";

const DELIVERY_METHOD__EMAIL = "EMAIL";
const DELIVERY_METHOD__IN_APP = "IN_APP";
const NEW_COMMENT__BYLINE_CONTRIB = "NEW_COMMENT__BYLINE_CONTRIB";
const NEW_COMMENT__NON_BYLINE_CONTRIB = "NEW_COMMENT__NON_BYLINE_CONTRIB";
const NEW_COMMENT__ORG_ADMIN = "NEW_COMMENT__ORG_ADMIN";
const NEW_COMMENT__PARENT_COMMENTER = "NEW_COMMENT__PARENT_COMMENTER";

const knownNotifyTypes = new Set([
  NEW_COMMENT__PARENT_COMMENTER,
  NEW_COMMENT__BYLINE_CONTRIB,
  NEW_COMMENT__NON_BYLINE_CONTRIB,
  NEW_COMMENT__ORG_ADMIN,
]);

export async function newComment(
  commentId: number,
  publicationIdInt: number
): Promise<void> {
  try {
    await _newComment(commentId, publicationIdInt);
  } catch (e) {
    logger.error(
      { err: e, commentId, publicationIdInt },
      "Failed to send notifications for comment"
    );
  }
}

export async function newPublication(
  publicationIdInt: number,
  versionIdInt: number,
  _title: string
): Promise<void> {
  const contributors = await dbSelect(
    sql`SELECT c.user_id_int, u.first_name, u.last_name FROM contributors c INNER JOIN users u ON c.user_id_int = u.id_int WHERE c.version_id_int = ${versionIdInt} UNION SELECT u.id_int as user_id_int, u.first_name, u.last_name FROM users u INNER JOIN publications p ON p.owner_id_int = u.id_int WHERE p.id_int = ${publicationIdInt}`
  );

  const toNotify = new Map<number, string>();

  for (const c of contributors) {
    const userId = c["user_id_int"] as number;
    const fName = c["first_name"] as string;
    const lName = c["last_name"] as string;
    toNotify.set(userId, "A publication you contributed to has been published");
    const followers = await dbSelect(
      sql`SELECT follower_id_int FROM followers WHERE leader_id_int = ${userId}`
    );
    for (const f of followers) {
      const fid = f["follower_id_int"] as number;
      if (!toNotify.has(fid))
        toNotify.set(fid, `${fName} ${lName} just published something new`);
    }
  }

  const orgs = await dbSelect(
    sql`SELECT o.id_int, o.name FROM org_publication_map m JOIN organizations o ON o.id_int = m.org_id_int WHERE m.publication_id_int = ${publicationIdInt}`
  );
  for (const org of orgs) {
    const orgId = org["id_int"] as number;
    const orgName = org["name"] as string;
    const followers = await dbSelect(
      sql`SELECT follower_id_int FROM org_followers WHERE org_id_int = ${orgId}`
    );
    for (const f of followers) {
      const fid = f["follower_id_int"] as number;
      if (!toNotify.has(fid))
        toNotify.set(fid, `${orgName} just published something new`);
    }
  }

  const toNotifyIds = [...toNotify.keys()];
  let pubUlid: unknown = null;
  const userUlidMap = new Map<number, string>();
  if (toNotifyIds.length > 0) {
    pubUlid = await dbSelectValue(
      sql`SELECT id FROM publications WHERE id_int = ${publicationIdInt}`
    );
    const userUlidRows = await getDb().query.users.findMany({
      columns: { id: true, idInt: true },
      where: inArray(users.idInt, toNotifyIds),
    });
    for (const r of userUlidRows) {
      userUlidMap.set(r.idInt, r.id);
    }
  }

  for (const [userId, message] of toNotify) {
    await dbInsert(
      sql`INSERT INTO notifications (id, user_id_int, publication_id_int, message, state, user_id, publication_id, seen) VALUES (ULID(), ${userId}, ${publicationIdInt}, ${message}, 'NEW_PUBLICATION', ${userUlidMap.get(userId) ?? null}, ${pubUlid}, false)`
    );
  }
}

async function _newComment(
  commentId: number,
  publicationIdInt: number
): Promise<void> {
  const commentRows = await dbSelect(
    sql`SELECT c.id_int, c.user_id_int, c.publication_id_int, c.parent_id_int, c.body, c.pre_text, c.post_text, u.first_name, u.last_name, u.email, u.username FROM comments c JOIN users u ON u.id_int = c.user_id_int WHERE c.id_int = ${commentId}`
  );
  if (commentRows.length === 0)
    throw new Error(`Comment ${commentId} not found`);
  const commentRow = commentRows[0]!;
  const comment = {
    id_int: commentRow["id_int"] as number,
    user_id_int: commentRow["user_id_int"] as number,
    publication_id: commentRow["publication_id_int"] as number,
    parent_id: commentRow["parent_id_int"] as number | null,
    body: commentRow["body"] as string,
    pre_text: commentRow["pre_text"] as string | null,
    post_text: commentRow["post_text"] as string | null,
    commenter_name:
      `${commentRow["first_name"]} ${commentRow["last_name"]}`.trim(),
    commenter_username: commentRow["username"] as string,
  };

  const pubRows = await dbSelect(
    sql`SELECT p.id_int, p.slug, v.title FROM publications p JOIN versions v ON v.publication_id_int = p.id_int AND v.version_number = p.latest_version_number WHERE p.id_int = ${publicationIdInt}`
  );
  if (pubRows.length === 0)
    throw new Error(`Publication ${publicationIdInt} not found`);
  const publication = {
    id_int: pubRows[0]!["id_int"] as number,
    slug: pubRows[0]!["slug"] as string,
    title: pubRows[0]!["title"] as string,
  };

  const deliveryPlan = await getNotifyPlan(comment, publication);
  if (!deliveryPlan) return;

  const emailPlan = deliveryPlan[DELIVERY_METHOD__EMAIL] ?? {};
  for (const [notifType, users] of Object.entries(emailPlan)) {
    if (notifType === NEW_COMMENT__BYLINE_CONTRIB) {
      await emailBylinesAboutNewComment(
        comment,
        publication,
        users as UserInfo[],
        notifType
      );
    } else if (notifType === NEW_COMMENT__NON_BYLINE_CONTRIB) {
      await emailNonBylinesAboutNewComment(
        comment,
        publication,
        users as UserInfo[],
        notifType
      );
    } else if (notifType === NEW_COMMENT__ORG_ADMIN) {
      await emailOrgAdminsAboutNewComment(
        comment,
        publication,
        users as UserInfo[],
        notifType
      );
    } else if (notifType === NEW_COMMENT__PARENT_COMMENTER) {
      await emailCommenterAboutReply(
        comment,
        publication,
        (users as UserInfo[])[0]!,
        notifType
      );
    }
  }

  const inAppPlan = deliveryPlan[DELIVERY_METHOD__IN_APP] ?? {};
  for (const [notifyType, users] of Object.entries(inAppPlan)) {
    const userIdInts = (users as UserInfo[]).map((u) => u.id_int);
    await createInAppNotifications(
      publication.id_int,
      comment.id_int,
      userIdInts,
      notifyType
    );
  }
}

async function createInAppNotifications(
  publicationIdInt: number,
  commentIdInt: number,
  userIdInts: number[],
  notifyType: string
): Promise<void> {
  if (userIdInts.length === 0) return;
  const pubUlid = await dbSelectValue(
    sql`SELECT id FROM publications WHERE id_int = ${publicationIdInt}`
  );
  const commentUlid = await dbSelectValue(
    sql`SELECT id FROM comments WHERE id_int = ${commentIdInt}`
  );
  const userUlidRows = await dbSelect(
    sql`SELECT id_int, id FROM users WHERE id_int IN (${sql.join(
      userIdInts.map((id) => sql`${id}`),
      sql`, `
    )})`
  );
  const userUlidMap = new Map<number, string>(
    userUlidRows.map((r) => [r["id_int"] as number, r["id"] as string])
  );
  const message =
    notifyType == NEW_COMMENT__BYLINE_CONTRIB ||
    notifyType == NEW_COMMENT__NON_BYLINE_CONTRIB
      ? "New comment on your publication"
      : notifyType == NEW_COMMENT__ORG_ADMIN
        ? "New comment on an org you manage"
        : notifyType == NEW_COMMENT__PARENT_COMMENTER
          ? "New reply to your comment"
          : "New comment notification";
  const state =
    notifyType == NEW_COMMENT__PARENT_COMMENTER ? "REPLY" : "COMMENT";
  for (const userIdInt of userIdInts) {
    await dbInsert(
      sql`INSERT INTO notifications (id, user_id_int, publication_id_int, message, state, user_id, publication_id, seen, comment_id_int, comment_id) VALUES (ULID(), ${userIdInt}, ${publicationIdInt}, ${message}, ${state}, ${userUlidMap.get(userIdInt) ?? null}, ${pubUlid}, false, ${commentIdInt}, ${commentUlid})`
    );
  }
  logger.info(
    { publicationIdInt, commentIdInt, userIdInts, notifyType },
    "Created in-app notifications"
  );
}

type DeliveryPlan = Record<string, Record<string, UserInfo[]>>;

async function getNotifyPlan(
  comment: CommentData,
  publication: PublicationData
): Promise<DeliveryPlan | null> {
  const publicationIdInt = publication.id_int;
  const parentId = comment.parent_id;

  const notifyTypeRows = await dbSelect(
    sql`SELECT type FROM notification_types WHERE \`trigger\` = 'NEW_COMMENT' AND state = 'ACTIVE' ORDER BY priority ASC`
  );
  const notifyTypesByPriority = notifyTypeRows.map((r) => r["type"] as string);
  const notifyTypes = new Set(notifyTypesByPriority);
  const contributors = await dbSelect(
    sql`SELECT DISTINCT c.user_id_int, c.in_byline FROM contributors c JOIN versions v ON v.id_int = c.version_id_int JOIN publications p ON p.id_int = v.publication_id_int AND v.version_number = p.latest_version_number WHERE p.id_int = ${publicationIdInt}`
  );
  const userIdToNotifyTypes = new Map<number, string[]>();

  // See if there are unknown notification types
  const unknownNotifyTypes = [...notifyTypes].filter(
    (nt) => !knownNotifyTypes.has(nt)
  );
  if (unknownNotifyTypes.length > 0) {
    logger.warn(
      {
        unknownNotifyTypes,
      },
      "Unknown notification types for NEW_COMMENT"
    );
  }
  const missingNotifyTypes = [...knownNotifyTypes].filter(
    (nt) => !notifyTypes.has(nt)
  );
  if (missingNotifyTypes.length > 0) {
    logger.warn(
      {
        missingNotifyTypes,
      },
      "Missing notification types for NEW_COMMENT"
    );
  }
  // Push each user's notification types in priority order (notifyTypesByPriority),
  // since the "keep highest priority per user" step below picks types[0].
  for (const notifyType of notifyTypesByPriority) {
    if (notifyType === NEW_COMMENT__PARENT_COMMENTER && parentId) {
      const opId = (await dbSelectValue(
        sql`SELECT user_id_int FROM comments WHERE id_int = ${parentId} AND state = 'PUBLISHED'`
      )) as number | null;
      if (opId != null) {
        if (!userIdToNotifyTypes.has(opId)) userIdToNotifyTypes.set(opId, []);
        userIdToNotifyTypes.get(opId)!.push(notifyType);
      }
    } else if (notifyType === NEW_COMMENT__BYLINE_CONTRIB) {
      for (const c of contributors) {
        if (c["in_byline"]) {
          const uid = c["user_id_int"] as number;
          if (!userIdToNotifyTypes.has(uid)) userIdToNotifyTypes.set(uid, []);
          userIdToNotifyTypes.get(uid)!.push(notifyType);
        }
      }
    } else if (notifyType === NEW_COMMENT__NON_BYLINE_CONTRIB) {
      for (const c of contributors) {
        if (!c["in_byline"]) {
          const uid = c["user_id_int"] as number;
          if (!userIdToNotifyTypes.has(uid)) userIdToNotifyTypes.set(uid, []);
          userIdToNotifyTypes.get(uid)!.push(notifyType);
        }
      }
    } else if (notifyType === NEW_COMMENT__ORG_ADMIN) {
      const admins = await dbSelect(
        sql`SELECT DISTINCT ou.user_id_int FROM org_user_map ou JOIN org_publication_map op ON op.org_id_int = ou.org_id_int WHERE op.publication_id_int = ${publicationIdInt} AND FIND_IN_SET('ADMIN', ou.roles) AND (ou.end_at IS NULL OR ou.end_at > NOW())`
      );
      for (const a of admins) {
        const uid = a["user_id_int"] as number;
        if (!userIdToNotifyTypes.has(uid)) userIdToNotifyTypes.set(uid, []);
        userIdToNotifyTypes.get(uid)!.push(notifyType);
      }
    }
  }
  if (userIdToNotifyTypes.size === 0) return null;

  // Remove deleted users and commenter
  const userIds = [...userIdToNotifyTypes.keys()];
  if (userIds.length > 0) {
    const users = await dbSelect(
      sql`SELECT id, id_int, state FROM users WHERE id_int IN (${sql.join(
        userIds.map((id) => sql`${id}`),
        sql`, `
      )})`
    );
    for (const d of users) {
      if (d["state"] === "DELETED")
        userIdToNotifyTypes.delete(d["id_int"] as number);
    }
  }
  // Do not notify the author themself
  userIdToNotifyTypes.delete(comment.user_id_int);
  if (userIdToNotifyTypes.size === 0) return null;

  // Fork for email and in-app (copy each type array so splicing one
  // delivery method's list doesn't mutate the other's)
  const emailMap = new Map(
    [...userIdToNotifyTypes].map(([uid, types]) => [uid, [...types]])
  );
  const inAppMap = new Map(
    [...userIdToNotifyTypes].map(([uid, types]) => [uid, [...types]])
  );

  // Apply unsubscribe settings
  const allUserIds = [...userIdToNotifyTypes.keys()];
  if (allUserIds.length > 0) {
    const unsubs = await dbSelect(
      sql`SELECT uns.user_id_int, nt.type AS notification_type, uns.delivery_method FROM user_notification_settings uns JOIN notification_types nt ON nt.id_int = uns.notification_type_id_int WHERE uns.user_id_int IN (${sql.join(
        allUserIds.map((id) => sql`${id}`),
        sql`, `
      )}) AND uns.is_subscribed = FALSE`
    );
    for (const u of unsubs) {
      const uid = u["user_id_int"] as number;
      const nt = u["notification_type"] as string;
      const dm = u["delivery_method"] as string;
      if (dm === DELIVERY_METHOD__EMAIL) {
        const types = emailMap.get(uid);
        if (types) {
          const idx = types.indexOf(nt);
          if (idx >= 0) types.splice(idx, 1);
        }
      } else if (dm === DELIVERY_METHOD__IN_APP) {
        const types = inAppMap.get(uid);
        if (types) {
          const idx = types.indexOf(nt);
          if (idx >= 0) types.splice(idx, 1);
        }
      }
    }
  }

  // Keep highest priority per user
  const emailFinal = new Map<number, string>();
  for (const [uid, types] of emailMap) {
    if (types.length > 0) emailFinal.set(uid, types[0]!);
  }
  const inAppFinal = new Map<number, string>();
  for (const [uid, types] of inAppMap) {
    if (types.length > 0) inAppFinal.set(uid, types[0]!);
  }

  if (emailFinal.size === 0 && inAppFinal.size === 0) return null;

  // Fetch user details
  const fetchIds = new Set([...emailFinal.keys(), ...inAppFinal.keys()]);
  const users = await dbSelect(
    sql`SELECT id_int, email, first_name, last_name FROM users WHERE id_int IN (${sql.join(
      [...fetchIds].map((id) => sql`${id}`),
      sql`, `
    )})`
  );
  const userById = new Map<number, UserInfo>(
    users.map((u) => [
      u["id_int"] as number,
      {
        id_int: u["id_int"] as number,
        email: u["email"] as string,
        first_name: u["first_name"] as string,
        last_name: u["last_name"] as string,
      },
    ])
  );

  const result: DeliveryPlan = {};

  const emailNotifMap: Record<string, UserInfo[]> = {};
  for (const [uid, nt] of emailFinal) {
    const u = userById.get(uid);
    if (u) {
      if (!emailNotifMap[nt]) emailNotifMap[nt] = [];
      emailNotifMap[nt]!.push(u);
    }
  }
  if (Object.keys(emailNotifMap).length > 0)
    result[DELIVERY_METHOD__EMAIL] = emailNotifMap;

  const inAppNotifMap: Record<string, UserInfo[]> = {};
  for (const [uid, nt] of inAppFinal) {
    const u = userById.get(uid);
    if (u) {
      if (!inAppNotifMap[nt]) inAppNotifMap[nt] = [];
      inAppNotifMap[nt]!.push(u);
    }
  }
  if (Object.keys(inAppNotifMap).length > 0)
    result[DELIVERY_METHOD__IN_APP] = inAppNotifMap;

  return Object.keys(result).length > 0 ? result : null;
}
