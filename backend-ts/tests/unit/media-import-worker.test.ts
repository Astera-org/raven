import { ConfigError } from "#src/config.js";
import { MalformedInputError } from "#src/lib/errors/malformed-input.js";
import { MediaTooLargeError } from "#src/lib/errors/media-too-large-error.js";
import { MediaTypeMismatchError } from "#src/lib/errors/media-type-mismatch-error.js";
import { MediaUnavailableError } from "#src/lib/errors/media-unavailable-error.js";
import { UnsupportedMediaError } from "#src/lib/errors/unsupported-media-error.js";
import { DriveAccessError } from "#src/lib/media/get-google-drive-filename.js";
import {
  MEDIA_IMPORT_FINALIZE,
  MEDIA_IMPORT_FINALIZE_DEAD,
  MEDIA_TRANSFER,
  MEDIA_TRANSFER_DEAD,
} from "#src/lib/tasks/queue-names.js";
import { addUploadMedia } from "#src/lib/tasks/upload-url-media.js";
import { type PgBoss } from "pg-boss";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  imports: {
    findMediaImportItemById: vi.fn(),
    findMediaImportBatchById: vi.fn(),
    updateMediaImportItem: vi.fn(),
    markMediaImportItemFailed: vi.fn(),
    listMediaImportItems: vi.fn(),
    updateMediaImportBatch: vi.fn(),
  },
  transferUrlMedia: vi.fn(),
  transferBytesMedia: vi.fn(),
  applyMediaUrlToVersionBody: vi.fn(),
  maybeFinalizeMediaImport: vi.fn(),
  logger: { error: vi.fn(), fatal: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("#v1/db-repositories/index.js", () => ({
  makeRepositories: () => ({ imports: mocks.imports }),
}));
vi.mock("#src/lib/media/transfer-url-media.js", () => ({
  transferUrlMedia: mocks.transferUrlMedia,
}));
vi.mock("#src/lib/media/transfer-bytes-media.js", () => ({
  transferBytesMedia: mocks.transferBytesMedia,
}));
vi.mock("#src/lib/media/apply-media-url-to-version-body.js", () => ({
  applyMediaUrlToVersionBody: mocks.applyMediaUrlToVersionBody,
}));
vi.mock("#src/lib/media/maybe-finalize-media-import.js", () => ({
  maybeFinalizeMediaImport: mocks.maybeFinalizeMediaImport,
}));
vi.mock("#src/lib/logger.js", () => ({ logger: mocks.logger }));

type Handler = (jobs: unknown[]) => Promise<void>;
const handlers = new Map<string, Handler>();

beforeAll(async () => {
  const boss = {
    createQueue: vi.fn(),
    // work(name, handler) or work(name, options, handler)
    work: vi.fn((name: string, ...rest: unknown[]) => {
      handlers.set(name, rest.at(-1) as Handler);
    }),
  };
  await addUploadMedia(boss as unknown as PgBoss);
});

beforeEach(() => {
  vi.resetAllMocks();
});

function run(queue: string, job: Record<string, unknown>) {
  return handlers.get(queue)!([{ id: "job-1", ...job }]);
}

const transferJob = { data: { batchId: "b1", itemId: "i1" } };
const pendingItem = {
  status: "pending",
  ref: "raven-media://fig-1",
  media: {
    figureType: "image",
    source: { type: "url", url: "https://docs.google.com/a.png" },
  },
};
const processingBatch = {
  status: "processing",
  publicationId: "p1",
  versionId: "v1",
};

describe(MEDIA_TRANSFER, () => {
  beforeEach(() => {
    mocks.imports.findMediaImportItemById.mockResolvedValue(pendingItem);
    mocks.imports.findMediaImportBatchById.mockResolvedValue(processingBatch);
  });

  it("transfers the media, applies it to the body and finalizes", async () => {
    mocks.transferUrlMedia.mockResolvedValue("https://bucket/a.png");
    mocks.applyMediaUrlToVersionBody.mockResolvedValue(true);

    await run(MEDIA_TRANSFER, transferJob);

    expect(mocks.applyMediaUrlToVersionBody).toHaveBeenCalledWith({
      versionId: "v1",
      itemId: "i1",
      ref: "raven-media://fig-1",
      s3Url: "https://bucket/a.png",
    });
    expect(mocks.maybeFinalizeMediaImport).toHaveBeenCalledWith("b1");
    expect(mocks.imports.markMediaImportItemFailed).not.toHaveBeenCalled();
  });

  it.each([
    [
      "UnsupportedMediaError",
      new UnsupportedMediaError(".exe", "https://a"),
      "unsupported",
    ],
    [
      "MediaTooLargeError",
      new MediaTooLargeError("https://a", 10),
      "too-large",
    ],
    ["MalformedInputError", new MalformedInputError("corrupt"), "unreadable"],
    [
      "MediaUnavailableError",
      new MediaUnavailableError("HTTP 404"),
      "unavailable",
    ],
    [
      "MediaTypeMismatchError",
      new MediaTypeMismatchError("not an image"),
      "media-type-mismatch",
    ],
    ["DriveAccessError", new DriveAccessError("private"), "unavailable"],
    [
      "ConfigError",
      new ConfigError("AWS_S3_BUCKET_NAME", "no bucket"),
      "failed",
    ],
  ])("fails the item without retrying on %s", async (_name, error, code) => {
    mocks.transferUrlMedia.mockRejectedValue(error);

    await expect(run(MEDIA_TRANSFER, transferJob)).resolves.toBeUndefined();

    expect(mocks.imports.markMediaImportItemFailed).toHaveBeenCalledWith(
      "i1",
      code,
      error.message
    );
    expect(mocks.maybeFinalizeMediaImport).toHaveBeenCalledWith("b1");
  });

  it("logs config errors with the offending key", async () => {
    mocks.transferUrlMedia.mockRejectedValue(
      new ConfigError("AWS_S3_BUCKET_NAME", "no bucket")
    );

    await run(MEDIA_TRANSFER, transferJob);

    expect(mocks.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        configKey: "AWS_S3_BUCKET_NAME",
        itemId: "i1",
      }),
      expect.any(String)
    );
  });

  it("records the error and rethrows transient failures so pg-boss retries", async () => {
    const error = new Error("Failed to download (HTTP 503)");
    mocks.transferUrlMedia.mockRejectedValue(error);

    await expect(run(MEDIA_TRANSFER, transferJob)).rejects.toBe(error);

    expect(mocks.imports.updateMediaImportItem).toHaveBeenCalledWith("i1", {
      error: String(error),
    });
    expect(mocks.imports.markMediaImportItemFailed).not.toHaveBeenCalled();
    expect(mocks.logger.error).toHaveBeenCalledWith(
      { err: error, itemId: "i1", batchId: "b1", jobId: "job-1" },
      expect.stringContaining(MEDIA_TRANSFER)
    );
  });

  it("keeps the original error when recording it fails", async () => {
    const error = new Error("Failed to download (HTTP 503)");
    const writeError = new Error("DB unavailable");
    mocks.transferUrlMedia.mockRejectedValue(error);
    mocks.imports.updateMediaImportItem.mockImplementation(
      (_id: string, update: { error?: string }) =>
        update.error ? Promise.reject(writeError) : Promise.resolve()
    );

    await expect(run(MEDIA_TRANSFER, transferJob)).rejects.toBe(error);

    expect(mocks.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: writeError, itemId: "i1" }),
      expect.any(String)
    );
    expect(mocks.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: error, itemId: "i1" }),
      expect.any(String)
    );
  });

  it("transfers byte sources from the item's data", async () => {
    const source = { type: "bytes", filename: "image.png" };
    const data = Buffer.from("png");
    mocks.imports.findMediaImportItemById.mockResolvedValue({
      ...pendingItem,
      media: { figureType: "image", source },
      data,
    });
    mocks.transferBytesMedia.mockResolvedValue("https://bucket/image.png");
    mocks.applyMediaUrlToVersionBody.mockResolvedValue(true);

    await run(MEDIA_TRANSFER, transferJob);

    expect(mocks.transferUrlMedia).not.toHaveBeenCalled();
    expect(mocks.transferBytesMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        source,
        data,
        figureType: "image",
        versionId: "v1",
      })
    );
    expect(mocks.applyMediaUrlToVersionBody).toHaveBeenCalledWith(
      expect.objectContaining({ s3Url: "https://bucket/image.png" })
    );
  });

  it("fails byte sources with no data without retrying", async () => {
    mocks.imports.findMediaImportItemById.mockResolvedValue({
      ...pendingItem,
      media: { source: { type: "bytes", filename: "image.png" } },
      data: null,
    });

    await run(MEDIA_TRANSFER, transferJob);

    expect(mocks.transferBytesMedia).not.toHaveBeenCalled();
    expect(mocks.imports.markMediaImportItemFailed).toHaveBeenCalledWith(
      "i1",
      "failed",
      expect.stringMatching(/data is missing/)
    );
    expect(mocks.maybeFinalizeMediaImport).toHaveBeenCalledWith("b1");
  });

  it.each(["completed", "failed"])(
    "skips a %s item but still tries to finalize the batch",
    async (status) => {
      mocks.imports.findMediaImportItemById.mockResolvedValue({
        ...pendingItem,
        status,
      });

      await run(MEDIA_TRANSFER, transferJob);

      expect(mocks.transferUrlMedia).not.toHaveBeenCalled();
      expect(mocks.maybeFinalizeMediaImport).toHaveBeenCalledWith("b1");
    }
  );

  it("skips items whose batch has already settled", async () => {
    mocks.imports.findMediaImportBatchById.mockResolvedValue({
      ...processingBatch,
      status: "completed",
    });

    await run(MEDIA_TRANSFER, transferJob);

    expect(mocks.transferUrlMedia).not.toHaveBeenCalled();
    expect(mocks.imports.updateMediaImportItem).not.toHaveBeenCalled();
  });

  it("ends malformed jobs without retrying", async () => {
    await expect(
      run(MEDIA_TRANSFER, { data: { batchId: "b1" } })
    ).resolves.toBeUndefined();

    expect(mocks.imports.findMediaImportItemById).not.toHaveBeenCalled();
  });
});

describe(MEDIA_TRANSFER_DEAD, () => {
  const deadJob = { ...transferJob, retryCount: 0, retryLimit: 10 };

  it("marks the item failed and finalizes the batch", async () => {
    await run(MEDIA_TRANSFER_DEAD, deadJob);

    expect(mocks.imports.markMediaImportItemFailed).toHaveBeenCalledWith(
      "i1",
      "retries-exhausted",
      "Exceeded retry limit"
    );
    expect(mocks.maybeFinalizeMediaImport).toHaveBeenCalledWith("b1");
  });

  it("logs and rethrows failures so its own retries run", async () => {
    const error = new Error("db down");
    mocks.imports.markMediaImportItemFailed.mockRejectedValue(error);

    await expect(run(MEDIA_TRANSFER_DEAD, deadJob)).rejects.toBe(error);

    expect(mocks.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: error, itemId: "i1", retryCount: 0 }),
      expect.stringMatching(/retrying/)
    );
    expect(mocks.logger.fatal).not.toHaveBeenCalled();
  });

  it("logs at fatal level on the last attempt", async () => {
    mocks.imports.markMediaImportItemFailed.mockRejectedValue(
      new Error("db down")
    );

    await expect(
      run(MEDIA_TRANSFER_DEAD, { ...deadJob, retryCount: 10 })
    ).rejects.toThrow();

    expect(mocks.logger.fatal).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: "i1", retryCount: 10 }),
      expect.stringMatching(/retries exhausted/)
    );
  });
});

describe(MEDIA_IMPORT_FINALIZE, () => {
  const finalizeJob = { data: { batchId: "b1" } };

  it("completes the batch when no item failed", async () => {
    mocks.imports.listMediaImportItems.mockResolvedValue([
      { status: "completed" },
      { status: "completed" },
    ]);

    await run(MEDIA_IMPORT_FINALIZE, finalizeJob);

    expect(mocks.imports.updateMediaImportBatch).toHaveBeenCalledWith("b1", {
      status: "completed",
    });
  });

  it("fails the batch when any item failed", async () => {
    mocks.imports.listMediaImportItems.mockResolvedValue([
      { status: "completed" },
      { status: "failed" },
    ]);

    await run(MEDIA_IMPORT_FINALIZE, finalizeJob);

    expect(mocks.imports.updateMediaImportBatch).toHaveBeenCalledWith("b1", {
      status: "failed",
    });
  });
});

describe(MEDIA_IMPORT_FINALIZE_DEAD, () => {
  const deadJob = { data: { batchId: "b1" }, retryCount: 0, retryLimit: 10 };

  it("marks the batch failed", async () => {
    await run(MEDIA_IMPORT_FINALIZE_DEAD, deadJob);

    expect(mocks.imports.updateMediaImportBatch).toHaveBeenCalledWith("b1", {
      status: "failed",
      error: "Exceeded retry limit",
    });
  });

  it("logs and rethrows failures so its own retries run", async () => {
    const error = new Error("db down");
    mocks.imports.updateMediaImportBatch.mockRejectedValue(error);

    await expect(run(MEDIA_IMPORT_FINALIZE_DEAD, deadJob)).rejects.toBe(error);

    expect(mocks.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: error, batchId: "b1" }),
      expect.stringMatching(/retrying/)
    );
  });
});
