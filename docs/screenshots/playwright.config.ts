import { defineConfig } from "@playwright/test";

import {
  ADMIN_UI_BASE_URL,
  ADMIN_UI_DIR,
  BACKEND_URL,
  STACKS_BASE_URL,
  STACKS_FRONTEND_DIR,
  USER_STORAGE_STATE,
} from "./src/env";

export default defineConfig({
  testDir: "./shots",
  globalSetup: "./src/global-setup.ts",
  forbidOnly: !!process.env.CI,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL: STACKS_BASE_URL,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "UTC",
    contextOptions: { reducedMotion: "reduce" },
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /seed\.setup\.ts/ },
    {
      name: "screenshots",
      testMatch: /.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { storageState: USER_STORAGE_STATE },
    },
    // The Stacks' visual regression fixtures, seeded only by
    // `pnpm seed:visual-fixtures`.
    {
      name: "visual-fixtures-accounts",
      testMatch: /visual-fixtures-accounts\.setup\.ts/,
    },
    {
      name: "visual-fixtures",
      testMatch: /visual-fixtures\.setup\.ts/,
      dependencies: ["visual-fixtures-accounts"],
    },
  ],
  // Only the frontends: the backend is the docker-compose deployment.
  webServer: [
    {
      command: "pnpm dev --port 3005",
      cwd: STACKS_FRONTEND_DIR,
      url: STACKS_BASE_URL,
      env: { VITE_BACKEND_URL: BACKEND_URL },
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: "pnpm dev --port 3006",
      cwd: ADMIN_UI_DIR,
      url: ADMIN_UI_BASE_URL,
      env: { VITE_BACKEND_URL: BACKEND_URL },
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
