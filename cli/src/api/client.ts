import { apiError, CliError, networkError } from "#src/errors.js";
import createClient from "openapi-fetch";
import type { paths } from "./v1.js";

export const REQUEST_TIMEOUT_MS = 10_000;
/**
 * File uploads can be large, so they get longer than other requests.
 *
 * @todo Manage uploads so progress can be detected and timeouts can be
 * more rigorously spotted.
 */
export const UPLOAD_TIMEOUT_MS = 300_000;

export type ApiClient = ReturnType<typeof createClient<paths>>;

export interface ApiClientOptions {
  apiUrl: string;
  token: string | undefined;
  fetch: typeof fetch;
  /** Error to raise when the server rejects `token` with a 401. */
  onUnauthorized?: () => CliError;
}

export function v1BaseUrl(apiUrl: string): string {
  return `${apiUrl}/api/v1`;
}

export function createApiClient({
  apiUrl,
  token,
  fetch,
  onUnauthorized,
}: ApiClientOptions): ApiClient {
  const client = createClient<paths>({
    baseUrl: v1BaseUrl(apiUrl),
    fetch: (request) =>
      fetch(
        new Request(request, {
          signal: AbortSignal.timeout(timeoutFor(request)),
        })
      ),
  });

  if (token !== undefined) {
    client.use({
      onRequest({ request }) {
        request.headers.set("Authorization", `Bearer ${token}`);
        return request;
      },
      onResponse({ response }) {
        if (response.status === 401 && onUnauthorized) throw onUnauthorized();
        return response;
      },
    });
  }

  return client;
}

function timeoutFor(request: Request): number {
  const contentType = request.headers.get("Content-Type") ?? "";
  return contentType.startsWith("multipart/form-data")
    ? UPLOAD_TIMEOUT_MS
    : REQUEST_TIMEOUT_MS;
}

interface ApiResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/**
 * Awaits an openapi-fetch call and returns its data, turning network
 * failures and non-2xx responses into `CliError`s with the matching exit code.
 */
export async function unwrap<T>(
  apiUrl: string,
  call: () => Promise<ApiResult<T>>
): Promise<T> {
  return (await unwrapResponse(apiUrl, call)).data;
}

/** `unwrap`, also returning the response, e.g. for its headers. */
export async function unwrapResponse<T>(
  apiUrl: string,
  call: () => Promise<ApiResult<T>>
): Promise<{ data: T; response: Response }> {
  let result: ApiResult<T>;
  try {
    result = await call();
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw networkError(apiUrl, error);
  }

  const { data, error, response } = result;
  if (!response.ok || data === undefined) {
    throw apiError(response.status, error);
  }
  return { data, response };
}
