/**
 * Idempotent init script: creates a SITE_ADMIN user and a default
 * organization (with that user as an ADMIN member) so there's an org
 * available to host publications out of the box.
 *
 * Configured entirely via env vars so it can run unattended as part of
 * container startup:
 *   ADMIN_USERNAME  (required — skips setup entirely if unset)
 *   ADMIN_PASSWORD  (required — skips setup entirely if unset)
 *   ADMIN_EMAIL       optional, defaults to "<ADMIN_USERNAME>@raven.local"
 *   ADMIN_FIRST_NAME  optional, defaults to "Admin"
 *   ADMIN_LAST_NAME   optional, defaults to "User"
 *   ADMIN_ORG_NAME    optional, defaults to "Default Organization"
 *
 * Safe to run on every container start: it looks up existing rows by
 * username/slug before inserting, so re-running it is a no-op once the
 * admin user and org exist.
 */
import { initConfig } from "#src/config.js";
import { closeDb, getDb, initDb } from "#src/db/index.js";
import * as schema from "#src/db/schema.js";
import { hashPassword } from "#src/lib/utils/hashing.js";
import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/[\s-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "org"
  );
}

async function main() {
  initConfig(process.env.RAVEN_CONFIG || undefined);

  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    // eslint-disable-next-line no-console
    console.log(
      "ADMIN_USERNAME/ADMIN_PASSWORD not set, skipping admin user setup."
    );
    return;
  }

  const email = process.env.ADMIN_EMAIL?.trim() || `${username}@raven.local`;
  const firstName = process.env.ADMIN_FIRST_NAME?.trim() || "Admin";
  const lastName = process.env.ADMIN_LAST_NAME?.trim() || "User";
  const orgName = process.env.ADMIN_ORG_NAME?.trim() || "Default Organization";
  const orgSlug = slugify(orgName);

  initDb();
  const db = getDb();

  try {
    // --- Admin user ---------------------------------------------------
    let adminUser = (
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

    if (adminUser) {
      if (adminUser.state !== "SITE_ADMIN" || adminUser.email !== email) {
        throw new Error(
          `ADMIN_USERNAME "${username}" is already used by an unexpected account.`
        );
      }
      // eslint-disable-next-line no-console
      console.log(`Admin user "${username}" already exists, skipping.`);
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
        state: "SITE_ADMIN",
      });

      adminUser = (
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
      console.log(`Created admin user "${username}" (${email}).`);
    }

    // Reconcile this independently from user creation so a rerun repairs a
    // failure that occurred after the user row was committed.
    const credentialAccount = (
      await db
        .select({ id: schema.accounts.id })
        .from(schema.accounts)
        .where(
          and(
            eq(schema.accounts.userId, adminUser.id),
            eq(schema.accounts.providerId, "credential")
          )
        )
        .limit(1)
    )[0];

    if (!credentialAccount) {
      hashedPassword ??= await hashPassword(password);
      await db.insert(schema.accounts).values({
        id: ulid(),
        accountId: adminUser.id,
        providerId: "credential",
        userId: adminUser.id,
        password: hashedPassword,
      });
      // eslint-disable-next-line no-console
      console.log(`Created credential account for "${username}".`);
    }

    // --- Default host org -----------------------------------------------
    let org = (
      await db
        .select({
          id: schema.organizations.id,
          idInt: schema.organizations.idInt,
          name: schema.organizations.name,
        })
        .from(schema.organizations)
        .where(eq(schema.organizations.slug, orgSlug))
        .limit(1)
    )[0];

    if (org) {
      if (org.name !== orgName) {
        throw new Error(
          `Organization slug "${orgSlug}" is already used by an unexpected organization ("${org.name}").`
        );
      }
      // eslint-disable-next-line no-console
      console.log(`Organization "${orgSlug}" already exists, skipping.`);
    } else {
      const orgId = ulid();
      await db.insert(schema.organizations).values({
        id: orgId,
        name: orgName,
        slug: orgSlug,
        approved: true,
        state: "ACTIVE",
      });

      org = (
        await db
          .select({
            id: schema.organizations.id,
            idInt: schema.organizations.idInt,
            name: schema.organizations.name,
          })
          .from(schema.organizations)
          .where(eq(schema.organizations.id, orgId))
          .limit(1)
      )[0]!;

      // eslint-disable-next-line no-console
      console.log(`Created organization "${orgName}" (slug: ${orgSlug}).`);
    }

    // --- Link admin to org as ADMIN --------------------------------------
    const existingLink = (
      await db
        .select({ orgIdInt: schema.orgUserMap.orgIdInt })
        .from(schema.orgUserMap)
        .where(
          and(
            eq(schema.orgUserMap.orgIdInt, org.idInt),
            eq(schema.orgUserMap.userIdInt, adminUser.idInt)
          )
        )
        .limit(1)
    )[0];

    if (!existingLink) {
      await db.insert(schema.orgUserMap).values({
        orgIdInt: org.idInt,
        orgId: org.id,
        userIdInt: adminUser.idInt,
        userId: adminUser.id,
        roles: ["ADMIN"],
      });
      // eslint-disable-next-line no-console
      console.log(`Added "${username}" as an ADMIN of "${orgName}".`);
    }
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to seed admin user/org:", err);
  process.exit(1);
});
