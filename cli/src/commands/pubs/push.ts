import type { ApiClient } from "#src/api/client.js";
import type { CommandSpec } from "#src/commands/command-spec.js";
import { resolveProfile } from "#src/config/profiles.js";
import { createContext, createLocalContext } from "#src/context.js";
import { CliError, ExitCode } from "#src/errors.js";
import { formatFields } from "#src/output.js";
import {
  bibliographyPlan,
  formatBibliography,
  readBibliographyFiles,
} from "#src/pubs/bibliography-files.js";
import { displayPath } from "#src/pubs/display-path.js";
import { editLinkLines } from "#src/pubs/edit-link.js";
import { findPublicationBySlug } from "#src/pubs/find-publication.js";
import { LinkFile, type PublicationLink } from "#src/pubs/link-file.js";
import {
  formatUploads,
  readLocalMediaFiles,
} from "#src/pubs/local-media-files.js";
import { rewriteMedia } from "#src/pubs/local-media/index.js";
import { putDraftBibliography } from "#src/pubs/put-draft-bibliography.js";
import { putDraftContent } from "#src/pubs/put-draft-content.js";
import { readPublicationInput } from "#src/pubs/read-input.js";
import { uploadMediaFiles } from "#src/pubs/upload-media.js";
import {
  formatIssue,
  formatValidationErrors,
  type ValidationIssue,
  warningIssues,
} from "#src/pubs/validation-errors.js";

export const pubsPushCommand: CommandSpec = {
  name: "push",
  group: "pubs",
  authLevel: "required",
  routes: [
    { method: "get", path: "/publications/p/{slug}" },
    { method: "post", path: "/publications/id/{id}/draft/media-assets" },
    { method: "put", path: "/publications/id/{id}/draft/bibliography" },
    { method: "put", path: "/publications/id/{id}/draft/content" },
  ],
  register(parent, runtime) {
    parent
      .command("push")
      .description("Replace a publication's draft with a MyST document")
      .argument("<path>", "A .md file, or a MyST project directory (myst.yml)")
      .option(
        "--slug <slug>",
        "Push to this publication instead of the linked one, and link it"
      )
      .option(
        "--page <file>",
        "The article to use in a project with several pages"
      )
      .option(
        "--force",
        "Replace the draft even if it changed on the server since the last push"
      )
      .option("--dry-run", "Check the document without sending it")
      .addHelpText(
        "after",
        [
          "",
          "Pushes to the publication the document is linked to (see",
          "`raven pubs create`), opening a new draft if the last one was",
          "published. If the draft was edited on the server since this file's",
          "last push, nothing is changed: merge the server's edits with",
          "`raven pubs get --draft --rebuild`, or overwrite them with --force.",
          "",
          "Local images are uploaded first and their paths replaced with the",
          "uploaded URLs in what is sent; the file itself isn't changed.",
          "",
          "Examples:",
          "  raven pubs push paper.md",
          "  raven pubs push . --page paper.md",
          "  raven pubs push paper.md --slug corvid-cognition --force",
        ].join("\n")
      )
      .action(async (path, options, command) => {
        const input = await readPublicationInput(path, { page: options.page });
        const local = await readLocalMediaFiles(input);
        const bibliography = await readBibliographyFiles(input);
        const links = await LinkFile.read(input.linkRoot);

        if (options.dryRun) {
          const { options: global, output } = createLocalContext(
            command,
            runtime
          );
          const profile = await resolveProfile(global, runtime);
          input.warnings.forEach((warning) => output.warn(warning));
          const link = links.get(profile.apiUrl, input.linkPath);
          const plan = {
            dryRun: true,
            file: input.linkPath,
            bytes: Buffer.byteLength(input.source),
            publication: options.slug ?? link?.slug ?? null,
            ifMatch: options.force ? null : (link?.etag ?? null),
            uploads: local.files.map(({ display, data, lines }) => ({
              file: display,
              bytes: data.byteLength,
              lines,
            })),
            bibliography: bibliographyPlan(bibliography),
          };
          output.data(plan, () =>
            [
              `Would push ${input.linkPath}.`,
              formatFields([
                ["Size", `${plan.bytes} bytes`],
                ["Publication", plan.publication ?? "not linked"],
                [
                  "Overwrite",
                  options.force
                    ? "yes (--force)"
                    : "only if unchanged since the last push",
                ],
              ]),
              ...formatUploads(local.files),
              ...formatBibliography(bibliography),
            ].join("\n")
          );
          return;
        }

        const { output, profile, api } = await createContext(
          command,
          pubsPushCommand.authLevel,
          runtime
        );
        input.warnings.forEach((warning) => output.warn(warning));
        const link = links.get(profile.apiUrl, input.linkPath);
        const target = options.slug
          ? await findBySlug(api, profile.apiUrl, options.slug, link)
          : link;
        if (target === undefined) {
          throw new CliError(
            `${input.linkPath} isn't linked to a publication on ${profile.apiUrl}; run \`raven pubs create\`, or pass --slug`,
            ExitCode.Usage
          );
        }
        if (!options.force && target.etag === undefined) {
          throw new CliError(
            `${input.linkPath} hasn't been pushed to ${target.slug} before, so its draft would be replaced without checking for edits; pass --force to do that`,
            ExitCode.Usage
          );
        }

        const uploaded = await uploadMediaFiles({
          api,
          apiUrl: profile.apiUrl,
          publicationId: target.id,
          files: local.files,
          output,
        });
        // Always sent, empty list included, so a push is what's on disk. It
        // is part of the draft's ETag, so the content write that follows
        // sends the ETag this returned.
        const stored = await putDraftBibliography(api, profile.apiUrl, {
          id: target.id,
          slug: target.slug,
          files: bibliography,
          ifMatch: options.force ? undefined : target.etag,
        }).catch((error: unknown) => {
          throw explainConflict(error, target.slug);
        });
        stored.warnings.forEach(({ message }) => output.warn(message));
        const { data, response } = await putDraftContent(api, profile.apiUrl, {
          id: target.id,
          filename: input.filename,
          source: rewriteMedia(input.source, local.media, uploaded.urls),
          ifMatch: options.force ? undefined : stored.etag,
        }).catch(async (error: unknown) => {
          // The draft is now the previous document with the new
          // bibliography. Keeping that state's ETag lets pushing again
          // finish the push instead of reporting a conflict.
          const linkError = await links
            .set(profile.apiUrl, input.linkPath, {
              id: target.id,
              slug: target.slug,
              etag: stored.etag,
            })
            .then(
              () => undefined,
              (reason: unknown) => reason
            );
          throw explainPartialPush(error, target.slug, {
            linkFile: displayPath(links.path),
            linkError,
          });
        });

        const etag = response.headers.get("ETag");
        if (!etag) {
          throw new CliError(
            `the server updated ${data.slug} but sent no ETag; push again with --force`,
            ExitCode.Server
          );
        }
        await links.set(profile.apiUrl, input.linkPath, {
          id: data.publicationId,
          slug: data.slug,
          etag,
        });

        warningIssues(data.validationErrors).forEach((issue) =>
          output.warn(formatIssue(issue))
        );
        const validationErrors = data.validationErrors.map(noteIssue);
        const newDraft =
          uploaded.draftCreated ||
          stored.draftCreated ||
          response.status === 201;
        const linkFile = displayPath(links.path);
        output.data(
          {
            ...data,
            validationErrors,
            etag,
            newDraft,
            linkFile,
            uploads: uploaded.uploads,
            bibliography: bibliographyPlan(bibliography),
          },
          () =>
            [
              `Pushed ${input.linkPath} to ${data.slug}${newDraft ? ", in a new draft" : ""}.`,
              formatValidationErrors(validationErrors),
              ...editLinkLines(data.links),
            ].join("\n")
        );
      });
  },
};

type PushTarget = Omit<PublicationLink, "etag"> & { etag?: string };

/** The publication with `slug`, keeping the link's ETag if it's the same one. */
async function findBySlug(
  api: ApiClient,
  apiUrl: string,
  slug: string,
  link: PublicationLink | undefined
): Promise<PushTarget> {
  const publication = await findPublicationBySlug(api, apiUrl, slug);
  return {
    ...publication,
    etag: link && link.id === publication.id ? link.etag : undefined,
  };
}

/** The version description the server asks for is `publish --note`. */
function noteIssue(issue: ValidationIssue): ValidationIssue {
  if (issue.path[0] !== "versionDesc") return issue;
  return {
    ...issue,
    path: ["note"],
    message:
      "pass --note to `raven pubs publish` to describe what changed in this version",
  };
}

const CONFLICT_ADVICE = [
  "To keep those edits, get the current draft and merge it into your file:",
  "  raven pubs get <path> --draft --rebuild",
  "To overwrite them, push again with --force.",
];

function isEtagConflict(error: unknown): error is CliError {
  return (
    error instanceof CliError &&
    error.exitCode === ExitCode.Conflict &&
    (error.details as { status?: number } | undefined)?.status === 412
  );
}

function explainConflict(error: unknown, slug: string): unknown {
  if (!isEtagConflict(error)) return error;
  return new CliError(
    [
      `the draft of ${slug} was edited on the server since this file's last push, so nothing was changed.`,
      ...CONFLICT_ADVICE,
    ].join("\n"),
    ExitCode.Conflict,
    error.details
  );
}

/**
 * A content write that failed after the bibliography write succeeded. If
 * saving the bibliography write's ETag failed too, the link still has the one
 * from before it, so pushing again would report the push's own write as a
 * conflict. A conflict already needs `get --rebuild` or `--force`, so that
 * only matters for other failures.
 */
function explainPartialPush(
  error: unknown,
  slug: string,
  { linkFile, linkError }: { linkFile: string; linkError: unknown }
): unknown {
  const unsaved =
    linkError === undefined
      ? []
      : [
          `Saving the draft's new ETag to ${linkFile} also failed (${errorMessage(linkError)}), so the next push will report a conflict: push again with --force to finish.`,
        ];
  if (isEtagConflict(error)) {
    return new CliError(
      [
        `the draft of ${slug} was edited on the server after this push stored its bibliography, so its document wasn't replaced.`,
        ...CONFLICT_ADVICE,
      ].join("\n"),
      ExitCode.Conflict,
      error.details
    );
  }
  if (!(error instanceof CliError)) return error;
  return new CliError(
    [
      error.message,
      `The bibliography of ${slug} was stored, but its document wasn't; push again to finish.`,
      ...unsaved,
    ].join("\n"),
    error.exitCode,
    error.details
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
