import { type ApiClient, unwrapResponse } from "#src/api/client.js";
import { CliError, ExitCode } from "#src/errors.js";
import type { BibliographyFile } from "./bibliography-files.js";
import { type ValidationIssue, warningIssues } from "./validation-errors.js";

/**
 * `PUT /publications/id/{id}/draft/bibliography`, guarded by `ifMatch` if
 * given. Returns the ETag the content write that follows must send, whether
 * this write opened the draft (the server answers 201 when it does), and the
 * warnings about the files themselves: one that doesn't parse, or a key
 * defined twice. The content write reports the rest, about citations, again
 * for the new document.
 */
export async function putDraftBibliography(
  api: ApiClient,
  apiUrl: string,
  {
    id,
    slug,
    files,
    ifMatch,
  }: {
    id: string;
    slug: string;
    files: BibliographyFile[];
    ifMatch?: string;
  }
): Promise<{
  etag: string;
  draftCreated: boolean;
  warnings: ValidationIssue[];
}> {
  const { data, response } = await unwrapResponse(apiUrl, () =>
    api.PUT("/publications/id/{id}/draft/bibliography", {
      params: {
        path: { id },
        header: ifMatch === undefined ? {} : { "if-match": ifMatch },
      },
      body: {
        files: files.map(({ filename, content }) => ({ filename, content })),
      },
    })
  );
  const etag = response.headers.get("ETag");
  if (!etag) {
    throw new CliError(
      `the server stored the bibliography of ${slug} but sent no ETag; push again with --force`,
      ExitCode.Server
    );
  }
  return {
    etag,
    draftCreated: response.status === 201,
    warnings: warningIssues(data.validationErrors).filter(
      ({ path }) => path[0] === "files"
    ),
  };
}
