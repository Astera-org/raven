import { type RavenDbClient } from "#src/db/index.js";
import { publications, versions } from "#src/db/schema.js";
import {
  and,
  eq,
  inArray,
  not,
  notExists,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";

/**
 * Joins each publication to the version the admin list and detail serve.
 * `latestVersionNumber` only moves on publish. A never-published draft that
 * was deleted and recreated lives at a higher version number, so
 * never-published publications join their non-deleted version instead. v0
 * can remove a never-published publication, so removed publications fall
 * into either case.
 */
export function adminCurrentVersion(db: RavenDbClient): SQL | undefined {
  const publishedVersions = alias(versions, "published_versions");
  return and(
    eq(versions.publicationId, publications.id),
    or(
      // A removed publication that was published joins its last version,
      // the one it was removed with.
      and(
        inArray(publications.state, ["PUBLISHED", "DELETED"]),
        eq(versions.versionNumber, publications.latestVersionNumber),
        eq(versions.state, "PUBLISHED")
      ),
      and(
        inArray(publications.state, ["DRAFT", "DELETED"]),
        not(eq(versions.state, "DELETED")),
        notExists(
          db
            .select({ one: sql<number>`1` })
            .from(publishedVersions)
            .where(
              and(
                eq(publishedVersions.publicationId, publications.id),
                eq(publishedVersions.state, "PUBLISHED")
              )
            )
        )
      )
    )
  );
}
