import {
  comments,
  contributors,
  followers,
  notifications,
  type NotificationType,
  notificationTypes,
  organizations,
  orgFollowers,
  orgPublicationMap,
  orgUserMap,
  publications,
  type User,
  userNotificationSettings,
  users,
  type Version,
  versions,
} from "#src/db/schema.js";
import { and, asc, eq, inArray } from "drizzle-orm";
import { BaseRepository } from "./base-repository.js";
import { activeAdminMembership } from "./helpers/org-membership.js";
import { tf } from "./helpers/trigger-filled-map.js";

export type NotificationCreate = {
  userId: string;
  publicationId: string;
  commentId?: string | null;
  message: string;
  state: "NEW_PUBLICATION" | "COMMENT" | "REPLY";
};

export type PublicationAuthorRow = Pick<User, "firstName" | "lastName"> & {
  userId: string;
};

export type NotificationUnsubscriptionRow = {
  userId: string;
  type: string;
  deliveryMethod: "EMAIL" | "IN_APP";
};

export class NotificationsRepository extends BaseRepository {
  async createMany(rows: NotificationCreate[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insert(notifications).values(
      tf<typeof notifications>(
        rows.map((r) => ({
          id: null,
          userId: r.userId,
          userIdInt: null,
          publicationId: r.publicationId,
          publicationIdInt: null,
          commentId: r.commentId ?? null,
          commentIdInt: null,
          message: r.message,
          state: r.state,
          seen: 0,
        }))
      )
    );
  }

  async listActiveTypes(
    trigger: NonNullable<NotificationType["trigger"]>
  ): Promise<string[]> {
    const rows = await this.db
      .select({ type: notificationTypes.type })
      .from(notificationTypes)
      .where(
        and(
          eq(notificationTypes.trigger, trigger),
          eq(notificationTypes.state, "ACTIVE")
        )
      )
      .orderBy(asc(notificationTypes.priority));
    return rows.map((r) => r.type);
  }

  async listUnsubscriptions(
    userIds: string[]
  ): Promise<NotificationUnsubscriptionRow[]> {
    if (userIds.length === 0) return [];
    return this.db
      .select({
        userId: userNotificationSettings.userId,
        type: notificationTypes.type,
        deliveryMethod: userNotificationSettings.deliveryMethod,
      })
      .from(userNotificationSettings)
      .innerJoin(
        notificationTypes,
        eq(notificationTypes.id, userNotificationSettings.notificationTypeId)
      )
      .where(
        and(
          inArray(userNotificationSettings.userId, userIds),
          eq(userNotificationSettings.isSubscribed, false)
        )
      );
  }

  async findCommentWithAuthor(commentId: string) {
    const comment = await this.db.query.comments.findFirst({
      where: eq(comments.id, commentId),
      with: {
        user: { columns: { firstName: true, lastName: true, username: true } },
      },
    });
    return comment ?? null;
  }

  async findPublishedCommentAuthorId(
    commentId: string
  ): Promise<string | null> {
    const [row] = await this.db
      .select({ userId: comments.userId })
      .from(comments)
      .where(and(eq(comments.id, commentId), eq(comments.state, "PUBLISHED")))
      .limit(1);
    return row?.userId ?? null;
  }

  async findPublicationWithLatestTitle(publicationId: string) {
    const [row] = await this.db
      .select({
        id: publications.id,
        idInt: publications.idInt,
        slug: publications.slug,
        title: versions.title,
        versionId: versions.id,
      })
      .from(publications)
      .innerJoin(
        versions,
        and(
          eq(versions.publicationId, publications.id),
          eq(versions.versionNumber, publications.latestVersionNumber)
        )
      )
      .where(eq(publications.id, publicationId))
      .limit(1);
    return row ?? null;
  }

  async listContributorBylinesByVersionId(
    versionId: Version["id"]
  ): Promise<{ userId: string; inByline: boolean | null }[]> {
    return this.db
      .selectDistinct({
        userId: contributors.userId,
        inByline: contributors.inByline,
      })
      .from(contributors)
      .where(eq(contributors.versionId, versionId));
  }

  /** Contributors first, then the owner, each user appearing once. */
  async listPublicationAuthors(
    versionId: Version["id"]
  ): Promise<PublicationAuthorRow[]> {
    const contributorRows = await this.db
      .selectDistinct({
        userId: contributors.userId,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(contributors)
      .innerJoin(users, eq(users.id, contributors.userId))
      .where(eq(contributors.versionId, versionId));
    const ownerRows = await this.db
      .select({
        userId: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(versions)
      .innerJoin(publications, eq(publications.id, versions.publicationId))
      .innerJoin(users, eq(users.id, publications.ownerId))
      .where(eq(versions.id, versionId));

    const byUserId = new Map<string, PublicationAuthorRow>();
    for (const row of [...contributorRows, ...ownerRows]) {
      if (!byUserId.has(row.userId)) byUserId.set(row.userId, row);
    }
    return [...byUserId.values()];
  }

  async listActiveOrgAdminIds(publicationId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ userId: orgUserMap.userId })
      .from(orgUserMap)
      .innerJoin(
        orgPublicationMap,
        eq(orgPublicationMap.orgId, orgUserMap.orgId)
      )
      .where(
        and(
          eq(orgPublicationMap.publicationId, publicationId),
          activeAdminMembership()
        )
      );
    return rows.map((r) => r.userId);
  }

  async listPublicationOrgs(
    publicationId: string
  ): Promise<{ id: string; name: string }[]> {
    return this.db
      .select({ id: organizations.id, name: organizations.name })
      .from(orgPublicationMap)
      .innerJoin(organizations, eq(organizations.id, orgPublicationMap.orgId))
      .where(eq(orgPublicationMap.publicationId, publicationId));
  }

  async listUserFollowerIds(leaderId: string): Promise<string[]> {
    const rows = await this.db
      .select({ followerId: followers.followerId })
      .from(followers)
      .where(eq(followers.leaderId, leaderId));
    return rows.map((r) => r.followerId);
  }

  async listOrgFollowerIds(orgId: string): Promise<string[]> {
    const rows = await this.db
      .select({ followerId: orgFollowers.followerId })
      .from(orgFollowers)
      .where(eq(orgFollowers.orgId, orgId));
    return rows.map((r) => r.followerId);
  }

  async listRecipients(userIds: string[]) {
    if (userIds.length === 0) return [];
    return this.db
      .select({
        id: users.id,
        idInt: users.idInt,
        state: users.state,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(inArray(users.id, userIds));
  }
}
