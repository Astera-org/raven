import { CliError, ExitCode } from "#src/errors.js";
import { isMissingFile } from "#src/fs-errors.js";
import {
  fillNumbering,
  type Numbering,
  validateNumbering,
} from "myst-frontmatter";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import {
  type Frontmatter,
  joinFrontmatter,
  parseYamlObject,
  splitFrontmatter,
} from "./frontmatter.js";
import { relativePath } from "./project-path.js";

export const PROJECT_CONFIG = "myst.yml";

/**
 * Project frontmatter keys a page inherits when it doesn't set them, from
 * `USE_PROJECT_FALLBACK` in mystmd's `myst-frontmatter`. `title`, `subtitle`
 * and `abstract` are page-only. `numbering` is left out because, like `math`,
 * mystmd combines it with the page's rather than replacing it.
 */
const PROJECT_FALLBACK_KEYS = [
  "authors",
  "reviewers",
  "editors",
  "date",
  "doi",
  "arxiv",
  "pmid",
  "pmcid",
  "open_access",
  "license",
  "github",
  "edit_url",
  "source_url",
  "binder",
  "source",
  "subject",
  "venue",
  "volume",
  "issue",
  "first_page",
  "last_page",
  "keywords",
  "funding",
  "copyright",
  "affiliations",
] as const;

const SKIPPED_DIRECTORIES = new Set(["_build", "node_modules"]);

/** A bibliography file the document names, or a URL it names in its place. */
export interface BibliographyReference {
  /** The path as written, or a path from the project root when discovered. */
  target: string;
  /** The directory `target` is relative to. */
  directory: string;
  /** What named it, for messages. */
  from: string;
}

export interface PublicationInput {
  /** The MyST document sent to the server. */
  source: string;
  /** The page's file name, stored with the source. */
  filename: string;
  /** The page's directory, which its relative file references start from. */
  directory: string;
  /** Directory holding the `.raven/` link file for this input. */
  linkRoot: string;
  /** The page's path relative to `linkRoot`, with `/` separators. */
  linkPath: string;
  /**
   * The BibTeX files the document's citations resolve against, as mystmd
   * builds a project's bibliography: those `myst.yml` names, or every `.bib`
   * file in the project when it names none, plus those the page's own
   * frontmatter names.
   */
  bibliography: BibliographyReference[];
  warnings: string[];
}

/**
 * Reads a `.md` file as is, or the one article of a MyST project directory
 * merged with the project's frontmatter, as mystmd would see it.
 */
export async function readPublicationInput(
  path: string,
  { page }: { page?: string } = {}
): Promise<PublicationInput> {
  const absolute = resolve(path);
  const kind = await pathKind(absolute, path);
  if (kind === "file") {
    if (page !== undefined) {
      throw usageError("--page only applies to a MyST project directory");
    }
    return readFileInput(absolute, path);
  }
  return readProjectInput(absolute, path, page);
}

async function readFileInput(
  absolute: string,
  path: string
): Promise<PublicationInput> {
  if (!absolute.endsWith(".md")) {
    throw usageError(`${path} is not a Markdown (.md) file`);
  }
  const source = await readFile(absolute, "utf8");
  const file = basename(absolute);
  return {
    source,
    filename: file,
    directory: dirname(absolute),
    linkRoot: dirname(absolute),
    linkPath: file,
    // A single file has no project, so nothing is discovered for it.
    bibliography: pageBibliography(source, dirname(absolute), file),
    warnings: [],
  };
}

async function readProjectInput(
  root: string,
  path: string,
  page: string | undefined
): Promise<PublicationInput> {
  const configPath = join(root, PROJECT_CONFIG);
  let configText: string;
  try {
    configText = await readFile(configPath, "utf8");
  } catch (error) {
    if (!isMissingFile(error)) throw error;
    throw usageError(
      `${path} has no ${PROJECT_CONFIG}; pass a .md file or a MyST project directory`
    );
  }
  const config = parseYamlObject(configText, configPath);
  const project = asObject(config.project);
  const warnings =
    config.extends === undefined
      ? []
      : [`${PROJECT_CONFIG} uses "extends", which raven ignores`];

  const pagePath =
    page === undefined ? await findArticle(root, project) : resolve(root, page);
  if (page !== undefined && (await pathKind(pagePath, page)) !== "file") {
    throw usageError(`${page} is not a file`);
  }
  if (!pagePath.endsWith(".md")) {
    throw usageError(
      `${relativePath(root, pagePath)} is not a Markdown (.md) file`
    );
  }

  const text = await readFile(pagePath, "utf8");
  const linkPath = relativePath(root, pagePath);
  return {
    source: withProjectFrontmatter(text, project, linkPath),
    filename: basename(pagePath),
    directory: dirname(pagePath),
    linkRoot: root,
    linkPath,
    bibliography: [
      ...(await projectBibliography(root, project)),
      ...pageBibliography(text, dirname(pagePath), linkPath),
    ],
    warnings,
  };
}

/**
 * The project's bibliography: what `myst.yml` names, relative to it, or every
 * `.bib` file in the project when it names none, as mystmd's site build does,
 * so a project that renders with `myst build` renders on The Stacks too.
 */
async function projectBibliography(
  root: string,
  project: Frontmatter
): Promise<BibliographyReference[]> {
  const named = stringList(project.bibliography);
  if (named !== undefined) {
    return named.map((target) => ({
      target,
      directory: root,
      from: PROJECT_CONFIG,
    }));
  }
  const found = await findFiles(root, (name) => name.endsWith(".bib"));
  return found.map((path) => ({
    target: relativePath(root, path),
    directory: root,
    from: "the project",
  }));
}

/**
 * The bibliography the page's own frontmatter names, relative to the page.
 * mystmd only reads this for exports, but it is the one way to give a single
 * `.md` file a bibliography.
 */
function pageBibliography(
  text: string,
  directory: string,
  file: string
): BibliographyReference[] {
  const { frontmatter } = splitFrontmatter(text, file);
  return (stringList(frontmatter?.bibliography) ?? []).map((target) => ({
    target,
    directory,
    from: file,
  }));
}

/** A frontmatter value mystmd reads as a list of files: one, or several. */
function stringList(value: unknown): string[] | undefined {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return undefined;
}

function withProjectFrontmatter(
  text: string,
  project: Frontmatter,
  file: string
): string {
  const { frontmatter, body } = splitFrontmatter(text, file);
  const inherited = PROJECT_FALLBACK_KEYS.filter(
    (key) => project[key] !== undefined && frontmatter?.[key] === undefined
  );
  const combinesNumbering = project.numbering !== undefined;
  const combinesMath = project.math !== undefined;
  if (inherited.length === 0 && !combinesNumbering && !combinesMath) {
    return text;
  }

  const merged: Frontmatter = { ...frontmatter };
  for (const key of inherited) merged[key] = project[key];
  if (combinesNumbering) {
    merged.numbering = combinedNumbering(
      frontmatter?.numbering,
      project.numbering,
      file
    );
  }
  if (combinesMath) {
    merged.math = { ...asObject(project.math), ...asObject(frontmatter?.math) };
  }
  return joinFrontmatter(
    merged,
    frontmatter === undefined ? `\n${body}` : body
  );
}

async function findArticle(
  root: string,
  project: Frontmatter
): Promise<string> {
  const candidates =
    project.toc === undefined
      ? await findMarkdownFiles(root)
      : tocFiles(project.toc).map((file) => resolve(root, file));
  if (candidates.length === 1 && candidates[0] !== undefined) {
    return candidates[0];
  }
  if (candidates.length === 0) {
    throw usageError(`the project in ${root} has no Markdown pages`);
  }
  const list = candidates.map((file) => `  ${relativePath(root, file)}`);
  throw usageError(
    [
      "the project has several pages; pick one with --page <file>:",
      ...list,
    ].join("\n")
  );
}

function tocFiles(toc: unknown): string[] {
  if (!Array.isArray(toc)) return [];
  return toc.flatMap((entry) => {
    const item = asObject(entry);
    if (item.pattern !== undefined) {
      throw usageError(
        `${PROJECT_CONFIG} uses a toc pattern, which raven doesn't expand; pick a page with --page <file>`
      );
    }
    const own = typeof item.file === "string" ? [item.file] : [];
    return [...own, ...tocFiles(item.children)];
  });
}

function findMarkdownFiles(directory: string): Promise<string[]> {
  return findFiles(directory, (name) => name.endsWith(".md"));
}

/** Every matching file in the project, skipping what mystmd skips. */
async function findFiles(
  directory: string,
  matches: (name: string) => boolean
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith("."))
      .map(async (entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
          return SKIPPED_DIRECTORIES.has(entry.name)
            ? []
            : findFiles(path, matches);
        }
        return entry.isFile() && matches(entry.name) ? [path] : [];
      })
  );
  return nested.flat().sort();
}

async function pathKind(
  absolute: string,
  path: string
): Promise<"file" | "directory"> {
  try {
    const stats = await stat(absolute);
    if (stats.isDirectory()) return "directory";
    if (stats.isFile()) return "file";
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
  throw usageError(`no such file or directory: ${path}`);
}

/**
 * The page's `numbering` filled in from the project's, as mystmd's
 * `fillProjectFrontmatter` does. It merges the validated forms, in which
 * shorthands such as `headings: true` are spelled out item by item.
 */
function combinedNumbering(
  page: unknown,
  project: unknown,
  file: string
): unknown {
  if (page === undefined) return project;
  return fillNumbering(
    validatedNumbering(page, file),
    validatedNumbering(project, PROJECT_CONFIG)
  );
}

function validatedNumbering(value: unknown, file: string): Numbering {
  const messages: Parameters<typeof validateNumbering>[1]["messages"] = {};
  const numbering = validateNumbering(value, {
    property: "numbering",
    messages,
    file,
  });
  const [error] = messages.errors ?? [];
  if (error)
    throw new CliError(`invalid ${error.message}`, ExitCode.Validation);
  return numbering ?? {};
}

function asObject(value: unknown): Frontmatter {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Frontmatter)
    : {};
}

function usageError(message: string): CliError {
  return new CliError(message, ExitCode.Usage);
}
