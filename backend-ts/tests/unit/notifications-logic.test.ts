import {
  newComment,
  newPublication,
} from "#src/api-v0/helpers/notifications-logic.js";
import { StringChunk, type SQL } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  dbExecuteMock,
  findManyMock,
  emailBylinesMock,
  emailNonBylinesMock,
  emailOrgAdminsMock,
  emailCommenterMock,
} = vi.hoisted(() => ({
  dbExecuteMock: vi.fn(),
  findManyMock: vi.fn(),
  emailBylinesMock: vi.fn(),
  emailNonBylinesMock: vi.fn(),
  emailOrgAdminsMock: vi.fn(),
  emailCommenterMock: vi.fn(),
}));

vi.mock("#src/db/index.js", () => ({
  getDb: () => ({
    execute: dbExecuteMock,
    query: { users: { findMany: findManyMock } },
  }),
}));

vi.mock("#src/lib/mail.js", () => ({
  emailBylinesAboutNewComment: emailBylinesMock,
  emailNonBylinesAboutNewComment: emailNonBylinesMock,
  emailOrgAdminsAboutNewComment: emailOrgAdminsMock,
  emailCommenterAboutReply: emailCommenterMock,
}));

afterEach(() => {
  dbExecuteMock.mockReset();
  findManyMock.mockReset();
  emailBylinesMock.mockReset();
  emailNonBylinesMock.mockReset();
  emailOrgAdminsMock.mockReset();
  emailCommenterMock.mockReset();
});

// mysql2's execute() resolves [rows, fields]; dbSelect/dbSelectValue/dbInsert
// each destructure the first element differently, so the mocked shape has to
// match what each one expects.
const rows = (data: Record<string, unknown>[]) => [data];
const scalar = (value: unknown) => [[{ value }]];
const insertResult = (insertId = 1) => [{ insertId }];

// A raw `sql` template embeds each interpolated value directly in
// queryChunks, interleaved with StringChunks for the literal text. Filtering
// those out gives the ordered list of params a query was built with, which
// lets us assert on values (like the notification's user_id ulid) without
// a real dialect to compile the query.
function paramsOf(query: SQL): unknown[] {
  return query.queryChunks.filter((c) => !(c instanceof StringChunk));
}

function insertCalls(): unknown[][] {
  return dbExecuteMock.mock.calls
    .map(([q]) => q as SQL)
    .filter((q) => {
      const first = q.queryChunks[0];
      return (
        first instanceof StringChunk && first.value[0]?.includes("INSERT INTO")
      );
    })
    .map(paramsOf);
}

describe("newPublication", () => {
  it("does nothing when there are no contributors, owners, or org followers", async () => {
    dbExecuteMock
      .mockResolvedValueOnce(rows([])) // contributors + owner
      .mockResolvedValueOnce(rows([])); // orgs

    await newPublication(1, 2, "Untitled");

    expect(dbExecuteMock).toHaveBeenCalledTimes(2);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("notifies a lone contributor and stamps the notification with their own ulid", async () => {
    dbExecuteMock
      .mockResolvedValueOnce(
        rows([{ user_id_int: 1, first_name: "Ada", last_name: "Lovelace" }])
      ) // contributors + owner
      .mockResolvedValueOnce(rows([])) // followers of user 1
      .mockResolvedValueOnce(rows([])) // orgs
      .mockResolvedValueOnce(scalar("pub-ulid-100")) // pubUlid
      .mockResolvedValueOnce(insertResult());
    findManyMock.mockResolvedValueOnce([{ id: "user-ulid-1", idInt: 1 }]);

    await newPublication(100, 101, "Some Publication");

    const [inserted] = insertCalls();
    expect(inserted).toEqual([
      1,
      100,
      "A publication you contributed to has been published",
      "user-ulid-1",
      "pub-ulid-100",
    ]);
  });

  it("gives each of several recipients their own distinct ulid, not a shared one", async () => {
    dbExecuteMock
      .mockResolvedValueOnce(
        rows([
          { user_id_int: 1, first_name: "Ada", last_name: "Lovelace" },
          { user_id_int: 2, first_name: "Grace", last_name: "Hopper" },
        ])
      ) // contributors + owner
      .mockResolvedValueOnce(rows([])) // followers of user 1
      .mockResolvedValueOnce(rows([])) // followers of user 2
      .mockResolvedValueOnce(rows([])) // orgs
      .mockResolvedValueOnce(scalar("pub-ulid-200"))
      .mockResolvedValueOnce(insertResult(1))
      .mockResolvedValueOnce(insertResult(2));
    findManyMock.mockResolvedValueOnce([
      { id: "ulid-A", idInt: 1 },
      { id: "ulid-B", idInt: 2 },
    ]);

    await newPublication(200, 201, "Some Publication");

    const [firstInsert, secondInsert] = insertCalls();
    // Regression coverage for the bug where the map's key and value were
    // both set to the same ulid string, so a numeric userId lookup always
    // missed and every notification's user_id landed as null.
    expect(firstInsert![0]).toBe(1);
    expect(firstInsert![3]).toBe("ulid-A");
    expect(secondInsert![0]).toBe(2);
    expect(secondInsert![3]).toBe("ulid-B");
  });

  it("does not let a later contributor's follower message overwrite an earlier one", async () => {
    dbExecuteMock
      .mockResolvedValueOnce(
        rows([
          { user_id_int: 10, first_name: "Ada", last_name: "Lovelace" },
          { user_id_int: 20, first_name: "Grace", last_name: "Hopper" },
        ])
      ) // contributors + owner
      .mockResolvedValueOnce(rows([{ follower_id_int: 99 }])) // followers of 10
      .mockResolvedValueOnce(rows([{ follower_id_int: 99 }])) // followers of 20
      .mockResolvedValueOnce(rows([])) // orgs
      .mockResolvedValueOnce(scalar("pub-ulid"))
      .mockResolvedValueOnce(insertResult(1))
      .mockResolvedValueOnce(insertResult(2))
      .mockResolvedValueOnce(insertResult(3));
    findManyMock.mockResolvedValueOnce([
      { id: "ulid-10", idInt: 10 },
      { id: "ulid-20", idInt: 20 },
      { id: "ulid-99", idInt: 99 },
    ]);

    await newPublication(300, 301, "Some Publication");

    const follower99Insert = insertCalls().find((p) => p[0] === 99);
    expect(follower99Insert![2]).toBe(
      "Ada Lovelace just published something new"
    );
  });

  it("notifies new org followers without overwriting an existing contributor notification", async () => {
    dbExecuteMock
      .mockResolvedValueOnce(
        rows([{ user_id_int: 1, first_name: "Ada", last_name: "Lovelace" }])
      ) // contributors + owner
      .mockResolvedValueOnce(rows([])) // followers of user 1
      .mockResolvedValueOnce(rows([{ id_int: 5, name: "Acme Labs" }])) // orgs
      .mockResolvedValueOnce(
        rows([{ follower_id_int: 1 }, { follower_id_int: 2 }])
      ) // followers of org 5
      .mockResolvedValueOnce(scalar("pub-ulid"))
      .mockResolvedValueOnce(insertResult(1))
      .mockResolvedValueOnce(insertResult(2));
    findManyMock.mockResolvedValueOnce([
      { id: "ulid-1", idInt: 1 },
      { id: "ulid-2", idInt: 2 },
    ]);

    await newPublication(400, 401, "Some Publication");

    const [contributorInsert, orgFollowerInsert] = insertCalls();
    expect(contributorInsert![2]).toBe(
      "A publication you contributed to has been published"
    );
    expect(orgFollowerInsert![0]).toBe(2);
    expect(orgFollowerInsert![2]).toBe(
      "Acme Labs just published something new"
    );
    expect(orgFollowerInsert![3]).toBe("ulid-2");
  });
});

function commentRow(overrides: Record<string, unknown> = {}) {
  return {
    id_int: 501,
    user_id_int: 7,
    publication_id_int: 900,
    parent_id_int: null,
    body: "Nice work!",
    pre_text: null,
    post_text: null,
    first_name: "Chris",
    last_name: "Commenter",
    email: "chris@example.com",
    username: "chris",
    ...overrides,
  };
}

function pubRow(overrides: Record<string, unknown> = {}) {
  return {
    id_int: 900,
    slug: "some-pub",
    title: "Some Publication",
    ...overrides,
  };
}

describe("newComment", () => {
  it("swallows the error and does not throw when the comment does not exist", async () => {
    dbExecuteMock.mockResolvedValueOnce(rows([])); // commentRows

    await expect(newComment(1, 900)).resolves.toBeUndefined();
    expect(dbExecuteMock).toHaveBeenCalledTimes(1);
  });

  it("swallows the error and does not throw when the publication does not exist", async () => {
    dbExecuteMock
      .mockResolvedValueOnce(rows([commentRow()]))
      .mockResolvedValueOnce(rows([])); // pubRows

    await expect(newComment(501, 900)).resolves.toBeUndefined();
    expect(dbExecuteMock).toHaveBeenCalledTimes(2);
  });

  it("sends no notifications when there are no active notify types", async () => {
    dbExecuteMock
      .mockResolvedValueOnce(rows([commentRow()]))
      .mockResolvedValueOnce(rows([pubRow()]))
      .mockResolvedValueOnce(rows([])) // notifyTypeRows
      .mockResolvedValueOnce(rows([])); // contributors

    await newComment(501, 900);

    expect(dbExecuteMock).toHaveBeenCalledTimes(4);
    expect(emailBylinesMock).not.toHaveBeenCalled();
  });

  it("excludes the comment's own author even if they'd otherwise qualify", async () => {
    dbExecuteMock
      .mockResolvedValueOnce(rows([commentRow({ user_id_int: 7 })]))
      .mockResolvedValueOnce(rows([pubRow()]))
      .mockResolvedValueOnce(rows([{ type: "NEW_COMMENT__BYLINE_CONTRIB" }]))
      .mockResolvedValueOnce(rows([{ user_id_int: 7, in_byline: true }])) // contributors, only the author
      .mockResolvedValueOnce(rows([])); // deleted-user check for [7]

    await newComment(501, 900);

    expect(dbExecuteMock).toHaveBeenCalledTimes(5);
    expect(emailBylinesMock).not.toHaveBeenCalled();
  });

  it("excludes a deleted user from notification entirely", async () => {
    dbExecuteMock
      .mockResolvedValueOnce(rows([commentRow({ user_id_int: 7 })]))
      .mockResolvedValueOnce(rows([pubRow()]))
      .mockResolvedValueOnce(rows([{ type: "NEW_COMMENT__BYLINE_CONTRIB" }]))
      .mockResolvedValueOnce(rows([{ user_id_int: 42, in_byline: true }]))
      .mockResolvedValueOnce(
        rows([{ id: "u-42", id_int: 42, state: "DELETED" }])
      );

    await newComment(501, 900);

    expect(dbExecuteMock).toHaveBeenCalledTimes(5);
    expect(emailBylinesMock).not.toHaveBeenCalled();
  });

  it("emails a byline contributor who isn't unsubscribed from email", async () => {
    dbExecuteMock
      .mockResolvedValueOnce(rows([commentRow({ user_id_int: 7 })]))
      .mockResolvedValueOnce(rows([pubRow()]))
      .mockResolvedValueOnce(rows([{ type: "NEW_COMMENT__BYLINE_CONTRIB" }]))
      .mockResolvedValueOnce(rows([{ user_id_int: 42, in_byline: true }]))
      .mockResolvedValueOnce(rows([])) // deleted-user check for [42]
      .mockResolvedValueOnce(
        rows([
          {
            user_id_int: 42,
            notification_type: "NEW_COMMENT__BYLINE_CONTRIB",
            delivery_method: "IN_APP",
          },
        ])
      ) // unsubscribed from IN_APP only, so this stays email-only
      .mockResolvedValueOnce(
        rows([
          {
            id_int: 42,
            email: "byline@example.com",
            first_name: "By",
            last_name: "Line",
          },
        ])
      );

    await newComment(501, 900);

    expect(dbExecuteMock).toHaveBeenCalledTimes(7);
    expect(emailBylinesMock).toHaveBeenCalledTimes(1);
    expect(emailBylinesMock).toHaveBeenCalledWith(
      expect.objectContaining({ id_int: 501 }),
      expect.objectContaining({ id_int: 900 }),
      [
        expect.objectContaining({
          id_int: 42,
          email: "byline@example.com",
        }),
      ],
      "NEW_COMMENT__BYLINE_CONTRIB"
    );
  });

  it("creates an in-app notification (with the correct ulid) for a contributor unsubscribed from email", async () => {
    dbExecuteMock
      .mockResolvedValueOnce(rows([commentRow({ user_id_int: 7 })]))
      .mockResolvedValueOnce(rows([pubRow({ id_int: 900 })]))
      .mockResolvedValueOnce(rows([{ type: "NEW_COMMENT__BYLINE_CONTRIB" }]))
      .mockResolvedValueOnce(rows([{ user_id_int: 42, in_byline: true }]))
      .mockResolvedValueOnce(rows([])) // deleted-user check for [42]
      .mockResolvedValueOnce(
        rows([
          {
            user_id_int: 42,
            notification_type: "NEW_COMMENT__BYLINE_CONTRIB",
            delivery_method: "EMAIL",
          },
        ])
      ) // unsubscribed from EMAIL only, so this stays in-app-only
      .mockResolvedValueOnce(
        rows([
          {
            id_int: 42,
            email: "x@example.com",
            first_name: "By",
            last_name: "Line",
          },
        ])
      )
      .mockResolvedValueOnce(scalar("pub-ulid-900")) // createInAppNotifications: pubUlid
      .mockResolvedValueOnce(scalar("comment-ulid-501")) // commentUlid
      .mockResolvedValueOnce(rows([{ id_int: 42, id: "user-ulid-42" }])) // userUlidRows
      .mockResolvedValueOnce(insertResult());

    await newComment(501, 900);

    expect(emailBylinesMock).not.toHaveBeenCalled();
    const [inserted] = insertCalls();
    expect(inserted).toEqual([
      42,
      900,
      "New comment on your publication",
      "COMMENT",
      "user-ulid-42",
      "pub-ulid-900",
      501,
      "comment-ulid-501",
    ]);
  });

  it("emails the parent commenter about a reply with a single user object, not an array", async () => {
    dbExecuteMock
      .mockResolvedValueOnce(
        rows([commentRow({ user_id_int: 7, parent_id_int: 300 })])
      )
      .mockResolvedValueOnce(rows([pubRow()]))
      .mockResolvedValueOnce(rows([{ type: "NEW_COMMENT__PARENT_COMMENTER" }]))
      .mockResolvedValueOnce(rows([])) // contributors (unused for this type)
      .mockResolvedValueOnce(scalar(55)) // opId: parent comment's author
      .mockResolvedValueOnce(rows([])) // deleted-user check for [55]
      .mockResolvedValueOnce(
        rows([
          {
            user_id_int: 55,
            notification_type: "NEW_COMMENT__PARENT_COMMENTER",
            delivery_method: "IN_APP",
          },
        ])
      ) // unsubscribed from IN_APP only, so this stays email-only
      .mockResolvedValueOnce(
        rows([
          {
            id_int: 55,
            email: "parent@example.com",
            first_name: "Parent",
            last_name: "Commenter",
          },
        ])
      );

    await newComment(501, 900);

    expect(emailCommenterMock).toHaveBeenCalledTimes(1);
    const [, , op] = emailCommenterMock.mock.calls[0]!;
    expect(op).toEqual({
      id_int: 55,
      email: "parent@example.com",
      first_name: "Parent",
      last_name: "Commenter",
    });
  });

  it("keeps only the highest-priority notify type per user, independently per delivery method", async () => {
    dbExecuteMock
      .mockResolvedValueOnce(rows([commentRow({ user_id_int: 7 })]))
      .mockResolvedValueOnce(rows([pubRow({ id_int: 900 })]))
      .mockResolvedValueOnce(
        rows([
          { type: "NEW_COMMENT__BYLINE_CONTRIB" },
          { type: "NEW_COMMENT__ORG_ADMIN" },
        ])
      )
      .mockResolvedValueOnce(rows([{ user_id_int: 42, in_byline: true }])) // contributors
      .mockResolvedValueOnce(rows([{ user_id_int: 42 }])) // org admins - same user
      .mockResolvedValueOnce(rows([])) // deleted-user check for [42]
      .mockResolvedValueOnce(
        rows([
          {
            user_id_int: 42,
            notification_type: "NEW_COMMENT__BYLINE_CONTRIB",
            delivery_method: "IN_APP",
          },
        ])
      ) // strips BYLINE_CONTRIB from the in-app list only, leaving ORG_ADMIN there
      .mockResolvedValueOnce(
        rows([
          {
            id_int: 42,
            email: "x@example.com",
            first_name: "F",
            last_name: "L",
          },
        ])
      )
      .mockResolvedValueOnce(scalar("pub-ulid-900"))
      .mockResolvedValueOnce(scalar("comment-ulid-501"))
      .mockResolvedValueOnce(rows([{ id_int: 42, id: "user-ulid-42" }]))
      .mockResolvedValueOnce(insertResult());

    await newComment(501, 900);

    // Email path never had BYLINE_CONTRIB stripped, so the higher-priority
    // type wins there.
    expect(emailBylinesMock).toHaveBeenCalledTimes(1);
    expect(emailOrgAdminsMock).not.toHaveBeenCalled();

    // In-app path had BYLINE_CONTRIB stripped by the unsubscribe row above,
    // so ORG_ADMIN (the only type left in its list) wins there instead.
    const [inserted] = insertCalls();
    expect(inserted![2]).toBe("New comment on an org you manage");
  });
});
