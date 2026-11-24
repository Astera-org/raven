/**
 * Idempotent init script: creates a test user account that does not belong
 * to any organizations.
 *
 * Configured entirely via env vars so it can run unattended as part of
 * container startup:
 *   TEST_USER_USERNAME    (required — skips setup entirely if unset)
 *   TEST_USER_PASSWORD    (required — skips setup entirely if unset)
 *   TEST_USER_EMAIL       optional, defaults to "<TEST_USER_USERNAME>@raven.local"
 *   TEST_USER_FIRST_NAME  optional, defaults to "E2E"
 *   TEST_USER_LAST_NAME   optional, defaults to "Test User"
 *
 * Safe to run on every container start: it looks up existing rows by
 * username/slug before inserting, so re-running it is a no-op once the
 * test user exists.
 */
import { initConfig } from "#src/config.js";
import { closeDb, getDb, initDb } from "#src/db/index.js";
import * as schema from "#src/db/schema.js";
import { hashPassword } from "#src/lib/utils/hashing.js";
import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";

async function main() {
  initConfig(process.env.RAVEN_CONFIG || undefined);

  const username = process.env.TEST_USER_USERNAME?.trim();
  const password = process.env.TEST_USER_PASSWORD;

  if (!username || !password) {
    // eslint-disable-next-line no-console
    console.log(
      "TEST_USER_USERNAME/TEST_USER_PASSWORD not set, skipping test user setup."
    );
    return;
  }

  const email =
    process.env.TEST_USER_EMAIL?.trim() || `${username}@raven.local`;
  const firstName = process.env.TEST_USER_FIRST_NAME?.trim() || "E2E";
  const lastName = process.env.TEST_USER_LAST_NAME?.trim() || "Test User";

  initDb();
  const db = getDb();

  try {
    // --- Test user ---------------------------------------------------
    let testUser = (
      await db
        .select({
          id: schema.users.id,
          idInt: schema.users.idInt,
          email: schema.users.email,
          state: schema.users.state,
        })
        .from(schema.users)
        .where(eq(schema.users.username, username))
        .limit(1)
    )[0];

    let hashedPassword: string | undefined;

    if (testUser) {
      if (testUser.state !== "ACTIVE" || testUser.email !== email) {
        throw new Error(
          `TEST_USER_USERNAME "${username}" is already used by an unexpected account.`
        );
      }
      // eslint-disable-next-line no-console
      console.log(`Test user "${username}" already exists, skipping.`);
    } else {
      hashedPassword = await hashPassword(password);
      const userId = ulid();
      await db.insert(schema.users).values({
        id: userId,
        name: `${firstName} ${lastName}`,
        email,
        emailVerified: true,
        username,
        firstName,
        lastName,
        approved: true,
        state: "ACTIVE",
      });

      testUser = (
        await db
          .select({
            id: schema.users.id,
            idInt: schema.users.idInt,
            email: schema.users.email,
            state: schema.users.state,
          })
          .from(schema.users)
          .where(eq(schema.users.id, userId))
          .limit(1)
      )[0]!;

      // eslint-disable-next-line no-console
      console.log(`Created test user "${username}" (${email}).`);
    }

    // Reconcile this independently from user creation so a rerun repairs a
    // failure that occurred after the user row was committed.
    const credentialAccount = (
      await db
        .select({ id: schema.accounts.id })
        .from(schema.accounts)
        .where(
          and(
            eq(schema.accounts.userId, testUser.id),
            eq(schema.accounts.providerId, "credential")
          )
        )
        .limit(1)
    )[0];

    if (!credentialAccount) {
      hashedPassword ??= await hashPassword(password);
      await db.insert(schema.accounts).values({
        id: ulid(),
        accountId: testUser.id,
        providerId: "credential",
        userId: testUser.id,
        password: hashedPassword,
      });
      // eslint-disable-next-line no-console
      console.log(`Created credential account for "${username}".`);
    }
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to seed test user:", err);
  process.exit(1);
});
