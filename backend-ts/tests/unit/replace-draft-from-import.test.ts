import { type ImportedPublication } from "@raven/core-import-format";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { repos, createVersionImport, createMediaImportEntries, finishImport } =
  vi.hoisted(() => ({
    repos: {
      versions: { findForUpdate: vi.fn(), update: vi.fn() },
      imports: { hasUnsettledMediaImport: vi.fn() },
    },
    createVersionImport: vi.fn(),
    createMediaImportEntries: vi.fn(),
    finishImport: vi.fn(),
  }));

vi.mock("#v1/db-repositories/index.js", () => ({
  Repositories: class {
    transaction<T>(fn: (tx: typeof repos) => Promise<T>) {
      return fn(repos);
    }
  },
}));
vi.mock("#src/lib/importers/create-version-import.js", () => ({
  createVersionImport,
}));
vi.mock("#src/lib/media/create-media-import-entries.js", () => ({
  createMediaImportEntries,
}));
vi.mock("#src/lib/importers/helpers/finish-import.js", () => ({
  finishImport,
}));

const { replaceDraftFromImport } =
  await import("#src/lib/importers/replace-draft-from-import.js");

const imported = {
  version: {
    title: "Imported title",
    subtitle: null,
    abstract: null,
    body: "Imported body",
  },
  importDocument: {
    body: "<html></html>",
    url: "https://docs.google.com/document/d/abc/edit",
    filename: "Doc",
    format: "gdoc",
  },
  diagnostics: [],
  media: [],
} as unknown as ImportedPublication;

const replace = () =>
  replaceDraftFromImport({ imported, publicationId: "p1", versionId: "v1" });

beforeEach(() => {
  vi.resetAllMocks();
  repos.versions.findForUpdate.mockResolvedValue({ state: "DRAFT" });
  repos.imports.hasUnsettledMediaImport.mockResolvedValue(false);
  createMediaImportEntries.mockResolvedValue({
    batchId: "b1",
    bossCommand: null,
  });
  finishImport.mockResolvedValue({ settled: true });
});

describe("replaceDraftFromImport", () => {
  it("replaces the draft's content and makes this its current import", async () => {
    const result = await replace();

    expect(result).toMatchObject({ status: "replaced", settled: true });
    expect(repos.versions.update).toHaveBeenCalledWith(
      "v1",
      expect.objectContaining({
        title: "Imported title",
        body: "Imported body",
      })
    );
    expect(createVersionImport).toHaveBeenCalledWith(
      repos,
      expect.objectContaining({
        versionId: "v1",
        url: imported.importDocument.url,
      })
    );
    expect(finishImport).toHaveBeenCalledWith({
      batchId: "b1",
      bossCommand: null,
      publicationId: "p1",
      versionId: "v1",
    });
  });

  it.each([
    ["was published", { state: "PUBLISHED" }],
    ["was deleted", null],
  ])(
    "changes nothing if the draft %s while the doc was converted",
    async (_, locked) => {
      repos.versions.findForUpdate.mockResolvedValue(locked);

      expect(await replace()).toEqual({ status: "not-a-draft" });
      expect(repos.versions.update).not.toHaveBeenCalled();
      expect(createVersionImport).not.toHaveBeenCalled();
      expect(finishImport).not.toHaveBeenCalled();
    }
  );

  it("changes nothing while an earlier import's media is still copying", async () => {
    repos.imports.hasUnsettledMediaImport.mockResolvedValue(true);

    expect(await replace()).toEqual({ status: "media-importing" });
    expect(repos.versions.update).not.toHaveBeenCalled();
    expect(finishImport).not.toHaveBeenCalled();
  });
});
