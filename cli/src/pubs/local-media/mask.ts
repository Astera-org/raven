import { HTML_MEDIA_ATTRIBUTES } from "./html.js";
import { isInlineLiteral, type MystNode, visit } from "./parse.js";
import { ASCII_PUNCTUATION, escapeRegExp } from "./patterns.js";

/** An HTML comment, or one left open, which hides the rest of the block. */
const HTML_COMMENT = /<!--[\s\S]*?(?:-->|$)/g;

/**
 * The source's lines with code spans, role contents, inline math and HTML
 * comments blanked out, keeping every other offset. They may run over several
 * lines of their block, so each block that holds one is masked as a whole.
 * Link titles, HTML attributes other than a media element's `src` or
 * `poster`, and a `src=` outside an HTML tag are blanked out too, since a
 * path written in them is text, not a destination.
 */
export function withoutInlineCode(source: string, tree: MystNode): string[] {
  const lines = source.split("\n");
  const blocks = new Map<
    number,
    { end: number; math: string[]; comments: boolean }
  >();
  visit(tree, undefined, (node, range, parent) => {
    const isComment = node.type === "html" && !!node.value?.includes("<!--");
    if (!range || (!isInlineLiteral(node, parent) && !isComment)) return;
    const block = blocks.get(range[0]) ?? {
      end: range[1],
      math: [],
      comments: false,
    };
    if (isComment) {
      block.comments = true;
    } else if (node.type !== "inlineCode" && node.type !== "mystRole") {
      block.math.push(node.value ?? "");
    }
    blocks.set(range[0], block);
  });
  for (const [start, { end, math, comments }] of blocks) {
    const block = lines.slice(start - 1, end).join("\n");
    const masked = maskInlineLiterals(block, math);
    const unmasked = comments ? maskComments(masked) : masked;
    lines.splice(start - 1, end - start + 1, ...unmasked.split("\n"));
  }
  return maskHtml(maskLinkTitles(lines.join("\n"))).split("\n");
}

/**
 * Replaces each match in the masked line, in the line and its mask alike, so
 * they stay aligned for the next target.
 */
export function replaceOutsideCode(
  { text, masked }: { text: string; masked: string },
  pattern: RegExp,
  replacement: string
): [string, string] {
  let result = "";
  let resultMask = "";
  let last = 0;
  for (const match of masked.matchAll(pattern)) {
    result += text.slice(last, match.index) + replacement;
    resultMask += masked.slice(last, match.index) + replacement;
    last = match.index + match[0].length;
  }
  return [result + text.slice(last), resultMask + masked.slice(last)];
}

/**
 * Blanks out code spans and each `$…$` or `$$…$$` holding one of the math
 * values, in one pass from the start, so neither is looked for inside the
 * other: a backtick in math opens no code span, and math-like text in a code
 * span isn't math.
 *
 * A code span is a backtick run up to the next run of the same length. A
 * backslash escapes the character after it outside a span, so an escaped
 * backtick or dollar opens nothing; inside one it's literal, as CommonMark
 * has it. `mystParse` keeps a math value as written between its delimiters,
 * apart from the line breaks around a `$$` pair on lines of its own; a value
 * not found as written is skipped.
 */
function maskInlineLiterals(text: string, math: string[]): string {
  const mathPatterns = math.map(
    (value) =>
      new RegExp(
        String.raw`\$${escapeRegExp(value)}\$|\$\$\s*${escapeRegExp(value)}\s*\$\$`,
        "y"
      )
  );
  let nextMath = 0;
  const matchMathAt = (index: number) => {
    for (let i = nextMath; i < mathPatterns.length; i++) {
      const pattern = mathPatterns[i]!;
      pattern.lastIndex = index;
      const match = pattern.exec(text);
      if (!match) continue;
      nextMath = i + 1;
      return match[0];
    }
    return undefined;
  };
  let result = "";
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === "\\" && ASCII_PUNCTUATION.test(text[index + 1] ?? "")) {
      result += text.slice(index, index + 2);
      index += 2;
      continue;
    }
    const mathSpan = char === "$" ? matchMathAt(index) : undefined;
    if (mathSpan) {
      result += blank(mathSpan);
      index += mathSpan.length;
      continue;
    }
    if (char !== "`") {
      result += char;
      index += 1;
      continue;
    }
    const opening = /^`+/.exec(text.slice(index))?.[0] ?? "`";
    const closing = new RegExp(`(?<!\`)${opening}(?!\`)`, "g");
    closing.lastIndex = index + opening.length;
    const end = closing.exec(text);
    if (!end) {
      result += opening;
      index += opening.length;
      continue;
    }
    const spanEnd = end.index + opening.length;
    result += blank(text.slice(index, spanEnd));
    index = spanEnd;
  }
  return result;
}

function maskComments(text: string): string {
  return text.replace(HTML_COMMENT, (comment) => blank(comment));
}

const LINK_TITLE = String.raw`"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^()\\])*\)`;

const INLINE_LINK_TITLE = new RegExp(
  String.raw`(\]\(\s*(?:<(?:\\.|[^<>\n\\])*>|(?:\\.|\((?:\\.|[^\s()\\])*\)|[^\s()\\])+)\s+)(${LINK_TITLE})(?=\s*\))`,
  "g"
);

const DEFINITION_TITLE = new RegExp(
  String.raw`(^[ >]*\[[^\]]+\]:\s*(?:<[^<>\n]*>|\S+)\s+)(${LINK_TITLE})(?=[ \t]*$)`,
  "gm"
);

/**
 * Blanks out the titles of inline links and images and of reference
 * definitions. A title may run over several lines, so they're found in the
 * whole text.
 */
function maskLinkTitles(text: string): string {
  const maskTitle = (_: string, before: string, title: string) =>
    before + blank(title);
  return text
    .replace(INLINE_LINK_TITLE, maskTitle)
    .replace(DEFINITION_TITLE, maskTitle);
}

/** An HTML tag, but not a destination written in angle brackets. */
const HTML_TAG = /(?<!\]\(\s*|^[ >]*\[[^\]]+\]:\s*)<[A-Za-z][^<>]*>/gm;

const HTML_TAG_NAME = /^<([^\s/>]+)/;

const HTML_ATTRIBUTE =
  /(\s)([^\s"'>/=]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;

const SRC_ATTRIBUTE = /\b(?:src|poster)(?=\s*=)/gi;

/**
 * Blanks out every attribute of an HTML tag but a media element's `src` and
 * `poster`, and `src` and `poster` written outside a tag, as in prose. A tag
 * may run over several lines, so tags are found in the whole text.
 */
function maskHtml(text: string): string {
  const maskSrc = (outside: string) =>
    outside.replace(SRC_ATTRIBUTE, (src) => blank(src));
  let result = "";
  let last = 0;
  for (const tag of text.matchAll(HTML_TAG)) {
    result += maskSrc(text.slice(last, tag.index)) + maskAttributes(tag[0]);
    last = tag.index + tag[0].length;
  }
  return result + maskSrc(text.slice(last));
}

function maskAttributes(tag: string): string {
  const element = HTML_TAG_NAME.exec(tag)?.[1]?.toLowerCase() ?? "";
  const media = HTML_MEDIA_ATTRIBUTES.get(element) ?? [];
  return tag.replace(
    HTML_ATTRIBUTE,
    (attribute: string, space: string, name: string) =>
      media.includes(name.toLowerCase())
        ? attribute
        : space + blank(attribute.slice(space.length))
  );
}

function blank(text: string): string {
  return text.replace(/[^\n]/g, "\0");
}
