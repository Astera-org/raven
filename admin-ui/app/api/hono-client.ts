import type { AppType } from "@raven/backend-ts";
import { hc } from "hono/client";

declare const __API_BACKEND_URL__: string;

const isSSR = typeof window === "undefined";
const API_BASE_URL = isSSR ? `${__API_BACKEND_URL__}` : "/";

export const honoBaseApi = hc<AppType>(API_BASE_URL, {
  init: { credentials: "include" },
});

export const apiV1 = honoBaseApi.api.v1;
