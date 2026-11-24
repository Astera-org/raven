import {
  isMystPreference,
  negotiateDraftFormat,
} from "#v1/routes/publications/helpers/negotiate-draft-format.js";
import { describe, expect, it } from "vitest";

describe("negotiateDraftFormat", () => {
  it.each([
    "text/markdown; variant=myst",
    'text/markdown; variant="myst"',
    "Text/Markdown; Variant=MYST",
    "text/markdown; charset=utf-8; variant=myst",
    "application/json;q=0.5, text/markdown; variant=myst",
  ])("serves MyST for %s", (accept) => {
    expect(negotiateDraftFormat(accept)).toBe("myst");
  });

  it.each([
    undefined,
    "application/json",
    "*/*",
    "text/html",
    "text/markdown; variant=commonmark",
    "application/json, text/markdown; variant=myst",
  ])("serves JSON for %s", (accept) => {
    expect(negotiateDraftFormat(accept)).toBe("json");
  });

  it.each(["text/markdown", "text/markdown; charset=utf-8"])(
    "refuses plain %s",
    (accept) => {
      expect(negotiateDraftFormat(accept)).toBe("not-acceptable");
    }
  );
});

describe("isMystPreference", () => {
  it("recognises the MyST variant however it is written", () => {
    expect(isMystPreference('text/markdown;variant="myst"')).toBe(true);
    expect(isMystPreference("text/markdown")).toBe(false);
    expect(isMystPreference("text/plain;variant=myst")).toBe(false);
  });
});
