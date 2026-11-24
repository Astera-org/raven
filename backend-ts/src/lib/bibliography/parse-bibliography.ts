import { type VersionBibliography } from "#src/db/schema.js";
import { type ValidationIssue } from "#src/lib/middleware/validation-errors.js";
import {
  canonicalDoiUrl,
  normalizeReferenceUrl,
} from "#src/lib/reference-url.js";
import { type CSL, plugins } from "@citation-js/core";
import "@citation-js/plugin-bibtex";

/**
 * The input type is forced instead of letting citation-js detect it: content
 * that looks like a URL is detected as `@else/url`, which the core fetches
 * synchronously, so a `.bib` file holding a URL would make the server request
 * it. Forced, such a file parses to no entries and fetches nothing.
 *
 * citation-js's types mark every input option as required, though its parser
 * defaults the ones it isn't given.
 */
const PARSE_OPTIONS = {
  forceType: "@biblatex/text",
  generateGraph: false,
} as Parameters<typeof plugins.input.chain>[1];

/**
 * CSL-JSON as citation-js models it, re-exported so the rest of the backend
 * can name a parsed entry without importing citation-js itself: only this
 * directory may, since the parser fetches URL-looking input on its own.
 */
export type { CSL } from "@citation-js/core";

export interface BibliographyEntry {
  /** The citation key, as `{cite}` roles and `@key` references name it. */
  key: string;
  /** The file the entry was read from. */
  filename: string;
  entry: CSL;
  /**
   * The entry's DOI as a doi.org URL, else its `url` field, in the form
   * `references.url` stores. Null for an entry with neither, which stays out
   * of `references`.
   */
  referenceUrl: string | null;
}

export interface ParsedBibliography {
  /** Entries by citation key, each key keeping its last definition. */
  entries: Map<string, BibliographyEntry>;
  /**
   * What couldn't be used: a file that doesn't parse, and keys defined more
   * than once. Both are warnings — neither stops a draft from being
   * published — and are addressed as `["files", <index>]`, the path of the
   * file in a `PUT …/draft/bibliography` body.
   */
  issues: ValidationIssue[];
}

/**
 * Parses a version's BibTeX files into CSL-JSON entries by citation key,
 * as `mystmd` does: every file is read as BibLaTeX whatever its extension,
 * and a key defined more than once keeps its last definition, the files in
 * the order they were sent.
 *
 * A file with a syntax error contributes no entries at all, since the parser
 * can't tell where the broken entry ends; the rest of the files are still
 * read.
 */
export function parseBibliography(
  bibliography: VersionBibliography | null | undefined
): ParsedBibliography {
  const entries = new Map<string, BibliographyEntry>();
  const issues: ValidationIssue[] = [];

  (bibliography?.files ?? []).forEach(({ filename, content }, index) => {
    let parsed: CSL[];
    try {
      parsed = plugins.input.chain(content, PARSE_OPTIONS);
    } catch (e) {
      issues.push({
        code: "custom",
        path: ["files", index],
        message: `${filename} couldn't be read: ${parseErrorDetail(e)}`,
      });
      return;
    }

    for (const entry of parsed) {
      const key = String(entry["citation-key"] ?? entry.id);
      const previous = entries.get(key);
      if (previous) {
        issues.push({
          code: "custom",
          path: ["files", index],
          message:
            `${filename} defines ${key} again, after ${previous.filename}; ` +
            "citations of it use this definition",
        });
      }
      entries.set(key, { key, filename, entry, referenceUrl: entryUrl(entry) });
    }
  });

  return { entries, issues };
}

/**
 * The first line of a parse error, which names what was expected and where.
 * The rest is an excerpt of the file and the parser's rule stack.
 */
function parseErrorDetail(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  return message.split("\n")[0]!.trim();
}

/**
 * The URL an entry is a reference to: its DOI, resolved through doi.org, or
 * its `url` field when it has no DOI. Anything that isn't an http(s) URL is
 * left out, since that's all `references` can hold.
 *
 * Both fields are canonicalized through `canonicalDoiUrl`, so an entry whose
 * DOI is written `http://doi.org/…` or `https://dx.doi.org/…`, or whose
 * `url` is a doi.org link, gets the same identifier as a direct citation of
 * that DOI rather than a reference of its own.
 */
function entryUrl(entry: CSL): string | null {
  const doi = entry.DOI?.trim().replace(/^doi:\s*/i, "");
  if (doi) {
    const canonical = canonicalDoiUrl(doi);
    if (canonical) return canonical;
    // Not a DOI doi.org would resolve; kept as written all the same, since
    // it is what the author gave as the entry's identity.
    const url = /^https?:\/\//i.test(doi)
      ? doi
      : `https://doi.org/${doi.replace(/^\/+/, "")}`;
    return normalizeReferenceUrl(url);
  }
  const url = entry.URL?.trim();
  if (url && /^https?:\/\//i.test(url)) {
    return canonicalDoiUrl(url) ?? normalizeReferenceUrl(url);
  }
  return null;
}
