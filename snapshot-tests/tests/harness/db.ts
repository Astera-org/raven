/**
 * Database lifecycle for the snapshot harness.
 *
 * Responsibilities:
 *  - Start MySQL and Postgres Testcontainers (one each per Vitest worker).
 *    Postgres sits alongside MySQL for the pg-boss job queue.
 *  - Create one or more empty databases (one per target).
 *  - Apply the backend-ts Drizzle migrations against each database to
 *    produce a schema that matches production exactly.
 *  - Provide truncate + SQL fixture loading hooks called between tests.
 *  - Optionally (HARNESS_INTROSPECT_AFTER_MIGRATE=1) run `drizzle-kit
 *    introspect` against the freshly-migrated database and refresh
 *    backend-ts/src/db/{schema,relations}.ts from it.
 *
 * Worker-scoped: `setupDatabases()` is invoked once per worker slot from
 * the Vitest global setup (`setup.ts`), and every test file that slot runs
 * reconnects to the same databases with `connectDatabase()`.
 */

import { migrate, migratePg } from "@raven/backend-ts/migrate";
import {
  MySqlContainer,
  type StartedMySqlContainer,
} from "@testcontainers/mysql";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import mysql, { type Connection, type Pool } from "mysql2/promise";
import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { env } from "./env.ts";

const ROOT_PASSWORD = "harness_root";
const MYSQL_USER = "harness";
const MYSQL_PASSWORD = "harness";
const PG_USER = "harness";
const PG_PASSWORD = "harness";
const PG_DATABASE = "harness";

// Inside the dev container we use docker-in-docker; containers' published
// ports are reachable on localhost, not the Docker bridge gateway address
// Testcontainers would otherwise auto-detect.
if (!process.env.TESTCONTAINERS_HOST_OVERRIDE) {
  process.env.TESTCONTAINERS_HOST_OVERRIDE = "localhost";
}

export interface DbHandle {
  /** Database name (e.g. "backend_test_1234_1"). */
  name: string;
  /** Per-database connection pool for the harness to use directly. */
  pool: Pool;
  /** URI for handing to backend-ts via raven.toml. */
  databaseUri: string;
  /**
   * Postgres URI for backend-ts's PG_DATABASE_URI. Shared by all targets in a
   * worker; unset when no target needs Postgres.
   */
  pgDatabaseUri?: string;
}

export interface MysqlEndpoint {
  host: string;
  port: number;
  user: string;
  password: string;
}

export interface DbCluster {
  endpoint: MysqlEndpoint;
  /** Map of logical target id -> database handle. */
  databases: Record<string, DbHandle>;
  /** Stop the underlying containers (no-op for external databases). */
  stop(): Promise<void>;
}

/**
 * Spin up MySQL (and Postgres when `withPostgres` is set) and create the
 * requested databases. Each database gets Drizzle migrations applied so
 * the schema matches production.
 *
 * `targets` maps a logical target id (e.g. "backend") -> desired DB name.
 */
export async function setupDatabases(
  targets: Record<string, string>,
  { withPostgres }: { withPostgres: boolean }
): Promise<DbCluster> {
  const [{ endpoint, stop: stopMysql }, pg] = await Promise.all([
    startMysql(),
    withPostgres ? startPostgres() : undefined,
  ]);
  const stop = async () => {
    await Promise.all([stopMysql(), pg?.stop()]);
  };

  if (pg) {
    await migratePg(pg.pgDatabaseUri);
  }

  // Connect as root once to provision the per-target databases and grants.
  const root = await mysql.createConnection({
    host: endpoint.host,
    port: endpoint.port,
    user: "root",
    password: ROOT_PASSWORD,
    multipleStatements: true,
    timezone: "Z",
  });
  try {
    for (const dbName of Object.values(targets)) {
      await root.query(
        `CREATE DATABASE IF NOT EXISTS \`${dbName}\` ` +
          `CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
      await root.query(
        `GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${MYSQL_USER}'@'%'`
      );
    }
    await root.query("FLUSH PRIVILEGES");
  } finally {
    await root.end();
  }

  const databases: Record<string, DbHandle> = {};
  let introspected = false;
  for (const [targetId, dbName] of Object.entries(targets)) {
    const databaseUri = `mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@${endpoint.host}:${endpoint.port}/${dbName}`;

    await applyMigrationsDrizzle(databaseUri);
    if (env.freezeSchema) {
      await freezeSchema(endpoint, dbName);
    }

    // All targets share an identically-migrated schema, so one introspect
    // pass (against whichever database finishes migrating first) is enough.
    if (env.introspectAfterMigrate && !introspected) {
      await introspectDatabase(endpoint, dbName);
      introspected = true;
    }

    databases[targetId] = connectDatabase(endpoint, {
      name: dbName,
      databaseUri,
      pgDatabaseUri: pg?.pgDatabaseUri,
    });
  }

  return { endpoint, databases, stop };
}

/** Open a connection pool to a database `setupDatabases` already created. */
export function connectDatabase(
  endpoint: MysqlEndpoint,
  db: Omit<DbHandle, "pool">
): DbHandle {
  const pool = mysql.createPool({
    host: endpoint.host,
    port: endpoint.port,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: db.name,
    connectionLimit: 4,
    multipleStatements: true,
    timezone: "Z",
  });
  return { ...db, pool };
}

async function startMysql(): Promise<{
  endpoint: MysqlEndpoint;
  stop: () => Promise<void>;
}> {
  if (env.externalMysql) {
    const u = new URL(env.externalMysql);
    const endpoint: MysqlEndpoint = {
      host: u.hostname,
      port: Number(u.port || 3306),
      user: u.username || "root",
      password: u.password,
    };
    return { endpoint, stop: async () => {} };
  }

  try {
    const started: StartedMySqlContainer = await new MySqlContainer("mysql:8.0")
      .withRootPassword(ROOT_PASSWORD)
      .withUsername(MYSQL_USER)
      .withUserPassword(MYSQL_PASSWORD)
      .withDatabase("harness_init")
      .withCommand([
        "--character-set-server=utf8mb4",
        "--collation-server=utf8mb4_unicode_ci",
        "--log-bin-trust-function-creators=1",
      ])
      .withStartupTimeout(120_000)
      .start();

    const endpoint: MysqlEndpoint = {
      host: started.getHost(),
      port: started.getPort(),
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
    };

    return {
      endpoint,
      stop: async () => {
        await started.stop({ remove: true, removeVolumes: true });
      },
    };
  } catch (error) {
    throw new Error("Check that Docker is running!", { cause: error });
  }
}

async function startPostgres(): Promise<{
  pgDatabaseUri: string;
  stop: () => Promise<void>;
}> {
  if (env.externalPostgres) {
    return { pgDatabaseUri: env.externalPostgres, stop: async () => {} };
  }

  try {
    const started: StartedPostgreSqlContainer = await new PostgreSqlContainer(
      "postgres:18"
    )
      .withUsername(PG_USER)
      .withPassword(PG_PASSWORD)
      .withDatabase(PG_DATABASE)
      .withStartupTimeout(120_000)
      .start();

    return {
      pgDatabaseUri: started.getConnectionUri(),
      stop: async () => {
        await started.stop({ remove: true, removeVolumes: true });
      },
    };
  } catch (error) {
    throw new Error("Check that Docker is running!", { cause: error });
  }
}

async function applyMigrationsDrizzle(databaseUri: string): Promise<void> {
  const conn = await mysql.createConnection({
    uri: databaseUri,
    multipleStatements: true,
  });
  try {
    const freezePath = await findLatestSchemaFreeze();
    if (freezePath) {
      await conn.query(await readFile(freezePath, "utf8"));
    }
    await migrate(conn, true);
  } finally {
    await conn.end();
  }
}

/**
 * Locate the newest `<n>_snapshot.sql` freeze under
 * `snapshot-tests/migrations/frozen/` (produced by `freezeSchema` below,
 * and then hand-placed). Loading it before `migrate()` runs seeds the schema
 * and the `__drizzle_migrations` bookkeeping rows for every migration up to
 * that point in one shot, so Drizzle only has to apply migrations newer
 * than the freeze instead of replaying the whole history per test worker.
 */
async function findLatestSchemaFreeze(): Promise<string | undefined> {
  const metaDir = env.frozenMigrationsDir;
  let entries: string[];
  try {
    entries = await readdir(metaDir);
  } catch {
    return undefined;
  }
  const snapshots = entries.filter((f) => /^\d+_snapshot\.sql$/.test(f)).sort();
  const latest = snapshots.at(-1);
  return latest ? resolve(metaDir, latest) : undefined;
}

/**
 * `DELIMITER` is a `mysql`-CLI-only meta-command (it tells the interactive
 * client to split statements on `;;` instead of `;` so routine/trigger
 * bodies containing semicolons read as one chunk) -- the server itself has
 * no such keyword. mysqldump wraps every routine/trigger in a
 * `DELIMITER ;;` / `DELIMITER ;` pair for that reason, but the frozen
 * snapshot is replayed via `mysql2`'s `multipleStatements`, which sends the
 * text straight to the server and chokes on the literal `DELIMITER` lines.
 * The server's own multi-statement parser already handles semicolons inside
 * `BEGIN...END` correctly, so it's safe to just drop the `DELIMITER` lines
 * and collapse each routine's doubled trailing `;;` back to a single `;`.
 */
function stripDelimiterBlocks(sql: string): string {
  return sql
    .replace(/^DELIMITER ;;\r?\n/gm, "")
    .replace(/^DELIMITER ;\r?\n/gm, "")
    .replace(/;;$/gm, ";");
}

/**
 * Dump the just-migrated (still empty apart from `__drizzle_migrations`)
 * database to `backend-ts/schema.sql` via `mysqldump`. Gated behind
 * `HARNESS_FREEZE_SCHEMA=1` -- see `env.freezeSchema`.
 */
async function freezeSchema(
  endpoint: MysqlEndpoint,
  dbName: string
): Promise<void> {
  const outPath = resolve(
    env.repoRoot,
    "backend-ts",
    `schema.${dbName}.${process.pid}.sql`
  );
  await new Promise<void>((resolve_, reject) => {
    const child = spawn(
      "mysqldump",
      [
        // mysqldump treats host "localhost" as a signal to use the local
        // unix socket instead of TCP, silently ignoring -P. Force TCP since
        // the Testcontainers port is only reachable that way.
        "--protocol=TCP",
        "-h",
        endpoint.host,
        "-P",
        String(endpoint.port),
        "-u",
        MYSQL_USER,
        `-p${MYSQL_PASSWORD}`,
        dbName,
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (b: Buffer) => out.push(b));
    child.stderr.on("data", (b: Buffer) => err.push(b));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        const dump = stripDelimiterBlocks(Buffer.concat(out).toString("utf8"));
        writeFile(outPath, dump)
          .then(() => resolve_())
          .catch(reject);
      } else {
        reject(
          new Error(
            `mysqldump exited with code ${code ?? "null"}\n` +
              `stderr:\n${Buffer.concat(err).toString()}`
          )
        );
      }
    });
  });
}

/**
 * Spawn a command, surfacing its output in the thrown error on failure so
 * problems are easy to debug.
 */
async function runCommand(
  command: string,
  args: string[],
  opts: { cwd: string; envOverrides?: Record<string, string> }
): Promise<void> {
  await new Promise<void>((resolve_, reject) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.envOverrides },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (b: Buffer) => out.push(b));
    child.stderr.on("data", (b: Buffer) => err.push(b));
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve_();
      } else {
        const stdout = Buffer.concat(out).toString();
        const stderr = Buffer.concat(err).toString();
        reject(
          new Error(
            `${command} ${args.join(" ")} exited with code ${code ?? "null"}\n` +
              `stdout:\n${stdout}\nstderr:\n${stderr}`
          )
        );
      }
    });
  });
}

/**
 * Run `drizzle-kit introspect` against the harness's own Testcontainer
 * database and write the result into backend-ts/src/db. All connection
 * details are passed explicitly on the CLI (not via the checked-in
 * drizzle.config.ts) so this can never accidentally target a real
 * database -- it only ever sees the ephemeral container this run created.
 */
async function introspectDatabase(
  endpoint: MysqlEndpoint,
  dbName: string
): Promise<void> {
  const url = `mysql://${endpoint.user}:${endpoint.password}@${endpoint.host}:${endpoint.port}/${dbName}`;
  await runCommand(
    "npx",
    [
      "drizzle-kit",
      "introspect",
      "--dialect",
      "mysql",
      "--out",
      ".",
      "--url",
      url,
    ],
    { cwd: env.apiV1Dir }
  );
}

/**
 * Delete the raven.toml that `writeMinimalToml` wrote for the given tag and
 * pid (defaults to `process.pid`), along with the OUT_DIR and IMG_DIR it
 * pointed the server at. Best-effort — errors are swallowed.
 */
export async function deleteMinimalToml(
  tag: string,
  pid: number = process.pid
): Promise<void> {
  const paths = [
    resolve(env.tmpDir, `raven.${tag}.${pid}.toml`),
    minimalTomlOutDir(tag, pid),
    minimalTomlImgDir(tag, pid),
  ];
  await Promise.all(
    paths.map((path) =>
      rm(path, { recursive: true, force: true }).catch(() => {
        // Best-effort; we're shutting down.
      })
    )
  );
}

function minimalTomlOutDir(tag: string, pid: number = process.pid): string {
  return `/tmp/raven-harness-${tag}-${pid}/`;
}

/** The IMG_DIR `writeMinimalToml` configures for the given tag. */
export function minimalTomlImgDir(
  tag: string,
  pid: number = process.pid
): string {
  return `/tmp/raven-harness-${tag}-imgs-${pid}/`;
}

/** Write a minimal raven.toml configured with the given DATABASE_URI. */
export async function writeMinimalToml(
  databaseUri: string,
  tag: string,
  overrides: Record<string, string | number | boolean> = {}
): Promise<string> {
  await mkdir(env.tmpDir, { recursive: true });
  const path = resolve(env.tmpDir, `raven.${tag}.${process.pid}.toml`);

  const lines: string[] = [
    `DATABASE_URI = ${JSON.stringify(databaseUri)}`,
    `SERVER_HOST = "127.0.0.1"`,
    `SERVER_DEBUG = false`,
    `JWT_SECRET_KEY = "harness-secret-do-not-use-in-production"`,
    `OUT_DIR = ${JSON.stringify(minimalTomlOutDir(tag))}`,
    `IMG_DIR = ${JSON.stringify(minimalTomlImgDir(tag))}`,
  ];
  for (const [k, v] of Object.entries(overrides)) {
    lines.push(`${k} = ${JSON.stringify(v)}`);
  }
  await writeFile(path, lines.join("\n") + "\n");
  return path;
}

/**
 * Reset a database: truncate the user tables a previous test touched, leave
 * the migration bookkeeping table intact, then optionally load SQL fixtures.
 */
export async function resetDatabase(
  db: DbHandle,
  fixtureStems: readonly string[] = []
): Promise<void> {
  const conn = await db.pool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    try {
      for (const table of await findDirtyTables(conn)) {
        // For a small number of rows, this out-performs `TRUNCATE`
        await conn.query(`DELETE FROM \`${table}\``);
        await conn.query(`ALTER TABLE \`${table}\` AUTO_INCREMENT = 1`);
      }
    } finally {
      await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    }
  } finally {
    conn.release();
  }

  for (const stem of fixtureStems) {
    await loadFixture(db, stem);
  }
}

/**
 * Tables that hold rows or whose AUTO_INCREMENT has moved off 1. TRUNCATE is
 * DDL that recreates the table (~1s across the whole schema), so only these
 * are reset; fixtures still rely on TRUNCATE restarting ids at 1, which a
 * plain DELETE wouldn't do.
 */
async function findDirtyTables(conn: mysql.PoolConnection): Promise<string[]> {
  // information_schema caches AUTO_INCREMENT for a day by default.
  await conn.query("SET SESSION information_schema_stats_expiry = 0");
  const [tables] = await conn.query<mysql.RowDataPacket[]>(
    "SELECT TABLE_NAME AS name, AUTO_INCREMENT AS autoIncrement " +
      "FROM information_schema.TABLES " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' " +
      "AND TABLE_NAME <> ?",
    ["__drizzle_migrations"]
  );
  const dirty = new Set<string>(
    tables
      .filter((t) => t.autoIncrement !== null && Number(t.autoIncrement) > 1)
      .map((t) => t.name as string)
  );
  const unchecked = tables
    .map((t) => t.name as string)
    .filter((name) => !dirty.has(name));
  if (unchecked.length > 0) {
    const [withRows] = await conn.query<mysql.RowDataPacket[]>(
      unchecked
        .map((name) => `(SELECT '${name}' AS name FROM \`${name}\` LIMIT 1)`)
        .join(" UNION ALL ")
    );
    for (const row of withRows) dirty.add(row.name as string);
  }
  return [...dirty];
}

async function loadFixture(db: DbHandle, stem: string): Promise<void> {
  const path = resolve(env.fixtureDir, `${stem}.sql`);
  let sql: string;
  try {
    sql = await readFile(path, "utf8");
  } catch (cause) {
    throw new Error(`Fixture not found: ${path}`, { cause });
  }
  // mysql2 with multipleStatements: true can run a whole .sql file in one shot.
  // We rely on fixtures being plain SQL (no DELIMITER blocks); if we ever need
  // routines/triggers, switch to a real splitter.
  const conn: Connection = await db.pool.getConnection();
  try {
    await conn.query(sql);
  } finally {
    (conn as unknown as { release: () => void }).release();
  }
}
