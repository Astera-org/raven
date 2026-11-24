import { type GenericParent } from "myst-common";
import { MIGRATIONS, migrate } from "myst-migrate";

/**
 * The MyST AST version Raven builds, as `myst-migrate` counts it. It is a
 * literal rather than `MIGRATIONS.length`, so a `myst-*` upgrade that adds a
 * migration fails the unit test until it is bumped on purpose.
 */
export const MYST_AST_VERSION = 3;

/** `MIGRATIONS.length` of the installed `myst-migrate`, for that unit test. */
export const MYST_MIGRATE_VERSION = MIGRATIONS.length;

/** The version of the payload wrapper and our conventions inside the tree. */
export const MDAST_SCHEMA_VERSION = 1;

/**
 * The schemas Raven can produce. After a breaking change, the previous schema
 * stays here for a deprecation period agreed with thestacks.org.
 */
export const SUPPORTED_MDAST_SCHEMAS: readonly number[] = [
  MDAST_SCHEMA_VERSION,
];

/**
 * Bump whenever the transform list changes in a way that alters the output.
 * It is part of the cache key and the `ETag`, but not of the contract.
 */
export const MDAST_PIPELINE_VERSION = 3;

/**
 * Downgrades a payload built at `MYST_AST_VERSION` when the client asked for
 * an older AST version. A missing, current or newer request leaves the payload
 * as it is: the client upgrades it with its own `migrate()`.
 */
export async function toRequestedVersion<
  T extends { version: number; tree: GenericParent },
>(payload: T, requested: number | undefined): Promise<T> {
  if (requested === undefined || requested >= payload.version) return payload;

  // migrate() rewrites the tree in place, and the payload may be shared.
  const migrated = await migrate(
    { version: payload.version, mdast: structuredClone(payload.tree) },
    { to: requested }
  );
  return {
    ...payload,
    version: migrated.version,
    tree: migrated.mdast as GenericParent,
  };
}
