import { defineConfig } from "vitest/config";

export default defineConfig({
  // Tests run in Vite's SSR environment, which ignores top-level resolve.conditions.
  // Setting these replaces Vitest's SSR defaults, so they are repeated here.
  ssr: {
    resolve: {
      conditions: ["@raven/backend-source", "node", "development|production"],
    },
  },
  test: {
    fileParallelism: false,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8", // or 'istanbul'
    },
  },
});
