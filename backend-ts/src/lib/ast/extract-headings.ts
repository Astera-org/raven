// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../types/unist.d.ts" />
import GithubSlugger from "github-slugger";
import { type Root } from "mdast";
import remarkDirective from "remark-directive";
import remarkParse from "remark-parse";
import { unified } from "unified";
import toString from "unist-util-to-string-with-nodes";
import { SKIP, visit } from "unist-util-visit";

export interface Heading {
  depth: number;
  hasChildren: boolean;
  id: string;
  text: string;
}

/**
 * Returns an array of `Heading` objects from the given Markdown content.
 */
export function extractHeadings(markdown: string): Heading[] {
  const headings: Heading[] = [];
  const slugger = new GithubSlugger();
  const processor = unified().use(remarkParse).use(remarkDirective);
  const ast = processor.runSync(processor.parse(markdown)) as Root;

  visit(ast, (node) => {
    const { type } = node;

    if (
      type === "containerDirective" &&
      node.attributes?.class?.includes("bordered")
    ) {
      // Don't look for headings in bordered boxes.
      return SKIP;
    }

    if (node.type === "heading") {
      const { depth, children } = node;

      if (depth >= 1 && depth <= 2 && children && children.length > 0) {
        // Extract raw markdown using children's position offsets.
        const firstChild = children[0]!;
        const lastChild = children[children.length - 1]!;
        let text = markdown.slice(
          firstChild.position!.start.offset,
          lastChild.position!.end.offset
        );

        // Check for explicit ID: ## Heading {#id}
        // Only match {#...} pattern to avoid matching regular {curly braces}
        const idMatch = text.match(/\s*\{#([\w.-]+)\}\s*$/);
        let id: string;
        if (idMatch) {
          id = idMatch[1]!;
          text = text.replace(/\s*\{#[\w.-]+\}\s*$/, "").trim();
        } else {
          // Use plain text for the slug (keeps IDs URL-friendly).
          const plainText = toString(node).text.trim();
          id = slugger.slug(plainText);
        }

        headings.push({ depth, id, text, hasChildren: false });
      }
    }
  });

  // Determine which headings have children.
  for (let i = 0; i < headings.length; i++) {
    const current = headings[i]!;
    const next = headings[i + 1];

    // A heading has children if the next heading has a greater depth.
    if (next && next.depth > current.depth) {
      current.hasChildren = true;
    }
  }

  return headings;
}
