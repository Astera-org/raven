import { applyMediaUrlToVersionBody } from "#src/lib/media/apply-media-url-to-version-body.js";
import { maybeFinalizeMediaImport } from "#src/lib/media/maybe-finalize-media-import.js";
import { MEDIA_IMPORT_FINALIZE } from "#src/lib/tasks/queue-names.js";
import { mediaRef } from "@raven/core-import-format";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { repos, sendMock, transactionResults } = vi.hoisted(() => ({
  transactionResults: [] as Promise<unknown>[],
  repos: {
    versions: {
      findBodyForUpdate: vi.fn(),
      update: vi.fn(),
    },
    imports: {
      markMediaImportItemCompleted: vi.fn(),
      countUnsettledMediaImportItems: vi.fn(),
      findMediaImportBatchById: vi.fn(),
      markMediaImportBatchFinalizing: vi.fn(),
    },
  },
  sendMock: vi.fn(),
}));

// The real transaction rolls back when its callback rejects, so tests check
// the callback's outcome (recorded here) to know whether writes would commit.
vi.mock("#v1/db-repositories/index.js", () => ({
  makeRepositories: () => ({
    transaction: <T>(fn: (tx: typeof repos) => Promise<T>) => {
      const result = fn(repos);
      transactionResults.push(result);
      return result;
    },
  }),
}));
vi.mock("#src/lib/queue/pg-boss.js", () => ({
  getBoss: () => ({ send: sendMock }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  transactionResults.length = 0;
});

describe("applyMediaUrlToVersionBody", () => {
  const ref = mediaRef("fig-1");
  const args = {
    versionId: "v1",
    itemId: "i1",
    ref,
    s3Url: "https://bucket/fig.png",
  };

  it("swaps the ref for the S3 URL and marks the item completed", async () => {
    repos.versions.findBodyForUpdate.mockResolvedValue({
      body: `:::image{src=${ref}}`,
    });
    repos.imports.markMediaImportItemCompleted.mockResolvedValue(true);

    expect(await applyMediaUrlToVersionBody(args)).toBe(true);
    await expect(transactionResults[0]).resolves.toBe(true);
    expect(repos.versions.update).toHaveBeenCalledWith("v1", {
      body: ":::image{src=https://bucket/fig.png}",
    });
    expect(repos.imports.markMediaImportItemCompleted).toHaveBeenCalledWith(
      "i1",
      "https://bucket/fig.png"
    );
  });

  it("skips the body write when the ref isn't in the body", async () => {
    repos.versions.findBodyForUpdate.mockResolvedValue({ body: "no media" });
    repos.imports.markMediaImportItemCompleted.mockResolvedValue(true);

    expect(await applyMediaUrlToVersionBody(args)).toBe(true);
    expect(repos.versions.update).not.toHaveBeenCalled();
  });

  it("returns false and rejects the transaction when the item is already settled", async () => {
    repos.versions.findBodyForUpdate.mockResolvedValue({
      body: `:::image{src=${ref}}`,
    });
    repos.imports.markMediaImportItemCompleted.mockResolvedValue(false);

    expect(await applyMediaUrlToVersionBody(args)).toBe(false);
    await expect(transactionResults[0]).rejects.toThrow();
  });

  it("throws when the version no longer exists", async () => {
    repos.versions.findBodyForUpdate.mockResolvedValue(undefined);

    await expect(applyMediaUrlToVersionBody(args)).rejects.toThrow(
      "Version v1 not found"
    );
  });
});

describe("maybeFinalizeMediaImport", () => {
  it("does nothing while items are still unsettled", async () => {
    repos.imports.countUnsettledMediaImportItems.mockResolvedValue(2);

    await maybeFinalizeMediaImport("b1");

    expect(repos.imports.markMediaImportBatchFinalizing).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("marks the batch finalizing and sends the finalize job", async () => {
    repos.imports.countUnsettledMediaImportItems.mockResolvedValue(0);
    repos.imports.findMediaImportBatchById.mockResolvedValue({
      status: "processing",
    });
    repos.imports.markMediaImportBatchFinalizing.mockResolvedValue(true);

    await maybeFinalizeMediaImport("b1");

    expect(sendMock).toHaveBeenCalledWith(
      MEDIA_IMPORT_FINALIZE,
      { batchId: "b1" },
      { singletonKey: "b1" }
    );
  });

  it("re-sends the finalize job for a batch that is already finalizing", async () => {
    repos.imports.countUnsettledMediaImportItems.mockResolvedValue(0);
    repos.imports.findMediaImportBatchById.mockResolvedValue({
      status: "finalizing",
    });

    await maybeFinalizeMediaImport("b1");

    expect(repos.imports.markMediaImportBatchFinalizing).not.toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalledOnce();
  });

  it("doesn't send when the batch can't be marked finalizing", async () => {
    repos.imports.countUnsettledMediaImportItems.mockResolvedValue(0);
    repos.imports.findMediaImportBatchById.mockResolvedValue({
      status: "completed",
    });
    repos.imports.markMediaImportBatchFinalizing.mockResolvedValue(false);

    await maybeFinalizeMediaImport("b1");

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("propagates send failures so the caller retries", async () => {
    repos.imports.countUnsettledMediaImportItems.mockResolvedValue(0);
    repos.imports.findMediaImportBatchById.mockResolvedValue({
      status: "processing",
    });
    repos.imports.markMediaImportBatchFinalizing.mockResolvedValue(true);
    sendMock.mockRejectedValue(new Error("pg down"));

    await expect(maybeFinalizeMediaImport("b1")).rejects.toThrow("pg down");
  });
});
