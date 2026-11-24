import { getConfig } from "#src/config.js";
import { getDb } from "#src/db/index.js";
import { formatCslJson } from "#src/lib/bibliography/format-csl-json.js";
import { isMystContent } from "#src/lib/importers/document-formats.js";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";
import {
  MdastUnavailableError,
  mystReferenceUrls,
  type PublicationContent,
} from "./myst/mdast-cache.js";
import { isDoiUrl, normalizeReferenceUrl } from "./reference-url.js";

interface Reference {
  text: string;
  url: string;
}

export interface ReferenceStats {
  /** Distinct reference URLs found in this version's content. */
  totalUrls: number;
  /** New rows inserted into `references` (URL not previously seen). */
  referencesCreated: number;
  /** Existing `references` rows whose text changed. */
  referencesUpdated: number;
  /** `version_references` rows newly linked to this version. */
  linksAdded: number;
  /** `version_references` rows unlinked from this version. */
  linksRemoved: number;
  /** URLs whose `references` row was created/updated   */
  changedUrls: string[];
}

const emptyStats: ReferenceStats = {
  totalUrls: 0,
  referencesCreated: 0,
  referencesUpdated: 0,
  linksAdded: 0,
  linksRemoved: 0,
  changedUrls: [],
};

// ---------------------------------------------------------------------------
// URL extraction
// ---------------------------------------------------------------------------

export function extractRefUrls(content: string): string[] {
  // Markdown: [](<url>), excluding images
  const mdPattern =
    /(?<!!)\[\s*\]\((https?:\/\/[^\s()]*(?:\([^\s()]*\)[^\s()]*)*)\)/gi;
  // HTML: <a href="url"></a> or <a href="url" />
  const htmlPattern =
    /<a\b[^>]*\bhref\b\s*=\s*["']([^"']+)["'][^>]*(?:\/\s*>|>\s*<\/a>)/gi;

  const matches: Array<[number, string]> = [];
  let m: RegExpExecArray | null;

  while ((m = mdPattern.exec(content)) !== null) {
    matches.push([m.index, normalizeReferenceUrl(m[1]!.replace(/\\/g, ""))]);
  }
  while ((m = htmlPattern.exec(content)) !== null) {
    const url = m[1]!.trim();
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.startsWith("http://") || lowerUrl.startsWith("https://")) {
      matches.push([m.index, normalizeReferenceUrl(url)]);
    }
  }

  matches.sort((a, b) => a[0] - b[0]);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const [, url] of matches) {
    if (!seen.has(url)) {
      seen.add(url);
      result.push(url);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// BibTeX formatting
// ---------------------------------------------------------------------------

function cleanBibtexText(value: string): string {
  return value
    .replace(/\\url\{([^}]*)\}/gi, "$1")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBibtexField(content: string, field: string): string | null {
  const pattern = new RegExp(
    `${field}\\s*=\\s*(?:\\{([^{}]*(?:\\{[^{}]*\\}[^{}]*)*)\\}|"([^"]*)")`,
    "i"
  );
  const match = pattern.exec(content);
  const value = match?.[1] ?? match?.[2];
  return value ? cleanBibtexText(value) : null;
}

function formatBibtexAuthors(authorField: string): string {
  return authorField
    .split(/\s+and\s+/i)
    .map((author) => {
      const trimmed = author.trim();
      if (!trimmed.includes(",")) return trimmed;
      const [family, given] = trimmed.split(",", 2).map((part) => part.trim());
      const initials = given
        ? given
            .split(/\s+/)
            .map((part) => (part[0] ? `${part[0]}.` : ""))
            .join(" ")
        : "";
      return `${family} ${initials}`.trim();
    })
    .filter(Boolean)
    .join(", ");
}

function formatBibtex(content: string): string {
  const title = extractBibtexField(content, "title") ?? "Untitled";
  const year = extractBibtexField(content, "year") ?? "n.d.";
  const authors = extractBibtexField(content, "author");
  const formattedAuthors = authors ? formatBibtexAuthors(authors) : "";
  const authorStr = formattedAuthors
    ? `${formattedAuthors}${formattedAuthors.endsWith(".") ? " " : ". "}`
    : "";
  const sep = title.endsWith(".") ? "" : ".";
  return `${authorStr}(${year}). ${title}${sep}`;
}

export function buildBibtexUrlToFormattedTextMap(
  content: string
): Map<string, string> {
  const urlToText = new Map<string, string>();
  const blockPattern = /:::bibtex\s*([\s\S]*?)\s*:::/gi;
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(content)) !== null) {
    for (const entry of splitBibtexEntries(match[1] ?? "")) {
      const url =
        extractBibtexField(entry, "url") ??
        extractBibtexField(entry, "howpublished");
      if (!url || !/^https?:\/\//i.test(url)) continue;

      const formattedText = formatBibtex(entry);
      if (formattedText) urlToText.set(url.toLowerCase(), formattedText);
    }
  }

  return urlToText;
}

// A block may hold several entries, each starting with `@` on its own line.
function splitBibtexEntries(blockContent: string): string[] {
  return blockContent
    .split(/^(?=[ \t]*@)/m)
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("@"));
}

// ---------------------------------------------------------------------------
// DOI enrichment (basic CSL-JSON fetch)
// ---------------------------------------------------------------------------

// Swaps the doi.org URL's origin for the configured resolver (real doi.org in
// production, a mock in tests - see DOI_RESOLVER_API), keeping its path/query
// (the DOI itself) intact.
function resolveDoiFetchUrl(doiUrl: string): string {
  const original = new URL(doiUrl);
  return `${getConfig().DOI_RESOLVER_API}${original.pathname}${original.search}`;
}

async function fetchCslJson(
  doiUrl: string
): Promise<Record<string, unknown> | null> {
  try {
    const resp = await fetch(resolveDoiFetchUrl(doiUrl), {
      headers: { Accept: "application/vnd.citationstyles.csl+json" },
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) return resp.json() as Promise<Record<string, unknown>>;
  } catch {
    return null;
  }
  return null;
}

async function enrichDoiUrl(url: string): Promise<Reference> {
  const data = await fetchCslJson(url);
  const text = data ? formatCslJson(data) : "";
  return { text, url };
}

async function formatDoiUrls(urls: string[]): Promise<Reference[]> {
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const results: Reference[] = [];
  await Promise.all(
    urls.map(async (url, i) => {
      await delay(i * 50);
      try {
        results[i] = await enrichDoiUrl(url);
      } catch {
        results[i] = { text: "", url };
      }
    })
  );
  return results;
}

// ---------------------------------------------------------------------------
// Shared: upsert `references` rows for a content's URLs (extraction, DOI
// enrichment, bibtex formatting). Does not touch version_references - each
// caller below reconciles links its own way.
// ---------------------------------------------------------------------------

interface UpsertedRefs {
  urlToId: Map<string, number>;
  urlToUlid: Map<string, string>;
  referencesCreated: number;
  referencesUpdated: number;
  changedUrls: string[];
}

async function upsertReferenceRows(
  urls: string[],
  content: string
): Promise<UpsertedRefs> {
  const db = getDb();

  const placeholders = sql.join(
    urls.map((u) => sql`${u}`),
    sql`, `
  );
  const existingRows = await db.execute(
    sql`SELECT id_int, url, text FROM \`references\` WHERE url IN (${placeholders})`
  );
  const existing = new Map<string, { id: number; text: string }>();
  for (const row of existingRows[0] as unknown as Array<{
    id: number;
    url: string;
    text: string;
  }>) {
    existing.set(row.url, { id: row.id, text: row.text });
  }

  // DOI enrichment
  const doiUrls = urls.filter(isDoiUrl);
  const doiUrlsToFormat = doiUrls.filter((u) => !existing.get(u)?.text);
  const doiRefs = await formatDoiUrls(doiUrlsToFormat);
  const doiRefMap = new Map<string, string>(
    doiRefs.map((r) => [r.url, r.text])
  );
  const bibtexRefMap = buildBibtexUrlToFormattedTextMap(content);

  const allRefs: Reference[] = urls.map((url) => {
    const existingText = existing.get(url)?.text ?? "";
    const text = isDoiUrl(url)
      ? (doiRefMap.get(url) ?? existingText)
      : (bibtexRefMap.get(url.toLowerCase()) ?? existingText);
    return { url, text };
  });

  let referencesCreated = 0;
  let referencesUpdated = 0;
  const changedUrls: string[] = [];
  for (const ref of allRefs) {
    const priorRef = existing.get(ref.url);
    if (!priorRef) {
      referencesCreated++;
      changedUrls.push(ref.url);
    } else if (priorRef.text !== (ref.text || "")) {
      referencesUpdated++;
      changedUrls.push(ref.url);
    }

    await db.execute(
      sql`INSERT INTO \`references\` (url, text, updated_at, id) VALUES (${ref.url}, ${ref.text || ""}, NOW(), ULID()) ON DUPLICATE KEY UPDATE text = VALUES(text), updated_at = VALUES(updated_at)`
    );
  }

  const joinedUrls = sql.join(
    urls.map((u) => sql`${u}`),
    sql`, `
  );
  const updatedRows = await db.execute(
    sql`SELECT id_int, id, url FROM \`references\` WHERE url IN (${joinedUrls})`
  );
  const refRows = updatedRows[0] as unknown as Array<{
    id_int: number;
    id: string;
    url: string;
  }>;
  const urlToId = new Map<string, number>(
    refRows.map((r) => [r.url, r.id_int])
  );
  const urlToUlid = new Map<string, string>(refRows.map((r) => [r.url, r.id]));

  return {
    urlToId,
    urlToUlid,
    referencesCreated,
    referencesUpdated,
    changedUrls,
  };
}

async function getVersionUlid(versionId: number): Promise<string | null> {
  return getDb()
    .execute(sql`SELECT id FROM versions WHERE id_int = ${versionId}`)
    .then((r) => (r[0] as unknown as Array<{ id: string }>)[0]?.id ?? null);
}

// ---------------------------------------------------------------------------
// Fast path: create/update. Same reconciliation as extractAndStoreReferences
// below, just discarding the stats - callers run this fire-and-forget.
// ---------------------------------------------------------------------------

export async function extractAndStoreReferencesFast(
  versionId: number,
  content: string
): Promise<void> {
  await extractAndStoreReferences(versionId, content);
}

// ---------------------------------------------------------------------------
// Full path: publish. Reconciles version_references exactly to the content's
// current URLs and reports stats (created/updated/added/removed) for
// logging.
// ---------------------------------------------------------------------------

/** @todo update to ulids */
export async function extractAndStoreReferences(
  versionId: number,
  content: string
): Promise<ReferenceStats> {
  return storeReferenceUrls(versionId, extractRefUrls(content), content);
}

/**
 * Stores a version's references: MyST versions in the AST's citation order
 * (`mystReferenceUrls`), so the stored references match what thestacks.org
 * renders, and every other version by `extractRefUrls`.
 *
 * A cited entry of the version's own bibliography is one of them when it has
 * a DOI or a URL to be a reference to. Its text isn't written here: a
 * `references` row's text is shared by every version citing that URL, while
 * an entry's text is the author's and travels in the AST.
 *
 * @todo update to ulids
 */
export async function extractAndStoreVersionReferences(
  versionId: number,
  {
    format,
    abstract,
    body,
    bibliography,
    frontmatter,
  }: PublicationContent & { format: string | null | undefined }
): Promise<ReferenceStats> {
  const content = `${abstract ?? ""}\n${body ?? ""}`;
  if (!isMystContent(format)) {
    return extractAndStoreReferences(versionId, content);
  }
  try {
    return await storeReferenceUrls(
      versionId,
      mystReferenceUrls({ abstract, body, bibliography, frontmatter }),
      content
    );
  } catch (e) {
    if (!(e instanceof MdastUnavailableError)) throw e;
    // Too large to build: the links are still worth keeping.
    logger.warn(
      { versionId, reason: e.reason },
      "Storing references by regex: the MyST AST is unavailable"
    );
    return extractAndStoreReferences(versionId, content);
  }
}

/**
 * Reconciles `version_references` exactly to `urls`. `content` supplies the
 * text of BibTeX references.
 *
 * @todo update to ulids
 */
export async function storeReferenceUrls(
  versionId: number,
  urls: string[],
  content: string
): Promise<ReferenceStats> {
  try {
    const db = getDb();

    // Ensure references are removed from version if it has no urls left
    if (urls.length === 0) {
      const result = await db.execute(
        sql`DELETE FROM version_references WHERE version_id_int = ${versionId}`
      );
      const linksRemoved = (result[0] as unknown as { affectedRows: number })
        .affectedRows;
      return { ...emptyStats, linksRemoved };
    }

    const priorLinkRows = await db.execute(
      sql`SELECT reference_id_int FROM version_references WHERE version_id_int = ${versionId}`
    );
    const priorRefIds = new Set(
      (priorLinkRows[0] as unknown as Array<{ reference_id_int: number }>).map(
        (r) => r.reference_id_int
      )
    );

    const {
      urlToId,
      urlToUlid,
      referencesCreated,
      referencesUpdated,
      changedUrls,
    } = await upsertReferenceRows(urls, content);
    const versionUlid = await getVersionUlid(versionId);

    // Delete + reinsert version_references (priorRefIds was fetched up front)
    await db.execute(
      sql`DELETE FROM version_references WHERE version_id_int = ${versionId}`
    );
    const changedUrlSet = new Set(changedUrls);
    const newRefIds = new Set<number>();
    for (const url of urls) {
      const refId = urlToId.get(url);
      if (refId) {
        newRefIds.add(refId);
        if (!priorRefIds.has(refId)) changedUrlSet.add(url);
        const refUlid = urlToUlid.get(url) ?? null;
        await db.execute(
          sql`INSERT IGNORE INTO version_references (version_id_int, reference_id_int, id, version_id, reference_id) VALUES (${versionId}, ${refId}, ULID(), ${versionUlid}, ${refUlid})`
        );
      }
    }

    let linksAdded = 0;
    for (const refId of newRefIds) {
      if (!priorRefIds.has(refId)) linksAdded++;
    }
    let linksRemoved = 0;
    for (const refId of priorRefIds) {
      if (!newRefIds.has(refId)) linksRemoved++;
    }

    return {
      totalUrls: urls.length,
      referencesCreated,
      referencesUpdated,
      linksAdded,
      linksRemoved,
      changedUrls: [...changedUrlSet],
    };
  } catch (e) {
    logger.error(
      { error: e, versionId },
      `Error extracting/storing references for version ${versionId}:`
    );
    throw e;
  }
}
