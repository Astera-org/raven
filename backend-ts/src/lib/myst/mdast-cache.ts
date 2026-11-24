import { getConfig } from "#src/config.js";
import { type VersionBibliography } from "#src/db/schema.js";
import { type CSL } from "#src/lib/bibliography/parse-bibliography.js";
import { logger } from "#src/lib/logger.js";
import { type MystFrontmatter } from "@raven/core-import-format";
import { LRUCache } from "lru-cache";
import { createHash } from "node:crypto";
import {
  buildPublicationMdast,
  type MdastMessage,
} from "./build-publication-mdast.js";
import { type MdastStats, mdastStats } from "./document-stats.js";
import { frontmatterHashInput } from "./frontmatter.js";
import { MDAST_PIPELINE_VERSION } from "./versions.js";

export interface PublicationContent {
  abstract: string | null | undefined;
  body: string | null | undefined;
  bibliography?: VersionBibliography | null;
  frontmatter?: MystFrontmatter | null;
}

export interface CachedMdast {
  /**
   * `sha256(MDAST_PIPELINE_VERSION, abstract, body, bibliography,
   * frontmatter)`, hex.
   */
  key: string;
  /**
   * The payload at `MYST_AST_VERSION`, serialised without `messages`, which
   * only draft responses carry (see `withMessages`).
   */
  json: string;
  messages: MdastMessage[];
  /** For `generateDocumentStats`, so JSON reads need not parse the tree. */
  stats: MdastStats;
  /**
   * The http(s) URLs of `citations.order`, kept beside the JSON so the write
   * path need not parse it. A cited bibliography entry with neither a DOI nor
   * a URL is identified by its citation key, and has no `references` row.
   */
  referenceUrls: string[];
  /** `citations.keys`: the bibliography entries the document cites. */
  citedKeys: string[];
  /**
   * The CSL-JSON of those entries, by citation key, so a read that exposes
   * them need not reparse the BibTeX files the AST was built from.
   */
  citedEntries: Record<string, CSL>;
  /**
   * `citedEntries` serialised, in bytes. Held beside them so the cache can
   * charge them to its budget without serialising on every eviction check.
   */
  citedEntriesBytes: number;
}

/** Why an AST cannot be served; routes answer both with 422. */
export class MdastUnavailableError extends Error {
  constructor(
    public readonly reason: "too-large" | "build-failed",
    message: string
  ) {
    super(message);
  }
}

export interface MdastCacheOptions {
  /**
   * Budget for the cached JSON and the cited entries beside it, in bytes;
   * 0 or less turns caching off.
   */
  maxBytes: number;
  /** Abstract plus body size above which nothing is built, in bytes. */
  maxSourceBytes: number;
}

export function mdastCacheKey({
  abstract,
  body,
  bibliography,
  frontmatter,
}: PublicationContent): string {
  // JSON keeps the fields apart, so moving text between them changes the key.
  return createHash("sha256")
    .update(
      JSON.stringify([
        MDAST_PIPELINE_VERSION,
        abstract ?? "",
        body ?? "",
        bibliography?.files ?? [],
        ...frontmatterHashInput(frontmatter),
      ])
    )
    .digest("hex");
}

/**
 * Builds publication ASTs and keeps them in memory, so a cache miss is the
 * only time the CPU-bound build blocks the event loop.
 */
export function createMdastCache({
  maxBytes,
  maxSourceBytes,
}: MdastCacheOptions) {
  // lru-cache refuses a budget of 0, so no budget means no cache at all.
  const cache =
    maxBytes > 0
      ? new LRUCache<string, CachedMdast>({
          maxSize: maxBytes,
          sizeCalculation: (entry) =>
            Math.max(
              1,
              Buffer.byteLength(entry.json) + entry.citedEntriesBytes
            ),
        })
      : undefined;

  function get(content: PublicationContent): CachedMdast {
    const key = mdastCacheKey(content);
    const cached = cache?.get(key);
    if (cached) return cached;

    const sourceBytes =
      Buffer.byteLength(content.abstract ?? "") +
      Buffer.byteLength(content.body ?? "");
    if (sourceBytes > maxSourceBytes) {
      throw new MdastUnavailableError(
        "too-large",
        `The abstract and body are ${sourceBytes} bytes; the MyST AST is only built up to ${maxSourceBytes}.`
      );
    }

    const started = performance.now();
    let entry: CachedMdast;
    try {
      const { messages, citedKeys, citedEntries, ...payload } =
        buildPublicationMdast(content);
      entry = {
        key,
        json: JSON.stringify(payload),
        messages,
        stats: mdastStats(payload.tree),
        referenceUrls: payload.citations.order.filter((identifier) =>
          /^https?:\/\//i.test(identifier)
        ),
        citedKeys,
        citedEntries,
        citedEntriesBytes: Buffer.byteLength(JSON.stringify(citedEntries)),
      };
    } catch (err) {
      logger.error({ err, key }, "Failed to build the MyST AST");
      throw new MdastUnavailableError(
        "build-failed",
        "The MyST AST could not be built."
      );
    }
    logger.info(
      {
        key,
        sourceBytes,
        astBytes: Buffer.byteLength(entry.json),
        ms: Math.round(performance.now() - started),
      },
      "Built the MyST AST"
    );
    // An entry larger than the whole budget is served but not kept.
    cache?.set(key, entry);
    return entry;
  }

  return {
    get,
    /**
     * The reference URLs a MyST publication cites, in citation order. Going
     * through the cache makes the write path agree with the AST and warms it.
     * A cited bibliography entry without a DOI or URL isn't one of them: its
     * text lives in the AST rather than in a shared `references` row.
     */
    referenceUrls: (content: PublicationContent): string[] => [
      ...get(content).referenceUrls,
    ],
    clear: () => cache?.clear(),
  };
}

let defaultCache: ReturnType<typeof createMdastCache> | undefined;

/** The process-wide cache, sized from config on first use. */
export function getMdastCache(): ReturnType<typeof createMdastCache> {
  defaultCache ??= createMdastCache({
    maxBytes: getConfig().MYST_MDAST_CACHE_BYTES,
    maxSourceBytes: getConfig().MYST_MDAST_MAX_SOURCE_BYTES,
  });
  return defaultCache;
}

/** `citations.order` for a MyST publication, through the process-wide cache. */
export function mystReferenceUrls(content: PublicationContent): string[] {
  return getMdastCache().referenceUrls(content);
}

/**
 * Adds `messages` to a cached payload without parsing it: the payload is a
 * serialised object, so it always ends with `}`.
 */
export function withMessages(json: string, messages: MdastMessage[]): string {
  return `${json.slice(0, -1)},"messages":${JSON.stringify(messages)}}`;
}
