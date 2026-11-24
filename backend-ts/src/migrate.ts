import { drizzle } from "drizzle-orm/mysql2";
import { migrate as drizzleMigrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PgBoss } from "pg-boss";
import { initConfig } from "./config.js";
import { getPgBossConfig } from "./lib/queue/pg-boss.js";
import { addUlidFunctions } from "./migrate/migrate-add-ulid-functions.js";
import { bootstrapDrizzleMigrations } from "./migrate/migrate-skip-0000-migration.js";

const drizzleDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "drizzle"
);

export async function migrate(
  conn: mysql.Connection,
  generateFromScratch: boolean = false
) {
  const db = drizzle(conn);

  // TypeScript pre-migrations
  if (!generateFromScratch) {
    await bootstrapDrizzleMigrations(db);
  }
  await addUlidFunctions(db);

  // eslint-disable-next-line no-console
  console.log("Running MySQL migrations...");
  await drizzleMigrate(db, {
    migrationsFolder: join(drizzleDir, "migrations"),
  });

  // eslint-disable-next-line no-console
  console.log("MySQL migrations complete.");
}

export async function migratePg(uriString: string) {
  // eslint-disable-next-line no-console
  console.log("Running Postgres migrations...");

  const boss = new PgBoss(
    getPgBossConfig({ connectionString: uriString, migrate: true })
  );
  await boss.start();
  await boss.stop();

  // eslint-disable-next-line no-console
  console.log("Postgres migrations complete.");
}

if (
  import.meta.filename &&
  realpathSync(process.argv[1]!) === realpathSync(import.meta.filename)
) {
  const cfg = initConfig(process.env.RAVEN_CONFIG || undefined);

  // CREATE FUNCTION requires SUPER (or log_bin_trust_function_creators) when
  // binary logging is on, which the app's normal runtime user shouldn't need.
  // So migrations connect as a separate, more privileged user.
  const migrationDatabaseUri = cfg.MIGRATION_DATABASE_URI.trim();
  if (migrationDatabaseUri) {
    const conn = await mysql.createConnection(migrationDatabaseUri);
    try {
      await migrate(conn, process.env.GENERATE_DB_FROM_SCRATCH === "true");
    } finally {
      await conn.end();
    }
  } else {
    // eslint-disable-next-line no-console
    console.log("MIGRATION_DATABASE_URI not set, skipping MySQL migrations.");
  }

  const pgDatabaseUri = cfg.MIGRATION_PG_DATABASE_URI;
  if (pgDatabaseUri) {
    await migratePg(pgDatabaseUri);
  } else {
    // eslint-disable-next-line no-console
    console.log("PG_DATABASE_URI not set, skipping Postgres migrations.");
  }
}
