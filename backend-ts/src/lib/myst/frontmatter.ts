import { type MystFrontmatter } from "@raven/core-import-format";
import {
  type PageFrontmatter,
  validatePageFrontmatter,
} from "myst-frontmatter";

export type RenderingFrontmatter = Pick<PageFrontmatter, "numbering" | "math">;

/**
 * The stored frontmatter as `myst-transforms` reads it. It was validated on
 * import, so validating again only gives it `myst-frontmatter`'s types; a
 * value that no longer validates is left out.
 */
export function renderingFrontmatter(
  frontmatter: MystFrontmatter | null | undefined
): RenderingFrontmatter {
  if (!frontmatter) return {};
  const { numbering, math } = validatePageFrontmatter(
    { numbering: frontmatter.numbering, math: frontmatter.math },
    { property: "frontmatter", messages: {} }
  );
  return {
    ...(numbering ? { numbering } : {}),
    ...(math ? { math } : {}),
  };
}

/**
 * What a hash includes for `frontmatter`: none when there is none, so hashes
 * of versions without it keep their earlier values, and otherwise its JSON
 * with sorted keys, since MySQL returns a JSON column's keys in its own order.
 */
export function frontmatterHashInput(
  frontmatter: MystFrontmatter | null | undefined
): string[] {
  if (!frontmatter || Object.keys(frontmatter).length === 0) return [];
  return [JSON.stringify(sortKeys(frontmatter))];
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => [key, sortKeys(item)])
  );
}
