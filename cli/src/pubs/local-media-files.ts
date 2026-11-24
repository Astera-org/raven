import { CliError, ExitCode } from "#src/errors.js";
import {
  findLocalFiles,
  findUnrewritable,
  type LocalMedia,
} from "./local-media/index.js";
import type { PublicationInput } from "./read-input.js";
import { formatLines, type MediaFile, readMediaFiles } from "./upload-media.js";

export interface LocalMediaFiles {
  media: LocalMedia[];
  files: MediaFile[];
}

/**
 * The local media a document references, read and ready to upload. Fails
 * before anything is sent on a file raven can't upload, can't read, or
 * can't replace with its URL.
 */
export async function readLocalMediaFiles(
  input: PublicationInput
): Promise<LocalMediaFiles> {
  const { media, unsupported } = findLocalFiles(input.source);
  if (unsupported.length > 0) {
    throw new CliError(
      [
        `${input.linkPath} includes local files, which raven can't upload; inline them or use absolute URLs:`,
        ...unsupported.map(({ line, target }) => `  line ${line}: ${target}`),
      ].join("\n"),
      ExitCode.Validation,
      { localReferences: unsupported }
    );
  }
  const unrewritable = findUnrewritable(input.source, media);
  if (unrewritable.length > 0) {
    throw new CliError(
      [
        `${input.linkPath} references local files in a way raven can't replace with their uploaded URLs; write each as \`![alt](path)\` on one line:`,
        ...unrewritable.map(({ line, target }) => `  line ${line}: ${target}`),
      ].join("\n"),
      ExitCode.Validation,
      { unrewritableReferences: unrewritable }
    );
  }
  const files = await readMediaFiles({
    media,
    directory: input.directory,
    root: input.linkRoot,
    file: input.linkPath,
  });
  return { media, files };
}

/** Lines for a `--dry-run` report of the files that would be uploaded. */
export function formatUploads(files: MediaFile[]): string[] {
  if (files.length === 0) return ["No local files to upload."];
  return [
    "Would upload:",
    ...files.map(
      ({ display, data, lines }) =>
        `  ${display} (${data.byteLength} bytes, ${formatLines(lines)})`
    ),
  ];
}
