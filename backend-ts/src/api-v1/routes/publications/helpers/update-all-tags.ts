import { type Repositories } from "#v1/db-repositories/index.js";
import { type TagUpdate } from "#v1/routes/publications/route-requests/patch-publication.js";

export async function updateAllTags(
  publicationId: string,
  newTags: TagUpdate | undefined,
  repositories: Repositories
): Promise<boolean> {
  if (newTags === undefined) {
    return false;
  }

  /**
   * Wrap the entire operation in a transaction so that if any part fails, the
   * entire operation is rolled back.
   */
  await repositories.transaction(async (repos) => {
    const currentTags = await repos.publications.listTags(publicationId);

    /**
     * Filter which to delete, insert, and update
     */
    const toDelete = currentTags.filter((t) => !newTags.includes(t));
    const toInsert = newTags.filter((t) => !currentTags.includes(t));

    /**
     * Delete all tags that are not in the new list in a single statement.
     */
    if (toDelete.length) {
      await repos.publications.deleteManyTags(publicationId, toDelete);
    }

    /**
     * Insert all tags that are in the new list but not in the old
     * list.
     */
    if (toInsert.length) {
      await repos.publications.createManyTags(publicationId, toInsert);
    }
  });

  return true;
}
