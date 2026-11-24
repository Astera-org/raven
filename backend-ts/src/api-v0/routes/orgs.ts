import { getConfig } from "#src/config.js";
import { emptyToNull } from "#src/lib/utils/string.js";
import { stripUlidIds } from "#src/lib/utils/strip-ulid-ids.js";
import type { AppEnv } from "#src/types/hono.js";
import { dbInsert } from "#v0/lib/db/db-insert.js";
import { dbSelectValue } from "#v0/lib/db/db-select-value.js";
import { dbSelect } from "#v0/lib/db/db-select.js";
import { dbUpdate } from "#v0/lib/db/db-update.js";
import {
  canEdit,
  getOrgByIdentifier,
  slugifyOrgName,
} from "#v0/lib/org-helpers.js";
import {
  getPagination,
  getPublicationsList,
  getSessionUserId,
} from "#v0/lib/rutils.js";
import {
  reconcileIntIdsToId,
  reconcileIntIdToId,
} from "#v0/lib/utils/reconcile-int-id.js";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { ulid } from "ulid";

const app = new Hono<AppEnv>();

const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif"]);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get("/", async (c) => {
  // NOTE: There is currently no auth on this endpoint.
  // This ok for the moment, but may need to be revisisted in the future
  const query = Object.fromEntries(new URL(c.req.url).searchParams);
  const { page, perPage, offset } = getPagination(query);
  const [rows, counts] = await Promise.all([
    dbSelect(
      sql`SELECT
        o.id, o.name, o.slug, o.avatar, o.ror_id, o.unlisted,
        o.doi_minting_enabled, o.created_at,
        COUNT(DISTINCT CASE WHEN ou.end_at IS NULL OR ou.end_at > NOW() THEN ou.user_id END) AS member_count,
        COUNT(DISTINCT CASE WHEN p.state = 'PUBLISHED' THEN opm.publication_id END) AS publication_count
      FROM organizations o
      LEFT JOIN org_user_map ou ON ou.org_id = o.id
      LEFT JOIN org_publication_map opm ON opm.org_id = o.id
      LEFT JOIN publications p ON p.id = opm.publication_id
      WHERE o.state = 'ACTIVE'
      GROUP BY o.id, o.name, o.slug, o.avatar, o.ror_id, o.unlisted, o.doi_minting_enabled, o.created_at
      ORDER BY o.created_at DESC
      LIMIT ${perPage} OFFSET ${offset}`
    ),
    dbSelect(
      sql`SELECT unlisted, COUNT(*) as count FROM organizations WHERE state = 'ACTIVE' GROUP BY unlisted`
    ),
  ]);

  const total = counts.reduce((sum, row) => sum + Number(row.count), 0);
  const totalUnlisted = counts.find((row) => row.unlisted === 1)?.count ?? 0;

  return c.json({
    pagination: {
      total,
      total_unlisted: totalUnlisted,
      page,
      per_page: perPage,
    },
    items: rows,
  });
});

app.post("/", async (c) => {
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const userState = (await dbSelectValue(
    sql`SELECT state FROM users WHERE id_int = ${userId}`
  )) as string | null;
  if (userState !== "SITE_ADMIN")
    return c.json({ error: "Permission denied" }, 403);

  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const name = ((body["name"] as string) ?? "").trim();
  if (!name) return c.json({ error: "Missing organization name" }, 400);
  const profile = emptyToNull(body["profile"] as string | null);
  const rorId = emptyToNull(body["ror_id"] as string | null);
  const doiPrefix = emptyToNull(body["doi_prefix"] as string | null);
  const doiMintingEnabled =
    body["doi_minting_enabled"] === true || body["doi_minting_enabled"] === 1
      ? 1
      : 0;
  const unlisted = body["unlisted"] === true || body["unlisted"] === 1 ? 1 : 0;
  const providedSlug = ((body["slug"] as string) ?? "").trim().toLowerCase();
  if (providedSlug && !/^[a-z0-9-]{3,}$/.test(providedSlug)) {
    return c.json(
      {
        error:
          "Invalid slug: use lowercase letters, numbers, and hyphens (min 3 chars)",
      },
      400
    );
  }
  let slug: string;
  if (providedSlug) {
    const taken = await dbSelectValue(
      sql`SELECT 1 FROM organizations WHERE slug = ${providedSlug}`
    );
    if (taken) {
      let counter = 1;
      let candidate = `${providedSlug}-${counter}`;
      while (
        await dbSelectValue(
          sql`SELECT 1 FROM organizations WHERE slug = ${candidate}`
        )
      ) {
        counter++;
        candidate = `${providedSlug}-${counter}`;
      }
      slug = candidate;
    } else {
      slug = providedSlug;
    }
  } else {
    slug = await slugifyOrgName(name);
  }

  const orgUlid = ulid();
  let orgId: number;
  let userUlid: string;
  try {
    orgId = await dbInsert(
      sql`INSERT INTO organizations (name, slug, profile, ror_id, doi_prefix, doi_minting_enabled, unlisted, id) VALUES (${name}, ${slug}, ${profile || null}, ${rorId || null}, ${doiPrefix || null}, ${doiMintingEnabled}, ${unlisted}, ${orgUlid})`
    );
    userUlid = (await dbSelectValue(
      sql`SELECT id FROM users WHERE id_int = ${userId}`
    )) as string;
  } catch (err: unknown) {
    if ((err as { errno?: number }).errno === 1062) {
      return c.json({ error: "This slug is already taken" }, 409);
    }
    throw err;
  }
  await dbInsert(
    sql`INSERT INTO org_user_map (org_id_int, user_id_int, roles, org_id, user_id) VALUES (${orgId}, ${userId}, 'ADMIN', ${orgUlid}, ${userUlid})`
  );
  return c.json({ org_id: orgId, slug }, 201);
});

app.get("/:id_or_slug/users", async (c) => {
  const idOrSlug = c.req.param("id_or_slug");
  const org = await getOrgByIdentifier(idOrSlug);
  if (!org) return c.json({ error: "Org not found" }, 404);
  const orgId = org["id_int"] as number;
  const query = Object.fromEntries(new URL(c.req.url).searchParams);
  const { page, perPage, offset } = getPagination(query);
  const [users, total] = await Promise.all([
    dbSelect(
      sql`SELECT DISTINCT u.id_int, u.username, u.email, u.first_name, u.last_name, u.image as avatar, u.state, u.orcid, ou.roles, ou.start_at, ou.end_at FROM org_user_map ou JOIN users u ON ou.user_id_int = u.id_int WHERE ou.org_id_int = ${orgId} AND (ou.end_at IS NULL OR ou.end_at > NOW()) LIMIT ${perPage} OFFSET ${offset}`
    ),
    dbSelectValue(
      sql`SELECT COUNT(*) FROM org_user_map WHERE org_id_int = ${orgId} AND (end_at IS NULL OR end_at > NOW())`
    ),
  ]);
  for (const user of users) {
    const rolesStr = String(user["roles"] ?? "");
    const parts = rolesStr
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
    user["role"] = parts[0] || "MEMBER";
    delete user["roles"];
  }
  return c.json({
    pagination: { total, page, per_page: perPage },
    items: reconcileIntIdsToId(users),
  });
});

app.get("/:id_or_slug/publications", async (c) => {
  const idOrSlug = c.req.param("id_or_slug");
  const org = await getOrgByIdentifier(idOrSlug);
  if (!org) return c.json({ error: "Org not found" }, 404);
  const orgId = org["id_int"] as number;
  const query = Object.fromEntries(new URL(c.req.url).searchParams);
  const result = await getPublicationsList(
    query,
    "",
    sql`JOIN org_publication_map m ON m.publication_id_int = p.id_int`,
    sql`AND m.org_id_int = ${orgId}`
  );
  return c.json(result);
});

app.get("/:id_or_slug", async (c) => {
  const idOrSlug = c.req.param("id_or_slug");
  const org = await getOrgByIdentifier(idOrSlug);
  if (!org) return c.json({ error: "Org not found" }, 404);
  const orgId = org["id_int"] as number;
  const userId = await getSessionUserId(c);
  if (userId && (await canEdit(orgId, userId))) org["can_edit"] = true;

  return c.json(reconcileIntIdToId(stripUlidIds(org)));
});

app.post("/:slug/add_member", async (c) => {
  const slug = c.req.param("slug");
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const org = await getOrgByIdentifier(slug);
  if (!org) return c.json({ error: "Org not found" }, 404);
  const orgId = org["id_int"] as number;
  if (!(await canEdit(orgId, userId)))
    return c.json({ error: "Permission denied" }, 403);

  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const username = emptyToNull(body["username"] as string | null);
  const startAt = emptyToNull(body["start_at"] as string | null);
  const VALID_ROLES = new Set([
    "ADMIN",
    "MEMBER",
    "AUTHOR",
    "MODERATOR",
    "READER",
  ]);
  const role = ((body["role"] as string) ?? "MEMBER").toUpperCase();
  if (!VALID_ROLES.has(role)) return c.json({ error: "Invalid role" }, 400);
  const dbRole = role === "ADMIN" ? "ADMIN" : null;

  if (!username) return c.json({ error: "Missing username" }, 400);

  const memberRows = await dbSelect(
    sql`SELECT id_int, id FROM users WHERE username = ${username}`
  );
  if (memberRows.length === 0) return c.json({ error: "User not found" }, 404);
  const memberId = memberRows[0]!["id_int"] as number;
  const memberUlid = memberRows[0]!["id"] as string;

  const exists = await dbSelectValue(
    sql`SELECT 1 FROM org_user_map WHERE org_id_int = ${orgId} AND user_id_int = ${memberId}`
  );
  if (exists)
    return c.json(
      { error: "User is already a member of this organization" },
      409
    );

  const orgUlid = org["id"] as string;
  const startAtExpr = startAt ? sql`${startAt}` : sql`NOW()`;
  await dbInsert(
    sql`INSERT INTO org_user_map (org_id_int, user_id_int, roles, start_at, org_id, user_id) VALUES (${orgId}, ${memberId}, ${dbRole}, ${startAtExpr}, ${orgUlid}, ${memberUlid})`
  );
  return c.json({ org_id: orgId, slug: org["slug"] });
});

app.post("/:slug/remove_member", async (c) => {
  const slug = c.req.param("slug");
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const org = await getOrgByIdentifier(slug);
  if (!org) return c.json({ error: "Org not found" }, 404);
  const orgId = org["id_int"] as number;
  if (!(await canEdit(orgId, userId)))
    return c.json({ error: "Permission denied" }, 403);

  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const memberId = body["member_id"] as number;
  const endAt = emptyToNull(body["end_at"] as string | null);
  await dbUpdate(
    sql`UPDATE org_user_map SET end_at = ${endAt || null} WHERE org_id_int = ${orgId} AND user_id_int = ${memberId}`
  );
  return c.json({ org_id: orgId, slug: org["slug"] });
});

app.post("/:slug/delete_member", async (c) => {
  const slug = c.req.param("slug");
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const org = await getOrgByIdentifier(slug);
  if (!org) return c.json({ error: "Org not found" }, 404);
  const orgId = org["id_int"] as number;
  if (!(await canEdit(orgId, userId)))
    return c.json({ error: "Permission denied" }, 403);

  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const memberId = body["member_id"] as number;
  await dbUpdate(
    sql`DELETE FROM org_user_map WHERE org_id_int = ${orgId} AND user_id_int = ${memberId}`
  );
  return c.json({ org_id: orgId, slug: org["slug"] });
});

app.post("/:slug/avatar", async (c) => {
  const slug = c.req.param("slug");
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const org = await getOrgByIdentifier(slug);
  if (!org) return c.json({ error: "Org not found" }, 404);
  const orgId = org["id_int"] as number;
  if (!(await canEdit(orgId, userId)))
    return c.json({ error: "Permission denied" }, 403);

  const body = await c.req.parseBody().catch(() => null);
  if (!body) return c.json({ error: "No avatar file provided" }, 400);
  const file = body["avatar"];
  if (!(file instanceof File))
    return c.json({ error: "No avatar file provided" }, 400);

  const ext = extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext))
    return c.json({ error: "Unsupported file type" }, 400);

  const cfg = getConfig();
  const newFilename = `org_${orgId}_${Date.now()}${ext}`;
  const destDir = join(cfg.IMG_DIR, "avatars", "orgs");
  await mkdir(destDir, { recursive: true });
  await writeFile(
    join(destDir, newFilename),
    Buffer.from(await file.arrayBuffer())
  );

  const avatarRelPath = `avatars/orgs/${newFilename}`;
  await dbUpdate(
    sql`UPDATE organizations SET avatar = ${avatarRelPath} WHERE id_int = ${orgId}`
  );
  return c.json({ avatar_url: `/api/files/${avatarRelPath}` });
});

app.post("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const org = await getOrgByIdentifier(slug);
  if (!org) return c.json({ error: "Org not found" }, 404);
  const orgId = org["id_int"] as number;
  if (!(await canEdit(orgId, userId)))
    return c.json({ error: "Permission denied" }, 403);

  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const name = emptyToNull(body["name"] as string | null);
  if (!name) return c.json({ error: "Missing organization name" }, 400);
  const profile = emptyToNull(body["profile"] as string | null);
  const rorId = emptyToNull(body["ror_id"] as string | null);
  const doiPrefix = emptyToNull(body["doi_prefix"] as string | null);
  const doiMintingEnabled =
    body["doi_minting_enabled"] === true || body["doi_minting_enabled"] === 1
      ? 1
      : 0;
  const unlisted = body["unlisted"] === true || body["unlisted"] === 1 ? 1 : 0;

  const providedSlug = ((body["slug"] as string) ?? "").trim().toLowerCase();
  let finalSlug = org["slug"] as string;

  if (providedSlug) {
    if (!/^[a-z0-9-]{3,}$/.test(providedSlug)) {
      return c.json(
        {
          error:
            "Invalid slug: use lowercase letters, numbers, and hyphens (min 3 chars)",
        },
        400
      );
    }
    const taken = await dbSelectValue(
      sql`SELECT 1 FROM organizations WHERE slug = ${providedSlug} AND id_int != ${orgId}`
    );
    if (taken) {
      let counter = 1;
      let candidate = `${providedSlug}-${counter}`;
      while (
        await dbSelectValue(
          sql`SELECT 1 FROM organizations WHERE slug = ${candidate} AND id_int != ${orgId}`
        )
      ) {
        counter++;
        candidate = `${providedSlug}-${counter}`;
      }
      finalSlug = candidate;
    } else {
      finalSlug = providedSlug;
    }
  }

  await dbUpdate(
    sql`UPDATE organizations SET name = ${name}, profile = ${profile}, ror_id = ${rorId}, doi_prefix = ${doiPrefix}, doi_minting_enabled = ${doiMintingEnabled}, unlisted = ${unlisted}, slug = ${finalSlug} WHERE id_int = ${orgId}`
  );
  return c.json({ org_id: orgId, slug: finalSlug });
});

app.delete("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const org = await getOrgByIdentifier(slug);
  if (!org) return c.json({ error: "Org not found" }, 404);
  const orgId = org["id_int"] as number;
  if (!(await canEdit(orgId, userId)))
    return c.json({ error: "Permission denied" }, 403);

  await dbUpdate(
    sql`UPDATE organizations SET state = 'DELETED' WHERE id_int = ${orgId}`
  );
  await Promise.all([
    dbUpdate(sql`DELETE FROM org_user_map WHERE org_id_int = ${orgId}`),
    dbUpdate(sql`DELETE FROM org_publication_map WHERE org_id_int = ${orgId}`),
  ]);
  return c.json({ org_id: orgId, slug: org["slug"] });
});

export default app;
