import { escape } from "mysql2";
import mysql from "mysql2/promise";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach } from "vitest";

const DATABASE_URI =
  "mysql://raven_test:raven_test@localhost:3307/raven_test?charset=utf8mb4";

// Truncating this would make the backend re-run every migration on restart.
const MIGRATIONS_TABLE = "__drizzle_migrations";

let pool: mysql.Pool;

export async function query<
  T extends Record<string, unknown> = Record<string, unknown>,
>(statement: string): Promise<T[]> {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(statement);
  return rows as T[];
}

export async function execute(
  statement: string
): Promise<{ insertId: number; result: mysql.ResultSetHeader }> {
  const [result] = await pool.execute<mysql.ResultSetHeader>(statement);
  return { insertId: result.insertId, result };
}

/** Stands in for the link in the verification email, which tests never receive. */
export async function markEmailVerified(email: string): Promise<void> {
  await execute(
    `UPDATE users SET email_verified = TRUE WHERE email = ${escape(email)}`
  );
}

export const TEST_PASSWORD = "password123";
// better-auth's scrypt hash of TEST_PASSWORD, taken from a real sign-up.
const TEST_PASSWORD_HASH =
  "fa2f840763e73626c69bd90b36bd9b07:70f9bfb0307241d63da810bd6493400c6437d57a2cc7ecd23d5d0e522d9342ec6ff79f4eb880372fb014620f8f1944c543474ea2e5a996618d5a4aa8185213ae";

/** The user better-auth's sign-up returns, as of the seeded rows. */
export type SeededUser = {
  id: string;
  idInt: number;
  username: string;
  displayUsername: string;
  email: string;
  emailVerified: true;
  name: string;
  firstName: string;
  lastName: string;
  image: string | null;
  profile: string | null;
  orcid: string | null;
  approved: boolean;
  state: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Writes the rows better-auth's sign-up would, with the email already
 * verified. Sign-up hashes the password, which dominated test time; signing
 * in still verifies it against the precomputed hash.
 */
export async function seedVerifiedUser(user: {
  username: string;
  email: string;
  password: string;
  name: string;
  firstName: string;
  lastName: string;
}): Promise<SeededUser> {
  if (user.password !== TEST_PASSWORD) {
    throw new Error(`Seeded users must use the password "${TEST_PASSWORD}"`);
  }
  const hash = escape(TEST_PASSWORD_HASH);
  // `users.password` is only read by the legacy `/api/auth/login`.
  const { insertId } = await execute(`
    INSERT INTO users (username, display_username, email, email_verified, name, first_name, last_name, approved, state, password, created_at, updated_at)
    VALUES (${escape(user.username.toLowerCase())}, ${escape(user.username)}, ${escape(user.email.toLowerCase())}, TRUE, ${escape(user.name)}, ${escape(user.firstName)}, ${escape(user.lastName)}, FALSE, 'ACTIVE', ${hash}, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
  `);
  await execute(`
    INSERT INTO accounts (id, account_id, provider_id, user_id, password, created_at, updated_at)
    SELECT ULID(), id, 'credential', id, ${hash}, created_at, updated_at FROM users WHERE id_int = ${insertId}
  `);

  const [row] = await query(`SELECT * FROM users WHERE id_int = ${insertId}`);
  return {
    id: row!.id as string,
    idInt: insertId,
    username: row!.username as string,
    displayUsername: row!.display_username as string,
    email: row!.email as string,
    emailVerified: true,
    name: row!.name as string,
    firstName: row!.first_name as string,
    lastName: row!.last_name as string,
    image: row!.image as string | null,
    profile: row!.profile as string | null,
    orcid: row!.orcid as string | null,
    approved: Boolean(row!.approved),
    state: row!.state as string,
    createdAt: (row!.created_at as Date).toISOString(),
    updatedAt: (row!.updated_at as Date).toISOString(),
  };
}

/**
 * Writes a better-auth session for `userId`, skipping sign-in's password
 * check. Send the token as a bearer token: better-auth signs unsigned ones.
 * Skips sign-in's hooks too, so `users.login_at` and the session's metadata
 * stay unset.
 */
export async function seedSession(
  userId: string
): Promise<{ id: string; token: string }> {
  const token = randomBytes(24).toString("hex");
  await execute(`
    INSERT INTO sessions (id, token, user_id, expires_at, created_at, updated_at)
    VALUES (ULID(), ${escape(token)}, ${escape(userId)}, UTC_TIMESTAMP(3) + INTERVAL 7 DAY, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
  `);
  const [row] = await query<{ id: string }>(
    `SELECT id FROM sessions WHERE token = ${escape(token)}`
  );
  return { id: row!.id, token };
}

export async function waitForRows<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  statement: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<T[]> {
  const { timeoutMs = 1000, intervalMs = 25 } = opts;
  const start = Date.now();
  for (;;) {
    const rows = await query<T>(statement);
    if (rows.length > 0) return rows;
    if (Date.now() - start >= timeoutMs) return rows;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

let tables: string[];

// DELETE rather than TRUNCATE: TRUNCATE is DDL that recreates each table, which
// costs ~1s per reset across the schema versus a few ms for DELETE on the
// handful of rows a test leaves behind.
async function cleanDb(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of tables) await conn.query(`DELETE FROM \`${table}\``);
  } finally {
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    conn.release();
  }
}

beforeAll(async () => {
  pool = mysql.createPool({
    uri: DATABASE_URI,
    waitForConnections: true,
    connectionLimit: 5,
    multipleStatements: false,
    timezone: "Z",
  });
  const rows = await query<Record<string, string>>("SHOW TABLES");
  tables = rows
    .map((row) => Object.values(row)[0])
    .filter(
      (table): table is string =>
        table !== undefined && table !== MIGRATIONS_TABLE
    );
});

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await pool.end();
});
