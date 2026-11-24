import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import stripMarkdown from "strip-markdown";
import { unified } from "unified";

// Built once and reused across calls; unified processors are designed to be
// configured once and run through `.process()` many times.
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(stripMarkdown)
  .use(remarkStringify, {
    // Bypass the default `text` handler so literal characters like `_` or
    // `*` in the source text aren't backslash-escaped as they would be for
    // valid Markdown output.
    handlers: { text: (node: { value: string }) => node.value },
  });

function finalizeText(result: { toString(): string }): string {
  return (
    result
      .toString()
      // Additionally convert &nbsp; (U+00A0) to regular spaces
      .replace(/\u00A0/g, " ")
      .trim()
      .normalize("NFC")
  );
}

/**
 * Convert Markdown/HTML-formatted rich text (e.g. MyST source) into plain
 * text: strips HTML tags and Markdown formatting, then normalizes the
 * result to Unicode NFC.
 */
export async function markdownToText(markdown: string): Promise<string> {
  if (!markdown) return markdown;
  return finalizeText(await processor.process(markdown));
}

/** Synchronous `markdownToText`, for contexts like Zod refinements. */
export function markdownToTextSync(markdown: string): string {
  if (!markdown) return markdown;
  return finalizeText(processor.processSync(markdown));
}
