import {
  ImportedContributorSchema,
  ImportedFileMediaSourceSchema,
  ImportedPublicationSchema,
  ImportedUrlMediaSourceSchema,
  MEDIUMBLOB_MAX_BYTES,
  mediaRef,
  replaceMediaRefs,
} from "@raven/core-import-format";
import { describe, expect, it } from "vitest";

describe("media refs", () => {
  it("rejects ids that could run into surrounding text", () => {
    expect(() => mediaRef("fig 1")).toThrow('Invalid media ref id "fig 1"');
  });

  it("only replaces whole refs", () => {
    const body = `:::image{src=${mediaRef("fig1")}}\n:::image{src=${mediaRef("fig10")}}`;
    expect(
      replaceMediaRefs(body, (ref) =>
        ref === mediaRef("fig1") ? "https://cdn/1.png" : undefined
      )
    ).toBe(
      `:::image{src=https://cdn/1.png}\n:::image{src=${mediaRef("fig10")}}`
    );
  });
});

describe("url media sources", () => {
  const longPath = "a".repeat(70_000);

  it("rejects URLs longer than a TEXT column", () => {
    const result = ImportedUrlMediaSourceSchema.safeParse({
      type: "url",
      url: `https://example.com/${longPath}`,
    });
    expect(result.success).toBe(false);
  });

  it("accepts data: URLs of any length, since they're queued as bytes", () => {
    const result = ImportedUrlMediaSourceSchema.safeParse({
      type: "url",
      url: `data:image/png;base64,${Buffer.alloc(200_000).toString("base64")}`,
    });
    expect(result.success).toBe(true);
  });
});

describe("media size limit", () => {
  const dataUrl = (bytes: number) =>
    `data:image/png;base64,${Buffer.alloc(bytes).toString("base64")}`;
  const bytesSource = (bytes: number) => ({
    type: "bytes",
    data: new Uint8Array(bytes),
    filename: "a.png",
  });

  it("accepts media up to the limit", () => {
    expect(
      ImportedUrlMediaSourceSchema.safeParse({
        type: "url",
        url: dataUrl(MEDIUMBLOB_MAX_BYTES),
      }).success
    ).toBe(true);
    expect(
      ImportedFileMediaSourceSchema.safeParse(bytesSource(MEDIUMBLOB_MAX_BYTES))
        .success
    ).toBe(true);
  });

  it("rejects a data: URL whose content is over the limit", () => {
    const result = ImportedUrlMediaSourceSchema.safeParse({
      type: "url",
      url: dataUrl(MEDIUMBLOB_MAX_BYTES + 1),
    });
    expect(result.error?.issues[0]?.message).toMatch(/Media must be at most/);
  });

  it("rejects bytes over the limit", () => {
    const result = ImportedFileMediaSourceSchema.safeParse(
      bytesSource(MEDIUMBLOB_MAX_BYTES + 1)
    );
    expect(result.error?.issues[0]?.message).toMatch(/Media must be at most/);
  });
});

describe("imported publications", () => {
  const minimal = {
    version: { body: "Body." },
    importDocument: { format: "mystmd", body: "Body." },
  };

  it("leave the title and license unset when the document has none", () => {
    const result = ImportedPublicationSchema.parse(minimal);

    expect(result.version.title).toBeNull();
    expect(result.publication.license).toBeUndefined();
  });
});

describe("imported contributors", () => {
  it("accept several user refs, tried in order", () => {
    const result = ImportedContributorSchema.parse({
      user: [
        { by: "orcid", value: "0000-0002-1825-0097" },
        { by: "email", value: "ada@example.com" },
      ],
    });

    expect(result.user).toHaveLength(2);
  });

  it("default to no roles", () => {
    const result = ImportedContributorSchema.parse({
      user: [{ by: "email", value: "ada@example.com" }],
    });

    expect(result.roles).toEqual([]);
  });

  it("need at least one user ref", () => {
    expect(ImportedContributorSchema.safeParse({ user: [] }).success).toBe(
      false
    );
  });
});
