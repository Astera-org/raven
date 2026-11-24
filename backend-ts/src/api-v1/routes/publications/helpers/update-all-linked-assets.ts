import { Repositories } from "#v1/db-repositories/index.js";
import { type LinkedUpdateAsset } from "#v1/routes/publications/route-requests/patch-publication.js";

// Using  makes a hard divider so 41+Author doesn't collide with 4+1Author
function key(c: { url: string; type: string }): string {
  return `${c.url}${c.type}`;
}

export async function updateAllLinkedAssets(
  versionId: string,
  newLinkedAssets: LinkedUpdateAsset | undefined
): Promise<boolean> {
  if (newLinkedAssets === undefined) {
    return false;
  }

  /**
   * Wrap the entire operation in a transaction so that if any part fails, the
   * entire operation is rolled back.
   */
  await new Repositories().transaction(async (repos) => {
    const currentAssets = await repos.versions.listLinkedAssets(versionId);

    /**
     * Create maps and sets for easy lookup for finding orgs to delete,
     * insert, and update.
     */
    const existingByKey = new Map(currentAssets.map((a) => [key(a), a]));
    const incomingKeys = new Set(newLinkedAssets.map((a) => key(a)));

    /**
     * Filter which to delete, insert, and update
     */
    const toDelete = currentAssets.filter((a) => !incomingKeys.has(key(a)));
    const toInsert = newLinkedAssets.filter((a) => !existingByKey.has(key(a)));
    const toUpdate = newLinkedAssets.filter((a) => {
      const found = existingByKey.get(key(a));
      return found && found.name !== a.name;
    });

    /**
     * Delete all assets that are not in the new list in a single statement.
     */
    if (toDelete.length) {
      await repos.versions.deleteLinkedAssets(
        versionId,
        toDelete.map(({ url, type }) => ({ url, type }))
      );
    }

    /**
     * Update all assets that are in the new list but have different
     * in_byline or priority values.
     *
     * These are the only two fields that are not part of the unique key, so
     * they are the only fieldsd that can be updated.
     */
    for (const updateAsset of toUpdate) {
      await repos.versions.updateLinkedAssetName(
        versionId,
        updateAsset.url,
        updateAsset.type,
        updateAsset.name
      );
    }

    /**
     * Insert all assets that are in the new list but not in the old
     * list.
     */
    if (toInsert.length) {
      await repos.versions.createLinkedAssets(versionId, toInsert);
    }
  });

  return true;
}
