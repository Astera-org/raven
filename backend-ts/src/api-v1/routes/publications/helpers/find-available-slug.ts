import { Repositories } from "#v1/db-repositories/index.js";
import { MAX_SLUG_LENGTH } from "#v1/lib/schemas/slug.js";

// Long enough for any `-<n>` suffix the loop below could realistically reach.
const MAX_SUFFIX_LENGTH = 16;

/**
 * Returns the first free `<slug>-<n>` (n >= 2), truncating `slug` if needed to
 * stay within the maximum slug length. `ownSlug` is the publication's current
 * slug, which counts as free because the publication already holds it.
 */
export async function findAvailableSlug(
  slug: string,
  ownSlug: string
): Promise<string> {
  const taken = new Set(
    await new Repositories().publications.listSlugsWithPrefix(
      slug.slice(0, MAX_SLUG_LENGTH - MAX_SUFFIX_LENGTH)
    )
  );
  taken.delete(ownSlug);

  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const base = slug
      .slice(0, MAX_SLUG_LENGTH - suffix.length)
      .replace(/-$/, "");
    const candidate = `${base}${suffix}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}
