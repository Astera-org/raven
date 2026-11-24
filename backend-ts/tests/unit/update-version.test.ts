import { beforeEach, describe, expect, it, vi } from "vitest";

const { repos } = vi.hoisted(() => ({
  repos: {
    versions: { findForUpdate: vi.fn(), update: vi.fn() },
    imports: { hasUnsettledMediaImport: vi.fn() },
  },
}));

vi.mock("#v1/db-repositories/index.js", () => ({
  Repositories: class {
    transaction<T>(fn: (tx: typeof repos) => Promise<T>) {
      return fn(repos);
    }
  },
}));
vi.mock("#src/lib/importers/create-version-import.js", () => ({
  createVersionImport: vi.fn(),
}));

const { updateVersion } =
  await import("#v1/routes/publications/helpers/update-version.js");

const save = () =>
  updateVersion("v1", { title: "New title", body: "New body" }, undefined);

beforeEach(() => {
  for (const group of Object.values(repos)) {
    for (const fn of Object.values(group)) fn.mockReset();
  }
  repos.versions.findForUpdate.mockResolvedValue({
    id: "v1",
    publicationId: "p1",
    state: "DRAFT",
  });
  repos.imports.hasUnsettledMediaImport.mockResolvedValue(false);
});

describe("updateVersion", () => {
  it("writes the fields to a draft", async () => {
    expect(await save()).toEqual({
      status: "applied",
      applied: ["title", "body"],
      bodyRejected: false,
    });
    expect(repos.versions.update).toHaveBeenCalledWith("v1", {
      title: "New title",
      body: "New body",
    });
  });

  it("drops the body if a media import started before the lock", async () => {
    repos.imports.hasUnsettledMediaImport.mockResolvedValue(true);

    expect(await save()).toEqual({
      status: "applied",
      applied: ["title"],
      bodyRejected: true,
    });
    expect(repos.versions.update).toHaveBeenCalledWith("v1", {
      title: "New title",
    });
  });

  it.each([
    ["published", { id: "v1", publicationId: "p1", state: "PUBLISHED" }],
    ["deleted", null],
  ])("writes nothing if the draft was %s meanwhile", async (_, locked) => {
    repos.versions.findForUpdate.mockResolvedValue(locked);

    expect(await save()).toEqual({ status: "not-a-draft" });
    expect(repos.versions.update).not.toHaveBeenCalled();
  });

  describe("edited fields", () => {
    const lockImported = (editedFields: string[] = []) =>
      repos.versions.findForUpdate.mockResolvedValue({
        id: "v1",
        publicationId: "p1",
        state: "DRAFT",
        currentImportId: "i1",
        editedFields,
        title: "Imported title",
        subtitle: null,
        abstract: "Imported abstract",
        body: "Imported body",
      });
    const written = () => repos.versions.update.mock.calls[0]?.[1];

    beforeEach(() => lockImported());

    it("records the fields whose value changed, treating empty and null alike", async () => {
      await updateVersion(
        "v1",
        {
          title: "New title",
          subtitle: "",
          abstract: "Imported abstract",
          body: "Imported body",
        },
        undefined
      );

      expect(written()).toEqual(
        expect.objectContaining({ editedFields: ["title"] })
      );
    });

    it("records a cleared field", async () => {
      await updateVersion("v1", { abstract: null }, undefined);

      expect(written()).toEqual(
        expect.objectContaining({ editedFields: ["abstract"] })
      );
    });

    it("keeps the fields in a fixed order, whatever order they were edited in", async () => {
      lockImported(["abstract"]);

      await updateVersion("v1", { title: "New title" }, undefined);

      expect(written()).toEqual(
        expect.objectContaining({ editedFields: ["title", "abstract"] })
      );
    });

    it("leaves edited fields unwritten when they're already recorded", async () => {
      lockImported(["title"]);

      await updateVersion("v1", { title: "Newer title" }, undefined);

      expect(written()).toEqual({ title: "Newer title" });
    });

    it("leaves out a body dropped for a media import", async () => {
      repos.imports.hasUnsettledMediaImport.mockResolvedValue(true);

      await save();

      expect(written()).toEqual({
        title: "New title",
        editedFields: ["title"],
      });
    });

    it("doesn't report edited fields as applied", async () => {
      expect(await save()).toEqual(
        expect.objectContaining({ applied: ["title", "body"] })
      );
    });

    it("records nothing when the patch replaces the import document", async () => {
      await updateVersion(
        "v1",
        { title: "New title" },
        { body: "<p>New</p>", format: "gdoc" }
      );

      expect(written()).not.toHaveProperty("editedFields");
    });

    it("clears the edited fields with the import document", async () => {
      lockImported(["title"]);

      await updateVersion("v1", { title: "New title" }, null);

      expect(written()).toEqual(
        expect.objectContaining({ currentImportId: null, editedFields: [] })
      );
    });

    it("records nothing for a draft without an import", async () => {
      repos.versions.findForUpdate.mockResolvedValue({
        id: "v1",
        publicationId: "p1",
        state: "DRAFT",
        currentImportId: null,
        editedFields: [],
      });

      await save();

      expect(written()).not.toHaveProperty("editedFields");
    });
  });
});
