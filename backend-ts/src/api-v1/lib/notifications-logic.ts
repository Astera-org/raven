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
import { makeRepositories } from "#v1/db-repositories/index.js";
import { type NotificationCreate } from "#v1/db-repositories/notifications-repository.js";

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

type DeliveryMethod =
  | typeof DELIVERY_METHOD__EMAIL
  | typeof DELIVERY_METHOD__IN_APP;

type Recipient = { id: string; info: UserInfo };

type DeliveryPlan = Partial<
  Record<DeliveryMethod, Record<string, Recipient[]>>
>;

export async function notifyForNewComment(commentId: string): Promise<void> {
  try {
    await _newComment(commentId);
  } catch (e) {
    logger.error(
      { err: e, commentId },
      "Failed to send notifications for comment"
    );
  }
}

export async function notifyForNewPublication({
  publicationId,
  versionId,
}: {
  publicationId: string;
  versionId: string;
}): Promise<void> {
  const repo = makeRepositories().notifications;
  const toNotify = new Map<string, string>();

  for (const author of await repo.listPublicationAuthors(versionId)) {
    toNotify.set(
      author.userId,
      "A publication you contributed to has been published"
    );
    for (const followerId of await repo.listUserFollowerIds(author.userId)) {
      if (!toNotify.has(followerId))
        toNotify.set(
          followerId,
          `${author.firstName} ${author.lastName} just published something new`
        );
    }
  }

  for (const org of await repo.listPublicationOrgs(publicationId)) {
    for (const followerId of await repo.listOrgFollowerIds(org.id)) {
      if (!toNotify.has(followerId))
        toNotify.set(followerId, `${org.name} just published something new`);
    }
  }

  await repo.createMany(
    [...toNotify].map(([userId, message]) => ({
      userId,
      publicationId,
      message,
      state: "NEW_PUBLICATION",
    }))
  );
}

async function _newComment(commentId: string): Promise<void> {
  const repo = makeRepositories().notifications;

  const commentRow = await repo.findCommentWithAuthor(commentId);
  if (!commentRow) throw new Error(`Comment ${commentId} not found`);

  const pubRow = await repo.findPublicationWithLatestTitle(
    commentRow.publicationId
  );
  if (!pubRow)
    throw new Error(`Publication ${commentRow.publicationId} not found`);

  // mail.ts is still keyed by legacy integer ids, so the email payloads carry
  // `idInt`s resolved from the rows above.
  const comment: CommentData = {
    id_int: commentRow.idInt,
    user_id_int: commentRow.userIdInt,
    publication_id: commentRow.publicationIdInt,
    parent_id: commentRow.parentIdInt,
    body: commentRow.body,
    pre_text: commentRow.preText,
    post_text: commentRow.postText,
    commenter_name:
      `${commentRow.user.firstName} ${commentRow.user.lastName}`.trim(),
    commenter_username: commentRow.user.username,
  };
  const publication: PublicationData = {
    id_int: pubRow.idInt,
    slug: pubRow.slug,
    title: pubRow.title ?? "",
  };

  const deliveryPlan = await getNotifyPlan(
    commentRow.userId,
    commentRow.parentId,
    pubRow.id,
    pubRow.versionId
  );
  if (!deliveryPlan) return;

  const emailPlan = deliveryPlan[DELIVERY_METHOD__EMAIL] ?? {};
  for (const [notifType, recipients] of Object.entries(emailPlan)) {
    const users = recipients.map((r) => r.info);
    if (notifType === NEW_COMMENT__BYLINE_CONTRIB) {
      await emailBylinesAboutNewComment(comment, publication, users, notifType);
    } else if (notifType === NEW_COMMENT__NON_BYLINE_CONTRIB) {
      await emailNonBylinesAboutNewComment(
        comment,
        publication,
        users,
        notifType
      );
    } else if (notifType === NEW_COMMENT__ORG_ADMIN) {
      await emailOrgAdminsAboutNewComment(
        comment,
        publication,
        users,
        notifType
      );
    } else if (notifType === NEW_COMMENT__PARENT_COMMENTER) {
      await emailCommenterAboutReply(
        comment,
        publication,
        users[0]!,
        notifType
      );
    }
  }

  const inAppPlan = deliveryPlan[DELIVERY_METHOD__IN_APP] ?? {};
  for (const [notifyType, recipients] of Object.entries(inAppPlan)) {
    await createInAppNotifications(
      pubRow.id,
      commentRow.id,
      recipients.map((r) => r.id),
      notifyType
    );
  }
}

async function createInAppNotifications(
  publicationId: string,
  commentId: string,
  userIds: string[],
  notifyType: string
): Promise<void> {
  if (userIds.length === 0) return;
  const message =
    notifyType === NEW_COMMENT__BYLINE_CONTRIB ||
    notifyType === NEW_COMMENT__NON_BYLINE_CONTRIB
      ? "New comment on your publication"
      : notifyType === NEW_COMMENT__ORG_ADMIN
        ? "New comment on an org you manage"
        : notifyType === NEW_COMMENT__PARENT_COMMENTER
          ? "New reply to your comment"
          : "New comment notification";
  const state: NotificationCreate["state"] =
    notifyType === NEW_COMMENT__PARENT_COMMENTER ? "REPLY" : "COMMENT";
  await makeRepositories().notifications.createMany(
    userIds.map((userId) => ({
      userId,
      publicationId,
      commentId,
      message,
      state,
    }))
  );
  logger.info(
    { publicationId, commentId, userIds, notifyType },
    "Created in-app notifications"
  );
}

async function getNotifyPlan(
  commenterId: string,
  parentCommentId: string | null,
  publicationId: string,
  versionId: string
): Promise<DeliveryPlan | null> {
  const repo = makeRepositories().notifications;

  const notifyTypesByPriority = await repo.listActiveTypes("NEW_COMMENT");
  const notifyTypes = new Set(notifyTypesByPriority);
  const contributors = await repo.listContributorBylinesByVersionId(versionId);
  const userIdToNotifyTypes = new Map<string, string[]>();
  const addNotifyType = (userId: string, notifyType: string) => {
    if (!userIdToNotifyTypes.has(userId)) userIdToNotifyTypes.set(userId, []);
    userIdToNotifyTypes.get(userId)!.push(notifyType);
  };

  const unknownNotifyTypes = [...notifyTypes].filter(
    (nt) => !knownNotifyTypes.has(nt)
  );
  if (unknownNotifyTypes.length > 0) {
    logger.warn(
      { unknownNotifyTypes },
      "Unknown notification types for NEW_COMMENT"
    );
  }
  const missingNotifyTypes = [...knownNotifyTypes].filter(
    (nt) => !notifyTypes.has(nt)
  );
  if (missingNotifyTypes.length > 0) {
    logger.warn(
      { missingNotifyTypes },
      "Missing notification types for NEW_COMMENT"
    );
  }

  // Push each user's notification types in priority order, since the "keep
  // highest priority per user" step below picks types[0].
  for (const notifyType of notifyTypesByPriority) {
    if (notifyType === NEW_COMMENT__PARENT_COMMENTER && parentCommentId) {
      const opId = await repo.findPublishedCommentAuthorId(parentCommentId);
      if (opId != null) addNotifyType(opId, notifyType);
    } else if (notifyType === NEW_COMMENT__BYLINE_CONTRIB) {
      for (const c of contributors) {
        if (c.inByline) addNotifyType(c.userId, notifyType);
      }
    } else if (notifyType === NEW_COMMENT__NON_BYLINE_CONTRIB) {
      for (const c of contributors) {
        if (!c.inByline) addNotifyType(c.userId, notifyType);
      }
    } else if (notifyType === NEW_COMMENT__ORG_ADMIN) {
      for (const uid of await repo.listActiveOrgAdminIds(publicationId)) {
        addNotifyType(uid, notifyType);
      }
    }
  }

  const recipientRows = await repo.listRecipients([
    ...userIdToNotifyTypes.keys(),
  ]);
  for (const u of recipientRows) {
    if (u.state === "DELETED") userIdToNotifyTypes.delete(u.id);
  }
  // Do not notify the author themself
  userIdToNotifyTypes.delete(commenterId);
  if (userIdToNotifyTypes.size === 0) return null;

  // Fork for email and in-app (copy each type array so splicing one
  // delivery method's list doesn't mutate the other's)
  const typesByMethod: Record<DeliveryMethod, Map<string, string[]>> = {
    [DELIVERY_METHOD__EMAIL]: new Map(
      [...userIdToNotifyTypes].map(([uid, types]) => [uid, [...types]])
    ),
    [DELIVERY_METHOD__IN_APP]: new Map(
      [...userIdToNotifyTypes].map(([uid, types]) => [uid, [...types]])
    ),
  };

  const unsubs = await repo.listUnsubscriptions([
    ...userIdToNotifyTypes.keys(),
  ]);
  for (const u of unsubs) {
    const types = typesByMethod[u.deliveryMethod].get(u.userId);
    const idx = types?.indexOf(u.type) ?? -1;
    if (idx >= 0) types!.splice(idx, 1);
  }

  const recipientById = new Map<string, Recipient>(
    recipientRows.map((u) => [
      u.id,
      {
        id: u.id,
        info: {
          id_int: u.idInt,
          email: u.email ?? "",
          first_name: u.firstName,
          last_name: u.lastName,
        },
      },
    ])
  );

  // Keep highest priority per user
  const result: DeliveryPlan = {};
  for (const method of [
    DELIVERY_METHOD__EMAIL,
    DELIVERY_METHOD__IN_APP,
  ] as const) {
    const notifMap: Record<string, Recipient[]> = {};
    for (const [uid, types] of typesByMethod[method]) {
      const recipient = recipientById.get(uid);
      if (types.length === 0 || !recipient) continue;
      (notifMap[types[0]!] ??= []).push(recipient);
    }
    if (Object.keys(notifMap).length > 0) result[method] = notifMap;
  }

  return Object.keys(result).length > 0 ? result : null;
}
