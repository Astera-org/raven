import { MalformedInputError } from "#src/lib/errors/malformed-input.js";
import { createMediaImportEntries } from "#src/lib/media/create-media-import-entries.js";
import { type Repositories } from "#v1/db-repositories/index.js";
import {
  type ImportedMedia,
  ImportedMediaSchema,
  mediaRef,
} from "@raven/core-import-format";
import { describe, expect, it, vi } from "vitest";

const PNG_BASE64 = Buffer.from("png bytes").toString("base64");

async function queuedItems(media: ImportedMedia[]) {
  const imports = {
    createMediaImportBatch: vi.fn(),
    createMediaImportItem: vi.fn(),
  };
  await createMediaImportEntries({
    media,
    publicationId: "p1",
    versionId: "v1",
    importId: "imp1",
    repos: { imports } as unknown as Repositories,
  });
  return imports.createMediaImportItem.mock.calls[0]![0] as {
    media: ImportedMedia;
    data: Buffer | null;
  }[];
}

describe("createMediaImportEntries", () => {
  const ref = mediaRef("01JZZZZZZZZZZZZZZZZZZZZZZZ");

  it("queues url media as is", async () => {
    const media: ImportedMedia = {
      ref,
      figureType: "image",
      source: { type: "url", url: "https://docs.google.com/a.png" },
    };
    const [item] = await queuedItems([media]);
    expect(item).toMatchObject({ ref, media, data: null });
  });

  it("stores a bytes source's data outside the media JSON", async () => {
    const data = new Uint8Array([1, 2, 3]);
    const [item] = await queuedItems([
      {
        ref,
        figureType: "image",
        source: {
          type: "bytes",
          data,
          filename: "a.png",
          mimeType: "image/png",
        },
      },
    ]);
    expect(item!.media.source).toEqual({
      type: "bytes",
      filename: "a.png",
      mimeType: "image/png",
    });
    expect(item!.data).toEqual(Buffer.from(data));
  });

  it("converts a data: URL into a bytes source", async () => {
    const [item] = await queuedItems([
      {
        ref,
        figureType: "image",
        source: { type: "url", url: `data:image/png;base64,${PNG_BASE64}` },
      },
    ]);
    expect(item!.media.source).toEqual({
      type: "bytes",
      filename: "image.png",
      mimeType: "image/png",
    });
    expect(item!.data).toEqual(Buffer.from("png bytes"));
  });

  it("converts a data: URL of any size after it passes validation", async () => {
    const large = Buffer.alloc(200_000, 1);
    const media = ImportedMediaSchema.parse({
      ref,
      figureType: "image",
      source: {
        type: "url",
        url: `data:image/png;base64,${large.toString("base64")}`,
      },
    });
    const [item] = await queuedItems([media]);
    expect(item!.media.source.type).toBe("bytes");
    expect(item!.data).toEqual(large);
  });

  it("rejects a data: URL it can't decode", async () => {
    await expect(
      queuedItems([
        {
          ref,
          figureType: "image",
          source: { type: "url", url: "data:image/png,not-base64" },
        },
      ])
    ).rejects.toBeInstanceOf(MalformedInputError);
  });
});
