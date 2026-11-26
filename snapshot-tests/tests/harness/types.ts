/**
 * Shared types for the snapshot-testing harness.
 *
 * A `TestCase` describes WHAT to send and WHAT to verify; the runner
 * decides HOW.
 */

export type HttpMethod =
  "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

/**
 * Tag used to replace a non-deterministic value in a snapshot. The value in
 * the snapshot becomes the literal string `"<<tag>>"` (e.g. `"<<ulid>>"`).
 *
 *  - `string` | `number` | `boolean` | `null`: coarse JSON-primitive tags,
 *    used when auto-detection finds no more specific match.
 *  - `datetime`: ISO-8601 or RFC 822 timestamp string.
 *  - `ulid`:    26-character ULID string.
 *  - `integer`: JSON number with no fractional part (e.g. row ids).
 *  - `any`:     match any value; preserves only "this key is present".
 */
export type MaskType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "null"
  | "datetime"
  | "ulid"
  | "any";

/**
 * A field to mask in a captured response body. A bare string is shorthand
 * for `{ path, as: undefined }` (auto-detect the tag from the actual value).
 */
export type MaskField = string | { path: string; as?: MaskType };

/**
 * Auth directive on a test case. Resolved by the runner into a concrete
 * `Authorization` header (or cookies) at request time.
 *
 *  - `none`:        unauthenticated.
 *  - `better-auth`: log in via better-auth's POST ./auth2/sign-in/username.
 *                   Only implemented on backend-ts.
 */
export type AuthDirective =
  { kind: "none" } | { kind: "better-auth"; as: string };

export interface MultipartFile {
  filename: string;
  data: Buffer;
  contentType: string;
}

export interface RequestSpec {
  method: HttpMethod;
  /** Path beginning with `./` (e.g. `./users`). Base URL is supplied by target. */
  path: string;
  headers?: Record<string, string>;
  /** JSON-serializable body. If undefined, no body is sent. Ignored when `multipart` is set. */
  body?: unknown;
  /** Query string parameters. Stringified by the runner. */
  query?: Record<string, string | number | boolean | undefined>;
  /**
   * Multipart form-data fields (file uploads). When set, `body` is ignored
   * and the request is sent as `multipart/form-data`. The runner builds a
   * `FormData` from this map; fetch sets the `Content-Type` header with the
   * correct boundary automatically.
   */
  multipart?: Record<string, MultipartFile>;
}

export interface TestCase {
  /** Short, human-readable name. Becomes the snapshot subdirectory name. */
  name: string;
  /**
   * SQL fixture stems (no `.sql`) to load AFTER truncation, IN ORDER.
   * Resolved relative to `tests/fixtures/`.
   */
  fixtures?: string[];
  /** How to authenticate the request, if at all. */
  auth?: AuthDirective;
  request: RequestSpec;
  /**
   * Response fields whose values are non-deterministic and should be replaced
   * with a type-tagged placeholder (e.g. `"<<ulid>>"`) before snapshotting.
   *
   * Masking — not deletion — keeps the field in the snapshot tree, so a
   * regression that stops returning the field (or returns it with the wrong
   * shape) still shows up as a diff.
   *
   * Paths support dot-segments (`user.id`) and array wildcards
   * (`items.*.created_at`). Each entry is either a bare path string (the
   * concrete type is auto-detected per occurrence) or `{ path, as }` to
   * force a specific tag.
   *
   * For arrays, use the `*` wildcard to mask all items (e.g. `items.*.id`),
   * otherwise the array is ignored.
   */
  maskFields?: MaskField[];
  /** Headers (lowercased) to include in the snapshot. Defaults to a small allowlist. */
  captureHeaders?: string[];
  /**
   * Regex substitutions applied to text/XML response bodies before
   * snapshotting. Used to scrub dynamic content (e.g. dates in sitemap XML).
   * Ignored for JSON bodies -- use `maskFields` for those.
   *
   * Patterns must have the global flag set (`/.../g`) since they're applied
   * with `String.prototype.replace`.
   */
  bodyTextReplacements?: { pattern: RegExp; replacement: string }[];
  /**
   * Lightweight assertions checked alongside the snapshot comparison. Useful for catching obviously wrong status
   * codes without having to read snapshot files.
   *
   * - `status`: exact HTTP status code (e.g. `200`, `404`).
   * - `bodyContains`: strings/regexes that must all match the raw response body text.
   */
  assert?: {
    status?: number;
    bodyContains?: (string | RegExp)[];
  };
  /**
   * The case is expected to fail (e.g. it needs infrastructure the harness
   * doesn't have yet). The runner still executes it: a failure marks the
   * test as skipped, while a clean pass FAILS with a message asking you to
   * remove the flag -- so silently fixed behavior never drifts unnoticed.
   */
  knownFailure?: boolean;
  /**
   * Headers to ignore in snapshot comparisons.
   *
   * Header names are treated case-insensitively (the runner normalizes them to
   * lowercase). Ignored headers are omitted from `ResponseSnapshot.headers` so
   * they do not affect diffs.
   */
  ignoreHeaders?: string[];
}

/**
 * The on-disk shape of a captured response snapshot. Stored as JSON under
 * `tests/snapshots/<group>/<case>.json` and managed by Vitest's
 * `toMatchFileSnapshot` (write on `-u`, assert otherwise).
 */
export interface ResponseSnapshot {
  status: number;
  headers: Record<string, string>;
  /**
   * Parsed body if `content-type` was JSON; base64 string if binary (image/*);
   * raw text otherwise. The runner records `bodyKind` so reviewers can tell at
   * a glance and so a future format change is detectable.
   */
  bodyKind: "json" | "text" | "binary" | "empty";
  body: unknown;
}

export interface TargetConfig {
  /** Stable identifier (e.g. "backend"). */
  id: string;
  baseUrl: string;
  /** Database name the target is using. Set by the harness, not the user. */
  dbName: string;
}
