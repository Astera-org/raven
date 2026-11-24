import { type MediaImportItem } from "#src/db/schema.js";
import { MEDIA_IMPORT_ERROR_MESSAGES } from "#src/lib/media/media-import-errors.js";
import { buildMediaUploadResponse } from "#v1/routes/imports/build-media-upload-response.js";
import { describe, expect, it } from "vitest";

const urlItem: Omit<MediaImportItem, "data"> = {
  id: "i1",
  batchId: "b1",
  ref: "raven-media://fig-1",
  media: {
    ref: "raven-media://fig-1",
    figureType: "image",
    source: { type: "url", url: "https://lh3.googleusercontent.com/a.png" },
  },
  status: "pending",
  s3Url: null,
  error: null,
  errorCode: null,
};

const bytesItem: Omit<MediaImportItem, "data"> = {
  ...urlItem,
  media: {
    ref: "raven-media://fig-1",
    figureType: "image",
    source: { type: "bytes", filename: "image.png", mimeType: "image/png" },
  },
};

describe("buildMediaUploadResponse", () => {
  it("returns a completed upload's URL and source", () => {
    expect(
      buildMediaUploadResponse({
        ...urlItem,
        status: "completed",
        s3Url: "https://bucket/a.png",
      })
    ).toEqual({
      id: "i1",
      ref: "raven-media://fig-1",
      status: "completed",
      url: "https://bucket/a.png",
      source: { type: "url", url: "https://lh3.googleusercontent.com/a.png" },
      error: null,
    });
  });

  it("describes media that came with the document", () => {
    expect(buildMediaUploadResponse(bytesItem)).toMatchObject({
      url: null,
      source: { type: "bytes", filename: "image.png", mimeType: "image/png" },
    });
  });

  it("returns a failed upload's code and message, not its recorded error", () => {
    expect(
      buildMediaUploadResponse({
        ...urlItem,
        status: "failed",
        error: "Failed to download https://... (HTTP 404)",
        errorCode: "unavailable",
      }).error
    ).toEqual({
      code: "unavailable",
      message: MEDIA_IMPORT_ERROR_MESSAGES.unavailable,
    });
  });

  it("reports a generic failure for items failed without a code", () => {
    expect(
      buildMediaUploadResponse({ ...urlItem, status: "failed" }).error?.code
    ).toBe("failed");
  });

  it("has no error while a failed attempt is waiting to be retried", () => {
    expect(
      buildMediaUploadResponse({
        ...urlItem,
        status: "active",
        error: "Failed to download https://... (HTTP 503)",
      }).error
    ).toBeNull();
  });
});
