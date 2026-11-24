import { initConfig } from "#src/config.js";
import { _applyDevGoogleDocsOriginOverride } from "#src/lib/importers/helpers/apply-dev-google-docs-origin-override.js";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

describe("_applyDevGoogleDocsOriginOverride", () => {
  const url = "https://docs.google.com/document/d/abc/export?format=html";

  beforeAll(() => {
    initConfig("tests/raven.test.toml");
  });

  afterEach(() => {
    delete process.env.DEV_GOOGLE_DOCS_ORIGIN_OVERRIDE;
    delete process.env.ENVIRONMENT;
    initConfig("tests/raven.test.toml");
  });

  it("leaves URLs unchanged when no override is configured", () => {
    expect(_applyDevGoogleDocsOriginOverride(url)).toBe(url);
  });

  it("swaps the origin of docs.google.com URLs, keeping path and query", () => {
    process.env.DEV_GOOGLE_DOCS_ORIGIN_OVERRIDE = "http://localhost:4322";
    initConfig("tests/raven.test.toml");
    expect(_applyDevGoogleDocsOriginOverride(url)).toBe(
      "http://localhost:4322/document/d/abc/export?format=html"
    );
    expect(
      _applyDevGoogleDocsOriginOverride("https://example.com/document/d/abc")
    ).toBe("https://example.com/document/d/abc");
  });

  it("is ignored in production", () => {
    process.env.DEV_GOOGLE_DOCS_ORIGIN_OVERRIDE = "http://localhost:4322";
    process.env.ENVIRONMENT = "production";
    initConfig("tests/raven.test.toml");
    expect(_applyDevGoogleDocsOriginOverride(url)).toBe(url);
  });
});
