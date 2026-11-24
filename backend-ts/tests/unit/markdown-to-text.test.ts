import { markdownToText } from "#src/lib/utils/markdown.js";
import { describe, expect, it } from "vitest";

describe("markdownToText", () => {
  it("strips bold formatting", async () => {
    expect(await markdownToText("Hello **world**")).toBe("Hello world");
  });

  it("strips italic formatting", async () => {
    expect(await markdownToText("Hello _world_")).toBe("Hello world");
  });

  it("strips headings", async () => {
    expect(await markdownToText("# Heading\n\nBody text")).toBe(
      "Heading\n\nBody text"
    );
  });

  it("strips links, keeping the link text", async () => {
    expect(await markdownToText("See [the docs](https://example.com)")).toBe(
      "See the docs"
    );
  });

  it("strips Markdown formatting without escaping literal characters", async () => {
    expect(
      await markdownToText("Hello **world** with _emphasis_ and `code`")
    ).toBe("Hello world with emphasis and code");
    expect(await markdownToText("Title with under_score and a*b")).toBe(
      "Title with under_score and a*b"
    );
  });

  it("strips formatting HTML tags while keeping their text content", async () => {
    expect(await markdownToText("<b>Bold</b> and <i>italic</i>")).toBe(
      "Bold and italic"
    );
  });
  it("strips structural HTML tags", async () => {
    expect(await markdownToText("<div>A title</div>")).toBe("");
    expect(
      await markdownToText(
        "<section><p>First paragraph.</p><p>Second.</p></section>"
      )
    ).toBe("");
  });

  it("normalizes to NFC", async () => {
    const decomposed = "cafe\u0301"; // "e" + combining acute accent (U+0301)
    const composed = "caf\u00e9"; // precomposed "e with acute" (U+00E9)
    // Confirm these two representations are actually different before
    // normalization, otherwise the assertion below would not prove anything.
    expect(decomposed).not.toEqual(composed);
    expect(decomposed.normalize("NFC")).toBe(composed);

    expect(await markdownToText(decomposed)).toBe(composed);
  });

  it("leaves empty strings untouched", async () => {
    expect(await markdownToText("")).toBe("");
  });

  it("normalizes non-breaking spaces to regular spaces", async () => {
    expect(
      await markdownToText("high-throughput _C.\u00A0elegans_\u00A0imaging")
    ).toBe("high-throughput C. elegans imaging");
  });
});
