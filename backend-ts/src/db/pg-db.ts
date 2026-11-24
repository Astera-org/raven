import { getConfig } from "#src/config.js";
import { logger } from "#src/lib/logger.js";
import { type Logger } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export type RavenPgDb = NodePgDatabase & {
  $client: Pool;
};
export type RavenPgDbTx = Parameters<
  Parameters<RavenPgDb["transaction"]>[0]
>[0];
export type RavenPgDbClient = RavenPgDb | RavenPgDbTx;

let _pgPool: Pool | null = null;
let _pgDb: RavenPgDb | null = null;

export function getPgDb(): RavenPgDb {
  if (!_pgDb)
    throw new Error(
      "Postgres database not initialized. Call initPgDb() first."
    );
  return _pgDb;
}

class RavenPgLogger implements Logger {
  logQuery(query: string, params: unknown[]): void {
    logger.debug({ query, params }, "postgres-db");
  }
}

export function initPgDb() {
  _pgPool = new Pool({
    connectionString: getConfig().PG_DATABASE_URI,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 30_000,
    idle_in_transaction_session_timeout: 60_000,
    application_name: "raven",
    options: "-c TimeZone=UTC",
  });
  _pgDb = drizzle({
    client: _pgPool,
    schema: {},
    casing: "snake_case",
    // See initDb(): keep query params out of the production file log.
    logger: getConfig().SERVER_DEBUG ? new RavenPgLogger() : undefined,
  });
  return _pgDb;
}

export async function closePgDb() {
  if (_pgPool) {
    await _pgPool.end();
    _pgPool = null;
    _pgDb = null;
  }
}
