import {
  MDAST_SCHEMA_VERSION,
  SUPPORTED_MDAST_SCHEMAS,
} from "#src/lib/myst/versions.js";
import { mediaTypes } from "@hapi/accept";

export const MDAST_MEDIA_TYPE = "application/vnd.thestacks.mdast+json";

export type MdastNegotiation =
  | { format: "none" }
  | { format: "mdast"; schema: number; version: number | undefined }
  | { format: "not-acceptable"; reason: string };

const POSITIVE_INTEGER = /^[1-9]\d*$/;

/**
 * Decides whether a request asks for the MyST AST (see the
 * `initial-myst-support` skill). The AST is only sent when the client names
 * its type explicitly and ranks it above every other type the route serves;
 * `servesOtherwise` says which of the client's preferences those are.
 * `enabled` is `MYST_MDAST_ENABLED`: when false, asking for the AST is 406.
 * Wildcards never select the AST.
 *
 * `@hapi/accept`'s `mediaType()` never matches an offer with parameters, so
 * this walks the preferences, which come back in order with the type
 * lowercased and parameters as sent (`…+json;schema=1;version=3`).
 * Parameters written after `q` are extensions, not part of the type, and
 * are dropped by the parser.
 */
export function negotiateMdast(
  accept: string | undefined,
  {
    enabled,
    servesOtherwise,
  }: { enabled: boolean; servesOtherwise: (preference: string) => boolean }
): MdastNegotiation {
  for (const preference of mediaTypes(accept)) {
    const [type, ...params] = preference.split(";");
    if (type !== MDAST_MEDIA_TYPE) {
      if (servesOtherwise(preference.toLowerCase())) return { format: "none" };
      continue;
    }
    if (!enabled) {
      return {
        format: "not-acceptable",
        reason: "The MyST AST is not being served at the moment",
      };
    }
    return parseParams(params);
  }
  return { format: "none" };
}

function parseParams(params: string[]): MdastNegotiation {
  const values = new Map<string, string>();
  for (const param of params) {
    const [name = "", value = ""] = param.split("=");
    values.set(name.trim().toLowerCase(), value.trim().replace(/^"|"$/g, ""));
  }

  const schema = values.get("schema");
  const version = values.get("version");
  for (const [name, value] of [
    ["schema", schema],
    ["version", version],
  ] as const) {
    if (value !== undefined && !POSITIVE_INTEGER.test(value)) {
      return {
        format: "not-acceptable",
        reason: `The ${name} parameter must be a positive integer`,
      };
    }
  }

  const requestedSchema =
    schema === undefined ? MDAST_SCHEMA_VERSION : Number(schema);
  if (!SUPPORTED_MDAST_SCHEMAS.includes(requestedSchema)) {
    return {
      format: "not-acceptable",
      reason: `Schema ${requestedSchema} is not supported; supported: ${SUPPORTED_MDAST_SCHEMAS.join(", ")}`,
    };
  }
  return {
    format: "mdast",
    schema: requestedSchema,
    version: version === undefined ? undefined : Number(version),
  };
}
