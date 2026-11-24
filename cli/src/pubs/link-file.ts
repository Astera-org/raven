import { CliError, ExitCode } from "#src/errors.js";
import { isMissingFile } from "#src/fs-errors.js";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

export const LINK_DIRECTORY = ".raven";
export const LINK_FILE = "publications.json";

const LinkSchema = z.object({
  /** Addresses writes. */
  id: z.string().min(1),
  /** For display and reads; goes stale if the slug changes on the server. */
  slug: z.string().min(1),
  /** The draft's ETag after this client's last write, for `If-Match`. */
  etag: z.string().min(1),
});

const LinkFileSchema = z.object({
  version: z.literal(1),
  /** Server URL, then source path relative to the link file's root. */
  servers: z.record(z.string(), z.record(z.string(), LinkSchema)),
});

export type PublicationLink = z.infer<typeof LinkSchema>;
type LinkFileContent = z.infer<typeof LinkFileSchema>;

/**
 * `.raven/publications.json` next to a source file or in a MyST project's
 * root: which publication each source is linked to, per server. Keyed by
 * server URL rather than profile, so profiles that share a server share links.
 */
export class LinkFile {
  private constructor(
    readonly path: string,
    private content: LinkFileContent
  ) {}

  static async read(root: string): Promise<LinkFile> {
    const path = join(root, LINK_DIRECTORY, LINK_FILE);
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch (error) {
      if (isMissingFile(error)) return new LinkFile(path, emptyContent());
      throw error;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      throw invalidLinkFile(path, (error as Error).message);
    }
    const result = LinkFileSchema.safeParse(raw);
    if (!result.success) {
      throw invalidLinkFile(path, z.prettifyError(result.error));
    }
    return new LinkFile(path, result.data);
  }

  get(server: string, sourcePath: string): PublicationLink | undefined {
    return this.content.servers[server]?.[sourcePath];
  }

  async set(
    server: string,
    sourcePath: string,
    link: PublicationLink
  ): Promise<void> {
    const links = this.content.servers[server] ?? {};
    this.content = {
      ...this.content,
      servers: {
        ...this.content.servers,
        [server]: { ...links, [sourcePath]: link },
      },
    };
    await this.write();
  }

  private async write(): Promise<void> {
    await mkdir(join(this.path, ".."), { recursive: true });
    const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.content, null, 2)}\n`);
    await rename(temporary, this.path);
  }
}

function emptyContent(): LinkFileContent {
  return { version: 1, servers: {} };
}

function invalidLinkFile(path: string, reason: string): CliError {
  return new CliError(`invalid link file ${path}: ${reason}`, ExitCode.General);
}
