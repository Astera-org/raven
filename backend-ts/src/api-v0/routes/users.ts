import { getConfig } from "#src/config.js";
import { stripUlidIdsFromArray } from "#src/lib/utils/strip-ulid-ids.js";
import type { AppEnv } from "#src/types/hono.js";
import {
  PUBLIC_USER_FIELDS,
  UsersRepository,
} from "#v0/db-repositories/users-repository.js";
import { dbSelectValue } from "#v0/lib/db/db-select-value.js";
import { dbSelect, type Row } from "#v0/lib/db/db-select.js";
import { dbUpdate } from "#v0/lib/db/db-update.js";
import {
  dbDateStringToIso,
  getPagination,
  getPublicationsList,
  getSessionUserId,
  matchUsers as matchUsersUtil,
} from "#v0/lib/rutils.js";
import {
  reconcileIntIdsToId,
  reconcileIntIdToId,
} from "#v0/lib/utils/reconcile-int-id.js";
import { sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const app = new Hono<AppEnv>();

const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif"]);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get("/", async (c) => {
  const query = Object.fromEntries(new URL(c.req.url).searchParams);
  const { page, perPage, offset } = getPagination(query);
  const usersRepository = new UsersRepository();

  const { items, total } = await usersRepository.listPublicUsers({
    perPage,
    offset,
  });
  return c.json({
    pagination: { total, page, per_page: perPage },
    items: reconcileIntIdsToId(items),
  });
});

app.get("/match", async (c) => {
  const identifier = c.req.query("id") ?? "";
  // Looking users up by email is only for signed-in callers; otherwise
  // anyone could check which email addresses have accounts.
  const allowEmailLookup = (await getSessionUserId(c)) != null;
  const users = await matchUsersUtil(identifier, { allowEmailLookup });
  return c.json(users);
});

app.get("/notes", async (c) => {
  const callerId = await getSessionUserId(c);
  if (!callerId) return c.json({ error: "Authentication required" }, 401);

  const all = c.req.query("all");
  const query = Object.fromEntries(new URL(c.req.url).searchParams);

  if (all) {
    const { page, perPage, offset } = getPagination(query);
    const rows = await dbSelect(
      sql`SELECT n.*, p.slug as publication_slug FROM notifications n LEFT JOIN publications p ON p.id_int = n.publication_id_int WHERE n.user_id_int = ${callerId} AND n.deleted_at IS NULL ORDER BY n.created_at DESC LIMIT ${perPage} OFFSET ${offset}`
    );
    const total = await dbSelectValue(
      sql`SELECT COUNT(*) FROM notifications WHERE user_id_int = ${callerId} AND deleted_at IS NULL`
    );
    return c.json({
      pagination: { total, page, per_page: perPage },
      items: reconcileIntIdsToId(stripUlidIdsFromArray(rows)).map((item) => {
        const { deleted_at: _, ...rest } = item;
        return rest;
      }),
    });
  }

  const rows = await dbSelect(
    sql`SELECT * FROM notifications WHERE user_id_int = ${callerId} AND seen = false AND deleted_at IS NULL`
  );
  return c.json(
    reconcileIntIdsToId(stripUlidIdsFromArray(rows)).map((item) => {
      const { deleted_at: _, ...rest } = item;
      return rest;
    })
  );
});

/**
 * @deprecated - In favor of `/notifications/:id`
 */
app.post("/mark_note", async (c) => {
  const callerId = await getSessionUserId(c);
  if (!callerId) return c.json({ error: "Authentication required" }, 401);
  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const noteId = body["note_id"];
  const seen = body["seen"] ?? true;
  await dbUpdate(
    sql`UPDATE notifications SET seen = ${seen ? 1 : 0} WHERE id_int = ${noteId} AND user_id_int = ${callerId}`
  );
  return c.json({ note_id: noteId });
});

app.get("/:user_id{[0-9]+}/publications", async (c) => {
  const userId = parseInt(c.req.param("user_id"), 10);
  const query = Object.fromEntries(new URL(c.req.url).searchParams);
  const result = await getPublicationsList(
    query,
    "",
    sql`LEFT JOIN contributors c ON c.version_id_int = v.id_int`,
    sql`AND (p.owner_id_int = ${userId} OR c.user_id_int = ${userId})`
  );
  return c.json(result);
});

app.get("/:user_id{[0-9]+}/orgs", async (c) => {
  const userId = parseInt(c.req.param("user_id"), 10);

  // start_at (join date) is only for the user themselves or a site admin —
  // this endpoint is otherwise public/unauthenticated, unlike the rest of
  // this file's user-detail data which sits behind requireSiteAdmin.
  const callerId = await getSessionUserId(c);
  let canSeeJoinDates = callerId === userId;
  if (!canSeeJoinDates && callerId) {
    const callerState = await new UsersRepository().getUserState(callerId);
    canSeeJoinDates = callerState === "SITE_ADMIN";
  }

  const rows = await dbSelect(
    sql`SELECT DISTINCT o.id_int, o.name, o.slug, o.avatar, o.profile, o.created_at, o.updated_at, ou.start_at, ou.roles FROM organizations o LEFT JOIN org_user_map ou ON o.id_int = ou.org_id_int WHERE ou.user_id_int = ${userId} AND (ou.end_at IS NULL OR ou.end_at > NOW())`
  );
  for (const row of rows) {
    if (row["roles"] && String(row["roles"]).includes("ADMIN")) {
      row["can_edit"] = true;
    }
    delete row["roles"];
    if (canSeeJoinDates) {
      row["start_at"] = dbDateStringToIso(row["start_at"] as string | null);
    } else {
      delete row["start_at"];
    }
  }
  return c.json(rows);
});

app.get("/:user_id{[0-9]+}", async (c) => {
  const userId = parseInt(c.req.param("user_id"), 10);
  const rows = await dbSelect(
    sql`SELECT ${PUBLIC_USER_FIELDS}, email FROM users WHERE id_int = ${userId} AND state IN ('ACTIVE','SITE_ADMIN')`
  );
  if (rows.length === 0) return c.json({ error: "User not found" }, 404);

  return c.json(reconcileIntIdToId(await withEmailIfAllowed(c, rows[0]!)));
});

app.put("/:user_id{[0-9]+}", async (c) => {
  const userId = parseInt(c.req.param("user_id"), 10);
  const sessionUserId = await getSessionUserId(c);
  if (!sessionUserId) return c.json({ error: "Authentication required" }, 401);
  if (sessionUserId !== userId)
    return c.json({ error: "Not authorised to update this user" }, 403);

  const body = (await c.req.json().catch(() => ({}))) as Record<string, string>;
  const { first_name, last_name, email, profile } = body;
  await dbUpdate(
    sql`UPDATE users SET first_name = ${first_name ?? ""}, last_name = ${last_name ?? ""}, email = ${email ?? ""}, profile = ${profile ?? null} WHERE id_int = ${userId}`
  );
  return c.json({ user_id: userId });
});

app.post("/:user_id{[0-9]+}/avatar", async (c) => {
  const userId = parseInt(c.req.param("user_id"), 10);
  const sessionUserId = await getSessionUserId(c);
  if (sessionUserId !== userId)
    return c.json({ error: "Not authorised to update this user" }, 403);

  const body = await c.req.parseBody().catch(() => null);
  if (!body) return c.json({ error: "No avatar file provided" }, 400);
  const file = body["avatar"];
  if (!(file instanceof File))
    return c.json({ error: "No avatar file provided" }, 400);

  const ext = extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext))
    return c.json({ error: "Unsupported file type" }, 400);

  const cfg = getConfig();
  const newFilename = `user_${userId}_${Date.now()}${ext}`;
  const destDir = join(cfg.IMG_DIR, "avatars", "users");
  await mkdir(destDir, { recursive: true });
  const filePath = join(destDir, newFilename);
  await writeFile(filePath, Buffer.from(await file.arrayBuffer()));

  const avatarRelPath = `avatars/users/${newFilename}`;
  await dbUpdate(
    sql`UPDATE users SET image = ${avatarRelPath} WHERE id_int = ${userId}`
  );
  return c.json({ avatar_url: `/api/files/${avatarRelPath}` });
});

app.get("/:username", async (c) => {
  const username = c.req.param("username");
  const rows = await dbSelect(
    sql`SELECT ${PUBLIC_USER_FIELDS}, email FROM users WHERE username = ${username} AND state IN ('ACTIVE','SITE_ADMIN')`
  );
  if (rows.length === 0) return c.json({ error: "User not found" }, 404);

  return c.json(reconcileIntIdToId(await withEmailIfAllowed(c, rows[0]!)));
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Whether the caller may see `userId`'s email: only the user themselves or a
 * site admin. Everyone else, including anonymous callers, may not.
 */
async function canSeeUserEmail(
  c: Context<AppEnv>,
  userId: number
): Promise<boolean> {
  const callerId = await getSessionUserId(c);
  if (callerId == null) return false;
  if (callerId === userId) return true;
  return (await new UsersRepository().getUserState(callerId)) === "SITE_ADMIN";
}

/** Drops `row.email` unless the caller may see it (see `canSeeUserEmail`). */
async function withEmailIfAllowed(c: Context<AppEnv>, row: Row): Promise<Row> {
  const { email, ...rest } = row;
  return (await canSeeUserEmail(c, row["id_int"] as number))
    ? { ...rest, email }
    : rest;
}

export default app;
