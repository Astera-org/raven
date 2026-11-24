import { type postDraftMediaAssetRoute } from "#v1/routes/publications/post-draft-media-asset.js";
import { type HandlerContext } from "#v1/types/handler.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { repos, storeMedia, getOrCreateDraft } = vi.hoisted(() => ({
  repos: {
    publications: {
      findById: vi.fn(),
      canEdit: vi.fn(),
      findForUpdate: vi.fn(),
    },
    transaction: vi.fn(),
  },
  storeMedia: vi.fn(),
  getOrCreateDraft: vi.fn(),
}));

vi.mock("#v1/db-repositories/index.js", () => ({
  makeRepositories: () => repos,
}));
vi.mock("#src/lib/media/store-media.js", () => ({ storeMedia }));
vi.mock("#v1/routes/publications/helpers/get-or-create-draft.js", () => ({
  getOrCreateDraft,
}));

const { postDraftMediaAssetHandler } =
  await import("#v1/routes/publications/post-draft-media-asset.js");

async function upload() {
  const context = {
    var: { user: { id: "user" } },
    req: {
      valid: (target: string) =>
        target === "param"
          ? { id: "publication" }
          : { file: new File(["image"], "α.png") },
    },
    json: (body: unknown, status: number) => Response.json(body, { status }),
  } as unknown as HandlerContext<typeof postDraftMediaAssetRoute>;
  return postDraftMediaAssetHandler(context);
}

beforeEach(() => {
  vi.resetAllMocks();
  repos.publications.findById.mockResolvedValue({ ownerId: "user" });
  repos.publications.canEdit.mockResolvedValue(true);
  repos.publications.findForUpdate.mockResolvedValue({ id: "publication" });
  repos.transaction.mockImplementation(async (fn) => fn(repos));
  getOrCreateDraft.mockResolvedValue({
    status: "existing",
    draft: { id: "draft" },
  });
  storeMedia.mockResolvedValue("https://example.com/asset");
});

describe("draft media linking", () => {
  it.each(["existing", "created"])(
    "stores the file for the %s draft after releasing the publication lock",
    async (status) => {
      let locked = false;
      repos.transaction.mockImplementation(async (fn) => {
        locked = true;
        try {
          return await fn(repos);
        } finally {
          locked = false;
        }
      });
      getOrCreateDraft.mockImplementation(async () => {
        expect(locked).toBe(true);
        return { status, draft: { id: "new-draft" } };
      });
      storeMedia.mockImplementation(async () => {
        expect(locked).toBe(false);
        return "https://example.com/asset";
      });

      const response = await upload();

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        draftCreated: status === "created",
      });
      expect(storeMedia).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          versionId: "new-draft",
          sourceLabel: "α.png",
        })
      );
    }
  );

  it("does not store the file if the publication is deleted", async () => {
    repos.publications.findForUpdate.mockResolvedValue({ state: "DELETED" });

    expect((await upload()).status).toBe(404);
    expect(storeMedia).not.toHaveBeenCalled();
  });

  it("does not store the file if the publication has no version", async () => {
    getOrCreateDraft.mockResolvedValue({ status: "missing-latest-version" });

    expect((await upload()).status).toBe(404);
    expect(storeMedia).not.toHaveBeenCalled();
  });

  it("returns a retryable conflict when the publication lock times out", async () => {
    repos.transaction.mockRejectedValue({ code: "ER_LOCK_WAIT_TIMEOUT" });
    expect((await upload()).status).toBe(409);
    expect(storeMedia).not.toHaveBeenCalled();
  });
});
