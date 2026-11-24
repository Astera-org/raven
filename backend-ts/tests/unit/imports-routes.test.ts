import { initConfig } from "#src/config.js";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Every request resolves a session; without a DB, treat callers as anonymous.
vi.mock("#src/lib/auth.js", () => ({
  getAuth: () => ({ api: { getSession: async () => null } }),
}));

const { createApp } = await import("#src/app.js");

let tempDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), "raven-imports-"));
  const tomlPath = join(tempDir, "raven.toml");
  writeFileSync(
    tomlPath,
    `
BASE_URL_API = "https://api.example.com/api"
ENVIRONMENT = "test"
`
  );
  initConfig(tomlPath);
  app = createApp();
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("import routes", () => {
  it("documents the import route", async () => {
    const res = await app.request("/api/v1/openapi.json");
    const spec = (await res.json()) as {
      paths: Record<string, Record<string, { summary: string }>>;
    };

    expect(spec.paths["/imports"]?.post?.summary).toBe("Import a publication");
    expect(spec.paths["/importers"]).toBeUndefined();
  });

  it("documents the source, format and target unions as discriminated unions", async () => {
    const res = await app.request("/api/v1/openapi.json");
    const spec = (await res.json()) as {
      components: { schemas: Record<string, unknown> };
    };
    const { schemas } = spec.components;

    expect(schemas.ImportSource).toEqual({
      oneOf: [{ $ref: "#/components/schemas/UrlImportSource" }],
      discriminator: {
        propertyName: "type",
        mapping: { url: "#/components/schemas/UrlImportSource" },
      },
    });
    expect(schemas.ImportFormat).toEqual({
      oneOf: [
        { $ref: "#/components/schemas/AutoImportFormat" },
        { $ref: "#/components/schemas/GoogleDocsImportFormat" },
      ],
      discriminator: {
        propertyName: "type",
        mapping: {
          auto: "#/components/schemas/AutoImportFormat",
          gdoc: "#/components/schemas/GoogleDocsImportFormat",
        },
      },
      default: { type: "auto" },
    });
    expect(schemas.ImportTarget).toEqual({
      oneOf: [
        { $ref: "#/components/schemas/NewImportTarget" },
        { $ref: "#/components/schemas/DraftImportTarget" },
      ],
      discriminator: {
        propertyName: "type",
        mapping: {
          new: "#/components/schemas/NewImportTarget",
          draft: "#/components/schemas/DraftImportTarget",
        },
      },
      default: { type: "new" },
    });
    expect(schemas.PostImportRequest).toMatchObject({ required: ["source"] });
    expect(schemas.MediaUploadSource).toEqual({
      oneOf: [
        { $ref: "#/components/schemas/MediaUploadUrlSource" },
        { $ref: "#/components/schemas/MediaUploadBytesSource" },
      ],
      discriminator: {
        propertyName: "type",
        mapping: {
          url: "#/components/schemas/MediaUploadUrlSource",
          bytes: "#/components/schemas/MediaUploadBytesSource",
        },
      },
    });
  });

  it("requires a session to import", async () => {
    const res = await app.request("/api/v1/imports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: {
          type: "url",
          url: "https://docs.google.com/document/d/abc/edit",
        },
      }),
    });
    expect(res.status).toBe(401);
  });
});
