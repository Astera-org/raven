import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { getConfig, initConfig } from "./config.js";
import { closeDb, initDb } from "./db/index.js";
import { closePgDb, initPgDb } from "./db/pg-db.js";
import { configureLogLevel, logger } from "./lib/logger.js";
import { initBoss, stopBoss } from "./lib/queue/pg-boss.js";
import { registerTasks } from "./lib/tasks/register-tasks.js";

const SHUTDOWN_TIMEOUT_MS = 5000;
// Leaves room for the DB pools to close before the forced exit.
const BOSS_STOP_TIMEOUT_MS = 4000;

async function main(): Promise<void> {
  initConfig(process.env.RAVEN_CONFIG || undefined);
  configureLogLevel();
  const cfg = getConfig();
  logger.info(
    {
      environment: cfg.ENVIRONMENT,
      serverPort: cfg.SERVER_PORT,
      serverDebug: cfg.SERVER_DEBUG,
      logLevel: cfg.LOG_LEVEL,
    },
    "Starting Raven backend"
  );

  if (!cfg.PG_DATABASE_URI) {
    throw new Error("PG_DATABASE_URI is not set");
  }

  initDb();
  initPgDb();
  await registerTasks(await initBoss());

  const app = createApp();
  const port = cfg.SERVER_PORT ?? 7001;

  const server = serve({ fetch: app.fetch, port }, (info) => {
    logger.info({ port: info.port }, "Raven backend listening");
  });

  let shuttingDown = false;

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("Shutting down...");
    // Installing signal handlers disables Node's default exit-on-signal, so
    // a hung close must not leave the process running.
    setTimeout(() => {
      logger.error("Shutdown timed out, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
    server.close();
    await stopBoss(BOSS_STOP_TIMEOUT_MS);
    await Promise.all([closeDb(), closePgDb()]);
    await new Promise<void>((resolve) => logger.flush(() => resolve()));
    process.exit(0);
  };

  const handleSignal = (): void => {
    shutdown().catch((e) => {
      logger.error({ err: e }, "Error during shutdown");
      process.exit(1);
    });
  };

  process.on("SIGTERM", handleSignal);
  process.on("SIGINT", handleSignal);
}

main().catch((e) => {
  logger.error({ err: e }, "Failed to start server");
  // Not process.exit(1): pino's multistream has no flush(cb), so exiting
  // immediately drops log lines still buffered in the gate streams. Letting
  // the event loop drain writes them; the timer only forces the exit if open
  // handles (e.g. a started pg-boss) would otherwise keep the process alive.
  process.exitCode = 1;
  setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
});
