import { type VersionBibliography } from "#src/db/schema.js";
import { formatBibliographyEntry } from "#src/lib/bibliography/format-csl-json.js";
import {
  type BibliographyEntry,
  type CSL,
  parseBibliography,
} from "#src/lib/bibliography/parse-bibliography.js";
import { type MystFrontmatter } from "@raven/core-import-format";
import { fileWarn, type GenericNode, type GenericParent } from "myst-common";
import { buttonRole } from "myst-ext-button";
import { cardDirective } from "myst-ext-card";
import { exerciseDirectives } from "myst-ext-exercise";
import { gridDirectives } from "myst-ext-grid";
import { proofDirective } from "myst-ext-proof";
import { tabDirectives } from "myst-ext-tabs";
import { mystParse } from "myst-parser";
import {
  basicTransformations,
  codeTransform,
  enumerateTargetsTransform,
  footnotesTransform,
  glossaryTransform,
  inlineMathSimplificationTransform,
  ReferenceState,
  resolveLinksAndCitationsTransform,
  resolveReferencesTransform,
} from "myst-transforms";
import { VFile } from "vfile";
import {
  renderingFrontmatter,
  type RenderingFrontmatter,
} from "./frontmatter.js";
import {
  type CitedEntry,
  stacksCitationsTransform,
} from "./stacks-citations.js";
import { MDAST_SCHEMA_VERSION, MYST_AST_VERSION } from "./versions.js";
import { walk } from "./walk.js";

export type PublicationPart = "abstract" | "body";

export interface MdastMessage {
  severity: "error" | "warning";
  message: string;
  /**
   * Which field the line refers to; lines count from 1 within it. For inline
   * content, such as a citation, `myst-parser` gives the line its paragraph
   * starts on.
   */
  part?: PublicationPart;
  line?: number;
}

export interface PublicationMdast {
  schema: number;
  version: number;
  tree: GenericParent;
  /** Each citation's identifier, in citation order. */
  citations: { order: string[] };
  /**
   * The frontmatter the client needs to render the tree: `math`, the LaTeX
   * macros its math uses, since math is not pre-rendered. Absent when empty.
   */
  frontmatter?: Pick<RenderingFrontmatter, "math">;
  messages: MdastMessage[];
  /**
   * The bibliography keys among the citations, in the same order. Kept out of
   * the payload, like `messages`: it says which entries a response may expose,
   * which is Raven's business, not the renderer's.
   */
  citedKeys: string[];
  /**
   * The CSL-JSON of those entries, by citation key, in `citedKeys` order.
   * Carried out of the build because it already parsed the files: a response
   * that exposes the cited entries would otherwise reparse the whole
   * bibliography on every read.
   */
  citedEntries: Record<string, CSL>;
}

/** The extensions `myst-cli` registers on top of the default directives. */
const PARSE_OPTIONS = {
  directives: [
    cardDirective,
    ...gridDirectives,
    proofDirective,
    ...exerciseDirectives,
    ...tabDirectives,
  ],
  roles: [buttonRole],
};

/** Ids thestacks.org gives its own elements, such as the Purpose heading. */
const RESERVED_HTML_IDS = ["purpose"];

const UNSUPPORTED_NODES: Record<string, string> = {
  include: "{include} and {literalinclude} are not supported yet",
  embed: "{embed} is not supported yet",
};

const RAW_HTML_MESSAGE =
  "Raw HTML is not rendered on thestacks.org yet and will be left out";

function isHtmlComment(node: GenericNode): boolean {
  const value = String(node.value ?? "").trim();
  return value.startsWith("<!--") && value.endsWith("-->");
}

/**
 * Builds the MyST AST thestacks.org renders for a MyST publication (see the
 * `initial-myst-support` skill). Pure and deterministic: the same abstract and
 * body always give identical JSON, which keeps the cache and `ETag`s stable.
 */
export function buildPublicationMdast({
  abstract,
  body,
  bibliography,
  frontmatter,
}: {
  abstract: string | null | undefined;
  body: string | null | undefined;
  /** The publication's own BibTeX files, whose entries its keys may cite. */
  bibliography?: VersionBibliography | null;
  /** The version's `numbering` and `math` frontmatter. */
  frontmatter?: MystFrontmatter | null;
}): PublicationMdast {
  const { numbering, math } = renderingFrontmatter(frontmatter);
  const messages: MdastMessage[] = [];
  // Parsed once, for the `cite` nodes' text and for `citedEntries`.
  const entries = parseBibliography(bibliography).entries;
  const abstractSource = abstract ?? "";
  const abstractChildren = parsePart(abstractSource, "abstract", messages);
  const bodyChildren = parsePart(body ?? "", "body", messages);

  // Positions are shifted so a line number in the combined tree tells the
  // parts apart; collectMessages maps them back.
  const bodyLineOffset = abstractSource.split("\n").length;
  shiftLines(bodyChildren, bodyLineOffset);

  // Parsed separately, so an unclosed fence in the abstract cannot swallow
  // the body, but transformed together, so numbering runs on continuously.
  const tree: GenericParent = {
    type: "root",
    children: [
      { type: "block", data: { part: "abstract" }, children: abstractChildren },
      { type: "block", data: { part: "body" }, children: bodyChildren },
    ],
  };

  const file = new VFile();
  inlineMathSimplificationTransform(tree, { replaceSymbol: false });
  glossaryTransform(tree, file);
  const { order, keys } = stacksCitationsTransform(tree, citeNodes(entries));
  codeTransform(tree, file);
  footnotesTransform(tree, file);
  reserveHtmlIds(tree);

  // mathTransform is left out: thestacks.org renders KaTeX itself. So is
  // linksTransform, which makes network calls.
  const state = new ReferenceState("publication", {
    vfile: file,
    frontmatter: numbering ? { numbering } : undefined,
  });
  enumerateTargetsTransform(tree, { state });
  resolveLinksAndCitationsTransform(tree, { state });
  resolveReferencesTransform(tree, file, { state });
  warnUnsupported(tree, file);

  collectMessages(file, messages, (line) =>
    line > bodyLineOffset
      ? { part: "body", line: line - bodyLineOffset }
      : { part: "abstract", line }
  );

  return {
    schema: MDAST_SCHEMA_VERSION,
    version: MYST_AST_VERSION,
    tree: finalizeTree(tree),
    citations: { order },
    ...(math ? { frontmatter: { math } } : {}),
    messages,
    citedKeys: keys,
    citedEntries: Object.fromEntries(
      keys.flatMap((key) => {
        const entry = entries.get(key);
        return entry ? [[key, entry.entry] as const] : [];
      })
    ),
  };
}

/**
 * The bibliography's entries by citation key, each with what a `cite` node
 * carries. Formatting happens here rather than on the client, so an entry
 * reads like a reference the DOI resolver described. Files that don't parse
 * and duplicate keys are reported where the files are written, not here.
 */
function citeNodes(
  entries: Map<string, BibliographyEntry>
): Map<string, CitedEntry> {
  const nodes = new Map<string, CitedEntry>();
  for (const [key, entry] of entries) {
    nodes.set(key, {
      identifier: entry.referenceUrl ?? key,
      text: formatBibliographyEntry(entry.entry),
    });
  }
  return nodes;
}

function parsePart(
  source: string,
  part: PublicationPart,
  messages: MdastMessage[]
): GenericNode[] {
  const file = new VFile();
  const tree = mystParse(source, { ...PARSE_OPTIONS, vfile: file });
  // Before the roles and directives are lifted, while their nodes still hold
  // the exact lines, then again for the nodes the transforms add.
  inheritPositions(tree);
  // No firstDepth, so authors' heading depths are kept.
  basicTransformations(tree, file);
  inheritPositions(tree);
  collectMessages(file, messages, (line) => ({ part, line }));

  // blockNestingTransform wraps the content in a bare block even without
  // `+++` markers; the part's own block replaces it.
  const [only, ...rest] = tree.children;
  const isBareBlock =
    only?.type === "block" &&
    Object.keys(only).every((key) =>
      ["type", "children", "position"].includes(key)
    );
  return isBareBlock && rest.length === 0
    ? (only.children ?? [])
    : tree.children;
}

/**
 * Nodes made by roles and directives (a `{cite}`'s `cite`, for example) have
 * no position of their own; giving them their parent's lets later warnings
 * about them carry a line.
 */
function inheritPositions(tree: GenericParent): void {
  walk(tree, (node, parent) => {
    if (!node.position && parent?.position) node.position = parent.position;
  });
}

function shiftLines(nodes: GenericNode[], offset: number): void {
  for (const root of nodes) {
    walk(root, (node) => {
      if (!node.position) return;
      node.position = {
        ...node.position,
        start: {
          ...node.position.start,
          line: node.position.start.line + offset,
        },
        end: { ...node.position.end, line: node.position.end.line + offset },
      };
    });
  }
}

/** Renames body ids that would clash with ids thestacks.org adds itself. */
function reserveHtmlIds(tree: GenericParent): void {
  const taken = new Set<string>();
  walk(tree, (node) => {
    if (typeof node.html_id === "string") taken.add(node.html_id);
  });
  walk(tree, (node) => {
    if (!RESERVED_HTML_IDS.includes(node.html_id)) return;
    let suffix = 1;
    while (taken.has(`${node.html_id}-${suffix}`)) suffix++;
    node.html_id = `${node.html_id}-${suffix}`;
    taken.add(node.html_id);
  });
}

function warnUnsupported(tree: GenericParent, file: VFile): void {
  // `<b>bold</b>` is two html nodes; one warning per line is enough.
  const rawHtmlLines = new Set<number | undefined>();
  walk(tree, (node) => {
    const message = UNSUPPORTED_NODES[node.type];
    if (message) fileWarn(file, message, { node });
    if (node.type !== "html" || isHtmlComment(node)) return;
    const line = node.position?.start.line;
    if (rawHtmlLines.has(line)) return;
    rawHtmlLines.add(line);
    fileWarn(file, RAW_HTML_MESSAGE, { node });
  });
}

function collectMessages(
  file: VFile,
  messages: MdastMessage[],
  locate: (line: number) => Pick<MdastMessage, "part" | "line">
): void {
  for (const message of file.messages) {
    if (message.fatal == null) continue;
    messages.push({
      severity: message.fatal ? "error" : "warning",
      message: message.reason,
      ...(message.line ? locate(message.line) : {}),
    });
  }
}

/**
 * Copies the tree through JSON (which also separates nodes the resolvers
 * share between places), drops positions, and gives every node a key from
 * its depth-first index in place of `keysTransform`'s random ones.
 */
function finalizeTree(tree: GenericParent): GenericParent {
  const copy = JSON.parse(JSON.stringify(tree)) as GenericParent;
  let index = 0;
  walk(copy, (node) => {
    delete node.position;
    node.key = `k${index++}`;
  });
  return copy;
}
