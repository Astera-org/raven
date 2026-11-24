import { getConfig } from "#src/config.js";
import { getDb } from "#src/db/index.js";
import { hashPassword, verifyPassword } from "#src/lib/utils/hashing.js";
import type { AppEnv } from "#src/types/hono.js";
import {
  generateAccessToken,
  generateTokens,
  verifyToken,
} from "#v0/lib/auth-helpers.js";
import {
  canCreatePublications,
  dbDateStringToIso,
  getSessionUserId,
  isOrgAdminAnywhere,
  userBelongsToOrgs,
} from "#v0/lib/rutils.js";
import { contactUsAllowedOrgs } from "#v0/routes/contact-us.js";
import { hashPassword as baHashPassword } from "better-auth/crypto";
import { sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";

const app = new Hono<AppEnv>();

const MISSING_REQUIRED_FIELDS_MSG = "Missing data for required field.";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

async function dbSelect(query: SQL): Promise<Row[]> {
  const db = getDb();
  const [rows] = (await db.execute(query)) as unknown as [Row[]];
  return rows;
}

async function dbSelectOne(query: SQL): Promise<Row | null> {
  const rows = await dbSelect(query);
  return rows[0] ?? null;
}

async function dbUpdate(query: SQL): Promise<void> {
  const db = getDb();
  await db.execute(query);
}

function setCookies(
  headers: Headers,
  tokens: { access_token: string; refresh_token: string },
  secure: boolean
) {
  const sameSite = "Lax";
  const secureStr = secure ? "; Secure" : "";
  headers.append(
    "Set-Cookie",
    `access_token=${tokens.access_token}; HttpOnly; SameSite=${sameSite}${secureStr}; Path=/; Max-Age=${60 * 60 * 24}`
  );
  headers.append(
    "Set-Cookie",
    `refresh_token=${tokens.refresh_token}; HttpOnly; SameSite=${sameSite}${secureStr}; Path=/; Max-Age=${60 * 60 * 24 * 30}`
  );
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.post("/login", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, string>;
  const username = body["username"]?.trim();
  const password = body["password"];

  if (!username || !password) {
    return c.var.jsonErrors(
      {
        ...(!password && { password: [MISSING_REQUIRED_FIELDS_MSG] }),
        ...(!username && { username: [MISSING_REQUIRED_FIELDS_MSG] }),
      },
      400
    );
  }

  const row = await dbSelectOne(
    sql`SELECT id_int, username, password, email, email_verified, first_name, last_name, image as avatar, profile, orcid, state, created_at, updated_at, login_at FROM users WHERE (username = ${username} OR email = ${username}) LIMIT 1`
  );
  if (
    !row ||
    !(await verifyPassword(password, String(row["password"] ?? "")))
  ) {
    return c.json({ error: "Invalid credentials" }, 401);
  }
  if (getConfig().REQUIRE_EMAIL_VERIFICATION && !row["email_verified"]) {
    return c.json({ error: "Email not verified" }, 403);
  }

  await dbUpdate(
    sql`UPDATE users SET login_at = CURRENT_TIMESTAMP WHERE id_int = ${row["id_int"]}`
  );
  const tokens = await generateTokens(row["id_int"] as number);
  return c.json({ user: buildUserPayload(row), ...tokens });
});

// Sign-up goes through better-auth (`/api/auth2/sign-up/email`), which
// enforces email verification; this route used to bypass it.
app.post("/register", (c) =>
  c.json(
    {
      error:
        "This endpoint has been removed. Sign up via /api/auth2/sign-up/email.",
    },
    410
  )
);

app.post("/refresh", async (c) => {
  const authHeader = c.req.header("Authorization");
  const cookieToken = (() => {
    const m = (c.req.header("cookie") ?? "").match(
      /(?:^|;\s*)refresh_token=([^;]*)/
    );
    return m ? decodeURIComponent(m[1]!) : null;
  })();
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : cookieToken;
  if (!token)
    return c.json(
      {
        msg: 'Missing JWT in headers or cookies (Missing Authorization Header; Missing cookie "refresh_token")',
      },
      401
    );

  const payload = await verifyToken(token);
  if (!payload?.sub || payload.type !== "refresh")
    return c.json({ error: "Invalid token" }, 401);

  const accessToken = await generateAccessToken(parseInt(payload.sub, 10));
  return c.json({ access_token: accessToken });
});

app.post("/change_password", async (c) => {
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const currentPassword =
    typeof body["current_password"] === "string"
      ? body["current_password"]
      : null;
  const newPassword =
    typeof body["new_password"] === "string" ? body["new_password"] : null;

  const errors: Record<string, string[]> = {};
  if (currentPassword === null) {
    errors["current_password"] = [MISSING_REQUIRED_FIELDS_MSG];
  } else if (!currentPassword.trim()) {
    errors["current_password"] = ["Field cannot be blank."];
  }

  if (newPassword === null) {
    errors["new_password"] = [MISSING_REQUIRED_FIELDS_MSG];
  } else if (!newPassword.trim()) {
    errors["new_password"] = ["Field cannot be blank."];
  } else if (newPassword.length < 6 || newPassword.length > 255) {
    errors["new_password"] = ["Length must be between 6 and 255."];
  }

  if (Object.keys(errors).length > 0) {
    return c.var.jsonErrors(errors, 400);
  }

  const row = await dbSelectOne(
    sql`SELECT id_int, id, password FROM users WHERE id_int = ${userId} LIMIT 1`
  );
  if (!row) return c.json({ error: "User not found" }, 404);

  if (
    !(await verifyPassword(currentPassword!, String(row["password"] ?? "")))
  ) {
    return c.json({ error: "Invalid current password" }, 401);
  }

  const hashedPassword = await hashPassword(newPassword!);
  await dbUpdate(
    sql`UPDATE users SET password = ${hashedPassword} WHERE id_int = ${userId}`
  );
  // Keep the better-auth credential account in sync so login via either
  // /api/auth/login or /api/auth2/sign-in/email sees the new password.
  const baHashedPassword = await baHashPassword(newPassword!);
  await dbUpdate(
    sql`UPDATE accounts SET password = ${baHashedPassword}, updated_at = CURRENT_TIMESTAMP(3) WHERE user_id = ${row["id"]} AND provider_id = 'credential'`
  );

  c.var.logger.info({ userId }, "Password reset");
  return c.json({ msg: "Password updated successfully" });
});

app.get("/me", async (c) => {
  const userId = await getSessionUserId(c);
  const config = getConfig();
  if (!userId)
    return c.json(
      {
        msg: 'Missing JWT in headers or cookies (Missing Authorization Header; Missing cookie "access_token")',
      },
      401
    );

  const row = await dbSelectOne(
    sql`SELECT id_int, username, email, first_name, last_name, image as avatar, profile, orcid, state, created_at, updated_at, login_at FROM users WHERE id_int = ${userId} LIMIT 1`
  );
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

app.post("/logout", () => {
  const cfg = getConfig();
  const secure = !cfg.SERVER_DEBUG;
  const headers = new Headers();
  setCookies(headers, { access_token: "", refresh_token: "" }, secure);
  return new Response(JSON.stringify({ msg: "logged out" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...Object.fromEntries(headers),
    },
  });
});

export default app;
