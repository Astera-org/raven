/**
 * The runner: takes a `TestCase`, executes it against backend-ts, and
 * asserts the response matches an on-disk JSON snapshot via Vitest's
 * `toMatchFileSnapshot`. `vitest run` asserts, `vitest run -u` writes/updates.
 */

import { resolve } from "node:path";
import { beforeAll, expect, inject, test } from "vitest";
import { clearTokenCache, loginAsBetterAuth } from "./auth.ts";
import { connectDatabase, resetDatabase } from "./db.ts";
import { env } from "./env.ts";
import { closePools, TARGET_ID, type WorkerHarness } from "./harness.ts";
import type {
  MaskField,
  MaskType,
  ResponseSnapshot,
  TargetConfig,
  TestCase,
} from "./types.ts";

/**
 * Public DSL: declare a test case. Test files at `tests/cases/<group>/...`
 * import this and call it; the runner takes care of registering the case
 * with Vitest.
 *
 * `knownFailure: true` still executes the case, but a thrown assertion
 * marks the test as skipped while a clean pass FAILS with a message asking
 * you to remove the flag -- so unskipping happens by deletion, never by
 * neglect.
 */
export function defineCase(
  group: string,
  testCase: TestCase,
  harnessRef: { harness: WorkerHarness },
  opts: DispatchOpts = {}
): void {
  if (testCase.knownFailure) {
    test(testCase.name, async (ctx) => {
      try {
        await runSnapshot(harnessRef.harness, group, testCase, opts);
      } catch {
        ctx.skip();
        return;
      }
      throw new Error(
        `Case "${testCase.name}" is marked \`knownFailure: true\` but now ` +
          `passes. Something changed -- remove the flag to lock in the new ` +
          `behavior.`
      );
    });
    return;
  }
  test(testCase.name, async () => {
    await runSnapshot(harnessRef.harness, group, testCase, opts);
  });
}

/**
 * Declare a batch of read-only cases that all want the same fixture stack.
 * The fixtures are loaded once in `beforeAll` instead of before every case,
 * which is only safe because none of the cases in the batch write to the
 * database -- a case that mutates state belongs in a plain `defineCase`
 * (or its own group) so it gets a fresh reset.
 */
export function defineCaseGroup(
  group: string,
  sharedFixtures: readonly string[],
  cases: readonly Omit<TestCase, "fixtures">[],
  harnessRef: { harness: WorkerHarness }
): void {
  beforeAll(async () => {
    await resetTarget(harnessRef.harness, sharedFixtures);
  });

  for (const testCase of cases) {
    defineCase(
      group,
      { ...testCase, fixtures: [...sharedFixtures] },
      harnessRef,
      { skipReset: true }
    );
  }
}

interface DispatchOpts {
  /** Skip the per-case DB reset -- the caller already loaded fixtures. */
  skipReset?: boolean;
}

async function resetTarget(
  harness: WorkerHarness,
  fixtures: readonly string[]
): Promise<void> {
  await resetDatabase(harness.cluster.databases[TARGET_ID]!, fixtures);
  clearTokenCache(TARGET_ID);
}

/**
 * Attach a test file to the harness its worker slot owns. The global setup
 * started it; files only open their own DB pools.
 */
export type { WorkerHarness };

export async function bootstrapWorker(): Promise<WorkerHarness> {
  const slot = Number(process.env.VITEST_POOL_ID);
  const info = inject("harnesses")[slot - 1];
  if (!info) {
    throw new Error(`No harness was started for worker slot ${slot}`);
  }
  return {
    cluster: {
      endpoint: info.endpoint,
      databases: Object.fromEntries(
        Object.entries(info.databases).map(([id, db]) => [
          id,
          connectDatabase(info.endpoint, db),
        ])
      ),
      stop: async () => {},
    },
    targets: Object.fromEntries(
      Object.entries(info.targets).map(([id, target]) => [
        id,
        { ...target, stop: async () => {} },
      ])
    ),
  };
}

export async function teardown(h: WorkerHarness): Promise<void> {
  /**
   * There's a chance the harness is actually null -- e.g. if setup failed
   * before it could be assigned. In that case just skip the teardown
   */
  if (!h) return;
  await closePools(h);
}

// ---------------------------------------------------------------------------
// Inline response assertions (checked alongside the snapshot comparison)
// ---------------------------------------------------------------------------

function assertResponseInvariants(
  bodyString: string,
  snapshot: ResponseSnapshot,
  testCase: TestCase,
  targetId: string
): void {
  const a = testCase.assert;
  if (!a) return;
  if (a.bodyContains !== undefined) {
    const bodyText = bodyString;
    for (const bodyReq of a.bodyContains) {
      if (typeof bodyReq === "string") {
        expect(
          bodyText,
          `[${targetId}] expected body to contain "${bodyReq}"`
        ).toContain(bodyReq);
      } else {
        expect(
          bodyText,
          `[${targetId}] expected body to match "${bodyReq}"`
        ).toMatch(bodyReq);
      }
    }
  }
  // This goes after the snapshot test for debugging reasons, so if things
  // are off, then it's easier to see why from the error of the snapshot
  if (a.status !== undefined) {
    expect(snapshot.status, `[${targetId}] expected status ${a.status}`).toBe(
      a.status
    );
  }
}

// ---------------------------------------------------------------------------
// Snapshot comparison (Vitest's toMatchFileSnapshot)
// ---------------------------------------------------------------------------

/** Convert a free-form label into a filesystem-safe slug. */
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function snapshotPath(group: string, caseName: string): string {
  return resolve(env.snapshotDir, slug(group), `${slug(caseName)}.json`);
}

async function runSnapshot(
  harness: WorkerHarness,
  group: string,
  testCase: TestCase,
  opts: DispatchOpts = {}
): Promise<void> {
  const target = harness.targets[TARGET_ID]!;

  if (!opts.skipReset) {
    // Reset DB and load fixtures. Per-test isolation -- not per-file, since a
    // file may contain many cases with different fixture stacks. Callers
    // that share a fixture stack across cases use `defineCaseGroup` instead,
    // which resets once up front and passes `skipReset: true` here.
    await resetTarget(harness, testCase.fixtures ?? []);
  }

  const { snapshot, bodyString } = await executeAndCapture(
    target.config,
    testCase
  );
  assertResponseInvariants(bodyString, snapshot, testCase, target.config.id);
  // Serialize with sorted keys ourselves so that two responses with the
  // same content but different insertion orders produce byte-identical
  // snapshots. (toMatchFileSnapshot does byte-exact string comparison.)
  const serialized = JSON.stringify(snapshot, sortedReplacer, 2) + "\n";
  await expect(serialized).toMatchFileSnapshot(
    snapshotPath(group, testCase.name)
  );
}

/**
 * `JSON.stringify` replacer that emits object keys in sorted order. Arrays
 * keep their natural order.
 */
function sortedReplacer(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    out[k] = obj[k];
  }
  return out;
}

async function executeAndCapture(
  target: TargetConfig,
  testCase: TestCase
): Promise<{ snapshot: ResponseSnapshot; bodyString: string }> {
  const headers = new Headers(testCase.request.headers ?? {});

  // Resolve auth directive -> Authorization header. Defaults to none.
  const auth = testCase.auth ?? { kind: "none" };
  if (auth.kind === "better-auth") {
    const { cookie } = await loginAsBetterAuth(target, auth.as);
    // headers.set("authorization", `Bearer ${token}`);
    if (cookie) {
      headers.set("cookie", cookie);
    }
  }

  // Build URL with query string. We can't use `new URL(path, base)` directly
  // because an absolute path (e.g. "/auth/login") replaces the base URL's
  // path entirely -- which discards any subpath like "/api" or "/api/v1"
  // baked into baseUrl. Join by hand: ensure exactly one slash between them.
  const base = target.baseUrl.endsWith("/")
    ? target.baseUrl
    : `${target.baseUrl}/`;
  const rel = testCase.request.path.startsWith("/")
    ? testCase.request.path.slice(1)
    : testCase.request.path;
  const url = new URL(rel, base);
  for (const [k, v] of Object.entries(testCase.request.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const init: RequestInit = {
    method: testCase.request.method,
    headers,
  };
  if (testCase.request.multipart !== undefined) {
    const form = new FormData();
    for (const [name, { data, filename, contentType }] of Object.entries(
      testCase.request.multipart
    )) {
      form.append(name, new Blob([data], { type: contentType }), filename);
    }
    init.body = form;
  } else if (testCase.request.body !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(testCase.request.body);
  }

  const res = await fetch(url, init);
  const clonedRes = res.clone();
  return {
    snapshot: await responseToSnapshot(res, testCase),
    bodyString: await clonedRes.text(),
  };
}

/**
 * Default allowlist of response headers to record. Per the design,
 * non-deterministic headers (date, server, set-cookie expiry, etc.) are
 * excluded by default; cases can opt in to others via `captureHeaders`.
 */
const DEFAULT_HEADER_ALLOWLIST: readonly string[] = [
  "content-type",
  "location",
  "cache-control",
];

async function responseToSnapshot(
  res: Response,
  testCase: TestCase
): Promise<ResponseSnapshot> {
  const allow = new Set(
    (testCase.captureHeaders ?? DEFAULT_HEADER_ALLOWLIST).map((h) =>
      h.toLowerCase()
    )
  );
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (allow.has(lower)) {
      if (testCase.ignoreHeaders?.includes(lower)) {
        // Don't include this header in the snapshot at all.
        return;
      }
      headers[lower] = value;
    }
  });

  const contentType = res.headers.get("content-type") ?? "";
  let bodyKind: ResponseSnapshot["bodyKind"];
  let body: unknown;

  if (contentType.startsWith("image/")) {
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0) {
      bodyKind = "empty";
      body = null;
    } else {
      bodyKind = "binary";
      body = Buffer.from(buffer).toString("base64");
    }
  } else {
    const text = await res.text();
    if (text.length === 0) {
      bodyKind = "empty";
      body = null;
    } else if (contentType.includes("application/json")) {
      bodyKind = "json";
      try {
        body = JSON.parse(text);
      } catch (cause) {
        throw new Error(
          `Response claimed application/json but failed to parse: ${text.slice(0, 200)}`,
          { cause }
        );
      }
      body = applyFieldMasks(body, testCase.maskFields ?? []);
    } else {
      bodyKind = "text";
      body = applyTextReplacements(text, testCase.bodyTextReplacements ?? []);
    }
  }

  return {
    status: res.status,
    headers,
    bodyKind,
    body,
  };
}

/**
 * Apply regex substitutions to a text body. Each pattern must be global;
 * we throw rather than silently replace only the first match.
 */
export function applyTextReplacements(
  body: string,
  replacements: readonly { pattern: RegExp; replacement: string }[]
): string {
  let out = body;
  for (const { pattern, replacement } of replacements) {
    if (!pattern.global) {
      throw new Error(
        `bodyTextReplacements pattern must be global (e.g. /.../g): ${pattern}`
      );
    }
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Replace fields in a parsed JSON body with type-tagged placeholders
 * (e.g. `"<<ulid>>"`). Supports dot-paths (`user.id`) and array wildcards
 * (`items.*.created_at`).
 *
 * Each entry is either a plain path string (tag is auto-detected from the
 * actual value at that path) or `{ path, as }` to pin a specific tag.
 *
 * Operates on a deep clone; returns the clone.
 */
export function applyFieldMasks(
  value: unknown,
  fields: readonly MaskField[]
): unknown {
  if (fields.length === 0) return value;
  const cloned = structuredClone(value);
  for (const field of fields) {
    const path = typeof field === "string" ? field : field.path;
    const forcedTag = typeof field === "string" ? undefined : field.as;
    maskAtPath(cloned, path.split("."), forcedTag);
  }
  return cloned;
}

/**
 * Remove headers from a response snapshot that are listed in `ignoreHeaders`.
 */
export function applyIgnoreHeaders(
  snapshot: ResponseSnapshot,
  ignoreHeaders: readonly string[]
): ResponseSnapshot {
  if (ignoreHeaders.length === 0) return snapshot;
  const ignored = new Set(ignoreHeaders.map((h) => h.toLowerCase()));
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(snapshot.headers ?? {})) {
    if (!ignored.has(k)) headers[k] = v;
  }
  return { ...snapshot, headers };
}

function maskAtPath(
  node: unknown,
  segments: readonly string[],
  forcedTag: MaskType | undefined
): void {
  if (segments.length === 0 || node === null || typeof node !== "object") {
    return;
  }
  const [head, ...rest] = segments;
  if (head === "*") {
    if (Array.isArray(node)) {
      if (rest.length === 0) {
        for (let i = 0; i < node.length; i++) {
          node[i] = placeholderFor(node[i], forcedTag);
        }
      } else {
        for (const item of node) maskAtPath(item, rest, forcedTag);
      }
    }
    return;
  }
  if (Array.isArray(node)) return;
  const obj = node as Record<string, unknown>;
  if (rest.length === 0) {
    if (!(head! in obj)) return;
    obj[head!] = placeholderFor(obj[head!], forcedTag);
    return;
  }
  maskAtPath(obj[head!], rest, forcedTag);
}

function placeholderFor(
  value: unknown,
  forcedTag: MaskType | undefined
): string {
  const tag = forcedTag ?? detectTag(value);
  return `<<${tag}>>`;
}

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
// Permissive ISO-8601: YYYY-MM-DD optionally followed by T<time> and tz.
const ISO8601_RE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function detectTag(value: unknown): MaskType {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return "boolean";
    case "number":
      return Number.isInteger(value) ? "integer" : "number";
    case "string":
      if (ULID_RE.test(value)) return "ulid";
      if (ISO8601_RE.test(value)) return "datetime";
      return "string";
    default:
      return "any";
  }
}
