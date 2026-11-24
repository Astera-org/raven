import { createApp } from "#src/app.js";
import { initConfig } from "#src/config.js";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

let tempDir: string | null = null;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

function setUpConfig(): void {
  tempDir = mkdtempSync(join(tmpdir(), "raven-cors-"));
  const configPath = join(tempDir, "raven.toml");
  writeFileSync(
    configPath,
    `
DATABASE_URI = "mysql://raven:raven@localhost:3306/raven"
BASE_URL_WEB = "https://app.example.com"
BASE_URL_ADMIN = "https://admin.example.com"
BASE_URL_API = "https://api.example.com/api"
ENVIRONMENT = "test"
`
  );
  initConfig(configPath);
}

async function preflightAllowOrigin(origin: string): Promise<string | null> {
  const app = createApp();
  const res = await app.request("/api/orgs", {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "GET",
    },
  });
  return res.headers.get("access-control-allow-origin");
}

describe("CORS allowlist", () => {
  it("allows the web frontend origin", async () => {
    setUpConfig();
    expect(await preflightAllowOrigin("https://app.example.com")).toBe(
      "https://app.example.com"
    );
  });

  it("allows the admin frontend origin", async () => {
    setUpConfig();
    expect(await preflightAllowOrigin("https://admin.example.com")).toBe(
      "https://admin.example.com"
    );
  });

  it("rejects an untrusted origin", async () => {
    setUpConfig();
    expect(await preflightAllowOrigin("https://evil.example.com")).toBeNull();
  });
});
