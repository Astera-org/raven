import { initConfig } from "#src/config.js";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

let tempDir: string | null = null;

afterEach(() => {
  vi.restoreAllMocks();
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("config defaults", () => {
  it("uses defaults for fallback-backed values when TOML contains empty strings", () => {
    tempDir = mkdtempSync(join(tmpdir(), "raven-config-"));
    const configPath = join(tempDir, "raven.toml");
    writeFileSync(
      configPath,
      `
DATABASE_URI = "mysql://raven:raven@localhost:3306/raven"
BASE_URL_WEB = "https://example.com/"
BASE_URL_API = "https://api.example.com/api/"
ENVIRONMENT = "test"
SERVER_HOST = ""
SERVER_PORT = ""
SERVER_DEBUG = true
JWT_SECRET_KEY = ""
OUT_DIR = ""
IMG_DIR = ""
DATACITE_API = ""
DATACITE_NAME = ""
DATACITE_PASSWORD = ""
DATACITE_PREFIX = ""
DATACITE_PUBLISHER = ""
ORCID_CLIENT_ID = ""
ORCID_CLIENT_SECRET = ""
ORCID_USE_SANDBOX = false
GOOGLE_CLIENT_ID = ""
GOOGLE_CLIENT_SECRET = ""
AWS_S3_BUCKET_NAME = ""
AWS_ACCESS_KEY_ID = ""
AWS_SECRET_ACCESS_KEY = ""
AWS_REGION = ""
PDF_QUEUE_URL = ""
MAILGUN_API_KEY = ""
TEST_RECIPIENT_EMAIL_ADDRESS = ""
`
    );

    const cfg = initConfig(configPath);

    expect(cfg.DATABASE_URI).toBe("mysql://raven:raven@localhost:3306/raven");
    expect(cfg.SERVER_HOST).toBe("0.0.0.0");
    expect(cfg.SERVER_PORT).toBe(7001);
    expect(cfg.JWT_SECRET_KEY).toBe("dev-secret-key-change-in-production");
    expect(cfg.OUT_DIR).toBe("out/");
    expect(cfg.IMG_DIR).toBe("imgs/");
    expect(cfg.DATACITE_API).toBe("https://api.datacite.org/dois");
    expect(cfg.DATACITE_PUBLISHER).toBe(
      process.env.DATACITE_PUBLISHER || "The Stacks"
    );
    expect(cfg.AWS_REGION).toBe("us-west-2");
    expect(cfg.DATACITE_NAME).toBe("");
    expect(cfg.AWS_S3_ENDPOINT).toBe("");
    expect(cfg.AWS_S3_PUBLIC_ENDPOINT).toBe("");
    expect(cfg.AWS_S3_PUBLIC_BASE_URL).toBe("");
  });

  it("requires email verification unless turned off", () => {
    tempDir = mkdtempSync(join(tmpdir(), "raven-config-"));
    const configPath = join(tempDir, "raven.toml");
    const base = `
DATABASE_URI = "mysql://raven:raven@localhost:3306/raven"
BASE_URL_WEB = "https://example.com/"
BASE_URL_API = "https://api.example.com/api/"
ENVIRONMENT = "test"
`;
    writeFileSync(configPath, base);
    expect(initConfig(configPath).REQUIRE_EMAIL_VERIFICATION).toBe(true);

    writeFileSync(configPath, `${base}REQUIRE_EMAIL_VERIFICATION = false\n`);
    expect(initConfig(configPath).REQUIRE_EMAIL_VERIFICATION).toBe(false);
  });

  it("falls back AWS_S3_PUBLIC_ENDPOINT to AWS_S3_ENDPOINT when unset", () => {
    tempDir = mkdtempSync(join(tmpdir(), "raven-config-"));
    const configPath = join(tempDir, "raven.toml");
    writeFileSync(
      configPath,
      `
DATABASE_URI = "mysql://raven:raven@localhost:3306/raven"
BASE_URL_WEB = "https://example.com/"
BASE_URL_API = "https://api.example.com/api/"
ENVIRONMENT = "test"
AWS_S3_ENDPOINT = "http://garage:3900"
`
    );

    const cfg = initConfig(configPath);
    expect(cfg.AWS_S3_ENDPOINT).toBe("http://garage:3900");
    expect(cfg.AWS_S3_PUBLIC_ENDPOINT).toBe("http://garage:3900");
  });

  it("keeps AWS_S3_PUBLIC_ENDPOINT independent when explicitly set", () => {
    tempDir = mkdtempSync(join(tmpdir(), "raven-config-"));
    const configPath = join(tempDir, "raven.toml");
    writeFileSync(
      configPath,
      `
DATABASE_URI = "mysql://raven:raven@localhost:3306/raven"
BASE_URL_WEB = "https://example.com/"
BASE_URL_API = "https://api.example.com/api/"
ENVIRONMENT = "test"
AWS_S3_ENDPOINT = "http://garage:3900"
AWS_S3_PUBLIC_ENDPOINT = "http://localhost:3900"
`
    );

    const cfg = initConfig(configPath);
    expect(cfg.AWS_S3_ENDPOINT).toBe("http://garage:3900");
    expect(cfg.AWS_S3_PUBLIC_ENDPOINT).toBe("http://localhost:3900");
  });

  it("reads AWS_S3_PUBLIC_BASE_URL without a trailing slash and independently of the endpoints", () => {
    tempDir = mkdtempSync(join(tmpdir(), "raven-config-"));
    const configPath = join(tempDir, "raven.toml");
    writeFileSync(
      configPath,
      `
DATABASE_URI = "mysql://raven:raven@localhost:3306/raven"
BASE_URL_WEB = "https://example.com/"
BASE_URL_API = "https://api.example.com/api/"
ENVIRONMENT = "test"
AWS_S3_ENDPOINT = "http://localhost:3900"
AWS_S3_PUBLIC_BASE_URL = "http://raven-dev-media.web.localhost:3902/"
`
    );

    const cfg = initConfig(configPath);
    expect(cfg.AWS_S3_PUBLIC_BASE_URL).toBe(
      "http://raven-dev-media.web.localhost:3902"
    );
    expect(cfg.AWS_S3_PUBLIC_ENDPOINT).toBe("http://localhost:3900");
  });

  describe("MEDIA_MAX_BYTES", () => {
    const base = `
DATABASE_URI = "mysql://raven:raven@localhost:3306/raven"
BASE_URL_WEB = "https://example.com/"
BASE_URL_API = "https://api.example.com/api/"
ENVIRONMENT = "test"
`;
    const defaultBytes = 350 * 1024 * 1024;

    function configWith(line: string) {
      tempDir = mkdtempSync(join(tmpdir(), "raven-config-"));
      const configPath = join(tempDir, "raven.toml");
      writeFileSync(configPath, `${base}${line}\n`);
      return initConfig(configPath);
    }

    it("keeps a positive value without warning", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(configWith("MEDIA_MAX_BYTES = 1024").MEDIA_MAX_BYTES).toBe(1024);
      expect(warn).not.toHaveBeenCalled();
    });

    it.each(["0", "-1", '"lots"'])(
      "warns and falls back to the default for %s",
      (value) => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        expect(configWith(`MEDIA_MAX_BYTES = ${value}`).MEDIA_MAX_BYTES).toBe(
          defaultBytes
        );
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining("MEDIA_MAX_BYTES must be a positive number")
        );
      }
    );
  });
});
