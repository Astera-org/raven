import { getDb } from "#src/db/index.js";
import {
  type CommentState,
  type Notification,
  notifications,
} from "#src/db/schema.js";
import { and, count, desc, eq, inArray, isNull, lte } from "drizzle-orm";

type NotifNoDeleted = Omit<Notification, "deletedAt"> & { deletedAt?: never };

type NotificationsListItem = {
  items: (NotifNoDeleted & {
    publication: {
      slug: string;
      versions: {
        title: string | null;
      }[];
      orgPublicationMaps: {
        organization: {
          idInt: number;
          avatar: string | null;
        };
      }[];
    } | null;
    comment: {
      body: string;
      state: CommentState;
      user: {
        firstName: string;
        lastName: string;
        image: string | null;
      } | null;
    } | null;
  })[];
  total: number;
};

export class NotificationsRepository {
  private db: ReturnType<typeof getDb>;

  constructor() {
    this.db = getDb();
  }

  async getNotification(
    userId: number,
    notificationId: number
  ): Promise<NotifNoDeleted | null> {
    const rows = await this.db
      .select({
        idInt: notifications.idInt,
        id: notifications.id,
        userIdInt: notifications.userIdInt,
        userId: notifications.userId,
        publicationIdInt: notifications.publicationIdInt,
        publicationId: notifications.publicationId,
        commentIdInt: notifications.commentIdInt,
        commentId: notifications.commentId,
        message: notifications.message,
        state: notifications.state,
        seen: notifications.seen,
        createdAt: notifications.createdAt,
        updatedAt: notifications.updatedAt,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.userIdInt, userId),
          eq(notifications.idInt, notificationId),
          isNull(notifications.deletedAt)
        )
      )
      .limit(1);

    if (rows.length === 0) return null;

    return rows[0]!;
  }

  async getDistinctStates(userId: number): Promise<Notification["state"][]> {
    const rows = await this.db
      .selectDistinct({ state: notifications.state })
      .from(notifications)
      .where(
        and(
          eq(notifications.userIdInt, userId),
          isNull(notifications.deletedAt)
        )
      )
      .orderBy(notifications.state);

    return rows.map((row) => row.state);
  }

  async updateNotification(
    userId: number,
    notificationId: number,
    updates: Partial<Pick<Notification, "seen">>
  ): Promise<NotifNoDeleted | null> {
    await this.db
      .update(notifications)
      .set({ ...updates })
      .where(
        and(
          eq(notifications.userIdInt, userId),
          eq(notifications.idInt, notificationId),
          isNull(notifications.deletedAt)
        )
      );

    // Only PostgreSQL supports the .returning() method
    return this.getNotification(userId, notificationId);
  }

  async listNotifications({
    userId,
    perPage,
    offset,
    seen,
    state,
  }: {
    userId: number;
    perPage: number;
    offset: number;
    seen?: boolean | null;
    state?: Notification["state"] | null;
  }): Promise<NotificationsListItem> {
    const where = and(
      eq(notifications.userIdInt, userId),
      isNull(notifications.deletedAt),
      ...(seen != null ? [eq(notifications.seen, Number(seen))] : []),
      ...(state != null ? [eq(notifications.state, state)] : [])
    );

    const [items, [row]] = await Promise.all([
      this.db.query.notifications.findMany({
        columns: { deletedAt: false },
        where,
        orderBy: [desc(notifications.createdAt)],
        limit: perPage,
        offset,
        with: {
          publication: {
            columns: { slug: true },
            with: {
              versions: {
                columns: { title: true },
                where: (v, { eq }) => eq(v.state, "PUBLISHED"),
                orderBy: (v, { desc }) => desc(v.versionNumber),
                limit: 1,
              },
              orgPublicationMaps: {
                columns: {},
                orderBy: (m, { asc }) => asc(m.priority),
                limit: 1,
                with: {
                  organization: {
                    columns: { idInt: true, avatar: true },
                  },
                },
              },
            },
          },
          comment: {
            columns: { body: true, state: true },
            with: {
              user: {
                columns: { firstName: true, lastName: true, image: true },
              },
            },
          },
        },
      }),
      this.db.select({ total: count() }).from(notifications).where(where),
    ]);

    return { items, total: row?.total ?? 0 };
  }

  private async allOwned(
    userId: number,
    notificationIds: number[]
  ): Promise<boolean> {
    if (notificationIds.length === 0) return false;

    const [row] = await this.db
      .select({ total: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userIdInt, userId),
          inArray(notifications.idInt, notificationIds),
          isNull(notifications.deletedAt)
        )
      );

    return (row?.total ?? 0) === notificationIds.length;
  }

  async getNotificationsByIds(
    userId: number,
    notificationIds: number[]
  ): Promise<NotifNoDeleted[]> {
    if (notificationIds.length === 0) return [];

    return await this.db
      .select({
        idInt: notifications.idInt,
        id: notifications.id,
        userIdInt: notifications.userIdInt,
        userId: notifications.userId,
        publicationIdInt: notifications.publicationIdInt,
        publicationId: notifications.publicationId,
        commentIdInt: notifications.commentIdInt,
        commentId: notifications.commentId,
        message: notifications.message,
        state: notifications.state,
        seen: notifications.seen,
        createdAt: notifications.createdAt,
        updatedAt: notifications.updatedAt,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.userIdInt, userId),
          inArray(notifications.idInt, notificationIds),
          isNull(notifications.deletedAt)
        )
      )
      .orderBy(desc(notifications.createdAt));
  }

  async updateNotifications(
    userId: number,
    notificationIds: number[],
    updates: Partial<Pick<Notification, "seen">>
  ): Promise<NotifNoDeleted[] | null> {
    const uniqueIds = [...new Set(notificationIds)];
    if (!(await this.allOwned(userId, uniqueIds))) {
      return null;
    }

    await this.db
      .update(notifications)
      .set({ ...updates })
      .where(
        and(
          eq(notifications.userIdInt, userId),
          inArray(notifications.idInt, uniqueIds),
          isNull(notifications.deletedAt)
        )
      );

    return this.getNotificationsByIds(userId, uniqueIds);
  }

  async updateAllNotifications(
    userId: number,
    updates: Partial<Pick<Notification, "seen">>,
    state?: Notification["state"] | null,
    atOrBefore?: string | null
  ): Promise<number> {
    const [result] = await this.db
      .update(notifications)
      .set({ ...updates })
      .where(
        and(
          eq(notifications.userIdInt, userId),
          isNull(notifications.deletedAt),
          ...(state != null ? [eq(notifications.state, state)] : []),
          ...(atOrBefore != null
            ? [lte(notifications.createdAt, atOrBefore)]
            : [])
        )
      );

    return result.affectedRows;
  }

  async deleteNotification(
    userId: number,
    notificationId: number
  ): Promise<boolean> {
    const [result] = await this.db
      .update(notifications)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(notifications.userIdInt, userId),
          eq(notifications.idInt, notificationId),
          isNull(notifications.deletedAt)
        )
      );

    return result.affectedRows > 0;
  }

  async deleteNotifications(
    userId: number,
    notificationIds: number[]
  ): Promise<number | null> {
    const uniqueIds = [...new Set(notificationIds)];
    if (!(await this.allOwned(userId, uniqueIds))) return null;

    const [result] = await this.db
      .update(notifications)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(notifications.userIdInt, userId),
          inArray(notifications.idInt, uniqueIds),
          isNull(notifications.deletedAt)
        )
      );

    return result.affectedRows;
  }

  async deleteAllNotifications(
    userId: number,
    state?: Notification["state"] | null,
    atOrBefore?: string | null
  ): Promise<number> {
    const [result] = await this.db
      .update(notifications)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(notifications.userIdInt, userId),
          isNull(notifications.deletedAt),
          ...(state != null ? [eq(notifications.state, state)] : []),
          ...(atOrBefore != null
            ? [lte(notifications.createdAt, atOrBefore)]
            : [])
        )
      );

    return result.affectedRows;
  }
}
