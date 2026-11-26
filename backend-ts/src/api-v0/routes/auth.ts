import { getConfig } from "#src/config.js";
import { getDb } from "#src/db/index.js";
import type { AppEnv } from "#src/types/hono.js";
import {
  canCreatePublications,
  dbDateStringToIso,
  getSessionUserId,
  isOrgAdminAnywhere,
  NO_SESSION_MSG,
  SIGN_IN_ENDPOINTS,
  userBelongsToOrgs,
} from "#v0/lib/rutils.js";
import { contactUsAllowedOrgs } from "#v0/routes/contact-us.js";
import { sql } from "drizzle-orm";
import { Hono, type Context } from "hono";

const app = new Hono<AppEnv>();

type Row = Record<string, unknown>;

function buildUserPayload(row: Row): Record<string, unknown> {
  return {
    id: row["id_int"],
    username: row["username"],
    email: row["email"],
    first_name: row["first_name"],
    last_name: row["last_name"],
    avatar: row["avatar"],
    profile: row["profile"],
    orcid: row["orcid"],
    state: row["state"],
    created_at: dbDateStringToIso(row["created_at"] as string | null),
    updated_at: dbDateStringToIso(row["updated_at"] as string | null),
    login_at: dbDateStringToIso(row["login_at"] as string | null),
  };
}

// The legacy JWT sign-in flow is gone: better-auth (`/api/auth2/*`) is the
// only way to sign in, and its sessions are the only ones routes accept.
function removed(guidance: string) {
  return (c: Context) =>
    c.json({ error: `This endpoint has been removed. ${guidance}` }, 410);
}

app.post(
  "/register",
  removed("Use /api/auth2/sign-up/email, which enforces email verification.")
);
app.post("/login", removed(`Use ${SIGN_IN_ENDPOINTS}.`));
app.post(
  "/refresh",
  removed(
    `It has no replacement, since better-auth sessions are extended as they're used. Sign in via ${SIGN_IN_ENDPOINTS} for a session.`
  )
);
app.post("/change_password", removed("Use /api/auth2/change-password."));
app.post("/logout", removed("Use /api/auth2/sign-out."));

app.get("/me", async (c) => {
  const userId = await getSessionUserId(c);
  const config = getConfig();
  if (!userId) return c.json({ msg: NO_SESSION_MSG }, 401);

  const [rows] = (await getDb().execute(
    sql`SELECT id_int, username, email, first_name, last_name, image as avatar, profile, orcid, state, created_at, updated_at, login_at FROM users WHERE id_int = ${userId} LIMIT 1`
  )) as unknown as [Row[]];
  const row = rows[0];
  if (!row) return c.json({ error: "User not found" }, 404);

  const payload = buildUserPayload(row);
  if (
    await canCreatePublications(row["id_int"] as number, String(row["state"]))
  ) {
    payload["can_create_publications"] = true;
  }
  if (await isOrgAdminAnywhere(row["id_int"] as number)) {
    payload["is_org_admin"] = true;
  }
  if (config.LINEAR_API_KEY && config.LINEAR_TEAM_ID) {
    const allowedOrgs = contactUsAllowedOrgs();
    if (
      allowedOrgs.includes("*") ||
      (await userBelongsToOrgs(userId, allowedOrgs))
    ) {
      payload["can_contact_us"] = true;
    }
  }
  return c.json({ user: payload });
});

export default app;
