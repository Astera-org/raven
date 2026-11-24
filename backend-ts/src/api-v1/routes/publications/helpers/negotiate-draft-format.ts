import { mediaTypes } from "@hapi/accept";

export const MYST_MEDIA_TYPE = "text/markdown; variant=myst";

/**
 * Picks the draft's representation from `Accept`. JSON stays the default, as
 * before MyST was offered, except that plain `text/markdown` is refused: it
 * would be confused with the agent-oriented Markdown of `/p/{slug}.md`.
 *
 * `@hapi/accept`'s `mediaType()` never matches an offer with parameters, so
 * this walks the client's preferences, which come back in order with
 * parameters as sent (`text/markdown;variant="myst"`).
 */
export function negotiateDraftFormat(
  accept: string | undefined
): "json" | "myst" | "not-acceptable" {
  let wantsPlainMarkdown = false;
  for (const preference of mediaTypes(accept)) {
    const variant = markdownVariant(preference);
    if (variant === "myst") return "myst";
    if (["application/json", "application/*", "*/*"].includes(preference)) {
      return "json";
    }
    if (variant === "") wantsPlainMarkdown = true;
  }
  return wantsPlainMarkdown ? "not-acceptable" : "json";
}

export function isMystPreference(preference: string): boolean {
  return markdownVariant(preference) === "myst";
}

/** `""` for `text/markdown` without a variant, `undefined` for other types. */
function markdownVariant(preference: string): string | undefined {
  const [type, ...params] = preference.toLowerCase().split(";");
  if (type?.trim() !== "text/markdown") return undefined;

  for (const param of params) {
    const [name = "", value = ""] = param.split("=");
    if (name.trim() === "variant") return value.trim().replace(/^"|"$/g, "");
  }
  return "";
}
