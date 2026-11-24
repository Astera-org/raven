import { initConfig } from "#src/config.js";
import {
  ImporterError,
  type ImportedPublicationInput,
} from "@raven/core-import-format";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const importGoogleDoc = vi.fn<() => Promise<ImportedPublicationInput>>();
vi.mock("@raven/importer-google-docs-markdown", () => ({ importGoogleDoc }));

const { runGoogleDocImport } =
  await import("#src/lib/importers/run-google-doc-import.js");

// MySQL column limits are in bytes, not characters.
const TEXT_MAX_BYTES = 65_535;
const MEDIUMTEXT_MAX_BYTES = 16_777_215;
// 3 bytes in UTF-8, so a string of these is far shorter in characters than bytes.
const EYES = "🫪";

const url = new URL("https://docs.google.com/document/d/abc/edit");

function rawImport(
  version: Partial<ImportedPublicationInput["version"]> = {},
  importDocumentBody = "<html></html>"
): ImportedPublicationInput {
  return {
    version: { title: "Title", body: "Body", ...version },
    importDocument: { format: "gdoc", body: importDocumentBody },
  };
}

function runImport() {
  return runGoogleDocImport({ url, signal: new AbortController().signal });
}

describe("runGoogleDocImport field sizes", () => {
  beforeAll(() => {
    initConfig("tests/raven.test.toml");
  });

  beforeEach(() => {
    importGoogleDoc.mockReset();
  });

  it("accepts an abstract that exactly fills a TEXT column", async () => {
    importGoogleDoc.mockResolvedValue(
      rawImport({ abstract: "a".repeat(TEXT_MAX_BYTES) })
    );
    await expect(runImport()).resolves.toBeDefined();
  });

  it("rejects an abstract one byte over a TEXT column", async () => {
    importGoogleDoc.mockResolvedValue(
      rawImport({ abstract: "a".repeat(TEXT_MAX_BYTES + 1) })
    );
    await expect(runImport()).rejects.toThrow(ImporterError);
  });

  it("rejects a multibyte abstract under the limit in characters but over it in bytes", async () => {
    const abstract = EYES.repeat(Math.ceil((TEXT_MAX_BYTES + 1) / 3));
    expect(abstract.length).toBeLessThan(TEXT_MAX_BYTES);
    importGoogleDoc.mockResolvedValue(rawImport({ abstract }));
    await expect(async () => {
      const res = await runImport();
      return {
        ...res,
        version: { ...res.version, abstract: "<<<LONG STRING>>" },
      };
    }).rejects.toThrow(ImporterError);
  });

  it("accepts a body that exactly fills a MEDIUMTEXT column", async () => {
    importGoogleDoc.mockResolvedValue(
      rawImport({ body: "a".repeat(MEDIUMTEXT_MAX_BYTES) })
    );
    await expect(runImport()).resolves.toBeDefined();
  });

  it("rejects a body one byte over a MEDIUMTEXT column", async () => {
    importGoogleDoc.mockResolvedValue(
      rawImport({ body: "a".repeat(MEDIUMTEXT_MAX_BYTES + 1) })
    );
    await expect(async () => {
      const res = await runImport();
      return {
        ...res,
        version: { ...res.version, body: "<<<LONG STRING>>" },
      };
    }).rejects.toThrow(ImporterError);
  });

  it("rejects a multibyte body under the limit in characters but over it in bytes", async () => {
    const body = EYES.repeat(Math.ceil((MEDIUMTEXT_MAX_BYTES + 1) / 3));
    expect(body.length).toBeLessThan(MEDIUMTEXT_MAX_BYTES);
    importGoogleDoc.mockResolvedValue(rawImport({ body }));
    await expect(async () => {
      const res = await runImport();
      return {
        ...res,
        version: { ...res.version, body: "<<<LONG STRING>>" },
      };
    }).rejects.toThrow(ImporterError);
  });

  it("rejects an import document body one byte over a MEDIUMTEXT column", async () => {
    importGoogleDoc.mockResolvedValue(
      rawImport({}, "a".repeat(MEDIUMTEXT_MAX_BYTES + 1))
    );
    await expect(async () => {
      const res = await runImport();
      return {
        ...res,
        importDocument: { ...res.importDocument, body: "<<<LONG STRING>>>" },
      };
    }).rejects.toThrow(ImporterError);
  });
});
