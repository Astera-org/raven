import { sql } from "drizzle-orm";
import { type MySql2Database } from "drizzle-orm/mysql2";
import type mysql from "mysql2/promise";

/**
 * Bootstrap the __drizzle_migrations table for an existing Raven database.
 *
 * This should run before any Drizzle migrations so migration 0000 is treated as the
 * baseline schema and is skipped.
 *
 * For a brand-new empty database, set GENERATE_DB_FROM_SCRATCH="true" and apply the
 * baseline schema separately.
 */
export async function bootstrapDrizzleMigrations(
  db: MySql2Database<Record<string, never>> & {
    $client: mysql.Connection;
  }
) {
  // Create the __drizzle_migrations table if it doesn't exist
  // This table tracks which migrations have been applied
  await db.execute(
    sql`
      CREATE TABLE IF NOT EXISTS \`__drizzle_migrations\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`hash\` text NOT NULL,
        \`created_at\` bigint,
        CONSTRAINT \`__drizzle_migrations_id\` PRIMARY KEY(\`id\`)
      )
    `
  );

  // Table exists, check if it has any records
  const [row] = await db.execute(
    sql`SELECT COUNT(*) as count FROM \`__drizzle_migrations\``
  );
  const typedRow = row as unknown as Array<{ count: number }>;

  // Skip insert - this shouldn't happen though
  if (!typedRow) return;

  const tableCheck = typedRow[0];

  // Skip insert
  if (tableCheck && tableCheck.count > 0) {
    return;
  }

  // eslint-disable-next-line no-console
  console.log("Bootstrapping drizzle table...");

  // Insert an initial migration record to mark the baseline state
  // The hash corresponds to your first migration (e.g., schema/initial.sql)
  // The created_at is the timestamp in milliseconds
  await db.execute(
    sql`
      INSERT INTO \`__drizzle_migrations\` (\`hash\`, \`created_at\`) 
      VALUES (
        '392906aac205a6201adcbfb55d25e4add1664b9a7f02eecee13ccdc072987232',
        1782156313348
      )
    `
  );
}
