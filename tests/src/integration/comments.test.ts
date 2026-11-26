import { describe, expect, it } from "vitest";
import {
  TestApiClient,
  execute,
  makeUser,
  query,
  registerUser,
  registerUserWithId,
  seedNotificationTypesStandard,
  seedPublication,
  waitForRows,
} from "./helpers.js";

async function setupPublicationAndLogin(
  slug = "comment-target",
  state = "PUBLISHED"
) {
  const { client, user, userId } = await registerUserWithId();
  await seedNotificationTypesStandard();
  const { intId: pubId } = await seedPublication({
    slug,
    ownerId: userId,
    state,
    title: "Commentable",
  });
  await client.login(user.username, user.password);
  return { client, user, userId, pubId };
}

describe("/api/comments", () => {
  it("lists comments", async () => {
    const { client, userId, pubId } = await setupPublicationAndLogin();
    expect(
      (await client.get(`/api/comments/publication/${pubId}`)).status
    ).toBe(200);
    await execute(
      `INSERT INTO comments (publication_id_int, user_id_int, body) VALUES (${pubId}, ${userId}, 'Hello world')`
    );
    const resp = await client.get(`/api/comments/publication/${pubId}`);
    expect(resp.status).toBe(200);
    expect(resp.body.items.map((c: { body: string }) => c.body)).toContain(
      "Hello world"
    );
  });

  it("creates comments and stores version_id", async () => {
    const { client, pubId } = await setupPublicationAndLogin("versioned-pub");
    const create = await client
      .post(`/api/comments/publication/${pubId}`)
      .send({ body: "Anchored to a version" });
    expect(create.status).toBe(201);
    const commentId = create.body.comment_id;

    const rows = await query<{ version_id: number }>(
      `SELECT version_id_int as version_id FROM comments WHERE id_int = ${commentId}`
    );
    expect(rows[0]!.version_id).toBeDefined();

    const getResp = await client.get(`/api/comments/${commentId}`);
    expect(getResp.status).toBe(200);
    expect(getResp.body.version_id).toBe(rows[0]!.version_id);

    const listResp = await client.get(`/api/comments/publication/${pubId}`);
    expect(
      listResp.body.items.find(
        (c: { comment_id: number }) => c.comment_id === commentId
      ).version_id
    ).toBe(rows[0]!.version_id);

    // the comment author is the pub author -- no notification
    const notifyRows = await waitForRows(
      `SELECT * FROM notifications WHERE comment_id_int = ${commentId}`
    );
    expect(notifyRows.length).toBe(0);
  });

  it("creates comments and generates notification", async () => {
    const { client, user, pubId } =
      await setupPublicationAndLogin("versioned-pub");
    const other = makeUser("commenter2");
    await registerUser(new TestApiClient(), other);
    await client.login(other.username, other.password);
    const create = await client
      .post(`/api/comments/publication/${pubId}`)
      .send({ body: "Different user comment" });
    expect(create.status).toBe(201);
    const commentIdInt = create.body.comment_id;

    const notifyRows = await waitForRows(
      `SELECT * FROM notifications WHERE comment_id_int = ${commentIdInt}`
    );
    expect(notifyRows.length).toBe(1);
    await client.logout();
    await client.login(user.username, user.password);
    const notificationsResp = await client.get("/api/notifications");
    expect(notificationsResp.status).toBe(200);
    expect(notificationsResp.body.pagination).toMatchObject({
      total: 1,
      page: 1,
      per_page: 18,
    });
    const notificationItems = notificationsResp.body.items;
    expect(notificationItems.length).toBe(1);
    expect(notificationItems[0]).toMatchObject({
      message: "New comment on your publication",
      seen: 0,
    });
  });

  it("rejects invalid or unauthenticated creates", async () => {
    const { client, userId, pubId } = await setupPublicationAndLogin();
    expect(
      (
        await client
          .post(`/api/comments/publication/${pubId}`)
          .send({ body: "" })
      ).status
    ).toBe(400);
    const { intId: unauthPubId } = await seedPublication({
      slug: "no-auth-comment",
      ownerId: userId,
      state: "PUBLISHED",
    });
    const unauthenticated = await new TestApiClient()
      .post(`/api/comments/publication/${unauthPubId}`)
      .send({ body: "Sneaky" });
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body).toEqual({
      msg: "No session. Sign in via /api/auth2/sign-in/email or /api/auth2/sign-in/username.",
    });
  });

  it("gets comment objects with list-compatible shape", async () => {
    const { client, user, pubId } = await setupPublicationAndLogin();
    const create = await client
      .post(`/api/comments/publication/${pubId}`)
      .send({ body: "Fetch me" });
    const commentId = create.body.comment_id;
    const single = await client.get(`/api/comments/${commentId}`);
    expect(single.status).toBe(200);
    expect(single.body.comment_id).toBe(commentId);
    expect(single.body.body).toBe("Fetch me");
    expect(single.body.first_name).toBe(user.first_name);
    expect(single.body.last_name).toBe(user.last_name);

    const list = await client.get(`/api/comments/publication/${pubId}`);
    expect(Object.keys(single.body).sort()).toEqual(
      Object.keys(list.body.items[0]).sort()
    );
    expect((await client.get("/api/comments/999999")).status).toBe(404);
  });

  it("returns created_at/updated_at as exact UTC ISO strings with a Z suffix", async () => {
    const { client, pubId, userId } =
      await setupPublicationAndLogin("timestamp-pub");
    const insert = await execute(
      `INSERT INTO comments (publication_id_int, user_id_int, body, created_at) VALUES (${pubId}, ${userId}, 'Timestamped', '2026-01-15 10:30:00')`
    );
    const commentId = insert.insertId;
    const expectedIso = "2026-01-15T10:30:00.000Z";

    const single = await client.get(`/api/comments/${commentId}`);
    expect(single.status).toBe(200);
    expect(single.body.created_at).toBe(expectedIso);
    expect(single.body.updated_at).toBeNull();

    const list = await client.get(`/api/comments/publication/${pubId}`);
    expect(list.status).toBe(200);
    const listed = list.body.items.find(
      (c: { comment_id: number }) => c.comment_id === commentId
    );
    expect(listed).toBeDefined();
    expect(listed.created_at).toBe(expectedIso);
    expect(listed.updated_at).toBeNull();
  });

  it("replaces a comment body via PUT only with appropriate permissions", async () => {
    const { client, pubId } = await setupPublicationAndLogin();
    const create = await client
      .post(`/api/comments/publication/${pubId}`)
      .send({ body: "Original" });
    const commentId = create.body.comment_id;
    expect(
      (
        await client
          .put(`/api/comments/${commentId}`)
          .send({ body: "Edited body" })
      ).status
    ).toBe(200);
    expect((await client.get(`/api/comments/${commentId}`)).body.body).toBe(
      "Edited body"
    );

    const other = makeUser("commenter2");
    await registerUser(new TestApiClient(), other);
    await client.login(other.username, other.password);
    expect(
      (
        await client
          .put(`/api/comments/${commentId}`)
          .send({ body: "Hijacked" })
      ).status
    ).toBe(403);
  });

  it("edits and withdraws only with appropriate permissions", async () => {
    const { client, user, pubId } = await setupPublicationAndLogin();
    const create = await client
      .post(`/api/comments/publication/${pubId}`)
      .send({ body: "Original" });
    const commentId = create.body.comment_id;
    expect(
      (
        await client
          .patch(`/api/comments/${commentId}`)
          .send({ body: "Edited body" })
      ).status
    ).toBe(200);

    const other = makeUser("commenter2");
    await registerUser(new TestApiClient(), other);
    await client.login(other.username, other.password);
    expect(
      (
        await client
          .patch(`/api/comments/${commentId}`)
          .send({ body: "Hijacked" })
      ).status
    ).toBe(403);
    expect(
      (
        await client
          .patch(`/api/comments/${commentId}`)
          .send({ state: "WITHDRAWN" })
      ).status
    ).toBe(403);

    await client.login(user.username, user.password);
    expect(
      (
        await client
          .patch(`/api/comments/${commentId}`)
          .send({ state: "WITHDRAWN" })
      ).status
    ).toBe(200);

    // Withdrawn comments stay visible for thread continuity, with the
    // author's identity masked and the body replaced with a fixed message.
    const getResp = await client.get(`/api/comments/${commentId}`);
    expect(getResp.status).toBe(200);
    expect(getResp.body.first_name).toBe("[author]");
    expect(getResp.body.body).toBe("Comment has been withdrawn by the author");
  });

  it("rejects edits more than one hour after posting", async () => {
    const { client, pubId } = await setupPublicationAndLogin();
    const create = await client
      .post(`/api/comments/publication/${pubId}`)
      .send({ body: "Original" });
    const commentId = create.body.comment_id;
    await execute(
      `UPDATE comments SET created_at = NOW() - INTERVAL 61 MINUTE WHERE id_int = ${commentId}`
    );

    const resp = await client
      .patch(`/api/comments/${commentId}`)
      .send({ body: "Too late" });
    expect(resp.status).toBe(403);
    expect(resp.body.error).toBe(
      "Comments can only be edited within 1 hour of posting"
    );
    const rows = await query<{ body: string }>(
      `SELECT body FROM comments WHERE id_int = ${commentId}`
    );
    expect(rows[0]!.body).toBe("Original");
  });

  it("rejects edits to a comment that has replies", async () => {
    const { client, pubId } = await setupPublicationAndLogin();
    const parent = await client
      .post(`/api/comments/publication/${pubId}`)
      .send({ body: "Parent" });
    const parentId = parent.body.comment_id;
    const reply = await client
      .post(`/api/comments/publication/${pubId}`)
      .send({ body: "Reply", parent_id: parentId });
    expect(reply.status).toBe(201);

    const resp = await client
      .patch(`/api/comments/${parentId}`)
      .send({ body: "Edited parent" });
    expect(resp.status).toBe(403);
    expect(resp.body.error).toBe("Cannot edit a comment that has replies");
    const rows = await query<{ body: string }>(
      `SELECT body FROM comments WHERE id_int = ${parentId}`
    );
    expect(rows[0]!.body).toBe("Parent");

    expect(
      (
        await client
          .patch(`/api/comments/${reply.body.comment_id}`)
          .send({ body: "Edited reply" })
      ).status
    ).toBe(200);
  });

  it("withdraws a comment via DELETE only with appropriate permissions", async () => {
    const { client, user, pubId } = await setupPublicationAndLogin();
    const create = await client
      .post(`/api/comments/publication/${pubId}`)
      .send({ body: "Original" });
    const commentId = create.body.comment_id;

    const other = makeUser("commenter2");
    await registerUser(new TestApiClient(), other);
    await client.login(other.username, other.password);
    expect((await client.delete(`/api/comments/${commentId}`)).status).toBe(
      403
    );

    await client.login(user.username, user.password);
    const deleteResp = await client.delete(`/api/comments/${commentId}`);
    expect(deleteResp.status).toBe(200);
    expect(deleteResp.body).toEqual({
      status: "withdrawn",
      comment_id: commentId,
    });

    const getResp = await client.get(`/api/comments/${commentId}`);
    expect(getResp.status).toBe(200);
    expect(getResp.body.state).toBe("WITHDRAWN");
    expect(getResp.body.body).toBe("Comment has been withdrawn by the author");
  });

  it("rejects edits to a withdrawn comment", async () => {
    const { client, pubId } = await setupPublicationAndLogin();
    const create = await client
      .post(`/api/comments/publication/${pubId}`)
      .send({ body: "Original" });
    const commentId = create.body.comment_id;
    expect(
      (
        await client
          .patch(`/api/comments/${commentId}`)
          .send({ state: "WITHDRAWN" })
      ).status
    ).toBe(200);

    const resp = await client
      .patch(`/api/comments/${commentId}`)
      .send({ body: "Rewritten" });
    expect(resp.status).toBe(403);
    expect(resp.body.error).toBe("Not authorised to edit this comment");
    const rows = await query<{ body: string }>(
      `SELECT body FROM comments WHERE id_int = ${commentId}`
    );
    expect(rows[0]!.body).toBe("Original");
    expect((await client.get(`/api/comments/${commentId}`)).body.body).toBe(
      "Comment has been withdrawn by the author"
    );
  });

  it("rejects malformed PATCH requests", async () => {
    const { client, pubId } = await setupPublicationAndLogin();
    const create = await client
      .post(`/api/comments/publication/${pubId}`)
      .send({ body: "Original" });
    const commentId = create.body.comment_id;

    const malformedPayloads = [
      { body: "Edited", state: "WITHDRAWN" },
      { state: "PUBLISHED" },
      {},
      { body: "" },
      { body: null },
      { body: { text: "Edited" } },
      { body: 42 },
    ];
    for (const payload of malformedPayloads) {
      const resp = await client
        .patch(`/api/comments/${commentId}`)
        .send(payload);
      expect(resp.status, JSON.stringify(payload)).toBe(400);
    }

    const getResp = await client.get(`/api/comments/${commentId}`);
    expect(getResp.body.body).toBe("Original");
    expect(getResp.body.state).toBe("PUBLISHED");
  });
});
