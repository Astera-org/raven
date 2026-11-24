import { type ApiClient, unwrapResponse } from "#src/api/client.js";
import type { CommandSpec } from "#src/commands/command-spec.js";
import { positiveInteger } from "#src/commands/option-parsers.js";
import { createContext, readGlobalOptions } from "#src/context.js";
import { CliError, ExitCode } from "#src/errors.js";
import type { Output } from "#src/output.js";
import { readBibliographyFiles } from "#src/pubs/bibliography-files.js";
import {
  type LinkedSource,
  type PublicationRef,
  resolvePublication,
} from "#src/pubs/find-publication.js";
import { splitFrontmatter } from "#src/pubs/frontmatter.js";
import type { PublicationInput } from "#src/pubs/read-input.js";
import { Option } from "@commander-js/extra-typings";

const MYST_MEDIA_TYPE = "text/markdown; variant=myst";

type Format = "md" | "json";

export const pubsGetCommand: CommandSpec = {
  name: "get",
  group: "pubs",
  authLevel: "optional",
  routes: [
    { method: "get", path: "/publications/p/{slug}" },
    { method: "get", path: "/publications/p/{slug}/versions/{versionNumber}" },
    { method: "get", path: "/publications/id/{id}" },
    { method: "get", path: "/publications/id/{id}/versions/{versionNumber}" },
    {
      method: "get",
      path: "/publications/id/{id}/draft",
      loginOption: "--draft",
    },
    {
      method: "get",
      path: "/publications/id/{id}/draft/content",
      loginOption: "--draft",
    },
    {
      method: "get",
      path: "/publications/id/{id}/draft/bibliography",
      loginOption: "--draft",
    },
  ],
  register(parent, runtime) {
    parent
      .command("get")
      .description("Print a publication, or its draft, as Markdown or JSON")
      .argument("[path]", "A linked .md file or MyST project directory")
      .option("--slug <slug>", "Get this publication instead")
      .option(
        "--page <file>",
        "The article to use in a project with several pages"
      )
      .addOption(
        new Option(
          "--version-number <n>",
          "Get this published version"
        ).argParser(positiveInteger)
      )
      .option("--draft", "Get the draft's MyST source (needs a login)")
      .option(
        "--rebuild",
        "With --draft, get the draft's current fields rendered as MyST"
      )
      .option(
        "--bibliography [filename]",
        "With --draft, list the draft's BibTeX files, or print one of them"
      )
      .addOption(
        new Option(
          "--format <format>",
          "md, or json for the API's object (default: md, or json with --json)"
        ).choices(["md", "json"] as const)
      )
      .addHelpText(
        "after",
        [
          "",
          "Without --draft, prints the latest published version (or the one",
          "--version-number names) as Markdown meant for reading, not for",
          "pushing back. An editor of a publication that was never published",
          "gets its draft instead, with a warning.",
          "",
          "--draft prints the MyST source last pushed. If the draft was edited on",
          "the server since then, the source no longer matches it: --rebuild",
          "prints the draft as MyST instead, which also works for publications",
          "made in the web editor. Either way, the draft's ETag is recorded for",
          "the linked file, so the next push replaces the draft without a",
          "conflict: merge the output into your file before pushing. The",
          "ETag covers the bibliography too, so the files that differ from",
          "the local ones are named; get them with --bibliography to merge.",
          "",
          "--bibliography lists the BibTeX files stored with the draft; with a",
          "filename it prints that file, to redirect into a local copy. The",
          "document is not printed then, so the two never mix.",
          "",
          "Examples:",
          "  raven pubs get paper.md",
          "  raven pubs get --slug corvid-cognition --version-number 2",
          "  raven pubs get paper.md --draft --rebuild > server.md",
          "  raven pubs get paper.md --draft --format json",
          "  raven pubs get paper.md --draft --bibliography",
          "  raven pubs get paper.md --draft --bibliography refs.bib > refs.bib",
        ].join("\n")
      )
      .action(async (pathArgument, parsedOptions, command) => {
        const { path, options } = claimPathFromBibliography(
          pathArgument,
          parsedOptions
        );
        const { json } = readGlobalOptions(command);
        const format: Format = options.format ?? (json ? "json" : "md");
        checkOptions(options, format, json);

        const { output, profile, api } = await createContext(
          command,
          options.draft ? "required" : "optional",
          runtime
        );

        if (!options.draft) {
          // A slug is read directly; a linked file is read by its stable id.
          const target =
            options.slug === undefined
              ? {
                  id: (
                    await resolvePublication(api, profile.apiUrl, {
                      path,
                      slug: undefined,
                      page: options.page,
                    })
                  ).publication.id,
                }
              : { slug: options.slug };
          const { data } = await readPublished(
            api,
            profile.apiUrl,
            target,
            options.versionNumber,
            format
          );
          warnIfDraft(output, data, format);
          writeContent(output, data, format);
          return;
        }

        const { publication, source } = await resolvePublication(
          api,
          profile.apiUrl,
          { path, slug: options.slug, page: options.page }
        );

        if (options.bibliography !== undefined) {
          const { files } = await readBibliography(
            api,
            profile.apiUrl,
            publication
          );
          writeBibliography(
            output,
            { files, slug: publication.slug },
            options.bibliography,
            format
          );
          return;
        }

        const { data, response } = await readDraft(
          api,
          profile.apiUrl,
          publication,
          { rebuild: options.rebuild === true, format }
        );
        writeContent(output, data, format);

        const etag = response.headers.get("ETag");
        if (format === "md" && etag !== null && source !== undefined) {
          await recordEtag(output, api, profile.apiUrl, {
            source,
            publication,
            etag,
          });
        }
      });
  },
};

/**
 * Commander gives `--bibliography`'s optional value the next argument, so in
 * `get --draft --bibliography paper.md` the path lands in the option. With
 * no path and no `--slug` there is no publication to read, so the value can
 * only be the path, and the files are listed.
 */
function claimPathFromBibliography<
  Options extends { slug?: string; bibliography?: true | string },
>(
  path: string | undefined,
  options: Options
): { path: string | undefined; options: Options } {
  if (
    path !== undefined ||
    options.slug !== undefined ||
    typeof options.bibliography !== "string"
  ) {
    return { path, options };
  }
  return {
    path: options.bibliography,
    options: { ...options, bibliography: true },
  };
}

function checkOptions(
  options: {
    draft?: true;
    rebuild?: true;
    bibliography?: true | string;
    versionNumber?: number;
  },
  format: Format,
  json: boolean
): void {
  if (json && format === "md") {
    throw usageError("--format md prints Markdown; leave out --json");
  }
  if (options.rebuild && !options.draft) {
    throw usageError("--rebuild only applies with --draft");
  }
  if (options.bibliography !== undefined && !options.draft) {
    throw usageError(
      "--bibliography only applies with --draft: a published version exposes only the entries it cites"
    );
  }
  if (options.rebuild && options.bibliography !== undefined) {
    throw usageError(
      "--bibliography prints the draft's BibTeX files, not its document; leave out --rebuild"
    );
  }
  if (options.rebuild && format === "json") {
    throw usageError(
      "--rebuild prints MyST; with --format json, --draft prints the draft's fields"
    );
  }
  if (options.versionNumber !== undefined && options.draft) {
    throw usageError("--version-number and --draft can't be combined");
  }
}

async function readPublished(
  api: ApiClient,
  apiUrl: string,
  target: { id: string } | { slug: string },
  version: number | undefined,
  format: Format
): Promise<{ data: string }> {
  const request = {
    headers: { Accept: format === "md" ? "text/markdown" : "application/json" },
    parseAs: "text",
  } as const;
  const versionNumber = version === undefined ? undefined : `v${version}`;

  if ("slug" in target) {
    const { slug } = target;
    return unwrapResponse(apiUrl, () =>
      versionNumber === undefined
        ? api.GET("/publications/p/{slug}", {
            params: { path: { slug } },
            ...request,
          })
        : api.GET("/publications/p/{slug}/versions/{versionNumber}", {
            params: { path: { slug, versionNumber } },
            ...request,
          })
    );
  }
  const { id } = target;
  return unwrapResponse(apiUrl, () =>
    versionNumber === undefined
      ? api.GET("/publications/id/{id}", {
          params: { path: { id } },
          ...request,
        })
      : api.GET("/publications/id/{id}/versions/{versionNumber}", {
          params: { path: { id, versionNumber } },
          ...request,
        })
  );
}

async function readDraft(
  api: ApiClient,
  apiUrl: string,
  publication: PublicationRef,
  { rebuild, format }: { rebuild: boolean; format: Format }
): Promise<{ data: string; response: Response }> {
  const params = { path: { id: publication.id } };
  if (format === "json" || rebuild) {
    return unwrapResponse(apiUrl, () =>
      api.GET("/publications/id/{id}/draft", {
        params,
        headers: {
          Accept: format === "json" ? "application/json" : MYST_MEDIA_TYPE,
        },
        parseAs: "text",
      })
    );
  }
  return unwrapResponse(apiUrl, () =>
    api.GET("/publications/id/{id}/draft/content", { params, parseAs: "text" })
  ).catch((error: unknown) => {
    throw explainMissingSource(error, publication.slug);
  });
}

interface BibliographyFile {
  filename: string;
  content: string;
}

function readBibliography(
  api: ApiClient,
  apiUrl: string,
  publication: PublicationRef
): Promise<{ files: BibliographyFile[] }> {
  return unwrapResponse(apiUrl, () =>
    api.GET("/publications/id/{id}/draft/bibliography", {
      params: { path: { id: publication.id } },
    })
  ).then(({ data }) => data);
}

/**
 * The draft's BibTeX: the stored names, or one file's contents to redirect
 * into a local copy. The document isn't printed with it, so a redirect never
 * mixes the two, and nothing but the list or the file reaches stdout. With
 * `--format json`, both forms print the route's `{ files }` shape, narrowed
 * to the named file.
 */
function writeBibliography(
  output: Output,
  { files, slug }: { files: BibliographyFile[]; slug: string },
  wanted: true | string,
  format: Format
): void {
  const selected = wanted === true ? files : [findFile(files, wanted, slug)];
  if (format === "json") {
    output.text(`${JSON.stringify({ files: selected }, null, 2)}\n`);
    return;
  }
  if (wanted !== true) {
    output.text(selected[0]?.content ?? "");
    return;
  }
  if (files.length === 0) {
    output.warn(`the draft of ${slug} has no bibliography`);
    return;
  }
  output.text(`${files.map(({ filename }) => filename).join("\n")}\n`);
}

function findFile(
  files: BibliographyFile[],
  wanted: string,
  slug: string
): BibliographyFile {
  const file = files.find(({ filename }) => filename === wanted);
  if (file) return file;
  throw new CliError(
    [
      `the draft of ${slug} has no bibliography file called ${wanted}`,
      ...(files.length === 0
        ? ["It has no bibliography at all."]
        : ["It has:", ...files.map(({ filename }) => `  ${filename}`)]),
    ].join("\n"),
    ExitCode.NotFound
  );
}

/** Points to `--rebuild` when the stored source does not describe the draft. */
function explainMissingSource(error: unknown, slug: string): unknown {
  if (!(error instanceof CliError)) return error;
  const { status, body } = (error.details ?? {}) as {
    status?: number;
    body?: { errors?: { draft?: { message?: unknown } } };
  };
  if (status === 409) {
    return new CliError(
      `the draft of ${slug} was edited on the server since its MyST source was last pushed, so the source no longer matches it; get the draft rendered as MyST with --draft --rebuild`,
      ExitCode.Conflict,
      error.details
    );
  }
  if (
    status === 404 &&
    body?.errors?.draft?.message === "The draft has no MyST source"
  ) {
    return new CliError(
      `the draft of ${slug} has no MyST source (it was made in the web editor or from a Google Doc); get it rendered as MyST with --draft --rebuild`,
      ExitCode.NotFound,
      error.details
    );
  }
  return error;
}

/** Editors can read a version before it's published, so say when it is one. */
function warnIfDraft(output: Output, content: string, format: Format): void {
  const { isDraft, versionNumber } =
    format === "json" ? readJsonState(content) : readMarkdownState(content);
  if (!isDraft) return;
  output.warn(
    `version ${versionNumber ?? "?"} is a draft, not a published version; only its editors can read it`
  );
}

interface VersionState {
  isDraft: boolean;
  versionNumber: unknown;
}

function readJsonState(content: string): VersionState {
  const { publication } = JSON.parse(content) as {
    publication?: { versionState?: unknown; versionNumber?: unknown };
  };
  return {
    isDraft: publication?.versionState === "DRAFT",
    versionNumber: publication?.versionNumber,
  };
}

function readMarkdownState(content: string): VersionState {
  const { frontmatter } = splitFrontmatter(content, "the server's response");
  return {
    isDraft: frontmatter?.state === "draft",
    versionNumber: frontmatter?.version,
  };
}

function writeContent(output: Output, content: string, format: Format): void {
  output.text(
    format === "json"
      ? `${JSON.stringify(JSON.parse(content), null, 2)}\n`
      : content
  );
}

/**
 * Stores the ETag of the draft just printed, so pushing a file merged with it
 * passes the overwrite guard. That ETag covers the draft's bibliography too,
 * which wasn't printed, so the files that differ from the local ones are
 * named: the next push replaces them as well.
 */
async function recordEtag(
  output: Output,
  api: ApiClient,
  apiUrl: string,
  {
    source: { input, links, linkPath, link },
    publication,
    etag,
  }: { source: LinkedSource; publication: PublicationRef; etag: string }
): Promise<void> {
  if (link?.id !== publication.id || link.etag === etag) return;
  await links.set(apiUrl, linkPath, { ...link, etag });
  output.warn(
    `the draft of ${publication.slug} differs from ${linkPath}'s last push; the next push replaces it, so merge these changes into ${linkPath} first`
  );

  const differences = await bibliographyDifferences(
    api,
    apiUrl,
    input,
    publication
  ).catch((error: unknown) => {
    output.warn(
      `couldn't compare the draft's bibliography with the local files (${errorMessage(error)}); the next push replaces it, so check it with \`raven pubs get <path> --draft --bibliography\` first`
    );
    return [];
  });
  if (differences.length === 0) return;
  output.warn(
    [
      "the draft's bibliography differs from the local files, and the next push replaces it with them:",
      ...differences,
      "To keep the server's changes, get each file with `raven pubs get <path> --draft --bibliography <filename>` and merge it first.",
    ].join("\n")
  );
}

/** The draft's BibTeX files that a push of `input` would add, change or remove. */
async function bibliographyDifferences(
  api: ApiClient,
  apiUrl: string,
  input: PublicationInput,
  publication: PublicationRef
): Promise<string[]> {
  const [{ files: stored }, local] = await Promise.all([
    readBibliography(api, apiUrl, publication),
    readBibliographyFiles(input),
  ]);
  const localContent = new Map(
    local.map(({ filename, content }) => [filename, content])
  );
  const storedNames = new Set(stored.map(({ filename }) => filename));
  return [
    ...stored.flatMap(({ filename, content }) => {
      const mine = localContent.get(filename);
      if (mine === undefined) return [`  ${filename} (only on the server)`];
      return mine === content ? [] : [`  ${filename} (changed)`];
    }),
    ...local
      .filter(({ filename }) => !storedNames.has(filename))
      .map(({ filename }) => `  ${filename} (only local)`),
  ];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function usageError(message: string): CliError {
  return new CliError(message, ExitCode.Usage);
}
