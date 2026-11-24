import { getConfig } from "#src/config.js";
import { logger } from "#src/lib/logger.js";
import { PgBoss } from "pg-boss";

let _boss: PgBoss | null = null;

export function getPgBossConfig({
  connectionString,
  migrate = false,
}: {
  connectionString: string;
  migrate?: boolean;
}) {
  return {
    connectionString,
    migrate,
    // Uses a listener rather than 2s polling
    useListenNotify: true,
    application_name: "Raven PG Boss",
  };
}

export function getBoss(): PgBoss {
  if (!_boss)
    throw new Error("PG Boss not initialized. Call initBoss() first.");
  return _boss;
}

export async function initBoss() {
  if (_boss) {
    return _boss;
  }

  _boss = new PgBoss(
    getPgBossConfig({ connectionString: getConfig().PG_DATABASE_URI })
  );
  // An unhandled 'error' event would crash the process on any Postgres hiccup.
  _boss.on("error", (err) => logger.error({ err }, "pg-boss error"));
  await _boss.start();
  return _boss;
}

export async function stopBoss(timeoutMs: number) {
  if (!_boss) return;
  await _boss.stop({ graceful: true, timeout: timeoutMs });
  _boss = null;
}
