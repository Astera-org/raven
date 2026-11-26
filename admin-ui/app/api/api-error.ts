// app/lib/api.ts
import type { ClientResponse } from "hono/client";
import type { SuccessStatusCode } from "hono/utils/http-status";
import { type $ZodIssue } from "zod/v4/core";

export type ApiErrorKind =
  "validation" | "http" | "network" | "aborted" | "parse";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  /** 0 when there was no response (network failure, abort) */
  readonly status: number;

  constructor(kind: ApiErrorKind, status = 0, cause?: unknown) {
    super(`API ${kind} error${status ? ` (${status})` : ""}`, { cause });
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }

  get isNotFound() {
    return this.status === 404;
  }
  get isClientError() {
    return this.status >= 400 && this.status < 500;
  }
}

/** 422: the body's `errors` exactly as the API sent it */
export class ApiValidationError extends ApiError {
  declare readonly kind: "validation";
  constructor(readonly issues: $ZodIssue[]) {
    super("validation", 422);
    this.name = "ApiValidationError";
  }
}

/** Any other non-2xx response */
export class ApiHttpError extends ApiError {
  declare readonly kind: "http";
  constructor(
    status: number,
    readonly errors: Record<string, { message: string }>
  ) {
    super("http", status);
    this.name = "ApiHttpError";
  }
}

export type AnyClientResponse = ClientResponse<unknown, number, string>;

/** Extracts the body type of only the 2xx members of a Hono client response union. */
export type OkData<R> =
  R extends ClientResponse<infer T, infer S>
    ? S extends SuccessStatusCode
      ? T
      : never
    : never;

const isAbort = (e: unknown) =>
  e instanceof DOMException &&
  (e.name === "AbortError" || e.name === "TimeoutError");

function isErrorRecord(v: unknown): v is Record<string, { message: string }> {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    Object.values(v).every(
      (x) =>
        typeof x === "object" &&
        x !== null &&
        !Array.isArray(x) &&
        typeof x.message === "string"
    )
  );
}

async function errorFromResponse(res: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = JSON.parse(await res.text());
  } catch (e) {
    if (isAbort(e)) return new ApiError("aborted", res.status, e);
    body = undefined;
  }

  const raw = (body as { errors?: unknown } | undefined)?.errors;

  if (res.status === 422 && Array.isArray(raw)) {
    return new ApiValidationError(raw as $ZodIssue[]);
  }

  return new ApiHttpError(
    res.status,
    isErrorRecord(raw)
      ? raw
      : { _root: { message: res.statusText || `HTTP ${res.status}` } }
  );
}

/** Resolves to the typed 2xx body, or throws ApiError. Never throws anything else. */
export async function unwrap<R extends AnyClientResponse>(
  req: Promise<R>
): Promise<OkData<R>> {
  let res: R;
  try {
    res = await req;
  } catch (e) {
    throw new ApiError(isAbort(e) ? "aborted" : "network", 0, e);
  }

  if (!res.ok) throw await errorFromResponse(res);

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as OkData<R>;
  }

  try {
    return (await res.json()) as OkData<R>;
  } catch (e) {
    throw new ApiError(isAbort(e) ? "aborted" : "parse", res.status, e);
  }
}

export type ApiResult<T> =
  | { ok: true; data: T; error?: undefined }
  | { ok: false; data?: undefined; error: ApiError };

/** Same as unwrap, but returns a result instead of throwing. */
export async function safe<R extends AnyClientResponse>(
  req: Promise<R>
): Promise<ApiResult<OkData<R>>> {
  try {
    return { ok: true, data: await unwrap(req) };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e };
    throw e;
  }
}

/** Resolves to the 2xx body, or to the fallback on any ApiError. */
export async function orDefault<R extends AnyClientResponse, F>(
  req: Promise<R>,
  fallback: F
): Promise<OkData<R> | F> {
  const r = await safe(req);
  return r.ok ? r.data : fallback;
}

export function firstErrorMessage(e: ApiError, fallback: string): string;
export function firstErrorMessage(
  e: ApiError,
  fallback?: string
): string | undefined;
export function firstErrorMessage(
  e: ApiError,
  fallback?: string
): string | undefined {
  if (e instanceof ApiValidationError) return e.issues[0]?.message ?? fallback;
  if (e instanceof ApiHttpError)
    return Object.values(e.errors)[0]?.message ?? fallback;
  return fallback;
}
