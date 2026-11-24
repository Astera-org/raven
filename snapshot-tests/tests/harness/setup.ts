/**
 * Vitest global setup: start one harness (containers, migrations, target
 * servers) per worker slot, before any test file runs, and stop them all
 * after the run. Test files attach to their slot's harness through
 * `bootstrapWorker()`, so the ~20s boot is paid once per slot instead of
 * once per file.
 */

import { availableParallelism } from "node:os";
import type { TestProject } from "vitest/node";
import {
  describeHarness,
  startHarness,
  stopHarness,
  type StartedHarness,
} from "./harness.ts";

export default async function setup(project: TestProject) {
  const slots = Array.from(
    { length: countWorkerSlots(project) },
    (_, i) => i + 1
  );
  const results = await Promise.allSettled(slots.map(startHarness));
  const started = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);
  const stopAll = async () => {
    await Promise.all(started.map(stopHarness));
  };

  const failed = results.find((r) => r.status === "rejected");
  if (failed) {
    await stopAll();
    throw failed.reason;
  }

  project.provide(
    "harnesses",
    started
      .sort((a: StartedHarness, b: StartedHarness) => a.slot - b.slot)
      .map(describeHarness)
  );
  return stopAll;
}

// Mirrors how Vitest sizes the forks pool, so there is one harness for every
// VITEST_POOL_ID a worker can be given.
function countWorkerSlots(project: TestProject): number {
  const { config } = project;
  const forks = config.poolOptions?.forks;
  if (forks?.singleFork || !config.fileParallelism) return 1;
  return (
    forks?.maxForks ??
    config.maxWorkers ??
    Math.max(availableParallelism() - 1, 1)
  );
}
