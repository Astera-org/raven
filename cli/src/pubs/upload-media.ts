import { type ApiClient, unwrap } from "#src/api/client.js";
import { CliError, ExitCode } from "#src/errors.js";
import { isDirectory, isMissingFile } from "#src/fs-errors.js";
import type { Output } from "#src/output.js";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { displayPath } from "./display-path.js";
import {
  type LocalMedia,
  type LocalReference,
  mediaPath,
} from "./local-media/index.js";
import { isInside } from "./project-path.js";

/** Matches the server's `MEDIA_TRANSFER_CONCURRENCY`. */
const UPLOAD_CONCURRENCY = 4;

export interface MediaFile {
  /** The target as the document's AST has it. */
  target: string;
  /** The file, relative to the current directory, for messages. */
  display: string;
  data: Buffer;
  sha256: string;
  /** The 1-based lines that reference it. */
  lines: number[];
}

/**
 * Reads every media file a document references, relative to its directory.
 * Uploads are public, so only files inside `root` (the project, or the
 * page's directory) are read, even through a symlink. Fails before anything
 * is sent, listing every file that can't be read.
 */
export async function readMediaFiles({
  media,
  directory,
  root,
  file,
}: {
  media: LocalMedia[];
  directory: string;
  root: string;
  file: string;
}): Promise<MediaFile[]> {
  const missing: LocalReference[] = [];
  const outside: LocalReference[] = [];
  const files: MediaFile[] = [];
  const realRoot = await realpath(root);
  for (const entry of media) {
    const path = resolve(directory, mediaPath(entry.target));
    if (!isInside(root, path)) {
      outside.push(...entry.references);
      continue;
    }
    try {
      if (!isInside(realRoot, await realpath(path))) {
        outside.push(...entry.references);
        continue;
      }
      const data = await readFile(path);
      files.push({
        target: entry.target,
        display: displayPath(path),
        data,
        sha256: createHash("sha256").update(data).digest("hex"),
        lines: [...new Set(entry.references.map(({ line }) => line))].sort(
          (a, b) => a - b
        ),
      });
    } catch (error) {
      if (!isMissingFile(error) && !isDirectory(error)) throw error;
      missing.push(...entry.references);
    }
  }
  if (outside.length > 0) {
    throw new CliError(
      [
        `${file} references files outside ${displayPath(root)}, which raven won't upload; move them inside it or use absolute URLs:`,
        ...formatReferences(outside),
      ].join("\n"),
      ExitCode.Validation,
      { outsideFiles: outside }
    );
  }
  if (missing.length > 0) {
    throw new CliError(
      [
        `${file} references files that don't exist:`,
        ...formatReferences(missing),
        ...(missing.some(({ target }) => /[?#]/.test(target))
          ? ["Local image paths can't have a ?query or #fragment; remove it."]
          : []),
      ].join("\n"),
      ExitCode.Validation,
      { missingFiles: missing }
    );
  }
  return files;
}

function formatReferences(references: LocalReference[]): string[] {
  return references
    .sort((a, b) => a.line - b.line)
    .map(({ line, target }) => `  line ${line}: ${mediaPath(target)}`);
}

export interface UploadedMedia {
  /** The uploaded URL for each target. */
  urls: Map<string, string>;
  /** Each local file and the URL that replaces it. */
  uploads: { file: string; url: string; lines: number[] }[];
  /** Whether an upload opened the publication's draft. */
  draftCreated: boolean;
}

/**
 * Uploads each distinct file to the publication's draft, a few at a time.
 * Every upload runs to the end; if any failed, they're all reported
 * together.
 */
export async function uploadMediaFiles({
  api,
  apiUrl,
  publicationId,
  files,
  output,
}: {
  api: ApiClient;
  apiUrl: string;
  publicationId: string;
  files: MediaFile[];
  output: Output;
}): Promise<UploadedMedia> {
  const byKey = new Map<string, MediaFile>();
  for (const file of files) {
    if (!byKey.has(uploadKey(file))) byKey.set(uploadKey(file), file);
  }

  const urlByKey = new Map<string, string>();
  let draftCreated = false;
  const failures: { file: string; error: CliError }[] = [];
  await runConcurrently(
    [...byKey.values()],
    UPLOAD_CONCURRENCY,
    async (file) => {
      try {
        const uploaded = await uploadFile(api, apiUrl, publicationId, file);
        urlByKey.set(uploadKey(file), uploaded.url);
        draftCreated ||= uploaded.draftCreated;
        output.progress(
          `Uploaded ${file.display} (${formatLines(file.lines)})`
        );
      } catch (error) {
        if (!(error instanceof CliError)) throw error;
        failures.push({ file: file.display, error });
      }
    }
  );

  if (failures.length > 0) {
    const [first] = failures;
    throw new CliError(
      [
        `${failures.length} of ${byKey.size} files failed to upload, so the draft wasn't changed:`,
        ...failures.map(({ file, error }) => `  ${file}: ${error.message}`),
      ].join("\n"),
      first!.error.exitCode,
      {
        failures: failures.map(({ file, error }) => ({
          file,
          code: error.code,
          message: error.message,
        })),
      }
    );
  }
  const uploads = files.map((file) => ({
    target: file.target,
    file: file.display,
    url: urlByKey.get(uploadKey(file))!,
    lines: file.lines,
  }));
  return {
    urls: new Map(uploads.map(({ target, url }) => [target, url])),
    uploads: uploads.map(({ file, url, lines }) => ({ file, url, lines })),
    draftCreated,
  };
}

/** `line 12`, or `lines 12, 40`. */
export function formatLines(lines: number[]): string {
  return `${lines.length === 1 ? "line" : "lines"} ${lines.join(", ")}`;
}

/**
 * The server stores uploads by their bytes and lowercased extension, since
 * MyST tells images, video and audio apart by the URL's extension.
 */
function uploadKey(file: MediaFile): string {
  return `${file.sha256}${extname(file.display).toLowerCase()}`;
}

function uploadFile(
  api: ApiClient,
  apiUrl: string,
  publicationId: string,
  file: MediaFile
) {
  const form = new FormData();
  form.append("file", new Blob([file.data]), basename(file.display));
  return unwrap(apiUrl, () =>
    api.POST("/publications/id/{id}/draft/media-assets", {
      params: { path: { id: publicationId } },
      body: { file: file.display },
      bodySerializer: () => form,
    })
  );
}

async function runConcurrently<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]!);
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker)
  );
}
