import { escape } from "mysql2";
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  TestApiClient,
  authClient,
  authClientWithId,
  execute,
  getUserIds,
  makeUser,
  query,
  registerUser,
  seedNotificationType,
  seedNotificationTypesStandard,
  seedOrg,
  seedOrgMember,
  seedPublication,
} from "./helpers.js";

const JWT_SECRET_KEY = "test-secret-key-do-not-use-in-production";

function makeUnsubscribeToken(email: string, notificationType: string): string {
  const payload = JSON.stringify({ email, type: notificationType });
  const payloadBuf = Buffer.from(payload);
  const mac = createHmac("sha256", JWT_SECRET_KEY).update(payloadBuf).digest();
  const payloadB64 = payloadBuf.toString("base64url").replace(/=/g, "");
  const macB64 = mac.toString("base64url").replace(/=/g, "");
  return `${payloadB64}.${macB64}`;
}

async function seedNotification(
  user: { id: string; id_int: number },
  overrides: {
    seen?: number;
    message?: string;
    state?: string;
    created_at?: string;
  } = {}
): Promise<{ id: string; id_int: number }> {
  const seen = overrides.seen ?? 0;
  const message = overrides.message ?? "Test notification";
  const state = overrides.state ?? "NEW_PUBLICATION";
  const columns = ["user_id_int", "user_id", "seen", "message", "state"];
  const values = [
    String(user.id_int),
    escape(user.id),
    String(seen),
    escape(message),
    escape(state),
  ];
  if (overrides.created_at !== undefined) {
    columns.push("created_at");
    values.push(escape(overrides.created_at));
  }
  const result = await execute(
    `INSERT INTO notifications (${columns.join(", ")}) VALUES (${values.join(", ")})`
  );
  const rows = await query<{ id: string }>(
    `SELECT id FROM notifications WHERE id_int = ${result.insertId}`
  );
  return { id: rows[0]!.id, id_int: result.insertId };
}

describe("/api/notifications", () => {
  beforeEach(async () => {
    await seedNotificationTypesStandard();
    await seedNotificationType("DEPRECATED_TYPE", { state: "DEPRECATED" });
  });

  describe("POST /unsubscribe", () => {
    it("unsubscribes via a query-string token and reports obfuscated email", async () => {
      const { user, userIds } = await authClientWithId();

      const token = makeUnsubscribeToken(
        user.email,
        "NEW_COMMENT__PARENT_COMMENTER"
      );
      const resp = await new TestApiClient().post(
        `/api/notifications/unsubscribe?token=${token}`
      );
      expect(resp.status).toBe(200);
      expect(resp.body.notification_type).toBe("NEW_COMMENT__PARENT_COMMENTER");
      expect(resp.body.notification_name).toBe("Parent commenter");
      expect(resp.body.email).not.toBe(user.email);
      expect(resp.body.email).toContain("@example.com");

      const rows = await query<{ is_subscribed: number }>(
        `SELECT uns.is_subscribed FROM user_notification_settings uns
         JOIN notification_types nt ON nt.id = uns.notification_type_id
         WHERE uns.user_id = ${escape(userIds.id)} AND nt.type = 'NEW_COMMENT__PARENT_COMMENTER' AND uns.delivery_method = 'EMAIL'`
      );
      expect(rows).toHaveLength(1);
      expect(Number(rows[0]!.is_subscribed)).toBe(0);
    });

    it("accepts a one-click unsubscribe sent with a mail client's Origin", async () => {
      const { user } = await authClient();
      const token = makeUnsubscribeToken(
        user.email,
        "NEW_COMMENT__PARENT_COMMENTER"
      );
      const resp = await new TestApiClient()
        .post(`/api/v0/notifications/unsubscribe?token=${token}`)
        .set("Origin", "https://mail.example.net")
        .type("form")
        .send("List-Unsubscribe=One-Click");
      expect(resp.status).toBe(200);
      expect(resp.body.notification_type).toBe("NEW_COMMENT__PARENT_COMMENTER");

      const tampered = await new TestApiClient()
        .post("/api/notifications/unsubscribe?token=bm90LWpzb24.deadbeef")
        .set("Origin", "https://mail.example.net");
      expect(tampered.status).toBe(400);
      expect(tampered.body.error).toBe("Invalid token");
    });

    it("unsubscribes via a JSON body token", async () => {
      const { user } = await authClient();
      const token = makeUnsubscribeToken(
        user.email,
        "NEW_COMMENT__BYLINE_CONTRIB"
      );
      const resp = await new TestApiClient()
        .post("/api/notifications/unsubscribe")
        .send({ token });
      expect(resp.status).toBe(200);
      expect(resp.body.notification_type).toBe("NEW_COMMENT__BYLINE_CONTRIB");
    });

    it("rejects missing or invalid tokens", async () => {
      expect(
        (await new TestApiClient().post("/api/notifications/unsubscribe"))
          .status
      ).toBe(400);

      const missingToken = await new TestApiClient()
        .post("/api/notifications/unsubscribe")
        .send({});
      expect(missingToken.status).toBe(400);
      expect(missingToken.body.error).toBe("Missing token");

      const tampered = await new TestApiClient().post(
        "/api/notifications/unsubscribe?token=bm90LWpzb24.deadbeef"
      );
      expect(tampered.status).toBe(400);
      expect(tampered.body.error).toBe("Invalid token");
    });

    it("returns 404 for an unknown notification type", async () => {
      const { user } = await authClient();
      const token = makeUnsubscribeToken(user.email, "NOT_A_REAL_TYPE");
      const resp = await new TestApiClient().post(
        `/api/notifications/unsubscribe?token=${token}`
      );
      expect(resp.status).toBe(404);
      expect(resp.body.error).toBe("Notification type not found");
    });

    it("returns 404 for an email with no matching user", async () => {
      const token = makeUnsubscribeToken(
        "nobody@example.com",
        "NEW_COMMENT__NON_BYLINE_CONTRIB"
      );
      const resp = await new TestApiClient().post(
        `/api/notifications/unsubscribe?token=${token}`
      );
      expect(resp.status).toBe(404);
      expect(resp.body.error).toBe("User not found");
    });

    it("flags token_matches_auth_user only when the session user's email matches", async () => {
      const { client, user } = await authClient();
      const token = makeUnsubscribeToken(
        user.email,
        "NEW_COMMENT__PARENT_COMMENTER"
      );

      const matched = await client.post(
        `/api/notifications/unsubscribe?token=${token}`
      );
      expect(matched.status).toBe(200);
      expect(matched.body.token_matches_auth_user).toBe(true);

      const unauth = await new TestApiClient().post(
        `/api/notifications/unsubscribe?token=${token}`
      );
      expect(unauth.status).toBe(200);
      expect(unauth.body.token_matches_auth_user).toBeUndefined();

      const other = await registerUser(new TestApiClient(), makeUser("other1"));
      const otherClient = new TestApiClient();
      await otherClient.login(other.username, other.password);
      const mismatched = await otherClient.post(
        `/api/notifications/unsubscribe?token=${token}`
      );
      expect(mismatched.status).toBe(200);
      expect(mismatched.body.token_matches_auth_user).toBeUndefined();
    });
  });

  describe("GET /get_user_settings", () => {
    it("requires authentication", async () => {
      expect(
        (await new TestApiClient().get("/api/notifications/get_user_settings"))
          .status
      ).toBe(401);
    });

    it("defaults to subscribed and orders by priority", async () => {
      const { client } = await authClient();

      const resp = await client.get("/api/notifications/get_user_settings");
      expect(resp.status).toBe(200);
      expect(
        resp.body.map((r: { notification_type: string }) => r.notification_type)
      ).toEqual([
        "NEW_COMMENT__PARENT_COMMENTER",
        "NEW_COMMENT__BYLINE_CONTRIB",
        "NEW_COMMENT__NON_BYLINE_CONTRIB",
      ]);
      for (const row of resp.body) {
        expect(row.is_subscribed_email).toBeTruthy();
        expect(row.is_subscribed_in_app).toBeTruthy();
      }
    });

    it("reflects overridden settings", async () => {
      const { client } = await authClient();
      await client.put("/api/notifications/update_user_setting").send({
        notification_type: "NEW_COMMENT__PARENT_COMMENTER",
        delivery_method: "EMAIL",
        is_subscribed: false,
      });

      const resp = await client.get("/api/notifications/get_user_settings");
      const row = resp.body.find(
        (r: { notification_type: string }) =>
          r.notification_type === "NEW_COMMENT__PARENT_COMMENTER"
      );
      expect(row.is_subscribed_email).toBeFalsy();
      expect(row.is_subscribed_in_app).toBeTruthy();
    });

    it("only shows NEW_COMMENT__ORG_ADMIN to org admins", async () => {
      const { client, userIds } = await authClientWithId();

      const asRegular = await client.get(
        "/api/notifications/get_user_settings"
      );
      expect(
        asRegular.body.some(
          (r: { notification_type: string }) =>
            r.notification_type === "NEW_COMMENT__ORG_ADMIN"
        )
      ).toBe(false);

      const { orgIdInt: orgId } = await seedOrg();
      await seedOrgMember(orgId, userIds, "ADMIN");

      const asAdmin = await client.get("/api/notifications/get_user_settings");
      expect(
        asAdmin.body.some(
          (r: { notification_type: string }) =>
            r.notification_type === "NEW_COMMENT__ORG_ADMIN"
        )
      ).toBe(true);
    });
  });

  describe("PUT /update_user_setting", () => {
    it("requires authentication", async () => {
      expect(
        (
          await new TestApiClient()
            .put("/api/notifications/update_user_setting")
            .send({
              notification_type: "NEW_COMMENT__PARENT_COMMENTER",
              delivery_method: "EMAIL",
              is_subscribed: false,
            })
        ).status
      ).toBe(401);
    });

    it("rejects missing or invalid fields", async () => {
      const { client } = await authClient();

      expect(
        (
          await client.put("/api/notifications/update_user_setting").send({
            delivery_method: "EMAIL",
            is_subscribed: false,
          })
        ).status
      ).toBe(400);

      expect(
        (
          await client.put("/api/notifications/update_user_setting").send({
            notification_type: "NEW_COMMENT__PARENT_COMMENTER",
            delivery_method: "CARRIER_PIGEON",
            is_subscribed: false,
          })
        ).status
      ).toBe(400);

      expect(
        (
          await client.put("/api/notifications/update_user_setting").send({
            notification_type: "NEW_COMMENT__PARENT_COMMENTER",
            delivery_method: "EMAIL",
            is_subscribed: "false",
          })
        ).status
      ).toBe(400);
    });

    it("returns 404 for an unknown or inactive notification type", async () => {
      const { client } = await authClient();

      expect(
        (
          await client.put("/api/notifications/update_user_setting").send({
            notification_type: "NOT_A_REAL_TYPE",
            delivery_method: "EMAIL",
            is_subscribed: false,
          })
        ).status
      ).toBe(404);

      expect(
        (
          await client.put("/api/notifications/update_user_setting").send({
            notification_type: "DEPRECATED_TYPE",
            delivery_method: "EMAIL",
            is_subscribed: false,
          })
        ).status
      ).toBe(404);
    });

    it("upserts the setting on repeated calls", async () => {
      const { client, userIds } = await authClientWithId();

      const first = await client
        .put("/api/notifications/update_user_setting")
        .send({
          notification_type: "NEW_COMMENT__PARENT_COMMENTER",
          delivery_method: "IN_APP",
          is_subscribed: false,
        });
      expect(first.status).toBe(200);
      expect(first.body.message).toBe("Setting updated");

      const second = await client
        .put("/api/notifications/update_user_setting")
        .send({
          notification_type: "NEW_COMMENT__PARENT_COMMENTER",
          delivery_method: "IN_APP",
          is_subscribed: true,
        });
      expect(second.status).toBe(200);

      const rows = await query<{ is_subscribed: number }>(
        `SELECT uns.is_subscribed FROM user_notification_settings uns
         JOIN notification_types nt ON nt.id = uns.notification_type_id
         WHERE uns.user_id = ${escape(userIds.id)} AND nt.type = 'NEW_COMMENT__PARENT_COMMENTER' AND uns.delivery_method = 'IN_APP'`
      );
      expect(rows).toHaveLength(1);
      expect(Number(rows[0]!.is_subscribed)).toBe(1);
    });
  });

  describe("GET /", () => {
    it("requires authentication", async () => {
      expect((await new TestApiClient().get("/api/notifications")).status).toBe(
        401
      );
    });

    it("lists only the caller's notifications with pagination shape", async () => {
      const { client, userIds } = await authClientWithId();
      const other = await registerUser(new TestApiClient(), makeUser("other2"));
      const otherId = await getUserIds(other.username);

      await seedNotification(userIds, { message: "Mine 1" });
      await seedNotification(userIds, { message: "Mine 2" });
      await seedNotification(otherId, { message: "Not mine" });

      const resp = await client.get("/api/notifications");
      expect(resp.status).toBe(200);
      expect(resp.body.pagination).toMatchObject({
        total: 2,
        page: 1,
        per_page: 18,
      });
      const messages = resp.body.items.map(
        (n: { message: string }) => n.message
      );
      expect(messages.sort()).toEqual(["Mine 1", "Mine 2"]);
    });

    it("filters by seen state", async () => {
      const { client, userIds } = await authClientWithId();
      await seedNotification(userIds, { seen: 1, message: "Seen" });
      await seedNotification(userIds, { seen: 0, message: "Unseen" });

      const seenResp = await client.get("/api/notifications?seen=true");
      expect(
        seenResp.body.items.map((n: { message: string }) => n.message)
      ).toEqual(["Seen"]);

      const unseenResp = await client.get("/api/notifications?seen=false");
      expect(
        unseenResp.body.items.map((n: { message: string }) => n.message)
      ).toEqual(["Unseen"]);
    });

    it("uses the published title when a newer draft exists", async () => {
      const { client, userIds } = await authClientWithId();
      const publication = await seedPublication({
        ownerId: userIds.id_int,
        slug: "notification-title",
        state: "PUBLISHED",
        title: "Published title",
      });
      await execute(
        `UPDATE versions SET publication_id = ${escape(publication.id)} WHERE publication_id_int = ${publication.intId}`
      );
      await execute(
        `INSERT INTO versions (publication_id_int, publication_id, version_number, title, state) VALUES (${publication.intId}, ${escape(publication.id)}, 2, 'Private draft title', 'DRAFT')`
      );
      const notification = await seedNotification(userIds);
      await execute(
        `UPDATE notifications SET publication_id_int = ${publication.intId}, publication_id = ${escape(publication.id)} WHERE id_int = ${notification.id_int}`
      );

      const resp = await client.get("/api/notifications");

      expect(resp.status).toBe(200);
      expect(resp.body.items[0].publication_title).toBe("Published title");
    });

    it("enriches notifications only from published comments", async () => {
      const { client, userIds } = await authClientWithId();
      const publication = await seedPublication({
        ownerId: userIds.id_int,
        slug: "notification-comments",
        state: "PUBLISHED",
      });
      const published = await execute(
        `INSERT INTO comments (publication_id_int, user_id_int, user_id, body, state) VALUES (${publication.intId}, ${userIds.id_int}, ${escape(userIds.id)}, 'Visible comment body', 'PUBLISHED')`
      );
      const moderated = await execute(
        `INSERT INTO comments (publication_id_int, user_id_int, user_id, body, state) VALUES (${publication.intId}, ${userIds.id_int}, ${escape(userIds.id)}, 'Moderated comment body', 'MODERATED')`
      );
      const withdrawn = await execute(
        `INSERT INTO comments (id, publication_id_int, user_id_int, user_id, body, state) VALUES (ULID(), ${publication.intId}, ${userIds.id_int}, ${escape(userIds.id)}, 'Withdrawn comment body', 'WITHDRAWN')`
      );
      const commentIds = await query<{ id: string; id_int: number }>(
        `SELECT id, id_int FROM comments WHERE id_int IN (${published.insertId}, ${moderated.insertId}, ${withdrawn.insertId})`
      );
      const publishedIds = commentIds.find(
        (comment) => comment.id_int === published.insertId
      )!;
      const moderatedIds = commentIds.find(
        (comment) => comment.id_int === moderated.insertId
      )!;
      const withdrawnIds = commentIds.find(
        (comment) => comment.id_int === withdrawn.insertId
      )!;
      const publishedNotification = await seedNotification(userIds, {
        message: "Published comment",
        state: "COMMENT",
      });
      const moderatedNotification = await seedNotification(userIds, {
        message: "Moderated comment",
        state: "COMMENT",
      });
      const withdrawnNotification = await seedNotification(userIds, {
        message: "Withdrawn comment",
        state: "COMMENT",
      });
      await execute(
        `UPDATE notifications SET comment_id_int = ${publishedIds.id_int}, comment_id = ${escape(publishedIds.id)} WHERE id_int = ${publishedNotification.id_int}`
      );
      await execute(
        `UPDATE notifications SET comment_id_int = ${moderatedIds.id_int}, comment_id = ${escape(moderatedIds.id)} WHERE id_int = ${moderatedNotification.id_int}`
      );
      await execute(
        `UPDATE notifications SET comment_id_int = ${withdrawnIds.id_int}, comment_id = ${escape(withdrawnIds.id)} WHERE id_int = ${withdrawnNotification.id_int}`
      );

      const resp = await client.get("/api/notifications");
      const items = new Map(
        resp.body.items.map((item: { message: string }) => [item.message, item])
      );

      expect(resp.status).toBe(200);
      expect(items.get("Published comment")).toMatchObject({
        comment_text_excerpt: "Visible comment body",
        comment_author: {
          first_name: expect.any(String),
          last_name: expect.any(String),
        },
        comment_state: "PUBLISHED",
      });
      expect(items.get("Moderated comment")).toMatchObject({
        comment_text_excerpt: null,
        comment_author: null,
        comment_state: "MODERATED",
      });
      expect(items.get("Withdrawn comment")).toMatchObject({
        comment_text_excerpt: null,
        comment_author: null,
        comment_state: "WITHDRAWN",
      });
    });
  });

  describe("PATCH /", () => {
    it("requires authentication", async () => {
      expect(
        (
          await new TestApiClient()
            .patch("/api/notifications")
            .send({ all: true })
        ).status
      ).toBe(401);
    });

    it("marks all of the caller's notifications seen", async () => {
      const { client, userIds } = await authClientWithId();
      const other = await registerUser(new TestApiClient(), makeUser("other3"));
      const otherId = await getUserIds(other.username);
      await seedNotification(userIds);
      await seedNotification(userIds);
      const untouchedId = await seedNotification(otherId);

      const resp = await client.patch("/api/notifications").send({ all: true });
      expect(resp.status).toBe(200);
      expect(resp.body.updated).toBe(2);

      const rows = await query<{ seen: number }>(
        `SELECT seen FROM notifications WHERE user_id = ${escape(userIds.id)}`
      );
      expect(rows.every((r) => Number(r.seen) === 1)).toBe(true);

      const untouched = await query<{ seen: number }>(
        `SELECT seen FROM notifications WHERE id = ${escape(untouchedId.id)}`
      );
      expect(Number(untouched[0]!.seen)).toBe(0);
    });

    it("marks specific owned notifications seen", async () => {
      const { client, userIds } = await authClientWithId();
      const id1 = await seedNotification(userIds);
      const id2 = await seedNotification(userIds);

      const resp = await client
        .patch("/api/notifications")
        .send({ ids: [id1.id_int], seen: true });
      expect(resp.status).toBe(200);
      expect(resp.body.items).toHaveLength(1);
      expect(resp.body.items[0].id).toBe(id1.id_int);
      expect(Number(resp.body.items[0].seen)).toBe(1);

      const rows = await query<{ id: string; seen: number }>(
        `SELECT id, seen FROM notifications WHERE id IN (${escape(id1.id)}, ${escape(id2.id)}) AND deleted_at IS NULL`
      );
      expect(rows).toHaveLength(2);
      const rowMap = new Map(rows.map((r) => [r.id, r.seen]));
      expect(rowMap.get(id1.id)).toBe(1);
      expect(rowMap.get(id2.id)).toBe(0);
    });

    it("rejects missing ids and unowned ids", async () => {
      const { client } = await authClient();
      const other = await registerUser(new TestApiClient(), makeUser("other4"));
      const otherId = await getUserIds(other.username);
      const otherNoteId = await seedNotification(otherId);

      const missing = await client.patch("/api/notifications").send({});
      expect(missing.status).toBe(400);
      expect(missing.body.errors.ids).toBeDefined();

      const notAllOwned = await client
        .patch("/api/notifications")
        .send({ ids: [otherNoteId.id_int] });
      expect(notAllOwned.status).toBe(404);
      expect(notAllOwned.body.errors.ids).toBeDefined();
    });

    it("marks only notifications of the given state seen when filtered", async () => {
      const { client, userIds } = await authClientWithId();
      const comment = await seedNotification(userIds, { state: "COMMENT" });
      const reply = await seedNotification(userIds, { state: "REPLY" });

      const resp = await client
        .patch("/api/notifications")
        .send({ all: true, state: "COMMENT" });
      expect(resp.status).toBe(200);
      expect(resp.body.updated).toBe(1);

      const rows = await query<{ id: string; seen: number }>(
        `SELECT id, seen FROM notifications WHERE id IN (${escape(comment.id)}, ${escape(reply.id)})`
      );
      const rowMap = new Map(rows.map((r) => [r.id, Number(r.seen)]));
      expect(rowMap.get(comment.id)).toBe(1);
      expect(rowMap.get(reply.id)).toBe(0);
    });

    it("rejects an invalid state filter", async () => {
      const { client } = await authClient();

      const resp = await client
        .patch("/api/notifications")
        .send({ all: true, state: "NOT_A_REAL_STATE" });
      expect(resp.status).toBe(400);
      expect(resp.body.errors.state).toBeDefined();
    });

    it("scopes select-all update to notifications at or before mostRecentNotificationId", async () => {
      const { client, userIds } = await authClientWithId();
      const older = await seedNotification(userIds, {
        created_at: "2026-01-01 00:00:00",
      });
      const boundary = await seedNotification(userIds, {
        created_at: "2026-01-01 00:01:00",
      });
      const newer = await seedNotification(userIds, {
        created_at: "2026-01-01 00:02:00",
      });

      const resp = await client
        .patch("/api/notifications")
        .send({ all: true, mostRecentNotificationId: boundary.id_int });
      expect(resp.status).toBe(200);
      expect(resp.body.updated).toBe(2);

      const rows = await query<{ id: string; seen: number }>(
        `SELECT id, seen FROM notifications WHERE id IN (${escape(older.id)}, ${escape(boundary.id)}, ${escape(newer.id)})`
      );
      const rowMap = new Map(rows.map((r) => [r.id, Number(r.seen)]));
      expect(rowMap.get(older.id)).toBe(1);
      expect(rowMap.get(boundary.id)).toBe(1);
      expect(rowMap.get(newer.id)).toBe(0);
    });

    it("marks all of the caller's notifications seen when mostRecentNotificationId is omitted", async () => {
      const { client, userIds } = await authClientWithId();
      const first = await seedNotification(userIds, {
        created_at: "2026-01-01 00:00:00",
      });
      const second = await seedNotification(userIds, {
        created_at: "2026-01-01 00:01:00",
      });

      const resp = await client.patch("/api/notifications").send({ all: true });
      expect(resp.status).toBe(200);
      expect(resp.body.updated).toBe(2);

      const rows = await query<{ id: string; seen: number }>(
        `SELECT id, seen FROM notifications WHERE id IN (${escape(first.id)}, ${escape(second.id)})`
      );
      expect(rows.every((r) => Number(r.seen) === 1)).toBe(true);
    });

    it("returns 404 for a nonexistent mostRecentNotificationId", async () => {
      const { client } = await authClient();

      const resp = await client
        .patch("/api/notifications")
        .send({ all: true, mostRecentNotificationId: 999999 });
      expect(resp.status).toBe(404);
    });

    it("returns 404 for a mostRecentNotificationId owned by another user", async () => {
      const { client } = await authClient();
      const other = await registerUser(new TestApiClient(), makeUser("other9"));
      const otherId = await getUserIds(other.username);
      const otherNoteId = await seedNotification(otherId);

      const resp = await client
        .patch("/api/notifications")
        .send({ all: true, mostRecentNotificationId: otherNoteId.id_int });
      expect(resp.status).toBe(404);
    });
  });

  describe("GET /:note_id", () => {
    it("requires authentication", async () => {
      expect(
        (await new TestApiClient().get("/api/notifications/1")).status
      ).toBe(401);
    });

    it("returns 404 for a non-numeric or unowned id", async () => {
      const { client } = await authClient();
      expect((await client.get("/api/notifications/abc")).status).toBe(404);
      expect((await client.get("/api/notifications/999999")).status).toBe(404);

      const other = await registerUser(new TestApiClient(), makeUser("other5"));
      const otherId = await getUserIds(other.username);
      const otherNoteId = await seedNotification(otherId);
      expect(
        (await client.get(`/api/notifications/${otherNoteId.id_int}`)).status
      ).toBe(404);
    });

    it("returns the notification when owned", async () => {
      const { client, userIds } = await authClientWithId();
      const noteId = await seedNotification(userIds, { message: "Fetch me" });

      const resp = await client.get(`/api/notifications/${noteId.id_int}`);
      expect(resp.status).toBe(200);
      expect(resp.body.id).toBe(noteId.id_int);
      expect(resp.body.message).toBe("Fetch me");
    });
  });

  describe("PATCH /:note_id", () => {
    it("requires authentication", async () => {
      expect(
        (
          await new TestApiClient()
            .patch("/api/notifications/1")
            .send({ seen: true })
        ).status
      ).toBe(401);
    });

    it("returns 404 for a non-numeric or unowned id", async () => {
      const { client } = await authClient();
      expect(
        (await client.patch("/api/notifications/abc").send({ seen: true }))
          .status
      ).toBe(404);
      expect(
        (await client.patch("/api/notifications/999999").send({ seen: true }))
          .status
      ).toBe(404);
    });

    it("updates the seen state when owned", async () => {
      const { client, userIds } = await authClientWithId();
      const noteId = await seedNotification(userIds, { seen: 0 });

      const resp = await client
        .patch(`/api/notifications/${noteId.id_int}`)
        .send({ seen: true });
      expect(resp.status).toBe(200);
      expect(Number(resp.body.seen)).toBe(1);

      const rows = await query<{ seen: number }>(
        `SELECT seen FROM notifications WHERE id_int = ${noteId.id_int}`
      );
      expect(Number(rows[0]!.seen)).toBe(1);
    });
  });

  describe("DELETE /", () => {
    it("requires authentication", async () => {
      expect(
        (
          await new TestApiClient()
            .delete("/api/notifications")
            .send({ all: true })
        ).status
      ).toBe(401);
    });

    it("deletes all of the caller's notifications", async () => {
      const { client, userIds } = await authClientWithId();
      const other = await registerUser(new TestApiClient(), makeUser("other6"));
      const otherId = await getUserIds(other.username);
      await seedNotification(userIds);
      await seedNotification(userIds);
      const untouchedId = await seedNotification(otherId);

      const resp = await client
        .delete("/api/notifications")
        .send({ all: true });
      expect(resp.status).toBe(200);
      expect(resp.body.deleted).toBe(2);

      const rows = await query(
        `SELECT id_int FROM notifications WHERE user_id = ${escape(userIds.id)} and deleted_at IS NULL`
      );
      expect(rows).toHaveLength(0);

      const untouched = await query(
        `SELECT id_int FROM notifications WHERE id_int = ${untouchedId.id_int} and deleted_at IS NULL`
      );
      expect(untouched).toHaveLength(1);
    });

    it("deletes specific owned notifications", async () => {
      const { client, userIds } = await authClientWithId();
      const id1 = await seedNotification(userIds);
      const id2 = await seedNotification(userIds);

      const resp = await client
        .delete("/api/notifications")
        .send({ ids: [id1.id_int] });
      expect(resp.status).toBe(200);
      expect(resp.body.deleted).toBe(1);

      const remaining = await query<{ id_int: number }>(
        `SELECT id_int FROM notifications WHERE user_id = ${escape(userIds.id)} AND deleted_at IS NULL`
      );
      expect(remaining.map((r) => r.id_int)).toEqual([id2.id_int]);
    });

    it("rejects missing ids and unowned ids", async () => {
      const { client } = await authClient();
      const other = await registerUser(new TestApiClient(), makeUser("other7"));
      const otherId = await getUserIds(other.username);
      const otherNoteId = await seedNotification(otherId);

      const missing = await client.delete("/api/notifications").send({});
      expect(missing.status).toBe(400);

      const notAllOwned = await client
        .delete("/api/notifications")
        .send({ ids: [otherNoteId.id_int] });
      expect(notAllOwned.status).toBe(404);

      const stillThere = await query(
        `SELECT id FROM notifications WHERE id_int = ${otherNoteId.id_int}`
      );
      expect(stillThere).toHaveLength(1);
    });

    it("deletes only notifications of the given state when filtered", async () => {
      const { client, userIds } = await authClientWithId();
      const comment = await seedNotification(userIds, { state: "COMMENT" });
      const reply = await seedNotification(userIds, { state: "REPLY" });

      const resp = await client
        .delete("/api/notifications")
        .send({ all: true, state: "COMMENT" });
      expect(resp.status).toBe(200);
      expect(resp.body.deleted).toBe(1);

      const remaining = await query<{ id: string }>(
        `SELECT id FROM notifications WHERE user_id = ${escape(userIds.id)} AND deleted_at IS NULL`
      );
      expect(remaining.map((r) => r.id)).toEqual([reply.id]);
      expect(remaining.map((r) => r.id)).not.toContain(comment.id);
    });

    it("rejects an invalid state filter", async () => {
      const { client } = await authClient();

      const resp = await client
        .delete("/api/notifications")
        .send({ all: true, state: "NOT_A_REAL_STATE" });
      expect(resp.status).toBe(400);
      expect(resp.body.errors.state).toBeDefined();
    });

    it("scopes select-all delete to notifications at or before mostRecentNotificationId", async () => {
      const { client, userIds } = await authClientWithId();
      const older = await seedNotification(userIds, {
        created_at: "2026-01-01 00:00:00",
      });
      const boundary = await seedNotification(userIds, {
        created_at: "2026-01-01 00:01:00",
      });
      const newer = await seedNotification(userIds, {
        created_at: "2026-01-01 00:02:00",
      });

      const resp = await client
        .delete("/api/notifications")
        .send({ all: true, mostRecentNotificationId: boundary.id_int });
      expect(resp.status).toBe(200);
      expect(resp.body.deleted).toBe(2);

      const remaining = await query<{ id: string }>(
        `SELECT id FROM notifications WHERE user_id = ${escape(userIds.id)} AND deleted_at IS NULL`
      );
      expect(remaining.map((r) => r.id)).toEqual([newer.id]);
      expect(remaining.map((r) => r.id)).not.toContain(older.id);
      expect(remaining.map((r) => r.id)).not.toContain(boundary.id);
    });

    it("deletes all of the caller's notifications when mostRecentNotificationId is omitted", async () => {
      const { client, userIds } = await authClientWithId();
      await seedNotification(userIds, { created_at: "2026-01-01 00:00:00" });
      await seedNotification(userIds, { created_at: "2026-01-01 00:01:00" });

      const resp = await client
        .delete("/api/notifications")
        .send({ all: true });
      expect(resp.status).toBe(200);
      expect(resp.body.deleted).toBe(2);

      const remaining = await query(
        `SELECT * FROM notifications WHERE user_id = ${escape(userIds.id)} AND deleted_at IS NULL`
      );
      expect(remaining).toHaveLength(0);
    });

    it("returns 404 for a nonexistent mostRecentNotificationId", async () => {
      const { client } = await authClient();

      const resp = await client
        .delete("/api/notifications")
        .send({ all: true, mostRecentNotificationId: 999999 });
      expect(resp.status).toBe(404);
    });

    it("returns 404 for a mostRecentNotificationId owned by another user", async () => {
      const { client } = await authClient();
      const other = await registerUser(
        new TestApiClient(),
        makeUser("other10")
      );
      const otherId = await getUserIds(other.username);
      const otherNoteId = await seedNotification(otherId);

      const resp = await client
        .delete("/api/notifications")
        .send({ all: true, mostRecentNotificationId: otherNoteId.id_int });
      expect(resp.status).toBe(404);

      const stillThere = await query(
        `SELECT id FROM notifications WHERE id_int = ${otherNoteId.id_int}`
      );
      expect(stillThere).toHaveLength(1);
    });
  });

  describe("DELETE /:note_id", () => {
    it("requires authentication", async () => {
      expect(
        (await new TestApiClient().delete("/api/notifications/1")).status
      ).toBe(401);
    });

    it("returns 404 for a non-numeric or unowned id", async () => {
      const { client } = await authClient();
      expect((await client.delete("/api/notifications/abc")).status).toBe(404);
      expect((await client.delete("/api/notifications/999999")).status).toBe(
        404
      );

      const other = await registerUser(new TestApiClient(), makeUser("other8"));
      const otherId = await getUserIds(other.username);
      const otherNoteId = await seedNotification(otherId);
      expect(
        (await client.delete(`/api/notifications/${otherNoteId.id_int}`)).status
      ).toBe(404);
    });

    it("deletes the notification when owned", async () => {
      const { client, userIds } = await authClientWithId();
      const noteId = await seedNotification(userIds);

      const resp = await client.delete(`/api/notifications/${noteId.id_int}`);
      expect(resp.status).toBe(200);
      expect(resp.body.message).toBe("Notification deleted");

      expect(
        (await client.get(`/api/notifications/${noteId.id_int}`)).status
      ).toBe(404);
    });
  });

  describe("soft delete", () => {
    async function deletedAtOf(idInt: number): Promise<string | null> {
      const rows = await query<{ deleted_at: string | null }>(
        `SELECT deleted_at FROM notifications WHERE id_int = ${idInt}`
      );
      expect(rows).toHaveLength(1);
      return rows[0]!.deleted_at;
    }

    it("keeps the row and hides it from every read path", async () => {
      const { client, userIds } = await authClientWithId();
      await seedNotification(userIds, { message: "Kept" });
      const deleted = await seedNotification(userIds, { message: "Deleted" });

      expect(
        (await client.delete(`/api/notifications/${deleted.id_int}`)).status
      ).toBe(200);
      expect(await deletedAtOf(deleted.id_int)).not.toBeNull();

      const list = await client.get("/api/notifications");
      expect(list.body.pagination.total).toBe(1);
      expect(
        list.body.items.map((n: { message: string }) => n.message)
      ).toEqual(["Kept"]);

      const unseen = await client.get("/api/notifications?seen=false");
      expect(
        unseen.body.items.map((n: { message: string }) => n.message)
      ).toEqual(["Kept"]);

      expect(
        (await client.get(`/api/notifications/${deleted.id_int}`)).status
      ).toBe(404);
      expect(
        (await client.patch(`/api/notifications/${deleted.id_int}`).send({}))
          .status
      ).toBe(404);
      expect(
        (await client.delete(`/api/notifications/${deleted.id_int}`)).status
      ).toBe(404);

      const unread = await client.get("/api/users/notes");
      expect(unread.status).toBe(200);
      expect(unread.body.map((n: { message: string }) => n.message)).toEqual([
        "Kept",
      ]);

      const all = await client.get("/api/users/notes?all=1");
      expect(all.status).toBe(200);
      expect(all.body.pagination.total).toBe(1);
      expect(all.body.items.map((n: { message: string }) => n.message)).toEqual(
        ["Kept"]
      );
    });

    it("bulk delete soft-deletes rows and does not count them again", async () => {
      const { client, userIds } = await authClientWithId();
      const first = await seedNotification(userIds);
      const second = await seedNotification(userIds);

      const resp = await client
        .delete("/api/notifications")
        .send({ all: true });
      expect(resp.body.deleted).toBe(2);
      expect(await deletedAtOf(first.id_int)).not.toBeNull();
      expect(await deletedAtOf(second.id_int)).not.toBeNull();

      const again = await client
        .delete("/api/notifications")
        .send({ all: true });
      expect(again.status).toBe(200);
      expect(again.body.deleted).toBe(0);

      expect(
        (
          await client
            .delete("/api/notifications")
            .send({ ids: [first.id_int] })
        ).status
      ).toBe(404);
    });
  });

  describe("updated_at", () => {
    const STALE = "2020-01-01 00:00:00.000";

    async function staleNotification(user: {
      id: string;
      id_int: number;
    }): Promise<{ id: string; id_int: number }> {
      const note = await seedNotification(user);
      await execute(
        `UPDATE notifications SET updated_at = ${escape(STALE)} WHERE id_int = ${note.id_int}`
      );
      return note;
    }

    async function updatedAtAdvanced(idInt: number): Promise<boolean> {
      const rows = await query<{ advanced: number }>(
        `SELECT updated_at > ${escape(STALE)} AS advanced FROM notifications WHERE id_int = ${idInt}`
      );
      return Number(rows[0]!.advanced) === 1;
    }

    it("advances when a notification is marked seen", async () => {
      const { client, userIds } = await authClientWithId();
      const note = await staleNotification(userIds);

      expect(
        (await client.patch(`/api/notifications/${note.id_int}`).send({}))
          .status
      ).toBe(200);
      expect(await updatedAtAdvanced(note.id_int)).toBe(true);
    });

    it("advances when notifications are bulk marked seen", async () => {
      const { client, userIds } = await authClientWithId();
      const note = await staleNotification(userIds);

      expect(
        (await client.patch("/api/notifications").send({ all: true })).status
      ).toBe(200);
      expect(await updatedAtAdvanced(note.id_int)).toBe(true);
    });

    it("advances when a notification is soft-deleted", async () => {
      const { client, userIds } = await authClientWithId();
      const note = await staleNotification(userIds);

      expect(
        (await client.delete(`/api/notifications/${note.id_int}`)).status
      ).toBe(200);
      expect(await updatedAtAdvanced(note.id_int)).toBe(true);
    });
  });
});
