import { getConfig } from "#src/config.js";
import { logger } from "#src/lib/logger.js";
import { type Logger } from "drizzle-orm";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as relations from "./relations.js";
import * as schema from "./schema.js";

const dbSchema = { ...schema, ...relations };

export type RavenDb = MySql2Database<typeof dbSchema> & {
  $client: mysql.Pool;
};
export type RavenDbTx = Parameters<Parameters<RavenDb["transaction"]>[0]>[0];
export type RavenDbClient = RavenDb | RavenDbTx;

let _pool: mysql.Pool | null = null;
let _lockPool: mysql.Pool | null = null;
let _db: RavenDb | null = null;

export function getDb(): RavenDb {
  if (!_db) throw new Error("Database not initialized. Call initDb() first.");
  return _db;
}

class RavenDbLogger implements Logger {
  logQuery(query: string, params: unknown[]): void {
    logger.debug({ query, params }, "mysql");
  }
}

/**
 * A separate pool for MySQL named-lock sessions. Requests waiting in
 * GET_LOCK hold a connection for the whole wait, so taking those from the
 * main pool could leave the lock holder without one for its own queries.
 */
export function getLockPool(): mysql.Pool {
  if (!_pool) throw new Error("Database not initialized. Call initDb() first.");
  _lockPool ??= mysql.createPool({
    uri: getConfig().DATABASE_URI,
    waitForConnections: true,
    connectionLimit: 10,
    multipleStatements: false,
    timezone: "Z",
  });
  return _lockPool;
}

export function initDb() {
  _pool = mysql.createPool({
    uri: getConfig().DATABASE_URI,
    waitForConnections: true,
    connectionLimit: 20,
    multipleStatements: false,
    timezone: "Z",
  });
  _db = drizzle(_pool, {
    schema: dbSchema,
    mode: "default",
    // The file log sink records debug in production, so bound params
    // (tokens, emails, hashes) must never reach the logger there.
    logger: getConfig().SERVER_DEBUG ? new RavenDbLogger() : undefined,
  });
  return _db;
}

export async function closeDb() {
  if (_lockPool) {
    await _lockPool.end();
    _lockPool = null;
  }
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}
