import { CliError, ExitCode } from "#src/errors.js";
import { isDirectory, isMissingFile } from "#src/fs-errors.js";
import { readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { displayPath } from "./display-path.js";
import { isInside, relativePath } from "./project-path.js";
import type { BibliographyReference, PublicationInput } from "./read-input.js";

const URL_TARGET = /^[a-z][a-z0-9+.-]*:\/\//i;

export interface BibliographyFile {
  /**
   * The file's path from the link root (the project, or a single file's
   * directory), as the server stores its name. Not relative to the page: a
   * page in a subdirectory would need `..`, which the server rejects.
   */
  filename: string;
  content: string;
  /** The file relative to the current directory, for messages. */
  display: string;
}

/**
 * The BibTeX files a document's citations resolve against, read and ready to
 * send. Fails before anything is sent on a file raven can't read, as the
 * media does: the bibliography is part of what a push replaces, so a half
 * written one is worse than none.
 */
export async function readBibliographyFiles(
  input: PublicationInput
): Promise<BibliographyFile[]> {
  const urls = input.bibliography.filter(({ target }) =>
    URL_TARGET.test(target)
  );
  if (urls.length > 0) {
    throw new CliError(
      [
        "raven won't fetch a bibliography, and the server never does either:",
        ...formatReferences(urls),
        "Download each file and name the local copy instead.",
      ].join("\n"),
      ExitCode.Validation,
      { bibliographyUrls: urls.map(({ target }) => target) }
    );
  }

  const realRoot = await realpath(input.linkRoot);
  const missing: BibliographyReference[] = [];
  const outside: BibliographyReference[] = [];
  const files = new Map<string, BibliographyFile>();
  for (const reference of input.bibliography) {
    const path = resolve(reference.directory, reference.target);
    // The root itself (`bibliography: .`) is a directory, not a file
    // outside it: reading it fails, and it's reported as missing.
    if (path !== resolve(input.linkRoot) && !isInside(input.linkRoot, path)) {
      outside.push(reference);
      continue;
    }
    // Named twice, by myst.yml and by the page, or by two spellings of one
    // path: the server takes each file once.
    if (files.has(path)) continue;
    try {
      const realPath = await realpath(path);
      if (realPath !== realRoot && !isInside(realRoot, realPath)) {
        outside.push(reference);
        continue;
      }
      files.set(path, {
        filename: relativePath(input.linkRoot, path),
        content: await readFile(path, "utf8"),
        display: displayPath(path),
      });
    } catch (error) {
      if (!isMissingFile(error) && !isDirectory(error)) throw error;
      missing.push(reference);
    }
  }

  if (outside.length > 0) {
    throw new CliError(
      [
        `the bibliography names files outside ${displayPath(input.linkRoot)}, which raven won't send; move them inside it:`,
        ...formatReferences(outside),
      ].join("\n"),
      ExitCode.Validation,
      { outsideFiles: formatTargets(outside) }
    );
  }
  if (missing.length > 0) {
    throw new CliError(
      [
        "the bibliography names files that don't exist:",
        ...formatReferences(missing),
      ].join("\n"),
      ExitCode.Validation,
      { missingFiles: formatTargets(missing) }
    );
  }
  return [...files.values()];
}

/** The bibliography a create or push sends, for `--json` and `--dry-run`. */
export function bibliographyPlan(files: BibliographyFile[]) {
  return files.map(({ filename, display, content }) => ({
    filename,
    file: display,
    bytes: Buffer.byteLength(content),
  }));
}

/** Lines reporting the bibliography a create or push sends. */
export function formatBibliography(files: BibliographyFile[]): string[] {
  if (files.length === 0) return ["No bibliography."];
  return [
    "Bibliography:",
    ...files.map(
      ({ display, content }) =>
        `  ${display} (${Buffer.byteLength(content)} bytes)`
    ),
  ];
}

function formatReferences(references: BibliographyReference[]): string[] {
  return references.map(({ target, from }) => `  ${target} (from ${from})`);
}

function formatTargets(references: BibliographyReference[]) {
  return references.map(({ target, from }) => ({ file: target, from }));
}
