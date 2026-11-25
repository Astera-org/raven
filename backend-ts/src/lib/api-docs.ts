import { Scalar } from "@scalar/hono-api-reference";
import type { Env, MiddlewareHandler } from "hono";

// Pinned because the script runs on the API origin, where session cookies
// apply: an unpinned URL would run whatever Scalar publishes next.
const SCALAR_CDN = "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.78.1";

export function apiDocs<E extends Env>(options: {
  url: string;
  pageTitle: string;
}): MiddlewareHandler<E> {
  return Scalar<E>({
    ...options,
    cdn: SCALAR_CDN,
    showDeveloperTools: "never",
  });
}
