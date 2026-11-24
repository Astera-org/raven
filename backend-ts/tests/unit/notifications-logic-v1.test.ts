import * as v0 from "#src/api-v0/helpers/notifications-logic.js";
import type { NotificationsRepository } from "#src/api-v1/db-repositories/notifications-repository.js";
import * as v1 from "#src/api-v1/lib/notifications-logic.js";
import { SQL, StringChunk } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

// Runs every scenario through both v0 (raw int-id SQL) and v1 (ULID-keyed
// NotificationsRepository) against the same in-memory World, then asserts
// they sent identical emails and wrote identical notification rows. v0's
// `db.execute` is answered by matching each raw query's text; v1's
// repository is faked directly. Both fakes read the World through the same
// `q` helpers so they can't drift apart.

type WorldUser = {
  idInt: number;
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  state: "ACTIVE" | "DELETED";
};

type World = {
  users: WorldUser[];
  publications: {
    idInt: number;
    id: string;
    slug: string;
    ownerIdInt: number | null;
    // null = no row for the latest version
    title: string | null;
    versionIdInt: number;
    versionId: string;
  }[];
  contributors: {
    publicationIdInt: number;
    userIdInt: number;
    inByline: boolean;
  }[];
  followers: { leaderIdInt: number; followerIdInt: number }[];
  orgs: { idInt: number; id: string; name: string }[];
  orgPublications: { orgIdInt: number; publicationIdInt: number }[];
  orgFollowers: { orgIdInt: number; followerIdInt: number }[];
  orgMembers: {
    orgIdInt: number;
    userIdInt: number;
    admin: boolean;
    ended: boolean;
  }[];
  comments: {
    idInt: number;
    id: string;
    publicationIdInt: number;
    userIdInt: number;
    parentIdInt: number | null;
    body: string;
    preText: string | null;
    postText: string | null;
    state: "PUBLISHED" | "MODERATED" | "DELETED";
  }[];
  notificationTypes: {
    type: string;
    priority: number;
    state: "ACTIVE" | "DEPRECATED";
    trigger: "NEW_COMMENT" | null;
  }[];
  unsubscriptions: {
    userIdInt: number;
    type: string;
    deliveryMethod: "EMAIL" | "IN_APP";
  }[];
};

type SentEmail = { fn: string; args: unknown[] };
type WrittenNotification = {
  userId: unknown;
  publicationId: unknown;
  commentId: unknown;
  message: unknown;
  state: unknown;
};

const ctx = vi.hoisted(() => ({
  world: null as unknown as World,
  emails: [] as SentEmail[],
  notifications: [] as WrittenNotification[],
  execute: (_q: unknown): unknown => {
    throw new Error("execute not wired");
  },
  repo: {} as Record<string, unknown>,
}));

vi.mock("#src/db/index.js", () => ({
  getDb: () => ({
    execute: async (q: unknown) => ctx.execute(q),
    query: {
      users: {
        findMany: async () =>
          ctx.world.users.map((u) => ({ id: u.id, idInt: u.idInt })),
      },
    },
  }),
}));

vi.mock("#src/api-v1/db-repositories/index.js", () => ({
  makeRepositories: () => ({ notifications: ctx.repo }),
}));

vi.mock("#src/lib/mail.js", () => {
  const record =
    (fn: string) =>
    async (...args: unknown[]) => {
      ctx.emails.push({ fn, args });
      return true;
    };
  return {
    emailBylinesAboutNewComment: record("bylines"),
    emailNonBylinesAboutNewComment: record("nonBylines"),
    emailOrgAdminsAboutNewComment: record("orgAdmins"),
    emailCommenterAboutReply: record("commenter"),
  };
});

afterEach(() => {
  ctx.emails = [];
  ctx.notifications = [];
});

// ---------------------------------------------------------------------------
// World queries shared by both fakes (int-keyed; each fake maps to its shape)
// ---------------------------------------------------------------------------

const q = {
  user: (idInt: number) => ctx.world.users.find((u) => u.idInt === idInt),
  userByUlid: (id: string) => ctx.world.users.find((u) => u.id === id)!,
  pub: (idInt: number) => ctx.world.publications.find((p) => p.idInt === idInt),
  pubByUlid: (id: string) => ctx.world.publications.find((p) => p.id === id),
  pubByVersionUlid: (id: string) =>
    ctx.world.publications.find((p) => p.versionId === id),
  pubByVersionIdInt: (idInt: number) =>
    ctx.world.publications.find((p) => p.versionIdInt === idInt),
  comment: (idInt: number) => ctx.world.comments.find((c) => c.idInt === idInt),
  commentByUlid: (id: string) => ctx.world.comments.find((c) => c.id === id),
  org: (idInt: number) => ctx.world.orgs.find((o) => o.idInt === idInt)!,
  orgByUlid: (id: string) => ctx.world.orgs.find((o) => o.id === id)!,

  publicationAuthors(pubIdInt: number): WorldUser[] {
    const ids = ctx.world.contributors
      .filter((c) => c.publicationIdInt === pubIdInt)
      .map((c) => c.userIdInt);
    const owner = q.pub(pubIdInt)?.ownerIdInt;
    if (owner != null) ids.push(owner);
    return [...new Set(ids)].map((id) => q.user(id)!);
  },
  followerIds: (leaderIdInt: number) =>
    ctx.world.followers
      .filter((f) => f.leaderIdInt === leaderIdInt)
      .map((f) => f.followerIdInt),
  publicationOrgs: (pubIdInt: number) =>
    ctx.world.orgPublications
      .filter((m) => m.publicationIdInt === pubIdInt)
      .map((m) => q.org(m.orgIdInt)),
  orgFollowerIds: (orgIdInt: number) =>
    ctx.world.orgFollowers
      .filter((f) => f.orgIdInt === orgIdInt)
      .map((f) => f.followerIdInt),
  activeTypes: () =>
    ctx.world.notificationTypes
      .filter((t) => t.trigger === "NEW_COMMENT" && t.state === "ACTIVE")
      .sort((a, b) => a.priority - b.priority)
      .map((t) => t.type),
  contributorBylines(pubIdInt: number) {
    const seen = new Set<string>();
    return ctx.world.contributors
      .filter((c) => c.publicationIdInt === pubIdInt)
      .filter((c) => {
        const key = `${c.userIdInt}:${c.inByline}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  },
  publishedAuthorOf(commentIdInt: number) {
    const c = q.comment(commentIdInt);
    return c && c.state === "PUBLISHED" ? c.userIdInt : null;
  },
  activeAdminIds(pubIdInt: number) {
    const orgIds = new Set(q.publicationOrgs(pubIdInt).map((o) => o.idInt));
    const ids = ctx.world.orgMembers
      .filter((m) => orgIds.has(m.orgIdInt) && m.admin && !m.ended)
      .map((m) => m.userIdInt);
    return [...new Set(ids)];
  },
  users: (idInts: number[]) =>
    ctx.world.users.filter((u) => idInts.includes(u.idInt)),
  unsubscriptions: (idInts: number[]) =>
    ctx.world.unsubscriptions.filter((u) => idInts.includes(u.userIdInt)),
};

// ---------------------------------------------------------------------------
// v0 fake: answers raw `sql` queries by matching their text
// ---------------------------------------------------------------------------

function flatten(query: SQL): { text: string; params: unknown[] } {
  let text = "";
  const params: unknown[] = [];
  const walk = (chunks: unknown[]) => {
    for (const c of chunks) {
      if (c instanceof StringChunk) text += c.value.join("");
      else if (c instanceof SQL) walk(c.queryChunks);
      else {
        text += "?";
        params.push(c);
      }
    }
  };
  walk(query.queryChunks);
  return { text, params };
}

// mysql2's execute() resolves [rows, fields]
const rows = (data: Record<string, unknown>[]) => [data];
const ints = (params: unknown[]) => params as number[];

const v0Queries: [string, (p: unknown[]) => Record<string, unknown>[]][] = [
  [
    "FROM contributors c INNER JOIN users u",
    ([version]) =>
      q
        .publicationAuthors(q.pubByVersionIdInt(version as number)!.idInt)
        .map((u) => ({
          user_id_int: u.idInt,
          first_name: u.firstName,
          last_name: u.lastName,
        })),
  ],
  [
    "FROM followers WHERE leader_id_int",
    ([leader]) =>
      q.followerIds(leader as number).map((id) => ({ follower_id_int: id })),
  ],
  [
    "FROM org_publication_map m JOIN organizations",
    ([pub]) =>
      q
        .publicationOrgs(pub as number)
        .map((o) => ({ id_int: o.idInt, name: o.name })),
  ],
  [
    "FROM org_followers",
    ([org]) =>
      q.orgFollowerIds(org as number).map((id) => ({ follower_id_int: id })),
  ],
  [
    "SELECT id FROM publications WHERE id_int",
    ([pub]) => [{ id: q.pub(pub as number)?.id }],
  ],
  [
    "FROM comments c JOIN users u",
    ([commentIdInt]) => {
      const c = q.comment(commentIdInt as number);
      if (!c) return [];
      const u = q.user(c.userIdInt)!;
      return [
        {
          id_int: c.idInt,
          user_id_int: c.userIdInt,
          publication_id_int: c.publicationIdInt,
          parent_id_int: c.parentIdInt,
          body: c.body,
          pre_text: c.preText,
          post_text: c.postText,
          first_name: u.firstName,
          last_name: u.lastName,
          email: u.email,
          username: u.username,
        },
      ];
    },
  ],
  [
    "FROM publications p JOIN versions v",
    ([pubIdInt]) => {
      const p = q.pub(pubIdInt as number);
      return p && p.title != null
        ? [{ id_int: p.idInt, slug: p.slug, title: p.title }]
        : [];
    },
  ],
  ["FROM notification_types", () => q.activeTypes().map((type) => ({ type }))],
  [
    "SELECT DISTINCT c.user_id_int, c.in_byline FROM contributors",
    ([pub]) =>
      q.contributorBylines(pub as number).map((c) => ({
        user_id_int: c.userIdInt,
        in_byline: c.inByline ? 1 : 0,
      })),
  ],
  [
    "SELECT user_id_int FROM comments WHERE id_int",
    ([parent]) => {
      const author = q.publishedAuthorOf(parent as number);
      return author == null ? [] : [{ user_id_int: author }];
    },
  ],
  [
    "FROM org_user_map",
    ([pub]) =>
      q.activeAdminIds(pub as number).map((id) => ({ user_id_int: id })),
  ],
  [
    "SELECT id, id_int, state FROM users",
    (p) =>
      q
        .users(ints(p))
        .map((u) => ({ id: u.id, id_int: u.idInt, state: u.state })),
  ],
  [
    "FROM user_notification_settings",
    (p) =>
      q.unsubscriptions(ints(p)).map((u) => ({
        user_id_int: u.userIdInt,
        notification_type: u.type,
        delivery_method: u.deliveryMethod,
      })),
  ],
  [
    "SELECT id_int, email, first_name, last_name FROM users",
    (p) =>
      q.users(ints(p)).map((u) => ({
        id_int: u.idInt,
        email: u.email,
        first_name: u.firstName,
        last_name: u.lastName,
      })),
  ],
  [
    "SELECT id FROM comments WHERE id_int",
    ([c]) => [{ id: q.comment(c as number)?.id }],
  ],
  [
    "SELECT id_int, id FROM users",
    (p) => q.users(ints(p)).map((u) => ({ id_int: u.idInt, id: u.id })),
  ],
];

function v0Execute(query: unknown) {
  const { text, params } = flatten(query as SQL);
  if (text.includes("INSERT INTO notifications")) {
    const isComment = text.includes("comment_id_int");
    const [, , message, ...rest] = params;
    ctx.notifications.push(
      isComment
        ? {
            userId: rest[1],
            publicationId: rest[2],
            commentId: rest[4],
            message,
            state: rest[0],
          }
        : {
            userId: rest[0],
            publicationId: rest[1],
            commentId: null,
            message,
            state: "NEW_PUBLICATION",
          }
    );
    return [{ insertId: ctx.notifications.length }];
  }
  const match = v0Queries.find(([needle]) => text.includes(needle));
  if (!match) throw new Error(`Unhandled v0 query: ${text}`);
  return rows(match[1](params));
}

// ---------------------------------------------------------------------------
// v1 fake: NotificationsRepository backed by the same World
// ---------------------------------------------------------------------------

const ulidsOf = (idInts: number[]) => idInts.map((id) => q.user(id)!.id);
const intsOf = (ulids: string[]) => ulids.map((id) => q.userByUlid(id).idInt);

function v1Repo() {
  const repo: {
    [key in keyof NotificationsRepository]: NotificationsRepository[key];
  } = {
    createMany: async (
      rowsIn: {
        userId: string;
        publicationId: string;
        commentId?: string | null;
        message: string;
        state: string;
      }[]
    ) => {
      for (const r of rowsIn) {
        ctx.notifications.push({
          userId: r.userId,
          publicationId: r.publicationId,
          commentId: r.commentId ?? null,
          message: r.message,
          state: r.state,
        });
      }
    },
    listActiveTypes: async () => q.activeTypes(),
    listUnsubscriptions: async (userIds: string[]) =>
      q.unsubscriptions(intsOf(userIds)).map((u) => ({
        userId: q.user(u.userIdInt)!.id,
        type: u.type,
        deliveryMethod: u.deliveryMethod,
      })),
    findCommentWithAuthor: async (commentId: string) => {
      const c = q.commentByUlid(commentId);
      if (!c) return null;
      const u = q.user(c.userIdInt)!;
      return {
        id: c.id,
        idInt: c.idInt,
        userId: u.id,
        userIdInt: u.idInt,
        publicationId: q.pub(c.publicationIdInt)!.id,
        publicationIdInt: c.publicationIdInt,
        versionId: null,
        versionIdInt: null,
        parentId: c.parentIdInt == null ? null : q.comment(c.parentIdInt)!.id,
        parentIdInt: c.parentIdInt,
        body: c.body,
        anchorText: null,
        preText: c.preText,
        postText: c.postText,
        approved: false,
        state: c.state,
        createdAt: null,
        updatedAt: null,
        user: {
          firstName: u.firstName,
          lastName: u.lastName,
          username: u.username,
        },
      };
    },
    findPublishedCommentAuthorId: async (commentId: string) => {
      const author = q.publishedAuthorOf(q.commentByUlid(commentId)!.idInt);
      return author == null ? null : q.user(author)!.id;
    },
    findPublicationWithLatestTitle: async (publicationId: string) => {
      const p = q.pubByUlid(publicationId);
      return p && p.title != null
        ? {
            id: p.id,
            idInt: p.idInt,
            slug: p.slug,
            title: p.title,
            versionId: p.versionId,
          }
        : null;
    },
    listContributorBylinesByVersionId: async (versionId: string) =>
      q.contributorBylines(q.pubByVersionUlid(versionId)!.idInt).map((c) => ({
        userId: q.user(c.userIdInt)!.id,
        inByline: c.inByline,
      })),
    listPublicationAuthors: async (versionId: string) =>
      q.publicationAuthors(q.pubByVersionUlid(versionId)!.idInt).map((u) => ({
        userId: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
      })),
    listActiveOrgAdminIds: async (publicationId: string) =>
      ulidsOf(q.activeAdminIds(q.pubByUlid(publicationId)!.idInt)),
    listPublicationOrgs: async (publicationId: string) =>
      q
        .publicationOrgs(q.pubByUlid(publicationId)!.idInt)
        .map((o) => ({ id: o.id, name: o.name })),
    listUserFollowerIds: async (leaderId: string) =>
      ulidsOf(q.followerIds(q.userByUlid(leaderId).idInt)),
    listOrgFollowerIds: async (orgId: string) =>
      ulidsOf(q.orgFollowerIds(q.orgByUlid(orgId).idInt)),
    listRecipients: async (userIds: string[]) =>
      q.users(intsOf(userIds)).map((u) => ({
        id: u.id,
        idInt: u.idInt,
        state: u.state,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
      })),
  };
  return repo;
}

// ---------------------------------------------------------------------------
// Runners
// ---------------------------------------------------------------------------

type Outcome = { emails: SentEmail[]; notifications: WrittenNotification[] };

async function runBoth(
  world: World,
  runV0: () => Promise<void>,
  runV1: () => Promise<void>
): Promise<{ v0: Outcome; v1: Outcome }> {
  ctx.world = world;
  ctx.execute = v0Execute;
  ctx.repo = v1Repo();

  const capture = async (run: () => Promise<void>): Promise<Outcome> => {
    ctx.emails = [];
    ctx.notifications = [];
    await run();
    return { emails: ctx.emails, notifications: ctx.notifications };
  };
  return { v0: await capture(runV0), v1: await capture(runV1) };
}

async function runNewComment(world: World, commentId: string) {
  const comment = world.comments.find((c) => c.id === commentId);
  return runBoth(
    world,
    () => v0.newComment(comment?.idInt ?? -1, comment?.publicationIdInt ?? -1),
    () => v1.notifyForNewComment(commentId)
  );
}

async function runNewPublication(
  world: World,
  publicationId: string,
  versionId: string
) {
  const pub = world.publications.find((p) => p.id === publicationId)!;
  return runBoth(
    world,
    () => v0.newPublication(pub.idInt, pub.versionIdInt, "ignored"),
    () => v1.notifyForNewPublication({ publicationId, versionId })
  );
}

const emailSummary = (o: Outcome) =>
  o.emails.map(({ fn, args }) => {
    const recipients = args[2] as { email: string } | { email: string }[];
    return {
      fn,
      type: args[3],
      to: Array.isArray(recipients)
        ? recipients.map((r) => r.email)
        : recipients.email,
    };
  });

const notificationSummary = (o: Outcome) =>
  o.notifications.map((n) => [n.userId, n.message, n.state]);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BYLINE = "NEW_COMMENT__BYLINE_CONTRIB";
const NON_BYLINE = "NEW_COMMENT__NON_BYLINE_CONTRIB";
const ORG_ADMIN = "NEW_COMMENT__ORG_ADMIN";
const PARENT = "NEW_COMMENT__PARENT_COMMENTER";

function user(
  idInt: number,
  firstName: string,
  overrides: Partial<WorldUser> = {}
): WorldUser {
  return {
    idInt,
    id: `U${idInt}`,
    firstName,
    lastName: "Test",
    email: `${firstName.toLowerCase()}@example.com`,
    username: firstName.toLowerCase(),
    state: "ACTIVE",
    ...overrides,
  };
}

// Users: 1 Ada (owner, byline), 2 Grace (non-byline), 3 Carol (org admin),
// 4 Eve (expired org admin), 7 Chris (commenter), 8 Pat (parent commenter),
// 9 Dan (deleted).
function baseWorld(): World {
  return {
    users: [
      user(1, "Ada"),
      user(2, "Grace"),
      user(3, "Carol"),
      user(4, "Eve"),
      user(7, "Chris"),
      user(8, "Pat"),
      user(9, "Dan", { state: "DELETED" }),
    ],
    publications: [
      {
        idInt: 900,
        id: "P900",
        slug: "some-pub",
        ownerIdInt: 1,
        title: "Some Publication",
        versionIdInt: 9000,
        versionId: "V900",
      },
    ],
    contributors: [],
    followers: [],
    orgs: [{ idInt: 5, id: "O5", name: "Acme Labs" }],
    orgPublications: [],
    orgFollowers: [],
    orgMembers: [],
    comments: [
      {
        idInt: 300,
        id: "C300",
        publicationIdInt: 900,
        userIdInt: 8,
        parentIdInt: null,
        body: "Parent comment",
        preText: null,
        postText: null,
        state: "PUBLISHED",
      },
      {
        idInt: 501,
        id: "C501",
        publicationIdInt: 900,
        userIdInt: 7,
        parentIdInt: null,
        body: "Nice work!",
        preText: "before",
        postText: "after",
        state: "PUBLISHED",
      },
    ],
    notificationTypes: [
      { type: PARENT, priority: 1, state: "ACTIVE", trigger: "NEW_COMMENT" },
      { type: BYLINE, priority: 2, state: "ACTIVE", trigger: "NEW_COMMENT" },
      {
        type: NON_BYLINE,
        priority: 3,
        state: "ACTIVE",
        trigger: "NEW_COMMENT",
      },
      { type: ORG_ADMIN, priority: 4, state: "ACTIVE", trigger: "NEW_COMMENT" },
    ],
    unsubscriptions: [],
  };
}

function worldWith(mutate: (w: World) => void): World {
  const w = baseWorld();
  mutate(w);
  return w;
}

const replyTo = (w: World, parentIdInt: number) => {
  w.comments.find((c) => c.idInt === 501)!.parentIdInt = parentIdInt;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("newComment: v1 matches v0", () => {
  const cases: {
    name: string;
    world: World;
    commentId?: string;
    emails: ReturnType<typeof emailSummary>;
    notifications: ReturnType<typeof notificationSummary>;
  }[] = [
    {
      name: "the comment does not exist",
      world: baseWorld(),
      commentId: "C-missing",
      emails: [],
      notifications: [],
    },
    {
      name: "the publication has no latest version",
      world: worldWith((w) => {
        w.publications[0]!.title = null;
        w.contributors.push({
          publicationIdInt: 900,
          userIdInt: 1,
          inByline: true,
        });
      }),
      emails: [],
      notifications: [],
    },
    {
      name: "there are no active notify types",
      world: worldWith((w) => {
        w.notificationTypes = [];
        w.contributors.push({
          publicationIdInt: 900,
          userIdInt: 1,
          inByline: true,
        });
      }),
      emails: [],
      notifications: [],
    },
    {
      name: "deprecated and wrong-trigger types are ignored, unknown types warn",
      world: worldWith((w) => {
        w.notificationTypes = [
          {
            type: BYLINE,
            priority: 1,
            state: "DEPRECATED",
            trigger: "NEW_COMMENT",
          },
          { type: NON_BYLINE, priority: 2, state: "ACTIVE", trigger: null },
          {
            type: "SOMETHING_NEW",
            priority: 3,
            state: "ACTIVE",
            trigger: "NEW_COMMENT",
          },
        ];
        w.contributors.push(
          { publicationIdInt: 900, userIdInt: 1, inByline: true },
          { publicationIdInt: 900, userIdInt: 2, inByline: false }
        );
      }),
      emails: [],
      notifications: [],
    },
    {
      name: "the only qualifying user is the commenter",
      world: worldWith((w) => {
        w.contributors.push({
          publicationIdInt: 900,
          userIdInt: 7,
          inByline: true,
        });
      }),
      emails: [],
      notifications: [],
    },
    {
      name: "the only qualifying user is deleted",
      world: worldWith((w) => {
        w.contributors.push({
          publicationIdInt: 900,
          userIdInt: 9,
          inByline: true,
        });
      }),
      emails: [],
      notifications: [],
    },
    {
      name: "a byline contributor unsubscribed from in-app only gets an email",
      world: worldWith((w) => {
        w.contributors.push({
          publicationIdInt: 900,
          userIdInt: 1,
          inByline: true,
        });
        w.unsubscriptions.push({
          userIdInt: 1,
          type: BYLINE,
          deliveryMethod: "IN_APP",
        });
      }),
      emails: [{ fn: "bylines", type: BYLINE, to: ["ada@example.com"] }],
      notifications: [],
    },
    {
      name: "a byline contributor unsubscribed from email only gets an in-app notification",
      world: worldWith((w) => {
        w.contributors.push({
          publicationIdInt: 900,
          userIdInt: 1,
          inByline: true,
        });
        w.unsubscriptions.push({
          userIdInt: 1,
          type: BYLINE,
          deliveryMethod: "EMAIL",
        });
      }),
      emails: [],
      notifications: [["U1", "New comment on your publication", "COMMENT"]],
    },
    {
      name: "a user unsubscribed from both methods gets nothing",
      world: worldWith((w) => {
        w.contributors.push({
          publicationIdInt: 900,
          userIdInt: 1,
          inByline: true,
        });
        w.unsubscriptions.push(
          { userIdInt: 1, type: BYLINE, deliveryMethod: "EMAIL" },
          { userIdInt: 1, type: BYLINE, deliveryMethod: "IN_APP" }
        );
      }),
      emails: [],
      notifications: [],
    },
    {
      name: "the parent commenter is emailed (as a single user) and notified of a reply",
      world: worldWith((w) => replyTo(w, 300)),
      emails: [{ fn: "commenter", type: PARENT, to: "pat@example.com" }],
      notifications: [["U8", "New reply to your comment", "REPLY"]],
    },
    {
      name: "a moderated parent comment's author is not notified",
      world: worldWith((w) => {
        replyTo(w, 300);
        w.comments.find((c) => c.idInt === 300)!.state = "MODERATED";
      }),
      emails: [],
      notifications: [],
    },
    {
      name: "the highest-priority type wins per user, independently per delivery method",
      world: worldWith((w) => {
        w.contributors.push({
          publicationIdInt: 900,
          userIdInt: 1,
          inByline: true,
        });
        w.orgPublications.push({ orgIdInt: 5, publicationIdInt: 900 });
        w.orgMembers.push({
          orgIdInt: 5,
          userIdInt: 1,
          admin: true,
          ended: false,
        });
        w.unsubscriptions.push({
          userIdInt: 1,
          type: BYLINE,
          deliveryMethod: "IN_APP",
        });
      }),
      emails: [{ fn: "bylines", type: BYLINE, to: ["ada@example.com"] }],
      notifications: [["U1", "New comment on an org you manage", "COMMENT"]],
    },
    {
      name: "a user listed both in and out of the byline gets the byline type",
      world: worldWith((w) => {
        w.contributors.push(
          { publicationIdInt: 900, userIdInt: 2, inByline: false },
          { publicationIdInt: 900, userIdInt: 2, inByline: true }
        );
      }),
      emails: [{ fn: "bylines", type: BYLINE, to: ["grace@example.com"] }],
      notifications: [["U2", "New comment on your publication", "COMMENT"]],
    },
    {
      name: "full fan-out across every notify type",
      world: worldWith((w) => {
        replyTo(w, 300);
        w.contributors.push(
          { publicationIdInt: 900, userIdInt: 1, inByline: true },
          { publicationIdInt: 900, userIdInt: 1, inByline: true },
          { publicationIdInt: 900, userIdInt: 2, inByline: false },
          { publicationIdInt: 900, userIdInt: 7, inByline: true },
          { publicationIdInt: 900, userIdInt: 9, inByline: false }
        );
        w.orgPublications.push({ orgIdInt: 5, publicationIdInt: 900 });
        w.orgMembers.push(
          { orgIdInt: 5, userIdInt: 3, admin: true, ended: false },
          { orgIdInt: 5, userIdInt: 4, admin: true, ended: true },
          { orgIdInt: 5, userIdInt: 2, admin: false, ended: false }
        );
      }),
      emails: [
        { fn: "commenter", type: PARENT, to: "pat@example.com" },
        { fn: "bylines", type: BYLINE, to: ["ada@example.com"] },
        { fn: "nonBylines", type: NON_BYLINE, to: ["grace@example.com"] },
        { fn: "orgAdmins", type: ORG_ADMIN, to: ["carol@example.com"] },
      ],
      notifications: [
        ["U8", "New reply to your comment", "REPLY"],
        ["U1", "New comment on your publication", "COMMENT"],
        ["U2", "New comment on your publication", "COMMENT"],
        ["U3", "New comment on an org you manage", "COMMENT"],
      ],
    },
  ];

  it.each(cases)("$name", async (c) => {
    const { v0: v0Out, v1: v1Out } = await runNewComment(
      c.world,
      c.commentId ?? "C501"
    );

    expect(emailSummary(v0Out)).toEqual(c.emails);
    expect(notificationSummary(v0Out)).toEqual(c.notifications);
    // Full payloads, including the int-keyed CommentData/PublicationData
    // handed to mail.ts and the ULIDs on each notification row.
    expect(v1Out).toEqual(v0Out);
  });

  it("hands mail.ts the same int-keyed comment and publication payloads", async () => {
    const { v0: v0Out, v1: v1Out } = await runNewComment(
      worldWith((w) => replyTo(w, 300)),
      "C501"
    );

    expect(v0Out.emails[0]!.args.slice(0, 2)).toEqual([
      {
        id_int: 501,
        user_id_int: 7,
        publication_id: 900,
        parent_id: 300,
        body: "Nice work!",
        pre_text: "before",
        post_text: "after",
        commenter_name: "Chris Test",
        commenter_username: "chris",
      },
      { id_int: 900, slug: "some-pub", title: "Some Publication" },
    ]);
    expect(v1Out.emails).toEqual(v0Out.emails);
    expect(v1Out.notifications).toEqual([
      {
        userId: "U8",
        publicationId: "P900",
        commentId: "C501",
        message: "New reply to your comment",
        state: "REPLY",
      },
    ]);
  });
});

describe("newPublication: v1 matches v0", () => {
  const CONTRIB_MSG = "A publication you contributed to has been published";

  const cases: {
    name: string;
    world: World;
    notifications: ReturnType<typeof notificationSummary>;
  }[] = [
    {
      name: "no contributors, owner, or org followers",
      world: worldWith((w) => {
        w.publications[0]!.ownerIdInt = null;
      }),
      notifications: [],
    },
    {
      name: "a lone owner-contributor",
      world: worldWith((w) => {
        w.contributors.push({
          publicationIdInt: 900,
          userIdInt: 1,
          inByline: true,
        });
      }),
      notifications: [["U1", CONTRIB_MSG, "NEW_PUBLICATION"]],
    },
    {
      name: "an owner who isn't a contributor is notified after contributors",
      world: worldWith((w) => {
        w.contributors.push({
          publicationIdInt: 900,
          userIdInt: 2,
          inByline: true,
        });
      }),
      notifications: [
        ["U2", CONTRIB_MSG, "NEW_PUBLICATION"],
        ["U1", CONTRIB_MSG, "NEW_PUBLICATION"],
      ],
    },
    {
      name: "a follower of two contributors gets the first contributor's message",
      world: worldWith((w) => {
        w.contributors.push(
          { publicationIdInt: 900, userIdInt: 1, inByline: true },
          { publicationIdInt: 900, userIdInt: 2, inByline: true }
        );
        w.followers.push(
          { leaderIdInt: 1, followerIdInt: 8 },
          { leaderIdInt: 2, followerIdInt: 8 }
        );
      }),
      notifications: [
        ["U1", CONTRIB_MSG, "NEW_PUBLICATION"],
        ["U8", "Ada Test just published something new", "NEW_PUBLICATION"],
        ["U2", CONTRIB_MSG, "NEW_PUBLICATION"],
      ],
    },
    {
      name: "a contributor who follows an earlier contributor keeps their slot but gets the contributor message",
      world: worldWith((w) => {
        w.contributors.push(
          { publicationIdInt: 900, userIdInt: 1, inByline: true },
          { publicationIdInt: 900, userIdInt: 2, inByline: true }
        );
        w.followers.push({ leaderIdInt: 1, followerIdInt: 2 });
      }),
      notifications: [
        ["U1", CONTRIB_MSG, "NEW_PUBLICATION"],
        ["U2", CONTRIB_MSG, "NEW_PUBLICATION"],
      ],
    },
    {
      name: "org followers are notified without overwriting earlier messages",
      world: worldWith((w) => {
        w.contributors.push({
          publicationIdInt: 900,
          userIdInt: 1,
          inByline: true,
        });
        w.followers.push({ leaderIdInt: 1, followerIdInt: 8 });
        w.orgPublications.push({ orgIdInt: 5, publicationIdInt: 900 });
        w.orgFollowers.push(
          { orgIdInt: 5, followerIdInt: 1 },
          { orgIdInt: 5, followerIdInt: 8 },
          { orgIdInt: 5, followerIdInt: 3 }
        );
      }),
      notifications: [
        ["U1", CONTRIB_MSG, "NEW_PUBLICATION"],
        ["U8", "Ada Test just published something new", "NEW_PUBLICATION"],
        ["U3", "Acme Labs just published something new", "NEW_PUBLICATION"],
      ],
    },
  ];

  it.each(cases)("$name", async (c) => {
    const { v0: v0Out, v1: v1Out } = await runNewPublication(
      c.world,
      "P900",
      "V900"
    );

    expect(notificationSummary(v0Out)).toEqual(c.notifications);
    expect(v0Out.notifications.every((n) => n.publicationId === "P900")).toBe(
      true
    );
    expect(v1Out).toEqual(v0Out);
  });
});
