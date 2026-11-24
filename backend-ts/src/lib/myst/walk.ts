import { type GenericNode } from "myst-common";

/**
 * Visits every node depth-first, parents before children, in document order.
 * `unist-util-visit` is off limits here (see `eslint.config.ts`).
 */
export function walk(
  node: GenericNode,
  visit: (node: GenericNode, parent: GenericNode | undefined) => void,
  parent?: GenericNode
): void {
  visit(node, parent);
  for (const child of node.children ?? []) walk(child, visit, node);
}
