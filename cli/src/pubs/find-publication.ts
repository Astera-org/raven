import { type ApiClient, unwrap } from "#src/api/client.js";
import { CliError, ExitCode } from "#src/errors.js";
import { LinkFile, type PublicationLink } from "./link-file.js";
import { type PublicationInput, readPublicationInput } from "./read-input.js";

export interface PublicationRef {
  id: string;
  slug: string;
}

/** The publication with `slug`; its latest version may be a draft. */
export async function findPublicationBySlug(
  api: ApiClient,
  apiUrl: string,
  slug: string
): Promise<PublicationRef> {
  const data = await unwrap(apiUrl, () =>
    api.GET("/publications/p/{slug}", {
      params: { path: { slug } },
      headers: { Accept: "application/json" },
    })
  );
  // The route can also answer in Markdown; this request asks for JSON.
  if (typeof data === "string") {
    throw new CliError(
      `unexpected Markdown response for publication ${slug}`,
      ExitCode.Server
    );
  }
  return { id: data.publication.id, slug: data.publication.slug };
}

/** A source file's entry in its link file, for the profile's server. */
export interface LinkedSource {
  input: PublicationInput;
  links: LinkFile;
  linkPath: string;
  link: PublicationLink | undefined;
}

export async function readLinkedSource(
  path: string,
  apiUrl: string,
  { page }: { page?: string }
): Promise<LinkedSource> {
  const input = await readPublicationInput(path, { page });
  const links = await LinkFile.read(input.linkRoot);
  return {
    input,
    links,
    linkPath: input.linkPath,
    link: links.get(apiUrl, input.linkPath),
  };
}

/**
 * The publication named by `--slug`, or else the one `path` is linked to.
 * `source` is the path's link entry, when a path was given.
 */
export async function resolvePublication(
  api: ApiClient,
  apiUrl: string,
  {
    path,
    slug,
    page,
  }: { path: string | undefined; slug: string | undefined; page?: string }
): Promise<{ publication: PublicationRef; source?: LinkedSource }> {
  if (path === undefined && slug === undefined) {
    throw new CliError("pass a linked file, or --slug <slug>", ExitCode.Usage);
  }
  const source =
    path === undefined
      ? undefined
      : await readLinkedSource(path, apiUrl, { page });
  if (slug !== undefined) {
    return {
      publication: await findPublicationBySlug(api, apiUrl, slug),
      source,
    };
  }
  const link = source?.link;
  if (source === undefined || link === undefined) {
    throw new CliError(
      `${source?.linkPath ?? path} isn't linked to a publication on ${apiUrl}; run \`raven pubs create\`, or pass --slug`,
      ExitCode.Usage
    );
  }
  return { publication: { id: link.id, slug: link.slug }, source };
}
