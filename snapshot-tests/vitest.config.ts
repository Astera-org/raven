import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@harness": resolve(__dirname, "tests/harness"),
    },
  },
  test: {
    include: ["tests/cases/**/*.test.ts"],
    // Per-worker isolation: each worker slot gets its own MySQL container +
    // backend-ts process, started once by the global setup and shared by
    // every file that slot runs (see tests/harness/setup.ts). Using forks
    // (default in vitest 2.x) is important so process-level globals stay isolated.
    globalSetup: ["tests/harness/setup.ts"],
    pool: "forks",
    poolOptions: {
      forks: {
        // Cap concurrency so we don't spawn too many MySQL containers at once.
        // Tune up once we have more endpoints under test.
        maxForks: 2,
        minForks: 1,
      },
    },
    // Files within a worker run sequentially -- tests reset DB state between
    // each test, which would race if tests in the same worker ran in parallel.
    fileParallelism: true,
    sequence: { concurrent: false },
    // Container boot + migrations + server startup can take a while on cold start.
    hookTimeout: 120_000,
    testTimeout: 30_000,
    reporters: ["default"],
  },
});
