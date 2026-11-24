import { buttonRole } from "myst-ext-button";
import { cardDirective } from "myst-ext-card";
import { exerciseDirectives } from "myst-ext-exercise";
import { gridDirectives } from "myst-ext-grid";
import { proofDirective } from "myst-ext-proof";
import { tabDirectives } from "myst-ext-tabs";
import { mystParse } from "myst-parser";

export interface MystNode {
  type: string;
  name?: string;
  args?: string;
  url?: string;
  value?: string;
  position?: { start: { line: number }; end: { line: number } };
  children?: MystNode[];
}

/**
 * The extensions the server parses with (`PARSE_OPTIONS` in the backend's
 * `build-publication-mdast.ts`). Without them, the body of a directive such as
 * `{tab-item}` isn't parsed, and images in it would be missed.
 */
const PARSE_OPTIONS = {
  directives: [
    cardDirective,
    ...gridDirectives,
    proofDirective,
    ...exerciseDirectives,
    ...tabDirectives,
  ],
  roles: [buttonRole],
};

export function parseMyst(source: string): MystNode {
  return mystParse(source, PARSE_OPTIONS) as MystNode;
}

/** Blocks whose text is never Markdown, so never holds a path to rewrite. */
export const CODE_NODES = new Set(["code", "math"]);

/** Nodes that sit inside a line, rather than spanning lines of their own. */
const INLINE_NODES = new Set([
  "text",
  "image",
  "link",
  "emphasis",
  "strong",
  "inlineCode",
  "inlineMath",
  "html",
  "mystRole",
  "break",
]);

/** Nodes whose children are inline, so may hold inline HTML. */
export const INLINE_PARENTS = new Set([
  ...INLINE_NODES,
  "paragraph",
  "heading",
  "tableCell",
]);

/**
 * Calls `fn` with each node and the lines it may span. `mystParse` gives
 * inline nodes the first line of their paragraph, so they get the lines of
 * the block around them; nodes it creates for a directive have no position,
 * so they get the directive's.
 */
export function visit(
  node: MystNode,
  block: [number, number] | undefined,
  fn: (
    node: MystNode,
    lines: [number, number] | undefined,
    parent: MystNode | undefined
  ) => void,
  parent?: MystNode
): void {
  const own: [number, number] | undefined = node.position
    ? [node.position.start.line, node.position.end.line]
    : undefined;
  const inline = INLINE_NODES.has(node.type) || isMathInParagraph(node, parent);
  const lines = inline && block ? block : (own ?? block);
  fn(node, lines, parent);
  for (const child of node.children ?? []) visit(child, lines, fn, node);
}

/**
 * Inline code, a role (whose content is written as a code span), inline math,
 * and `$$…$$` math inside a paragraph, which `mystParse` makes a `math` node.
 */
export function isInlineLiteral(node: MystNode, parent: MystNode | undefined) {
  return (
    ["inlineCode", "mystRole", "inlineMath"].includes(node.type) ||
    isMathInParagraph(node, parent)
  );
}

export function isMathInParagraph(
  node: MystNode,
  parent: MystNode | undefined
) {
  return node.type === "math" && parent?.type === "paragraph";
}
