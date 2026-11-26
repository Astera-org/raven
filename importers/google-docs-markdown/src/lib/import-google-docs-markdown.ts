import {
  MAXIMUM_ALLOWED_DIRECTIVE_DEPTH,
  MaximumDirectiveDepthError,
} from "#src/errors/MaximumDirectiveDepthError.js";
import {
  ELEMENT_NODE,
  isGDocElement,
  isMystDirective,
  isPublicationMetadataKey,
  parseHtmlDocument,
  queryAll,
  TEXT_NODE,
  type GDocChildNode,
  type GDocDocument,
  type GDocElement,
  type GoogleDocImportOptions,
  type MystAttrs,
  type MystDirective,
  type MystNode,
  type PublicationMetadataKey,
} from "#src/types/google-docs.js";
import { ImporterError, type ImporterContext } from "@raven/core-import-format";
import {
  baseMarkdownToHtmlPipeline,
  normalizeEmphasisUnderscores,
  Platform,
  preSlugPipeline,
  processMystSync,
} from "@raven/core-myst-renderer";
import GithubSlugger from "github-slugger";
import type { Paragraph, Parent, Root, RootContent, Text } from "mdast";
import rehypeStringify from "rehype-stringify";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify, { type Options } from "remark-stringify";
import TurndownService from "turndown";
import { unified } from "unified";
import toString from "unist-util-to-string-with-nodes";
import type { VisitorResult } from "unist-util-visit";
import { CONTINUE, SKIP, visit } from "unist-util-visit";
import { VFile } from "vfile";
import { parse } from "./content-disposition.js";
import {
  DiagnosticCollector,
  endMarker,
  markerIds,
  startMarker,
  stripMarkers,
} from "./diagnostic-markers.js";

// #region Constants

// Convenience – specialised error when the document appears to be private.
const PRIVATE_DOC_ERROR =
  "The Google document appears to be private or requires sign-in. " +
  "Please set the sharing settings to “Anyone with the link can view” " +
  "and try again.";
const REMARK_STRINGIFY_OPTS: Options = { emphasis: "_", strong: "*" };
const BLOCK_ELEMENTS = new Set([
  "BLOCKQUOTE",
  "DIV",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "OL",
  "P",
  "TABLE",
  "UL",
]);
/** Elements that start a new paragraph in `plainTextFallback`. */
const FALLBACK_BREAKS = new Set([...BLOCK_ELEMENTS, "BR", "LI", "TD", "TH"]);
const INLINE_WRAPPERS = new Set([
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "S",
  "DEL",
  "SUP",
  "SUB",
  "SPAN",
]);

// #endregion

// #region Exports

export async function googleDocToMyst(
  docUrl: string,
  { fetch, logger, signal }: ImporterContext,
  options: GoogleDocImportOptions = {}
): Promise<{
  abstract: string;
  filename: string | null;
  diagnostics: DiagnosticCollector;
  html: string;
  myst: string;
  subtitle: string | null;
  title: string;
  version: string | undefined;
}> {
  const docId = extractGoogleDocId(docUrl);
  if (!docId) {
    throw new ImporterError(
      { code: "unsupported" },
      "Not a Google Docs document URL"
    );
  }
  const { html, filename } = await fetchGoogleDocHtml(docId, fetch, signal);
  let converted: ReturnType<GoogleDocConverter["convert"]>;
  try {
    converted = new GoogleDocConverter(options).convert(html);
  } catch (cause) {
    // Logged so new kinds of failure can be found and turned into diagnostics.
    logger.error({ err: cause, docId }, "Google Doc conversion failed");
    const reason = cause instanceof Error ? `: ${cause.message}` : ".";
    if (cause instanceof ImporterError) {
      throw cause;
    }
    throw new ImporterError(
      { code: "conversion-failed" },
      `The document couldn't be converted${reason}`,
      { cause }
    );
  }
  const { myst, file, diagnostics } = converted;

  const changedFilename: string | null = filename
    ? filename.endsWith("html")
      ? filename.slice(0, -4) + "gdoc"
      : filename
    : null;
  if (!filename) {
    diagnostics.pending.push({
      code: "missing-filename",
      severity: "warning",
      message:
        "Google Docs didn't send a readable file name, so it can't be used as a fallback title.",
      path: ["importDocument", "filename"],
    });
  }

  return {
    abstract: file.data.abstract || "",
    diagnostics,
    filename: changedFilename,
    html,
    myst,
    subtitle: file.data.subtitle || null,
    title: file.data.title || "",
    version: file.data.version || undefined,
  };
}

// #endregion

// #region Converter

/**
 * Converts one exported Google Doc to MyST. Holds the figure, table and video
 * counters and the diagnostics found so far, so use a new instance per
 * document.
 *
 * Where the doc can't be converted as written, the converter keeps what it can
 * and records a diagnostic instead of throwing. Each diagnostic's markers wrap
 * the affected content, see `diagnostic-markers.ts`.
 */
class GoogleDocConverter {
  private figNum = 1;
  private tabNum = 1;
  private vidNum = 1;
  private readonly diagnostics = new DiagnosticCollector();
  /** `:::title` etc. found in merged cells, applied once the doc's own are known. */
  private cellMetadata: {
    key: PublicationMetadataKey;
    value: string;
    markerId: number;
  }[] = [];
  /** Google ids of headings with an author's `{#id}`, to that id. */
  private readonly authorHeadingIds = new Map<string, string>();

  constructor(private readonly options: GoogleDocImportOptions = {}) {}

  convert(html: string): {
    myst: string;
    file: VFile;
    diagnostics: DiagnosticCollector;
  } {
    const doc = parseHtmlDocument(this.removeReservedCharacters(html));
    // linkedom gives no root element for bodies like "" or plain text.
    if (!doc.documentElement) {
      this.report({
        code: "empty-document",
        severity: "error",
        message: "Google Docs sent back an export with no document in it.",
      });
      return { myst: "", file: new VFile(), diagnostics: this.diagnostics };
    }
    stripComments(doc);
    restoreEscapedHtmlTables(doc);
    splitBlocksAroundImages(doc, this.diagnostics);

    const formattingClasses = getFormattingClasses(doc);
    prepDocument({
      doc,
      formattingClasses,
      singleLineBreaks: this.options.singleLineBreaks ?? "paragraph",
    });

    const converted = this.parseHtmlToMarkdown(doc.documentElement.outerHTML);
    const { file } = converted;
    this.applyCellMetadata(file);
    const resolveHeadingLinks = this.headingLinkResolver(
      converted.myst,
      file.data.abstract
    );
    const myst = resolveHeadingLinks(converted.myst);
    for (const key of Object.keys(file.data).filter(isPublicationMetadataKey)) {
      const value = file.data[key];
      if (value !== undefined) file.data[key] = resolveHeadingLinks(value);
    }
    return { myst, file, diagnostics: this.diagnostics };
  }

  /**
   * Returns a function that points a field's `#h.abc` links at the slugs
   * thestacks.org's renderer will give the headings, and removes the
   * ` {#h.abc}` tags that marked which heading was which. Slugs are only worked
   * out now, so headings dropped on the way (e.g. in `:::ignore`) don't take a
   * number from the ones that are left.
   */
  private headingLinkResolver(
    body: string,
    abstract: string | undefined
  ): (text: string) => string {
    let page: HeadingSlugs | undefined;
    const slugPage = (): HeadingSlugs => {
      // thestacks.org renders the abstract and body as one document, under a
      // Purpose heading, so headings in either take numbers from the other.
      const myst = abstract ? `# Purpose\n\n${abstract}\n\n${body}` : body;
      // The renderer throws on some content the importer lets through (e.g. a
      // file `:::media` with no filename); that mustn't fail the whole import.
      try {
        const { slugs, authorIds } = slugHeadings(myst);
        const authored = this.authorHeadingIdsWhere((id) => authorIds.has(id));
        return { slugs: new Map([...authored, ...slugs]) };
      } catch (cause) {
        const renderError =
          cause instanceof Error ? cause.message : String(cause);
        const authored = this.authorHeadingIdsWhere((id) =>
          myst.includes(` {#${id}}`)
        );
        return { slugs: new Map(authored), renderError };
      }
    };

    return (text) => {
      const stripped = stripHeadingTags(text);
      if (!stripped.includes("](#h.") && !stripped.includes('href="#h.')) {
        return stripped;
      }
      page ??= slugPage();
      return this.replaceHeadingLinks(stripped, page);
    };
  }

  /**
   * `authorHeadingIds` is filled in during conversion, before `:::ignore` and
   * the like drop headings, so only ids whose heading is left are kept.
   */
  private authorHeadingIdsWhere(
    isLeft: (authorId: string) => boolean
  ): [string, string][] {
    return [...this.authorHeadingIds].filter(([, authorId]) =>
      isLeft(authorId)
    );
  }

  private replaceHeadingLinks(
    text: string,
    { slugs, renderError }: HeadingSlugs
  ): string {
    const keepAsText = (content: string) => {
      const id = this.report({
        code: "heading-link-unresolved",
        severity: "warning",
        message: renderError
          ? `This link points to a heading, but the document couldn't be rendered to find the heading's link (${renderError}), so it was kept as text.`
          : "This link points to a heading that isn't in the document, so it was kept as text.",
      });
      return `${startMarker(id)}${content}${endMarker(id)}`;
    };

    const withHtmlLinks = text.replace(
      HTML_HEADING_LINK,
      (
        match,
        before: string,
        googleId: string,
        after: string,
        content: string
      ) => {
        const slug = slugs.get(googleId);
        if (!slug) return keepAsText(content);
        return `<a ${before}href="#${slug}"${after}>${content}</a>`;
      }
    );
    return replaceMarkdownHeadingLinks(withHtmlLinks, slugs, keepAsText);
  }

  /**
   * The converter uses these Private Use Area characters as internal
   * placeholders (see `protectNonProse`, `DELIMITER_STAND_INS` and
   * `diagnostic-markers.ts`), so any in
   * the doc itself would be mistaken for them.
   */
  private removeReservedCharacters(html: string): string {
    const cleaned = html.replace(/[\uE000-\uE008]/g, "");
    if (cleaned.length !== html.length) {
      this.report({
        code: "reserved-characters-removed",
        severity: "warning",
        message: `${html.length - cleaned.length} private-use character(s) were removed, because the importer uses them internally.`,
      });
    }
    return cleaned;
  }

  private report(...args: Parameters<DiagnosticCollector["report"]>): number {
    return this.diagnostics.report(...args);
  }

  private discardMarkedIn(text: string): void {
    this.diagnostics.discardMarkedIn(text);
    const discarded = markerIds(text);
    this.cellMetadata = this.cellMetadata.filter(
      ({ markerId }) => !discarded.has(markerId)
    );
  }

  private applyCellMetadata(file: VFile): void {
    for (const { key, value, markerId } of this.cellMetadata) {
      const isUsed = !file.data[key];
      if (isUsed) file.data[key] = value;
      this.report(
        {
          code: "metadata-in-table",
          severity: "warning",
          message: isUsed
            ? `\`:::${key}\` is inside a merged-cell table. It was used as the publication's ${key}, but should be moved out of the table.`
            : `\`:::${key}\` inside a merged-cell table was ignored, because the document already has one.`,
        },
        markerId
      );
    }
  }

  /**
   * Typed `:ref{#id}` directives are resolved against the ids in the tree being
   * processed, which for a merged cell is only the cell, so any left in a cell's
   * MyST point outside it. Rendering them would drop the target, so they're
   * kept as text.
   */
  private escapeCellRefs(myst: string): string {
    return myst.replace(/(?<!\\):ref\{#[^}\s]+\}/g, (ref) => {
      const id = this.report({
        code: "unresolved-ref-in-table",
        severity: "warning",
        message: `\`${ref}\` inside a merged-cell table can't be linked, so it was kept as text. Link to a bookmark with the text \`:ref\` instead.`,
      });
      return `${startMarker(id)}\\${ref}${endMarker(id)}`;
    });
  }

  /**
   * Runs a merged cell's contents through the whole pipeline and renders the
   * result back to HTML. If that fails, the cell keeps its original HTML.
   */
  private convertMergedCell(cellHtml: string): string {
    const diagnosticCount = this.diagnostics.pending.length;
    const cellMetadataCount = this.cellMetadata.length;
    const { figNum, tabNum, vidNum } = this;
    try {
      const { myst, file } = this.parseHtmlToMarkdown(cellHtml);
      const processor = baseMarkdownToHtmlPipeline(Platform.Web).use(
        rehypeStringify
      );
      const converted = processMystSync(this.escapeCellRefs(myst), processor);
      return this.markCellMetadata(file, converted);
    } catch (cause) {
      // Undo what the failed attempt recorded; its output is discarded.
      this.diagnostics.pending.length = diagnosticCount;
      this.cellMetadata.length = cellMetadataCount;
      this.figNum = figNum;
      this.tabNum = tabNum;
      this.vidNum = vidNum;
      const reason = cause instanceof Error ? ` (${cause.message})` : "";
      const id = this.report({
        code: "cell-conversion-failed",
        severity: "error",
        message: `This table cell couldn't be converted, so it was kept as it was in the Google Doc${reason}.`,
      });
      return `${startMarker(id)}${cellHtml}${endMarker(id)}`;
    }
  }

  /**
   * Holds back a merged cell's `:::title` etc. until `applyCellMetadata`, and
   * marks the cell so the diagnostic points at it.
   */
  private markCellMetadata(file: VFile, cellHtml: string): string {
    let marked = cellHtml;
    for (const key of Object.keys(file.data).filter(isPublicationMetadataKey)) {
      const value = file.data[key];
      if (value === undefined) continue;
      const markerId = this.diagnostics.newMarkerId();
      this.cellMetadata.push({ key, value, markerId });
      marked = `${startMarker(markerId)}${marked}${endMarker(markerId)}`;
    }
    return marked;
  }

  private parseHtmlToMarkdown(html: string): { myst: string; file: VFile } {
    const turndown = this.customizeTurndown();
    let myst: string;
    try {
      myst = turndown.turndown(html);
    } catch (cause) {
      // turndown re-parses the HTML with domino, which overflows the stack on
      // extremely deep nesting (~2000 levels).
      if (!(cause instanceof RangeError)) throw cause;
      myst = this.plainTextFallback(html);
    }
    // Help remarkDirective recognize nesting by giving outer directives more colons
    myst = this.nestContainerDirectives(myst);
    myst = this.escapeUnclosedDirectives(myst);

    // Perform further processing on the MDAST
    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkDegooglifyUrls)
      .use(remarkDirective)
      .use(remarkUnautolinkBibtex)
      .use(() => this.remarkExtractPublicationMetadata())
      .use(remarkExternalRef)
      .use(() => this.remarkContainerDirective())
      .use(remarkCrossRef)
      .use(remarkProtectLinkDelimiters)
      .use(remarkStringify, REMARK_STRINGIFY_OPTS);

    const file = processor.processSync(myst);
    myst = processMystString(String(file));
    myst = this.nestContainerDirectives(myst); // Fix remarkStringify's attempt at nesting
    myst = this.escapeUnclosedDirectives(myst, { report: false });

    return { myst, file };
  }

  /**
   * Clarifies the nesting hierarchy of custom directives by giving outer directives more colons.
   * Necessary because that's how remark-directive (used for rendering) detects nesting depths.
   * The innermost level gets 3 colons. Outer levels get one more each, sized
   * for at least 4 levels so shallower docs keep 6 colons on the outermost.
   */
  private nestContainerDirectives(myst: string): string {
    const lines = myst.split("\n");
    const minColons = 3;
    const fences: (
      { type: "open" | "close"; depth: number } | { type: "stray" } | null
    )[] = [];
    let depth = 0;
    let maxDepth = 4;

    for (const line of lines) {
      if (/^:{3,}(\w+)/.test(line)) {
        depth += 1;
        maxDepth = Math.max(maxDepth, depth);
        fences.push({ type: "open", depth });
      } else if (/^:{3,}\s*$/.test(line)) {
        if (depth === 0) {
          fences.push({ type: "stray" });
          continue;
        }
        fences.push({ type: "close", depth });
        depth -= 1;
      } else {
        fences.push(null);
      }
    }
    if (maxDepth > MAXIMUM_ALLOWED_DIRECTIVE_DEPTH) {
      throw new MaximumDirectiveDepthError(maxDepth);
    }

    const colons = (depth: number) => ":".repeat(minColons + maxDepth - depth);
    return lines
      .map((line, i) => {
        const fence = fences[i];
        if (fence?.type === "open") {
          return line.replace(/^:{3,}/, colons(fence.depth));
        }
        if (fence?.type === "close") return colons(fence.depth);
        if (fence?.type === "stray") {
          const id = this.report({
            code: "unmatched-directive-close",
            severity: "error",
            message:
              "This `:::` doesn't close any directive, so it was kept as text.",
          });
          return `${startMarker(id)}\\${line.trim()}${endMarker(id)}`;
        }
        // A stray `:::` reported by an earlier pass. remark-stringify drops the
        // escape added there, because the marker before it means the colons no
        // longer start the line, so it's added again after the marker.
        if (/^:{3,}\s*$/.test(stripMarkers(line))) {
          return line.replace(":", "\\:");
        }
        return line;
      })
      .join("\n");
  }

  /**
   * The HTML's text as plain paragraphs, one per block element, for when it
   * can't be converted. Walks the tree with a stack, since recursion would
   * overflow on the same input.
   */
  private plainTextFallback(html: string): string {
    const root = parseHtmlDocument(html).documentElement;
    const paragraphs: string[] = [];
    let current = "";
    const flush = () => {
      if (current.trim()) paragraphs.push(current.trim());
      current = "";
    };
    const stack: GDocChildNode[] = root ? [root] : [];
    while (stack.length) {
      const node = stack.pop()!;
      if (!isGDocElement(node)) {
        if (node.nodeType === TEXT_NODE) current += node.textContent ?? "";
        continue;
      }
      if (["HEAD", "SCRIPT", "STYLE"].includes(node.tagName)) continue;
      if (FALLBACK_BREAKS.has(node.tagName)) flush();
      stack.push(...Array.from(node.childNodes).reverse());
    }
    flush();
    const id = this.report({
      code: "document-too-deep",
      severity: "error",
      message:
        "This content is nested too deeply to convert, so it was imported as plain text without formatting.",
    });
    return `${startMarker(id)}${paragraphs.join("\n\n")}${endMarker(id)}`;
  }

  /**
   * remark-directive's parse time is quadratic in the number of unclosed
   * `:name{` openers in one paragraph (minutes for tens of thousands), so a
   * paragraph with far more openers than closing braces has them escaped.
   * `processMystString` removes the escapes again after each remark pass, so
   * this runs once more at the end with `{ report: false }`.
   */
  private escapeUnclosedDirectives(
    myst: string,
    { report = true }: { report?: boolean } = {}
  ): string {
    const maxUnclosed = 100;
    const { text, placeholders } = protectNonProse(myst);
    const marked = text.replace(/[^\n]+(?:\n[^\n]+)*/g, (paragraph) => {
      const openers = paragraph.match(/:[a-zA-Z][\w-]*\{/g)?.length ?? 0;
      const closers = paragraph.match(/\}/g)?.length ?? 0;
      if (openers - closers <= maxUnclosed) return paragraph;

      const escaped = paragraph.replace(/(?<!\\):(?=[a-zA-Z][\w-]*\{)/g, "\\:");
      if (!report) return escaped;
      const id = this.report({
        code: "too-many-unclosed-directives",
        severity: "warning",
        message: `This paragraph has ${openers - closers} more \`:name{\` openings than closing braces, so they were kept as text.`,
      });
      return `${startMarker(id)}${escaped}${endMarker(id)}`;
    });
    return restoreNonProse(marked, placeholders);
  }

  private customizeTurndown(): TurndownService {
    const turndown = new TurndownService({
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
      emDelimiter: "_",
      fence: "```",
      headingStyle: "atx",
      hr: "---",
      linkReferenceStyle: "full",
      linkStyle: "inlined",
      strongDelimiter: "**",
    });

    // #region Custom rules, applied last to first

    turndown.addRule("stripUnwantedTags", {
      filter: ["script", "style"],
      replacement: () => "",
    });

    turndown.addRule("preserveSupSub", {
      filter: ["sup", "sub"],
      replacement(_content: string, node: HTMLElement) {
        // Emit children as raw HTML rather than Turndown's converted markdown:
        // CommonMark doesn't parse markdown delimiters (e.g. `_..._`) inside
        // raw inline HTML, so `<sup>_e_</sup>` would render literal underscores.
        // Using HTML emphasis tags directly bypasses delimiter flanking issues.
        const tagName = node.nodeName.toLowerCase();
        return `<${tagName}>${node.innerHTML}</${tagName}>`;
      },
    });

    turndown.addRule("bookmarkTarget_setId", {
      filter: (node: HTMLElement) => {
        return node.hasAttribute("data-bookmark-id");
      },
      replacement(content: string, node: HTMLElement) {
        const id = node.getAttribute("data-bookmark-id");
        return `:::div{#${id}}\n${content}\n:::`;
      },
    });

    turndown.addRule("bookmarkTarget_getId", {
      filter: (node: HTMLElement) => {
        return node.getAttribute("id")?.startsWith("id.") ?? false;
      },
      replacement(content: string, node: HTMLElement) {
        // id.abc -> abc, to avoid . being interpreted as class name
        const newId = node.getAttribute("id")!.substring(3);

        // Google's bookmarks are empty anchors; anything else with an id.
        // keeps its content, and a block also takes the id itself.
        if (node.textContent?.trim()) {
          return newId && BLOCK_ELEMENTS.has(node.nodeName)
            ? `:::div{#${newId}}\n${content}\n:::`
            : content;
        }

        // Mark the next sibling to be wrapped with this bookmark id
        const nextSib = node.nextElementSibling;
        if (newId && nextSib) {
          nextSib.setAttribute("data-bookmark-id", newId);
        }

        return ""; // Remove the bookmark element itself
      },
    });

    turndown.addRule("bookmarkSource", {
      filter: (node: HTMLElement) => {
        return (
          node.nodeName === "A" &&
          !!node.getAttribute("href")?.startsWith("#id.")
        );
      },
      replacement(content: string, node: HTMLElement) {
        // #id.abc -> #abc, to avoid . being interpreted as class name
        const newId = node.getAttribute("href")!.substring(4);
        return `[${content}](#${newId})`;
      },
    });

    // Tags each heading with its Google id, so `resolveHeadingLinks` can tell
    // which heading a `#h.abc` link means once conversion is done. A heading
    // with an author's `{#id}` keeps that, so it's recorded instead: a second
    // `{#...}` would merge with the first, as `remark-heading-id` reads it.
    // This rule wins over `bookmarkTarget_setId`, so it wraps a bookmarked
    // heading itself.
    turndown.addRule("headingGoogleId", {
      filter: (node: HTMLElement) => {
        return (
          /^H[1-6]$/.test(node.nodeName) &&
          !!node.getAttribute("id")?.startsWith("h.")
        );
      },
      replacement: (content: string, node: HTMLElement) => {
        const hashes = "#".repeat(Number(node.nodeName.charAt(1)));
        const googleId = node.getAttribute("id")!;
        const authorId = content.trimEnd().match(/ \{#([^]+?)\}$/)?.[1];
        if (authorId) this.authorHeadingIds.set(googleId, authorId);
        const tag = authorId ? "" : ` {#${googleId}}`;
        const heading = `${hashes} ${content}${tag}`;
        const bookmarkId = node.getAttribute("data-bookmark-id");
        return bookmarkId
          ? `\n\n:::div{#${bookmarkId}}\n${heading}\n:::\n\n`
          : `\n\n${heading}\n\n`;
      },
    });

    turndown.addRule("tables", {
      filter: "table",
      replacement: (content, node: HTMLElement) => {
        // Turndown has already converted the cells into `content`, but they're
        // converted again below, so anything recorded the first time is dropped.
        this.discardMarkedIn(content);

        const allCells = Array.from(node.querySelectorAll("td, th"));
        const hasMergedCells = allCells.some(
          (cell) =>
            parseInt(cell.getAttribute("colspan") || "1", 10) > 1 ||
            parseInt(cell.getAttribute("rowspan") || "1", 10) > 1
        );

        const rows = Array.from(node.querySelectorAll("tr"));

        if (rows.length === 0) return "";

        /**
         * Markdown does not support merged cells, so if we detect any, we will
         * leave the table as HTML. We still need to process the cells, otherwise
         * they will render incorrectly.
         *
         * This is particularly for reference links, which wouldn't render
         * properly otherwise.
         */
        if (hasMergedCells) {
          const clone = node.cloneNode(true) as HTMLElement;
          normalizeTableRowGroups(clone);
          clone.querySelectorAll("td, th").forEach((cell) => {
            cell.innerHTML = this.convertMergedCell(cell.innerHTML);
          });

          return `:::figure{type=table}\n${clone.outerHTML}\n:::`;
        }

        const tableLines: string[] = [];

        rows.forEach((row, rowIndex: number) => {
          const cells = Array.from(row.querySelectorAll("td, th"));
          const cellContents = cells.map((cell) => {
            // Markdown doesn't support newlines in tables; use <br/> instead.
            // Escape `|` in content to avoid confusion with column delimiters.
            const cellMd = turndown
              .turndown(cell.innerHTML)
              .trim()
              .replace(/\n+/g, "<br/>")
              .replace(/\|/g, "\\|");
            return cellMd;
          });

          tableLines.push("| " + cellContents.join(" | ") + " |");

          // Add separator after first row (header row)
          if (rowIndex === 0) {
            tableLines.push(
              "| " + cellContents.map(() => "---").join(" | ") + " |"
            );
          }
        });

        const markdownTable = tableLines.join("\n");
        return `:::figure{type=table}\n${markdownTable}\n:::`;
      },
    });

    turndown.addRule("preserveHtmlTable", {
      filter: (node: HTMLElement) => {
        return (
          node.nodeName === "TABLE" &&
          node.getAttribute("data-ts-import-behavior") === "preserve"
        );
      },
      replacement(_, node: HTMLElement) {
        // Complex tables can't be converted to Markdown
        // Leave the HTML as-is, wrapped in figure, after removing the marker attribute
        node.removeAttribute("data-ts-import-behavior");
        return `:::figure{type=table}\n${node.outerHTML}\n:::`;
      },
    });

    turndown.addRule("images", {
      filter: "img",
      replacement: (_, node: HTMLElement) => {
        const src = node.getAttribute("src")?.trim();
        if (!src) {
          const id = this.report({
            code: "image-missing-src",
            severity: "warning",
            message: "An image with no source was left out.",
          });
          return `${startMarker(id)}${endMarker(id)}`;
        }
        // These break remark-directive's attribute parsing. encodeURIComponent
        // leaves `'` as is.
        const safeSrc = src.replace(/["'{}\s]/g, (char) =>
          char === "'" ? "%27" : encodeURIComponent(char)
        );
        const imageDirective = `:::image{src='${safeSrc}'}\n:::`;
        return `:::figure{type=img}\n${imageDirective}\n:::`;
      },
    });

    turndown.addRule("title", {
      filter: (node: HTMLElement) => {
        const classes = node.className?.split(/\s+/).filter(Boolean) || [];
        return classes.includes("title");
      },
      replacement: (content: string) => {
        return `:::title\n${content}\n:::\n`;
      },
    });

    // #endregion

    return turndown;
  }

  private addCaptionToFigure({
    caption,
    figure,
  }: {
    caption: MystNode[];
    figure: MystDirective;
  }): void {
    if (!caption.length) return;

    // Get or create the figure's figcaption
    let figcaption = figure.children?.find(
      (c): c is MystDirective => isMystDirective(c) && c.name === "figcaption"
    );
    if (!figcaption) {
      figcaption = {
        type: "containerDirective",
        name: "figcaption",
        children: [],
      };
      figure.children = figure.children || [];
      figure.children.push(figcaption);
    }

    figure.attributes = figure.attributes || {};
    const figType = figure.attributes.type;

    if (figType !== "file") {
      // Files don't get labels or captions

      let label = "";
      if (!figure.attributes.unnumbered) {
        // Add label with figure/table number, eg. Figure 1, to the caption
        switch (figType) {
          case "table":
            label = `Table ${this.tabNum++}`;
            break;
          case "video":
            label = `Video ${this.vidNum++}`;
            break;
          default:
            label = `Figure ${this.figNum++}`;
        }
      }
      figure.attributes.label = label; // Used while rendering

      const title = figure.attributes.title || "";
      if (label || title) {
        // We have a label/title to show. Wrap it in a text node, add to caption nodes
        const separator = label && title ? ": " : label ? "." : "";
        const labelAndTitleNode = {
          type: "text" as const,
          value: `**${label}${separator}${title}** `,
        };

        const first = caption[0];
        if (first && first.type === "paragraph") {
          first.children = first.children || [];
          first.children.unshift(labelAndTitleNode);
        } else {
          caption.unshift(labelAndTitleNode);
        }
      }
    }

    // Add caption to figure
    figcaption.children = figcaption.children || [];
    figcaption.children.push(...caption);
  }

  private childrenToMarkdownString(node: MystDirective): string {
    // remarkGfm is needed to stringify tables and strikethrough, which the
    // outer parse can produce inside :::title etc.
    const processor = unified()
      .use(remarkGfm)
      .use(remarkDirective)
      .use(remarkExternalRef)
      .use(() => this.remarkContainerDirective())
      .use(remarkCrossRef)
      .use(remarkProtectLinkDelimiters)
      .use(remarkStringify, REMARK_STRINGIFY_OPTS);

    // `node.children` is `MystNode[]` (this file's widened attribute/children
    // shape — see the #region Types > MDAST comment), narrower than the real
    // `RootContent[]` `unified` expects; cast at this one boundary rather than
    // widening `Root` itself.
    const tempTree: Root = {
      type: "root",
      children: (node.children || []) as RootContent[],
    };
    // `runSync`'s return isn't pinned to `Root` here (this chain has no
    // `remarkParse` to anchor the tree type), but the transformers never
    // change the root node itself.
    const transformedTree = processor.runSync(tempTree) as Root;
    let result = processor.stringify(transformedTree).trim();
    result = processMystString(result);
    result = this.nestContainerDirectives(result);
    result = this.escapeUnclosedDirectives(result, { report: false });
    return result;
  }

  /*
  Example input MyST (indentation is for illustration only):
    :::media
      :type: image
      :src: https://www.example.com/pic.png
      :align: center
      :width: 50%
      :height: 200px
      Caption text
    :::
  Example output:
    :::figure{type=image, align=center}
      :::image{src=https://www.example.com/pic.png, width=50%, height=200px}
      :::
      :::figcaption
        Caption text
      :::
    :::
  */
  private processMedia({
    node,
    index,
    parent,
  }: {
    node: MystDirective;
    index: number | undefined;
    parent: Parent | undefined;
  }): VisitorResult {
    // Only called for container directives, which are never the tree root.
    if (!parent || index === undefined) return CONTINUE;
    const { attrs, node: nodeMinusAttrs } = extractAttrsFromNode(node);
    const { childAttrs, parentAttrs } = attrsToParentAndChildAttrs(attrs);
    // An attr written with formatting (e.g. bold) won't match ATTR_REGEX and
    // will look missing.
    const missing = [
      !childAttrs.src && "`:src:`",
      !parentAttrs.type && "`:type:`",
    ].filter(Boolean);
    if (missing.length) {
      const id = this.report({
        code: "media-missing-attribute",
        severity: "error",
        message: `This \`:::media\` block is missing ${missing.join(" and ")}, so its contents were kept as text.`,
      });
      (parent.children as MystNode[]).splice(
        index,
        1,
        ...wrapBlocksInMarkers(node.children, id)
      );
      return [SKIP, index];
    }

    // Wrap node in figure and add caption
    const figure = wrapNodeInFigure({ attrs: parentAttrs, node });
    transferAttrsToNode({ attrs: parentAttrs, node: figure });
    this.addCaptionToFigure({ caption: nodeMinusAttrs.children, figure });

    // Convert this node to a container directive
    node.type = "containerDirective";
    // parentAttrs.type is always a string in this codebase (only
    // `unnumbered`/`open` are ever booleans), but MystAttrs shares one value
    // type across all keys.
    node.name = parentAttrs.type as string;
    node.attributes = childAttrs;
    node.children = [];

    // Replace node with figure
    (parent.children as MystNode[])[index] = figure;
    return CONTINUE;
  }

  private processMeta({
    node,
    index,
    parent,
  }: {
    node: MystDirective;
    index: number | undefined;
    parent: Parent | undefined;
  }): VisitorResult {
    if (!parent || typeof index !== "number" || index < 1) return CONTINUE;

    // meta should always follow figure. If no figure found, remove this meta node.
    const prevSib = parent.children[index - 1];
    if (
      !prevSib ||
      !isMystDirective(prevSib) ||
      prevSib.type !== "containerDirective" ||
      prevSib.name !== "figure"
    ) {
      parent.children.splice(index, 1);
      return [SKIP, index];
    }

    const figure = prevSib;
    const child = figure.children[0];
    const { attrs, node: nodeMinusAttrs } = extractAttrsFromNode(node);
    const { childAttrs, parentAttrs } = attrsToParentAndChildAttrs(attrs);

    transferAttrsToNode({ attrs: parentAttrs, node: figure });
    if (isMystDirective(child)) {
      transferAttrsToNode({ attrs: childAttrs, node: child });
    }
    this.addCaptionToFigure({ caption: nodeMinusAttrs.children, figure });

    // Remove the meta node
    parent.children.splice(index, 1);
    return [SKIP, index];
  }

  private remarkContainerDirective() {
    return (tree: Root) => {
      visit(tree, (node, index, parent) => {
        if (node.type !== "containerDirective") return CONTINUE;

        // The real, parsed node satisfies mdast-util-directive's own
        // (narrower) ContainerDirective type; from here on it's treated per
        // this file's wider MyST schema instead (see #region Types > MDAST).
        const mystNode = node as MystDirective;
        const { name } = mystNode;

        switch (name) {
          case "bordered":
          case "callout":
          case "card":
            return processCardCalloutEtc({ name, node: mystNode });
          case "details":
            return processDetails(mystNode);
          case "ignore":
            return processIgnore({ index, parent });
          case "media":
            return this.processMedia({ index, node: mystNode, parent });
          case "meta":
            return this.processMeta({ index, node: mystNode, parent });
          default:
            return processGenericContainerDirective(mystNode);
        }
      });
    };
  }

  private remarkExtractPublicationMetadata() {
    return (tree: Root, file: VFile) => {
      visit(tree, (node, index, parent) => {
        if (node.type !== "containerDirective") return;

        const mystNode = node as MystDirective;
        const { name } = mystNode;

        if (isPublicationMetadataKey(name)) {
          file.data[name] = this.childrenToMarkdownString(mystNode);

          // Remove node from tree
          if (parent && typeof index === "number") {
            parent.children.splice(index, 1);
            return [SKIP, index];
          }
        }
      });
    };
  }
}

// #endregion

// #region Helpers > GDoc access

function extractGoogleDocId(url: string): string | null {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? null;
}

/**
 * Fetch the HTML export of a publicly shared Google Docs document. Google
 * answers private docs with a sign-in page rather than an error status.
 */
async function fetchGoogleDocHtml(
  docId: string,
  fetch: ImporterContext["fetch"],
  signal: AbortSignal
): Promise<{ html: string; filename: string | null }> {
  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=html`;
  let res: Response;
  try {
    res = await fetch(exportUrl, {
      headers: { Accept: "text/html" },
      signal,
    });
  } catch (e) {
    throw new ImporterError(
      { code: "fetch-error" },
      "Error fetching google doc.",
      { cause: e }
    );
  }

  if (res.status === 404) {
    throw new ImporterError({ code: "not_found" }, "Google document not found");
  }
  let html: string;
  try {
    html = await res.text();
  } catch (cause) {
    throw new ImporterError(
      { code: "read-error" },
      "Unable to parse google doc body, please try again.",
      { cause }
    );
  }
  const isHtml = (res.headers.get("content-type") ?? "").includes("text/html");
  const disposition = res.headers.get("content-disposition");
  // Only a real export is served as an attachment; sign-in and error pages
  // aren't, so this avoids sniffing the body for login-page text.
  if (res.ok && isHtml && disposition) {
    return { html, filename: parseFilename(disposition) };
  }

  if (
    res.status === 429 ||
    URL.parse(res.url)?.pathname.startsWith("/sorry/")
  ) {
    throw new ImporterError(
      { code: "fetch-error" },
      "Too many requests, please wait a minute and try again."
    );
  }
  if (res.status >= 500) {
    throw new ImporterError(
      { code: "fetch-error" },
      "Server error fetching google doc, please try again."
    );
  }
  // Google redirects unauthenticated requests for non-public docs to a 200
  // sign-in page, so anything else unrecognised is most likely a permissions
  // problem.
  throw new ImporterError({ code: "forbidden" }, PRIVATE_DOC_ERROR);
}

function parseFilename(disposition: string | null): string | null {
  if (!disposition) return null;
  try {
    return parse(disposition).parameters.filename ?? null;
  } catch {
    // Failed content disposition parse will just result in no file name
    return null;
  }
}

// #endregion

// #region Helpers

// GDocs wraps external links as "https://www.google.com/url?q=<real-url>&...".
// Extracts the real destination, or returns href unchanged if it isn't wrapped.
function degooglifyHref(href: string | null | undefined): string | null {
  if (!href) return null;
  // Relative hrefs (e.g. bookmark links like `#id.abc`) don't parse.
  const url = URL.parse(href);
  if (
    !url ||
    !/\.google\.[a-z]+$/.test(url.hostname) ||
    url.pathname !== "/url"
  )
    return href;
  return url.searchParams.get("q") || href;
}

/**
 * GDocs exports tables with a stray `<tbody>` start tag inside the first
 * `<tr>` of a `<thead>` that holds every row. The HTML parser repairs that
 * into thead + an empty tbody + tbody, and the empty row group makes Firefox
 * drop the collapsed borders of the rows around it.
 */
function normalizeTableRowGroups(table: HTMLElement) {
  const groups = Array.from(table.children).filter((el) =>
    ["THEAD", "TBODY", "TFOOT"].includes(el.tagName)
  );
  let previousBody: Element | null = null;

  for (const group of groups) {
    if (!group.querySelector("tr")) {
      table.removeChild(group);
      continue;
    }
    if (group.tagName !== "TBODY") {
      previousBody = null;
      continue;
    }
    if (previousBody) {
      for (const row of Array.from(group.children))
        previousBody.appendChild(row);
      table.removeChild(group);
      continue;
    }
    previousBody = group;
  }
}

/*
GDocs uses CSS classes for bold, italics, etc.
Identify them so that we can later swap them out for semantic tags.
*/
/**
 * Selects elements with a class scraped from the doc's CSS. `.${cls}` is an
 * invalid selector when the name isn't a CSS identifier (e.g. starts with a
 * digit). linkedom tolerates that, but spec-compliant DOMs throw.
 */
function classSelector(cls: string): string {
  return `[class~="${cls}"]`;
}

function getFormattingClasses(doc: GDocDocument) {
  const fmtTypeToClsNames = {
    alignCenter: new Set<string>(),
    alignLeft: new Set<string>(),
    alignRight: new Set<string>(),
    bold: new Set<string>(),
    code: new Set<string>(),
    italics: new Set<string>(),
    sub: new Set<string>(),
    sup: new Set<string>(),
  };
  const css = doc.querySelector("style")?.innerHTML || "";

  // Splitting on `}` first keeps this linear; one regex per format over the
  // whole stylesheet is quadratic on a rule with no closing brace.
  for (const rule of css.split("}").slice(0, -1)) {
    const match = rule.match(/\.([a-zA-Z0-9_-]+)\s*\{([^{}]*)$/);
    if (!match) continue;
    const [, cls, declarations] = match as [string, string, string];
    const has = (pattern: RegExp) => pattern.test(declarations);

    // Alignment
    if (has(/text-align\s*:\s*(?:center|justify)/i)) {
      fmtTypeToClsNames.alignCenter.add(cls);
    }
    if (has(/text-align\s*:\s*left/i)) fmtTypeToClsNames.alignLeft.add(cls);
    if (has(/text-align\s*:\s*right/i)) fmtTypeToClsNames.alignRight.add(cls);

    // Bold
    if (has(/font-weight\s*:\s*(?:bold|700)/i) && cls !== "title") {
      fmtTypeToClsNames.bold.add(cls);
    }

    // Italics
    if (has(/font-style\s*:\s*italic/i)) fmtTypeToClsNames.italics.add(cls);

    // Code: GDocs auto-formats text in backticks as code when Markdown mode is enabled (Tools > Prefs)
    if (has(/color\s*:\s*#188038/i)) fmtTypeToClsNames.code.add(cls);

    // Sub and sup
    if (has(/vertical-align\s*:\s*sub/i)) fmtTypeToClsNames.sub.add(cls);
    if (has(/vertical-align\s*:\s*super/i)) fmtTypeToClsNames.sup.add(cls);
  }

  // Convert sets to arrays
  return {
    alignCenter: Array.from(fmtTypeToClsNames.alignCenter),
    alignLeft: Array.from(fmtTypeToClsNames.alignLeft),
    alignRight: Array.from(fmtTypeToClsNames.alignRight),
    bold: Array.from(fmtTypeToClsNames.bold),
    code: Array.from(fmtTypeToClsNames.code),
    italics: Array.from(fmtTypeToClsNames.italics),
    sub: Array.from(fmtTypeToClsNames.sub),
    sup: Array.from(fmtTypeToClsNames.sup),
  };
}

/**
 * Remove GDocs comments from the HTML export. Each comment leaves an inline
 * marker in the text, `<sup><a href="#cmnt1" id="cmnt_ref1">[a]</a></sup>`,
 * and its thread is appended to the end of the body as
 * `<div><p><a href="#cmnt_ref1" id="cmnt1">[a]</a>text</p>...</div>`.
 */
function stripComments(doc: GDocDocument) {
  // Only threads paired with a marker are removed, so a stray link that
  // happens to look like a comment anchor is left alone
  const threads: GDocElement[] = [];

  queryAll(doc, 'a[id^="cmnt_ref"]').forEach((marker) => {
    const n = /^cmnt_ref(\d+)$/.exec(marker.getAttribute("id") ?? "")?.[1];
    if (!n || marker.getAttribute("href") !== `#cmnt${n}`) return;

    const thread = doc.querySelector(`a[id="cmnt${n}"][href="#cmnt_ref${n}"]`);
    if (thread) threads.push(thread);

    const sup = marker.closest("sup");
    marker.remove();
    if (sup && !sup.textContent?.trim()) sup.remove();
  });

  const starts = threads.map(
    (anchor) => anchor.closest("p, li, h1, h2, h3, h4, h5, h6") ?? anchor
  );
  starts.forEach((start, i) => {
    if (start === threads[i]) {
      removeInlineRun(start);
      return;
    }
    removeThread(start, starts);
  });
}

/**
 * Remove a comment thread starting at `start`: the comment itself and its
 * replies, the paragraphs right after it. Replies end at the next thread, at
 * anything that is not a plain paragraph, or at a footnote, so body content
 * that isn't a paragraph is never taken for a reply. Wrappers the thread
 * leaves empty are removed too.
 */
function removeThread(start: GDocElement, starts: GDocElement[]) {
  const parent = start.parentNode;
  let next = start.nextElementSibling;
  while (
    next &&
    next.tagName === "P" &&
    !starts.includes(next) &&
    queryAll(next, 'a[id^="cmnt"], a[id^="ftnt"]').length === 0
  ) {
    const reply = next;
    next = next.nextElementSibling;
    reply.remove();
  }
  start.remove();

  let wrapper = parent;
  while (
    wrapper?.tagName === "DIV" &&
    wrapper.children.length === 0 &&
    !wrapper.textContent?.trim()
  ) {
    const up = wrapper.parentNode;
    wrapper.remove();
    wrapper = up;
  }
}

/**
 * Remove a thread anchor that isn't inside a block, along with the comment
 * text that follows it up to the next element.
 */
function removeInlineRun(anchor: GDocElement) {
  let next = anchor.nextSibling;
  while (next && !isGDocElement(next)) {
    const text = next;
    next = next.nextSibling;
    text.remove();
  }
  if (next && ["SPAN", "B", "I", "EM", "STRONG"].includes(next.tagName)) {
    next.remove();
  }
  anchor.remove();
}

/**
 * Find sequences of paragraphs containing escaped HTML table tags and
 * replace them with actual HTML table elements.
 * GDocs strips code fences but keeps the escaped content in <p> elements.
 */
function restoreEscapedHtmlTables(doc: GDocDocument) {
  const paragraphs = queryAll(doc, "p");
  let i = 0;

  while (i < paragraphs.length) {
    const p = paragraphs[i];
    const text = p!.textContent?.trim() || "";

    // Check if this paragraph starts an escaped HTML table
    if (text === "<table>" || text.startsWith("<table ")) {
      const tableStartIndex = i;
      const tableLines: string[] = [text];
      let foundEnd = false;

      // Collect paragraphs until we find </table>
      for (let j = i + 1; j < paragraphs.length; j++) {
        const lineText = paragraphs[j]!.textContent?.trim() || "";
        if (lineText) tableLines.push(lineText);
        if (lineText === "</table>") {
          foundEnd = true;
          i = j;
          break;
        }
      }

      if (foundEnd) {
        // Join lines and create actual HTML table
        const tableHtml = tableLines.join("\n");

        // Create a container with the table HTML
        const container = doc.createElement("div");
        container.innerHTML = tableHtml;

        // Replace the first paragraph with the table
        const tableEl = container.querySelector("table");
        if (tableEl && paragraphs[tableStartIndex]!.parentNode) {
          paragraphs[tableStartIndex]!.parentNode.insertBefore(
            tableEl,
            paragraphs[tableStartIndex]!
          );

          // Remove all the paragraphs that were part of the escaped table
          for (let k = tableStartIndex; k <= i; k++) paragraphs[k]!.remove();
        }
      }
    }
    i++;
  }
}

/** @internal Visible for testing */
export function prepDocument({
  doc,
  formattingClasses,
  singleLineBreaks,
}: {
  doc: GDocDocument;
  formattingClasses: ReturnType<typeof getFormattingClasses>;
  singleLineBreaks: NonNullable<GoogleDocImportOptions["singleLineBreaks"]>;
}) {
  // Process sub/sup before bold/italics/code so the inline emphasis tags nest
  // inside the sup/sub. We later emit these nested tags as raw HTML, avoiding
  // CommonMark flanking issues with `_..._` adjacent to `<sup>`/`<sub>`.
  formattingClasses.sub.forEach((cls) => {
    queryAll(doc, classSelector(cls)).forEach((el) => {
      if (!el.closest("sub")) {
        const wrapperEl = doc.createElement("sub");
        el.parentNode?.insertBefore(wrapperEl, el);
        wrapperEl.appendChild(el);
      }
    });
  });
  formattingClasses.sup.forEach((cls) => {
    queryAll(doc, classSelector(cls)).forEach((el) => {
      if (!el.closest("sup")) {
        const wrapperEl = doc.createElement("sup");
        el.parentNode?.insertBefore(wrapperEl, el);
        wrapperEl.appendChild(el);
      }
    });
  });

  // Wrap elements having bold classes in <strong>
  formattingClasses.bold.forEach((cls) => {
    queryAll(doc, classSelector(cls)).forEach((el) => {
      if (!el.closest("b")) {
        const wrapperEl = doc.createElement("b");
        el.parentNode?.insertBefore(wrapperEl, el);
        wrapperEl.appendChild(el);
      }
    });
  });

  // Wrap elements having italics classes in <em>
  formattingClasses.italics.forEach((cls) => {
    queryAll(doc, classSelector(cls)).forEach((el) => {
      if (!el.closest("i")) {
        const wrapperEl = doc.createElement("i");
        el.parentNode?.insertBefore(wrapperEl, el);
        wrapperEl.appendChild(el);
      }
    });
  });

  // Wrap elements having code classes in backticks
  formattingClasses.code.forEach((cls) => {
    queryAll(doc, classSelector(cls)).forEach((el) => {
      el.textContent = `\`${el.textContent}\``;
    });
  });

  // Merge code blocks: GDocs sometimes exports each line of code as a separate <p>
  const paragraphs = queryAll(doc, "p");
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i]!;
    const text = p.textContent?.trim() || "";

    // Check if this paragraph starts a code block
    const match = text.match(/^```(\w+)?$/);
    if (match) {
      const language = match[1] || "";
      const lines: string[] = [];
      let node = p.nextElementSibling;
      const nodesToRemove: GDocElement[] = [p]; // Remove the opening ``` line

      // Collect all following <p> tags until we find closing ``` or end
      while (node && node.tagName === "P") {
        nodesToRemove.push(node);

        const line = node.textContent || "";
        if (line === "```") break; // Closing fence

        lines.push(line); // Empty <p> becomes blank line
        node = node.nextElementSibling;
      }

      // Create a <pre><code> block
      const pre = doc.createElement("pre");
      const code = doc.createElement("code");
      if (language) code.className = `language-${language}`;
      code.textContent = lines.join("\n");
      pre.appendChild(code);

      p.parentNode?.insertBefore(pre, p); // Replace opening ``` with <pre><code>
      nodesToRemove.forEach((el) => el.remove()); // Remove original <p> tags

      // Skip past the elements we just processed
      i += nodesToRemove.length - 1;
    }
  }

  unwrapBrOnlySpans(doc);

  // Unwrap spans; ensures formatting like <strong><span>text</span></strong> works
  queryAll(doc, "span").forEach((span) => {
    const parent = span.parentNode;
    if (parent) {
      // Move all child nodes of the span to its parent
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      // Remove the now-empty span
      parent.removeChild(span);
    }
  });

  normalizeGdocParagraphBreaks(doc, singleLineBreaks);

  // Merge adjacent inline tags.
  // <b>...</b><b>...</b> results in confusing Markdown: **...****...**.
  // Merge adjacent tags of the same type to get Markdown like **...**.
  const inlineTagNames = ["b", "i"];
  inlineTagNames.forEach((tagName) => {
    queryAll(doc, tagName).forEach((element) => {
      while (true) {
        const nextSib = element.nextSibling;
        // element.nextSibling will be null if element has already been
        // processed and merged into a previous sibling. The below check
        // prevents double-processing of the static querySelectorAll result.
        if (
          !nextSib ||
          !isGDocElement(nextSib) ||
          nextSib.tagName.toLowerCase() !== tagName.toLowerCase()
        ) {
          break;
        }

        while (nextSib.firstChild) {
          element.appendChild(nextSib.firstChild);
        }
        nextSib.parentNode?.removeChild(nextSib);
      }
    });
  });

  // Hoist a link out of formatting that wraps it, e.g. GDocs may bold only
  // part of a link: <b><a href=X>GitHub</a></b>. Swapping the nesting so the
  // <a> wraps the formatting instead (<a href=X><b>GitHub</b></a>) preserves
  // the bold styling while turning this back into a plain <a> sibling that
  // the merge below can absorb like any other run of the same link.
  // Innermost wrappers are hoisted first (same reasoning as
  // hoistBrsFromInlineWrappers) so nested formatting collapses in one pass.
  for (const wrapper of queryAll(
    doc,
    "b,strong,i,em,u,s,del,sup,sub"
  ).reverse()) {
    if (wrapper.childNodes.length !== 1) continue;
    const anchor = wrapper.firstChild as GDocElement;
    if (anchor.nodeType !== ELEMENT_NODE || anchor.tagName !== "A") {
      continue;
    }

    const parent = wrapper.parentNode;
    if (!parent) continue;

    parent.replaceChild(anchor, wrapper);
    while (anchor.firstChild) {
      wrapper.appendChild(anchor.firstChild);
    }
    anchor.appendChild(wrapper);
  }

  // Merge adjacent <a> tags that share the same link target.
  // GDocs sometimes splits one hyperlink into multiple runs (e.g. a
  // differently-styled word, or an empty run at a boundary), which would
  // otherwise render as several separate markdown links for one link. Unlike
  // the b/i merge above, real whitespace between runs (the space in
  // "this GitHub repo") must be preserved rather than treated as a break, and
  // matching is done on the de-Googlified target since redirect tracking
  // params can differ between runs of the same link.
  queryAll(doc, "a").forEach((anchor) => {
    const target = degooglifyHref(anchor.getAttribute("href"));
    if (!target) return;

    while (true) {
      let nextSib = anchor.nextSibling;
      const whitespaceNodes: GDocChildNode[] = [];
      while (
        nextSib &&
        nextSib.nodeType === TEXT_NODE &&
        !nextSib.textContent?.trim()
      ) {
        whitespaceNodes.push(nextSib);
        nextSib = nextSib.nextSibling;
      }

      if (
        !nextSib ||
        !isGDocElement(nextSib) ||
        nextSib.tagName !== "A" ||
        degooglifyHref(nextSib.getAttribute("href")) !== target
      ) {
        break;
      }

      whitespaceNodes.forEach((textNode) => anchor.appendChild(textNode));
      while (nextSib.firstChild) {
        anchor.appendChild(nextSib.firstChild);
      }
      nextSib.parentNode?.removeChild(nextSib);
    }
  });
}

type Protected = { text: string; placeholders: string[] };
const MARK_START = "\uE000"; // Private Use Area — safe, non-control, won't appear in real content
const MARK_END = "\uE001";

/**
 * Stand-ins `remarkProtectLinkDelimiters` puts in place of brackets and
 * parentheses that must stay escaped, for `processMystString` to restore as
 * escapes once it has removed every other escape.
 */
const DELIMITER_STAND_INS: Record<string, string> = {
  "[": "\uE005",
  "]": "\uE006",
  "(": "\uE007",
  ")": "\uE008",
};
const ESCAPED_DELIMITERS = Object.fromEntries(
  Object.entries(DELIMITER_STAND_INS).map(([char, standIn]) => [
    standIn,
    `\\${char}`,
  ])
);

/**
 * This function protects non-prose content (code blocks, inline code, URLs)
 * from being modified by subsequent regex operations, by stashing them away and
 * replacing them with placeholders. After the regex operations are done, the
 * original content can be restored using the placeholders.
 * @param markdown {string} The markdown string to protect.
 * @returns {Protected} An object containing the modified text and the stashed placeholders.
 */
function protectNonProse(markdown: string): Protected {
  const placeholders: string[] = [];
  const stash = (match: string) => {
    placeholders.push(match);
    return `${MARK_START}${placeholders.length - 1}${MARK_END}`;
  };

  const text = markdown
    .replace(/```[\s\S]*?```/g, stash)
    .replace(/`[^`]+`/g, stash)
    .replace(/\]\(([^)\s]+)\)/g, (_, url: string) => `](${stash(url)})`)
    .replace(/<(https?:\/\/[^>]+)>/g, (_, url: string) => `<${stash(url)}>`)
    .replace(/https?:\/\/[^\s)\]}>]+/g, stash);

  return { text, placeholders };
}

/**
 * Restores the original non-prose content that was protected by
 * `protectNonProse`.
 * If for some reason the stash index is out of bounds, the placeholder will be
 * left unchanged in the text.
 * @param text {string} The text with protected non-prose content.
 * @param placeholders {string[]} The array of stashed placeholders.
 * @returns {string} The text with the original non-prose content restored.
 */
function restoreNonProse(text: string, placeholders: string[]): string {
  const restoreRegex = new RegExp(`${MARK_START}(\\d+)${MARK_END}`, "g");
  return text.replace(
    restoreRegex,
    (match, i) => placeholders[Number(i)] ?? match
  );
}

/**
 * Trailing hyphen accidentally captured inside italic span: _word-_nextword → _word_-nextword.
 * A simple regex turned out to be too permissive though and would 'fix' URLs that shouldn't be
 * fixed. So we need to protect the URLs before making the substitution.
 * @param markdown
 * @returns
 */
export function fixItalics(markdown: string): string {
  const { text, placeholders } = protectNonProse(markdown);

  const fixed = text.replace(/_([^_]+)-_(?=\w)/g, "_$1_-");
  // ...your other italic-fixup rules go here too, same protected text

  return restoreNonProse(fixed, placeholders);
}

function processMystString(myst: string): string {
  const newMyst = myst
    // eslint-disable-next-line no-useless-escape
    .replace(/\\([\[\]\(\)_:#*`${}~<>+\-.!\\])/g, "$1") // Unescape certain characters
    .replace(/^(:{3,}\S+)/gm, "\n$1")
    .replace(/^(:{3,}\s*$)/gm, "$1\n") // Add blank lines around container directives
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "") // Remove blank lines at the top
    .replace(/^\\---/gm, "---") // Don't escape Markdown horizontal rules
    .replace(/[-]/g, (char) => ESCAPED_DELIMITERS[char]!);

  return fixItalics(newMyst);
}

// #endregion

// #region Helpers > Remark plugins

function attrsToParentAndChildAttrs(attrs: MystAttrs): {
  childAttrs: MystAttrs;
  parentAttrs: MystAttrs;
} {
  // Some attrs belong on parents like <figure>, the rest on the child
  const { align, id, internal, title, type, unnumbered, ...childAttrs } = attrs;
  const parentAttrs: MystAttrs = {};
  if (align) parentAttrs.align = align;
  if (id) parentAttrs.id = id;

  // "internal": Arbitrary str to id directives that may need to be handled
  // differently in the future, eg. Acknowledgements & Competing Interests
  if (internal) parentAttrs["data-internal"] = internal;
  if (title) parentAttrs.title = title;
  if (type) parentAttrs.type = type;
  if (unnumbered !== undefined) parentAttrs.unnumbered = true;

  return { childAttrs, parentAttrs };
}

// Splits a paragraph's children on break nodes, returning one paragraph node per
// line. Empty segments (consecutive/trailing breaks) are filtered out.
function splitParagraphOnBreaks(para: Paragraph): Paragraph[] {
  const segments: Paragraph["children"][] = [];
  let current: Paragraph["children"] = [];

  // Group children into segmented arrays separated by break nodes
  for (const child of para.children || []) {
    if (child.type === "break") {
      segments.push(current);
      current = [];
    } else {
      current.push(child);
    }
  }
  segments.push(current);

  // Rebuild each segment as a paragraph node, filtering out empty segments
  return segments
    .filter((s) => s.length > 0)
    .map((s) => ({ ...para, children: s }));
}

// Rebuilds a paragraph node from segments of children, inserting break nodes
// between each segment. Used to reassemble a paragraph after extracting attributes.
function joinParagraphsOnBreaks(
  para: Paragraph,
  segments: Paragraph[]
): Paragraph {
  const children: Paragraph["children"] = [];
  for (let i = 0; i < segments.length; i++) {
    if (i > 0) children.push({ type: "break" });
    children.push(...segments[i]!.children);
  }
  return { ...para, children };
}

const ATTR_REGEX = /^:([\w-]+):\s*(.*)$/;
// Returns extracted :attributes: and node minus attributes
export function extractAttrsFromNode(node: MystDirective): {
  attrs: MystAttrs;
  node: MystDirective;
} {
  const attrs: MystAttrs = {};
  const nonAttrChildren: MystNode[] = [];
  let match;

  // NB: GDocs may auto-convert URLs to links, so we might have:
  //   { type: paragraph, children: [{ type: text, value: ":src:" }, { type: link, value: <url> }] }
  // NB: We assume attributes don't contain Markdown formatting
  // NB: GDocs may use line breaks (shift+enter) to separate attributes, so we need to split paragraphs on breaks and extract attributes from each segment.
  const children = node.children || [];
  for (const c of children) {
    if (
      c.type === "paragraph" &&
      (match = toString(c).text?.match(ATTR_REGEX))
    ) {
      // If the paragraph is separated by breaks, we need to split it into multiple paragraphs and extract attributes from each one.
      const childrenGroups = splitParagraphOnBreaks(c);
      const nonAttrGroups: Paragraph[] = [];
      // Iterate over each group of children and extract attributes if they exist.
      for (const child of childrenGroups) {
        match = toString(child).text?.match(ATTR_REGEX);
        if (match) {
          attrs[match[1]!] = match[2]!.trim();
        } else {
          nonAttrGroups.push(child);
        }
      }

      // Rebuild the non-attribute groups into a single paragraph and add it to the nonAttrChildren array.
      if (nonAttrGroups.length > 0) {
        nonAttrChildren.push(joinParagraphsOnBreaks(c, nonAttrGroups));
      }
    } else {
      nonAttrChildren.push(c);
    }
  }

  return { attrs, node: { ...node, children: nonAttrChildren } };
}

function processCardCalloutEtc({
  name,
  node,
}: {
  name: string;
  node: MystDirective;
}): VisitorResult {
  // Convert :::callout to :::div{.info-box}, and so on
  node.name = "div";
  node.attributes = node.attributes || {};

  const { attrs, node: nodeMinusAttrs } = extractAttrsFromNode(node);
  const { parentAttrs } = attrsToParentAndChildAttrs(attrs);
  node.children = nodeMinusAttrs.children;

  if (parentAttrs["data-internal"])
    node.attributes["data-internal"] = parentAttrs["data-internal"];

  switch (name) {
    case "bordered":
      node.attributes.class = "bordered lead";
      break;
    case "callout":
      node.attributes.class = "info-box";
      break;
    case "card":
      node.attributes.class = "card-modern card-wide mb-8";
      break;
  }

  return CONTINUE;
}

function processDetails(node: MystDirective): VisitorResult {
  if (node.children?.length) {
    node.attributes = node.attributes || {};

    // Look for the :open: attribute value in node.children
    // Process children in reverse order so we can safely remove items
    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i]!;
      let line = "";

      if (child.type === "paragraph") {
        const result = toString(child);
        line = result.text.trim();
        const match = line.match(/^:open:\s*(\S*)\s*$/);

        if (match) {
          node.children.splice(i, 1); // Remove this attr from node.children
          const value = match[1]!.trim();
          if (value !== "false") node.attributes.open = true;
        }
      }
    }
  }

  return CONTINUE;
}

// Converts colon attributes to inline.
function processGenericContainerDirective(node: MystDirective): VisitorResult {
  const { attrs, node: nodeMinusAttrs } = extractAttrsFromNode(node);
  transferAttrsToNode({ attrs, node });
  node.children = nodeMinusAttrs.children;
  return CONTINUE;
}

function processIgnore({
  index,
  parent,
}: {
  index: number | undefined;
  parent: Parent | undefined;
}): VisitorResult {
  if (parent && typeof index === "number") {
    parent.children.splice(index, 1);
    return [SKIP, index];
  }
  return SKIP;
}

function remarkUnautolinkBibtex() {
  return function (tree: Root) {
    visit(tree, "containerDirective", (node) => {
      if (node.name !== "bibtex") return;
      visit(node, "link", (link, index, parent) => {
        const isAutolink =
          // Regular links [foo](bar) have multiple children, while autolinks <bar> are parsed as a link with a single text child equal to the URL
          link.children.length === 1 &&
          // Autolinks <http://example.com> are parsed as a link with a single text child equal to the URL
          link.children[0]?.type === "text" &&
          // The text value is the same as the URL, indicating an autolink rather than a regular link
          link.children[0].value === link.url;
        if (isAutolink && parent && typeof index === "number") {
          parent.children[index] = { type: "text", value: link.url };
          return [SKIP, index];
        }
      });
    });
  };
}

function remarkCrossRef() {
  return function (tree: Root) {
    // First pass: build idToNode map
    const idToNode = new Map<string, MystDirective>();
    visit(tree, (node) => {
      // Exclude textDirectives to avoid self-referencing
      if (
        isMystDirective(node) &&
        node.attributes?.id &&
        node.type !== "textDirective"
      )
        idToNode.set(node.attributes.id, node);
    });

    // Second pass: replace :ref{#id} with links
    visit(tree, function (node, index, parent) {
      if (
        !isMystDirective(node) ||
        node.type !== "textDirective" ||
        node.name !== "ref"
      )
        return CONTINUE;

      const tgtId = node.attributes?.id;
      if (!tgtId || typeof tgtId !== "string") return CONTINUE;

      const tgtNode = idToNode.get(tgtId);
      if (!tgtNode) return CONTINUE;

      // Replace the :ref directive with a link
      const linkNode = {
        type: "link" as const,
        url: `#${tgtId}`,
        children: [
          {
            type: "text" as const,
            value: (tgtNode.attributes?.label as string) || tgtId,
          },
        ],
      };

      if (parent && typeof index === "number")
        (parent.children as MystNode[])[index] = linkNode;

      return CONTINUE;
    });
  };
}

// GDocs may redirect links through Google, so try to de-Googlify
function remarkDegooglifyUrls() {
  return function (tree: Root) {
    visit(tree, (node) => {
      if (node.type === "link" && node.url) {
        node.url = degooglifyHref(node.url) || node.url;
      }
      return CONTINUE;
    });
  };
}

/**
 * Keeps links whole through `processMystString`, which removes every escape so
 * syntax the author typed works. A label can't hold an unmatched `[` or `]`, or
 * a matched pair followed by `(` (that'd be a link inside it), and a URL can't
 * hold an unmatched `(` or `)`; those are swapped for `DELIMITER_STAND_INS`.
 * Other brackets are left alone, so e.g. `[see [results]](#x)` stays readable.
 */
function remarkProtectLinkDelimiters() {
  return function (tree: Root) {
    visit(tree, (node) => {
      if (node.type !== "link") return CONTINUE;
      node.url = protectDelimiters(node.url, "(", ")");

      const texts: Text[] = [];
      visit(node, "text", (text: Text) => {
        texts.push(text);
      });
      const label = protectDelimiters(
        texts.map(({ value }) => value).join(""),
        "[",
        "]"
      );
      let offset = 0;
      for (const text of texts) {
        const end = offset + text.value.length;
        text.value = label.slice(offset, end);
        offset = end;
      }
      return CONTINUE;
    });
  };
}

/**
 * Swaps unmatched `open`/`close` characters, and for brackets any matched pair
 * followed by `(`, for their `DELIMITER_STAND_INS`. Brackets in code the
 * author typed are skipped: the code's backticks are only escaped until
 * `processMystString`, and an escape inside code would show.
 */
function protectDelimiters(text: string, open: string, close: string): string {
  const chars = text.split("");
  const inCode = new Set<number>();
  if (open === "[") {
    // As in CommonMark, a code span closes at the next backtick run of the
    // same length, so "``a`b``" is one span.
    const codeSpans = /(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g;
    for (const { index, 0: span } of text.matchAll(codeSpans)) {
      for (let i = index; i < index + span.length; i++) inCode.add(i);
    }
  }
  const unmatched: number[] = [];
  const opens: number[] = [];
  chars.forEach((char, i) => {
    if (inCode.has(i)) return;
    if (char === open) opens.push(i);
    if (char !== close) return;
    const start = opens.pop();
    if (start === undefined) unmatched.push(i);
    else if (open === "[" && chars[i + 1] === "(") unmatched.push(start, i);
  });
  for (const i of [...unmatched, ...opens]) {
    chars[i] = DELIMITER_STAND_INS[chars[i]!]!;
  }
  return chars.join("");
}

function remarkExternalRef() {
  return function (tree: Root) {
    visit(tree, function (node) {
      if (node.type !== "link" || !node.url || !node.children?.length)
        return CONTINUE;

      // Only continue if this is a ref link, ie a link with text :ref
      const refDirective = node.children.find(
        (c) =>
          isMystDirective(c) && c.name === "ref" && c.type === "textDirective"
      );
      if (!refDirective) return CONTINUE;

      // Set link text to blank to indicate a ref link
      node.children = [];

      return CONTINUE;
    });
  };
}

function transferAttrsToNode({
  attrs,
  node,
}: {
  attrs: MystAttrs;
  node: MystDirective;
}): void {
  node.attributes = { ...(node.attributes || {}), ...attrs };
}

/** Puts a diagnostic's markers before the first block and after the last. */
function wrapBlocksInMarkers(blocks: MystNode[], id: number): MystNode[] {
  const marker = (value: string): Paragraph => ({
    type: "paragraph",
    children: [{ type: "text", value }],
  });
  const wrapped = [...blocks];
  const first = wrapped[0];
  if (first?.type === "paragraph") {
    first.children.unshift({ type: "text", value: startMarker(id) });
  } else {
    wrapped.unshift(marker(startMarker(id)));
  }
  const last = wrapped.at(-1)!;
  if (last.type === "paragraph") {
    last.children.push({ type: "text", value: endMarker(id) });
  } else {
    wrapped.push(marker(endMarker(id)));
  }
  return wrapped;
}

function wrapNodeInFigure({
  attrs,
  node,
}: {
  attrs?: MystAttrs;
  node: MystNode;
}): MystDirective {
  const figure: MystDirective = {
    type: "containerDirective",
    name: "figure",
    children: [node],
  };

  if (attrs) transferAttrsToNode({ attrs, node: figure });

  return figure;
}

/** Only the parts of a hast node `slugHeadings` reads. */
interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: { id?: unknown };
  children?: HastNode[];
}

/** Google heading ids to slugs, and why the page couldn't be slugged if so. */
interface HeadingSlugs {
  slugs: Map<string, string>;
  renderError?: string;
}

/** An `<a href="#h.abc">`, kept as HTML in e.g. a merged cell, and its content. */
const HTML_HEADING_LINK =
  /<a\s([^>]*?)href="#(h\.[\w-]+)"([^>]*)>([^]*?)<\/a>/g;

/** The `](#h.abc)` that ends a Markdown link to a Google heading id. */
const HEADING_LINK_END = /\]\(#(h\.[\w-]+)\)/g;

/**
 * Points each `[text](#h.abc)` at its slug, or keeps its text if the heading
 * is missing. Found by its end, since the label can hold brackets of its own
 * (`[see [results]](#h.abc)`), which a regex can't balance.
 */
function replaceMarkdownHeadingLinks(
  text: string,
  slugs: Map<string, string>,
  keepAsText: (content: string) => string
): string {
  let result = "";
  let done = 0;
  for (const match of text.matchAll(HEADING_LINK_END)) {
    const end = match.index;
    const slug = slugs.get(match[1]!);
    if (slug) {
      result += `${text.slice(done, end)}](#${slug})`;
    } else {
      const start = labelStart(text, done, end);
      // With no `[` to match, it was never a link; its `]` is kept as text.
      result +=
        start === undefined
          ? `${text.slice(done, end)}${keepAsText("]")}`
          : `${text.slice(done, start)}${keepAsText(text.slice(start + 1, end))}`;
    }
    done = end + match[0].length;
  }
  return result + text.slice(done);
}

/** Where the `[` matching the `]` at `end` is, looking no further back than `from`. */
function labelStart(text: string, from: number, end: number) {
  let depth = 1;
  for (let i = end - 1; i >= from; i--) {
    const char = text[i];
    if ((char !== "[" && char !== "]") || isEscaped(text, i)) continue;
    depth += char === "]" ? 1 : -1;
    if (depth === 0) return i;
  }
  return undefined;
}

/** Whether the character at `index` follows an odd number of backslashes. */
function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  while (text[index - 1 - backslashes] === "\\") backslashes++;
  return backslashes % 2 === 1;
}

/** Removes the Google ids `headingGoogleId` tags headings with. */
function stripHeadingTags(text: string): string {
  return text.replace(/ \{#h\.[\w-]+\}| id="h\.[\w-]+"/g, "");
}

/**
 * Maps each tagged heading's Google id to the id thestacks.org's renderer will
 * give it once the tag is gone. Runs what the renderer runs before slugging,
 * then mirrors `rehype-slug`: every heading in order through one `github-slugger`,
 * so repeats become `my-heading-1`, skipping headings with an author's `{#id}`.
 * Those ids are returned as `authorIds`, as they keep them.
 */
function slugHeadings(myst: string): {
  slugs: Map<string, string>;
  authorIds: Set<string>;
} {
  const processor = preSlugPipeline(Platform.Web);
  const source = normalizeEmphasisUnderscores(stripMarkers(myst));
  const tree = processor.runSync(processor.parse(source)) as HastNode;
  const slugger = new GithubSlugger();
  const slugs = new Map<string, string>();
  const authorIds = new Set<string>();
  visit(tree, (node: HastNode) => {
    if (node.type !== "element" || !/^h[1-6]$/.test(node.tagName ?? "")) {
      return;
    }
    const id = node.properties?.id;
    if (typeof id === "string" && !id.startsWith("h.")) {
      authorIds.add(id);
      return;
    }
    const slug = slugger.slug(hastText(node));
    if (typeof id === "string") slugs.set(id, slug);
  });
  return { slugs, authorIds };
}

/** The text `hast-util-to-string` gives, which `rehype-slug` slugs. */
function hastText(node: HastNode): string {
  return node.children
    ? node.children.map(hastText).join("")
    : (node.value ?? "");
}

/**
 * Moves each image out of the heading or paragraph it's in, into a paragraph
 * of its own, splitting the text around it into a block before and after:
 * `<h2>Foo<img>bar</h2>` becomes `<h2>Foo</h2><p><img></p><h2>bar</h2>`.
 * Images become `:::figure` directives, which only work at the start of a
 * line, so one sharing a line with a heading marker or text never opens.
 * Google does this when an image is pasted onto a heading or into a sentence.
 * Each move is reported, with the markers around the moved image.
 */
function splitBlocksAroundImages(
  doc: GDocDocument,
  diagnostics: DiagnosticCollector
): void {
  for (const img of queryAll(doc, "img")) {
    const block = img.closest("h1, h2, h3, h4, h5, h6, p");
    if (!block?.parentNode) continue;

    const isTitle = block.className.split(" ").includes("title");

    // Clone each ancestor from the image up to the block twice, one holding
    // what came before the image and one what came after.
    let before: GDocElement | null = null;
    let after: GDocElement | null = null;
    let node: GDocElement = img;
    while (node !== block) {
      const parent: GDocElement = node.parentNode!;
      const parentBefore = parent.cloneNode(false);
      const parentAfter = parent.cloneNode(false);
      let isAfter = false;
      for (const child of Array.from(parent.childNodes)) {
        if (child === node) {
          isAfter = true;
          if (before) parentBefore.appendChild(before);
          if (after) parentAfter.appendChild(after);
        } else {
          (isAfter ? parentAfter : parentBefore).appendChild(child);
        }
      }
      before = parentBefore;
      after = parentAfter;
      node = parent;
    }

    const keepBefore = hasContent(before!);
    const keepAfter = hasContent(after!);
    // A paragraph holding only the image is already in the right shape,
    // unless it's a title, which would take the image out of the body.
    if (block.nodeName === "P" && !isTitle && !keepBefore && !keepAfter) {
      block.appendChild(img);
      continue;
    }

    // Only one half keeps the block's id (e.g. a heading's link target).
    after!.removeAttribute("id");
    if (!keepBefore && block.hasAttribute("id")) {
      after!.setAttribute("id", block.getAttribute("id")!);
    }
    const imageParagraph = doc.createElement("p");
    imageParagraph.appendChild(img);
    const isHeading = block.nodeName !== "P";
    const id = diagnostics.report({
      code: "image-moved-out-of-block",
      severity: "warning",
      message: isHeading
        ? "This image was inside a heading, so it was moved out to sit below it."
        : "This image was inside a line of text, so it was moved out to sit on its own.",
    });
    // The markers get paragraphs of their own: next to the image they'd stop
    // its `:::figure` from starting the line.
    const markerParagraph = (marker: string) => {
      const paragraph = doc.createElement("p");
      paragraph.appendChild(doc.createTextNode(marker));
      return paragraph;
    };
    let pieces: GDocElement[];
    if (isTitle) {
      let title: GDocElement | null = null;
      if (keepBefore) {
        title = before;
        if (keepAfter) {
          for (const child of Array.from(after!.childNodes)) {
            before!.appendChild(child);
          }
        }
      } else if (keepAfter) {
        title = after;
      }
      pieces = [
        ...(title ? [title] : []),
        markerParagraph(startMarker(id)),
        imageParagraph,
        markerParagraph(endMarker(id)),
      ];
    } else {
      pieces = [
        ...(keepBefore ? [before!] : []),
        markerParagraph(startMarker(id)),
        imageParagraph,
        markerParagraph(endMarker(id)),
        ...(keepAfter ? [after!] : []),
      ];
    }
    block.after(...pieces);
    block.remove();
  }
}

/** Whether a split-off block has any text, or anything else worth keeping. */
function hasContent(element: GDocElement): boolean {
  return !!element.textContent?.trim() || !!element.querySelector("img, a[id]");
}

function unwrapBrOnlySpans(doc: GDocDocument): void {
  for (const span of queryAll(doc, "span")) {
    const meaningful = Array.from(span.childNodes).filter(
      (n) => !(n.nodeType === TEXT_NODE && !n.textContent?.trim())
    );
    const parent = span.parentNode;
    if (
      parent &&
      meaningful.length > 0 &&
      meaningful.every((n) => isGDocElement(n) && n.tagName === "BR")
    ) {
      for (const br of meaningful) parent.insertBefore(br, span);
      span.remove();
    }
  }
}

function normalizeGdocParagraphBreaks(
  doc: GDocDocument,
  singleLineBreaks: NonNullable<GoogleDocImportOptions["singleLineBreaks"]>
): void {
  const brsPerSplit = singleLineBreaks === "paragraph" ? 1 : 2;
  for (const p of queryAll(doc, "p")) {
    hoistBrsFromInlineWrappers(p, doc);
  }
  // Strip leading and trailing <br>s — equivalent to an extra empty paragraph,
  // which our pipeline already discards.
  for (const p of queryAll(doc, "p")) {
    stripEdgeBr(p);
  }
  // Split paragraphs on runs of `brsPerSplit` or more consecutive <br>s
  // We convert to an Array first so we aren't iterating over a live changing NodeList
  for (const p of queryAll(doc, "p")) {
    const children = Array.from(p.childNodes);

    // This will hold groups of nodes that belong to separate paragraphs
    const paragraphChunks: [GDocChildNode[], ...GDocChildNode[][]] = [[]];
    // The current run of <br>s, plus any whitespace between them
    let brNodesBuffer: GDocChildNode[] = [];
    let brCount = 0;

    for (const node of children) {
      const isWhitespaceOnlyText =
        node.nodeType === TEXT_NODE && !node.textContent?.trim();
      // Ignore formatting whitespace between <br> tags so `<br>\n<br>` is treated as consecutive breaks.
      // Buffer the whitespace node so it gets removed if the surrounding BRs trigger a paragraph split.
      if (isWhitespaceOnlyText && brNodesBuffer.length > 0) {
        brNodesBuffer.push(node);
        continue;
      }

      const isBr = isGDocElement(node) && node.tagName === "BR";

      if (isBr) {
        brCount++;
        brNodesBuffer.push(node);
      } else {
        // If we hit a non-BR node, check if the previous BR streak should trigger a split
        if (brCount >= brsPerSplit) {
          // Start a brand new paragraph chunk
          paragraphChunks.push([]);
          // Delete the breaking <br> tags since they are converted into actual paragraph breaks
          brNodesBuffer.forEach((br) => br.remove());
        } else {
          // A shorter run is a soft break; preserve it in the current chunk
          paragraphChunks[paragraphChunks.length - 1]!.push(...brNodesBuffer);
        }

        // Reset the tracking trackers for the next sequence
        brNodesBuffer = [];
        brCount = 0;

        // Push the current non-BR node into whatever the active paragraph chunk is
        paragraphChunks[paragraphChunks.length - 1]!.push(node);
      }
    }

    // Handle a trailing edge case: if the paragraph ended on a splitting streak of <br>s, clear them
    if (brCount >= brsPerSplit) {
      brNodesBuffer.forEach((br) => br.remove());
    } else {
      paragraphChunks[paragraphChunks.length - 1]!.push(...brNodesBuffer);
    }

    // If no splits happened, we don't need to reconstruct anything
    if (paragraphChunks.length <= 1) continue;

    // Insert the newly formed paragraphs into the DOM sequentially
    let lastInsertedP = p;
    for (let i = 0; i < paragraphChunks.length; i++) {
      const chunk = paragraphChunks[i]!;

      // Create a new paragraph for every split after the first one,
      // cloning the original so attributes (class, style, etc.) are preserved.
      const currentP = i === 0 ? p : p.cloneNode(false);

      // Re-append the nodes belonging to this chunk
      for (const node of chunk) {
        currentP.appendChild(node);
      }

      // Clean up empty inline wrappers (e.g., <b></b>) left behind at the split boundary
      for (const el of queryAll(currentP, "b,strong,i,em,u,s,del,sup,sub")) {
        if (!el.textContent?.trim() && el.children.length === 0) {
          el.remove();
        }
      }

      // Place it in the DOM and update our pointer
      if (i > 0) {
        lastInsertedP.after(currentP);
        lastInsertedP = currentP;
      }
    }
  }

  // Collapse consecutive empty <p>s into one — multiple accidental breaks
  // should produce the same visual gap as a single paragraph separator.
  for (const p of queryAll(doc, "p")) {
    const meaningful = Array.from(p.childNodes).filter(
      (n) => !(n.nodeType === TEXT_NODE && !n.textContent?.trim())
    );
    if (meaningful.length === 0) {
      let next = p.nextSibling;
      while (next) {
        const after = next.nextSibling;
        if (next.nodeType === TEXT_NODE && !next.textContent?.trim()) {
          next = after;
          continue;
        }
        if (isGDocElement(next) && next.tagName === "P") {
          const nextMeaningful = Array.from(next.childNodes).filter(
            (n) => !(n.nodeType === TEXT_NODE && !n.textContent?.trim())
          );
          if (nextMeaningful.length === 0) {
            next.remove();
            next = after;
            continue;
          }
        }
        break;
      }
    }
  }
}

function hoistBrsFromInlineWrappers(p: GDocElement, doc: GDocDocument): void {
  /**
   * If you have <b><i><br></i></b>, the outer querySelectorAll finds <b> first,
   * but <b>'s direct children don't include a <br> — only <i> does. The
   * brs.length === 0 check causes it to skip. You need to process innermost
   * wrappers first, which means reversing the querySelectorAll result (it's
   * depth-first, so reversing gives you deepest first):
   */
  for (const wrapper of queryAll(
    p,
    "b,strong,i,em,u,s,del,sup,sub"
  ).reverse()) {
    const brs = Array.from(wrapper.childNodes).filter(
      (n) => isGDocElement(n) && n.tagName === "BR"
    );
    const parent = wrapper.parentNode;
    if (brs.length === 0 || !parent) continue;

    // Split the wrapper's children around each <br>:
    // <b>text<br>more</b> → <b>text</b><br><b>more</b>
    const chunks: [GDocChildNode[], ...GDocChildNode[][]] = [[]];
    for (const child of Array.from(wrapper.childNodes)) {
      if (isGDocElement(child) && child.tagName === "BR") {
        chunks.push([]);
      } else {
        chunks[chunks.length - 1]!.push(child);
      }
    }

    const brCount = brs.length;
    // Insert wrapper chunks and bare <br>s before the original wrapper
    for (let i = 0; i < chunks.length; i++) {
      if (chunks[i]!.length > 0) {
        const newWrapper = wrapper.cloneNode(false);
        for (const node of chunks[i]!) newWrapper.appendChild(node);
        parent.insertBefore(newWrapper, wrapper);
      }
      if (i < brCount) {
        parent.insertBefore(doc.createElement("br"), wrapper);
      }
    }
    wrapper.remove();
  }
}

function stripEdgeBr(p: GDocElement): void {
  for (const getTarget of [
    (nodes: GDocChildNode[]) => nodes[0],
    (nodes: GDocChildNode[]) => nodes[nodes.length - 1],
  ]) {
    while (true) {
      const meaningful = Array.from(p.childNodes).filter(
        (n) => !(n.nodeType === TEXT_NODE && !n.textContent?.trim())
      );
      const target = getTarget(meaningful);
      if (!target || !isGDocElement(target)) break;

      const isEmpty =
        target.tagName === "BR" ||
        (INLINE_WRAPPERS.has(target.tagName) &&
          !target.textContent?.trim() &&
          target.children.length === 0);

      if (isEmpty) {
        target.remove();
      } else {
        break;
      }
    }
  }
}

// #endregion

// #region Helpers > Debug

// Prints the MDAST
// function remarkDebugTree() {
//   return function (tree: any) {
//     console.info(JSON.stringify(tree, null, 2));
//   };
// }

// #endregion
