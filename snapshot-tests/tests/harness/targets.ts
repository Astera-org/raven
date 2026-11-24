/**
 * Target lifecycle: start backend-ts as a subprocess pointed at a
 * harness-managed database.
 *
 * One target instance per worker. The harness keeps the
 * server alive for the whole worker lifetime; tests reset DB state between
 * runs without restarting the server (see Option 3 in the design doc).
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { minimalTomlImgDir, writeMinimalToml, type DbHandle } from "./db.ts";
import { env } from "./env.ts";
import type { TargetConfig } from "./types.ts";

export interface RunningTarget {
  config: TargetConfig;
  /** Tag passed to `writeMinimalToml`; used by teardown to delete the file. Absent when no toml was written. */
  configTag?: string;
  /** IMG_DIR the server serves files from. Absent for an external server. */
  imgDir?: string;
  /** Kill the subprocess and wait for it to exit. */
  stop(): Promise<void>;
}

export interface StartTargetOpts {
  /** Stable id used to look the target up in the harness. */
  id: string;
  /** Database the server should connect to. */
  db: DbHandle;
  /** Worker slot; keeps config files apart when slots boot side by side. */
  slot: number;
}

/**
 * Boot (or attach to) the backend-ts target.
 *
 *  - Default: spawn the TypeScript v0 backend-ts server
 *    (`tsx --conditions=@raven/backend-source src/index.ts`)
 *    on a free port, pointed at the harness-managed DB via a generated
 *    raven.toml. The harness owns the lifecycle and shuts it down at exit.
 *  - `HARNESS_BACKEND_URL`: attach to an externally-managed server at the
 *    given URL instead. The external server is expected to read the DB
 *    URI written to `.harness-tmp/backend-db.uri.<pid>`.
 */
export async function startBackend(
  opts: StartTargetOpts
): Promise<RunningTarget> {
  const { id } = opts;
  if (env.backendBaseUrl !== undefined) {
    await writeBackendDbHint(opts.db);
    const healthUrl = env.backendBaseUrl + "/health";
    await waitForHealth(healthUrl, () => {});
    return {
      config: { id, baseUrl: env.backendBaseUrl, dbName: opts.db.name },
      // External server: the harness doesn't own its lifecycle, only the hint.
      stop: deleteBackendDbHint,
    };
  }
  return await startV0Backend(opts);
}

/**
 * Spawn the TypeScript v0 backend-ts server on a free port, pointed at the
 * harness-managed database: pick a port, write a minimal raven.toml, spawn
 * the process, wait for /health to respond.
 */
async function startV0Backend(opts: StartTargetOpts): Promise<RunningTarget> {
  const { id } = opts;
  if (!opts.db.pgDatabaseUri) {
    throw new Error(`Target ${id} needs Postgres, but none was provisioned`);
  }
  const port = await pickFreePort();
  const configTag = `v0-${id}-${opts.slot}`;
  const configPath = await writeMinimalToml(opts.db.databaseUri, configTag, {
    SERVER_PORT: port,
    PG_DATABASE_URI: opts.db.pgDatabaseUri,
  });

  // Use `npm exec tsx` so we resolve tsx from backend-ts's own node_modules.
  // Spawning from the backend-ts cwd keeps relative imports working.
  const child = spawn(
    "npm",
    ["exec", "--", "tsx", "--conditions=@raven/backend-source", "src/index.ts"],
    {
      cwd: env.apiV1Dir,
      env: {
        ...process.env,
        RAVEN_CONFIG: configPath,
        // Env overrides raven.toml, and the devcontainer exports a shared one.
        PG_DATABASE_URI: opts.db.pgDatabaseUri,
        NODE_ENV: "test",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  const logs: Buffer[] = [];
  const tee = (b: Buffer) => {
    logs.push(b);
    if (logs.length > 200) logs.shift();
  };
  child.stdout.on("data", tee);
  child.stderr.on("data", tee);

  let exited = false;
  let exitInfo: { code: number | null; signal: NodeJS.Signals | null } | null =
    null;
  child.once("exit", (code, signal) => {
    exited = true;
    exitInfo = { code, signal };
  });

  const baseUrl = `http://127.0.0.1:${port}/api`;
  const healthUrl = `http://127.0.0.1:${port}/api/health`;
  try {
    await waitForHealth(healthUrl, () => {
      if (exited) {
        const tail = Buffer.concat(logs).toString();
        throw new Error(
          `v0 backend-ts server exited before becoming healthy ` +
            `(code=${exitInfo?.code ?? "?"}, signal=${exitInfo?.signal ?? "?"})\n${tail}`
        );
      }
    });
  } catch (err) {
    await killChild(child);
    throw err;
  }

  return {
    config: { id, baseUrl, dbName: opts.db.name },
    configTag,
    imgDir: minimalTomlImgDir(configTag),
    stop: () => {
      if (env.logServerOutput) {
        const tail = Buffer.concat(logs).toString();
        console.error(`Node API server logs:\n${tail}`);
      }
      return killChild(child);
    },
  };
}

/**
 * Drop the database URI the external backend-ts server should connect to
 * into a sentinel file. Useful for wrapper scripts that boot the server
 * before invoking the harness.
 */
async function writeBackendDbHint(db: DbHandle): Promise<void> {
  await mkdir(env.tmpDir, { recursive: true });
  await writeFile(backendDbHintPath(), db.databaseUri + "\n");
}

async function deleteBackendDbHint(): Promise<void> {
  await rm(backendDbHintPath(), { force: true });
}

function backendDbHintPath(): string {
  return resolve(env.tmpDir, `backend-db.uri.${process.pid}`);
}

/**
 * Ask the OS for an unused TCP port by binding to :0 and reading back the
 * assigned port. There's an unavoidable race between releasing the port
 * here and the server claiming it, but in practice it's reliable.
 */
async function pickFreePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr === null || typeof addr === "string") {
        srv.close();
        reject(new Error("Failed to allocate a port"));
        return;
      }
      const port = addr.port;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForHealth(
  healthUrl: string,
  checkAlive: () => void,
  timeoutMs = 60_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    checkAlive();
    try {
      const res = await fetch(healthUrl, {
        signal: AbortSignal.timeout(3_000),
      });
      if (res.ok) return;
      lastErr = new Error(`Health check returned status ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Server at ${healthUrl} did not become healthy within ${timeoutMs}ms: ${String(lastErr)}`
  );
}

async function killChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    // Force-kill if the server doesn't exit promptly.
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    }, 5_000).unref();
  });
}
