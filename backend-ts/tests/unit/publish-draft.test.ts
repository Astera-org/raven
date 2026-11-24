import { MEDIA_IMPORT_IN_PROGRESS_MESSAGE } from "#src/lib/media/constants.js";
import type pino from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { repos } = vi.hoisted(() => ({
  repos: {
    publications: {
      findById: vi.fn(),
      findForUpdate: vi.fn(),
      canPublish: vi.fn(),
      update: vi.fn(),
      updateState: vi.fn(),
    },
    versions: {
      findDraftIdByPubId: vi.fn(),
      findForUpdate: vi.fn(),
      update: vi.fn(),
    },
    imports: { hasUnsettledMediaImport: vi.fn() },
    orgs: { listPotentialOrgsForPublication: vi.fn() },
  },
}));

vi.mock("#v1/db-repositories/index.js", () => ({
  Repositories: class {
    publications = repos.publications;
    versions = repos.versions;
    imports = repos.imports;
    orgs = repos.orgs;
    transaction<T>(fn: (tx: typeof repos) => Promise<T>) {
      return fn(repos);
    }
  },
}));
vi.mock("#v1/routes/publications/helpers/get-readiness.js", () => ({
  getReadiness: vi.fn(async () => ({ success: true })),
}));
vi.mock("#v1/routes/publications/helpers/trigger-pdf-generation.js", () => ({
  triggerPdfGeneration: vi.fn(),
}));
vi.mock("#src/lib/media/upload-body-media-to-s3.js", () => ({
  uploadBodyMediaToS3: vi.fn(async () => null),
}));
vi.mock("#src/lib/references.js", () => ({
  extractAndStoreVersionReferences: vi.fn(async () => undefined),
}));
vi.mock("#v1/lib/notifications-logic.js", () => ({
  notifyForNewPublication: vi.fn(async () => undefined),
}));
vi.mock("#src/lib/datacite/client.js", () => ({}));
vi.mock("#src/lib/publication-doi-lock.js", () => ({}));

const { publishDraft } =
  await import("#v1/routes/publications/helpers/publish-draft.js");

const BODY = "Body as read under the lock";
const DRAFT = {
  id: "v1",
  idInt: 1,
  versionNumber: 1,
  versionDesc: null,
  title: "Title",
  body: BODY,
  doi: null,
  state: "DRAFT",
};
const publish = () =>
  publishDraft({
    id: "p1",
    userId: "u1",
    note: null,
    requestLogger: { error: vi.fn() } as unknown as pino.Logger,
  });
const publishedCalls = () =>
  repos.versions.update.mock.calls.filter(
    ([, update]) => (update as { state?: string }).state === "PUBLISHED"
  );

beforeEach(() => {
  vi.clearAllMocks();
  // Also drops values queued with mockResolvedValueOnce that a test didn't use.
  for (const group of Object.values(repos)) {
    for (const fn of Object.values(group)) fn.mockReset();
  }
  repos.publications.findById.mockResolvedValue({
    id: "p1",
    idInt: 1,
    slug: "a-pub",
    ownerId: "u1",
    state: "DRAFT",
    doi: null,
  });
  repos.publications.canPublish.mockResolvedValue(true);
  repos.versions.findDraftIdByPubId.mockResolvedValue("v1");
  repos.versions.findForUpdate.mockResolvedValue(DRAFT);
  repos.imports.hasUnsettledMediaImport.mockResolvedValue(false);
  repos.orgs.listPotentialOrgsForPublication.mockResolvedValue([]);
});

describe("publishDraft", () => {
  it("publishes the draft as read under the lock", async () => {
    expect(await publish()).toMatchObject({ status: "published" });
    expect(publishedCalls()).toEqual([
      ["v1", expect.objectContaining({ state: "PUBLISHED", body: BODY })],
    ]);
  });

  it("locks the publication before its draft, as MyST pushes do", async () => {
    await publish();

    expect(
      repos.publications.findForUpdate.mock.invocationCallOrder[0]
    ).toBeLessThan(repos.versions.findForUpdate.mock.invocationCallOrder[0]!);
  });

  it("refuses a draft with a media import in progress", async () => {
    repos.imports.hasUnsettledMediaImport.mockResolvedValue(true);

    expect(await publish()).toEqual({
      status: "invalid",
      issues: [
        {
          code: "custom",
          path: ["body"],
          message: MEDIA_IMPORT_IN_PROGRESS_MESSAGE,
        },
      ],
    });
    expect(publishedCalls()).toHaveLength(0);
  });

  it.each([
    ["published", { ...DRAFT, state: "PUBLISHED" }],
    ["deleted", null],
  ])("returns 404 if the draft was %s meanwhile", async (_, locked) => {
    repos.versions.findForUpdate.mockResolvedValue(locked);

    expect(await publish()).toMatchObject({
      status: "error",
      code: 404,
      errors: { draft: expect.any(Object) },
    });
    expect(publishedCalls()).toHaveLength(0);
  });
});
