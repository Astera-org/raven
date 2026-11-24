import {
  type ImportedPublicationInput,
  ImporterError,
  licenseFromSpdx,
  type MystFrontmatter,
  TAG_MAX_LENGTH,
  type UserRef,
} from "@raven/core-import-format";
import {
  type GenericNode,
  type GenericParent,
  selectBlockParts,
} from "myst-common";
import { validatePageFrontmatter } from "myst-frontmatter";
import { mystParse } from "myst-parser";
import { blockMetadataTransform, getFrontmatter } from "myst-transforms";
import { VFile } from "vfile";

/** The format stored with the document, as `importDocument.format`. */
export const MYSTMD_FORMAT = "mystmd";

export interface MystmdImportOptions {
  /** Name of the source file, stored with the document. */
  filename?: string | null;
}

interface LineRange {
  /** 1-based, inclusive. */
  start: number;
  /** 1-based, inclusive. */
  end: number;
}

/**
 * Imports a standard MyST document: its frontmatter `title`, `subtitle`,
 * `abstract`, `license`, `keywords`, `doi` and `authors` become the
 * publication's fields, `numbering` and `math` are kept as the version's
 * `frontmatter`, the rest is the body. MyST trees (unified 10) never
 * leave this package.
 *
 * Throws an `ImporterError` with code `validation` when the frontmatter is
 * invalid or a field can't be stored; issue paths name the document's fields
 * (`["license"]`, `["keywords", 1]`), or `["body"]` for the document itself.
 */
export function importMystmd(
  source: string,
  { filename = null }: MystmdImportOptions = {}
): ImportedPublicationInput {
  const file = new VFile();
  const tree = mystParse(source);
  blockMetadataTransform(tree, file);

  const contentNodes = listContentNodes(tree);
  const { frontmatter: rawFrontmatter } = getFrontmatter(file, tree, {
    propagateTargets: false,
  });
  const remaining = new Set(listContentNodes(tree));
  const removedByFrontmatter = contentNodes.filter(
    (node) => !remaining.has(node)
  );

  const issues = file.messages
    .filter((message) => message.fatal)
    .map((message) => message.message);
  const validationOptions: Parameters<typeof validatePageFrontmatter>[1] = {
    property: "frontmatter",
    messages: {},
  };
  const frontmatter = validatePageFrontmatter(
    rawFrontmatter,
    validationOptions
  );
  issues.push(
    ...(validationOptions.messages.errors ?? []).map((error) => error.message)
  );
  if (issues.length > 0) {
    throw validationError(
      issues.map((message) => ({ path: ["body"], message }))
    );
  }

  const lines = source.split(/(?<=\n)/);
  const abstractRanges = selectBlockParts(tree, "abstract").map((block) =>
    blockRange(tree, block, lines.length)
  );
  const removedRanges = [
    ...removedByFrontmatter.flatMap((node) => nodeRange(node) ?? []),
    ...abstractRanges,
  ];

  const frontmatterAbstract = frontmatter.parts?.abstract;
  const abstract =
    frontmatterAbstract && frontmatterAbstract.length > 0
      ? frontmatterAbstract.join("\n\n").trim()
      : abstractRanges
          .map((range) => sliceLines(lines, range.start + 1, range.end).trim())
          .filter((text) => text.length > 0)
          .join("\n\n") || undefined;

  // Without a frontmatter title, getFrontmatter falls back to the first
  // heading at any depth, leaving it in the content unless it's a leading H1.
  // Only a leading H1 may become the title, so `## Methods` can't.
  const title =
    rawFrontmatter.content_includes_title === true
      ? undefined
      : frontmatter.title;
  const keywords = frontmatter.keywords ?? [];

  const fieldIssues = [
    ...licenseIssues(frontmatter.license?.content),
    ...keywords.flatMap((keyword, index) =>
      keyword.length > TAG_MAX_LENGTH
        ? [
            {
              path: ["keywords", index],
              message: `Keywords can be at most ${TAG_MAX_LENGTH} characters`,
            },
          ]
        : []
    ),
  ];
  if (fieldIssues.length > 0) throw validationError(fieldIssues);
  const spdx = spdxIdentifier(frontmatter.license?.content);

  return {
    publication: {
      doi: frontmatter.doi ?? null,
      license: spdx ? (licenseFromSpdx(spdx) ?? undefined) : undefined,
      tags: keywords,
    },
    version: {
      title: title ?? null,
      subtitle: frontmatter.subtitle ?? null,
      abstract: abstract ?? null,
      body: removeLines(lines, removedRanges),
      frontmatter: renderingFrontmatter(frontmatter),
    },
    importDocument: {
      format: MYSTMD_FORMAT,
      body: source,
      url: null,
      filename,
    },
    contributors: (frontmatter.authors ?? [])
      .filter((author) => !author.collaboration)
      .map((author) => ({
        user: userRefs(author),
        displayName: author.name,
        roles: author.roles ?? [],
      })),
  };
}

type PageFrontmatter = ReturnType<typeof validatePageFrontmatter>;

/** The frontmatter that changes how the body renders, or null if it has none. */
function renderingFrontmatter({
  numbering,
  math,
}: PageFrontmatter): MystFrontmatter | null {
  const kept = {
    ...(numbering && Object.keys(numbering).length > 0 ? { numbering } : {}),
    ...(math && Object.keys(math).length > 0 ? { math } : {}),
  };
  return Object.keys(kept).length > 0 ? kept : null;
}

type FrontmatterLicense = NonNullable<
  ReturnType<typeof validatePageFrontmatter>["license"]
>["content"];
type FrontmatterAuthor = NonNullable<
  ReturnType<typeof validatePageFrontmatter>["authors"]
>[number];

/** The SPDX ID when MyST recognises the license, otherwise the text as written. */
function spdxIdentifier(license: FrontmatterLicense): string | undefined {
  return license?.id ?? license?.name;
}

function licenseIssues(license: FrontmatterLicense): FieldIssue[] {
  const spdx = spdxIdentifier(license);
  if (!spdx || licenseFromSpdx(spdx)) return [];
  return [
    {
      path: ["license"],
      message: `Unsupported license "${spdx}"; use an SPDX ID such as CC-BY-4.0`,
    },
  ];
}

/**
 * An author is found by ORCID iD, then by email. One with neither keeps their
 * name, so the import can say who it couldn't find.
 */
function userRefs(author: FrontmatterAuthor): UserRef[] {
  const refs: UserRef[] = [];
  if (author.orcid) refs.push({ by: "orcid", value: author.orcid });
  if (author.email) refs.push({ by: "email", value: author.email });
  if (refs.length === 0) {
    refs.push({ by: "fullname", value: author.name ?? "unnamed" });
  }
  return refs;
}

interface FieldIssue {
  path: (string | number)[];
  message: string;
}

function validationError(issues: FieldIssue[]): ImporterError {
  return new ImporterError(
    {
      code: "validation",
      issues: issues.map((issue) => ({ code: "custom", ...issue })),
    },
    `Invalid MyST document: ${issues.map((issue) => issue.message).join("; ")}`
  );
}

/** Top-level nodes, and the children of top-level `+++` blocks. */
function listContentNodes(tree: GenericParent): GenericNode[] {
  return tree.children.flatMap((child) =>
    child.type === "block" ? (child.children ?? []) : [child]
  );
}

function nodeRange(node: GenericNode): LineRange | undefined {
  const { position } = node;
  if (!position) return undefined;
  return { start: position.start.line, end: position.end.line };
}

/**
 * A block's position covers only its `+++` marker line, so it ends where the
 * next marker starts.
 */
function blockRange(
  tree: GenericParent,
  block: GenericNode,
  lineCount: number
): LineRange {
  const start = block.position?.start.line ?? 1;
  const nextBlock = tree.children
    .slice(tree.children.indexOf(block) + 1)
    .find((child) => child.type === "block" && child.position);
  const end = nextBlock?.position
    ? nextBlock.position.start.line - 1
    : lineCount;
  return { start, end };
}

function sliceLines(lines: string[], start: number, end: number): string {
  return lines.slice(start - 1, end).join("");
}

function removeLines(lines: string[], ranges: LineRange[]): string {
  const isRemoved = (lineNumber: number) =>
    ranges.some(
      (range) => lineNumber >= range.start && lineNumber <= range.end
    );
  return lines
    .filter((_, index) => !isRemoved(index + 1))
    .join("")
    .replace(/^(?:[ \t]*\r?\n)+/, "")
    .trimEnd();
}
