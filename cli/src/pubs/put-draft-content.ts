import { type ApiClient, unwrapResponse } from "#src/api/client.js";

/** `PUT /publications/id/{id}/draft/content`, guarded by `ifMatch` if given. */
export function putDraftContent(
  api: ApiClient,
  apiUrl: string,
  {
    id,
    filename,
    source,
    ifMatch,
  }: { id: string; filename: string; source: string; ifMatch?: string }
) {
  return unwrapResponse(apiUrl, () =>
    api.PUT("/publications/id/{id}/draft/content", {
      params: {
        path: { id },
        query: { filename },
        header: ifMatch === undefined ? {} : { "if-match": ifMatch },
      },
      body: source,
      bodySerializer: (body) => body,
      headers: { "Content-Type": "text/markdown" },
    })
  );
}
