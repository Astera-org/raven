/**
 * Starting and stopping the per-worker-slot harness: containers,
 * migrations and target servers. Kept apart from the runner because the
 * Vitest global setup runs it in the main process, where Vitest's test APIs
 * can't be loaded.
 */

import {
  deleteMinimalToml,
  setupDatabases,
  type DbCluster,
  type DbHandle,
  type MysqlEndpoint,
} from "./db.ts";
import { env } from "./env.ts";
import { startBackend, type RunningTarget } from "./targets.ts";
// ---------------------------------------------------------------------------
/** Id of the backend-ts target in `WorkerHarness.targets`. */
export const TARGET_ID = "backend";

// Per-worker harness (DB cluster + running targets). The global setup starts
// one per worker slot and tears it down after the run; each test file
// attaches to its slot's harness.
// ---------------------------------------------------------------------------
export interface WorkerHarness {
  cluster: DbCluster;
  targets: Record<string, RunningTarget>;
}

export interface StartedHarness extends WorkerHarness {
  slot: number;
}

declare module "vitest" {
  export interface ProvidedContext {
    harnesses: HarnessInfo[];
  }
}

/**
 * Boot a full harness (containers, migrations, target servers) for one
 * worker slot. Called from the Vitest global setup, once per slot.
 */
export async function startHarness(slot: number): Promise<StartedHarness> {
  const id = TARGET_ID;
  // An external server brings its own Postgres (pg-boss).
  const withPostgres = env.backendBaseUrl === undefined;
  const cluster = await setupDatabases(
    { [id]: `${id}_test_${process.pid}_${slot}` },
    { withPostgres }
  );

  const targets: Record<string, RunningTarget> = {
    [id]: await startBackend({ id, db: cluster.databases[id]!, slot }),
  };

  return { slot, cluster, targets };
}

export async function stopHarness(h: StartedHarness): Promise<void> {
  for (const t of Object.values(h.targets)) {
    try {
      await t.stop();
    } catch {
      // Best-effort; we're shutting down.
    }
    if (t.configTag) {
      await deleteMinimalToml(t.configTag);
    }
  }
  await closePools(h);
  try {
    await h.cluster.stop();
  } catch {
    // Best-effort.
  }
}

/** The parts of a started harness a test file needs to reach it. */
export interface HarnessInfo {
  endpoint: MysqlEndpoint;
  databases: Record<string, Omit<DbHandle, "pool">>;
  targets: Record<string, Pick<RunningTarget, "config" | "imgDir">>;
}

export function describeHarness(h: StartedHarness): HarnessInfo {
  return {
    endpoint: h.cluster.endpoint,
    databases: Object.fromEntries(
      Object.entries(h.cluster.databases).map(
        ([id, { pool: _pool, ...db }]) => [id, db]
      )
    ),
    targets: Object.fromEntries(
      Object.entries(h.targets).map(([id, { config, imgDir }]) => [
        id,
        { config, imgDir },
      ])
    ),
  };
}

export async function closePools(h: WorkerHarness): Promise<void> {
  for (const db of Object.values(h.cluster.databases)) {
    try {
      await db.pool.end();
    } catch {
      // Best-effort.
    }
  }
}
