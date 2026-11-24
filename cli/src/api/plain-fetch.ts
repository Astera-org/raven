import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

export interface PlainRequestInit {
  method: "GET" | "POST";
  headers: Headers;
  body?: string;
  signal?: AbortSignal;
}

export type PlainFetch = (
  url: string,
  init: PlainRequestInit
) => Promise<Response>;

/**
 * A minimal fetch over `node:http(s)`, used for BetterAuth's `/api/auth2`
 * endpoints. Node's built-in fetch always adds `Sec-Fetch-Mode: cors`, which
 * makes BetterAuth's CSRF check on `/sign-in/email` treat the CLI as a
 * browser and reject it for having no `Origin` header.
 */
export const plainFetch: PlainFetch = (url, init) =>
  new Promise((resolve, reject) => {
    const target = new URL(url);
    const send = target.protocol === "https:" ? httpsRequest : httpRequest;
    const request = send(
      target,
      {
        method: init.method,
        headers: {
          ...Object.fromEntries(init.headers),
          ...(init.body === undefined
            ? {}
            : { "Content-Length": String(Buffer.byteLength(init.body)) }),
        },
        ...(init.signal === undefined ? {} : { signal: init.signal }),
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("error", reject);
        response.on("end", () => {
          try {
            resolve(toResponse(response.statusCode ?? 500, chunks, response));
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    request.on("error", reject);
    request.end(init.body);
  });

const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

function toResponse(
  status: number,
  chunks: Buffer[],
  incoming: IncomingMessage
): Response {
  const body = NULL_BODY_STATUSES.has(status) ? null : Buffer.concat(chunks);
  return new Response(body, { status, headers: toHeaders(incoming.headers) });
}

function toHeaders(incoming: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) headers.append(name, item);
    }
  }
  return headers;
}
