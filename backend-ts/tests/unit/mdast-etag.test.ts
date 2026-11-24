import { mdastEtag } from "#v1/routes/publications/helpers/prepare-mdast-response.js";
import { describe, expect, it } from "vitest";

describe("mdastEtag", () => {
  const base = {
    content: { abstract: "An abstract.", body: "Body." },
    schema: 1,
    version: 3,
    isDraft: false,
  };

  it("is a strong ETag that stays the same for the same representation", () => {
    expect(mdastEtag(base)).toMatch(/^"[0-9a-f]{64}"$/);
    expect(mdastEtag({ ...base })).toBe(mdastEtag(base));
  });

  it("changes with the content, schema, AST version and draft state", () => {
    const etags = [
      base,
      { ...base, content: { ...base.content, body: "Other." } },
      { ...base, schema: 2 },
      { ...base, version: 2 },
      { ...base, isDraft: true },
    ].map(mdastEtag);

    expect(new Set(etags).size).toBe(etags.length);
  });
});
