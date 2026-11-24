import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(import.meta.dirname, ".env") });

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3003";
const backendURL = process.env.VITE_BACKEND_URL ?? "http://localhost:7001";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/admin.json",
      },
      dependencies: ["setup"],
    },
  ],
  // admin-ui is a client-only SPA (ssr: false) that proxies /api to backend-ts,
  // so both servers need to be up for anything past the login screen to work.
  webServer: [
    {
      command: "pnpm --filter @raven/backend-ts dev",
      cwd: REPO_ROOT,
      url: `${backendURL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "pipe",
    },
    {
      command: "pnpm --filter @raven/admin-ui dev",
      cwd: REPO_ROOT,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "pipe",
    },
  ],
});
