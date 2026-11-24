/**
 * Idempotent backfill: re-extracts reference URLs from every version's
 * abstract/body and re-upserts them into `references` / `version_references`.
 *
 * Exists to re-normalize casing for existing rows now that `references.url`
 * enforces case-sensitive comparison (utf8mb4_bin) and doi.org URLs are
 * canonicalized to lowercase — see extractAndStoreReferences. Safe to re-run:
 * each call upserts references by URL and replaces a version's
 * version_references rows outright.
 *
 * A re-cased URL lands in a new `references` row rather than updating the old
 * one in place (the two are distinct strings once collation is case-sensitive),
 * so once every version has been processed, deleteOrphanedReferences sweeps
 * any row nothing links to anymore.
 */
import { initConfig } from "#src/config.js";
import { closeDb, getDb, initDb } from "#src/db/index.js";
import { versions } from "#src/db/schema.js";
import {
  extractAndStoreReferences,
  type ReferenceStats,
} from "#src/lib/references.js";
import { asc, gt, sql } from "drizzle-orm";

// Est. ~10MB max per batch.
const BATCH_SIZE = 100;

/** Overwrites the current terminal line, clamped to the terminal width so a
 * long line can't soft-wrap and break the in-place update. */
function writeProgressLine(text: string) {
  const width = process.stdout.columns;
  const line = width && width > 1 ? text.slice(0, width - 1) : text;
  process.stdout.write(`\r${line}\x1b[K`);
}

/**
 * Generator that yields all versions in the database in batches of BATCH_SIZE.
 * @param db The database connection object.
 * @returns An async generator yielding version records in batches.
 */
async function* iterateVersions(db: ReturnType<typeof getDb>) {
  let cursor = 0;
  while (true) {
    const batch = await db.query.versions.findMany({
      columns: { idInt: true, versionNumber: true, abstract: true, body: true },
      where: gt(versions.idInt, cursor),
      orderBy: asc(versions.idInt),
      limit: BATCH_SIZE,
      with: {
        publication_publicationIdInt: { columns: { slug: true } },
      },
    });
    if (batch.length === 0) return;
    for (const version of batch) yield version;
    cursor = batch[batch.length - 1]!.idInt;
  }
}

/**
 * Deletes `references` rows with no `version_references` pointing to them.
 *
 * Re-extracting a version under the case-sensitive utf8mb4_bin collation can
 * insert a new, correctly-cased row for a URL that previously existed under
 * different casing (see migration 0012_make_reference_url_case_sensitive.sql)
 * - the version's links move to the new row, and the old row is left behind
 * with nothing pointing to it. Only rows untouched for `olderThanMs` qualify:
 * extractAndStoreReferences bumps a reference's updated_at on every upsert
 * (live traffic or backfill), so a row a concurrent request is mid-way
 * through re-pointing still looks "recently touched" and is skipped, even
 * though it's briefly unlinked between its DELETE and re-INSERT.
 */
export async function deleteOrphanedReferences(
  olderThanMs = 5 * 60 * 1000
): Promise<number> {
  const db = getDb();
  const cutoff = new Date(Date.now() - olderThanMs);
  const [result] = (await db.execute(
    sql`DELETE r FROM \`references\` r LEFT JOIN version_references vr ON vr.reference_id_int = r.id_int WHERE vr.reference_id_int IS NULL AND r.updated_at < ${cutoff}`
  )) as unknown as [{ affectedRows: number }];
  return result.affectedRows;
}

async function main() {
  initConfig(process.env.RAVEN_CONFIG || undefined);

  initDb();
  const db = getDb();

  const isTTY = process.stdout.isTTY;
  let count = 0;
  const failedVersionIds: number[] = [];
  const changedLines: string[] = [];
  const totals: Omit<ReferenceStats, "changedUrls"> = {
    totalUrls: 0,
    referencesCreated: 0,
    referencesUpdated: 0,
    linksAdded: 0,
    linksRemoved: 0,
  };
  try {
    for await (const version of iterateVersions(db)) {
      let stats: ReferenceStats;
      try {
        stats = await extractAndStoreReferences(
          version.idInt,
          `${version.abstract ?? ""}\n${version.body ?? ""}`
        );
      } catch (err) {
        if (isTTY) process.stdout.write("\n");
        // eslint-disable-next-line no-console
        console.error(`Failed to process version ${version.idInt}:`, err);
        failedVersionIds.push(version.idInt);
        continue;
      }

      /**
       * Everything below here is just output to the console.
       */
      if (stats.changedUrls.length > 0) {
        const pubSlug = version.publication_publicationIdInt?.slug ?? "?";
        for (const url of stats.changedUrls) {
          changedLines.push(`${pubSlug} v${version.versionNumber} ${url}`);
        }
      }
      totals.totalUrls += stats.totalUrls;
      totals.referencesCreated += stats.referencesCreated;
      totals.referencesUpdated += stats.referencesUpdated;
      totals.linksAdded += stats.linksAdded;
      totals.linksRemoved += stats.linksRemoved;
      count++;

      const progress = `Processed ${count} versions (refs +${totals.referencesCreated}/~${totals.referencesUpdated}, ver-refs +${totals.linksAdded}/-${totals.linksRemoved})`;
      if (isTTY) {
        writeProgressLine(progress);
      } else if (count % 500 === 0) {
        // eslint-disable-next-line no-console
        console.log(progress);
      }
    }
    if (isTTY) process.stdout.write("\n");
    // eslint-disable-next-line no-console
    console.log(`Done. Processed ${count} versions total.`);
    // eslint-disable-next-line no-console
    console.log(
      `References created: ${totals.referencesCreated}, updated: ${totals.referencesUpdated}`
    );
    // eslint-disable-next-line no-console
    console.log(
      `Version_references links added: ${totals.linksAdded}, removed: ${totals.linksRemoved}`
    );
    for (const line of changedLines) {
      // eslint-disable-next-line no-console
      console.log(line);
    }
    if (failedVersionIds.length > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `Failed versions (${failedVersionIds.length}): ${failedVersionIds.join(", ")}`
      );
      process.exitCode = 1;
      return;
    }

    // Re-casing a URL under the new case-sensitive collation leaves its old,
    // now-unlinked row behind (see deleteOrphanedReferences) - only safe to
    // sweep once every version above has been re-pointed to its correct row.
    const orphansDeleted = await deleteOrphanedReferences();
    // eslint-disable-next-line no-console
    console.log(`Orphaned references deleted: ${orphansDeleted}`);
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to backfill reference casing:", err);
  process.exit(1);
});
