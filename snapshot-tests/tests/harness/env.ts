/**
 * Centralized harness configuration sourced from environment variables.
 *
 * Kept tiny on purpose: any code path that needs a setting should pull it
 * from here so it's easy to find when we add new knobs.
 */

import { resolve } from "node:path";

// tests/harness/env.ts -> tests/harness -> tests -> snapshot-tests -> repo root
const SNAPSHOT_TESTS_DIR = resolve(import.meta.dirname, "..", "..");
const REPO_ROOT = resolve(SNAPSHOT_TESTS_DIR, "..");

export const env = {
  logServerOutput: process.env.HARNESS_LOG_SERVER_OUTPUT === "1",

  /** Repo root (the actual git root, parent of the-stacks/). */
  repoRoot: REPO_ROOT,

  /** The backend-ts package; spawned as the server under test. */
  apiV1Dir: resolve(REPO_ROOT, "backend-ts"),

  /** Where to write per-run temp files (configs, logs). */
  tmpDir: resolve(SNAPSHOT_TESTS_DIR, ".harness-tmp"),

  /** Snapshot store. Checked into git as the regression baseline. */
  snapshotDir: resolve(SNAPSHOT_TESTS_DIR, "tests", "snapshots"),

  /** SQL fixture files. */
  fixtureDir: resolve(SNAPSHOT_TESTS_DIR, "tests", "fixtures"),

  /** Frozen SQL migrations dir. */
  frozenMigrationsDir: resolve(SNAPSHOT_TESTS_DIR, "migrations", "frozen"),

  /**
   * Skip Testcontainers and use an externally-managed MySQL instance.
   * Useful for fast local iteration. Format: mysql://user:pass@host:port
   * (no database -- the harness creates its own ephemeral DB).
   */
  externalMysql: process.env.HARNESS_MYSQL_URL || undefined,

  /**
   * Skip the Postgres Testcontainer and use an externally-managed instance.
   * Format: postgres://user:pass@host:port/db. Used as-is, so every worker
   * shares that one database.
   */
  externalPostgres: process.env.HARNESS_PG_URL || undefined,

  /**
   * Optional override pointing at an externally-managed backend-ts
   * server. When set, the harness will not spawn its own instance; the external server is responsible for connecting
   * to the harness-managed database (its connection string is written
   * to `.harness-tmp/backend-db.uri.<pid>` on bootstrap).
   *
   * When unset (the default), the harness spawns backend-ts via tsx and
   * configures it via a generated raven.toml pointed at the harness DB.
   */
  backendBaseUrl: process.env.HARNESS_BACKEND_URL || undefined,

  /**
   * Opt-in: right after Drizzle migrations are applied (before any fixture
   * or test data is written), dump the database via `mysqldump` so it can be
   * copied/renamed into `snapshot-tests/migrations/frozen/<n>_snapshot.sql`
   * for faster subsequent Drizzle test DB setup. Set `HARNESS_FREEZE_SCHEMA=1`.
   */
  freezeSchema: process.env.HARNESS_FREEZE_SCHEMA === "1",

  /**
   * Opt-in: right after migrations are applied to the harness database,
   * run `drizzle-kit introspect` against it and write the result into
   * backend-ts/src/db. This only ever points at the harness's own
   * Testcontainer database -- never a shared or production one -- so it's
   * a safe way to regenerate schema.ts/relations.ts from a DB that's
   * guaranteed to match what the Drizzle migrations actually produce.
   * Set `HARNESS_INTROSPECT_AFTER_MIGRATE=1` and diff the result before
   * committing. Off by default.
   */
  introspectAfterMigrate: process.env.HARNESS_INTROSPECT_AFTER_MIGRATE === "1",
};

export type HarnessEnv = typeof env;
